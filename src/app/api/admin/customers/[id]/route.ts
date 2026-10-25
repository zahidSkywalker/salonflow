import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { salonToday, parseItems } from "@/lib/salonflow/time";

/** Full guest profile: stats + booking + purchase history. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;

  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) return bad("Customer not found", 404);

  const setting = await db.setting.findUnique({ where: { id: "main" } });
  const today = salonToday(setting?.timeZone);
  const [appointments, sales] = await Promise.all([
    db.appointment.findMany({
      where: { customerId: id },
      include: {
        staff: { select: { name: true } },
        service: { select: { name: true, price: true, category: true } },
      },
      orderBy: [{ date: "desc" }, { startMin: "desc" }],
      take: 50,
    }),
    db.sale.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { receiptNo: true, total: true, tip: true, method: true, createdAt: true, items: true },
    }),
  ]);

  const completed = appointments.filter((a) => a.status === "COMPLETED");
  const totalSpent = sales.reduce((a, s) => a + s.total, 0);

  // favourite staff / service by simple mode
  const tally = <T extends string>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  return ok({
    customer,
    stats: {
      visits: completed.length,
      upcoming: appointments.filter((a) => a.date >= today && (a.status === "CONFIRMED" || a.status === "PENDING")).length,
      noShows: appointments.filter((a) => a.status === "NO_SHOW").length,
      cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
      totalSpent,
      lastVisit: completed[0]?.date ?? null,
      favouriteStaff: tally(completed.map((a) => a.staff.name)),
      favouriteService: tally(completed.map((a) => a.service.name)),
    },
    appointments,
    sales: sales.map((s) => ({ ...s, items: parseItems(s.items) })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");

  const existing = await db.customer.findUnique({ where: { id } });
  if (!existing) return bad("Customer not found", 404);

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.phone === "string" && b.phone.trim().length >= 6) data.phone = b.phone.trim();
  if (typeof b.email === "string") data.email = b.email.trim() || null;
  if (typeof b.notes === "string") data.notes = b.notes.slice(0, 500);

  const updated = await db.customer.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const hasHistory = (await db.appointment.count({ where: { customerId: id } })) > 0 ||
    (await db.sale.count({ where: { customerId: id } })) > 0;
  if (hasHistory) return bad("Customer has booking or purchase history and cannot be deleted", 409);
  await db.customer.delete({ where: { id } });
  return ok({ deleted: id });
}
