# QUIZ! — Kahoot clone

Real-time multiplayer quiz game. Host creates a quiz (by hand or with **Gemini AI**), players join from their phones with a 6-digit PIN or QR code.

**Stack:** React 19 + Vite + TypeScript + Tailwind v4 + Zustand · Node.js + Express + Socket.IO · Gemini (Vertex AI) · Docker · Google Cloud Run

## Run locally
```bash
npm install
npm run dev:server   # terminal 1 (needs GEMINI_API_KEY for AI generation)
npm run dev:client   # terminal 2 -> http://localhost:5173
```

## Deploy to Cloud Run
```bash
gcloud run deploy quiz --source . --region us-central1 --allow-unauthenticated \
  --session-affinity --max-instances 1 --timeout 3600 \
  --set-env-vars GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_CLOUD_PROJECT=$(gcloud config get-value project)
```
Game state is in memory, so keep `--max-instances 1`.
