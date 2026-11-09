import { db } from "@/db";
import { liveTripBrigades } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { LiveBusVehicle, LiveTrafficSummary } from "@/lib/types";
import { loadOperatorOverrides, resolveWalbrzychOperator } from "./fleetOperators";
import { pruneSpeedHistory, trackSpeed } from "./vehicleSpeed";

const ZBIORKOM_POSITIONS_URL =
  "https://api.zbiorkom.live/api6-open/walbrzych/positions/16.00,50.55,16.60,50.95";
const ZBIORKOM_GTFS_RT_URL =
  "https://api.zbiorkom.live/api6-open/walbrzych/gtfsRealtime/default/vehiclePositions,tripUpdates";

export type { LiveBusVehicle, LiveTrafficSummary };
export { resolveWalbrzychOperator };

export interface LiveFleetPayload {
  vehicles: LiveBusVehicle[];
  traffic: LiveTrafficSummary;
  source: string;
}

export function formatKursowkaCode(routeName: string, brigade?: string | null): string {
  const cleanRoute = routeName.trim().toUpperCase();
  const cleanBrigade = (brigade ?? "").trim();
  if (!cleanRoute) return cleanBrigade;
  if (!cleanBrigade) return cleanRoute;
  const padded = /^\d+$/.test(cleanBrigade)
    ? cleanBrigade.padStart(2, "0")
    : cleanBrigade;
  return `${cleanRoute}/${padded}`;
}

/* ---------------- Minimal zero-dep GTFS-RT protobuf wire parser ---------------- */

type PbField = [number, unknown];

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let factor = 1;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result += (byte & 0x7f) * factor;
    if (!(byte & 0x80)) break;
    factor *= 128;
  }
  return [result, pos];
}

