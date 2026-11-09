import { NextResponse } from "next/server";
import { db } from "@/db";
import { gtfsFeeds, gtfsKursowki, gtfsRoutes, gtfsServices } from "@/db/schema";
import { ensureGtfsSeeded } from "@/lib/server/gtfsSync";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { serviceForDate } from "@/lib/transit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureGtfsSeeded();
    const [routes, services, duties, feeds] = await Promise.all([
      db.select().from(gtfsRoutes).orderBy(asc(gtfsRoutes.sortOrder)),
      db.select().from(gtfsServices),
      db.select().from(gtfsKursowki),
      db.select().from(gtfsFeeds).where(eq(gtfsFeeds.id, "walbrzych")),
    ]);
    const now = DateTime.now().setZone("Europe/Warsaw");
    const todayKey = Number(now.toFormat("yyyyMMdd"));
    const defaultServiceId = serviceForDate(services, todayKey, now.weekday);
    const order: Record<string, number> = { weekday: 1, saturday: 2, sunday: 3 };
    const sorted = [...services].sort((a, b) => (order[a.serviceId] ?? 9) - (order[b.serviceId] ?? 9));
    return NextResponse.json({
      ok: true,
      feed: feeds[0] ? { ...feeds[0], version: feeds[0].version.split("+")[0] } : null,
      todayKey,
      defaultServiceId,
      feedCoversToday: services.some((service) => service.datesJson.includes(todayKey)),
      uniqueDutiesCount: new Set(duties.filter((duty) => duty.brigadeNum !== "?").map((duty) => duty.kursowkaCode)).size,
      services: sorted.map((service) => ({
        serviceId: service.serviceId, label: service.label,
        isToday: service.serviceId === defaultServiceId,
        datesCount: service.datesJson.length,
      })),
      routes: routes.map((route) => {
        const perService: Record<string, { kursowkiCount: number; tripsCount: number }> = {};
        for (const service of services) {
          const matches = duties.filter((duty) => duty.routeId === route.id && duty.serviceId === service.serviceId);
          if (matches.length) perService[service.serviceId] = {
            kursowkiCount: matches.filter((duty) => duty.brigadeNum !== "?").length,
            tripsCount: matches.reduce((sum, duty) => sum + duty.tripCount, 0),
          };
        }
        return { ...route, perService };
      }),
    });
  } catch (error) {
    console.error("GTFS lines:", error);
    return NextResponse.json({ ok: false, error: "Nie udało się wczytać linii GTFS. Spróbuj ponownie." }, { status: 500 });
  }
}
