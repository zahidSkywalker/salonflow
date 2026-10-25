/**
 * SalonFlow demo seed — a salon that has actually been open for eight weeks.
 *
 * Everything is deterministic (fixed PRNG seed) so re-seeding produces the
 * same lived-in dataset: weekday busy patterns, Friday/Saturday rushes,
 * no-shows, tips, discounts, retail add-ons and a book of regulars with
 * notes a front desk would actually write.
 */
import type { PrismaClient } from "@prisma/client";
import { salonDaysAgo, salonClock } from "./time";

/* ── deterministic RNG ─────────────────────────────────────────────────── */
let s = 987654321;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;
function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, w) => a + w, 0);
  let roll = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* ── date helpers ──────────────────────────────────────────────────────── */
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();
// date strings are derived from the SALON's clock (set below), not the
// server's — a UTC server must not shift the living day mid-evening
const dayStr = (offset: number, tz: string) => salonDaysAgo(tz, offset);

/* ── reference data ────────────────────────────────────────────────────── */
// All photography ships inside the repo (public/images) — the product is
// self-contained: no hot-links, no external CDNs, works offline after install.
const IMG = "/images";

const SERVICES: [string, string, string, number, number, string, number][] = [
  // name, category, description, price, duration, image, popularity weight
  ["Signature Cut & Style", "Hair", "Consultation, precision cut, wash and a silk finish blow-dry.", 4500, 45, `${IMG}/services/signature-cut.jpg`, 10],
  ["Blowout & Soft Waves", "Hair", "Volume wash, heat-protected blowout and hand-formed waves.", 3500, 40, `${IMG}/services/blowout-waves.jpg`, 8],
  ["Keratin Repair Ritual", "Hair", "Deep bond-repair treatment for glossy, frizz-free hair for weeks.", 8500, 75, `${IMG}/services/keratin-ritual.jpg`, 4],
  ["Full Color Transformation", "Color", "Single-process color with gloss and take-home care plan.", 9500, 90, `${IMG}/services/full-color.jpg`, 4],
  ["Balayage & Highlights", "Color", "Hand-painted dimension, toner and bond shield included.", 14000, 120, `${IMG}/services/balayage.jpg`, 3],
  ["Root Touch-Up", "Color", "Fast regrowth coverage blended to your existing shade.", 5500, 45, `${IMG}/services/root-touchup.jpg`, 5],
  ["Classic Manicure", "Nails", "Shape, cuticle care, buff, hand massage and polish.", 2500, 30, `${IMG}/services/classic-manicure.jpg`, 8],
  ["Gel Nail Art", "Nails", "Long-wear gel with custom art — chrome, french or freehand.", 4500, 50, `${IMG}/services/gel-nail-art.jpg`, 6],
  ["Luxury Pedicure", "Nails", "Soak, callus care, scrub, mask and a perfect polish.", 4000, 45, `${IMG}/services/luxury-pedicure.jpg`, 5],
  ["Deep-Cleanse Facial", "Skin & Facial", "Double cleanse, extraction, lymph massage and mask.", 7000, 60, `${IMG}/services/deep-cleanse-facial.jpg`, 5],
  ["Glow Peel Ritual", "Skin & Facial", "Gentle AHA peel with calming serum for instant radiance.", 9500, 70, `${IMG}/services/glow-peel.jpg`, 3],
  ["Relaxing Body Massage", "Spa & Massage", "Full-body Swedish pressure tailored to your knots.", 9000, 60, `${IMG}/services/body-massage.jpg`, 5],
  ["Head & Scalp Ritual", "Spa & Massage", "Slow scalp therapy that melts screens and deadlines away.", 5000, 40, `${IMG}/services/scalp-ritual.jpg`, 4],
  ["Gentlemen's Cut", "Barber", "Scissor or clipper cut, hot towel finish and styling.", 3000, 30, `${IMG}/services/gentlemens-cut.jpg`, 9],
  ["Beard Sculpt & Shave", "Barber", "Line-up, hot-towel shave and beard oil finish.", 2500, 25, `${IMG}/services/beard-sculpt.jpg`, 7],
  ["Cut + Beard Combo", "Barber", "The full reset — cut, beard sculpt and towel finish.", 4800, 55, `${IMG}/services/cut-beard-combo.jpg`, 6],
];

