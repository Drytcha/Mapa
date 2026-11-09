import {
  ArrowRight,
  Clock3,
  Gauge,
  Info,
  ListOrdered,
  Loader2,
  Play,
  Scale,
  ShieldAlert,
  Timer,
} from "lucide-react";
import type {
  BrigadeInfo,
  ProfileMetrics,
  RouteData,
  VehicleId,
  Waypoint,
} from "../lib/types";
import { formatBrigadeTitle } from "../lib/brigade";
import { isWaypointSet } from "../lib/data";
import {
  estimateAverageSpeed,
  formatDelta,
  formatDistance,
} from "../lib/geo";
import { cn } from "../utils/cn";
import { CollapseToggle, FieldLabel, Pill, VehicleGlyph } from "./UI";
import { journeyClock, journeyDate, journeyDateTime } from "../lib/schedule";

function ActivePill({ short }: { short?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-1.5 py-[2px] text-[8.5px] font-bold text-ink-soft">
      <VehicleGlyph id={short ?? "bus"} className="h-2.5 w-2.5 text-brand-ink" />
      {short ?? "Autobus"}
    </span>
  );
}

interface TripSummaryProps {
  route: RouteData;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  brigade?: BrigadeInfo;
  isRouting: boolean;
  navPlaying: boolean;
  routeReady: boolean;
  onOpenSteps: () => void;
  onToggleNavigation: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function DistanceMetric({ meters }: { meters: number }) {
  if (meters < 1000) {
    return (
      <div className="metric flex items-baseline gap-1">
        <span className="text-[23px] font-semibold leading-none tracking-[-0.05em]">
          {Math.round(meters)}
        </span>
        <span className="text-[10px] font-semibold text-mute">m</span>
      </div>
    );
  }
  return (
    <div className="metric flex items-baseline gap-1">
      <span className="text-[22px] font-semibold leading-none tracking-[-0.055em]">
        {(meters / 1000).toLocaleString("pl-PL", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        })}
      </span>
      <span className="text-[10px] font-semibold text-mute">km</span>
    </div>
  );
}

function TimeMetric({ seconds }: { seconds: number }) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return (
    <div className="metric flex items-baseline gap-[3px]">
      <span className="text-[19px] font-semibold leading-none tracking-[-0.05em]">
        {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m
      </span>
      <span className="text-[10px] font-semibold text-mute">{String(rest).padStart(2, "0")}s</span>
    </div>
  );
}

