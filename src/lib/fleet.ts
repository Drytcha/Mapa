import { DEFAULT_BUS_SPEED } from "./data";
import type { VehicleProfile } from "./types";

export const FLEET_STORAGE_KEY = "mapplaner.fleet.v1";

const comma = (value: number) => value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });

function limitsFor(maxSpeed: number) {
  return {
    motorway: maxSpeed,
    expressway: Math.min(100, maxSpeed),
    rural: Math.min(70, maxSpeed),
    urban: Math.min(50, maxSpeed),
  };
}

function profile(
  id: string,
  lengthM: number,
  weightT: number,
  maxSpeed = 90,
  averageSpeed = DEFAULT_BUS_SPEED
): VehicleProfile {
  return {
    id,
    name: `Autobus ${comma(lengthM)} m · ${comma(weightT)} t`,
    short: `${comma(lengthM)} m · ${comma(weightT)} t`,
    description: `${comma(lengthM)} m długości · ${comma(weightT)} t DMC`,
    lengthM,
    weightT,
    heightM: 3.2,
    widthM: 2.55,
    averageSpeed,
    timeFactor: 1,
    distanceFactor: 1,
    icon: "bus",
    limits: limitsFor(maxSpeed),
    note: "Dane floty. Publiczny OSRM nie weryfikuje gabarytów ani tonażu.",
    custom: false,
  };
}

/** Editable starting examples; the entire list can be replaced by the user. */
export const DEFAULT_FLEET: VehicleProfile[] = [
  profile("bus-12", 12, 12, 90, DEFAULT_BUS_SPEED),
  profile("bus-18", 18, 20, 90, DEFAULT_BUS_SPEED),
];

export const DEFAULT_VEHICLE_ID = DEFAULT_FLEET[0].id;

let activeFleet: VehicleProfile[] = DEFAULT_FLEET.map((item) => ({ ...item }));

export function getFleet(): VehicleProfile[] {
  return activeFleet;
}

const bounded = (value: unknown, min: number, max: number): number | null => {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= min && number <= max
    ? Math.round(number * 10) / 10
    : null;
};

export interface FleetDraft {
  id?: string;
  name: string;
  lengthM: string;
  weightT: string;
  heightM?: string;
  widthM?: string;
  maxSpeed: string;
  averageSpeed: string;
}

export function createFleetProfile(draft: FleetDraft): VehicleProfile | null {
  const name = draft.name.trim().slice(0, 60);
  const lengthM = bounded(draft.lengthM, 1, 30);
  const weightT = bounded(draft.weightT, 0.5, 80);
  const maxSpeed = bounded(draft.maxSpeed, 20, 140);
  const averageSpeed = bounded(draft.averageSpeed, 1, 200);
  if (!name || lengthM === null || weightT === null || maxSpeed === null || averageSpeed === null) return null;
  const heightM = draft.heightM ? bounded(draft.heightM, 1, 6) ?? undefined : undefined;
  const widthM = draft.widthM ? bounded(draft.widthM, 1, 4) ?? undefined : undefined;
  const id = draft.id ?? `fleet-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  return {
    id,
    name,
    short: `${comma(lengthM)} m · ${comma(weightT)} t`,
    description: `${name} · ${comma(lengthM)} m · ${comma(weightT)} t`,
    lengthM,
    weightT,
    heightM,
    widthM,
    averageSpeed,
    custom: !draft.id,
    timeFactor: 1,
    distanceFactor: 1,
    icon: "bus",
    limits: limitsFor(maxSpeed),
    note: "Własny pojazd. Publiczny OSRM nie weryfikuje gabarytów ani tonażu.",
  };
}

export function restoreFleet(value: unknown): VehicleProfile[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const result: VehicleProfile[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim() || seen.has(item.id)) continue;
    const lengthM = bounded(item.lengthM, 1, 30);
    const weightT = bounded(item.weightT, 0.5, 80);
    const maxSpeed = bounded((item.limits as Record<string, unknown> | undefined)?.motorway, 20, 140);
    if (lengthM === null || weightT === null || maxSpeed === null) continue;
    const averageSpeed = bounded(item.averageSpeed, 1, 200) ?? DEFAULT_BUS_SPEED;
    const name = typeof item.name === "string" && item.name.trim()
      ? item.name.trim().slice(0, 60)
      : `Autobus ${comma(lengthM)} m`;
    const short = typeof item.short === "string" && item.short.trim()
      ? item.short.trim().slice(0, 32)
      : `${comma(lengthM)} m · ${comma(weightT)} t`;
    seen.add(item.id);
    result.push({
      id: item.id,
      name,
      short,
      description: typeof item.description === "string" ? item.description.slice(0, 120) : name,
      lengthM,
      weightT,
      heightM: bounded(item.heightM, 1, 6) ?? undefined,
      widthM: bounded(item.widthM, 1, 4) ?? undefined,
      averageSpeed,
      custom: item.custom === true,
      timeFactor: 1,
      distanceFactor: 1,
      icon: "bus",
      limits: limitsFor(maxSpeed),
      note: typeof item.note === "string" ? item.note.slice(0, 160) : "Własna flota.",
    });
  }
  return result.length ? result : null;
}

/** Keeps at least one valid bus and makes it available to pure calculation helpers. */
export function replaceFleet(value: unknown): VehicleProfile[] {
  activeFleet = restoreFleet(value) ?? DEFAULT_FLEET.map((item) => ({ ...item }));
  return activeFleet;
}

export function fleetSpec(item: VehicleProfile): string {
  const dimensions = [`${comma(item.lengthM)} m`, `${comma(item.weightT)} t`];
  if (item.heightM !== undefined) dimensions.push(`${comma(item.heightM)} m wys.`);
  if (item.widthM !== undefined) dimensions.push(`${comma(item.widthM)} m szer.`);
  return dimensions.join(" · ");
}
