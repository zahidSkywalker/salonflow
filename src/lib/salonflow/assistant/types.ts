/**
 * Shared types for the Aria engine. Pure data — safe to import from
 * client components and API routes alike.
 */

export type Scope = "admin" | "public";

/** What the client remembers between turns (passed back on every request). */
export interface AssistantContext {
  lastIntent?: string | null;
  lastTimeMin?: number | null;
  lastDate?: string | null;
}

export interface AssistantReply {
  text: string;
  chips: string[];
  /** intent id that produced the answer — lets the client keep memory */
  intent?: string;
  /** memory patch — the client stores this and echoes it back next turn */
  next?: { time?: number | null; date?: string | null };
  /** true when nothing matched — client may offer neural "did you mean" */
  fallback?: boolean;
}

export interface AskOptions {
  message: string;
  scope: Scope;
  context?: AssistantContext | null;
  /** neural hint from the in-browser model (intent id), already thresholded */
  hint?: string | null;
}
