import { db, dbReady } from "@/lib/db";
import { ok, bad } from "@/lib/salonflow/auth";

export async function GET() {
  await dbReady; // first-run bootstrap
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (!setting) return bad("Salon not configured", 500);

  const [services, staff] = await Promise.all([
    db.service.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.staff.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { services: { select: { serviceId: true } } },
    }),
  ]);

  let gallery: { url: string; caption: string }[] = [];
  try {
    const parsed = JSON.parse(setting.galleryJson);
    if (Array.isArray(parsed)) gallery = parsed;
  } catch { /* ignore */ }

  return ok({
    settings: {
      salonName: setting.salonName,
      tagline: setting.tagline,
      about: setting.about,
      address: setting.address,
      phone: setting.phone,
      email: setting.email,
      currencySymbol: setting.currencySymbol,
      openMin: setting.openMin,
      closeMin: setting.closeMin,
      closedDays: setting.closedDays,
      heroImage: setting.heroImage,
      gallery,
      timeZone: setting.timeZone, // salon clock — lets Aria reason about "today" client-side
    },
    services: services.map((s) => ({
      id: s.id, name: s.name, category: s.category, description: s.description,
      price: s.price, durationMin: s.durationMin, imageUrl: s.imageUrl,
    })),
    staff: staff.map((st) => ({
      id: st.id, name: st.name, title: st.title, bio: st.bio, imageUrl: st.imageUrl,
      serviceIds: st.services.map((x) => x.serviceId),
    })),
  });
}
