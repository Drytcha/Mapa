export type VehicleId = string;
export type MapStyle = "osm" | "light" | "dark" | "satellite";
export type ThemeMode = "light" | "dark";
export type SpeedOverrides = Partial<Record<VehicleId, number>>;

export interface TrafficSignalIntersection {
  id: string;
  lat: number;
  lon: number;
  routeOffsetMeters: number;
}

export interface ScheduleSettings {
  mode: "now" | "departure" | "arrival";
  date: string;
  time: string;
  trafficEnabled: boolean;
  peakDelayPercent: number;
  liveTrafficEnabled: boolean;
  trafficLightsEnabled: boolean;
  secondsPerSignal: number;
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
  signalCount: number;
  signalSeconds: number;
  travelSeconds: number;
  delaySeconds: number;
  bufferSeconds: number;
  trafficEnabled: boolean;
  liveTrafficEnabled: boolean;
  trafficLightsEnabled: boolean;
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
  ref?: string;
  direction?: string;
  towards?: string;
  side?: string;
  platformKey?: string;
  kind?: "platform" | "bus_stop" | "stop_position";
  kinds?: Array<"platform" | "bus_stop" | "stop_position">;
  merged?: number;
  /** GTFS stop id used to read departures / kursówki for this stop. */
  gtfsId?: string;
  /** Where the stop comes from: Wałbrzych timetable (GTFS + rozklad.walbrzych.eu) or OpenStreetMap only. */
  source?: "timetable" | "osm";
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

export type WalbrzychOperatorKey = "mzuk" | "ska" | "other";

export interface LiveBusVehicle {
  vehicleId: string;
  model: string | null;
  operatorKey: WalbrzychOperatorKey;
  operatorName: string;
  /** "manual" when the assignment was overridden by the user. */
  operatorSource: "auto" | "manual";
  routeName: string;
  routeColor: string;
  brigade: string;
  kursowka: string;
  tripId: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  delaySeconds: number;
  /** Speed derived from consecutive GPS fixes; null until two fixes are known. */
  speedKmh: number | null;
  headsign: string | null;
  timestamp: number;
  upcomingStops: Array<{
    sequence: number;
    name: string;
    scheduledArrival: number;
    scheduledDeparture: number;
  }>;
}

export interface LiveTrafficSummary {
  totalVehicles: number;
  trackedOnTripCount: number;
  avgDelaySeconds: number;
  maxDelaySeconds: number;
  delayedCount: number;
  onTimeCount: number;
  congestionLevel: "niski" | "umiarkowany" | "wysoki";
  recommendedPeakPercent: number;
  operatorBreakdown: {
    mzuk: number;
    ska: number;
    other: number;
  };
  fetchedAt: number;
}
