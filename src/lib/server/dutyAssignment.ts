import { normalizeDutyCode } from "../transit";

export interface ScheduleTrip {
  rawTripId: string;
  routeId: string;
  routeShort: string;
  startMinutes: number;
  endMinutes: number;
  firstStopId: string;
  lastStopId: string;
  /** Only a real GTFS block_id, not the upstream 0/1 direction-like brigade flag. */
  explicitBrigade?: string;
}
export interface DutyObservation {
  tripId: string;
  routeShort: string;
  kursowkaCode: string;
  brigadeNum: string;
}
export interface DutyStop { lat: number; lon: number }
export type TripAssignmentSource = "gtfs" | "live_gps" | "estimated";
export interface AssignedDuty {
  routeId: string;
  routeShort: string;
  brigadeNum: string;
  kursowkaCode: string;
  source: "gtfs" | "live_gps" | "gps_estimated" | "unassigned" | "conflict";
  trips: Array<{ trip: ScheduleTrip; source: TripAssignmentSource }>;
}

function distance(a?: DutyStop, b?: DutyStop): number {
  if (!a || !b) return Infinity;
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function explicitCode(route: string, value?: string): string | null {
  const raw = value?.trim();
  // This feed's brigade column contains only 0/1 flags, not usable duty numbers.
  if (!raw || raw === "0" || raw === "1") return null;
  const code = normalizeDutyCode(raw.includes("/") ? raw : `${route}/${raw}`);
  return code.startsWith(`${route.toUpperCase()}/`) ? code : null;
}

/**
 * Never invent a numbered duty or overwrite a GPS assignment with a greedy index.
 * Confirmed observations anchor a duty. Remaining trips can be estimated only when
 * both time and terminal continuity fit; all other trips remain visible as unassigned.
 * Each input trip is emitted exactly once. Source-time conflicts are flagged, never hidden.
 */
export function assignDuties(
  input: ScheduleTrip[],
  stops: Map<string, DutyStop>,
  observations: DutyObservation[]
): AssignedDuty[] {
  if (!input.length) return [];
  const { routeId, routeShort } = input[0];
  const trips = [...input].sort((a, b) => a.startMinutes - b.startMinutes || a.rawTripId.localeCompare(b.rawTripId));
  const observed = new Map(observations.filter((o) => o.routeShort.toUpperCase() === routeShort.toUpperCase()).map((o) => [o.tripId, o]));
  const blocks = new Map<string, AssignedDuty>();
  const unassigned: AssignedDuty["trips"] = [];
  const codeFor = (trip: ScheduleTrip) => observed.get(trip.rawTripId)?.kursowkaCode ?? explicitCode(routeShort, trip.explicitBrigade);
  const create = (code: string): AssignedDuty => ({
    routeId, routeShort, brigadeNum: code.split("/")[1], kursowkaCode: code,
    source: "gtfs", trips: [],
  });

  // Seed confirmed/declared duties before considering any estimated connection.
  for (const trip of trips) {
    const code = codeFor(trip);
    if (!code) continue;
    const block = blocks.get(code) ?? create(code);
    const source = observed.has(trip.rawTripId) ? "live_gps" : "gtfs";
    block.trips.push({ trip, source });
    blocks.set(code, block);
  }

  for (const trip of trips) {
    if (codeFor(trip)) continue;
    let best: AssignedDuty | null = null;
    let bestScore = Infinity;
    for (const block of blocks.values()) {
      const ordered = [...block.trips].sort((a, b) => a.trip.startMinutes - b.trip.startMinutes);
      const prev = ordered.filter(({ trip: t }) => t.endMinutes <= trip.startMinutes).at(-1)?.trip;
      const next = ordered.find(({ trip: t }) => t.startMinutes >= trip.endMinutes)?.trip;
      if (!prev && !next) continue;
      const beforeGap = prev ? trip.startMinutes - prev.endMinutes : Infinity;
      const afterGap = next ? next.startMinutes - trip.endMinutes : Infinity;
      const gap = Math.min(beforeGap, afterGap);
      if (gap < 2 || gap > 90) continue;
      const beforeDistance = prev ? distance(stops.get(prev.lastStopId), stops.get(trip.firstStopId)) : Infinity;
      const afterDistance = next ? distance(stops.get(trip.lastStopId), stops.get(next.firstStopId)) : Infinity;
      const metres = Math.min(beforeDistance, afterDistance);
      if (metres > 8000 || (metres > 2500 && gap < 15)) continue;
      const score = gap + metres / 100;
      if (score < bestScore) { best = block; bestScore = score; }
    }
    if (best) best.trips.push({ trip, source: "estimated" });
    else unassigned.push({ trip, source: "estimated" });
  }

  const result = [...blocks.values()].filter((block) => block.trips.length > 0);
  for (const block of result) {
    block.trips.sort((a, b) => a.trip.startMinutes - b.trip.startMinutes);
    const confirmed = block.trips.filter((t) => t.source === "live_gps").length;
    const estimated = block.trips.some((t) => t.source === "estimated");
    const conflict = block.trips.some(({ trip }, index) => index > 0 && trip.startMinutes < block.trips[index - 1].trip.endMinutes);
    block.source = conflict ? "conflict" : confirmed ? (estimated ? "gps_estimated" : "live_gps") : "gtfs";
  }
  result.sort((a, b) => a.brigadeNum.localeCompare(b.brigadeNum, "pl", { numeric: true }));
  if (unassigned.length) {
    unassigned.sort((a, b) => a.trip.startMinutes - b.trip.startMinutes);
    result.push({ routeId, routeShort, brigadeNum: "?", kursowkaCode: `${routeShort.toUpperCase()}/?`, source: "unassigned", trips: unassigned });
  }
  return result;
}
