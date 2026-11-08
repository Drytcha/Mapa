import { PLACES } from "./data";
import { getFleet } from "./fleet";
import type {
  AvoidOptions,
  Place,
  ProfileMetrics,
  RouteData,
  RouteStep,
  SpeedOverrides,
  TruckParams,
  VehicleId,
  Waypoint,
} from "./types";
import { MAX_WAYPOINTS } from "./types";
import { BUS_ROUTING_URL, GEOCODING_URL, ROUTING_PROFILE, ROUTING_URL } from "./services";
import { withGeocodingSlot, withRoutingSlot } from "./requests";

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

const p2 = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, "0");

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const value = meters / 1000;
  return `${value.toLocaleString("pl-PL", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} km`;
}

export function formatDistanceCompact(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} km`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${p2(Math.floor(total / 3600))}h ${p2(Math.floor((total % 3600) / 60))}m ${p2(
    total % 60
  )}s`;
}

export function formatDurationShort(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${p2(m)}m`;
  if (m > 0) return `${m}m ${p2(s)}s`;
  return `${s}s`;
}

export function formatDelta(seconds: number, signed = true): string {
  if (Math.abs(seconds) < 1) return "—";
  const sign = seconds > 0 ? "+" : "−";
  const formatted = formatDurationShort(Math.abs(seconds));
  return signed ? `${sign}${formatted}` : formatted;
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/*  Profile calculations                                                      */
/* -------------------------------------------------------------------------- */

export function isValidSpeed(speed: unknown): speed is number {
  return typeof speed === "number" && Number.isFinite(speed) && speed >= 1 && speed <= 200;
}

export function durationAtSpeed(meters: number, speed: number): number {
  if (!Number.isFinite(meters) || meters < 0 || !isValidSpeed(speed)) {
    throw new Error("Prędkość musi mieścić się w zakresie 1-200 km/h.");
  }
  return Math.round((meters / 1000 / speed) * 3600);
}

export function getProfileMetrics(
  route: RouteData,
  vehicle: VehicleId,
  _truck: TruckParams | undefined,
  avoid: AvoidOptions,
  customSpeed?: number
): ProfileMetrics {
  const profile = getFleet().find((item) => item.id === vehicle) ?? getFleet()[0];
  const distance = route.distance;
  // Vehicle factors are planning estimates, not a verified HGV routing profile.
  const automaticDuration = Math.round(route.duration * profile.timeFactor);
  const speed = isValidSpeed(customSpeed) ? customSpeed : undefined;
  return {
    id: vehicle,
    distance,
    duration: speed === undefined ? automaticDuration : durationAtSpeed(distance, speed),
    automaticDuration,
    customSpeed: speed,
    restrictions: 0,
    toll: estimateToll(vehicle, distance, avoid, profile.weightT),
    name: profile.name,
    short: profile.short,
    profile,
  };
}

export function buildComparisons(
  route: RouteData,
  truck: TruckParams | undefined,
  avoid: AvoidOptions,
  speeds: SpeedOverrides = {}
): ProfileMetrics[] {
  return getFleet().map((profile) =>
    getProfileMetrics(route, profile.id, truck, avoid, speeds[profile.id])
  );
}

export function scaleRouteTimes(route: RouteData, duration: number): RouteData {
  const total = route.steps.reduce((sum, step) => sum + step.duration, 0);
  const totalDistance = route.steps.reduce((sum, step) => sum + step.distance, 0);
  let cumulative = 0;
  let allocated = 0;
  return {
    ...route,
    duration,
    steps: route.steps.map((step, index) => {
      cumulative += total > 0 ? step.duration / total : totalDistance > 0 ? step.distance / totalDistance : 0;
      const end = index === route.steps.length - 1 ? Math.round(duration) : Math.round(cumulative * duration);
      const scaled = Math.max(0, end - allocated);
      allocated = end;
      return { ...step, duration: scaled };
    }),
  };
}

export function estimateToll(vehicle: VehicleId, distance: number, avoid: AvoidOptions, weightT = 12): number {
  void vehicle;
  if (avoid.tolls) return 0;
  const rate = weightT > 18 ? 0.72 : weightT > 3.5 ? 0.48 : 0.26;
  return Math.round((distance / 1000) * rate * 100) / 100;
}

export function estimateAverageSpeed(meters: number, seconds: number): number {
  if (!seconds) return 0;
  return (meters / seconds) * 3.6;
}

/* -------------------------------------------------------------------------- */
/*  Small geo helpers                                                         */
/* -------------------------------------------------------------------------- */

const R = 6371000;

export function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function sumDistance(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/ą/g, "a")
    .replace(/ę/g, "e")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function nearestCoordIndex(coords: [number, number][], point: [number, number]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  coords.forEach((coord, index) => {
    const distance = haversine(coord, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** Returns a zero-based slot between intermediate points (0 = before first via). */
export function insertionSlot(
  route: RouteData,
  waypoints: Waypoint[],
  point: [number, number]
): number {
  const clickedIndex = nearestCoordIndex(route.coords, point);
  const internal = waypoints.slice(1, -1);
  return internal.filter(
    (waypoint) => nearestCoordIndex(route.coords, [waypoint.lat, waypoint.lon]) < clickedIndex
  ).length;
}

export function pointAtProgress(route: RouteData, progress: number): [number, number] {
  if (route.coords.length === 0) return [52.2297, 21.0122];
  if (route.coords.length === 1) return route.coords[0];
  const target = sumDistance(route.coords) * Math.min(1, Math.max(0, progress));
  let walked = 0;
  for (let i = 1; i < route.coords.length; i += 1) {
    const segment = haversine(route.coords[i - 1], route.coords[i]);
    if (walked + segment >= target) {
      const ratio = segment === 0 ? 0 : (target - walked) / segment;
      return [
        route.coords[i - 1][0] + (route.coords[i][0] - route.coords[i - 1][0]) * ratio,
        route.coords[i - 1][1] + (route.coords[i][1] - route.coords[i - 1][1]) * ratio,
      ];
    }
    walked += segment;
  }
  return route.coords[route.coords.length - 1];
}

export function currentStepForProgress(route: RouteData, progress: number) {
  if (!route.steps.length) return { index: 0, remaining: 0 };
  const totalDuration = route.steps.reduce((sum, step) => sum + step.duration, 0) || 1;
  const target = progress * totalDuration;
  let walked = 0;
  for (let i = 0; i < route.steps.length; i += 1) {
    walked += route.steps[i].duration;
    if (walked >= target) {
      return { index: i, remaining: route.steps[i].distance * Math.max(0.04, 1 - (walked - target) / Math.max(1, route.steps[i].duration)) };
    }
  }
  return { index: route.steps.length - 1, remaining: 0 };
}

/* -------------------------------------------------------------------------- */
/*  Local search + Nominatim geocoding                                        */
/* -------------------------------------------------------------------------- */

export function searchLocalPlaces(query: string): Place[] {
  const term = normalize(query.trim());
  if (!term) return PLACES.slice(0, 6);
  const terms = term.split(/\s+/);
  return PLACES.filter((place) => terms.every((part) => normalize(place.label).includes(part)))
    .sort((a, b) => {
      const aStarts = normalize(a.short).startsWith(term) ? 0 : 1;
      const bStarts = normalize(b.short).startsWith(term) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 6);
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  name?: string;
  address?: Record<string, string>;
}

const shortFromNominatim = (result: NominatimResult): string => {
  const address = result.address ?? {};
  const primary =
    result.name ||
    address.road ||
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    result.display_name.split(",")[0];
  const city =
    address.city || address.town || address.village || address.municipality || address.county;
  if (address.road && address.house_number) return `${address.road} ${address.house_number}`;
  if (city && primary !== city) return `${primary} · ${city}`;
  return primary;
};

const geocodeCache = new Map<string, { at: number; results: Place[] }>();

export async function geocode(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.results;
  const url = new URL(`${GEOCODING_URL}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "pl");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pl");

  const response = await withGeocodingSlot(() => fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  }), signal);
  if (!response.ok) throw new Error("Geocoder unavailable");
  const data = (await response.json()) as NominatimResult[];
  const results = data.map((item) => ({
    id: `osm-${item.place_id}`,
    label: item.display_name,
    short: shortFromNominatim(item),
    lat: Number(item.lat),
    lon: Number(item.lon),
    source: "osm" as const,
    kind: item.type,
  }));
  geocodeCache.set(cacheKey, { at: Date.now(), results });
  return results;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<Place | null> {
  const url = new URL(`${GEOCODING_URL}/reverse`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pl");
  try {
    const response = await withGeocodingSlot(() => fetch(url.toString(), {
      signal,
      headers: { Accept: "application/json" },
    }), signal);
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimResult;
    if (!data || !data.display_name) return null;
    return {
      id: `osm-${data.place_id ?? `${lat}-${lon}`}`,
      label: data.display_name,
      short: shortFromNominatim(data),
      lat,
      lon,
      source: "osm",
      kind: data.type,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Routing                                                                   */
/* -------------------------------------------------------------------------- */

const MODIFIERS: Record<string, string> = {
  left: "w lewo",
  right: "w prawo",
  "slight left": "lekko w lewo",
  "slight right": "lekko w prawo",
  "sharp left": "ostro w lewo",
  "sharp right": "ostro w prawo",
  straight: "prosto",
  uturn: "w kierunku przeciwnym",
};

export function polishInstruction(
  type: string,
  modifier = "straight",
  name = "",
  exit?: number
): string {
  const road = name?.trim();
  const toward = road ? ` w ${road}` : "";
  const direction = MODIFIERS[modifier] ?? "prosto";
  switch (type) {
    case "depart":
      return road ? `Wyjedź z ${road}` : "Rozpocznij trasę";
    case "arrive":
      return "Jesteś u celu podróży";
    case "turn":
      return modifier === "straight"
        ? `Jedź prosto${toward}`
        : `Skręć ${direction}${toward}`;
    case "new name":
    case "continue":
      return `Kontynuuj${toward || " prosto"}`;
    case "merge":
      return `Włącz się do ruchu${toward}`;
    case "fork":
      return `Na rozwidleniu trzymaj się ${direction}${toward}`;
    case "end of road":
      return `Na końcu drogi skręć ${direction}${toward}`;
    case "roundabout":
    case "rotary":
      return `Wjedź na rondo i zjedź ${exit ?? 1}. zjazdem${toward}`;
    case "on ramp":
      return `Wjedź na drogę${toward}`;
    case "off ramp":
      return `Zjedź z drogi${toward}`;
    case "notification":
      return road || "Kontynuuj trasę";
    default:
      return road ? `Kieruj się${toward}` : `Kontynuuj ${direction}`;
  }
}

interface OsrmResponse {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: Array<{
      distance?: number;
      duration?: number;
      steps: Array<{
        distance: number;
        duration: number;
        name: string;
        ref?: string;
        maneuver: {
          type: string;
          modifier?: string;
          exit?: number;
          location?: [number, number];
        };
      }>;
    }>;
  }>;
}

function parseOsrm(data: OsrmResponse, labels: string[]): RouteData {
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No route");
  const found = data.routes[0];
  const steps: RouteStep[] = [];
  const destination = labels[labels.length - 1] || "celu";
  found.legs.forEach((leg, legIndex) => {
    leg.steps.forEach((step) => {
      const type = step.maneuver.type;
      const rawRoad = step.name || step.ref || "";
      const road = /^\d+[a-zA-Z]?$/.test(rawRoad) ? `DK${rawRoad}` : rawRoad;
      const instruction =
        type === "arrive"
          ? legIndex === found.legs.length - 1
            ? `Dojedź do celu – ${destination}`
            : `Dojedź do punktu pośredniego – ${labels[legIndex + 1] ?? "punkt"}`
          : polishInstruction(
              type,
              step.maneuver.modifier,
              road,
              step.maneuver.exit
            );
      if (step.distance === 0 && type !== "depart" && type !== "arrive") return;
      steps.push({
        instruction,
        distance: step.distance,
        duration: step.duration,
        maneuver: type,
        modifier: step.maneuver.modifier,
        leg: legIndex,
        location: step.maneuver.location
          ? [step.maneuver.location[1], step.maneuver.location[0]]
          : undefined,
      });
    });
  });
  return {
    coords: found.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distance: found.distance,
    duration: found.duration,
    steps,
    legs: found.legs.map((leg) => ({
      distance: leg.distance ?? leg.steps.reduce((sum, step) => sum + step.distance, 0),
      duration: leg.duration ?? leg.steps.reduce((sum, step) => sum + step.duration, 0),
    })),
    engine: "osrm",
    labels,
  };
}

async function requestOsrm(
  waypoints: Waypoint[],
  avoid: AvoidOptions,
  signal?: AbortSignal
): Promise<RouteData> {
  const labels = waypoints.map((point) => point.short);
  const coords = waypoints.map((point) => `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
  const excludes = [avoid.tolls ? "toll" : "", avoid.ferries ? "ferry" : ""].filter(Boolean).join(",");
  // A self-hosted OSRM can expose a real bus profile; public OSRM exposes `driving`.
  const endpoint = ROUTING_PROFILE === "bus" ? BUS_ROUTING_URL : ROUTING_URL;
  const url = new URL(`${endpoint}/route/v1/${ROUTING_PROFILE}/${coords}`);
  url.searchParams.set("annotations", "distance,duration");
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("continue_straight", "false");
  if (excludes) url.searchParams.set("exclude", excludes);

  const attempt = () => withRoutingSlot(async () => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 20000);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      const data = (await response.json()) as OsrmResponse;
      return { data, ok: response.ok };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }, signal);

  let result = await attempt();
  const warnings: string[] = [];
  if (excludes && ["InvalidValue", "InvalidOptions", "InvalidQuery"].includes(result.data.code)) {
    url.searchParams.delete("exclude");
    warnings.push("Publiczny OSRM nie obsługuje wybranych wykluczeń. Drogi płatne i promy nie zostały wykluczone.");
    result = await attempt();
  }
  if (!result.ok || result.data.code !== "Ok") {
    const message = ["NoRoute", "NoSegment"].includes(result.data.code)
      ? "Nie można połączyć wszystkich punktów drogami. Przesuń punkty bliżej dostępnej drogi."
      : "Darmowy serwer OSRM jest chwilowo niedostępny. Spróbuj ponownie za chwilę.";
    throw new Error(message);
  }
  if (avoid.unpaved) warnings.push("Publiczny OSRM nie weryfikuje unikania dróg gruntowych.");
  return { ...parseOsrm(result.data, labels), warnings };
}

export function splitWaypointBatches(waypoints: Waypoint[], size = 20): Waypoint[][] {
  if (!Number.isInteger(size) || size < 2) throw new Error("Batch size must be at least two.");
  const batches: Waypoint[][] = [];
  for (let start = 0; start < waypoints.length - 1; start += size - 1) {
    batches.push(waypoints.slice(start, start + size));
  }
  return batches;
}

export function buildFallbackRoute(waypoints: Waypoint[]): RouteData {
  const coords: [number, number][] = waypoints.map((point) => [point.lat, point.lon]);
  const distance = sumDistance(coords);
  return {
    coords,
    distance,
    duration: distance / 22,
    steps: [],
    engine: "demo",
    labels: waypoints.map((point) => point.short),
    warnings: ["Schemat punktów, nie wyznaczona trasa drogowa. Poczekaj na OSRM."],
  };
}

export async function fetchRoute(options: {
  waypoints: Waypoint[];
  avoid: AvoidOptions;
  signal?: AbortSignal;
}): Promise<RouteData> {
  const { waypoints, avoid, signal } = options;
  if (waypoints.length < 2 || waypoints.length > MAX_WAYPOINTS) {
    throw new Error(`Trasa musi zawierać od 2 do ${MAX_WAYPOINTS} punktów.`);
  }
  const route: RouteData = {
    coords: [], distance: 0, duration: 0, steps: [], legs: [], engine: "osrm",
    labels: waypoints.map((point) => point.short), warnings: [],
  };
  let legOffset = 0;
  // Overlapping batches preserve every stop without duplicate legs or long URLs.
  for (const batch of splitWaypointBatches(waypoints)) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const part = await requestOsrm(batch, avoid, signal);
    route.coords.push(...part.coords.slice(route.coords.length ? 1 : 0));
    route.distance += part.distance;
    route.duration += part.duration;
    route.steps.push(...part.steps.map((step) => ({ ...step, leg: step.leg + legOffset })));
    route.legs!.push(...(part.legs ?? []));
    route.warnings!.push(...(part.warnings ?? []));
    legOffset += batch.length - 1;
  }
  route.warnings = [...new Set(route.warnings)];
  return route;
}

export function readableEngine(engine: RouteData["engine"]): string {
  return engine === "osrm" ? `OSRM ${ROUTING_PROFILE} · bez klucza` : "Schemat / demonstracja";
}

/* -------------------------------------------------------------------------- */
/*  Proximity of stops to the route                                           */
/* -------------------------------------------------------------------------- */

/**
 * Builds a local equirectangular index of the route so many stops can be measured
 * against a long polyline without recomputing projections for every pair.
 */
export function createRouteProximity(coords: [number, number][]) {
  if (coords.length < 2) return () => Number.POSITIVE_INFINITY;
  const meanLat = coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length;
  const kx = 111320 * Math.cos((meanLat * Math.PI) / 180);
  const ky = 110540;
  const points = coords.map(([lat, lon]) => [lon * kx, lat * ky] as [number, number]);

  return (lat: number, lon: number): number => {
    const px = lon * kx;
    const py = lat * ky;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 1; i < points.length; i += 1) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const distance = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (distance < best) best = distance;
    }
    return best;
  };
}

/** Stops lying along the route, ordered by their position on it. */
export function stopsAlongRoute<T extends { lat: number; lon: number }>(
  stops: T[],
  coords: [number, number][],
  thresholdMetres = 70
): Array<{ stop: T; distance: number; position: number }> {
  if (coords.length < 2) return [];
  const distanceToRoute = createRouteProximity(coords);
  const totalLength = coords.reduce(
    (sum, coord, index) => (index === 0 ? 0 : sum + haversine(coords[index - 1], coord)),
    0
  );
  const result: Array<{ stop: T; distance: number; position: number }> = [];
  for (const stop of stops) {
    const distance = distanceToRoute(stop.lat, stop.lon);
    if (distance > thresholdMetres) continue;
    const index = nearestCoordIndex(coords, [stop.lat, stop.lon]);
    let travelled = 0;
    for (let i = 1; i <= index; i += 1) travelled += haversine(coords[i - 1], coords[i]);
    result.push({ stop, distance, position: totalLength === 0 ? 0 : travelled / totalLength });
  }
  return result.sort((a, b) => a.position - b.position);
}
