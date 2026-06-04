# Diagnostic Math Coach

A minimal web app that helps a student work through a math problem they're stuck on. The coach **does not give the answer** — it asks targeted questions, locates the concept the student never fully learned, rebuilds that, and walks them back to their problem.

This is a validation MVP. Scope is intentionally tiny: no auth, no database, no progress tracking. One page, one API route.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS
- `react-markdown` + `remark-math` + `rehype-katex` for math rendering
- Anthropic Claude via the `@anthropic-ai/sdk` (server-side streaming) — model: `claude-sonnet-4-6`
- Session id + chat history kept in `localStorage`

## Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com/) and sign up.
2. Add a few dollars of **prepaid credit** under **Billing** — a key on a $0 balance will fail.
3. Open **Settings → API Keys → Create Key** and copy it. You'll paste it in step 2 below.

The system prompt is sent with `cache_control` prompt caching enabled, so the (identical) instructions are cheaper on repeat calls.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root:

   ```
   ANTHROPIC_API_KEY=your-key-from-console.anthropic.com

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
3. Add an environment variable `ANTHROPIC_API_KEY` in the project's Vercel settings.
4. Deploy. Vercel auto-detects Next.js.

The key is read server-side only (in `src/app/api/coach/route.ts`); it is never sent to the browser.

## Layout

- `src/app/page.tsx` — single page, mounts the `<Chat />` client component.
- `src/app/api/coach/route.ts` — `POST /api/coach`; streams Claude's reply.
- `src/components/Chat.tsx` — start screen + chat view, with localStorage persistence.
- `src/components/CoachMessage.tsx` — markdown + LaTeX rendering for assistant messages.
- `src/lib/systemPrompt.ts` — the coaching system prompt.
