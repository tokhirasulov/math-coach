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
import { type Lang, LANG_KEY, LANGS, UI } from "@/lib/translations";

type Role = "user" | "assistant";
type ChatMessage = { id: string; role: Role; content: string };

const SESSION_KEY = "mathcoach.sessionId";
const CHAT_KEY = "mathcoach.chat";

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

function loadLang(): Lang {
  if (typeof window === "undefined") return "uz";
  const stored = window.localStorage.getItem(LANG_KEY);
  if (stored === "uz" || stored === "ru" || stored === "en") return stored;
  return "uz";
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
  const [lang, setLangState] = useState<Lang>("uz");
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
    setLangState(loadLang());
    setHydrated(true);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    } catch {
      // ignore
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
      const userMsg: ChatMessage = { id: uuid(), role: "user", content: trimmed };
      const assistantMsg: ChatMessage = { id: uuid(), role: "assistant", content: "" };

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
          throw new Error(errText || `The coach is unavailable (status ${res.status}).`);
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
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: snapshot } : m)),
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // intentional cancel
        } else {
          const msg =
            err instanceof Error ? err.message : "Something went wrong reaching the coach.";
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

  const t = UI[lang];

  if (!hydrated) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-neutral-500">{UI.uz.loading}</div>
      </main>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <main className="flex-1 flex flex-col w-full max-w-3xl mx-auto px-4 py-6">
      {/* Language switcher — always visible at top */}
      <div className="flex justify-end mb-4">
        <LangSwitcher current={lang} onChange={setLang} />
      </div>

      {isEmpty ? (
        <StartScreen
          t={t}
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
          t={t}
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

function LangSwitcher({ current, onChange }: { current: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden text-xs font-medium">
      {LANGS.map((l, i) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          className={[
            "px-3 py-1.5 transition-colors",
            i > 0 ? "border-l border-neutral-200 dark:border-neutral-700" : "",
            current === l.code
              ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
          ].join(" ")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function StartScreen({
  t,
  input,
  setInput,
  onSubmit,
  onKeyDown,
  onExample,
  textareaRef,
  streaming,
}: {
  t: typeof UI[Lang];
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
          {t.heading}
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          {t.subheading}
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.placeholder}
          rows={4}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-200"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="self-end rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t.startBtn}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-neutral-500">{t.exampleLabel}</p>
        <div className="flex flex-wrap gap-2">
          {t.examples.map((ex) => (
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
  t,
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
  t: typeof UI[Lang];
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
          {t.coachTitle}
        </h2>
        <button
          type="button"
          onClick={onNewProblem}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2"
        >
          {t.newProblem}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} streaming={streaming} />
        ))}
        {error ? (
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error} {t.errorSuffix}
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
          placeholder={t.chatPlaceholder}
          rows={2}
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-200 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t.sendBtn}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const isEmptyAssistant = !isUser && message.content.length === 0 && streaming;

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
    <span aria-label="typing" className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse" />
      <span className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse" style={{ animationDelay: "300ms" }} />
    </span>
  );
}
