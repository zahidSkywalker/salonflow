import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

/**
 * GET /api/uploads/[id] — public. The storefront renders these (hero,
 * gallery, service cards), so reads are open; only writes are admin-locked.
 * Content is immutable per id, so browsers can cache it forever.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return bad("Invalid image id", 400);

  const img = await db.upload.findUnique({ where: { id } });
  if (!img) return bad("Image not found", 404);

  return new NextResponse(new Uint8Array(img.bytes), {
    status: 200,
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** DELETE /api/uploads/[id] — admin-only cleanup of a replaced photo. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const existing = await db.upload.findUnique({ where: { id } });
  if (!existing) return bad("Image not found", 404);
  await db.upload.delete({ where: { id } });
  return ok({ deleted: id });
}
