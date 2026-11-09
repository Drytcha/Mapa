/** Punctuality colours are separate from the company's identity colours. */
export type DelayTone = "late-high" | "late" | "early-small" | "early-big";
export interface DelayStyle { bg: string; fg: string; label: string }

export const DELAY_STYLES: Record<DelayTone, DelayStyle> = {
  "late-high": { bg: "#dc2626", fg: "#ffffff", label: "Opóźnienie powyżej 3 min" },
  late: { bg: "#fb923c", fg: "#3a1503", label: "Opóźnienie do 3 min" },
  "early-small": { bg: "#86efac", fg: "#052e16", label: "Na czas / przyspieszenie do 1 min" },
  "early-big": { bg: "#15803d", fg: "#ffffff", label: "Przyspieszenie powyżej 1 min" },
};

export function delayTone(delaySeconds: number): DelayTone {
  if (delaySeconds > 180) return "late-high";
  if (delaySeconds > 0) return "late";
  if (delaySeconds >= -60) return "early-small";
  return "early-big";
}

/** User-facing convention: minus = behind schedule, plus = ahead of schedule. */
export function formatDelay(delaySeconds: number): string {
  const rounded = Math.round(delaySeconds);
  const abs = Math.abs(rounded);
  const body = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  return rounded > 0 ? `-${body}` : rounded < 0 ? `+${body}` : "0:00";
}

export function describeDelay(delaySeconds: number): string {
  const rounded = Math.round(delaySeconds);
  if (rounded === 0) return "Planowo (na czas)";
  const abs = Math.abs(rounded);
  const text = abs >= 60 ? `${Math.floor(abs / 60)} min ${abs % 60} s` : `${abs} s`;
  return rounded > 0 ? `Opóźnienie ${text}` : `Przyspieszenie ${text}`;
}

export function formatSpeed(speedKmh: number | null | undefined): string {
  return typeof speedKmh === "number" && Number.isFinite(speedKmh)
    ? `${Math.round(speedKmh)} km/h`
    : "– km/h";
}

export function formatVehicleNumber(vehicleId: string | null | undefined): string {
  const clean = String(vehicleId ?? "").trim();
  if (!clean) return "";
  return /^\d$/.test(clean) ? `#0${clean}` : `#${clean}`;
}
