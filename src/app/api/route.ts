import { NextResponse } from "next/server";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}