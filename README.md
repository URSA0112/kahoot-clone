# QUIZ! — Kahoot clone (V2: автомат урсгал + сургалтын аналитик)

📄 Бүрэн тодорхойлолт: [docs/SPEC.md](docs/SPEC.md) · Багшийн самбар: `/admin` · Тест: `npm test`

Real-time multiplayer quiz game. Host picks the built-in **PIAcademy 20-question curriculum quiz** (C + Web), generates one with **Gemini AI**, or writes their own. Players join with a PIN/QR code. Questions advance automatically (results → leaderboard → 3-2-1), every answer is stored, and a password-protected teacher dashboard turns the answers into course/topic/question/student analytics.

**Stack:** React 19 + Vite + TypeScript + Tailwind v4 + Zustand · Node.js + Express + Socket.IO · Gemini (Vertex AI) · Docker · Google Cloud Run

## Run locally
```bash
npm install
npm run dev:server   # terminal 1 (GEMINI_API_KEY for AI; admin password defaults to "admin" in dev)
npm run dev:client   # terminal 2 -> http://localhost:5173
```

## Deploy to Cloud Run
```bash
bash deploy.sh   # from Cloud Shell: enables APIs, Firestore, deploys, prints URL + admin password
```
Game state is in memory, so keep `--max-instances 1`.
