import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { trafficSignalsCache } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface RawSignalNode {
  id: string;
  lat: number;
  lon: number;
}

export interface DetectedSignalIntersection {
  id: string;
  lat: number;
  lon: number;
  routeOffsetMeters: number;
}

const WALBRZYCH_BBOX = {
  south: 50.69,
  west: 16.14,
  north: 50.88,
  east: 16.43,
};

let localWalbrzychSignals: RawSignalNode[] | null = null;

function getWalbrzychSignals(): RawSignalNode[] {
  if (localWalbrzychSignals) return localWalbrzychSignals;
  try {
    const filePath = path.join(process.cwd(), "src", "data", "walbrzych-signals.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{
      id?: number | string;
      lat?: number;
      lon?: number;
    }>;
    localWalbrzychSignals = raw
      .filter((el) => typeof el.lat === "number" && typeof el.lon === "number")
      .map((el) => ({
        id: String(el.id ?? `${el.lat},${el.lon}`),
        lat: el.lat!,
        lon: el.lon!,
      }));
  } catch {
    localWalbrzychSignals = [];
  }
  return localWalbrzychSignals;
}

function insideWalbrzych(south: number, west: number, north: number, east: number): boolean {
  return (
    south >= WALBRZYCH_BBOX.south &&
    west >= WALBRZYCH_BBOX.west &&
    north <= WALBRZYCH_BBOX.north &&
    east <= WALBRZYCH_BBOX.east
  );
}

async function fetchOverpassSignals(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<RawSignalNode[]> {
  const query = `[out:json][timeout:10];node["highway"="traffic_signals"](${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)});out body;`;
  const endpoints = [
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "MapPlaner-Walbrzych/1.0",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        elements?: Array<{ id: number; lat?: number; lon?: number }>;
      };
      if (!Array.isArray(json.elements)) continue;
      return json.elements
        .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
        .map((e) => ({ id: String(e.id), lat: e.lat!, lon: e.lon! }));
    } catch {
      // Try next mirror
    }
  }
  return [];
}

function metersPerDeg(lat: number): { latM: number; lonM: number } {
  return {
    latM: 110540,
    lonM: 111320 * Math.cos((lat * Math.PI) / 180),
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const { latM, lonM } = metersPerDeg((lat1 + lat2) / 2);
  return Math.hypot((lat2 - lat1) * latM, (lon2 - lon1) * lonM);
}

/** Distance from point P to segment AB in meters, plus fraction t along AB [0..1]. */
function pointToSegmentMeters(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { distance: number; t: number } {
  const { latM, lonM } = metersPerDeg(pLat);
  const px = (pLon - aLon) * lonM;
  const py = (pLat - aLat) * latM;
  const bx = (bLon - aLon) * lonM;
  const by = (bLat - aLat) * latM;
  const len2 = bx * bx + by * by;
  if (len2 <= 1e-6) return { distance: Math.hypot(px, py), t: 0 };
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const cx = bx * t;
  const cy = by * t;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

export async function detectTrafficSignalsAlongRoute(
  coords: [number, number][]
): Promise<{
  intersections: DetectedSignalIntersection[];
  count: number;
  source: string;
}> {
  if (!coords || coords.length < 2) {
    return { intersections: [], count: 0, source: "none" };
  }

  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const [lat, lon] of coords) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  const pad = 0.004;
  south -= pad;
  west -= pad;
  north += pad;
  east += pad;

  let nodes: RawSignalNode[] = [];
  let source = "osm-walbrzych-local";

  if (insideWalbrzych(south, west, north, east)) {
    nodes = getWalbrzychSignals().filter(
      (n) => n.lat >= south && n.lat <= north && n.lon >= west && n.lon <= east
    );
  } else {
    const bboxKey = [south, west, north, east].map((v) => v.toFixed(2)).join(",");
    const [cached] = await db
      .select()
      .from(trafficSignalsCache)
      .where(eq(trafficSignalsCache.bboxKey, bboxKey));

    if (cached && Date.now() - cached.fetchedAt.getTime() < 7 * 24 * 3600 * 1000) {
      nodes = cached.signalsJson;
      source = "osm-overpass-cache";
    } else {
      // Combine any local Walbrzych nodes plus Overpass for outer region
      const remote = await fetchOverpassSignals(south, west, north, east);
      const localOverlap = getWalbrzychSignals().filter(
        (n) => n.lat >= south && n.lat <= north && n.lon >= west && n.lon <= east
      );
      const merged = new Map<string, RawSignalNode>();
      for (const n of [...localOverlap, ...remote]) merged.set(n.id, n);
      nodes = Array.from(merged.values());
      source = remote.length > 0 ? "osm-overpass-live" : "osm-walbrzych-local";
      if (remote.length > 0) {
        try {
          await db
            .insert(trafficSignalsCache)
            .values({ bboxKey, signalsJson: nodes, fetchedAt: new Date() })
            .onConflictDoUpdate({
              target: trafficSignalsCache.bboxKey,
              set: { signalsJson: nodes, fetchedAt: new Date() },
            });
        } catch {
          // Cache write optional
        }
      }
    }
  }

  if (!nodes.length) {
    return { intersections: [], count: 0, source };
  }

  // Compute cumulative distance along route vertices
  const cumMeters: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cumMeters.push(
      cumMeters[i - 1] +
        haversineMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
    );
  }

  // Match nodes within 26 meters of route polyline
  const hits: DetectedSignalIntersection[] = [];
  for (const node of nodes) {
    if (
      node.lat < south ||
      node.lat > north ||
      node.lon < west ||
      node.lon > east
    ) {
      continue;
    }
    let bestDist = 26;
    let bestOffset = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const a = coords[i - 1];
      const b = coords[i];
      const seg = pointToSegmentMeters(node.lat, node.lon, a[0], a[1], b[0], b[1]);
      if (seg.distance <= bestDist) {
        bestDist = seg.distance;
        bestOffset = cumMeters[i - 1] + (cumMeters[i] - cumMeters[i - 1]) * seg.t;
      }
    }
    if (bestDist < 26) {
      hits.push({
        id: node.id,
        lat: node.lat,
        lon: node.lon,
        routeOffsetMeters: Math.round(bestOffset),
      });
    }
  }

  // Sort along route and cluster signal nodes within 55m (multi-approach intersections)
  hits.sort((a, b) => a.routeOffsetMeters - b.routeOffsetMeters);
  const clustered: DetectedSignalIntersection[] = [];
  for (const hit of hits) {
    const prev = clustered[clustered.length - 1];
    if (
      prev &&
      (Math.abs(hit.routeOffsetMeters - prev.routeOffsetMeters) <= 55 ||
        haversineMeters(hit.lat, hit.lon, prev.lat, prev.lon) <= 45)
    ) {
      continue;
    }
    clustered.push(hit);
  }

  return {
    intersections: clustered,
    count: clustered.length,
    source,
  };
}
