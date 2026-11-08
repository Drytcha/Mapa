import { DateTime } from "luxon";
import type { JourneyTiming, ProfileMetrics, ScheduleSettings } from "./types";

export const SCHEDULE_ZONE = "Europe/Warsaw";
export const SCHEDULE_STORAGE_KEY = "mapplaner.schedule.v1";
const QUARTER_MS = 15 * 60 * 1000;
const MAX_BASE_SECONDS = 31 * 24 * 3600;

// Explicit planning assumptions, NOT traffic observations or historical statistics.
const WEEKDAY_PRESSURE = [0, 0, 0, 0, 0, 0, 0.25, 0.8, 1, 0.6, 0.3, 0.25, 0.3, 0.35, 0.45, 0.85, 1, 0.9, 0.6, 0.3, 0.15, 0.05, 0, 0, 0];
const WEEKEND_PRESSURE = [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.25, 0.35, 0.4, 0.35, 0.3, 0.3, 0.3, 0.25, 0.2, 0.1, 0.05, 0, 0, 0, 0];

export interface ParsedScheduleTime {
  timestamp?: number;
  error?: string;
  ambiguous: boolean;
}

export interface ScheduleEvaluation extends ParsedScheduleTime {
  timing?: JourneyTiming;
}

export function defaultSchedule(now = Date.now()): ScheduleSettings {
  const local = DateTime.fromMillis(now, { zone: SCHEDULE_ZONE }).plus({ hours: 1 });
  return {
    mode: "now", date: local.toFormat("yyyy-MM-dd"), time: local.toFormat("HH:mm"),
    trafficEnabled: false, peakDelayPercent: 40, bufferMinutes: 0, occurrence: "earlier",
  };
}

export function restoreSchedule(value: unknown, now = Date.now()): ScheduleSettings {
  const defaults = defaultSchedule(now);
  if (!value || typeof value !== "object") return defaults;
  const stored = value as Partial<ScheduleSettings>;
  return {
    mode: stored.mode === "arrival" || stored.mode === "departure" ? stored.mode : "now",
    date: typeof stored.date === "string" ? stored.date : defaults.date,
    time: typeof stored.time === "string" ? stored.time : defaults.time,
    trafficEnabled: stored.trafficEnabled === true,
    peakDelayPercent: typeof stored.peakDelayPercent === "number" && Number.isFinite(stored.peakDelayPercent)
      ? Math.min(100, Math.max(0, stored.peakDelayPercent)) : defaults.peakDelayPercent,
    bufferMinutes: typeof stored.bufferMinutes === "number" && Number.isFinite(stored.bufferMinutes)
      ? Math.min(120, Math.max(0, stored.bufferMinutes)) : 0,
    occurrence: stored.occurrence === "later" ? "later" : "earlier",
  };
}

export function parseScheduleTime(settings: ScheduleSettings, now = Date.now()): ParsedScheduleTime {
  if (settings.mode === "now") return { timestamp: Math.floor(now / 1000) * 1000, ambiguous: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time)) {
    return { error: "Podaj pełną datę i godzinę przejazdu.", ambiguous: false };
  }
  const text = `${settings.date}T${settings.time}`;
  const parsed = DateTime.fromISO(text, { zone: SCHEDULE_ZONE });
  if (!parsed.isValid || parsed.year < 2000 || parsed.year > 2100) {
    return { error: "Podaj poprawną datę z zakresu 2000-2100.", ambiguous: false };
  }
  // Luxon advances nonexistent spring-clock times; a round trip detects that adjustment.
  if (parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== text) {
    return { error: "Ta godzina nie istnieje w Polsce z powodu zmiany czasu. Wybierz inną godzinę.", ambiguous: false };
  }
  const possible = parsed.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
  const choice = settings.occurrence === "later" ? possible[possible.length - 1] : possible[0];
  return { timestamp: choice.toMillis(), ambiguous: possible.length > 1 };
}

function pressureAt(local: DateTime): number {
  const profile = local.weekday >= 6 ? WEEKEND_PRESSURE : WEEKDAY_PRESSURE;
  const ratio = local.minute / 60;
  return profile[local.hour] * (1 - ratio) + profile[local.hour + 1] * ratio;
}

export function trafficFactorAt(timestamp: number, peakDelayPercent: number): number {
  const bin = Math.floor(timestamp / QUARTER_MS) * QUARTER_MS;
  return 1 + pressureAt(DateTime.fromMillis(bin, { zone: SCHEDULE_ZONE })) * peakDelayPercent / 100;
}

export function trafficDayProfile(date: string) {
  const local = DateTime.fromISO(date, { zone: SCHEDULE_ZONE });
  const weekend = local.isValid && local.weekday >= 6;
  return { weekend, hours: (weekend ? WEEKEND_PRESSURE : WEEKDAY_PRESSURE).slice(0, 24) };
}

