/**
 * CLI wrapper around the shared seed module.
 * Run: bun scripts/seed_salonflow.ts   (or: npm run db:seed)
 */
import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../src/lib/salonflow/seed";

const db = new PrismaClient();

seedDatabase(db)
  .then((r) => {
    console.log(
      `✅ seeded: ${r.services} services, ${r.staff} staff, ${r.customers} customers, ${r.appointments} appointments, ${r.sales} sales`
    );
  })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
