/**
 * The intent catalog — the single source of truth shared by:
 *   • the server rule engine (patterns, ordered)
 *   • the fuzzy keyword scorer (typo tolerance)
 *   • the in-browser neural layer (examples → MiniLM embeddings)
 *   • "did you mean" recovery
 *
 * Pure data — importable from client and server. Order matters inside
 * each scope: the first pattern hit wins, so specific intents sit above
 * greedy ones.
 */

import { looksLikeLookup } from "./entities";

export interface IntentDef {
  id: string;
  scope: "admin" | "public";
  patterns?: RegExp[];
  /** custom matcher (runs where a regex is awkward, e.g. client lookup) */
  match?: (msg: string) => boolean;
  keywords?: string[];
  examples: string[];
  chips?: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * ADMIN — the owner/staff console. Money, clients, stock, the team.
 * ──────────────────────────────────────────────────────────────────────── */
const ADMIN: IntentDef[] = [
  {
    id: "help", scope: "admin",
    patterns: [/\b(help|what can you do|commands|options|abilities|capab)\b/],
    keywords: ["help", "abilities", "commands"],
    examples: [
      "what can you do", "help", "show me your commands", "what are your abilities",
      "what do you know how to do", "list your skills", "what can i ask you",
      "help me understand what you offer", "options", "abilities",
    ],
  },
  {
    id: "identity", scope: "admin",
    patterns: [/\b(who are you|what are you|your name|are you (an? )?(ai|robot|bot|human|real))\b/],
    examples: [
      "who are you", "what are you", "are you an ai", "are you a robot",
      "are you human", "what is your name", "tell me about yourself",
      "are you a real person", "are you a bot",
    ],
  },
  {
    id: "thanks", scope: "admin",
    patterns: [/^(thanks|thank you|thx|ty|cheers|nice one|good (job|girl|work)|well done|great work|awesome)\b/],
    examples: ["thanks", "thank you", "thx", "cheers", "nice one", "good job", "well done", "great work"],
  },
  {
    id: "bye", scope: "admin",
    patterns: [/^(bye|goodbye|good night|see you|later|that's all|thats all|nothing else)\b/],
    examples: ["bye", "goodbye", "good night", "see you tomorrow", "thats all", "nothing else"],
  },
  {
    id: "greeting", scope: "admin",
    patterns: [/^(hi|hello|hey|yo|good (morning|afternoon|evening)|morning|sup|what's up|whats up|salam|assalam)\b/],
    examples: [
      "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
      "hey aria", "salam", "whats up", "yo",
    ],
  },
  {
    id: "free_at", scope: "admin",
    patterns: [
      /\b(free|available|availability|vacancy|open slot|open chair|openings?)\b/,
      /\bcan (anyone|anybody|you|the team) (take|fit|squeeze|do)/,
      /(?<!how many |many )\bwalk.?in/,
    ],
    keywords: ["free", "available", "availability", "openings", "vacancy", "walk in", "slot", "chair"],
    examples: [
      "who's free at 3pm", "who is free at 6pm", "who's free right now", "anyone available at 4",
      "who's available tomorrow morning", "any openings today", "who can take a walk in",
      "is anyone free this afternoon", "free chairs at 5pm", "who's free on saturday",
      "any availability at 2pm", "who can squeeze in a client at 11",
      "who's free at 6", "whos free at 6pm", "anybody free at noon",
    ],
  },
  {
    id: "next_appt", scope: "admin",
    patterns: [/\b(next (appointment|customer|client|booking|up|guest)|up next|coming up next|next in)\b/],
    keywords: ["next"],
    examples: [
      "who's next", "next appointment", "who is up next", "who's coming in next",
      "next booking", "who's my next client", "next in the chair",
    ],
  },
  {
    id: "in_chair", scope: "admin",
    patterns: [/\b(right now|currently|in the shop|in the chair|at the moment|busy right now|in progress)\b/],
    keywords: ["currently", "moment", "chair"],
    examples: [
      "who's in the chair right now", "what's happening right now", "who is currently busy",
      "in the shop right now", "who's in the middle of an appointment", "at the moment who's busy",
    ],
  },
  {
    id: "schedule", scope: "admin",
    patterns: [
      /\b(schedule|agenda|booked|book|appointments?|coming|plan|my day|the day|who.?s in|whats on|what.?s on)\b/,
      /\b(today|tomorrow|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*\b(looking|look like|shaped|filled)\b/,
    ],
    keywords: ["schedule", "agenda", "appointments", "coming", "plan"],
    examples: [
      "who's coming in today", "how's today looking", "show me today's schedule",
      "what does tomorrow look like", "who's coming in tomorrow", "today's appointments",
      "the schedule for friday", "whats on the book today", "my day so far",
      "how does saturday look", "who's booked today",
    ],
  },
  {
    id: "no_shows", scope: "admin",
    patterns: [/\b(no.?shows?|ghosted|didn.?t (show|turn)|no show rate)\b/],
    keywords: ["no show", "ghosted", "noshow"],
    examples: [
      "any no-shows this month", "how many no shows", "who ghosted us",
      "no show rate", "did anyone not show up", "no-shows last week",
    ],
  },
  {
    id: "cancellations", scope: "admin",
    patterns: [/\bcancel/],
    keywords: ["cancel", "cancelled", "cancellations"],
    examples: [
      "cancellations this month", "how many cancels last week", "cancelled appointments",
      "did anyone cancel today", "cancellation rate",
    ],
  },
  {
    id: "pending", scope: "admin",
    patterns: [
      /\b(pending|awaiting|approve|unconfirmed)\b.*\b(appointment|booking|confirm|approval|pending|requests?)\b/,
      /\b(pending|awaiting|unconfirmed) (requests|bookings|appointments|approvals)\b/,
    ],
    keywords: ["pending", "awaiting", "unconfirmed", "approve"],
    examples: [
      "any pending approvals", "how many bookings awaiting confirmation", "pending requests",
      "unconfirmed appointments", "what needs approving", "anything awaiting my yes",
    ],
  },
  {
    id: "stock", scope: "admin",
    patterns: [/\b(low stock|running out|restock|inventory|stock levels?|out of)\b/],
    match: (msg) =>
      /\b(low stock|running out|restock|inventory|stock levels?|out of)\b/.test(msg) ||
      (/\b(products?|retail|shampoo)\b/.test(msg) && !/\b(best|top|most|popular|selling)\b/.test(msg)),
    keywords: ["stock", "inventory", "restock", "products", "retail", "shampoo"],
    examples: [
      "any low stock", "what's running out", "do we need to restock",
      "stock of shampoo", "inventory check", "which products are low",
      "anything sold out", "retail stock levels",
    ],
  },
  {
    id: "leaderboard", scope: "admin",
    patterns: [
      /\b(staff|team|stylist|barber|commission|leaderboard|perform)\b/,
      /\bwho (sold|earned|did (the )?most|made the most)\b/,
    ],
    keywords: ["staff", "team", "stylist", "commission", "leaderboard", "earned", "perform"],
    examples: [
      "who earned the most", "staff leaderboard", "how did the team do this week",
      "who sold the most", "commissions this month", "best performing stylist",
      "team performance", "who made the most money for us",
    ],
  },
  {
    id: "tips", scope: "admin",
    patterns: [/\btips?\b/],
    keywords: ["tips", "tip"],
    examples: [
      "tips this week", "how much in tips", "tip total today", "are the regulars tipping",
      "tips last month",
    ],
  },
  {
    id: "best_sellers", scope: "admin",
    patterns: [
      /\b(best|top|most|popular|favorite|favourite|selling)\b.*\b(service|seller|sellers|treatment|product|retail|menu)?\b/,
      /\bbest sellers?\b/,
    ],
    keywords: ["best", "top", "popular", "selling", "favorite"],
    examples: [
      "best selling service", "what's our top service", "most popular treatment",
      "best selling product", "what sells the most", "top sellers this month",
      "favourite service among clients",
    ],
  },
  {
    id: "regulars", scope: "admin",
    patterns: [/\b(regulars?|vip|vips|loyal|best clients?|top clients?|frequent)\b/],
    keywords: ["regulars", "vip", "loyal", "frequent"],
    examples: [
      "who are the regulars", "my best clients", "who are the vips",
      "most loyal customers", "who comes here the most", "frequent visitors",
    ],
  },
  {
    id: "new_clients", scope: "admin",
    patterns: [/\bnew (clients?|customers?|faces)\b/],
    keywords: ["new", "clients", "customers"],
    examples: [
      "new clients this month", "any first-timers", "how many new customers",
      "new faces lately", "new client growth",
    ],
  },
  {
    id: "total_clients", scope: "admin",
    patterns: [/\bhow many (clients?|customers?)\b/, /\btotal (clients?|customers?)\b/],
    keywords: ["total", "clients", "customers"],
    examples: [
      "how many clients do we have", "total customers", "how big is our client book",
      "client count",
    ],
  },
  {
    id: "roster", scope: "admin",
    patterns: [/\b(working (today|tomorrow)|roster|shifts?|who.?s (in|on)|on duty|who.?s working)\b/],
    keywords: ["roster", "shifts", "working", "duty"],
    examples: [
      "who's working today", "what are the shifts", "who's on duty tomorrow",
      "show me the roster", "who works friday",
    ],
  },
  {
    id: "client_lookup", scope: "admin",
    match: (msg) => looksLikeLookup(msg) !== null,
    keywords: ["client", "customer", "find", "profile", "history"],
    examples: [
      "find Ingrid", "who is Maya Chen", "client info for Sofia", "search for daniel",
      "ingrid's history", "details on customer john", "look up amelia",
    ],
  },
  {
    id: "busiest", scope: "admin",
    patterns: [/\b(busiest|busier|quietest|slowest|peak|when are we (busiest|quiet))\b/],
    keywords: ["busiest", "quietest", "peak", "slowest"],
    examples: [
      "busiest day", "when are we busiest", "our quietest day", "peak hours",
      "slowest day of the week", "when should i run a promo",
    ],
  },
  {
    id: "hours", scope: "admin",
    patterns: [/\b(open|hours|close|closing|when (are|do) we|what time)\b/],
    keywords: ["open", "hours", "close", "closing"],
    examples: [
      "when are we open", "what are our hours", "what time do we close",
      "are we open on sunday", "closing time today",
    ],
  },
  {
    id: "payments", scope: "admin",
    patterns: [/\b(cash|card|payment|pay by|method|mobile money|bKash)\b/],
    keywords: ["cash", "card", "payment", "method"],
    examples: [
      "payments this week", "cash vs card split", "how do people pay",
      "payment methods breakdown", "how much came through card",
    ],
  },
  {
    id: "discounts", scope: "admin",
    patterns: [/\bdiscount/],
    keywords: ["discount", "discounts"],
    examples: [
      "discounts this month", "how much are we giving away", "discount total",
      "are discounts running hot",
    ],
  },
  {
    id: "price_lookup", scope: "admin",
    patterns: [/\bhow much is\b/, /\bprice (of|for)\b/, /\bcost (of|for)?\b/],
    keywords: ["price", "cost", "much"],
    examples: [
      "how much is a balayage", "price of a manicure", "cost of keratin treatment",
      "what do we charge for a cut", "price for full color",
    ],
  },
  {
    id: "revenue", scope: "admin",
    patterns: [
      /\b(revenue|sales|gross|net|income|made|make|earn|take|performance|doing)\b/,
      /\bhow (much|did we do|are we doing|much did|much have)\b/,
    ],
    keywords: ["revenue", "sales", "earn", "made", "income", "gross", "doing", "performance"],
    examples: [
      "how did we do this week", "revenue today", "how much did we make yesterday",
      "sales this month", "are we doing better than last week", "income last 30 days",
      "how's business", "what did we take today",
    ],
  },
  {
    id: "walkins", scope: "admin",
    patterns: [/\bwalk.?ins?\b/, /\b(booked online|online booking|through the site|via the site)\b/],
    keywords: ["walk in", "walkins", "online"],
    examples: [
      "how many walk-ins today", "online bookings this week", "walk in traffic",
      "how many came through the site",
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────────
 * PUBLIC — visitors on the storefront. Booking, prices, hours, location.
 * No money, no client records, no staff performance. Ever.
 * ──────────────────────────────────────────────────────────────────────── */
const PUBLIC: IntentDef[] = [
  {
    id: "p_help", scope: "public",
    patterns: [/\b(help|what can you do|options|abilities)\b/],
    keywords: ["help"],
    examples: [
      "what can you do", "help", "how does this work", "what can i ask you",
      "can you help me book", "options",
    ],
  },
  {
    id: "p_identity", scope: "public",
    patterns: [/\b(who are you|what are you|are you (an? )?(ai|robot|bot|human|real)|your name)\b/],
    examples: [
      "who are you", "are you a robot", "are you a real person", "are you human",
      "are you ai", "what's your name",
    ],
  },
  {
    id: "p_thanks", scope: "public",
    patterns: [/^(thanks|thank you|thx|ty|cheers|nice one|great|awesome|perfect)\b/],
    examples: ["thanks", "thank you", "thx", "perfect", "awesome", "great"],
  },
  {
    id: "p_bye", scope: "public",
    patterns: [/^(bye|goodbye|good night|see you|later|that's all|thats all|nothing else)\b/],
    examples: ["bye", "goodbye", "see you saturday", "thats all", "nothing else"],
  },
  {
    id: "p_greeting", scope: "public",
    patterns: [/^(hi|hello|hey|yo|good (morning|afternoon|evening)|morning|sup|salam|assalam)\b/],
    examples: ["hi", "hello", "hey there", "good morning", "good afternoon", "salam", "hey"],
  },
  {
    id: "p_booking_lookup", scope: "public",
    patterns: [
      /\b(my booking|my appointment|where.?s my|check my|find my|reschedule|change my|move my|cancel)\b/,
      /\bSA-[A-Z0-9]{4,6}\b/,
    ],
    keywords: ["booking", "reference", "cancel", "reschedule", "appointment"],
    examples: [
      "where's my booking", "check my appointment", "I want to cancel",
      "reschedule my appointment", "find my booking SA-K3M9P", "my reference code",
      "did my booking go through", "change my appointment",
    ],
  },
  {
    id: "p_slots", scope: "public",
    patterns: [
      /\b(free|available|availability|openings?|open slots?|open chair|vacancy|any times?|what times?|slots?)\b/,
      /\bdo you have (anything|space|room|a slot|time)/,
      /\bgot (space|room|anything)/,
    ],
    keywords: ["free", "available", "availability", "openings", "slots", "times", "space",
      "avalible", "availible", "avilable", "fre", "vacancy"],
    examples: [
      "do you have anything at 3pm today", "any openings tomorrow",
      "what times are free on saturday", "are you available this friday",
      "any free slots in the morning", "got space for a cut this week",
      "what's free this weekend", "is 6pm available", "when can i come in",
      "availability next week", "do you have room at 5",
    ],
  },
  {
    id: "p_book", scope: "public",
    patterns: [
      /\b(book|booking|reserve|reservation|schedule me|sign me up|get me in|make me an appointment|take a booking)\b/,
      /\b(can i|let me|i'd like to|i want to|i would like to|lets) (book|get|schedule|come|make)\b/,
    ],
    keywords: ["book", "reserve", "appointment", "schedule",
      "massage", "facial", "manicure", "pedicure", "nails", "balayage", "haircut", "keratin", "trim", "beard",
      "want a", "need a", "get a", "book a", "do nails", "nails done", "do my", "get my"],
    examples: [
      "I want to book a haircut", "can I book an appointment", "book me in for tomorrow",
      "I'd like to reserve a slot", "make me an appointment for friday",
      "let's book something", "i want to come in for a facial", "schedule me a manicure",
      "book a balayage for saturday at 2pm", "can i get an appointment",
    ],
  },
  {
    id: "p_price", scope: "public",
    patterns: [/\bhow much\b/, /\b(price|prices|cost|rate|rates|charge|expensive)\b/],
    keywords: ["price", "cost", "much", "charge", "expensive"],
    examples: [
      "how much is a haircut", "price for balayage", "what do you charge for a manicure",
      "how much does keratin cost", "your prices", "is it expensive",
      "price list", "how much for a beard trim",
    ],
  },
  {
    id: "p_services", scope: "public",
    patterns: [/\b(services|menu|treatments|offer|options|what do you do|what do you offer)\b/],
    keywords: ["services", "menu", "treatments", "offer"],
    examples: [
      "what services do you offer", "show me the menu", "what treatments do you have",
      "what do you do", "list of services", "do you do nails",
      "do you offer massages", "what are your options",
    ],
  },
  {
    id: "p_staff", scope: "public",
    patterns: [
      /\b(who works|who do you have|team|staff|stylist|barber|specialists?|therapists?|artists?|who is|who's)\b/,
    ],
    keywords: ["team", "staff", "stylist", "barber", "specialist", "therapist"],
    examples: [
      "who works here", "tell me about your team", "who's maya",
      "who are your stylists", "do you have a barber", "who can do balayage",
      "tell me about sofia", "who should i book with",
    ],
  },
  {
    id: "p_hours", scope: "public",
    patterns: [/\b(open|hours|close|closing|what time|when are you|when do you|when you'?re? open)\b/],
    keywords: ["open", "hours", "close", "time"],
    examples: [
      "when are you open", "what are your hours", "what time do you close",
      "are you open on sunday", "how late are you open", "closing time",
      "are you open now",
    ],
  },
  {
    id: "p_location", scope: "public",
    patterns: [
      /\b(where|address|located|location|directions|parking|find you|find the salon|how do i get)\b/,
    ],
    keywords: ["where", "address", "located", "parking", "directions"],
    examples: [
      "where are you located", "what's your address", "how do i get to you",
      "is there parking nearby", "directions to the salon", "where's the salon",
    ],
  },
  {
    id: "p_contact", scope: "public",
    patterns: [/\b(phone|number|email|contact|call|whatsapp|instagram|facebook)\b/],
    keywords: ["phone", "email", "contact", "call", "whatsapp"],
    examples: [
      "what's your phone number", "how do i contact you", "do you have email",
      "can i call you", "whatsapp number", "are you on instagram",
    ],
  },
  {
    id: "p_about", scope: "public",
    patterns: [/\b(about|story|history|who is the salon|tell me about the salon|experience)\b/],
    keywords: ["about", "story", "history"],
    examples: [
      "tell me about the salon", "what's your story", "how long have you been open",
      "what makes you different", "about you",
    ],
  },
];

export const INTENTS: IntentDef[] = [...ADMIN, ...PUBLIC];

export function intentsForScope(scope: "admin" | "public"): IntentDef[] {
  return INTENTS.filter((i) => i.scope === scope);
}

export const intentIds = new Set(INTENTS.map((i) => i.id));
