import { ok } from "@/lib/salonflow/auth";
import { ADMIN_COOKIE } from "@/lib/salonflow/auth";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function POST() {
  const res = ok({ bye: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}