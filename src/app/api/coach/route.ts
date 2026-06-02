import OpenAI from "openai";
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

// Keep the original problem + the most recent 8 messages to stay under TPM.
function trimHistory(messages: IncomingMessage[]): IncomingMessage[] {
  if (messages.length <= 9) return messages;
  return [messages[0], ...messages.slice(-8)];
}

function buildOpenAIMessages(
  messages: IncomingMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: COACH_SYSTEM_PROMPT },
    ...trimHistory(messages).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}

async function createStreamWithRetry(
  client: OpenAI,
  openaiMessages: OpenAI.ChatCompletionMessageParam[],
): Promise<ReturnType<typeof client.chat.completions.stream>> {
  const delays = [600, 2000, 5000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return client.chat.completions.stream({
        model: "llama-3.3-70b-versatile",
        messages: openaiMessages,
        max_tokens: 1024,
        stream: true,
      });
    } catch (err) {
      const status =
        err instanceof OpenAI.APIError ? err.status : undefined;
      const isLast = attempt === delays.length;
      if (status !== 429 || isLast) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error("Exhausted retries.");
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response("Server is missing GROQ_API_KEY.", { status: 500 });
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

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const openaiMessages = buildOpenAIMessages(messages);

  let groqStream: ReturnType<typeof client.chat.completions.stream>;
  try {
    groqStream = await createStreamWithRetry(client, openaiMessages);
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status : 500;
    const friendly =
      status === 429
        ? "The coach is at its rate limit right now. Give it a moment and try again."
        : "The coach is unavailable right now. Please try again.";
    return new Response(friendly, { status: status === 429 ? 429 : 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let receivedAnyText = false;
      try {
        for await (const chunk of groqStream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            receivedAnyText = true;
            controller.enqueue(encoder.encode(text));
          }
        }
        if (!receivedAnyText) {
          controller.enqueue(
            encoder.encode(
              "_The coach didn't have anything to say. Try rephrasing your last message._",
            ),
          );
        }
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown streaming error";
        try {
          controller.enqueue(encoder.encode(`\n\n[Coach error: ${message}]`));
        } catch {
          // already closed
        }
        controller.error(err);
      }
    },
    cancel() {
      groqStream.controller.abort();
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
