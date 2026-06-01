# Diagnostic Math Coach

A minimal web app that helps a student work through a math problem they're stuck on. The coach **does not give the answer** — it asks targeted questions, locates the concept the student never fully learned, rebuilds that, and walks them back to their problem.

This is a validation MVP. Scope is intentionally tiny: no auth, no database, no progress tracking. One page, one API route.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS
- `react-markdown` + `remark-math` + `rehype-katex` for math rendering
- Google Gemini API via `@google/genai` (server-side, streaming) — model: `gemini-2.5-flash`
- Session id + chat history kept in `localStorage`

## Get a free Gemini API key

1. Go to [aistudio.google.com](https://aistudio.google.com/).
2. Click **Get API key → Create API key**. No credit card required.
3. Copy the key — you'll paste it in step 2 below.

The free tier allows roughly 15 requests per minute, which is plenty for a small validation cohort. The app retries with exponential backoff on rate-limit errors and surfaces a friendly message if it still can't get through.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root with your Gemini API key:

   ```
   GEMINI_API_KEY=your-key-from-aistudio.google.com
   ```

   (See `.env.example`.)

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Build

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add an environment variable `GEMINI_API_KEY` in the project's Vercel settings.
4. Deploy. Vercel auto-detects Next.js.

The key is read server-side only (in `src/app/api/coach/route.ts`); it is never sent to the browser.

## Layout

- `src/app/page.tsx` — single page, mounts the `<Chat />` client component.
- `src/app/api/coach/route.ts` — `POST /api/coach`; streams Gemini's reply.
- `src/components/Chat.tsx` — start screen + chat view, with localStorage persistence.
- `src/components/CoachMessage.tsx` — markdown + LaTeX rendering for assistant messages.
- `src/lib/systemPrompt.ts` — the coaching system prompt.
