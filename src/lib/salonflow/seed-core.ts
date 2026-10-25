/**
 * SalonFlow seed — shared demo-data engine.
 * Used by:
 *  - scripts/seed_salonflow.ts (CLI: `bun run db:seed` — destructive re-seed)
 *  - src/lib/salonflow/bootstrap.ts (runtime bootstrap on fresh serverless DBs)
 *
 * Deterministic PRNG so re-seeding produces stable reports.
 * Images reference /salon-img/* shipped in public/, no external hotlinks.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

let s = 42;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const dayStr = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return iso(d);
};

const ref = () =>
  "SA-" + Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[ri(0, 31)]).join("");

const IMG = "/salon-img";

type Svc = [string, string, string, number, number, string];
const SERVICES: Svc[] = [
  ["Signature Cut & Style", "Hair", "Consultation, precision cut, wash and a silk finish blow-dry.", 4500, 45, `${IMG}/4cd8e07d4d7f.jpg`],
  ["Blowout & Soft Waves", "Hair", "Volume wash, heat-protected blowout and hand-formed waves.", 3500, 40, `${IMG}/959f862065f9.jpg`],
  ["Keratin Repair Ritual", "Hair", "Deep bond-repair treatment for glossy, frizz-free hair for weeks.", 8500, 75, `${IMG}/4fc4c6f11b38.jpg`],
  ["Full Color Transformation", "Color", "Single-process color with gloss and take-home care plan.", 9500, 90, `${IMG}/24a098f0d610.jpg`],
  ["Balayage & Highlights", "Color", "Hand-painted dimension, toner and bond shield included.", 14000, 120, `${IMG}/d8fe78cb1b16.jpg`],
  ["Root Touch-Up", "Color", "Fast regrowth coverage blended to your existing shade.", 5500, 45, `${IMG}/aec32208ec03.jpg`],
  ["Classic Manicure", "Nails", "Shape, cuticle care, buff, hand massage and polish.", 2500, 30, `${IMG}/28b7d040ba52.jpg`],
  ["Gel Nail Art", "Nails", "Long-wear gel with custom art — chrome, french or freehand.", 4500, 50, `${IMG}/cd15e385424d.jpg`],
  ["Luxury Pedicure", "Nails", "Soak, callus care, scrub, mask and a perfect polish.", 4000, 45, `${IMG}/bad12dba44bd.jpg`],
  ["Deep-Cleanse Facial", "Skin & Facial", "Double cleanse, extraction, lymph massage and mask.", 7000, 60, `${IMG}/58c73728fd73.jpg`],
  ["Glow Peel Ritual", "Skin & Facial", "Gentle AHA peel with calming serum for instant radiance.", 9500, 70, `${IMG}/f483f6071c05.jpg`],
  ["Relaxing Body Massage", "Spa & Massage", "Full-body Swedish pressure tailored to your knots.", 9000, 60, `${IMG}/7e31671436f7.jpg`],
  ["Head & Scalp Ritual", "Spa & Massage", "Slow scalp therapy that melts screens and deadlines away.", 5000, 40, `${IMG}/18e5dfcd8c3a.jpg`],
  ["Gentlemen's Cut", "Barber", "Scissor or clipper cut, hot towel finish and styling.", 3000, 30, `${IMG}/3ba7e93a33a9.jpg`],
  ["Beard Sculpt & Shave", "Barber", "Line-up, hot-towel shave and beard oil finish.", 2500, 25, `${IMG}/da491ac4d4cd.jpg`],
  ["Cut + Beard Combo", "Barber", "The full reset — cut, beard sculpt and towel finish.", 4800, 55, `${IMG}/3ba7e93a33a9.jpg`],
];

type Stf = [string, string, string, number, string, string[]];
const STAFF: Stf[] = [
  ["Isabella Moreau", "Master Stylist", "16 years behind the chair, trained in Paris. Cuts that grow out beautifully.", 12, `${IMG}/ce71d92e45ea.jpg`,
    ["Signature Cut & Style", "Blowout & Soft Waves", "Keratin Repair Ritual"]],
  ["Sofia Laurent", "Senior Colorist", "Balayage specialist — dimension that looks like you were born with it.", 12, `${IMG}/da0d8f17ddb6.jpg`,
    ["Full Color Transformation", "Balayage & Highlights", "Root Touch-Up", "Blowout & Soft Waves"]],
  ["Maya Chen", "Lead Nail Artist", "Freehand art, chrome and clean gel work that lasts three weeks.", 10, `${IMG}/ef7173c23122.jpg`,
    ["Classic Manicure", "Gel Nail Art", "Luxury Pedicure"]],
  ["Amelia Rose", "Skin Therapist", "Results-driven facials with a spa-day soul. Sensitive skin welcome.", 10, `${IMG}/449394276a77.jpg`,
    ["Deep-Cleanse Facial", "Glow Peel Ritual"]],
  ["Daniya Rahman", "Spa Therapist", "Deep-pressure magic. Your shoulders will write you a thank-you note.", 10, `${IMG}/dfd317da3383.jpg`,
    ["Relaxing Body Massage", "Head & Scalp Ritual"]],
  ["Marcus Cole", "Master Barber", "Classic barbering, modern lines. Hot towels always included.", 11, `${IMG}/6b44f125712f.jpg`,
    ["Gentlemen's Cut", "Beard Sculpt & Shave", "Cut + Beard Combo"]],
];

const PRODUCTS: [string, string, number, number][] = [
  ["Olaplex No.3 Hair Perfector", "Olaplex", 2800, 24],
  ["Moroccanoil Treatment Light", "Moroccanoil", 3400, 18],
  ["Kérastase Elixir Ultime", "Kérastase", 4200, 12],
  ["Living Proof Dry Shampoo", "Living Proof", 2600, 20],
  ["CeraVe Hydrating Cleanser", "CeraVe", 1500, 30],
  ["The Ordinary Niacinamide", "The Ordinary", 1200, 26],
  ["Bumble & bumble Hairdresser's Oil", "Bumble and bumble", 3200, 10],
  ["Aurelia Beard Oil No.1", "Aurelia Home", 1800, 15],
];

const CUSTOMERS: [string, string, string | null][] = [
  ["Charlotte Reeves", "+1 555 201 3341", "Prefers cool-toned color. Allergic to almond oil."],
  ["Amara Osei", "+1 555 318 7720", "Loves bold nail art, monthly visit."],
  ["Priya Patel", "+1 555 447 1082", "Sensitive scalp — gentle products only."],
  ["James Whitfield", "+1 555 512 9931", "Classic taper, every 3 weeks."],
  ["Sofia Marchetti", "+1 555 623 4410", "Bridal trial in spring."],
  ["Daniel Kim", "+1 555 704 2218", null],
  ["Fatima Noor", "+1 555 819 6653", "Keratin every 4 months."],
  ["Grace Müller", "+1 555 930 7821", null],
  ["Omar Haddad", "+1 555 066 5514", "Beard line-up weekly."],
  ["Elena Petrova", "+1 555 177 0928", "Refer-a-friend: Maya."],
];

/** Seeds a fresh/empty database with the full Aurelia demo dataset. */
export async function seedDatabase(db: PrismaClient) {
  await db.setting.create({
    data: {
      id: "main",
      salonName: "Aurelia Salon & Spa",
      tagline: "Where beauty becomes ritual",
      about:
        "Aurelia is a boutique salon and spa built on one belief: great hair and glowing skin should feel effortless. Our master stylists, colorists and therapists bring 40+ years of combined craft to every chair — using premium, cruelty-free products in a space designed for you to exhale.",
      address: "12 Rosewood Avenue, Downtown District",
      phone: "+1 (555) 012-3456",
      email: "hello@aurelia-salon.com",
      currencySymbol: "$",
      openMin: 540,
      closeMin: 1140,
      slotStepMin: 15,
      closedDays: "0",
      adminPin: "aurelia2024",
      heroImage: `${IMG}/929df5bc6d89.jpg`,
      galleryJson: JSON.stringify([
        { url: `${IMG}/0a31f5f65edc.jpg`, caption: "The styling floor" },
        { url: `${IMG}/1f7c8708a3a0.jpg`, caption: "Color bar" },
        { url: `${IMG}/88b1443a4f3e.jpg`, caption: "Golden hour chairs" },
        { url: `${IMG}/bf1671d4931d.jpg`, caption: "Mirror suite" },
        { url: `${IMG}/bc9844d143fb.jpg`, caption: "Detail corner" },
        { url: `${IMG}/da491ac4d4cd.jpg`, caption: "The gentleman's corner" },
      ]),
    },
  });

  const svcRows: Record<string, { id: string; name: string; price: number; durationMin: number }> = {};
  for (let i = 0; i < SERVICES.length; i++) {
    const [name, category, description, price, durationMin, imageUrl] = SERVICES[i];
    const row = await db.service.create({
      data: { name, category, description, price, durationMin, imageUrl, sortOrder: i },
    });
    svcRows[name] = { id: row.id, name, price, durationMin };
  }

  const staffRows: Record<string, string> = {};
  const serviceStaff: { staffId: string; serviceId: string }[] = [];
  for (let i = 0; i < STAFF.length; i++) {
    const [name, title, bio, commissionPct, imageUrl, svcNames] = STAFF[i];
    const row = await db.staff.create({
      data: {
        name, title, bio, commissionPct, imageUrl,
        workingDays: i === 4 ? "1,2,3,4,5" : "1,2,3,4,5,6",
        shiftStartMin: i === 5 ? 600 : 540, // barber starts at 10:00
        shiftEndMin: i === 0 ? 1080 : 1140,
        sortOrder: i,
      },
    });
    staffRows[name] = row.id;
    for (const sn of svcNames) serviceStaff.push({ staffId: row.id, serviceId: svcRows[sn].id });
  }
  await db.serviceStaff.createMany({ data: serviceStaff });

  for (const [name, brand, price, stock] of PRODUCTS) {
    await db.product.create({ data: { name, brand, price, stock } });
  }

  const custRows: Record<string, string> = {};
  for (const [name, phone, notes] of CUSTOMERS) {
    const row = await db.customer.create({
      data: { name, phone, notes, email: `${name.split(" ")[0].toLowerCase()}@example.com` },
    });
    custRows[name] = row.id;
  }

  const staffNames = Object.keys(staffRows);
  const custNames = Object.keys(custRows);
  // service → list of staff names who can perform it
  const svcStaff: Record<string, string[]> = {};
  for (const [staffName, , , , , svcNames] of STAFF) {
    for (const sv of svcNames) (svcStaff[sv] ||= []).push(staffName);
  }

  // ── appointments & sales, collected then bulk-inserted for speed ──────────
  type ApptRow = Prisma.AppointmentCreateManyInput;
  type SaleRow = Prisma.SaleCreateManyInput;
  const appts: ApptRow[] = [];
  const sales: SaleRow[] = [];
  let receiptCounter = 0;
  const statusesOpen = ["CONFIRMED", "CONFIRMED", "PENDING"];

  const mkAppt = (
    date: string, svcName: string, staffName: string, custName: string,
    startMin: number, status: string, source: string
  ) => {
    const svc = svcRows[svcName];
    appts.push({
      ref: ref(), customerId: custRows[custName], staffId: staffRows[staffName],
      serviceId: svc.id, date, startMin, endMin: startMin + svc.durationMin,
      status, source,
    });
  };

  // past 27 days: completed history + matching sales (the report engine's fuel)
  for (let off = -27; off <= -1; off++) {
    const date = dayStr(off);
    const wd = new Date(date + "T12:00:00").getDay();
    if (wd === 0) continue; // closed Sundays
    const n = ri(4, 7);
    for (let k = 0; k < n; k++) {
      const svcName = pick(Object.keys(svcRows));
      const staffName = pick(svcStaff[svcName]);
      const custName = pick(custNames);
      const startMin = 540 + ri(0, 16) * 30;
      if (startMin + svcRows[svcName].durationMin > 1140) continue;
      mkAppt(date, svcName, staffName, custName, startMin, "COMPLETED", pick(["ONLINE", "ADMIN", "WALK_IN"]));
    }
    const salesToday = ri(3, 6);
    for (let k = 0; k < salesToday; k++) {
      const svcName = pick(Object.keys(svcRows));
      const staffName = pick(svcStaff[svcName]);
      const svc = svcRows[svcName];
      const prodName = pick(PRODUCTS)[0];
      const prod = PRODUCTS.find((p) => p[0] === prodName)!;
      const items = [{ kind: "service", id: svc.id, name: svc.name, price: svc.price, qty: 1 }];
      if (rnd() < 0.3) items.push({ kind: "product", id: "seed-" + prodName, name: prodName, price: prod[2], qty: 1 });
      const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
      const discount = rnd() < 0.15 ? 500 : 0;
      sales.push({
        receiptNo: `SLN-${pad(++receiptCounter).padStart(4, "0")}`,
        customerId: custRows[pick(custNames)], staffId: staffRows[staffName],
        items: JSON.stringify(items), subtotal, discount, total: subtotal - discount,
        method: pick(["CASH", "CARD", "CARD", "MOBILE"]),
        createdAt: new Date(`${date}T${pad(10 + ri(0, 8))}:${pad(ri(0, 59))}:00`),
      });
    }
  }

  // today: a living day at the salon
  const t = dayStr(0);
  mkAppt(t, "Signature Cut & Style", "Isabella Moreau", "Charlotte Reeves", 540, "COMPLETED", "ONLINE");
  mkAppt(t, "Classic Manicure", "Maya Chen", "Amara Osei", 570, "COMPLETED", "WALK_IN");
  mkAppt(t, "Balayage & Highlights", "Sofia Laurent", "Priya Patel", 600, "CONFIRMED", "ONLINE");
  mkAppt(t, "Gentlemen's Cut", "Marcus Cole", "James Whitfield", 660, "CONFIRMED", "ADMIN");
  mkAppt(t, "Deep-Cleanse Facial", "Amelia Rose", "Sofia Marchetti", 720, "CONFIRMED", "ONLINE");
  mkAppt(t, "Gel Nail Art", "Maya Chen", "Fatima Noor", 780, "CONFIRMED", "ONLINE");
  mkAppt(t, "Relaxing Body Massage", "Daniya Rahman", "Grace Müller", 840, "PENDING", "ONLINE");
  mkAppt(t, "Cut + Beard Combo", "Marcus Cole", "Omar Haddad", 900, "CONFIRMED", "WALK_IN");
  mkAppt(t, "Blowout & Soft Waves", "Isabella Moreau", "Elena Petrova", 960, "PENDING", "ONLINE");
  const tItems = [
    [{ kind: "service", id: svcRows["Signature Cut & Style"].id, name: "Signature Cut & Style", price: 4500, qty: 1 }],
    [{ kind: "service", id: svcRows["Classic Manicure"].id, name: "Classic Manicure", price: 2500, qty: 1 },
     { kind: "product", id: "seed-Olaplex No.3 Hair Perfector", name: "Olaplex No.3 Hair Perfector", price: 2800, qty: 1 }],
  ];
  for (const items of tItems) {
    const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
    sales.push({
      receiptNo: `SLN-${pad(++receiptCounter).padStart(4, "0")}`,
      customerId: custRows[pick(custNames)], staffId: staffRows[pick(staffNames)],
      items: JSON.stringify(items), subtotal, discount: 0, total: subtotal,
      method: pick(["CARD", "CASH"]), createdAt: new Date(),
    });
  }

  // next 6 days: upcoming bookings
  for (let off = 1; off <= 6; off++) {
    const date = dayStr(off);
    const wd = new Date(date + "T12:00:00").getDay();
    if (wd === 0) continue;
    const n = ri(2, 4);
    for (let k = 0; k < n; k++) {
      const svcName = pick(Object.keys(svcRows));
      const candidates = svcStaff[svcName];
      mkAppt(date, svcName, pick(candidates), pick(custNames),
        540 + ri(0, 14) * 30, pick(statusesOpen), "ONLINE");
    }
  }

  await db.appointment.createMany({ data: appts });
  await db.sale.createMany({ data: sales });

  return {
    services: SERVICES.length, staff: STAFF.length, customers: CUSTOMERS.length,
    appointments: appts.length, sales: sales.length,
  };
}
