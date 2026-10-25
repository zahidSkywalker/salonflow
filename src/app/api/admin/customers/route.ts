import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : undefined,
    include: {
      appointments: { where: { status: { in: ["COMPLETED", "CONFIRMED"] } }, select: { id: true, status: true } },
      sales: { select: { total: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({
    customers: customers.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, notes: c.notes,
      createdAt: c.createdAt,
      visits: c.appointments.filter((a) => a.status === "COMPLETED").length,
      upcoming: c.appointments.filter((a) => a.status === "CONFIRMED").length,
      totalSpent: c.sales.reduce((a, s) => a + s.total, 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");
  const { name, phone, email, notes } = b as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 2) return bad("Name required");
  if (typeof phone !== "string" || phone.trim().length < 6) return bad("Valid phone required");

  const exists = await db.customer.findUnique({ where: { phone: phone.trim() } });
  if (exists) return bad("A customer with this phone already exists", 409);

  const customer = await db.customer.create({
    data: {
      name: name.trim(),
      phone: phone.trim(),
      email: typeof email === "string" && email.trim() ? email.trim() : null,
      notes: typeof notes === "string" ? notes.slice(0, 500) : null,
    },
  });
  return ok(customer, 201);
}