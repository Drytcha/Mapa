import { db } from "@/db";
import { gtfsStops } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { BusStop } from "@/lib/types";
import { ensureGtfsSeeded } from "./gtfsSync";
import { loadOfficialStops } from "./officialStops";

export interface TimetableStopsResult {
  stops: BusStop[];
  meta: {
    total: number;
    fromGtfs: number;
    officialOnly: number;
    officialSource: string;
    officialFetchedAt: string | null;
  };
}

const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\(?\bna zadanie\b\)?|\(?\bna żądanie\b\)?|\bn\/z\b|\bnz\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Niepodległości -Kaszubska" -> "Niepodległości - Kaszubska"; keeps "Jedlina-Zdrój". */
export function tidyStopName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+-(?=\S)/g, " - ")
    .replace(/(\S)-\s+/g, "$1 - ")
    .replace(/\s+,/g, ",")
    .trim();
}

function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 110540;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

function compareLines(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na) return -1;
  if (nb) return 1;
  return a.localeCompare(b, "pl");
}

let cache: { at: number; value: TimetableStopsResult } | null = null;
const TTL_MS = 10 * 60_000;

export function invalidateTimetableStops(): void {
  cache = null;
}

export async function getTimetableStops(force = false): Promise<TimetableStopsResult> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  await ensureGtfsSeeded();
  const [gtfs, official, lineRows, destRows] = await Promise.all([
    db.select().from(gtfsStops),
    loadOfficialStops(),
    db.execute(sql`
      select distinct st.stop_id as stop_id, r.short_name as short_name
      from gtfs_stop_times st
      join gtfs_trips t on t.id = st.trip_id
      join gtfs_routes r on r.id = t.route_id
    `),
    db.execute(sql`
      select st.stop_id as stop_id, t.last_stop_name as dest, count(*)::int as c
      from gtfs_stop_times st
      join gtfs_trips t on t.id = st.trip_id
      group by st.stop_id, t.last_stop_name
    `),
  ]);

  const linesByStop = new Map<string, Set<string>>();
  for (const row of lineRows.rows as Array<{ stop_id: string; short_name: string }>) {
    const set = linesByStop.get(row.stop_id) ?? new Set<string>();
    set.add(row.short_name);
    linesByStop.set(row.stop_id, set);
  }
  const topDest = new Map<string, { dest: string; c: number }>();
  for (const row of destRows.rows as Array<{ stop_id: string; dest: string; c: number }>) {
    const current = topDest.get(row.stop_id);
    if (!current || row.c > current.c) topDest.set(row.stop_id, { dest: row.dest, c: row.c });
  }

  const stops: BusStop[] = [];
  const usedOfficial = new Set<number>();

  for (const g of gtfs) {
    // Nearest official stop (<= 45 m) with a compatible name enriches the entry with its lines
    let best: (typeof official.stops)[number] | null = null;
    let bestDistance = 45;
    for (const o of official.stops) {
      const d = metres(g.lat, g.lon, o.lat, o.lon);
      if (d > bestDistance) continue;
      const a = fold(g.name);
      const b = fold(o.name);
      const compatible = d <= 12 || a === b || a.includes(b) || b.includes(a);
      if (!compatible) continue;
      best = o;
      bestDistance = d;
    }
    if (best) usedOfficial.add(best.id);
    const lines = new Set<string>([...(linesByStop.get(g.id) ?? []), ...(best?.lines ?? [])]);
    stops.push({
      id: `tt-${g.id}`,
      gtfsId: g.id,
      name: tidyStopName(g.name),
      lat: g.lat,
      lon: g.lon,
      lines: [...lines].sort(compareLines),
      shelter: false,
      operator: "Rozkład jazdy Wałbrzych",
      kind: "bus_stop",
      source: "timetable",
      ref: g.platformCode || undefined,
    });
  }

  // Stops that exist only in the official timetable (no GTFS counterpart) but are served by lines
  let officialOnly = 0;
  for (const o of official.stops) {
    if (usedOfficial.has(o.id) || o.lines.length === 0) continue;
    const near = stops.some(
      (s) => metres(s.lat, s.lon, o.lat, o.lon) <= 30 && fold(s.name) === fold(o.name)
    );
    if (near) continue;
    officialOnly += 1;
    stops.push({
      id: `rj-${o.id}`,
      name: tidyStopName(o.name),
      lat: o.lat,
      lon: o.lon,
      lines: [...o.lines].sort(compareLines),
      shelter: false,
      operator: "Rozkład jazdy Wałbrzych (rozklad.walbrzych.eu)",
      kind: "bus_stop",
      source: "timetable",
    });
  }

  // Opposite platforms of one named stop get a direction hint so they are distinguishable
  const groups = new Map<string, BusStop[]>();
  for (const s of stops) {
    const key = fold(s.name);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const close = list.filter((s) =>
      list.some((o) => o !== s && metres(s.lat, s.lon, o.lat, o.lon) <= 300)
    );
    for (const s of close) {
      const dest = s.gtfsId ? topDest.get(s.gtfsId)?.dest : undefined;
      if (dest && fold(dest) !== fold(s.name)) s.towards = tidyStopName(dest);
    }
  }

  stops.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const value: TimetableStopsResult = {
    stops,
    meta: {
      total: stops.length,
      fromGtfs: gtfs.length,
      officialOnly,
      officialSource: official.source,
      officialFetchedAt: official.fetchedAt,
    },
  };
  cache = { at: Date.now(), value };
  return value;
}
