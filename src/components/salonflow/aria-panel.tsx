"use client";

/**
 * Aria's chat shell — shared by the admin console and the public
 * storefront. Parents own the conversation state; this renders it.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Sparkles, X } from "lucide-react";

export interface ChatMsg {
  role: "user" | "aria";
  text: string;
  chips?: string[];
}

export function Rich({ text }: { text: string }) {
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

export function TypingDots() {
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

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  msgs: ChatMsg[];
  thinking: boolean;
  onSend: (text: string) => void;
  onChip: (chip: string) => void;
  placeholder: string;
  /** footer note under the composer, e.g. privacy line */
  footnote?: string;
}

export default function AriaPanel({
  open, onClose, title, subtitle, msgs, thinking, onSend, onChip, placeholder, footnote,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, thinking, open]);

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden",
        // mobile: a card floating just above the thumb zone
        "inset-x-3 bottom-3 h-[min(72vh,560px)]",
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
          <p className="font-display font-semibold leading-tight">{title}</p>
          <p className="text-[11px] opacity-75 leading-tight">{subtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
          onClick={onClose}
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
                  {m.chips.filter(Boolean).map((ch) => (
                    <button
                      key={ch}
                      onClick={() => onChip(ch)}
                      disabled={thinking}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-primary/30 bg-background text-primary hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {ch}
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
      <Composer onSend={onSend} thinking={thinking} placeholder={placeholder} footnote={footnote} focusKey={open} />
    </div>
  );
}

function Composer({
  onSend, thinking, placeholder, footnote, focusKey,
}: {
  onSend: (t: string) => void;
  thinking: boolean;
  placeholder: string;
  footnote?: string;
  focusKey?: boolean;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusKey) setTimeout(() => inputRef.current?.focus(), 150);
  }, [focusKey]);
  return (
    <div className="shrink-0 border-t border-border bg-background">
      <form
        className="flex items-center gap-2 p-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = input.trim();
          if (!q || thinking) return;
          setInput("");
          onSend(q);
        }}
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-10 bg-stone-50"
          maxLength={500}
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!input.trim() || thinking} aria-label="Send">
          <Send className="w-4 h-4" />
        </Button>
      </form>
      {footnote ? <p className="px-4 pb-2.5 text-[10px] leading-tight text-muted-foreground/70">{footnote}</p> : null}
    </div>
  );
}
