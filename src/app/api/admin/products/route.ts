import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const products = await db.product.findMany({ orderBy: { name: "asc" } });
  return ok({ products });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");
  const { name, brand, price, stock, lowStockAt } = b as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 2) return bad("Product name required");
  if (typeof price !== "number" || price < 0) return bad("Price must be a positive number (cents)");
  const product = await db.product.create({
    data: {
      name: name.trim(),
      brand: typeof brand === "string" ? brand.trim() : "",
      price: Math.round(price),
      stock: typeof stock === "number" && stock >= 0 ? Math.round(stock) : 0,
      lowStockAt: typeof lowStockAt === "number" && lowStockAt >= 0 ? Math.round(lowStockAt) : 4,
    },
  });
  return ok(product, 201);
}
