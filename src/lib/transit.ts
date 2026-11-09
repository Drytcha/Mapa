import type { LiveBusVehicle, WalbrzychOperatorKey } from "./types";
import { formatVehicleNumber } from "./delay";

/** Company identity is independent of the red/green punctuality indicator. */
export const OPERATOR_STYLES: Record<
  WalbrzychOperatorKey,
  { label: string; bg: string; fg: string; soft: string }
> = {
  mzuk: { label: "MZUK", bg: "#86efac", fg: "#10351e", soft: "#86efac24" },
  ska: { label: "ŚKA", bg: "#c084fc", fg: "#1b0734", soft: "#c084fc24" },
  other: { label: "Inny", bg: "#cbd5e1", fg: "#273449", soft: "#cbd5e120" },
};

export function normalizeDutyCode(value: string): string {
  const clean = value.trim().toUpperCase().replace(/\s+/g, "");
  const match = clean.match(/^([A-Z0-9]+)[/:\\-](\d+)$/);
  return match ? `${match[1]}/${match[2].padStart(2, "0")}` : clean;
}

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}

/** Exact duty and fleet-number matches first; partial matches remain useful. */
export function matchesBusQuery(bus: LiveBusVehicle, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  const code = normalizeDutyCode(raw);
  if (code.includes("/")) return normalizeDutyCode(bus.kursowka) === code;
  const term = normalizeSearch(raw.replace(/^#/, ""));
  const number = normalizeSearch(bus.vehicleId).replace(/^0+/, "");
  const normalizedNumber = normalizeSearch(formatVehicleNumber(bus.vehicleId).slice(1)).replace(/^0+/, "");
  return (
    number === term.replace(/^0+/, "") ||
    normalizedNumber === term.replace(/^0+/, "") ||
    normalizeSearch(`${bus.kursowka} ${formatVehicleNumber(bus.vehicleId)} ${bus.routeName} ${bus.operatorName}`).includes(term)
  );
}

export function findBuses(vehicles: LiveBusVehicle[], query: string): LiveBusVehicle[] {
  if (!query.trim()) return [];
  const code = normalizeDutyCode(query);
  return vehicles.filter((bus) => matchesBusQuery(bus, query)).sort((a, b) => {
    const exact = (bus: LiveBusVehicle) =>
      normalizeDutyCode(bus.kursowka) === code ||
      formatVehicleNumber(bus.vehicleId).slice(1) === code ||
      bus.vehicleId === query.trim().replace(/^#/, "") ? 0 : 1;
    return exact(a) - exact(b) || a.kursowka.localeCompare(b.kursowka, "pl", { numeric: true });
  });
}

export function serviceForDate(
  services: Array<{ serviceId: string; datesJson: number[] }>,
  dateKey: number,
  weekday: number
): string {
  return services.find((service) => service.datesJson.includes(dateKey))?.serviceId ??
    (weekday === 7 ? "sunday" : weekday === 6 ? "saturday" : "weekday");
}
