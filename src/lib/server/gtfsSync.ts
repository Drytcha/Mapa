import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "@/db";
import {
  gtfsFeeds,
  gtfsKursowki,
  gtfsRoutes,
  gtfsServices,
  gtfsShapes,
  gtfsStopTimes,
  gtfsStops,
  gtfsTrips,
  liveTripBrigades,
} from "@/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { assignDuties, type ScheduleTrip } from "./dutyAssignment";

export const DUTY_SCHEMA_VERSION = "gps-anchored-v3";
const LIVE_GTFS_URL = "https://api.zbiorkom.live/api6-open/walbrzych/gtfs/default";
const FALLBACK_GTFS_PATH = path.join(process.cwd(), "src", "data", "walbrzych-gtfs.zip");

export function normalizeStopName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\bn[zż]\b/g, "")
    .replace(/na zadanie|na żądanie/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parses CSV lines supporting quotes and commas inside quoted values. */
function parseCsvRows(text: string): Array<Record<string, string>> {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function timeToMinutes(hhmmss: string): number {
  const parts = hhmmss.split(":").map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts[0] * 60 + parts[1] + Math.round((parts[2] ?? 0) / 60);
}

function routeSortOrder(shortName: string): number {
  const num = Number.parseInt(shortName, 10);
  if (/^\d+$/.test(shortName.trim()) && Number.isFinite(num)) return num;
  const upper = shortName.trim().toUpperCase();
  if (upper === "A") return 1001;
  if (upper === "C") return 1002;
  if (upper === "EX") return 1003;
  return 1100 + upper.charCodeAt(0);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

let seedLock: Promise<void> | null = null;

type SyncResult = { source: string; version: string; routes: number; stops: number; trips: number; kursowki: number };
let activeSync: Promise<SyncResult> | null = null;
let cachedArchive: { bytes: Uint8Array; source: string } | null = null;

export async function ensureGtfsSeeded(): Promise<void> {
  if (seedLock) return seedLock;
  seedLock = (async () => {
    try {
      if (activeSync) await activeSync;
      const [feed] = await db.select().from(gtfsFeeds).where(eq(gtfsFeeds.id, "walbrzych"));
      const [row] = await db.select({ cnt: count() }).from(gtfsTrips);
      const [observation] = await db.select({ latest: sql<Date | string | null>`max(${liveTripBrigades.observedAt})` }).from(liveTripBrigades);
      const latestObservation = observation?.latest ? new Date(observation.latest).getTime() : 0;
      const rebuiltAt = feed?.generatedAt ? Date.parse(feed.generatedAt) : 0;
      if (feed?.version.endsWith(`+${DUTY_SCHEMA_VERSION}`) && (row?.cnt ?? 0) > 0 && latestObservation <= rebuiltAt) return;
      await syncWalbrzychGtfs({ forceLive: false });
    } finally { seedLock = null; }
  })();
  return seedLock;
}

export async function syncWalbrzychGtfs(options: { forceLive?: boolean } = {}): Promise<SyncResult> {
  if (activeSync) return activeSync;
  activeSync = runSync(options).finally(() => { activeSync = null; });
  return activeSync;
}

async function runSync(options: { forceLive?: boolean }): Promise<SyncResult> {
  const syncStartedAt = new Date();
  let zipBytes: Uint8Array | null = null;
  let sourceLabel = "api.zbiorkom.live (Wałbrzych GTFS)";

  if (options.forceLive) {
    const res = await fetch(LIVE_GTFS_URL, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Nie udało się pobrać Wałbrzych GTFS: HTTP ${res.status}`);
    }
    zipBytes = new Uint8Array(await res.arrayBuffer());
    cachedArchive = { bytes: zipBytes, source: sourceLabel };
  } else if (cachedArchive) {
    zipBytes = cachedArchive.bytes;
    sourceLabel = cachedArchive.source;
  } else {
    try {
      const res = await fetch(LIVE_GTFS_URL, {
        signal: AbortSignal.timeout(4_500),
        cache: "no-store",
      });
      if (res.ok) {
        zipBytes = new Uint8Array(await res.arrayBuffer());
        cachedArchive = { bytes: zipBytes, source: sourceLabel };
      }
    } catch {
      // Fallback
    }
    if (!zipBytes) {
      if (!fs.existsSync(FALLBACK_GTFS_PATH)) {
        throw new Error("Brak lokalnego archiwum walbrzych-gtfs.zip i brak połączenia z GTFS.");
      }
      zipBytes = new Uint8Array(fs.readFileSync(FALLBACK_GTFS_PATH));
      sourceLabel = "Lokalny snapshot Wałbrzych GTFS";
    }
  }

  const files = unzipSync(zipBytes);
  const readTxt = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  const feedRows = parseCsvRows(readTxt("feed_info.txt"));
  const agencyRows = parseCsvRows(readTxt("agency.txt"));
  const defaultAgency = agencyRows[0]?.agency_name || "ZDKiUM / MPK Wałbrzych";
  const feedVersion = feedRows[0]?.feed_version || new Date().toISOString().slice(0, 10);

  const routeRows = parseCsvRows(readTxt("routes.txt"));
  const stopRows = parseCsvRows(readTxt("stops.txt"));
  const calDateRows = parseCsvRows(readTxt("calendar_dates.txt"));
  const tripRows = parseCsvRows(readTxt("trips.txt"));
  const stopTimeRows = parseCsvRows(readTxt("stop_times.txt"));
  const shapeRows = parseCsvRows(readTxt("shapes.txt"));

  // Build route map
  const routeMap = new Map<
    string,
    {
      id: string;
      shortName: string;
      longName: string;
      color: string;
      textColor: string;
      agencyName: string;
      sortOrder: number;
    }
  >();

  for (const r of routeRows) {
    const id = r.route_id;
    const shortName = (r.route_short_name || id).trim();
    const rawColor = (r.route_color || "0d4f3b").replace(/^#/, "");
    const rawText = (r.route_text_color || "ffffff").replace(/^#/, "");
    routeMap.set(id, {
      id,
      shortName,
      longName: r.route_long_name || shortName,
      color: `#${rawColor}`,
      textColor: `#${rawText}`,
      agencyName: defaultAgency,
      sortOrder: routeSortOrder(shortName),
    });
  }

  // Build stops map with safe quote parsing
  const stopMap = new Map<
    string,
    {
      id: string;
      name: string;
      normalizedName: string;
      lat: number;
      lon: number;
      code: string | null;
      platformCode: string | null;
      agency: string;
    }
  >();

  for (const s of stopRows) {
    const lat = Number.parseFloat(s.stop_lat);
    const lon = Number.parseFloat(s.stop_lon);
    if (!s.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stopMap.set(s.stop_id, {
      id: s.stop_id,
      name: s.stop_name || s.stop_id,
      normalizedName: normalizeStopName(s.stop_name || s.stop_id),
      lat,
      lon,
      code: s.stop_code || null,
      platformCode: s.platform_code || null,
      agency: defaultAgency,
    });
  }

  // Calendar dates mapping: service_id -> Set of YYYYMMDD
  const rawServiceDates = new Map<string, Set<number>>();
  for (const cd of calDateRows) {
    if (cd.exception_type !== "1" && cd.exception_type !== "") continue;
    const dateNum = Number.parseInt(cd.date, 10);
    if (!Number.isFinite(dateNum)) continue;
    const set = rawServiceDates.get(cd.service_id) ?? new Set<number>();
    set.add(dateNum);
    rawServiceDates.set(cd.service_id, set);
  }

  // Categorize calendar dates into 3 primary Polish transit day types
  const dayTypeDates = {
    weekday: [] as number[],
    saturday: [] as number[],
    sunday: [] as number[],
  };

  const allDates = new Set<number>();
  for (const set of rawServiceDates.values()) {
    for (const d of set) allDates.add(d);
  }

  for (const d of allDates) {
    const ds = String(d);
    const y = Number(ds.slice(0, 4));
    const m = Number(ds.slice(4, 6)) - 1;
    const day = Number(ds.slice(6, 8));
    const dow = new Date(Date.UTC(y, m, day)).getUTCDay();
    // Sunday or official holiday (like 20261111) has 0_NS
    if (rawServiceDates.get("0_NS")?.has(d) || dow === 0) {
      dayTypeDates.sunday.push(d);
    } else if (rawServiceDates.get("0_SO")?.has(d) || dow === 6) {
      dayTypeDates.saturday.push(d);
    } else {
      dayTypeDates.weekday.push(d);
    }
  }

  dayTypeDates.weekday.sort((a, b) => a - b);
  dayTypeDates.saturday.sort((a, b) => a - b);
  dayTypeDates.sunday.sort((a, b) => a - b);

  // Representative dates for service activation
  const repDates: Record<string, number> = {
    weekday: dayTypeDates.weekday[0] ?? 20261109,
    saturday: dayTypeDates.saturday[0] ?? 20261114,
    sunday: dayTypeDates.sunday[0] ?? 20261115,
  };

  const dayTypeServices: Record<string, Set<string>> = {
    weekday: new Set(),
    saturday: new Set(),
    sunday: new Set(),
  };

  for (const [dayKey, repDate] of Object.entries(repDates)) {
    for (const [sid, dates] of rawServiceDates.entries()) {
      if (dates.has(repDate)) {
        dayTypeServices[dayKey].add(sid);
      }
    }
  }

  // Build stop_times per trip
  const stopTimesByTrip = new Map<
    string,
    Array<{
      tripId: string;
      stopId: string;
      stopSequence: number;
      arrivalMinutes: number;
      departureMinutes: number;
      pickupType: number;
      dropOffType: number;
    }>
  >();

  for (const st of stopTimeRows) {
    if (!st.trip_id || !st.stop_id) continue;
    const arr = timeToMinutes(st.arrival_time || st.departure_time);
    const dep = timeToMinutes(st.departure_time || st.arrival_time);
    const seq = Number.parseInt(st.stop_sequence, 10) || 0;
    const list = stopTimesByTrip.get(st.trip_id) ?? [];
    list.push({
      tripId: st.trip_id,
      stopId: st.stop_id,
      stopSequence: seq,
      arrivalMinutes: arr,
      departureMinutes: dep,
      pickupType: Number.parseInt(st.pickup_type, 10) || 0,
      dropOffType: Number.parseInt(st.drop_off_type, 10) || 0,
    });
    stopTimesByTrip.set(st.trip_id, list);
  }

  interface TripDetail {
    rawTripId: string;
    routeId: string;
    routeShort: string;
    serviceId: string;
    rawBrigade: string;
    headsign: string;
    directionId: number;
    shapeId: string | null;
    startMinutes: number;
    endMinutes: number;
    firstStopId: string;
    lastStopId: string;
    firstStopName: string;
    lastStopName: string;
    stopCount: number;
  }

  const allTripDetails = new Map<string, TripDetail>();

  for (const t of tripRows) {
    const sts = stopTimesByTrip.get(t.trip_id);
    if (!sts || !sts.length) continue;
    sts.sort((a, b) => a.stopSequence - b.stopSequence);
    const first = sts[0];
    const last = sts[sts.length - 1];
    const route = routeMap.get(t.route_id);
    const routeShort = route?.shortName ?? t.route_id;
    const firstStop = stopMap.get(first.stopId);
    const lastStop = stopMap.get(last.stopId);

    allTripDetails.set(t.trip_id, {
      rawTripId: t.trip_id,
      routeId: t.route_id,
      routeShort,
      serviceId: t.service_id,
      rawBrigade: (t.block_id || "").trim(),
      headsign: t.trip_headsign || lastStop?.name || "",
      directionId: Number.parseInt(t.direction_id, 10) || 0,
      shapeId: t.shape_id || null,
      startMinutes: first.departureMinutes,
      endMinutes: last.arrivalMinutes,
      firstStopId: first.stopId,
      lastStopId: last.stopId,
      firstStopName: firstStop?.name ?? first.stopId,
      lastStopName: lastStop?.name ?? last.stopId,
      stopCount: sts.length,
    });
  }

  // Only observations belonging to this representative calendar may anchor its duties.
  const liveObservedRows = await db.select().from(liveTripBrigades);
  const serviceDefinitions = [
    { serviceId: "weekday", label: "Dni robocze", dates: dayTypeDates.weekday },
    { serviceId: "saturday", label: "Soboty", dates: dayTypeDates.saturday },
    { serviceId: "sunday", label: "Niedziele i święta", dates: dayTypeDates.sunday },
  ];
  const kursowkiRecords: Array<typeof gtfsKursowki.$inferInsert> = [];
  const tripRecords: Array<typeof gtfsTrips.$inferInsert> = [];
  const stopTimesRecords: Array<typeof gtfsStopTimes.$inferInsert> = [];

  for (const svc of serviceDefinitions) {
    const activeRawServices = dayTypeServices[svc.serviceId];
    const tripsForDay = new Map<string, TripDetail[]>();
    for (const trip of allTripDetails.values()) {
      if (!activeRawServices.has(trip.serviceId)) continue;
      const list = tripsForDay.get(trip.routeId) ?? [];
      list.push(trip);
      tripsForDay.set(trip.routeId, list);
    }
    for (const [routeId, routeTrips] of tripsForDay) {
      const schedule: ScheduleTrip[] = routeTrips.map((trip) => ({ ...trip, explicitBrigade: trip.rawBrigade }));
      const assignments = assignDuties(schedule, stopMap, liveObservedRows);
      for (const duty of assignments) {
        const kursowkaId = `${routeId}|${svc.serviceId}|${duty.kursowkaCode}`;
        const first = duty.trips[0].trip.rawTripId;
        const last = duty.trips[duty.trips.length - 1].trip.rawTripId;
        const firstTrip = allTripDetails.get(first)!;
        const lastTrip = allTripDetails.get(last)!;
        kursowkiRecords.push({
          id: kursowkaId, routeId, routeShort: duty.routeShort, serviceId: svc.serviceId,
          kursowkaCode: duty.kursowkaCode, brigadeNum: duty.brigadeNum, source: duty.source,
          tripCount: duty.trips.length, firstDepartureMin: firstTrip.startMinutes,
          lastArrivalMin: lastTrip.endMinutes, vehicleId: null, operatorName: null,
          updatedAt: new Date(),
        });
        for (const { trip, source } of duty.trips) {
          const detail = allTripDetails.get(trip.rawTripId)!;
          const tripDbId = `${trip.rawTripId}_${svc.serviceId}`;
          tripRecords.push({
            id: tripDbId, routeId, serviceId: svc.serviceId, kursowkaId,
            kursowkaCode: duty.kursowkaCode, brigadeNum: duty.brigadeNum,
            brigadeSource: source, headsign: detail.headsign, directionId: detail.directionId,
            shapeId: detail.shapeId, startMinutes: detail.startMinutes, endMinutes: detail.endMinutes,
            firstStopName: detail.firstStopName, lastStopName: detail.lastStopName, stopCount: detail.stopCount,
          });
          for (const st of stopTimesByTrip.get(trip.rawTripId) ?? []) {
            stopTimesRecords.push({ ...st, tripId: tripDbId });
          }
        }
      }
    }
  }

  // Build shapes map
  const shapeBuckets = new Map<string, Array<{ seq: number; lat: number; lon: number }>>();
  for (const sh of shapeRows) {
    if (!sh.shape_id) continue;
    const lat = Number.parseFloat(sh.shape_pt_lat);
    const lon = Number.parseFloat(sh.shape_pt_lon);
    const seq = Number.parseInt(sh.shape_pt_sequence, 10) || 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const list = shapeBuckets.get(sh.shape_id) ?? [];
    list.push({ seq, lat, lon });
    shapeBuckets.set(sh.shape_id, list);
  }
  const shapeRecords: Array<typeof gtfsShapes.$inferInsert> = [];
  for (const [shapeId, pts] of shapeBuckets) {
    pts.sort((a, b) => a.seq - b.seq);
    shapeRecords.push({
      shapeId,
      pointsJson: pts.map((p) => [p.lat, p.lon] as [number, number]),
    });
  }

  const allRoutes = Array.from(routeMap.values());
  const allStops = Array.from(stopMap.values());
  const allServices = serviceDefinitions.map((s) => ({
    serviceId: s.serviceId,
    label: s.label,
    datesJson: s.dates,
  }));

  await db.transaction(async (tx) => {
    await tx.delete(gtfsStopTimes);
    await tx.delete(gtfsTrips);
    await tx.delete(gtfsKursowki);
    await tx.delete(gtfsShapes);
    await tx.delete(gtfsServices);
    await tx.delete(gtfsStops);
    await tx.delete(gtfsRoutes);

    const chunkInsert = async <T>(
      items: T[],
      size: number,
      fn: (batch: T[]) => Promise<unknown>
    ) => {
      for (let i = 0; i < items.length; i += size) {
        await fn(items.slice(i, i + size));
      }
    };

    await chunkInsert(allRoutes, 200, (b) => tx.insert(gtfsRoutes).values(b));
    await chunkInsert(allStops, 500, (b) => tx.insert(gtfsStops).values(b));
    await chunkInsert(allServices, 10, (b) => tx.insert(gtfsServices).values(b));
    await chunkInsert(shapeRecords, 100, (b) => tx.insert(gtfsShapes).values(b));
    await chunkInsert(kursowkiRecords, 250, (b) => tx.insert(gtfsKursowki).values(b));
    await chunkInsert(tripRecords, 400, (b) => tx.insert(gtfsTrips).values(b));
    await chunkInsert(stopTimesRecords, 1500, (b) => tx.insert(gtfsStopTimes).values(b));

    await tx
      .insert(gtfsFeeds)
      .values({
        id: "walbrzych",
        source: sourceLabel,
        version: `${feedVersion}+${DUTY_SCHEMA_VERSION}`,
        generatedAt: syncStartedAt.toISOString(),
        stopsCount: allStops.length,
        routesCount: allRoutes.length,
        tripsCount: tripRecords.length,
        kursowkiCount: kursowkiRecords.length,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: gtfsFeeds.id,
        set: {
          source: sourceLabel,
          version: `${feedVersion}+${DUTY_SCHEMA_VERSION}`,
          generatedAt: syncStartedAt.toISOString(),
          stopsCount: allStops.length,
          routesCount: allRoutes.length,
          tripsCount: tripRecords.length,
          kursowkiCount: kursowkiRecords.length,
          updatedAt: new Date(),
        },
      });
  });

  return {
    source: sourceLabel,
    version: `${feedVersion}+${DUTY_SCHEMA_VERSION}`,
    routes: allRoutes.length,
    stops: allStops.length,
    trips: tripRecords.length,
    kursowki: kursowkiRecords.length,
  };
}
