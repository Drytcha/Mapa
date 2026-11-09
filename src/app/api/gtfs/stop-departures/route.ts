import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  gtfsRoutes,
  gtfsServices,
  gtfsStopTimes,
  gtfsStops,
  gtfsTrips,
} from "@/db/schema";
import { ensureGtfsSeeded, normalizeStopName } from "@/lib/server/gtfsSync";
import { getLiveWalbrzychBuses } from "@/lib/server/gtfsRt";
import type { WalbrzychOperatorKey } from "@/lib/types";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";

export const dynamic = "force-dynamic";

const ZONE = "Europe/Warsaw";

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 110540;
  const dLon = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export async function GET(request: NextRequest) {
  try {
    await ensureGtfsSeeded();
    const { searchParams } = new URL(request.url);
    const lat = Number.parseFloat(searchParams.get("lat") || "");
    const lon = Number.parseFloat(searchParams.get("lon") || "");
    const name = searchParams.get("name")?.trim() || "";
    const stopIdParam = searchParams.get("stopId")?.trim() || "";
    const fromMsParam = Number.parseInt(searchParams.get("from") || "", 10);
    const limit = Math.min(40, Math.max(1, Number.parseInt(searchParams.get("limit") || "10", 10) || 10));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { ok: false, error: "Wymagane współrzędne lat i lon." },
        { status: 400 }
      );
    }

    const fromDate = Number.isFinite(fromMsParam) ? new Date(fromMsParam) : new Date();
    const fromTime = fromDate.getTime();

    const allStops = await db.select().from(gtfsStops);
    const targetNorm = name ? normalizeStopName(name) : "";

    let matched: (typeof allStops)[number] | null = stopIdParam
      ? (allStops.find((s) => s.id === stopIdParam) ?? null)
      : null;
    let bestDist = matched ? distanceMeters(lat, lon, matched.lat, matched.lon) : 180;

    // Pass 1: distance <= 180m + comparable name
    for (const s of matched ? [] : allStops) {
      const dist = distanceMeters(lat, lon, s.lat, s.lon);
      if (dist > bestDist) continue;
      if (targetNorm) {
        const comp =
          s.normalizedName === targetNorm ||
          s.normalizedName.includes(targetNorm) ||
          targetNorm.includes(s.normalizedName);
        if (!comp) continue;
      }
      bestDist = dist;
      matched = s;
    }

    // Pass 2: closest stop within 95m regardless of OSM naming differences
    if (!matched) {
      bestDist = 95;
      for (const s of allStops) {
        const dist = distanceMeters(lat, lon, s.lat, s.lon);
        if (dist < bestDist) {
          bestDist = dist;
          matched = s;
        }
      }
    }

    if (!matched) {
      return NextResponse.json({
        ok: true,
        matched: null,
        departures: [],
      });
    }

    const [services, routes, stopTimesRows] = await Promise.all([
      db.select().from(gtfsServices),
      db.select().from(gtfsRoutes),
      db
        .select({
          tripId: gtfsStopTimes.tripId,
          departureMinutes: gtfsStopTimes.departureMinutes,
          arrivalMinutes: gtfsStopTimes.arrivalMinutes,
          routeId: gtfsTrips.routeId,
          serviceId: gtfsTrips.serviceId,
          kursowkaId: gtfsTrips.kursowkaId,
          kursowkaCode: gtfsTrips.kursowkaCode,
          brigadeSource: gtfsTrips.brigadeSource,
          headsign: gtfsTrips.headsign,
          directionId: gtfsTrips.directionId,
          lastStopName: gtfsTrips.lastStopName,
        })
        .from(gtfsStopTimes)
        .innerJoin(gtfsTrips, eq(gtfsStopTimes.tripId, gtfsTrips.id))
        .where(eq(gtfsStopTimes.stopId, matched.id)),
    ]);

    const routeMap = new Map(routes.map((r) => [r.id, r]));
    const serviceMap = new Map(services.map((s) => [s.serviceId, new Set(s.datesJson)]));

    // Fetch live GPS buses to enrich matching trips with live kursówka, vehicle & delay
    const liveByTrip = new Map<
      string,
      {
        vehicleId: string;
        operatorName: string;
        kursowka: string;
        delaySeconds: number;
        timestamp: number;
        operatorKey: WalbrzychOperatorKey;
      }
    >();
    const liveBySchedule = new Map<
      string,
      {
        vehicleId: string;
        operatorName: string;
        kursowka: string;
        delaySeconds: number;
        timestamp: number;
        operatorKey: WalbrzychOperatorKey;
      }
    >();
    try {
      const live = await getLiveWalbrzychBuses();
      for (const v of live.vehicles) {
        const item = {
          vehicleId: v.vehicleId,
          operatorName: v.operatorName,
          kursowka: v.kursowka,
          delaySeconds: v.delaySeconds,
          timestamp: v.timestamp,
          operatorKey: v.operatorKey,
        };
        if (v.tripId) {
          liveByTrip.set(v.tripId, item);
        }
        for (const stop of v.upcomingStops) {
          liveBySchedule.set(`${v.kursowka}|${stop.scheduledDeparture}`, item);
        }
      }
    } catch {
      // ignore
    }

    // Also fetch live stop departures from zbiorkom.live for realtime delay fallback
    const liveStopMatches: Array<{
      routeShort: string;
      headsign: string;
      scheduledDeparture: number;
      delaySeconds: number;
      isRealtime: boolean;
    }> = [];
    try {
      const res = await fetch(
        `https://api.zbiorkom.live/api6-open/walbrzych/stops/${encodeURIComponent(matched.id)}?limit=40&time=${Math.floor(fromTime / 1000) * 1000}`,
        { signal: AbortSignal.timeout(3500), cache: "no-store" }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          departures?: Array<{
            trip?: { route?: { name?: string }; headsign?: string };
            scheduledDeparture?: number;
            delay?: number;
            isRealtime?: boolean;
          }>;
        };
        for (const d of json.departures ?? []) {
          if (d.scheduledDeparture) {
            liveStopMatches.push({
              routeShort: String(d.trip?.route?.name ?? "").toUpperCase(),
              headsign: String(d.trip?.headsign ?? ""),
              scheduledDeparture: d.scheduledDeparture,
              delaySeconds: Math.round((d.delay ?? 0) / 1000),
              isRealtime: Boolean(d.isRealtime),
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }

    interface DepartureRow {
      tripId: string;
      kursowkaId: string;
      kursowka: string;
      brigadeSource: string;
      routeShort: string;
      routeColor: string;
      routeTextColor: string;
      routeLong: string;
      headsign: string;
      finalStop: string;
      direction: number;
      minutes: number;
      atMs: number;
      clock: string;
      dateLabel: string;
      isRealtime: boolean;
      delaySeconds: number;
      vehicleId: string | null;
      operatorName: string | null;
      operatorKey: WalbrzychOperatorKey | null;
    }

    const results: DepartureRow[] = [];
    const baseDt = DateTime.fromJSDate(fromDate, { zone: ZONE });

    for (const dayOffset of [-1, 0, 1]) {
      const serviceDay = baseDt.plus({ days: dayOffset }).startOf("day");
      const dateKey = Number(serviceDay.toFormat("yyyyMMdd"));
      const activeServices = new Set<string>();
      for (const [sid, dates] of serviceMap) {
        if (dates.has(dateKey)) activeServices.add(sid);
      }
      if (!activeServices.size) continue;

      const dayStartMs = serviceDay.toMillis();
      for (const row of stopTimesRows) {
        if (!activeServices.has(row.serviceId)) continue;
        const atMs = dayStartMs + row.departureMinutes * 60_000;
        if (atMs < fromTime - 60_000) continue;

        const route = routeMap.get(row.routeId);
        const routeShort = route?.shortName ?? row.routeId;
        const rawTripId = row.tripId.replace(/_(weekday|saturday|sunday)$/, "");
        const byTrip = liveByTrip.get(rawTripId);
        const liveMatch = (byTrip && Math.abs(atMs - byTrip.timestamp) < 90 * 60_000 ? byTrip : undefined) ?? liveBySchedule.get(`${row.kursowkaCode}|${atMs}`);
        const liveStop = liveStopMatches.find(
          (m) =>
            m.routeShort === routeShort.toUpperCase() &&
            Math.abs(m.scheduledDeparture - atMs) <= 90_000
        );

        const atDt = DateTime.fromMillis(atMs, { zone: ZONE });
        const finalStop = row.headsign || row.lastStopName || route?.longName || "Końcowy";

        results.push({
          tripId: row.tripId,
          kursowkaId: row.kursowkaId,
          kursowka: liveMatch?.kursowka || row.kursowkaCode,
          brigadeSource: liveMatch ? "live_gps" : row.brigadeSource,
          routeShort,
          routeColor: route?.color ?? "#0d4f3b",
          routeTextColor: route?.textColor ?? "#ffffff",
          routeLong: route?.longName ?? "",
          headsign: row.headsign,
          finalStop,
          direction: row.directionId,
          minutes: row.departureMinutes,
          atMs,
          clock: atDt.toFormat("HH:mm"),
          dateLabel: atDt.setLocale("pl").toFormat("ccc, dd.MM"),
          isRealtime: Boolean(liveMatch || liveStop?.isRealtime),
          delaySeconds: liveMatch?.delaySeconds ?? liveStop?.delaySeconds ?? 0,
          vehicleId: liveMatch?.vehicleId ?? null,
          operatorName: liveMatch?.operatorName ?? null,
          operatorKey: liveMatch?.operatorKey ?? null,
        });
      }
    }

    results.sort((a, b) => a.atMs - b.atMs);

    return NextResponse.json({
      ok: true,
      matched: {
        id: matched.id,
        name: matched.name,
        lat: matched.lat,
        lon: matched.lon,
        agency: matched.agency,
        distanceMeters: Math.round(bestDist),
      },
      departures: results.slice(0, limit),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się odczytać rozkładu przystanku.",
      },
      { status: 500 }
    );
  }
}
