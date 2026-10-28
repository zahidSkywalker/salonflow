/**
 * Aria engine smoke test — runs the real engine against the real (seeded)
 * local database. Verifies intent routing across ~70 utterances, including
 * the exact "who is free at 6pm" miss reported by Zahid, typo tolerance,
 * follow-up memory, closed-hours intelligence and fallback recovery.
 *
 * Run: DATABASE_URL="file:<abs>/prisma/dev.db" npx tsx scripts/aria_test.ts
 * (The neural layer is browser-only — hints are null here, so this also
 * proves the rule engine stands on its own.)
 */
import { askAria } from "../src/lib/salonflow/assistant/engine";
import type { AssistantContext } from "../src/lib/salonflow/assistant/types";

interface Case {
  scope: "admin" | "public";
  msg: string;
  ctx?: AssistantContext;
  expectIntent?: string;
  allowFallback?: boolean;
}

const CASES: Case[] = [
  /* ── THE reported miss ── */
  { scope: "admin", msg: "who is free at 6pm", expectIntent: "free_at" },
  { scope: "admin", msg: "whos free at 6pm", expectIntent: "free_at" },
  { scope: "admin", msg: "who's free at 3pm", expectIntent: "free_at" },
  { scope: "admin", msg: "who is free at 6", expectIntent: "free_at" },
  { scope: "admin", msg: "anyone free at noon", expectIntent: "free_at" },
  { scope: "admin", msg: "who's free right now", expectIntent: "free_at" },
  { scope: "admin", msg: "is anyone available saturday", expectIntent: "free_at" },
  { scope: "admin", msg: "who can take a walk in", expectIntent: "free_at" },
  { scope: "admin", msg: "who's free at 11am tomorrow", expectIntent: "free_at" },
  { scope: "admin", msg: "what about sunday", ctx: { lastIntent: "free_at", lastTimeMin: 900 }, expectIntent: "free_at" },
  { scope: "admin", msg: "and tomorrow?", ctx: { lastIntent: "free_at", lastTimeMin: 900 }, expectIntent: "free_at" },

  /* ── money ── */
  { scope: "admin", msg: "how did we do this week", expectIntent: "revenue" },
  { scope: "admin", msg: "revenue today", expectIntent: "revenue" },
  { scope: "admin", msg: "revenue yesterday", expectIntent: "revenue" },
  { scope: "admin", msg: "how much did we make last month", expectIntent: "revenue" },
  { scope: "admin", msg: "how did we do", expectIntent: "revenue" },
  { scope: "admin", msg: "sales this month", expectIntent: "revenue" },
  { scope: "admin", msg: "tips this week", expectIntent: "tips" },
  { scope: "admin", msg: "discounts this month", expectIntent: "discounts" },
  { scope: "admin", msg: "payments this week", expectIntent: "payments" },
  { scope: "admin", msg: "cash vs card", expectIntent: "payments" },

  /* ── the floor ── */
  { scope: "admin", msg: "who's coming in today", expectIntent: "schedule" },
  { scope: "admin", msg: "how's tomorrow looking", expectIntent: "schedule" },
  { scope: "admin", msg: "who's booked today", expectIntent: "schedule" },
  { scope: "admin", msg: "next appointment", expectIntent: "next_appt" },
  { scope: "admin", msg: "who's in the chair right now", expectIntent: "in_chair" },
  { scope: "admin", msg: "who's working today", expectIntent: "roster" },
  { scope: "admin", msg: "what are the shifts tomorrow", expectIntent: "roster" },

  /* ── clients & staff ── */
  { scope: "admin", msg: "who are the regulars", expectIntent: "regulars" },
  { scope: "admin", msg: "new clients this month", expectIntent: "new_clients" },
  { scope: "admin", msg: "how many clients do we have", expectIntent: "total_clients" },
  { scope: "admin", msg: "who earned the most", expectIntent: "leaderboard" },
  { scope: "admin", msg: "staff leaderboard", expectIntent: "leaderboard" },
  { scope: "admin", msg: "find Ingrid", expectIntent: "client_lookup" },
  { scope: "admin", msg: "find Ingrud", expectIntent: "client_lookup" }, // typo
  { scope: "admin", msg: "who is Maya", expectIntent: "client_lookup" },

  /* ── stock / best sellers / ops ── */
  { scope: "admin", msg: "any low stock", expectIntent: "stock" },
  { scope: "admin", msg: "what's running out", expectIntent: "stock" },
  { scope: "admin", msg: "best selling service", expectIntent: "best_sellers" },
  { scope: "admin", msg: "best selling product", expectIntent: "best_sellers" },
  { scope: "admin", msg: "no-shows this month", expectIntent: "no_shows" },
  { scope: "admin", msg: "cancellations last week", expectIntent: "cancellations" },
  { scope: "admin", msg: "pending approvals", expectIntent: "pending" },
  { scope: "admin", msg: "busiest day", expectIntent: "busiest" },
  { scope: "admin", msg: "our quietest day", expectIntent: "busiest" },
  { scope: "admin", msg: "when are we open", expectIntent: "hours" },
  { scope: "admin", msg: "how many walk-ins today", expectIntent: "walkins" },
  { scope: "admin", msg: "price of balayage", expectIntent: "price_lookup" },
  { scope: "admin", msg: "how much is a haircut", expectIntent: "price_lookup" },

  /* ── small talk ── */
  { scope: "admin", msg: "hi", expectIntent: "greeting" },
  { scope: "admin", msg: "who are you", expectIntent: "identity" },
  { scope: "admin", msg: "thanks", expectIntent: "thanks" },
  { scope: "admin", msg: "what can you do", expectIntent: "help" },

  /* ── PUBLIC ── */
  { scope: "public", msg: "do you have anything at 3pm today", expectIntent: "p_slots" },
  { scope: "public", msg: "any openings tomorrow", expectIntent: "p_slots" },
  { scope: "public", msg: "are you available this friday", expectIntent: "p_slots" },
  { scope: "public", msg: "what times are free on saturday", expectIntent: "p_slots" },
  { scope: "public", msg: "how much is a balayage", expectIntent: "p_price" },
  { scope: "public", msg: "price for a manicure", expectIntent: "p_price" },
  { scope: "public", msg: "your prices", expectIntent: "p_price" },
  { scope: "public", msg: "book a haircut", expectIntent: "p_book" },
  { scope: "public", msg: "I want to book a massage saturday", expectIntent: "p_book" },
  { scope: "public", msg: "can I book an appointment", expectIntent: "p_book" },
  { scope: "public", msg: "what services do you offer", expectIntent: "p_services" },
  { scope: "public", msg: "do you do nails", expectIntent: "p_book" }, // keyword → booking flow
  { scope: "public", msg: "who works here", expectIntent: "p_staff" },
  { scope: "public", msg: "tell me about your team", expectIntent: "p_staff" },
  { scope: "public", msg: "when are you open", expectIntent: "p_hours" },
  { scope: "public", msg: "when do you close", expectIntent: "p_hours" },
  { scope: "public", msg: "where are you located", expectIntent: "p_location" },
  { scope: "public", msg: "is there parking nearby", expectIntent: "p_location" },
  { scope: "public", msg: "what's your phone number", expectIntent: "p_contact" },
  { scope: "public", msg: "tell me about the salon", expectIntent: "p_about" },
  { scope: "public", msg: "where's my booking SA-ABCDE1", expectIntent: "p_booking_lookup" },
  { scope: "public", msg: "I want to cancel my appointment", expectIntent: "p_booking_lookup" },
  { scope: "public", msg: "hi", expectIntent: "p_greeting" },
  { scope: "public", msg: "are you a robot", expectIntent: "p_identity" },
  { scope: "public", msg: "what can you do", expectIntent: "p_help" },

  /* ── fallbacks that SHOULD fall back (with recovery chips) ── */
  { scope: "admin", msg: "what's the weather in paris", allowFallback: true },
  { scope: "admin", msg: "tell me a joke", allowFallback: true },
  { scope: "public", msg: "what's the capital of france", allowFallback: true },
];

let pass = 0;
let fail = 0;
const failures: string[] = [];

async function main() {
for (const c of CASES) {
  const r = await askAria({ message: c.msg, scope: c.scope, context: c.ctx ?? null, hint: null });
  const firstLine = r.text.split("\n")[0].replace(/\*\*/g, "").slice(0, 90);
  let ok: boolean;
  if (c.expectIntent) ok = r.intent === c.expectIntent && !r.fallback;
  else if (c.allowFallback) ok = !!r.fallback;
  else ok = !r.fallback;
  if (ok) pass++;
  else {
    fail++;
    failures.push(`"${c.msg}" (${c.scope}) → got ${r.intent ?? "FALLBACK"}${c.expectIntent ? `, wanted ${c.expectIntent}` : ""}`);
  }
  console.log(`${ok ? "✓" : "✗"} [${c.scope}] "${c.msg}" → ${r.intent ?? "FALLBACK"} :: ${firstLine}`);
}

console.log(`\n${pass}/${pass + fail} passed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  • " + f);
  process.exit(1);
}
}
main().catch((e) => { console.error(e); process.exit(1); });