export function TripSummary({
  route,
  waypoints,
  metrics,
  brigade,
  isRouting,
  navPlaying,
  routeReady,
  onOpenSteps,
  onToggleNavigation,
  collapsed,
  onToggleCollapse,
}: TripSummaryProps) {
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];
  const hasStart = isWaypointSet(start);
  const hasEnd = isWaypointSet(end);
  const hasEndpoints = hasStart && hasEnd;
  const vias = waypoints.slice(1, -1).filter(isWaypointSet);
  const averageSpeed = estimateAverageSpeed(metrics.distance, metrics.duration);
  const timing = routeReady ? metrics.journey : undefined;
  const activeProfile = metrics.profile;
  const brigadeTitle = formatBrigadeTitle(brigade);
  const restrictionText = activeProfile
    ? `OSRM nie weryfikuje długości ${activeProfile.lengthM.toLocaleString("pl-PL")} m ani masy ${activeProfile.weightT.toLocaleString("pl-PL")} t. Sprawdź przejazd przed podróżą.`
    : "Szacunkowy czas, bez weryfikacji lokalnych ograniczeń.";

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]" data-testid="trip-summary-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-highlight ring-1 ring-brand/25" />
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">
            Podsumowanie trasy
          </h2>
          {collapsed && hasEndpoints && (
            <span className="metric truncate text-[9px] font-bold text-brand-ink">
              {formatDistance(metrics.distance)}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {isRouting ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-1.5 py-[2px] text-[8.5px] font-bold text-mute">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              przeliczanie
            </span>
          ) : (
            <ActivePill short={metrics.short} />
          )}
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Podsumowanie trasy"
          />
        </div>
      </div>

      {!collapsed && <div className="px-3.5 pt-2.5">
        {brigadeTitle && (
          <div className="mb-1.5">
            <Pill tone="green" className="font-mono text-[8.5px]">
              {brigadeTitle}
            </Pill>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-bold text-ink">
          <span className="min-w-0 truncate">{hasStart ? start.short : "Wybierz start"}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-mute" strokeWidth={2.2} />
          <span className="min-w-0 truncate">{hasEnd ? end.short : "Wybierz metę"}</span>
          {vias.length > 0 && (
            <span title={vias.map((point) => point.short).join(", ")} className="ml-0.5 max-w-[110px] truncate rounded-full bg-soft px-1.5 py-0.5 text-[8px] font-bold text-mute">
              {vias.length > 2 ? `${vias.length} przystanków` : `przez ${vias.map((point) => point.short).join(", ")}`}
            </span>
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-[minmax(0,1.08fr)_1px_minmax(0,1fr)] items-stretch gap-0">
          <div className="min-w-0">
            <FieldLabel>Dystans</FieldLabel>
            <div className="mt-1">
              <DistanceMetric meters={metrics.distance} />
            </div>
          </div>
          <div className="mx-2.5 bg-line" />
          <div className="min-w-0">
            <FieldLabel>{metrics.customSpeed === undefined ? "Czas szacunkowy" : "Twój czas jazdy"}</FieldLabel>
            <div className="mt-1">
              <TimeMetric seconds={metrics.duration} />
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 divide-x divide-line rounded-lg bg-raised py-1.5">
          <div className="px-2">
            <span className="flex items-center gap-1 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-mute">
              <Gauge className="h-2.5 w-2.5" /> Średnia
            </span>
            <div className="metric mt-0.5 text-[10px] font-bold tracking-tight text-ink">
              {averageSpeed.toFixed(1).replace(".", ",")} km/h
            </div>
          </div>
          <div className="px-2">
            <span className="flex items-center gap-1 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-mute">
              <Clock3 className="h-2.5 w-2.5" /> Przyjazd
            </span>
            <div className="metric mt-0.5 text-[10px] font-bold tracking-tight text-ink" title={timing ? journeyDateTime(timing.arrival) : "Podaj poprawny termin"}>
              {timing ? journeyClock(timing.arrival) : "--:--"}
            </div>
            {timing && <p className="mt-0.5 text-[7px] text-mute">{journeyDate(timing.arrival)}</p>}
          </div>
          <div className="px-2">
            <span className="flex items-center gap-1 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-mute">
              <Clock3 className="h-2.5 w-2.5" /> Wyjazd
            </span>
            <div className="metric mt-0.5 text-[10px] font-bold tracking-tight text-ink">
              {timing ? journeyClock(timing.departure) : "--:--"}
            </div>
            {timing && <p className="mt-0.5 text-[7px] text-mute" title={journeyDateTime(timing.departure)}>{journeyDate(timing.departure)}</p>}
          </div>
        </div>

        <div
          className="mt-1 flex items-start gap-1.5 rounded-md bg-warning-soft px-1.5 py-1 text-[8px] font-semibold leading-[1.35] text-warning"
          title="Darmowy routing nie zapewnia prawnej weryfikacji przejazdu dla floty."
        >
          <ShieldAlert className="mt-px h-2.5 w-2.5 shrink-0" />
          <span className="line-clamp-2">{restrictionText}</span>
        </div>
        {metrics.customSpeed !== undefined && <p className="mt-1 text-[9px] font-semibold text-brand-ink">Własna średnia {metrics.customSpeed.toLocaleString("pl-PL")} km/h. {timing?.trafficEnabled ? "Dodana korekta godzin szczytu (symulacja)." : "Czas bez korków."}</p>}

        <div className="mt-2 grid grid-cols-[1.15fr_1fr] gap-1.5 pb-2.5">
          <button
            type="button"
            onClick={onOpenSteps}
            disabled={!routeReady}
            className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[10px] font-bold text-ink transition-colors hover:border-line-strong hover:bg-raised"
          >
            <ListOrdered className="h-3.5 w-3.5 text-brand-ink" strokeWidth={2.2} />
            Instrukcje
            <span className="ml-0.5 rounded bg-soft px-1 py-0.5 font-mono text-[8px] text-mute">
              {route.steps.length}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleNavigation}
            disabled={!routeReady}
            className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-highlight text-[10px] font-extrabold text-[#17240f] transition-all hover:brightness-[0.97]"
          >
            <Play className="h-3 w-3" fill="currentColor" strokeWidth={0} />
            {navPlaying ? "Zatrzymaj" : "Nawiguj"}
          </button>
        </div>
      </div>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

interface ComparisonProps {
  metrics: ProfileMetrics[];
  activeVehicle: VehicleId;
  onSelectVehicle: (vehicle: VehicleId) => void;
  onOpenMethodology: () => void;
  className?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const compactClock = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 3600)).padStart(2, "0")}:${String(
    Math.floor((safe % 3600) / 60)
  ).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const compactDistance = (meters: number) => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pl-PL", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} km`;
};

export function VehicleComparison({
  metrics,
  activeVehicle,
  onSelectVehicle,
  onOpenMethodology,
  className,
  collapsed,
  onToggleCollapse,
}: ComparisonProps) {
  const base = metrics[0];
  const slowest = metrics.reduce((longest, metric) => metric.duration > longest.duration ? metric : longest, metrics[0]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]",
        className
      )}
      data-testid="vehicle-comparison-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Scale className="h-3.5 w-3.5 shrink-0 text-brand-ink" strokeWidth={2.2} />
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">
            Porównanie pojazdów
          </h2>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[8px] font-bold text-mute">
            {metrics.length} pojazdów
          </span>
          <button
            type="button"
            onClick={onOpenMethodology}
            title="Jak liczymy czasy i dystanse?"
            aria-label="Metodologia obliczeń"
            className="grid h-5 w-5 place-items-center rounded text-mute transition-colors hover:bg-soft hover:text-ink"
          >
            <Info className="h-3 w-3" strokeWidth={2.1} />
          </button>
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Porównanie pojazdów"
          />
        </div>
      </div>

      {!collapsed && <><div className="px-2 pt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_61px_72px_54px] items-center gap-1 px-1.5 py-1.5 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-mute">
          <span>Pojazd</span>
          <span className="text-right">Czas</span>
          <span className="text-right">Dystans</span>
          <span className="text-right">Δ czas</span>
        </div>

        <div className="flex flex-col">
          {metrics.map((metric) => {
            const profileName = metric.name ?? metric.id;
            const profileShort = metric.short ?? metric.id;
            const selected = metric.id === activeVehicle;
            const durationDelta = metric.duration - base.duration;
            const distanceDelta = metric.distance - base.distance;
            return (
              <button
                type="button"
                key={metric.id}
                onClick={() => onSelectVehicle(metric.id)}
                aria-pressed={selected}
                title={`${metric.profile?.description ?? profileName} · ${metric.profile?.note ?? "Własna flota"}`}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_61px_72px_54px] items-center gap-1 rounded-md px-1.5 py-[5.5px] text-left transition-colors",
                  selected ? "bg-brand-soft" : "hover:bg-raised"
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full border",
                      selected
                        ? "border-brand/30 bg-brand text-on-brand"
                        : "border-line bg-raised text-ink-soft"
                    )}
                  >
                    <VehicleGlyph id={metric.id} className="h-[11px] w-[11px]" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[9.5px] leading-tight",
                        selected ? "font-extrabold text-brand-ink" : "font-bold text-ink"
                      )}
                    >
                      {profileName}
                    </span>
                    <span className="flex items-center gap-1 text-[7px] font-semibold text-mute">
                      {profileShort}
                      {metric.customSpeed !== undefined && <span className="text-brand-ink">własna</span>}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "metric text-right text-[9px]",
                    selected ? "font-bold text-brand-ink" : "font-medium text-ink-soft"
                  )}
                >
                  {compactClock(metric.duration)}
                </span>
                <span
                  className="metric text-right text-[8px] leading-[1.2] text-ink-soft"
                  title={formatDistance(metric.distance)}
                >
                  <span className="block">{compactDistance(metric.distance)}</span>
                  {Math.abs(distanceDelta) > 1 && metric.id !== base.id && (
                    <span className="block text-[6.5px] font-semibold text-warning">
                      {distanceDelta > 0 ? "+" : "−"}
                      {Math.abs(distanceDelta) < 1000
                        ? `${Math.round(Math.abs(distanceDelta))} m`
                        : `${(Math.abs(distanceDelta) / 1000)
                            .toLocaleString("pl-PL", {
                              minimumFractionDigits: 3,
                              maximumFractionDigits: 3,
                            })
                            .replace(/\./g, "")} km`}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "metric text-right text-[8px] font-semibold",
                    metric.id === base.id
                      ? "text-mute"
                      : durationDelta > 0
                        ? "text-warning"
                        : "text-emerald-700 dark:text-emerald-400"
                  )}
                  title={formatDelta(durationDelta)}
                >
                    {metric.id === base.id || durationDelta === 0
                    ? "—"
                    : Math.abs(durationDelta) >= 3600
                      ? `${durationDelta > 0 ? "+" : "−"}${Math.floor(Math.abs(durationDelta) / 3600)}h ${String(
                          Math.floor((Math.abs(durationDelta) % 3600) / 60)
                        ).padStart(2, "0")}m`
                      : `${durationDelta > 0 ? "+" : "−"}${String(
                          Math.floor(Math.abs(durationDelta) / 60)
                        ).padStart(2, "0")}m ${String(Math.abs(durationDelta) % 60).padStart(2, "0")}s`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 border-t border-line bg-raised px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[8px] font-semibold text-mute">
            <Timer className="h-2.5 w-2.5" />
            Najdłuższy czas we flocie
          </span>
          <span className="metric text-[8.5px] font-extrabold text-warning">
            {formatDelta(slowest.duration - base.duration)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-[7.5px] leading-tight text-mute">
            Wspólny przebieg trasy · gabaryty niezweryfikowane
          </span>
          <button
            type="button"
            onClick={onOpenMethodology}
            className="shrink-0 text-[7.5px] font-bold text-brand-ink underline decoration-line-strong underline-offset-2"
          >
            Metodologia
          </button>
        </div>
      </div></>}
    </section>
  );
}
