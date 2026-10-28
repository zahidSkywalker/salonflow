import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { check, sweep, clientIp } from "@/lib/salonflow/ratelimit";

/**
 * POST /api/admin/uploads — store an image that came straight off the
 * owner's device. The browser compresses first (see ImagePicker), so the
 * payload arriving here is already small; we still enforce hard limits so
 * a curious curl can't park a zip bomb in the database.
 *
 * Body: { filename, mime, dataUrl } — dataUrl = "data:image/jpeg;base64,…"
 * Returns { url: "/api/uploads/<id>" } — that URL is what image fields store.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  sweep();
  const limiter = check(`upload:${clientIp(req)}`, 30, 10 * 60_000, 5 * 60_000);
  if (!limiter.allowed) {
    return bad(`Too many uploads — try again in ${limiter.retryAfterSec}s`, 429);
  }

  const b = await req.json().catch(() => null);
  if (!b || typeof b.dataUrl !== "string") return bad("No image data received");

  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(b.dataUrl);
  if (!m) return bad("That file isn't a supported image (JPEG, PNG, WebP or GIF)");
  const mime = m[1];

  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length === 0) return bad("The image came through empty");
  if (buffer.length > 3 * 1024 * 1024) {
    return bad("That image is too large even after compression — try one under 3 MB");
  }

  const rawName = typeof b.filename === "string" && b.filename.trim() ? b.filename.trim() : "upload.jpg";
  // strip anything path-like or exotic — the filename is cosmetic only
  const filename = rawName.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "upload.jpg";

  const saved = await db.upload.create({
    data: { filename, mime, size: buffer.length, bytes: buffer },
  });

  return ok({ url: `/api/uploads/${saved.id}`, id: saved.id, size: saved.size });
}
