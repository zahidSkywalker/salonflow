import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { parseItems } from "@/lib/salonflow/time";

interface IncomingItem {
  kind: "service" | "product";
  id: string;
  qty: number;
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");
  const { customerId, staffId, appointmentId, items, discount, tip, method } = b as Record<string, unknown>;

  if (!Array.isArray(items) || items.length === 0) return bad("Add at least one item to the cart");
  if (!["CASH", "CARD", "MOBILE"].includes(method as string)) return bad("Pick a payment method");
  const tipCents = typeof tip === "number" && Number.isFinite(tip) ? Math.max(0, Math.round(tip)) : 0;

  // resolve real prices from DB — never trust client prices
  const resolved: { kind: "service" | "product"; id: string; name: string; price: number; qty: number }[] = [];
  for (const raw of items as IncomingItem[]) {
    if (!raw || typeof raw.id !== "string" || !raw.kind) return bad("Malformed cart item");
    const qty = Math.max(1, Math.floor(raw.qty ?? 1));
    if (raw.kind === "service") {
      const svc = await db.service.findUnique({ where: { id: raw.id } });
      if (!svc) return bad(`Service not found: ${raw.id}`);
      resolved.push({ kind: "service", id: svc.id, name: svc.name, price: svc.price, qty });
    } else {
      const prod = await db.product.findUnique({ where: { id: raw.id } });
      if (!prod) return bad(`Product not found: ${raw.id}`);
      if (prod.stock < qty) return bad(`Not enough stock for ${prod.name} (${prod.stock} left)`, 409);
      resolved.push({ kind: "product", id: prod.id, name: prod.name, price: prod.price, qty });
    }
  }

  const subtotal = resolved.reduce((a, it) => a + it.price * it.qty, 0);
  const disc = typeof discount === "number" && discount > 0 ? Math.min(Math.round(discount), subtotal) : 0;
  const total = subtotal - disc + tipCents;

  // validate links
  let custId: string | null = null;
  if (typeof customerId === "string" && customerId) {
    const c = await db.customer.findUnique({ where: { id: customerId } });
    if (!c) return bad("Customer not found");
    custId = c.id;
  }
  let stId: string | null = null;
  if (typeof staffId === "string" && staffId) {
    const st = await db.staff.findUnique({ where: { id: staffId } });
    if (!st) return bad("Staff not found");
    stId = st.id;
  }
  if (typeof appointmentId === "string" && appointmentId) {
    const appt = await db.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) return bad("Appointment not found");
  }

  let sale;
  try {
    sale = await db.$transaction(async (tx) => {
      // Sequential receipt number — allocated INSIDE the tx, so two checkouts
      // racing each other can never pull the same number.
      const lastSale = await tx.sale.findFirst({ orderBy: { receiptNo: "desc" }, select: { receiptNo: true } });
      const lastNum = lastSale ? parseInt(lastSale.receiptNo.replace(/\D/g, ""), 10) || 0 : 0;
      const receiptNo = `SLN-${String(lastNum + 1).padStart(4, "0")}`;

      // Atomic stock guard — refuses to sell past zero no matter who clicks
      // first; the pre-check above is only for a friendly early error.
      for (const it of resolved.filter((r) => r.kind === "product")) {
        const moved = await tx.product.updateMany({
          where: { id: it.id, stock: { gte: it.qty } },
          data: { stock: { decrement: it.qty } },
        });
        if (moved.count === 0) {
          const prod = await tx.product.findUnique({ where: { id: it.id } });
          throw new Error(`STOCK:${prod?.name ?? it.id}:${prod?.stock ?? 0}`);
        }
      }

      const created = await tx.sale.create({
        data: {
          receiptNo,
          customerId: custId,
          staffId: stId,
          appointmentId: typeof appointmentId === "string" && appointmentId ? appointmentId : null,
          items: JSON.stringify(resolved),
          subtotal,
          discount: disc,
          tip: tipCents,
          total,
          method: method as string,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          staff: { select: { id: true, name: true } },
        },
      });
      if (typeof appointmentId === "string" && appointmentId) {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: "COMPLETED" },
        });
      }
      return created;
    });
  } catch (err) {
    const m = err instanceof Error && err.message.startsWith("STOCK:") ? err.message.split(":") : null;
    if (m) return bad(`Not enough stock for ${m[1]} (${m[2]} left)`, 409);
    throw err;
  }

  return ok({ ...sale, items: parseItems(sale.items) }, 201);
}