// days-off staggered so the floor is covered every day of the week
const STAFF: [string, string, string, number, string, string[], string, number, number][] = [
  ["Isabella Moreau", "Master Stylist", "16 years behind the chair, trained in Paris. Cuts that grow out beautifully.", 12, `${IMG}/team/isabella.jpg`, ["Signature Cut & Style", "Blowout & Soft Waves", "Keratin Repair Ritual"], "0,2,3,4,5,6", 540, 1080],
  ["Sofia Laurent", "Senior Colorist", "Balayage specialist — dimension that looks like you were born with it.", 12, `${IMG}/team/sofia.jpg`, ["Full Color Transformation", "Balayage & Highlights", "Root Touch-Up", "Blowout & Soft Waves"], "0,1,2,3,4,5", 540, 1140],
  ["Maya Chen", "Lead Nail Artist", "Freehand art, chrome and clean gel work that lasts three weeks.", 10, `${IMG}/team/maya.jpg`, ["Classic Manicure", "Gel Nail Art", "Luxury Pedicure"], "1,2,3,4,5,6", 570, 1140],
  ["Amelia Rose", "Skin Therapist", "Results-driven facials with a spa-day soul. Sensitive skin welcome.", 10, `${IMG}/team/amelia.jpg`, ["Deep-Cleanse Facial", "Glow Peel Ritual"], "0,1,2,4,5,6", 600, 1110],
  ["Rosie Gallagher", "Spa Therapist", "Deep-pressure magic. Your shoulders will write you a thank-you note.", 10, `${IMG}/team/rosie.jpg`, ["Relaxing Body Massage", "Head & Scalp Ritual"], "0,1,2,3,5,6", 540, 1140],
  ["Marcus Cole", "Master Barber", "Classic barbering, modern lines. Hot towels always included.", 11, `${IMG}/team/marcus.jpg`, ["Gentlemen's Cut", "Beard Sculpt & Shave", "Cut + Beard Combo"], "0,2,3,4,5,6", 600, 1140],
];

// name, brand, price, stock, lowStockAt  — house & retail brands (fictional)
const PRODUCTS: [string, string, number, number, number][] = [
  ["Silk Atelier Bond Repair No.3", "Silk Atelier", 2800, 22, 5],
  ["Maison Gloss Finishing Oil", "Maison Gloss", 3400, 15, 4],
  ["Velvet & Vine Dry Shampoo", "Velvet & Vine", 2400, 3, 5],
  ["Nordlys Scalp Serum", "Nordlys", 3900, 9, 4],
  ["Bloom Lab Ceramide Cream", "Bloom Lab", 2200, 18, 5],
  ["Copper Leaf Hand Balm", "Copper Leaf", 1600, 2, 6],
  ["Aurelia Beard Oil No.1", "Aurelia Home", 1800, 12, 4],
  ["Halo Ritual Leave-In Mist", "Halo Ritual", 2600, 0, 5],
  ["Terra Clay Purifying Mask", "Terra", 2900, 8, 4],
  ["Fox & Fern Matte Pomade", "Fox & Fern", 2100, 14, 4],
];

