# SalonFlow — the salon operating system

SalonFlow is a complete management system for salons, barbershops and spas: a public
booking storefront your guests use, and an owner console that runs the whole shop —
the book, the register, the team, the reports.

Built as a single deployable app: **Next.js 16 (App Router) · TypeScript · Tailwind CSS ·
Prisma + SQLite**. No external database service, no monthly fees — the data lives in one
SQLite file you own.

---

## What's inside

**Guest storefront** (`/`)
- Editorial hero, service menu with photos, team gallery, testimonials, opening hours
- 4-step online booking wizard with live availability (15-minute slots, shift-aware,
  double-booking protected, 30-minute lead time)
- Booking lookup + self-service cancellation by reference code

**Owner console** (`/#/admin` — PIN protected)
- **Dashboard** — a live operations board: who is in a chair right now, next arrival,
  a per-specialist day grid with a moving "now" line, today's register (revenue / tips /
  payment mix), bookings waiting for confirmation and low-stock shelf alerts
- **Appointments** — timeline view of the whole floor (click an empty stretch of a lane
  to book it) plus a classic list view, status flow (pending → confirmed → completed /
  no-show / cancelled), walk-ins, source tracking
- **Register (POS)** — services + retail in one cart, discounts, tips with quick
  percentages, cash / card / mobile payments, printable 80 mm receipt slip
- **Clients** — guest book with notes, visit counts, lifetime spend, no-show history,
  favourite specialist and service, full visit + receipt history per client
- **Services & retail** — menu management with categories, durations, photos; retail
  products with stock levels and low-stock thresholds
- **Team** — specialists with commissions (% of service revenue), working days and
  shift windows, per-staff 30-day performance
- **Reports** — revenue by day with weekend highlighting, department mix, payment mix,
  busiest services, and a staff payout table (commission owed vs tips already paid),
  CSV export
- **Settings** — salon identity, opening hours, slot step, currency, salon timezone
  (the console runs on the salon's clock, not the server's), admin PIN rotation

## The demo

The app ships pre-loaded with a believable eight-week history — 500+ appointments,
500+ receipts, tips, discounts, no-shows, regulars with notes — so every screen and
report has something real to show. If the database is empty on first run (e.g. a fresh
serverless instance), the app rebuilds the demo data automatically.

| | |
|---|---|
| Storefront | `/` |
| Owner console | `/#/admin` |
| Demo PIN | `aurelia2024` (change it in Settings) |

## Security model

- The admin cookie holds a **server-side random session secret** — never a hash of
  the PIN. A publicly-known demo PIN therefore cannot forge a session; the only road
  to the console is the login route.
- Every login rotates the secret, so changing the PIN signs out every previous session.
- Login and public booking endpoints are rate-limited (brake on brute force and spam).
- Product stock and receipt numbers are written inside one transaction — concurrent
  checkouts can't oversell or double a receipt number, and slot booking re-checks
  conflicts inside the write transaction.

## Quickstart

```bash
npm install          # also generates the Prisma client
cp .env.example .env # points DATABASE_URL at ./db/custom.db
npm run db:push      # create the SQLite schema
npm run db:seed      # load the 8-week demo dataset (optional but recommended)
npm run dev
```

Open http://localhost:3000 — storefront at `/`, console at `/#/admin`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Push `prisma/schema.prisma` to the SQLite file |
| `npm run db:seed` | Re-load the deterministic demo dataset |
| `npm run lint` | ESLint |

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel — no environment variables
   required. On serverless, SalonFlow keeps its SQLite file in `/tmp` and rebuilds the
   schema + demo data on first request.
2. Note the trade-off honestly: serverless instances are ephemeral, so writes live as
   long as the instance does. For a real shop, deploy to a small VPS / always-on Node
   host (any $5 box runs it) or point Prisma at a hosted libSQL/Turso instance — the
   schema is portable as-is.

## Project structure

```
prisma/schema.prisma        # Setting, Service, Staff, ServiceStaff, Customer,
                            # Appointment, Product, Sale
src/lib/salonflow/          # slot engine (availability + conflicts), auth, time utils,
                            # seed (deterministic), first-run bootstrap + DDL
src/app/api/admin/*         # console API — dashboard, appointments CRUD, POS checkout,
                            # clients, staff, services, products, reports, settings
src/app/api/public/*        # storefront API — site, availability, bookings, lookup
src/components/salonflow/   # storefront + console UI (day grid, POS, reports…)
```

## Demo content & photography

The demo dataset is fully deterministic — re-running the seed produces the same
"shop that has been open for eight weeks" (weekday rushes, no-shows, tips,
retail attach rates, regulars with notes). All demo photography ships inside
`public/images/` (stock photos from free-license providers — Pexels), so the app
works offline after install and never hot-links a third-party CDN. **Replace the
bundled photos with your own** via the Services, Team and Settings editors before
going live with a real salon.

## License

MIT — see [LICENSE.md](LICENSE.md).
