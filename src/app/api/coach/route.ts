import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import { COACH_SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

function isValidMessages(value: unknown): value is IncomingMessage[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0,
  );
}

function toGeminiContents(messages: IncomingMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

const RETRYABLE_STATUSES = new Set([429, 503]);

async function startStreamWithRetry(
  client: GoogleGenAI,
  contents: ReturnType<typeof toGeminiContents>,
): Promise<AsyncGenerator<GenerateContentResponse>> {
  const delays = [500, 1500, 4000]; // up to 3 retries

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await client.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: COACH_SYSTEM_PROMPT,
          maxOutputTokens: 1024,
        },
      });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      const isLast = attempt === delays.length;
      if (!status || !RETRYABLE_STATUSES.has(status) || isLast) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  // Unreachable, but satisfies the type checker.
  throw new Error("Exhausted retries without throwing.");
}

function finishMessageFor(reason: FinishReason | undefined): string | null {
  switch (reason) {
    case FinishReason.SAFETY:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.BLOCKLIST:
    case FinishReason.RECITATION:
      return "\n\n_The coach's reply was cut off by a safety filter. Try rephrasing your last message._";
    case FinishReason.MAX_TOKENS:
      return "\n\n_(reply truncated — ask me to continue)_";
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("Server is missing GEMINI_API_KEY.", { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!isValidMessages(messages)) {
    return new Response("Invalid messages payload.", { status: 400 });
  }

  const client = new GoogleGenAI({ apiKey });
  const contents = toGeminiContents(messages);

  let geminiStream: AsyncGenerator<GenerateContentResponse>;
  try {
    geminiStream = await startStreamWithRetry(client, contents);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const friendly =
      status === 429
        ? "The coach is at its free-tier rate limit right now. Give it a moment and try again."
        : "The coach is unavailable right now. Please try again.";
    return new Response(friendly, { status: status === 429 ? 429 : 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let receivedAnyText = false;
      let finishReason: FinishReason | undefined;
      let blockReason: string | undefined;

      try {
        for await (const chunk of geminiStream) {
          const text = chunk.text;
          if (text) {
            receivedAnyText = true;
            controller.enqueue(encoder.encode(text));
          }
          const candidateFinish = chunk.candidates?.[0]?.finishReason;
          if (candidateFinish) finishReason = candidateFinish;
          const pf = chunk.promptFeedback?.blockReason;
          if (pf) blockReason = String(pf);
        }

        const trailing = finishMessageFor(finishReason);
        if (trailing) controller.enqueue(encoder.encode(trailing));

        if (!receivedAnyText) {
          const note = blockReason
            ? `_Your last message was blocked by a safety filter (${blockReason}). Try rephrasing it._`
            : "_The coach didn't have anything to say. Try rephrasing your last message._";
          controller.enqueue(encoder.encode(note));
        }

        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown streaming error";
        try {
          controller.enqueue(
            encoder.encode(`\n\n[Coach error: ${message}]`),
          );
        } catch {
          // already closed
        }
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