function decodeProto(buf: Uint8Array, depth = 0): { ok: boolean; fields: PbField[] } {
  let pos = 0;
  const fields: PbField[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  while (pos < buf.length) {
    const [tag, p1] = readVarint(buf, pos);
    pos = p1;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;
    if (fieldNumber === 0) return { ok: false, fields };
    if (wireType === 0) {
      const [val, p2] = readVarint(buf, pos);
      pos = p2;
      fields.push([fieldNumber, val]);
    } else if (wireType === 1) {
      if (pos + 8 > buf.length) return { ok: false, fields };
      const view = new DataView(buf.buffer, buf.byteOffset + pos, 8);
      fields.push([fieldNumber, view.getFloat64(0, true)]);
      pos += 8;
    } else if (wireType === 2) {
      const [len, p2] = readVarint(buf, pos);
      pos = p2;
      if (len < 0 || pos + len > buf.length) return { ok: false, fields };
      const slice = buf.subarray(pos, pos + len);
      pos += len;
      let parsedSub = false;
      if (depth < 4 && len >= 2) {
        const sub = decodeProto(slice, depth + 1);
        if (sub.ok && sub.fields.length > 0) {
          // Verify at least one sensible field if string-looking
          const text = decoder.decode(slice);
          const allAsciiWord = /^[A-Za-z0-9_.:/\- ]+$/.test(text);
          if (!allAsciiWord || len > 16) {
            fields.push([fieldNumber, sub.fields]);
            parsedSub = true;
          }
        }
      }
      if (!parsedSub) {
        fields.push([fieldNumber, decoder.decode(slice)]);
      }
    } else if (wireType === 5) {
      if (pos + 4 > buf.length) return { ok: false, fields };
      const view = new DataView(buf.buffer, buf.byteOffset + pos, 4);
      fields.push([fieldNumber, view.getFloat32(0, true)]);
      pos += 4;
    } else {
      return { ok: false, fields };
    }
  }
  return { ok: pos === buf.length, fields };
}

function getField(fields: PbField[] | undefined, num: number): unknown {
  if (!Array.isArray(fields)) return undefined;
  return fields.find(([n]) => n === num)?.[1];
}

interface RtTripMatch {
  tripId: string;
  routeId: string;
  vehicleLabel: string;
}

async function fetchGtfsRtTripMap(): Promise<Map<string, RtTripMatch>> {
  const map = new Map<string, RtTripMatch>();
  try {
    const res = await fetch(ZBIORKOM_GTFS_RT_URL, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return map;
    const buf = new Uint8Array(await res.arrayBuffer());
    const root = decodeProto(buf);
    for (const [fn, val] of root.fields) {
      if (fn !== 2 || !Array.isArray(val)) continue;
      const entity = val as PbField[];
      const vp = getField(entity, 4) as PbField[] | undefined;
      if (!vp) continue;
      const trip = getField(vp, 1) as PbField[] | undefined;
      const veh = getField(vp, 8) as PbField[] | undefined;
      const tripId = typeof getField(trip, 1) === "string" ? (getField(trip, 1) as string) : "";
      const routeId = typeof getField(trip, 5) === "string" ? (getField(trip, 5) as string) : "";
      const label =
        typeof getField(veh, 2) === "string"
          ? (getField(veh, 2) as string)
          : typeof getField(veh, 1) === "string"
            ? (getField(veh, 1) as string).split(":").pop() ?? ""
            : "";
      if (label && tripId) {
        map.set(label, { tripId, routeId, vehicleLabel: label });
      }
    }
  } catch {
    // Non-fatal: positions JSON still works without protobuf trip map
  }
  return map;
}

interface RawZbiorkomPosition {
  vehicle?: { id?: string; type?: string; agency?: string; model?: string | null };
  routeName?: string;
  routeColor?: string;
  brigade?: string;
  location?: [number, number];
  timestamp?: number;
  bearing?: number;
  delay?: number;
  headsign?: string | null;
  upcomingStops?: Array<{
    sequence: number;
    name: string;
    scheduledArrival: number;
    scheduledDeparture: number;
  }>;
}

let liveCache: { at: number; data: LiveFleetPayload } | null = null;
const LIVE_CACHE_TTL_MS = 8_000;

export async function getLiveWalbrzychBuses(forceRefresh = false): Promise<LiveFleetPayload> {
  if (!forceRefresh && liveCache && Date.now() - liveCache.at < LIVE_CACHE_TTL_MS) {
    return liveCache.data;
  }

  const [posRes, tripMap] = await Promise.all([
    fetch(ZBIORKOM_POSITIONS_URL, {
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    }),
    fetchGtfsRtTripMap(),
  ]);

  if (!posRes.ok) {
    throw new Error(`Błąd pobierania pozycji GPS: HTTP ${posRes.status}`);
  }

  const json = (await posRes.json()) as { positions?: RawZbiorkomPosition[] };
  const rawPositions = Array.isArray(json.positions) ? json.positions : [];

  const overrides = await loadOperatorOverrides();
  const vehicles: LiveBusVehicle[] = [];
  const operatorBreakdown = { mzuk: 0, ska: 0, other: 0 };
  const delays: number[] = [];
  let onTimeCount = 0;
  let delayedCount = 0;
  let trackedOnTripCount = 0;

  for (const pos of rawPositions) {
    const vehicleId = String(pos.vehicle?.id ?? "").trim();
    const loc = pos.location;
    if (!vehicleId || !Array.isArray(loc) || loc.length < 2) continue;
    const [lon, lat] = loc;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const op = resolveWalbrzychOperator(vehicleId, pos.vehicle?.model, overrides);
    operatorBreakdown[op.key] += 1;

    const routeName = String(pos.routeName ?? "").trim();
    const brigade = String(pos.brigade ?? "").trim();
    const kursowka = formatKursowkaCode(routeName, brigade);
    const rtMatch = tripMap.get(vehicleId);
    const tripId = rtMatch?.tripId ?? null;
    if (tripId) trackedOnTripCount += 1;

    const delaySeconds = Math.round(Number(pos.delay ?? 0) / 1000);
    delays.push(delaySeconds);
    if (delaySeconds > 120) delayedCount += 1;
    else onTimeCount += 1;

    const rawColor = String(pos.routeColor ?? "").trim();
    const routeColor = rawColor
      ? rawColor.startsWith("#")
        ? rawColor
        : `#${rawColor}`
      : "#0d4f3b";

    vehicles.push({
      vehicleId,
      model: pos.vehicle?.model ?? null,
      operatorKey: op.key,
      operatorName: op.name,
      operatorSource: op.source,
      routeName,
      routeColor,
      brigade,
      kursowka,
      tripId,
      lat,
      lon,
      bearing: typeof pos.bearing === "number" ? pos.bearing : null,
      delaySeconds,
      speedKmh: trackSpeed(
        vehicleId,
        lat,
        lon,
        typeof pos.timestamp === "number" ? pos.timestamp : Date.now()
      ),
      headsign: pos.headsign ?? null,
      timestamp: typeof pos.timestamp === "number" ? pos.timestamp : Date.now(),
      upcomingStops: Array.isArray(pos.upcomingStops) ? pos.upcomingStops : [],
    });
  }

  pruneSpeedHistory();

  // Persist observed live trip -> kursówka mappings in PostgreSQL (non-blocking)
  void persistLiveBrigades(vehicles);

  const positiveDelays = delays.map((d) => Math.max(0, d));
  const avgDelaySeconds = positiveDelays.length
    ? Math.round(positiveDelays.reduce((a, b) => a + b, 0) / positiveDelays.length)
    : 0;
  const maxDelaySeconds = positiveDelays.length ? Math.max(...positiveDelays) : 0;
  const delayedShare = vehicles.length ? delayedCount / vehicles.length : 0;
  const congestionLevel: LiveTrafficSummary["congestionLevel"] =
    avgDelaySeconds >= 150 || delayedShare >= 0.35
      ? "wysoki"
      : avgDelaySeconds >= 45 || delayedShare >= 0.15
        ? "umiarkowany"
        : "niski";

  const recommendedPeakPercent = Math.min(
    80,
    Math.max(10, Math.round((avgDelaySeconds / 300) * 45 + delayedShare * 35))
  );

  const payload: LiveFleetPayload = {
    vehicles,
    traffic: {
      totalVehicles: vehicles.length,
      trackedOnTripCount,
      avgDelaySeconds,
      maxDelaySeconds,
      delayedCount,
      onTimeCount,
      congestionLevel,
      recommendedPeakPercent,
      operatorBreakdown,
      fetchedAt: Date.now(),
    },
    source: "api.zbiorkom.live (MZUK / ŚKA Wałbrzych)",
  };

  liveCache = { at: Date.now(), data: payload };
  return payload;
}

let lastPersistAt = 0;

async function persistLiveBrigades(vehicles: LiveBusVehicle[]): Promise<void> {
  if (Date.now() - lastPersistAt < 25_000) return;
  lastPersistAt = Date.now();
  const candidates = vehicles.filter((v) => v.tripId && v.brigade && v.routeName);
  if (!candidates.length) return;
  try {
    for (const v of candidates) {
      const padded = /^\d+$/.test(v.brigade) ? v.brigade.padStart(2, "0") : v.brigade;
      await db
        .insert(liveTripBrigades)
        .values({
          tripId: v.tripId!,
          routeShort: v.routeName.toUpperCase(),
          brigadeNum: padded,
          kursowkaCode: v.kursowka,
          vehicleId: v.vehicleId,
          operatorName: v.operatorName,
          observedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: liveTripBrigades.tripId,
          set: {
            routeShort: v.routeName.toUpperCase(),
            brigadeNum: padded,
            kursowkaCode: v.kursowka,
            vehicleId: v.vehicleId,
            operatorName: v.operatorName,
            observedAt: new Date(),
          },
          setWhere: sql`live_trip_brigades.route_short IS DISTINCT FROM excluded.route_short OR live_trip_brigades.brigade_num IS DISTINCT FROM excluded.brigade_num OR live_trip_brigades.kursowka_code IS DISTINCT FROM excluded.kursowka_code OR live_trip_brigades.vehicle_id IS DISTINCT FROM excluded.vehicle_id OR live_trip_brigades.operator_name IS DISTINCT FROM excluded.operator_name`,
        });

      // Assignments are rebuilt from observations by gtfsSync, never changed by array position.

    }
  } catch {
    // Best-effort persistence; never break live GPS response
  }
}
