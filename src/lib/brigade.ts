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

export const BRIGADE_STORAGE_KEY = "mapplaner.brigade.v1";
export const SAVED_BRIGADES_KEY = "mapplaner.brigades.v1";

export const EMPTY_BRIGADE: BrigadeInfo = { line: "", duty: "" };

export interface SavedBrigadePlan {
  id: string;
  title: string;
  brigade: BrigadeInfo;
  waypoints: Waypoint[];
  vehicle: VehicleId;
  fleet?: VehicleProfile[];
  speeds?: SpeedOverrides;
  schedule?: ScheduleSettings;
  avoid: AvoidOptions;
  route?: RouteData;
  savedAt: string;
}

export function normalizeBrigade(value: unknown): BrigadeInfo {
  if (!value || typeof value !== "object") return { ...EMPTY_BRIGADE };
  const raw = value as Record<string, unknown>;
  return {
    line: typeof raw.line === "string" ? raw.line.trimStart().slice(0, 20) : "",
    duty: typeof raw.duty === "string" ? raw.duty.trimStart().slice(0, 32) : "",
  };
}

export function cleanBrigade(brigade?: BrigadeInfo): BrigadeInfo {
  return {
    line: brigade?.line.trim().slice(0, 20) ?? "",
    duty: brigade?.duty.trim().slice(0, 32) ?? "",
  };
}

export function hasBrigade(brigade?: BrigadeInfo): boolean {
  const { line, duty } = cleanBrigade(brigade);
  return Boolean(line || duty);
}

export function formatBrigadeTitle(brigade?: BrigadeInfo): string {
  const { line, duty } = cleanBrigade(brigade);
  if (line && duty) return `Linia ${line} · Służba ${duty}`;
  if (line) return `Linia ${line}`;
  if (duty) return `Służba ${duty}`;
  return "";
}

export function formatBrigadeCompact(brigade?: BrigadeInfo): string {
  const { line, duty } = cleanBrigade(brigade);
  if (line && duty) return `${line} · ${duty}`;
  if (line) return `Linia ${line}`;
  if (duty) return duty;
  return "";
}

export function loadBrigade(): BrigadeInfo {
  try {
    const raw = localStorage.getItem(BRIGADE_STORAGE_KEY);
    if (!raw) return { ...EMPTY_BRIGADE };
    return cleanBrigade(normalizeBrigade(JSON.parse(raw)));
  } catch {
    return { ...EMPTY_BRIGADE };
  }
}

export function saveBrigade(brigade: BrigadeInfo): void {
  try {
    localStorage.setItem(BRIGADE_STORAGE_KEY, JSON.stringify(cleanBrigade(brigade)));
  } catch {
    /* Storage is optional. */
  }
}

export function loadSavedBrigades(): SavedBrigadePlan[] {
  try {
    const raw = localStorage.getItem(SAVED_BRIGADES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedBrigadePlan =>
        Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.waypoints))
    );
  } catch {
    return [];
  }
}

export function persistSavedBrigades(list: SavedBrigadePlan[]): void {
  try {
    localStorage.setItem(SAVED_BRIGADES_KEY, JSON.stringify(list));
  } catch {
    /* Storage is optional. */
  }
}