const CUSTOMERS: [string, string, string | null][] = [
  ["Charlotte Reeves", "+1 555 201 3341", "Prefers cool-toned color. Allergic to almond oil."],
  ["Amara Osei", "+1 555 318 7720", "Loves bold nail art, monthly visit."],
  ["Priya Patel", "+1 555 447 1082", "Sensitive scalp — gentle products only."],
  ["James Whitfield", "+1 555 512 9931", "Classic taper, every 3 weeks."],
  ["Sofia Marchetti", "+1 555 623 4410", "Bridal trial booked for spring."],
  ["Daniel Kim", "+1 555 704 2218", null],
  ["Fatima Noor", "+1 555 819 6653", "Keratin every 4 months."],
  ["Grace Müller", "+1 555 930 7821", null],
  ["Omar Haddad", "+1 555 066 5514", "Beard line-up weekly."],
  ["Elena Petrova", "+1 555 177 0928", "Referred by Maya's client book."],
  ["Aisha Bello", "+1 555 233 8451", "Silk press specialist book with Isabella."],
  ["Tomás Rivera", "+1 555 344 9176", "Skin fade, no beard trim."],
  ["Hannah Goldberg", "+1 555 455 0627", "Never books Fridays after 5 — school run."],
  ["Yuki Tanaka", "+1 555 566 1783", "Speaks softly — confirm order before cutting."],
  ["Nadia Karim", "+1 555 677 2894", "Highlights every 10 weeks like clockwork."],
  ["Robert Osei", "+1 555 788 3905", null],
  ["Leila Haddad", "+1 555 899 4016", "Bring green tea — she asks every time."],
  ["Marcus Bell", "+1 555 910 5127", "Runs the book club — send him promo cards."],
  ["Freya Lindqvist", "+1 555 021 6238", "Allergic to lavender. Use Nordlys line."],
  ["Diego Fernández", "+1 555 132 7349", null],
  ["Anika Sharma", "+1 555 243 8460", "Wedding in June — color trials started."],
  ["Peter Novak", "+1 555 354 9571", "Beard oil every visit."],
  ["Zainab Ali", "+1 555 465 0682", "Prefers early morning slots."],
  ["Louis Dubois", "+1 555 576 1793", null],
  ["Imani Wright", "+1 555 687 2804", "Gel removal before every new set."],
  ["Kenji Sato", "+1 555 798 3915", "Books two back-to-back barber slots."],
  ["Clara Whitmore", "+1 555 809 4026", "Keratin — no layered cut."],
  ["Ravi Desai", "+1 555 910 5137", null],
  ["Nour El-Sayed", "+1 555 021 6248", "Scalp sensitive — lukewarm water only."],
  ["Grace Okafor", "+1 555 132 7359", "Sister of Amara — family discount agreed."],
  ["Henrik Larsen", "+1 555 243 8469", "Only sees Marcus. Waits if needed."],
  ["Beatriz Costa", "+1 555 354 9570", "Blowout before every event — heavy season."],
  ["Samuel Adeyemi", "+1 555 465 0681", null],
  ["Ingrid Bauer", "+1 555 576 1792", "Pedicure monthly, hates sharp tools."],
  ["Tariq Mahmood", "+1 555 687 2803", "Prefers phone bookings, not online."],
  ["Lucia Romano", "+1 555 798 3914", "Color client since opening week."],
  ["Ethan Brooks", "+1 555 809 4025", null],
  ["Amelia Torres", "+1 555 910 5136", "Bring her the style magazine stack."],
  ["Kofi Mensah", "+1 555 021 6247", "Sponge curls — do not cut top short."],
  ["Sara Lindberg", "+1 555 132 7358", "Facial every 6 weeks with Amelia."],
  ["David Park", "+1 555 243 8468", null],
  ["Mila Jovanović", "+1 555 354 9579", "Wants bangs grown out — don't ask again."],
  ["Hassan Rana", "+1 555 465 0679", "Sensitivity to strong fragrance."],
  ["Josephine Clarke", "+1 555 576 1791", "Tea on arrival, regular since day one."],
];

/* ── shared row types ──────────────────────────────────────────────────── */
type SvcRow = { id: string; name: string; price: number; durationMin: number; weight: number };
type StaffRow = { id: string; name: string; serviceNames: string[]; days: Set<number>; start: number; end: number };
type BusyMap = Map<string, Array<[number, number]>>; // `${staffId}|${date}` → intervals

/* ── receipt numbering: the shop didn't open yesterday ─────────────────── */
let receiptCounter = 1006;
const receiptNo = () => `SLN-${pad(++receiptCounter).padStart(4, "0")}`;

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const usedRefs = new Set<string>();
const nextRef = () => {
  let ref = "";
  do {
    ref = "SA-" + Array.from({ length: 5 }, () => REF_CHARS[Math.floor(rnd() * REF_CHARS.length)]).join("");
  } while (usedRefs.has(ref));
  usedRefs.add(ref);
  return ref;
};

