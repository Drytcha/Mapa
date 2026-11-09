import { gunzipSync, strFromU8 } from "fflate";
import { DateTime } from "luxon";

/** Compact GTFS rows produced by scripts/build-gtfs-walbrzych.mjs. */
export interface GtfsStop {
  id: string;
  name: string;
  /** Cached normalized name for fast OSM-to-GTFS matching. */
  normalized?: string;
  lat: number;
  lon: number;
  code?: string;
  agency: string;
}

export interface GtfsRoute {
  id: string;
  short: string;
  long: string;
  agency: string;
}

export interface GtfsDeparture {
  /** Minutes from midnight of the service date; may exceed 1440 for after-midnight trips. */
  minutes: number;
  serviceDate: string;
  tripId: string;
  route: GtfsRoute;
  headsign: string;
  direction: number;
  /** Actual departure instant, already rolled over past midnight when needed. */
  at: Date;
  arrivalAt: Date;
}

export interface GtfsData {
  stops: GtfsStop[];
  routes: GtfsRoute[];
  /** service id -> active dates as YYYYMMDD numbers */
  services: Map<string, Set<number>>;
  trips: Array<{
    id: string;
    routeIndex: number;
    serviceId: string;
    headsign: string;
    direction: number;
  }>;
  departuresByStop: Map<string, Array<{ tripIndex: number; departure: number; arrival: number }>>;
  meta: { generated: string; source: string; counts: Record<string, number> };
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const lookup = new Uint8Array(128);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    lookup[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let offset = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = lookup[clean.charCodeAt(index)] ?? 0;
    const b = lookup[clean.charCodeAt(index + 1)] ?? 0;
    const c = lookup[clean.charCodeAt(index + 2)] ?? 0;
    const d = lookup[clean.charCodeAt(index + 3)] ?? 0;
    bytes[offset++] = (a << 2) | (b >> 4);
    if (clean[index + 2] !== "=" && offset < bytes.length) bytes[offset++] = ((b & 15) << 4) | (c >> 2);
    if (clean[index + 3] !== "=" && offset < bytes.length) bytes[offset++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, offset);
}

const readUint16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const readUint32 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

interface SnapshotPayload {
  header: string;
  stops: string;
  routes: string;
  trips: string;
  stopTimes: string;
}

function decodeRows(bytes: Uint8Array, widths: number[]): number[][] {
  const size = widths.reduce((sum, width) => sum + width, 0);
  const rows: number[][] = [];
  for (let offset = 0; offset + size <= bytes.length; offset += size) {
    const row: number[] = [];
    let cursor = offset;
    for (const width of widths) {
      row.push(width === 1 ? bytes[cursor] : width === 2 ? readUint16(bytes, cursor) : readUint32(bytes, cursor));
      cursor += width;
    }
    rows.push(row);
  }
  return rows;
}

/** All GTFS dates and times are interpreted in Europe/Warsaw, not the browser zone. */
const ZONE = "Europe/Warsaw";
const dateNumber = (date: Date) => Number(DateTime.fromJSDate(date, { zone: ZONE }).toFormat("yyyyMMdd"));
const dateFromKey = (value: number) =>
  DateTime.fromFormat(String(value), "yyyyMMdd", { zone: ZONE }).startOf("day");

export function gtfsDateKey(date: Date): number {
  return dateNumber(date);
}

export function gtfsDateLabel(value: number): string {
  return dateFromKey(value).toFormat("dd.MM.yyyy");
}

function serviceDateOffset(from: Date, offset: number): Date {
  return DateTime.fromJSDate(from, { zone: ZONE }).plus({ days: offset }).startOf("day").toJSDate();
}

function normalizeStopName(value: string): string {
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

let cache: Promise<GtfsData> | null = null;

/** Decodes the bundled snapshot; heavy work happens once, on first use. */
export function loadGtfsData(): Promise<GtfsData> {
  if (cache) return cache;
  cache = import("./gtfsWalbrzych.generated")
    .then(({ GTFS_WALBRZYCH_GZIP }) => {
      const compressed = decodeBase64(GTFS_WALBRZYCH_GZIP);
      const payload = JSON.parse(strFromU8(gunzipSync(compressed))) as SnapshotPayload;
      const header = JSON.parse(strFromU8(decodeBase64(payload.header))) as {
        metadata: GtfsData["meta"];
        strings: string[];
        services: Array<[number, number[]]>;
      };
      const strings = header.strings;
      const stopRows = decodeRows(decodeBase64(payload.stops), [2, 4, 4, 2, 2]);
      const routeRows = decodeRows(decodeBase64(payload.routes), [2, 2, 2]);
      const tripRows = decodeRows(decodeBase64(payload.trips), [2, 2, 2, 2, 1]);
      const timeRows = decodeRows(decodeBase64(payload.stopTimes), [2, 2, 1, 2, 2]);

      const stops: GtfsStop[] = stopRows.map((row) => ({
        id: `gtfs-${row[0]}-${row[1]}-${row[2]}`,
        name: strings[row[0]] ?? "Przystanek",
        lat: row[1] / 1e6,
        lon: (row[2] > 0x7fffffff ? row[2] - 0x100000000 : row[2]) / 1e6,
        code: strings[row[3]] || undefined,
        agency: strings[row[4]] ?? "ZDKiUM",
      }));
      const routes: GtfsRoute[] = routeRows.map((row, index) => ({
        id: `route-${index}`,
        short: strings[row[0]] ?? String(index),
        long: strings[row[1]] ?? "",
        agency: strings[row[2]] ?? "ZDKiUM",
      }));
      const services = new Map<string, Set<number>>();
      for (const [serviceIndex, dates] of header.services) {
        services.set(strings[serviceIndex] ?? String(serviceIndex), new Set(dates));
      }
      const trips: GtfsData["trips"] = tripRows.map((row) => ({
        id: strings[row[0]] ?? `trip-${row[0]}`,
        routeIndex: row[1],
        serviceId: header.services[row[2]] ? (strings[header.services[row[2]][0]] ?? "") : "",
        headsign: strings[row[3]] ?? "",
        direction: row[4],
      }));
      const departuresByStop = new Map<string, Array<{ tripIndex: number; departure: number; arrival: number }>>();
      for (const [tripIndex, stopIndex, , departure, arrival] of timeRows) {
        const stop = stops[stopIndex];
        if (!stop) continue;
        const list = departuresByStop.get(stop.id) ?? [];
        list.push({ tripIndex, departure, arrival });
        departuresByStop.set(stop.id, list);
      }
      for (const list of departuresByStop.values()) list.sort((a, b) => a.departure - b.departure);
      for (const stop of stops) stop.normalized = normalizeStopName(stop.name);
      return {
        stops,
        routes,
        services,
        trips,
        departuresByStop,
        meta: { ...header.metadata, counts: header.metadata.counts ?? {} },
      };
    })
    .catch((error) => {
      cache = null;
      throw error;
    });
  return cache;
}

function activeServiceIds(data: GtfsData, date: Date): Set<string> {
  const key = dateNumber(date);
  const active = new Set<string>();
  for (const [serviceId, dates] of data.services) {
    if (dates.has(key)) active.add(serviceId);
  }
  return active;
}

/**
 * Next departures from one GTFS stop. Handles GTFS times after midnight (>= 24:00)
 * and services whose calendar uses only explicit dates.
 */
export function nextGtfsDepartures(
  data: GtfsData,
  stopId: string,
  from: Date,
  limit = 8
): GtfsDeparture[] {
  const stopTimes = data.departuresByStop.get(stopId);
  if (!stopTimes?.length) return [];
  const fromTime = from.getTime();
  const results: GtfsDeparture[] = [];
  // Yesterday is included because a 24:xx service belongs to the previous date.
  for (const dayOffset of [-1, 0, 1]) {
    const serviceDate = serviceDateOffset(from, dayOffset);
    const active = activeServiceIds(data, serviceDate);
    if (!active.size) continue;
    const serviceStart = DateTime.fromJSDate(serviceDate, { zone: ZONE }).startOf("day").toJSDate();
    for (const { tripIndex, departure, arrival } of stopTimes) {
      const trip = data.trips[tripIndex];
      if (!trip || !active.has(trip.serviceId)) continue;
      const at = new Date(serviceStart.getTime() + departure * 60000);
      if (at.getTime() < fromTime) continue;
      const route = data.routes[trip.routeIndex];
      results.push({
        minutes: departure,
        serviceDate: `${dateNumber(serviceDate)}`,
        tripId: trip.id,
        route: route ?? { id: "unknown", short: "?", long: "", agency: "" },
        headsign: trip.headsign,
        direction: trip.direction,
        at,
        arrivalAt: new Date(serviceStart.getTime() + arrival * 60000),
      });
    }
  }
  return results.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}

export function findGtfsStopByCoordinates(
  data: GtfsData,
  lat: number,
  lon: number,
  name?: string,
  maxMeters = 120
): GtfsStop | null {
  const target = name ? normalizeStopName(name) : "";
  let best: GtfsStop | null = null;
  let bestDistance = maxMeters;
  for (const stop of data.stops) {
    const dLat = (stop.lat - lat) * 110540;
    const dLon = (stop.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
    const distance = Math.hypot(dLat, dLon);
    if (distance > bestDistance) continue;
    const normalized = stop.normalized ?? normalizeStopName(stop.name);
    const comparable =
      !target ||
      normalized === target ||
      normalized.includes(target) ||
      target.includes(normalized);
    if (!comparable) continue;
    bestDistance = distance;
    best = stop;
  }
  return best;
}

export function formatGtfsTime(value: Date): string {
  return DateTime.fromJSDate(value, { zone: ZONE }).toFormat("HH:mm");
}

export function formatGtfsDate(value: Date): string {
  return DateTime.fromJSDate(value, { zone: ZONE }).setLocale("pl").toFormat("ccc, dd.MM.yyyy");
}
