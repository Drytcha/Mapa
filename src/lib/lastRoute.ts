import { cleanBrigade, loadBrigade } from "./brigade";
import { createInitialWaypoints, DEFAULT_BUS_SPEED, isWaypointSet } from "./data";
import {
  DEFAULT_FLEET,
  DEFAULT_VEHICLE_ID,
  FLEET_STORAGE_KEY,
  restoreFleet,
} from "./fleet";
import { isValidSpeed } from "./geo";
import { restoreSchedule, SCHEDULE_STORAGE_KEY } from "./schedule";
import type {
  AvoidOptions,
  BrigadeInfo,
  RouteData,
  ScheduleSettings,
  SpeedOverrides,
  VehicleId,
  VehicleProfile,
  Waypoint,
} from "./types";
import { MAX_WAYPOINTS } from "./types";

export const LAST_ROUTE_KEY = "mapplaner.last-route.v4";
const LEGACY_ROUTE_KEY = "mapplaner.saved-route.v3";
export const SPEEDS_KEY = "mapplaner.speeds.v2";

export interface LastRouteSnapshot {
  version: 4;
  waypoints: Waypoint[];
  vehicle: VehicleId;
  fleet: VehicleProfile[];
  speeds: SpeedOverrides;
  schedule: ScheduleSettings;
  avoid: AvoidOptions;
  brigade?: BrigadeInfo;
  route?: RouteData;
  planKey: string;
  savedAt: string;
}

export interface SnapshotInput {
  waypoints: Waypoint[];
  vehicle: VehicleId;
  fleet: VehicleProfile[];
  speeds: SpeedOverrides;
  schedule: ScheduleSettings;
  avoid: AvoidOptions;
  brigade?: BrigadeInfo;
  route: RouteData;
}

const validPoint = (value: unknown): value is Waypoint => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.label === "string" && typeof item.short === "string"
    && typeof item.lat === "number" && Number.isFinite(item.lat) && Math.abs(item.lat) <= 85
    && typeof item.lon === "number" && Number.isFinite(item.lon) && Math.abs(item.lon) <= 180
    && isWaypointSet(item as unknown as Waypoint);
};

function validWaypoints(value: unknown): Waypoint[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_WAYPOINTS || !value.every(validPoint)) return null;
  return value as Waypoint[];
}

function storageJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function defaultSpeedMap(fleet: VehicleProfile[]): SpeedOverrides {
  return Object.fromEntries(fleet.map((profile) => [profile.id, profile.averageSpeed ?? DEFAULT_BUS_SPEED]));
}

export function cleanSpeeds(value: unknown, fleet: VehicleProfile[]): SpeedOverrides {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const result: SpeedOverrides = {};
  for (const profile of fleet) {
    const speed = raw[profile.id];
    if (isValidSpeed(speed)) result[profile.id] = speed;
  }
  return result;
}

function cleanAvoid(value: unknown): AvoidOptions {
  const item = (value ?? {}) as Partial<AvoidOptions>;
  return {
    tolls: item.tolls === true,
    ferries: item.ferries === true,
    unpaved: item.unpaved === true,
  };
}

function validRoute(value: unknown, count: number): RouteData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as RouteData;
  if (item.engine !== "osrm" || !Array.isArray(item.coords) || item.coords.length < 2 || item.coords.length > 12000) return undefined;
  if (!item.coords.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite))) return undefined;
  if (!Number.isFinite(item.distance) || item.distance < 0 || !Number.isFinite(item.duration) || item.duration < 0) return undefined;
  if (!Array.isArray(item.steps) || !Array.isArray(item.labels) || item.labels.length !== count) return undefined;
  if (item.legs && (!Array.isArray(item.legs) || item.legs.length !== count - 1)) return undefined;
  return item;
}

export function buildPlanKey(waypoints: Waypoint[], avoid: AvoidOptions): string {
  const routeKey = waypoints
    .map((point) =>
      isWaypointSet(point)
        ? `${point.id}:${point.lat.toFixed(6)},${point.lon.toFixed(6)}`
        : `${(point as Waypoint).id}:empty`
    )
    .join("|");
  return `${routeKey}|${avoid.tolls ? 1 : 0}${avoid.ferries ? 1 : 0}${avoid.unpaved ? 1 : 0}`;
}

