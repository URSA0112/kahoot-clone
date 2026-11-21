import { GoogleGenAI, Type } from '@google/genai';
import type { Quiz } from '../shared/types.js';

/**
 * Generates a quiz with Gemini.
 * On Cloud Run it uses Vertex AI with the service account (no API key needed),
 * billed to the project's billing account. Locally you can set GEMINI_API_KEY instead.
 */
let client: GoogleGenAI | null = null;
function getClient() {
  if (client) return client;
  if (process.env.GEMINI_API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return client;
}

const schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          answers: { type: Type.ARRAY, items: { type: Type.STRING } },
          correct: { type: Type.INTEGER },
        },
        required: ['text', 'answers', 'correct'],
      },
    },
  },
  required: ['title', 'questions'],
};

export async function generateQuiz(topic: string, count: number, language: string, time: number): Promise<Quiz> {
  const n = Math.max(1, Math.min(20, Math.floor(count) || 5));
  const prompt = `Create a fun multiple-choice quiz game (like Kahoot) about: "${topic}".
Write everything in ${language}.
Make exactly ${n} questions. Each question has exactly 4 short answers (max 60 characters each), only one correct.
"correct" is the 0-based index of the correct answer. Vary the position of the correct answer.
Questions should be short (max 120 characters), clear and factually accurate.`;

  const res = await getClient().models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.8 },
  });

  const raw = JSON.parse(res.text ?? '{}') as {
    title?: string;
    questions?: { text: string; answers: string[]; correct: number }[];
  };
  const questions = (raw.questions ?? [])
    .filter((q) => q.text && Array.isArray(q.answers) && q.answers.length >= 4)
    .map((q) => ({
      text: q.text,
      answers: q.answers.slice(0, 4) as [string, string, string, string],
      correct: Math.max(0, Math.min(3, q.correct | 0)),
      time,
    }));
  if (!questions.length) throw new Error('Gemini returned no questions');
  return { title: raw.title || topic, questions };
}
