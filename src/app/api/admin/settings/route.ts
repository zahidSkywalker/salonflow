import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin, tokenForPin, ADMIN_COOKIE } from "@/lib/salonflow/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const s = await db.setting.findUnique({ where: { id: "main" } });
  if (!s) return bad("Not configured", 500);
  return ok({
    salonName: s.salonName, tagline: s.tagline, about: s.about,
    address: s.address, phone: s.phone, email: s.email,
    currencySymbol: s.currencySymbol, openMin: s.openMin, closeMin: s.closeMin,
    slotStepMin: s.slotStepMin, closedDays: s.closedDays, adminPin: s.adminPin,
    heroImage: s.heroImage,
    gallery: (() => { try { return JSON.parse(s.galleryJson); } catch { return []; } })(),
  });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");

  const data: Record<string, unknown> = {};
  if (typeof b.salonName === "string" && b.salonName.trim()) data.salonName = b.salonName.trim();
  if (typeof b.tagline === "string") data.tagline = b.tagline;
  if (typeof b.about === "string") data.about = b.about;
  if (typeof b.address === "string") data.address = b.address;
  if (typeof b.phone === "string") data.phone = b.phone;
  if (typeof b.email === "string") data.email = b.email;
  if (typeof b.currencySymbol === "string" && b.currencySymbol.trim()) data.currencySymbol = b.currencySymbol.trim().slice(0, 4);
  if (typeof b.openMin === "number" && b.openMin >= 0 && b.openMin < 1440) data.openMin = Math.round(b.openMin);
  if (typeof b.closeMin === "number" && b.closeMin > 0 && b.closeMin <= 1440) data.closeMin = Math.round(b.closeMin);
  if (typeof b.slotStepMin === "number" && [5, 10, 15, 20, 30].includes(b.slotStepMin)) data.slotStepMin = b.slotStepMin;
  if (typeof b.closedDays === "string") data.closedDays = b.closedDays.replace(/[^0-6,]/g, "");
  if (typeof b.heroImage === "string") data.heroImage = b.heroImage;
  if (typeof b.gallery === "string") data.galleryJson = b.gallery;
  if (typeof b.adminPin === "string" && b.adminPin.length >= 4) data.adminPin = b.adminPin;

  if (Object.keys(data).length === 0) return bad("Nothing to update");

  const updated = await db.setting.update({ where: { id: "main" }, data });
  const res = ok({ saved: true });
  // PIN changed → refresh the admin cookie so the session stays valid
  if (data.adminPin) {
    res.cookies.set(ADMIN_COOKIE, tokenForPin(updated.adminPin), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
    });
  }
  return res;
}
