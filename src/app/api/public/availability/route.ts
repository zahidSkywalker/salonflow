import { NextRequest } from "next/server";
import { ok, bad } from "@/lib/salonflow/auth";
import { computeSlots } from "@/lib/salonflow/slotengine";
import { dbReady } from "@/lib/db";

export async function GET(req: NextRequest) {
  await dbReady; // first-run bootstrap
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") ?? "";
  const staffId = searchParams.get("staffId") ?? "any";
  const date = searchParams.get("date") ?? "";
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return bad("serviceId and date (YYYY-MM-DD) are required");
  }
  const slots = await computeSlots(serviceId, staffId, date);
  return ok({ date, slots });
}
