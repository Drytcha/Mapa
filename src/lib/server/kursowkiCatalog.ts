import { db } from "@/db";
import { gtfsKursowki, gtfsRoutes, gtfsServices, gtfsTrips } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { LiveBusVehicle } from "@/lib/types";
import { formatVehicleNumber } from "@/lib/delay";
import { normalizeDutyCode } from "@/lib/transit";
import { ensureGtfsSeeded } from "./gtfsSync";
import { getLiveWalbrzychBuses } from "./gtfsRt";

export interface DutySummary {
  id: string;
  routeId: string;
  routeShort: string;
  serviceId: string;
  kursowkaCode: string;
  brigadeNum: string;
  source: string;
  tripCount: number;
  firstDepartureMin: number | null;
  lastArrivalMin: number | null;
  firstStopName: string;
  lastStopName: string;
  vehicleId: string | null;
  operatorName: string | null;
  hasSchedule: boolean;
  unassigned: boolean;
  availableServices: string[];
  liveBus: LiveBusVehicle | null;
}

export async function getDutyCatalog(options: { routeId?: string; serviceId?: string } = {}) {
  await ensureGtfsSeeded();
  const conditions = [];
  if (options.routeId) conditions.push(eq(gtfsKursowki.routeId, options.routeId));
  if (options.serviceId && options.serviceId !== "all") conditions.push(eq(gtfsKursowki.serviceId, options.serviceId));
  const [rows, routes, services, trips] = await Promise.all([
    db.select().from(gtfsKursowki).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(gtfsKursowki.brigadeNum)),
    db.select().from(gtfsRoutes).orderBy(asc(gtfsRoutes.sortOrder)),
    db.select().from(gtfsServices),
    db.select({ id: gtfsTrips.id, kursowkaId: gtfsTrips.kursowkaId, firstStopName: gtfsTrips.firstStopName, lastStopName: gtfsTrips.lastStopName, startMinutes: gtfsTrips.startMinutes }).from(gtfsTrips).where(options.routeId ? eq(gtfsTrips.routeId, options.routeId) : undefined).orderBy(asc(gtfsTrips.startMinutes)),
  ]);
  let vehicles: LiveBusVehicle[] = [];
  let liveError: string | null = null;
  try { vehicles = (await getLiveWalbrzychBuses()).vehicles; }
  catch { liveError = "GPS chwilowo niedostępny. Rozkład GTFS pozostaje dostępny."; }
  if (options.routeId) vehicles = vehicles.filter((bus) => bus.routeName.toUpperCase() === routes.find((r) => r.id === options.routeId)?.shortName.toUpperCase());
  const live = new Map(vehicles.filter((bus) => bus.brigade && bus.kursowka.includes("/")).map((bus) => [bus.kursowka, bus]));
  const endpoints = new Map<string, { first: string; last: string }>();
  for (const trip of trips) {
    const entry = endpoints.get(trip.kursowkaId);
    if (entry) entry.last = trip.lastStopName;
    else endpoints.set(trip.kursowkaId, { first: trip.firstStopName, last: trip.lastStopName });
  }
  const available = new Map<string, string[]>();
  for (const row of rows) available.set(row.kursowkaCode, [...(available.get(row.kursowkaCode) ?? []), row.serviceId]);
  const items: DutySummary[] = rows.map((row) => {
    const ends = endpoints.get(row.id);
    return {
      ...row,
      updatedAt: undefined,
      firstDepartureMin: row.tripCount ? row.firstDepartureMin : null,
      lastArrivalMin: row.tripCount ? row.lastArrivalMin : null,
      firstStopName: ends?.first ?? "",
      lastStopName: ends?.last ?? "",
      hasSchedule: row.tripCount > 0,
      unassigned: row.brigadeNum === "?",
      availableServices: available.get(row.kursowkaCode) ?? [],
      liveBus: live.get(row.kursowkaCode) ?? null,
    };
  });
  // A duty observed on GPS must remain searchable even when this day's GTFS has no trips.
  const represented = new Set(items.map((item) => item.kursowkaCode));
  for (const bus of live.values()) {
    if (represented.has(bus.kursowka)) continue;
    const route = routes.find((r) => r.shortName.toUpperCase() === bus.routeName.toUpperCase());
    if (!route || (options.routeId && route.id !== options.routeId)) continue;
    items.push({
      id: `live|${route.id}|${bus.kursowka}`,
      routeId: route.id, routeShort: route.shortName,
      serviceId: options.serviceId && options.serviceId !== "all" ? options.serviceId : "live",
      kursowkaCode: bus.kursowka, brigadeNum: bus.brigade,
      source: "live_gps", tripCount: 0,
      firstDepartureMin: null, lastArrivalMin: null, firstStopName: "", lastStopName: "",
      vehicleId: bus.vehicleId, operatorName: bus.operatorName,
      hasSchedule: false, unassigned: false,
      availableServices: available.get(bus.kursowka) ?? [], liveBus: bus,
    });
    represented.add(bus.kursowka);
  }
  items.sort((a, b) => a.routeShort.localeCompare(b.routeShort, "pl", { numeric: true }) || Number(a.unassigned) - Number(b.unassigned) || a.brigadeNum.localeCompare(b.brigadeNum, "pl", { numeric: true }) || a.serviceId.localeCompare(b.serviceId));
  return { items, routes, services, liveError, vehicleNumbers: Object.fromEntries(vehicles.map((bus) => [bus.vehicleId, formatVehicleNumber(bus.vehicleId)])) };
}

export function findCatalogDuty(items: DutySummary[], query: string): DutySummary[] {
  const code = normalizeDutyCode(query);
  return items.filter((item) => !item.unassigned && (normalizeDutyCode(item.kursowkaCode) === code || (code && normalizeDutyCode(item.kursowkaCode).includes(code))));
}

export async function tripsForDuties(ids: string[]) {
  return ids.length ? db.select().from(gtfsTrips).where(inArray(gtfsTrips.kursowkaId, ids)).orderBy(asc(gtfsTrips.startMinutes)) : [];
}
