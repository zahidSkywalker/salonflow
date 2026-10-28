"use client";

/**
 * Aria's chat panel in the owner console — v1.9.
 * Same floating shell, smarter brain: follow-up memory ("what about
 * sunday?"), a neural hint from the in-browser MiniLM model, and
 * "did you mean" recovery instead of dead ends.
 */

import { useEffect, useRef, useState } from "react";
import AriaPanel, { type ChatMsg } from "../aria-panel";
import { Sparkles } from "lucide-react";
import { nluHint, nluDidYouMean, warmNlu } from "@/lib/salonflow/aria-nlu";
import type { AssistantContext } from "@/lib/salonflow/assistant/types";

const WELCOME: ChatMsg = {
  role: "aria",
  text: "Hey — I'm **Aria**, the brain in the back office. I read your real book: bookings, money, stock, clients, the team. And I keep up — ask a follow-up like “what about sunday?”. Tap one to start 👇",
  chips: ["Who's coming in today?", "How did we do this week?", "Any low stock?", "What can you do?"],
};

export default function AriaChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([WELCOME]);
  const [thinking, setThinking] = useState(false);
  const mem = useRef<AssistantContext>({});

  useEffect(() => {
    if (open) warmNlu();
  }, [open]);

  const push = (m: ChatMsg) => setMsgs((x) => [...x, m]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    push({ role: "user", text: q });
    setThinking(true);
    try {
      const started = Date.now();
      const hint = await nluHint(q, "admin");
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, context: mem.current, hint: hint?.intent ?? null }),
      });
      const body = await res.json();
      // a small human pause — instant robots feel cheap, Aria "checks the book"
      const pause = Math.max(0, 550 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, pause));
      if (!res.ok) {
        push({ role: "aria", text: body.error ?? "Something jammed — try that again." });
        return;
      }
      mem.current = {
        lastIntent: body.intent ?? mem.current.lastIntent,
        lastTimeMin: body.next?.time !== undefined ? body.next.time : mem.current.lastTimeMin,
        lastDate: body.next?.date !== undefined ? body.next.date : mem.current.lastDate,
      };
      let chips: string[] = body.chips ?? [];
      if (body.fallback) {
        const alt = await nluDidYouMean(q, "admin");
        if (alt.length) chips = alt;
      }
      push({ role: "aria", text: body.text, chips });
    } catch {
      push({ role: "aria", text: "The connection dropped — ask me again." });
    } finally {
      setThinking(false);
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
      {open && (
        <AriaPanel
          open={open}
          onClose={() => setOpen(false)}
          title="Aria"
          subtitle="The salon's own brain — built in, no cloud"
          msgs={msgs}
          thinking={thinking}
          onSend={(t) => void send(t)}
          onChip={(c) => void send(c)}
          placeholder="Ask about bookings, money, stock…"
          footnote="Runs 100% inside this app — hand-written engine + a tiny on-device neural net. Your numbers never leave."
        />
      )}
    </>
  );
}
