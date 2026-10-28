/**
 * Aria v1.9 — backwards-compatible entry point.
 * The engine now lives in ./assistant/* (scoped, contextual, neural-hinted).
 */
export { askAria as askSalon } from "./assistant/engine";
export type { AssistantReply, AssistantContext, Scope } from "./assistant/types";