function normalize(value: unknown): LastRouteSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const waypoints = validWaypoints(raw.waypoints) ?? validWaypoints(raw.points);
  const fleet = restoreFleet(raw.fleet ?? storageJson(FLEET_STORAGE_KEY)) ?? DEFAULT_FLEET.map((item) => ({ ...item }));
  const vehicle = typeof raw.vehicle === "string" && fleet.some((item) => item.id === raw.vehicle)
    ? raw.vehicle
    : fleet[0]?.id ?? DEFAULT_VEHICLE_ID;
  const speedSource = raw.speeds ?? storageJson(SPEEDS_KEY);
  const speeds = speedSource && typeof speedSource === "object"
    ? cleanSpeeds(speedSource, fleet)
    : defaultSpeedMap(fleet);
  const schedule = restoreSchedule(raw.schedule ?? storageJson(SCHEDULE_STORAGE_KEY));
  const avoid = cleanAvoid(raw.avoid);
  const brigade = raw.brigade ? cleanBrigade(raw.brigade as BrigadeInfo) : loadBrigade();
  const points = waypoints ?? createInitialWaypoints();
  const route = waypoints ? validRoute(raw.route, points.length) : undefined;
  return {
    version: 4,
    waypoints: points,
    vehicle,
    fleet,
    speeds,
    schedule,
    avoid,
    brigade,
    route,
    planKey: route ? buildPlanKey(points, avoid) : "",
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
  };
}

/** Reads the newest snapshot, with a lossless-enough migration from older sessions. */
export function loadLastRoute(): LastRouteSnapshot | null {
  try {
    const current = normalize(storageJson(LAST_ROUTE_KEY));
    if (current) return current;
    const legacy = storageJson(LEGACY_ROUTE_KEY);
    if (legacy) {
      const normalized = normalize({
        ...(legacy as Record<string, unknown>),
        fleet: DEFAULT_FLEET,
        vehicle: DEFAULT_VEHICLE_ID,
        route: undefined,
      });
      if (normalized) return normalized;
    }
    // No route snapshot yet: restore fleet, speed, schedule and empty start/end slots.
    return normalize({});
  } catch {
    return normalize({});
  }
}

function compactRoute(route: RouteData): RouteData {
  const coords = route.coords.length > 6000
    ? route.coords.filter((_, index) => index % Math.ceil(route.coords.length / 6000) === 0 || index === route.coords.length - 1)
    : route.coords;
  return { ...route, coords, steps: route.steps.slice(0, 1800) };
}

export function buildSnapshot(input: SnapshotInput): LastRouteSnapshot {
  return {
    version: 4,
    waypoints: input.waypoints,
    vehicle: input.vehicle,
    fleet: input.fleet,
    speeds: input.speeds,
    schedule: input.schedule,
    avoid: input.avoid,
    brigade: input.brigade ? cleanBrigade(input.brigade) : undefined,
    route: input.route.engine === "osrm" ? compactRoute(input.route) : undefined,
    planKey: buildPlanKey(input.waypoints, input.avoid),
    savedAt: new Date().toISOString(),
  };
}

export function snapshotSignature(snapshot: LastRouteSnapshot): string {
  return JSON.stringify({
    waypoints: snapshot.waypoints,
    vehicle: snapshot.vehicle,
    fleet: snapshot.fleet,
    speeds: snapshot.speeds,
    schedule: snapshot.schedule,
    avoid: snapshot.avoid,
    brigade: snapshot.brigade ?? null,
    planKey: snapshot.planKey,
    route: snapshot.route ? {
      distance: snapshot.route.distance,
      duration: snapshot.route.duration,
      coords: snapshot.route.coords.length,
      steps: snapshot.route.steps.length,
      labels: snapshot.route.labels,
    } : null,
  });
}

/** Call only for a successfully routed plan; incomplete drafts never replace it. */
export function writeSnapshot(snapshot: LastRouteSnapshot): boolean {
  if (!snapshot.route || snapshot.route.engine !== "osrm") return false;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
