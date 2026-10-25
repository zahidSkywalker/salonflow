# SalonFlow — Salon & Barber Booking + POS

A complete, single-salon operating system: a public booking storefront for guests and a
full admin panel (appointments, POS, customers, staff, reports) for the owner.
Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite**.

Perfect as a ready-to-sell product: single-file SQLite database (no external DB server),
whitelabel branding, zero external image/API dependencies, and clean source structure.

## What's inside

**Guest storefront (`/`)**
- Editorial hero, service menu with categories, team, gallery, opening hours
- 4-step booking wizard: service → specialist (or first available) → date & time → details
- Live slot engine (shifts, closed days, lead time, double-booking protection)
- Self-service: guests look up and cancel bookings with a reference code (e.g. `SA-PT57W`)

**Admin panel (`/#/admin`)**
- Dashboard: revenue, occupancy, today's schedule with quick actions
- Appointments: filters, search, status flow (confirm / complete / no-show / cancel)
- POS: services + retail products, discounts, cash/card/mobile, printable receipts
- Customers: visit history, lifetime spend, notes
- Staff: shifts, working days, per-staff commission %, services they perform
- Services: menu manager with pricing, duration, images
- Reports: revenue trends, category split, payment methods, top services, commissions
- Settings: whitelabel name/tagline/hero, hours, slot interval, closed days, PIN

## Quick start

```bash
npm install        # or: bun install / pnpm install
npm run db:push    # create the SQLite schema (db/custom.db)
npm run dev        # http://localhost:3000
```

The repo ships with a **pre-seeded demo database** (`db/custom.db`), so the app is fully
populated on first run. For a fresh dataset with dates relative to *today*:

```bash
npm run db:seed
```

## Demo access

| Area  | Where      | Credential         |
| ----- | ---------- | ------------------ |
| Guest | `/`        | no login needed    |
| Owner | `/#/admin` | PIN: `aurelia2024` |

The demo salon (Aurelia Salon & Spa) includes 16 services, 6 specialists, 10 customers,
~160 appointments and ~100 sales across a 30-day window so every report shows
meaningful data. Change everything in **Admin → Settings** to whitelabel the product.

## Tech stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 16 (App Router, TypeScript strict)    |
| UI         | Tailwind CSS 4 + shadcn/ui + Lucide icons     |
| Database   | SQLite via Prisma ORM (single file, zero ops) |
| Auth       | PIN → SHA-256 token, HTTP-only cookie         |
| Images     | Self-hosted in `public/salon-img` (no hotlinks) |

## Project structure

```
src/
  app/                    # route shell + 24 API route handlers
    api/public/…          #   storefront: site, availability, bookings, cancel
    api/admin/…           #   dashboard, appointments, POS, sales, reports, CRUD, settings
  components/salonflow/   # public storefront + booking wizard + admin views
  lib/salonflow/          # auth, slot engine, time utils, seed, runtime bootstrap
  instrumentation.ts      # one-time server boot: schema check + demo seed
prisma/schema.prisma      # 8 models: Setting, Service, Staff, ServiceStaff,
                          #            Customer, Appointment, Product, Sale
db/custom.db              # pre-seeded demo database
scripts/seed_salonflow.ts # CLI demo seed (npm run db:seed)
```

## Deploying to Vercel

Import the repo into Vercel and deploy — no configuration needed:

- Schema + seed run automatically at server start (instrumentation hook).
- On serverless, SQLite lives in a writable `/tmp` database and is **re-seeded with
  fresh, today-relative demo data on each cold start**, so the live demo always shows
  a current 30-day window.

> Serverless filesystems are ephemeral — treat a Vercel deployment as a live demo.
> For a production install with persistent data, run it on any Node host
> (Railway, Render, VPS) with the SQLite file on disk, or switch the Prisma
> datasource to Turso/libSQL (`prisma/schema.prisma` → `provider = "libsql"`).

## Production notes

- All prices are stored as integer **cents** to avoid floating-point issues.
- The admin session is a PIN-derived HTTP-only cookie; rotating the PIN in
  Settings invalidates every existing session instantly.
- Booking conflicts are prevented by a slot engine that respects staff shifts,
  working days, service durations, closed days and existing appointments.