/* ── the seed itself ───────────────────────────────────────────────────── */
export async function seedDatabase(db: PrismaClient) {
  // One transaction for the whole seed: a lambda killed mid-seed leaves NO
  // half-written database behind — the next boot simply seeds again.
  return db.$transaction(async (tx) => {
  // wipe (children first)
  await tx.sale.deleteMany();
  await tx.appointment.deleteMany();
  await tx.product.deleteMany();
  await tx.serviceStaff.deleteMany();
  await tx.staff.deleteMany();
  await tx.service.deleteMany();
  await tx.customer.deleteMany();
  await tx.setting.deleteMany();

  const settingRow = await tx.setting.create({
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
      closedDays: "", // open all week — days off are staggered per specialist
      adminPin: "aurelia2024",
      heroImage: `${IMG}/hero.jpg`,
      galleryJson: JSON.stringify([
        { url: `${IMG}/gallery/g-styling-floor.jpg`, caption: "The styling floor" },
        { url: `${IMG}/gallery/g-mirror-suite.jpg`, caption: "The mirror suite" },
        { url: `${IMG}/gallery/g-morning-rush.jpg`, caption: "A Friday morning" },
        { url: `${IMG}/gallery/g-team-day.jpg`, caption: "The team, off the clock" },
        { url: `${IMG}/gallery/g-maintained.jpg`, caption: "Tools maintained daily" },
        { url: `${IMG}/gallery/g-tool-wall.jpg`, caption: "The tool wall" },
      ]),
    },
  });

  const tz = settingRow.timeZone || "America/New_York";

  /* services */
  const svcRows: Record<string, SvcRow> = {};
  for (let i = 0; i < SERVICES.length; i++) {
    const [name, category, description, price, durationMin, imageUrl, weight] = SERVICES[i];
    const row = await tx.service.create({
      data: { name, category, description, price, durationMin, imageUrl, sortOrder: i },
    });
    svcRows[name] = { id: row.id, name, price, durationMin, weight };
  }
  const svcNames = SERVICES.map((x) => x[0]);

  /* staff + service links */
  const staffRows: StaffRow[] = [];
  for (let i = 0; i < STAFF.length; i++) {
    const [name, title, bio, commissionPct, imageUrl, svcList, days, start, end] = STAFF[i];
    const row = await tx.staff.create({
      data: {
        name, title, bio, commissionPct, imageUrl,
        workingDays: days, shiftStartMin: start, shiftEndMin: end, sortOrder: i,
      },
    });
    staffRows.push({ id: row.id, name, serviceNames: svcList, days: new Set(days.split(",").map(Number)), start, end });
    for (const sn of svcList) {
      await tx.serviceStaff.create({ data: { staffId: row.id, serviceId: svcRows[sn].id } });
    }
  }

  /* products */
  const productIds: Record<string, string> = {};
  for (const [name, brand, price, stock, lowStockAt] of PRODUCTS) {
    const row = await tx.product.create({ data: { name, brand, price, stock, lowStockAt } });
    productIds[name] = row.id;
  }

  /* customers */
  const custIds: string[] = [];
  for (const [name, phone, notes] of CUSTOMERS) {
    const handle = name.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(Boolean);
    const email = `${handle[0]}.${handle[1] ?? "guest"}${ri(10, 99)}@${["gmail.com", "outlook.com", "icloud.com", "yahoo.com"][ri(0, 3)]}`;
    const row = await tx.customer.create({ data: { name, phone, notes, email } });
    custIds.push(row.id);
  }

  /* staff eligibility per service + weighted pools */
  const staffFor = (svcName: string) => staffRows.filter((st) => st.serviceNames.includes(svcName));
  const pickStaffFor = (svcName: string) => {
    const pool = staffFor(svcName);
    return pool[ri(0, pool.length - 1)];
  };

  const busy: BusyMap = new Map();
  const free = (staffId: string, date: string, start: number, end: number) => {
    const key = `${staffId}|${date}`;
    const list = busy.get(key) ?? [];
    return !list.some(([s, e]) => start < e + 10 && end + 10 > s); // 10-min turnaround buffer
  };
  const mark = (staffId: string, date: string, start: number, end: number) => {
    const key = `${staffId}|${date}`;
    (busy.get(key) ?? busy.set(key, []).get(key)!).push([start, end]);
  };

  type ApptInsert = {
    ref: string; customerId: string; staffId: string; serviceId: string;
    date: string; startMin: number; endMin: number; status: string; source: string;
  };
  type SaleInsert = {
    receiptNo: string; customerId: string | null; staffId: string | null;
    apptRef: string | null; // resolved to a real appointment id after insertion
    items: string; subtotal: number; discount: number; tip: number; total: number;
    method: string; createdAt: Date;
  };
  const appts: ApptInsert[] = [];
  const sales: SaleInsert[] = [];

  const pickCustomer = () => custIds[ri(0, custIds.length - 1)];

  function planAppointment(date: string, status: string, source?: string): ApptInsert | null {
    const svcName = weighted(svcNames, svcNames.map((n) => svcRows[n].weight));
    const svc = svcRows[svcName];
    const st = pickStaffFor(svcName);
    if (!st.days.has(weekdayOf(date))) return null;
    for (let tries = 0; tries < 6; tries++) {
      const start = st.start + ri(0, Math.floor((st.end - st.start - svc.durationMin) / 30)) * 30;
      const end = start + svc.durationMin;
      if (end > st.end) continue;
      if (!free(st.id, date, start, end)) continue;
      mark(st.id, date, start, end);
      return {
        ref: nextRef(), customerId: pickCustomer(), staffId: st.id, serviceId: svc.id,
        date, startMin: start, endMin: end, status, source: source ?? weighted(["ONLINE", "ADMIN", "WALK_IN", "ONLINE"], [5, 3, 2, 5]),
      };
    }
    return null;
  }

  function planSale(date: string, linked?: { appt: ApptInsert; svc: SvcRow }, walkIn = false): SaleInsert {
    const items: { kind: "service" | "product"; id: string; name: string; price: number; qty: number }[] = [];
    let staffId: string | null = null;

    if (linked) {
      items.push({ kind: "service", id: linked.svc.id, name: linked.svc.name, price: linked.svc.price, qty: 1 });
      staffId = linked.appt.staffId;
    } else if (chance(0.45)) {
      // walk-in service sale
      const svcName = weighted(svcNames, svcNames.map((n) => svcRows[n].weight));
      const svc = svcRows[svcName];
      const st = pickStaffFor(svcName);
      staffId = st.id;
      items.push({ kind: "service", id: svc.id, name: svc.name, price: svc.price, qty: 1 });
    }

    // retail attach: service clients often take a product home
    const retailTries = linked ? 1 : 2;
    for (let t = 0; t < retailTries; t++) {
      if (items.length > 0 ? chance(0.28) : chance(0.8)) {
        const prod = PRODUCTS[ri(0, PRODUCTS.length - 1)];
        if (!items.some((i) => i.name === prod[0])) {
          items.push({ kind: "product", id: productIds[prod[0]], name: prod[0], price: prod[2], qty: chance(0.15) ? 2 : 1 });
        }
      }
    }
    if (items.length === 0) {
      const svcName = weighted(svcNames, svcNames.map((n) => svcRows[n].weight));
      const svc = svcRows[svcName];
      const st = pickStaffFor(svcName);
      staffId = st.id;
      items.push({ kind: "service", id: svc.id, name: svc.name, price: svc.price, qty: 1 });
    }

    const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
    const discount = chance(0.12) ? (chance(0.3) ? 1000 : 500) : 0;
    const method = weighted(["CARD", "CASH", "MOBILE"], [11, 6, 3]);
    const tip = method === "CASH"
      ? chance(0.3) ? ri(2, 6) * 100 : 0
      : chance(0.55) ? Math.round((subtotal - discount) * (weighted([0.1, 0.15, 0.18, 0.2], [3, 6, 2, 2]))) : 0;

    return {
      receiptNo: receiptNo(),
      customerId: walkIn && chance(0.5) ? null : pickCustomer(),
      staffId,
      apptRef: linked ? linked.appt.ref : null,
      items: JSON.stringify(items),
      subtotal, discount, tip, total: subtotal - discount + tip,
      method,
      createdAt: new Date(`${date}T${pad(ri(9, 18))}:${pad(ri(0, 59))}:00`),
    };
  }

  /* ── eight weeks of history ─────────────────────────────────────────── */
  for (let off = -56; off <= -1; off++) {
    const date = dayStr(off, tz);
    const wd = weekdayOf(date);
    const rush = wd === 5 || wd === 6 ? 1.9 : wd === 1 ? 0.7 : wd === 0 ? 0.55 : 1; // Fri/Sat rush, quiet Mon & Sun
    const n = Math.round((6 + ri(0, 5)) * rush);
    const dayAppts: ApptInsert[] = [];
    for (let k = 0; k < n; k++) {
      const roll = rnd();
      const status = roll < 0.035 ? "NO_SHOW" : roll < 0.075 ? "CANCELLED" : "COMPLETED";
      const a = planAppointment(date, status);
      if (a) dayAppts.push(a);
    }
    appts.push(...dayAppts);
    for (const a of dayAppts) {
      if (a.status === "COMPLETED") {
        const svc = Object.values(svcRows).find((sv) => sv.id === a.serviceId)!;
        sales.push(planSale(date, { appt: a, svc }));
      }
    }
    // walk-in retail / quick service sales the book never saw
    const extra = Math.round(ri(0, 3) * rush);
    for (let k = 0; k < extra; k++) sales.push(planSale(date, undefined, true));
  }

  /* ── today: a living day — statuses relative to the current minute ──── */
  const today = dayStr(0, tz);
  const nm = salonClock(tz).min;
  const todayAppts: ApptInsert[] = [];
  for (let k = 0; k < 9; k++) {
    const a = planAppointment(today, "CONFIRMED");
    if (a) todayAppts.push(a);
  }
  // order them and assign statuses by wall-clock
  todayAppts.sort((a, b) => a.startMin - b.startMin);
  for (const a of todayAppts) {
    a.status = a.endMin <= nm - 15
      ? (chance(0.08) ? "NO_SHOW" : "COMPLETED")
      : a.startMin <= nm + 20 ? "CONFIRMED" : chance(0.25) ? "PENDING" : "CONFIRMED";
    if (a.status === "COMPLETED") {
      const svc = Object.values(svcRows).find((sv) => sv.id === a.serviceId)!;
      sales.push(planSale(today, { appt: a, svc }));
    }
  }
  appts.push(...todayAppts);
  // a couple of walk-in retail sales so the register never looks untouched
  sales.push(planSale(today, undefined, true));
  sales.push(planSale(today, undefined, true));

  /* ── next seven days of bookings ────────────────────────────────────── */
  for (let off = 1; off <= 7; off++) {
    const date = dayStr(off, tz);
    const n = ri(3, 7);
    for (let k = 0; k < n; k++) {
      const a = planAppointment(date, chance(0.3) ? "PENDING" : "CONFIRMED", "ONLINE");
      if (a) appts.push(a);
    }
  }

  /* ── write everything ───────────────────────────────────────────────── */
  {
    const idByRef: Record<string, string> = {};
    for (const a of appts) {
      const row = await tx.appointment.create({ data: a });
      idByRef[a.ref] = row.id;
    }
    for (const sl of sales) {
      const { apptRef, ...data } = sl;
      await tx.sale.create({ data: { ...data, appointmentId: apptRef ? idByRef[apptRef] ?? null : null } });
    }
  }

  return {
    services: SERVICES.length,
    staff: STAFF.length,
    customers: CUSTOMERS.length,
    appointments: appts.length,
    sales: sales.length,
  };
  }, { timeout: 60_000, maxWait: 10_000 });
}
