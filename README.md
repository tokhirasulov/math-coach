# Diagnostic Math Coach

A minimal web app that helps a student work through a math problem they're stuck on. The coach **does not give the answer** — it asks targeted questions, locates the concept the student never fully learned, rebuilds that, and walks them back to their problem.

This is a validation MVP. Scope is intentionally tiny: no auth, no database, no progress tracking. One page, one API route.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS
- `react-markdown` + `remark-math` + `rehype-katex` for math rendering
- Groq API via the `openai` SDK (OpenAI-compatible, server-side streaming) — model: `llama-3.3-70b-versatile`
- Session id + chat history kept in `localStorage`

## Get a free Groq API key

1. Go to [console.groq.com](https://console.groq.com/) and sign up (Google / GitHub / email — no credit card).
2. Click **API Keys → Create API Key**.
3. Copy the key — you'll paste it in step 2 below.

Free tier: 30 requests/min, 14,400/day, ~6,000 tokens/min. Plenty for a small validation cohort.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root:

   ```
   GROQ_API_KEY=your-key-from-console.groq.com

   # PostHog analytics (posthog.com — free tier)
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```

   (See `.env.example`.) The `NEXT_PUBLIC_` prefix lets the browser read those values; they are not secret.

   PostHog autocaptures **pageviews** (visits over time), **session duration** (via pageleave), and **returning visitor identity** using its own anonymous persistent ID — no names or emails are collected. Session replay is enabled with all text inputs masked. Two custom events are also fired: `coaching_session_started` (first message of a session) and `message_sent` (every student message, useful for measuring engagement depth).

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
3. Add an environment variable `GROQ_API_KEY` in the project's Vercel settings.
4. Deploy. Vercel auto-detects Next.js.

The key is read server-side only (in `src/app/api/coach/route.ts`); it is never sent to the browser.

## Layout

- `src/app/page.tsx` — single page, mounts the `<Chat />` client component.
- `src/app/api/coach/route.ts` — `POST /api/coach`; streams Groq's reply.
- `src/components/Chat.tsx` — start screen + chat view, with localStorage persistence.
- `src/components/CoachMessage.tsx` — markdown + LaTeX rendering for assistant messages.
- `src/lib/systemPrompt.ts` — the coaching system prompt.
