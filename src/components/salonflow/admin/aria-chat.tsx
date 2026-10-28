"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Sparkles, X } from "lucide-react";

/**
 * Aria's chat panel — a floating front-desk brain in the corner of the
 * console. Every answer is computed inside this install from live data;
 * nothing is sent to any outside service.
 */

interface Msg {
  role: "user" | "aria";
  text: string;
  chips?: string[];
}

const WELCOME: Msg = {
  role: "aria",
  text: "Hey — I'm **Aria**, the brain in the back office. I read your real book: bookings, money, stock, clients, the team. Ask me anything about today, or tap one of these 👇",
  chips: ["Who's coming in today?", "How did we do this week?", "Any low stock?", "What can you do?"],
};

/** Minimal renderer: **bold** spans + preserved line breaks. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <span className="whitespace-pre-line">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

export default function AriaChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, thinking, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setThinking(true);
    try {
      const started = Date.now();
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const body = await res.json();
      // a small human pause — instant robots feel cheap, Aria "checks the book"
      const pause = Math.max(0, 550 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, pause));
      setMsgs((m) => [
        ...m,
        {
          role: "aria",
          text: res.ok ? body.text : body.error ?? "Something jammed — try that again.",
          chips: res.ok ? body.chips : undefined,
        },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "aria", text: "The connection dropped — ask me again." }]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* the corner button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 group"
          title="Ask Aria"
          aria-label="Ask Aria"
        >
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
          <span className="flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">Ask Aria</span>
          </span>
        </button>
      )}

      {/* the panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden",
            // mobile: a card floating just above the thumb zone
            "inset-x-3 bottom-3 h-[min(70vh,540px)]",
            // desktop: a proper side panel
            "sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:h-[560px]"
          )}
        >
          {/* header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground shrink-0">
            <span className="w-9 h-9 rounded-full bg-primary-foreground/15 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold leading-tight">Aria</p>
              <p className="text-[11px] opacity-75 leading-tight">The salon's own brain — built in, no cloud</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 bg-stone-50/60">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className="max-w-[85%]">
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-background border border-border rounded-bl-md"
                    )}
                  >
                    <Rich text={m.text} />
                  </div>
                  {m.role === "aria" && m.chips?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips.filter(Boolean).map((c) => (
                        <button
                          key={c}
                          onClick={() => send(c)}
                          disabled={thinking}
                          className="text-xs px-2.5 py-1.5 rounded-full border border-primary/30 bg-background text-primary hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <form
            className="flex items-center gap-2 p-3 border-t border-border bg-background shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about bookings, money, stock…"
              className="h-10 bg-stone-50"
              maxLength={500}
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!input.trim() || thinking} aria-label="Send">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
