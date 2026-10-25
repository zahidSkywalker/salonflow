/**
 * SalonFlow demo seed (CLI).
 * Destructive: clears all tables, then seeds the full Aurelia demo dataset.
 *
 * Run:  bun run db:seed     (or: npx tsx scripts/seed_salonflow.ts)
 */
import { PrismaClient } from "@prisma/client";
import { datasourceUrl } from "../src/lib/db";
import { seedDatabase } from "../src/lib/salonflow/seed-core";

const db = new PrismaClient({ datasourceUrl: datasourceUrl(), log: ["error"] });

async function main() {
  console.log("clearing tables…");
  await db.sale.deleteMany();
  await db.appointment.deleteMany();
  await db.product.deleteMany();
  await db.serviceStaff.deleteMany();
  await db.staff.deleteMany();
  await db.service.deleteMany();
  await db.customer.deleteMany();
  await db.setting.deleteMany();

  console.log("seeding Aurelia demo dataset…");
  const r = await seedDatabase(db);
  console.log(
    `seeded: ${r.services} services, ${r.staff} staff, ${r.customers} customers, ${r.appointments} appointments, ${r.sales} sales`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
