import Anthropic from "@anthropic-ai/sdk";
import { COACH_SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

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

// Anthropic's `messages` array holds ONLY the conversation (user/assistant
// turns). The system prompt is passed separately as a top-level parameter.
function buildAnthropicMessages(
  messages: IncomingMessage[],
): Anthropic.MessageParam[] {
  return trimHistory(messages).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

// The system prompt is identical on every call, so cache it to cut cost.
const SYSTEM_PROMPT_BLOCKS: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: COACH_SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" },
  },
];

type StartedStream = {
  stream: ReturnType<Anthropic["messages"]["stream"]>;
  iterator: AsyncIterator<Anthropic.MessageStreamEvent>;
  first: IteratorResult<Anthropic.MessageStreamEvent>;
};

// Start the stream and pull the first event so transient HTTP errors (notably
// 429, common on new accounts with low rate limits) surface before we begin
// streaming to the client. Retry those with exponential backoff.
async function startStreamWithRetry(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
): Promise<StartedStream> {
  const delays = [600, 2000, 5000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT_BLOCKS,
        messages,
      },
      { maxRetries: 0 },
    );

    try {
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { stream, iterator, first };
    } catch (err) {
      stream.abort();
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      const isLast = attempt === delays.length;
      if (status !== 429 || isLast) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error("Exhausted retries.");
}

function deltaText(event: Anthropic.MessageStreamEvent): string | undefined {
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta"
  ) {
    return event.delta.text;
  }
  return undefined;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("Server is missing ANTHROPIC_API_KEY.", {
      status: 500,
    });
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

  const client = new Anthropic({ apiKey });
  const anthropicMessages = buildAnthropicMessages(messages);

  let started: StartedStream;
  try {
    started = await startStreamWithRetry(client, anthropicMessages);
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : 500;
    const friendly =
      status === 429
        ? "The coach is at its rate limit right now. Give it a moment and try again."
        : "The coach is unavailable right now. Please try again.";
    return new Response(friendly, { status: status === 429 ? 429 : 502 });
  }

  const { stream, iterator, first } = started;
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let receivedAnyText = false;
      try {
        let result = first;
        while (!result.done) {
          const text = deltaText(result.value);
          if (text) {
            receivedAnyText = true;
            controller.enqueue(encoder.encode(text));
          }
          result = await iterator.next();
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
      stream.abort();
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
