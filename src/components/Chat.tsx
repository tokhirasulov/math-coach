"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import { CoachMessage } from "./CoachMessage";

type Role = "user" | "assistant";
type ChatMessage = { id: string; role: Role; content: string };

const SESSION_KEY = "mathcoach.sessionId";
const CHAT_KEY = "mathcoach.chat";

const EXAMPLES: { label: string; problem: string }[] = [
  {
    label: "Fractions",
    problem: "What is 2/3 + 1/4? I keep getting confused with fractions.",
  },
  {
    label: "Algebra",
    problem: "Solve for x: 3(x − 2) = 4x + 5. I don't know where to start.",
  },
  {
    label: "Calculus",
    problem:
      "Find the derivative of f(x) = x^2 · sin(x). I'm not sure which rule to use.",
  },
];

function loadChat(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        m &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

function ensureSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function Chat() {
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ensureSessionId();
    setMessages(loadChat());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    } catch {
      // localStorage may be full or unavailable; ignore
    }
  }, [messages, hydrated]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: uuid(),
        role: "user",
        content: trimmed,
      };
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: "",
      };

      // Build the history we send to the API *before* setting state.
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          throw new Error(
            errText || `The coach is unavailable (status ${res.status}).`,
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const snapshot = acc;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: snapshot } : m,
            ),
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // intentional cancel — leave whatever was streamed in place
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : "Something went wrong reaching the coach.";
          setError(msg);
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming],
  );

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const newProblem = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput("");
    try {
      window.localStorage.removeItem(CHAT_KEY);
    } catch {
      // ignore
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  if (!hydrated) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-neutral-500">Loading…</div>
      </main>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <main className="flex-1 flex flex-col w-full max-w-3xl mx-auto px-4 py-6">
      {isEmpty ? (
        <StartScreen
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onExample={(p) => void sendMessage(p)}
          textareaRef={textareaRef}
          streaming={streaming}
        />
      ) : (
        <ChatView
          messages={messages}
          streaming={streaming}
          error={error}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onNewProblem={newProblem}
          textareaRef={textareaRef}
          scrollRef={scrollRef}
        />
      )}
    </main>
  );
}

function StartScreen({
  input,
  setInput,
  onSubmit,
  onKeyDown,
  onExample,
  textareaRef,
  streaming,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onExample: (problem: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  streaming: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 my-auto">
      <header className="text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Stuck on a math problem?
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Let&apos;s find what&apos;s really tripping you up.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste or type your problem here…"
          rows={4}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-200"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="self-end rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start coaching
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-neutral-500">Or try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => onExample(ex.problem)}
              disabled={streaming}
              className="rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatView({
  messages,
  streaming,
  error,
  input,
  setInput,
  onSubmit,
  onKeyDown,
  onNewProblem,
  textareaRef,
  scrollRef,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onNewProblem: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Math Coach
        </h2>
        <button
          type="button"
          onClick={onNewProblem}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2"
        >
          New problem
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 space-y-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} streaming={streaming} />
        ))}
        {error ? (
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error} Try sending your message again.
          </div>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-neutral-200 dark:border-neutral-800 pt-3 flex gap-2 items-end"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your answer or next thought…"
          rows={2}
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-200 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  const isEmptyAssistant =
    !isUser && message.content.length === 0 && streaming;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 whitespace-pre-wrap"
            : "max-w-[85%] rounded-2xl px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        }
      >
        {isUser ? (
          message.content
        ) : isEmptyAssistant ? (
          <TypingDots />
        ) : (
          <CoachMessage content={message.content} />
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span
      aria-label="Coach is typing"
      className="inline-flex items-center gap-1"
    >
      <span className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse" />
      <span
        className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}
