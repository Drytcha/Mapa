import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { gtfsShapes, gtfsStopTimes, gtfsStops, gtfsTrips } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDutyCatalog, type DutySummary } from "@/lib/server/kursowkiCatalog";
import { normalizeDutyCode, serviceForDate } from "@/lib/transit";

export const dynamic = "force-dynamic";

function clock(totalMinutes: number): string {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id")?.trim() || "";
    const code = normalizeDutyCode(params.get("code") || "");
    const requestedService = params.get("serviceId")?.trim() || "";
    const catalog = await getDutyCatalog({ serviceId: requestedService || "all" });
    const now = DateTime.now().setZone("Europe/Warsaw");
    const todayService = serviceForDate(catalog.services, Number(now.toFormat("yyyyMMdd")), now.weekday);
    let selected: DutySummary | undefined;
    if (id) selected = catalog.items.find((item) => item.id === id);
    if (!selected && (code || id)) {
      const parts = (id.startsWith("live|") ? id.slice(5) : id).split("|");
      const wantedCode = code || normalizeDutyCode(parts.at(-1) || "");
      const routeId = id.includes("|") ? parts[0] : undefined;
      const service = requestedService || (id.includes("|") ? parts[1] : todayService);
      const candidates = catalog.items.filter((item) => item.kursowkaCode === wantedCode && (!routeId || item.routeId === routeId) && !item.unassigned);
      selected = candidates.find((item) => item.serviceId === service) ?? candidates.find((item) => item.liveBus) ?? candidates.find((item) => item.serviceId === todayService) ?? candidates[0];
      if (!selected && id.startsWith("live|")) {
        const liveRoute = catalog.routes.find((route) => route.id === routeId);
        if (liveRoute && wantedCode.startsWith(`${liveRoute.shortName.toUpperCase()}/`)) {
          selected = {
            id, routeId: liveRoute.id, routeShort: liveRoute.shortName, serviceId: service,
            kursowkaCode: wantedCode, brigadeNum: wantedCode.split("/")[1], source: "live_gps",
            tripCount: 0, firstDepartureMin: null, lastArrivalMin: null,
            firstStopName: "", lastStopName: "", vehicleId: null, operatorName: null,
            hasSchedule: false, unassigned: false, availableServices: [], liveBus: null,
          };
        }
      }
      if (selected && requestedService && selected.serviceId !== requestedService) {
        // Never substitute another day's courses under the selected calendar.
        selected = { ...selected, id: `live|${selected.routeId}|${selected.kursowkaCode}`, serviceId: requestedService, hasSchedule: false, tripCount: 0, firstDepartureMin: null, lastArrivalMin: null, firstStopName: "", lastStopName: "" };
      }
    }
    if (!selected) return NextResponse.json({ ok: false, error: "Nie znaleziono kursówki. Wyszukaj ją po numerze linii i kursówki, np. 2/03." }, { status: 404 });

    const route = catalog.routes.find((item) => item.id === selected.routeId) ?? null;
    const trips = selected.hasSchedule ? await db.select().from(gtfsTrips).where(eq(gtfsTrips.kursowkaId, selected.id)).orderBy(asc(gtfsTrips.startMinutes), asc(gtfsTrips.id)) : [];
    const tripIds = trips.map((trip) => trip.id);
    const stopTimes = tripIds.length ? await db.select({
      tripId: gtfsStopTimes.tripId, stopId: gtfsStopTimes.stopId,
      stopSequence: gtfsStopTimes.stopSequence, arrivalMinutes: gtfsStopTimes.arrivalMinutes,
      departureMinutes: gtfsStopTimes.departureMinutes, stopName: gtfsStops.name,
      lat: gtfsStops.lat, lon: gtfsStops.lon,
    }).from(gtfsStopTimes).innerJoin(gtfsStops, eq(gtfsStopTimes.stopId, gtfsStops.id))
      .where(inArray(gtfsStopTimes.tripId, tripIds)).orderBy(asc(gtfsStopTimes.stopSequence)) : [];
    const byTrip = new Map<string, typeof stopTimes>();
    for (const stop of stopTimes) byTrip.set(stop.tripId, [...(byTrip.get(stop.tripId) ?? []), stop]);
    const shapeIds = [...new Set(trips.map((trip) => trip.shapeId).filter((value): value is string => !!value))];
    const shapes = shapeIds.length ? await db.select().from(gtfsShapes).where(inArray(gtfsShapes.shapeId, shapeIds)) : [];
    return NextResponse.json({
      ok: true, route, kursowka: selected,
      notice: !selected.hasSchedule ? (selected.liveBus ? "Ta kursówka jest widoczna w GPS, ale nie ma przypisanych kursów w wybranym typie dnia. Możesz znaleźć autobus na mapie." : "Ta kursówka była widoczna w GPS, ale autobus nie nadaje teraz pozycji i brak kursów w wybranym typie dnia.") : selected.source === "conflict" ? "Niektóre kursy mają nakładające się godziny w danych źródłowych. Zachowujemy numery z GPS i oznaczamy tę kursówkę do weryfikacji." : null,
      liveError: catalog.liveError,
      trips: trips.map((trip, index) => ({
        ...trip,
        startClock: clock(trip.startMinutes), endClock: clock(trip.endMinutes),
        durationMinutes: Math.max(1, trip.endMinutes - trip.startMinutes),
        layoverMinutes: !selected.unassigned && trips[index + 1] ? Math.max(0, trips[index + 1].startMinutes - trip.endMinutes) : null,
        stops: (byTrip.get(trip.id) ?? []).map((stop) => ({ ...stop, arrivalClock: clock(stop.arrivalMinutes), departureClock: clock(stop.departureMinutes) })),
      })),
      shapes: Object.fromEntries(shapes.map((shape) => [shape.shapeId, shape.pointsJson])),
    });
  } catch (error) {
    console.error("Duty detail:", error);
    return NextResponse.json({ ok: false, error: "Nie udało się wczytać kursów tej kursówki. Spróbuj ponownie." }, { status: 500 });
  }
}
