"use client";

/**
 * Aria's neural layer — a ~22M-parameter MiniLM sentence encoder bundled
 * INSIDE the app (served from /public/models, executed in the visitor's
 * browser via WebAssembly). Zero external APIs, zero keys, zero cost.
 *
 * What it adds over rules: understanding *meaning* when words don't match.
 * "how did we do" never contains the word "revenue" — but its embedding
 * lands next to "how did we do this week?" in vector space, and the hint
 * routes the question correctly. When the model can't load (old browser,
 * blocked storage), everything degrades gracefully to the rule engine.
 */
import { intentsForScope } from "./assistant/catalog";
import type { Scope } from "./assistant/types";

/** Minimal shape we need from the feature-extraction pipeline. */
interface EmbedPipe {
  (texts: string[], opts: { pooling: string; normalize: boolean }): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
}

const MODEL_ID = "all-MiniLM-L6-v2";
const HINT_THRESHOLD = 0.5;      // min cosine similarity to send a hint
const LEAD = 0.04;               // top must beat runner-up by this much

let pipePromise: Promise<EmbedPipe | null> | null = null;
let loadState: "idle" | "loading" | "ready" | "failed" = "idle";
const corpusCache = new Map<Scope, { text: string; intent: string; vec: Float32Array }[]>();
const vecCache = new Map<string, Float32Array>();

async function getPipe(): Promise<EmbedPipe | null> {
  if (!pipePromise) {
    pipePromise = (async () => {
      try {
        const tf = await import("@huggingface/transformers");
        tf.env.allowLocalModels = true;
        tf.env.allowRemoteModels = false; // hard rule: nothing leaves this app
        tf.env.localModelPath = "/models/";
        try {
          // serve the onnxruntime wasm binaries from our own /public
          (tf.env.backends as { onnx?: { wasm?: { wasmPaths?: string } } }).onnx?.wasm &&
            ((tf.env.backends as { onnx: { wasm: { wasmPaths: string } } }).onnx.wasm.wasmPaths = "/models/wasm/");
        } catch { /* older builds — defaults still work */ }
        const pipe = (await tf.pipeline("feature-extraction", MODEL_ID, { dtype: "q8" })) as unknown as EmbedPipe;
        loadState = "ready";
        return pipe;
      } catch (err) {
        console.warn("[aria-nlu] neural layer unavailable, rules only:", err);
        loadState = "failed";
        return null;
      }
    })();
    loadState = "loading";
  }
  return pipePromise;
}

async function embed(pipe: EmbedPipe, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const CHUNK = 32;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const batch = texts.slice(i, i + CHUNK);
    const tensor = await pipe(batch, { pooling: "mean", normalize: true });
    const data = tensor.data as Float32Array;
    const dim = tensor.dims[tensor.dims.length - 1];
    for (let r = 0; r < batch.length; r++) {
      out.push(data.slice(r * dim, (r + 1) * dim));
    }
  }
  return out;
}

function cos(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

/** Build (and cache) the example corpus embeddings for a scope. */
async function getCorpus(scope: Scope): Promise<{ text: string; intent: string; vec: Float32Array }[]> {
  const hit = corpusCache.get(scope);
  if (hit) return hit;
  const pipe = await getPipe();
  if (!pipe) return [];
  const intents = intentsForScope(scope);
  const texts: string[] = [];
  const labels: string[] = [];
  for (const it of intents) for (const ex of it.examples) { texts.push(ex); labels.push(it.id); }
  const vecs = await embed(pipe, texts);
  const corpus = texts.map((text, i) => ({ text, intent: labels[i], vec: vecs[i] }));
  corpusCache.set(scope, corpus);
  return corpus;
}

/** Kick off model load early (e.g. when the chat panel opens). */
export function warmNlu(): void {
  void getPipe();
}

export function nluStatus(): "idle" | "loading" | "ready" | "failed" {
  return loadState;
}

export interface NluHint {
  intent: string;
  score: number;
}

/**
 * Score a message against the example corpus; returns a hint only when the
 * model is confident (above threshold AND clearly ahead of the runner-up).
 */
export async function nluHint(message: string, scope: Scope): Promise<NluHint | null> {
  try {
    const pipe = await getPipe();
    if (!pipe) return null;
    const corpus = await getCorpus(scope);
    if (!corpus.length) return null;
    const key = `${scope}:${message.toLowerCase()}`;
    let vec = vecCache.get(key);
    if (!vec) {
      const [v] = await embed(pipe, [message]);
      vec = v;
      if (vecCache.size > 200) vecCache.clear();
      vecCache.set(key, vec);
    }
    const best = new Map<string, number>();
    for (const row of corpus) {
      const s = cos(vec, row.vec);
      if (!best.has(row.intent) || s > best.get(row.intent)!) best.set(row.intent, s);
    }
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topScore] = ranked[0] ?? ["", 0];
    const secondScore = ranked[1]?.[1] ?? 0;
    if (topScore >= HINT_THRESHOLD && topScore - secondScore >= LEAD) {
      return { intent: topId, score: Math.round(topScore * 1000) / 1000 };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * "Did you mean" — the nearest example utterances in vector space.
 * Used when the engine falls back, so Aria always offers a way forward.
 */
export async function nluDidYouMean(message: string, scope: Scope, n = 3): Promise<string[]> {
  try {
    const pipe = await getPipe();
    if (!pipe) return [];
    const corpus = await getCorpus(scope);
    if (!corpus.length) return [];
    const [vec] = await embed(pipe, [message]);
    const ranked = corpus
      .map((row) => ({ text: row.text, s: cos(vec!, row.vec) }))
      .sort((a, b) => b.s - a.s);
    const out: string[] = [];
    for (const r of ranked) {
      if (out.length >= n) break;
      if (!out.includes(r.text)) out.push(r.text);
    }
    return out;
  } catch {
    return [];
  }
}
