import {
  pgTable,
  text,
  integer,
  doublePrecision,
  serial,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const gtfsFeeds = pgTable("gtfs_feeds", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  version: text("version").notNull(),
  generatedAt: text("generated_at").notNull(),
  stopsCount: integer("stops_count").notNull().default(0),
  routesCount: integer("routes_count").notNull().default(0),
  tripsCount: integer("trips_count").notNull().default(0),
  kursowkiCount: integer("kursowki_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gtfsRoutes = pgTable("gtfs_routes", {
  id: text("id").primaryKey(),
  shortName: text("short_name").notNull(),
  longName: text("long_name").notNull(),
  color: text("color").notNull().default("#0d4f3b"),
  textColor: text("text_color").notNull().default("#ffffff"),
  agencyName: text("agency_name").notNull().default("ZDKiUM / MZUK / ŚKA"),
  sortOrder: integer("sort_order").notNull().default(999),
});

export const gtfsStops = pgTable("gtfs_stops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  code: text("code"),
  platformCode: text("platform_code"),
  agency: text("agency").notNull().default("ZDKiUM / MZUK"),
});

export const gtfsServices = pgTable("gtfs_services", {
  serviceId: text("service_id").primaryKey(),
  label: text("label").notNull(),
  datesJson: jsonb("dates_json").$type<number[]>().notNull(),
});

export const gtfsKursowki = pgTable(
  "gtfs_kursowki",
  {
    id: text("id").primaryKey(), // e.g. "2|0_RS|2/03"
    routeId: text("route_id").notNull(),
    routeShort: text("route_short").notNull(),
    serviceId: text("service_id").notNull(),
    kursowkaCode: text("kursowka_code").notNull(), // e.g. "2/03"
    brigadeNum: text("brigade_num").notNull(), // e.g. "03"
    source: text("source").notNull().default("block_chain"), // gtfs | live_gps | block_chain
    tripCount: integer("trip_count").notNull().default(0),
    firstDepartureMin: integer("first_departure_min").notNull().default(0),
    lastArrivalMin: integer("last_arrival_min").notNull().default(0),
    vehicleId: text("vehicle_id"),
    operatorName: text("operator_name"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_kursowki_route_service").on(table.routeId, table.serviceId),
  ]
);

export const gtfsTrips = pgTable(
  "gtfs_trips",
  {
    id: text("id").primaryKey(),
    routeId: text("route_id").notNull(),
    serviceId: text("service_id").notNull(),
    kursowkaId: text("kursowka_id").notNull(),
    kursowkaCode: text("kursowka_code").notNull(),
    brigadeNum: text("brigade_num").notNull(),
    brigadeSource: text("brigade_source").notNull().default("block_chain"),
    headsign: text("headsign").notNull().default(""),
    directionId: integer("direction_id").notNull().default(0),
    shapeId: text("shape_id"),
    startMinutes: integer("start_minutes").notNull().default(0),
    endMinutes: integer("end_minutes").notNull().default(0),
    firstStopName: text("first_stop_name").notNull().default(""),
    lastStopName: text("last_stop_name").notNull().default(""),
    stopCount: integer("stop_count").notNull().default(0),
  },
  (table) => [
    index("idx_trips_kursowka").on(table.kursowkaId),
    index("idx_trips_route_service").on(table.routeId, table.serviceId),
  ]
);

export const gtfsStopTimes = pgTable(
  "gtfs_stop_times",
  {
    id: serial("id").primaryKey(),
    tripId: text("trip_id").notNull(),
    stopId: text("stop_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    arrivalMinutes: integer("arrival_minutes").notNull(),
    departureMinutes: integer("departure_minutes").notNull(),
    pickupType: integer("pickup_type").notNull().default(0),
    dropOffType: integer("drop_off_type").notNull().default(0),
  },
  (table) => [
    index("idx_stop_times_trip").on(table.tripId),
    index("idx_stop_times_stop").on(table.stopId),
  ]
);

export const gtfsShapes = pgTable("gtfs_shapes", {
  shapeId: text("shape_id").primaryKey(),
  pointsJson: jsonb("points_json").$type<[number, number][]>().notNull(),
});

export const liveTripBrigades = pgTable("live_trip_brigades", {
  tripId: text("trip_id").primaryKey(),
  routeShort: text("route_short").notNull(),
  brigadeNum: text("brigade_num").notNull(),
  kursowkaCode: text("kursowka_code").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  operatorName: text("operator_name").notNull(),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
});

export const trafficSignalsCache = pgTable("traffic_signals_cache", {
  bboxKey: text("bbox_key").primaryKey(),
  signalsJson: jsonb("signals_json")
    .$type<Array<{ id: string; lat: number; lon: number }>>()
    .notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const savedBrigadePlans = pgTable("saved_brigade_plans", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  line: text("line").notNull().default(""),
  duty: text("duty").notNull().default(""),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Snapshot of the official timetable stop list from rozklad.walbrzych.eu. */
export const officialStopsCache = pgTable("official_stops_cache", {
  id: text("id").primaryKey(),
  payload: jsonb("payload")
    .$type<
      Array<{
        id: number;
        name: string;
        symbol: string;
        lat: number;
        lon: number;
        lines: string[];
      }>
    >()
    .notNull(),
  source: text("source").notNull().default("rozklad.walbrzych.eu"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

/** Manual vehicle -> operator assignments that override the automatic fleet-number rules. */
export const vehicleOperatorOverrides = pgTable("vehicle_operator_overrides", {
  vehicleId: text("vehicle_id").primaryKey(),
  operatorKey: text("operator_key").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
