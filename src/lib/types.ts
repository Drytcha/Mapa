export type VehicleId = string;
export type MapStyle = "osm" | "light" | "dark" | "satellite";
export type ThemeMode = "light" | "dark";
export type SpeedOverrides = Partial<Record<VehicleId, number>>;

export interface ScheduleSettings {
  mode: "now" | "departure" | "arrival";
  date: string;
  time: string;
  trafficEnabled: boolean;
  peakDelayPercent: number;
  bufferMinutes: number;
  occurrence: "earlier" | "later";
}

export interface JourneyTiming {
  mode: ScheduleSettings["mode"];
  zone: "Europe/Warsaw";
  departure: number;
  arrival: number;
  targetArrival?: number;
  baseSeconds: number;
  travelSeconds: number;
  delaySeconds: number;
  bufferSeconds: number;
  trafficEnabled: boolean;
  peakDelayPercent: number;
}

export const MAX_WAYPOINTS = 50;

export interface BrigadeInfo {
  line: string;
  duty: string;
}

export interface Waypoint {
  id: string;
  label: string;
  short: string;
  lat: number;
  lon: number;
  empty?: boolean;
}

export interface Place {
  id: string;
  label: string;
  short: string;
  lat: number;
  lon: number;
  source: "local" | "osm";
  kind?: string;
}

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  shelter: boolean;
  operator?: string;
  /** OSM reference of a platform/bay: distinguishes directions at the same named stop. */
  ref?: string;
  direction?: string;
  towards?: string;
  side?: string;
  /** Normalised OSM bay/direction key used only to tell opposite platforms apart. */
  platformKey?: string;
  /** How this stop is mapped in OSM; the platform position is the most precise. */
  kind?: "platform" | "bus_stop" | "stop_position";
  /** OSM element kinds recognised as the same physical platform. */
  kinds?: Array<"platform" | "bus_stop" | "stop_position">;
  /** Number of OSM elements merged into this single physical stop. */
  merged?: number;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
  modifier?: string;
  leg: number;
  location?: [number, number];
}

export interface RouteLeg {
  distance: number;
  duration: number;
}

export interface RouteData {
  coords: [number, number][];
  distance: number;
  duration: number;
  steps: RouteStep[];
  /** Original routing totals for each consecutive pair of waypoints. */
  legs?: RouteLeg[];
  engine: "osrm" | "demo";
  labels: string[];
  warnings?: string[];
}

export interface TruckParams {
  weight: number;
  height: number;
  width: number;
  length: number;
  axles: number;
  adr: boolean;
  trailer: boolean;
}

export interface AvoidOptions {
  tolls: boolean;
  ferries: boolean;
  unpaved: boolean;
}

export interface VehicleProfile {
  id: VehicleId;
  name: string;
  short: string;
  description: string;
  lengthM: number;
  weightT: number;
  heightM?: number;
  widthM?: number;
  averageSpeed: number;
  custom?: boolean;
  timeFactor: number;
  distanceFactor: number;
  icon: string;
  limits: {
    motorway: number;
    expressway: number;
    rural: number;
    urban: number;
  };
  note: string;
}

export interface ProfileMetrics {
  id: VehicleId;
  name?: string;
  short?: string;
  profile?: VehicleProfile;
  distance: number;
  duration: number;
  restrictions: number;
  toll: number;
  customSpeed?: number;
  automaticDuration: number;
  journey?: JourneyTiming;
}