function shiftTravel(baseSeconds: number, anchor: number, direction: 1 | -1, settings: Pick<ScheduleSettings, "trafficEnabled" | "peakDelayPercent">): number {
  if (!settings.trafficEnabled || settings.peakDelayPercent === 0 || baseSeconds === 0) {
    return anchor + direction * baseSeconds * 1000;
  }
  let remaining = baseSeconds;
  let cursor = anchor;
  let iterations = 0;
  // Integrate base travel progress through successive real-time slots. Reverse integration
  // finds a departure time using traffic DURING the journey, not just at the arrival hour.
  while (remaining > 1e-8) {
    if (++iterations > 6200) throw new Error("Trasa przekracza zakres planowania czasu.");
    const sample = direction === 1 ? cursor : cursor - 1;
    const bin = Math.floor(sample / QUARTER_MS) * QUARTER_MS;
    const boundary = direction === 1 ? bin + QUARTER_MS : bin;
    const factor = trafficFactorAt(sample, settings.peakDelayPercent);
    const availableSeconds = Math.abs(boundary - cursor) / 1000;
    const work = availableSeconds / factor;
    if (remaining <= work + 1e-8) {
      cursor += direction * remaining * factor * 1000;
      break;
    }
    remaining -= work;
    cursor = boundary;
  }
  // Round outward to avoid recommending a departure later than the calculated one.
  return direction === 1 ? Math.ceil((cursor - 0.001) / 1000) * 1000 : Math.floor((cursor + 0.001) / 1000) * 1000;
}

export function calculateJourney(baseDuration: number, settings: ScheduleSettings, now = Date.now()): ScheduleEvaluation {
  const parsed = parseScheduleTime(settings, now);
  if (parsed.error || parsed.timestamp === undefined) return parsed;
  if (!Number.isFinite(baseDuration) || baseDuration < 0 || baseDuration > MAX_BASE_SECONDS) {
    return { ...parsed, error: "Planowanie obsługuje do 31 dni bazowego czasu jazdy. Sprawdź trasę i prędkość." };
  }
  if (!Number.isFinite(settings.peakDelayPercent) || settings.peakDelayPercent < 0 || settings.peakDelayPercent > 100) {
    return { ...parsed, error: "Wydłużenie w szczycie musi wynosić od 0 do 100%." };
  }
  if (settings.mode === "arrival" && (!Number.isFinite(settings.bufferMinutes) || settings.bufferMinutes < 0 || settings.bufferMinutes > 120)) {
    return { ...parsed, error: "Zapas czasu musi wynosić od 0 do 120 minut." };
  }
  const baseSeconds = Math.round(baseDuration);
  const bufferSeconds = settings.mode === "arrival" ? Math.round(settings.bufferMinutes * 60) : 0;
  try {
    const departure = settings.mode === "arrival"
      ? shiftTravel(baseSeconds, parsed.timestamp - bufferSeconds * 1000, -1, settings)
      : parsed.timestamp;
    const arrival = shiftTravel(baseSeconds, departure, 1, settings);
    const travelSeconds = Math.round((arrival - departure) / 1000);
    return {
      ...parsed,
      timing: {
        mode: settings.mode, zone: SCHEDULE_ZONE, departure, arrival,
        targetArrival: settings.mode === "arrival" ? parsed.timestamp : undefined,
        baseSeconds, travelSeconds, delaySeconds: Math.max(0, travelSeconds - baseSeconds),
        bufferSeconds, trafficEnabled: settings.trafficEnabled, peakDelayPercent: settings.peakDelayPercent,
      },
    };
  } catch (error) {
    return { ...parsed, error: error instanceof Error ? error.message : "Nie udało się wyliczyć godzin." };
  }
}

export function withJourney(metric: ProfileMetrics, evaluation: ScheduleEvaluation): ProfileMetrics {
  return { ...metric, duration: evaluation.timing?.travelSeconds ?? metric.duration, journey: evaluation.timing };
}

export function elapsedAtProgress(timing: JourneyTiming, progress: number): number {
  const fraction = Math.min(1, Math.max(0, progress));
  if (fraction === 0) return 0;
  if (fraction === 1) return timing.travelSeconds;
  const baseSeconds = Math.round(timing.baseSeconds * fraction);
  const reached = shiftTravel(baseSeconds, timing.departure, 1, timing);
  return Math.min(timing.travelSeconds, Math.max(0, Math.round((reached - timing.departure) / 1000)));
}

export function journeyClock(timestamp: number, seconds = true): string {
  return DateTime.fromMillis(timestamp, { zone: SCHEDULE_ZONE }).toFormat(seconds ? "HH:mm:ss" : "HH:mm");
}

export function journeyDate(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: SCHEDULE_ZONE }).setLocale("pl").toFormat("ccc, dd.MM.yyyy");
}

export function journeyDateTime(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: SCHEDULE_ZONE }).toFormat("dd.MM.yyyy HH:mm:ss '(UTC'ZZ')'");
}

export function journeyIso(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: SCHEDULE_ZONE }).toISO({ suppressMilliseconds: true }) ?? "";
}

export function scheduleSummaryLines(timing: JourneyTiming): string[] {
  return [
    `Wyjazd: ${journeyDateTime(timing.departure)}`,
    `Przyjazd: ${journeyDateTime(timing.arrival)}`,
    ...(timing.targetArrival !== undefined ? [`Termin na mecie: ${journeyDateTime(timing.targetArrival)}; zapas: ${timing.bufferSeconds / 60} min`] : []),
    timing.trafficEnabled
      ? `Korki: symulacja, nie statystyki. Szczyt: +${timing.peakDelayPercent}%; dodatkowy czas: ${timing.delaySeconds} s.`
      : "Korki: nie uwzględniono. Czas bazowy bez postojów.",
    `Strefa: ${SCHEDULE_ZONE}. Brak gwarancji godziny przyjazdu.`,
  ];
}