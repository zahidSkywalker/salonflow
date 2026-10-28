import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // transformers.js is browser-only (Aria's neural layer) — keep it out of
  // the server bundle; the model files themselves are served from /public.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
