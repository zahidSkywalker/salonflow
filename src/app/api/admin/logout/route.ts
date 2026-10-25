import { ok } from "@/lib/salonflow/auth";
import { ADMIN_COOKIE } from "@/lib/salonflow/auth";

export async function POST() {
  const res = ok({ bye: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
