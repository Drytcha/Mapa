"use client";

import { forwardRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Bus,
  BusFront,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Flag,
  Layers,
  ListOrdered,
  Loader2,
  Map as MapIcon,
  MapPinned,
  Maximize2,
  Minus,
  Moon,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  Scale,
  Square,
  Sun,
  Timer,
  TrafficCone,
  Undo2,
  X,
} from "lucide-react";
import type {
  BrigadeInfo,
  BusStop,
  LiveBusVehicle,
  LiveTrafficSummary,
  MapStyle,
  ProfileMetrics,
  RouteData,
  RouteStep,
  VehicleId,
  WalbrzychOperatorKey,
  Waypoint,
} from "@/lib/types";
import { MAX_WAYPOINTS } from "@/lib/types";
import { formatBrigadeTitle } from "@/lib/brigade";
import { isWaypointSet } from "@/lib/data";
import { stopDisplayName } from "@/lib/busStops";
import {
  formatDistance,
  formatDuration,
  formatDurationShort,
} from "@/lib/geo";
import { cn } from "@/utils/cn";
import { OPERATOR_STYLES } from "@/lib/transit";
import BusSearch from "./BusSearch";
import {
  DELAY_STYLES,
  delayTone,
  describeDelay,
  formatDelay,
  formatSpeed,
  formatVehicleNumber,
  type DelayTone,
} from "@/lib/delay";
import { Pill, VehicleGlyph } from "./UI";
import GtfsSchedule from "./GtfsSchedule";
import { journeyClock, journeyDateTime } from "@/lib/schedule";

export function MapRouteCard({
  route,
  waypoints,
  metrics,
  vehicle,
  brigade,
  mapStyle,
  routeReady,
}: {
  route: RouteData;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  vehicle: VehicleId;
  brigade?: BrigadeInfo;
  mapStyle: MapStyle;
  routeReady: boolean;
}) {
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];
  const hasStart = isWaypointSet(start);
  const hasEnd = isWaypointSet(end);
  const vias = waypoints.slice(1, -1).filter(isWaypointSet);
  const live = routeReady && route.engine !== "demo";
  const brigadeTitle = formatBrigadeTitle(brigade);
  return (
    <div className="hidden w-[328px] max-w-[calc(100vw-116px)] rounded-[14px] border border-line/80 bg-surface/93 px-3 py-2.5 shadow-[0_12px_35px_rgba(13,42,28,0.13)] backdrop-blur-xl dark:bg-surface/90 sm:block">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-on-brand">
            <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
          </span>
          <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-mute">
            {routeReady
              ? "Aktywna trasa"
              : hasStart || hasEnd
                ? "Ostatni podgląd trasy"
                : "Nowy plan"}
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-raised px-1.5 py-[2px] text-[7.5px] font-bold text-ink-soft ring-1 ring-line">
          <span
            className={cn(
              "h-1 w-1 rounded-full",
              live ? "bg-emerald-500" : hasStart && hasEnd ? "bg-warning" : "bg-mute"
            )}
          />
          {live ? "GOTOWA" : hasStart && hasEnd ? "PODGLĄD" : "PUSTA"}
          <span className="text-mute">·</span>
          <span className="text-mute">
            {mapStyle === "satellite" ? "SAT" : mapStyle === "dark" ? "DARK" : "LIGHT"}
          </span>
        </span>
      </div>
      {brigadeTitle && (
        <div className="mt-1.5">
          <Pill tone="green" className="font-mono text-[8px]">
            {brigadeTitle}
          </Pill>
        </div>
      )}
      <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[13px] font-extrabold leading-none tracking-[-0.025em] text-ink">
        <span className="truncate">{hasStart ? start.short : "Wybierz start"}</span>
        <span className="shrink-0 text-[11px] font-medium text-mute">→</span>
        <span className="truncate">{hasEnd ? end.short : "Wybierz metę"}</span>
      </div>
      {vias.length > 0 && (
        <div className="mt-1 truncate text-[8px] font-semibold text-mute">
          przez {vias.map((point) => point.short).join(", ")} · {vias.length}{" "}
          {vias.length === 1 ? "punkt pośredni" : "punkty pośrednie"}
        </div>
      )}
      <div className="mt-2 flex items-end justify-between gap-2 border-t border-line/70 pt-1.5">
        <div className="flex min-w-0 items-end gap-2.5">
          <div>
            <span className="block text-[7px] font-extrabold uppercase tracking-[0.12em] text-mute">
              Dystans
            </span>
            <span className="metric block text-[10px] font-bold leading-tight text-ink">
              {formatDistance(metrics.distance)}
            </span>
          </div>
          <span className="mb-0.5 h-4 w-px bg-line" />
          <div>
            <span className="block text-[7px] font-extrabold uppercase tracking-[0.12em] text-mute">
              Czas łączny
            </span>
            <span className="metric block text-[10px] font-bold leading-tight text-ink">
              {formatDuration(metrics.duration)}
            </span>
          </div>
        </div>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-raised text-brand-ink">
          <VehicleGlyph id={vehicle} className="h-3 w-3" />
        </span>
      </div>
      {routeReady && metrics.journey && (
        <div
          className="mt-2 border-t border-line/70 pt-1.5 text-[9px]"
          title={`Wyjazd ${journeyDateTime(metrics.journey.departure)}; przyjazd ${journeyDateTime(metrics.journey.arrival)}`}
        >
          <div className="flex items-center justify-between text-ink-soft">
            <span>
              Wyjazd{" "}
              <strong className="metric text-brand-ink">
                {journeyClock(metrics.journey.departure)}
              </strong>
            </span>
            <span>
              Meta <strong className="metric">{journeyClock(metrics.journey.arrival)}</strong>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[8px] text-mute">
            {metrics.journey.trafficLightsEnabled && (
              <span className="text-amber-700 dark:text-amber-300">
                Światła: {metrics.journey.signalCount} (+
                {formatDurationShort(metrics.journey.signalSeconds)})
              </span>
            )}
            {metrics.journey.trafficEnabled && (
              <span className="text-warning">
                Korki: +{formatDurationShort(metrics.journey.delaySeconds)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Live Fleet Bar (ZDKiUM, ŚKA, MZUK GPS) + Traffic Signals Toggle           */
/* -------------------------------------------------------------------------- */

export function LiveFleetControl({
  showLiveBuses,
  onToggleLiveBuses,
  operatorFilter,
  onOperatorFilter,
  liveVehicles,
  liveTraffic,
  liveLoading,
  onRefreshLive,
  signalCount,
  showTrafficSignals,
  onToggleTrafficSignals,
  kursowkaOverlayTitle,
  onClearKursowkaOverlay,
  onSelectBus,
}: {
  showLiveBuses: boolean;
  onToggleLiveBuses: () => void;
  operatorFilter: "all" | WalbrzychOperatorKey;
  onOperatorFilter: (op: "all" | WalbrzychOperatorKey) => void;
  liveVehicles: LiveBusVehicle[];
  liveTraffic: LiveTrafficSummary | null;
  liveLoading: boolean;
  onRefreshLive: () => void;
  signalCount: number;
  showTrafficSignals: boolean;
  onToggleTrafficSignals: () => void;
  kursowkaOverlayTitle: string | null;
  onClearKursowkaOverlay: () => void;
  onSelectBus: (bus: LiveBusVehicle) => void;
}) {
  const counts = liveTraffic?.operatorBreakdown ?? {
    mzuk: liveVehicles.filter((v) => v.operatorKey === "mzuk").length,
    ska: liveVehicles.filter((v) => v.operatorKey === "ska").length,
    other: liveVehicles.filter((v) => v.operatorKey === "other").length,
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line/80 bg-surface/94 px-2 py-1 shadow-[0_8px_24px_rgba(13,42,28,0.14)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onToggleLiveBuses}
          className={cn(
            "flex h-6 items-center gap-1 rounded-lg px-2 text-[8.5px] font-extrabold transition-colors",
            showLiveBuses ? "bg-brand text-on-brand" : "bg-soft text-mute hover:text-ink"
          )}
        >
          <Radio className={cn("h-2.5 w-2.5", showLiveBuses && "animate-pulse")} />
          GPS Wałbrzych ({liveVehicles.length})
        </button>

        {showLiveBuses && (
          <div className="flex flex-wrap items-center gap-0.5">
            {(
              [
                { id: "all", label: `Wszystkie (${liveVehicles.length})` },
                { id: "mzuk", label: `MZUK (${counts.mzuk})` },
                { id: "ska", label: `ŚKA (${counts.ska})` },
                { id: "other", label: `Inni (${counts.other})` },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOperatorFilter(item.id)}
                className={cn(
                  "h-6 rounded-md px-1.5 text-[8px] font-bold transition-colors",
                  operatorFilter === item.id
                    ? "border border-line bg-raised text-ink"
                    : "text-mute hover:bg-raised hover:text-ink"
                )}
              >
                <span className="flex items-center gap-1.5">{item.id !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: OPERATOR_STYLES[item.id].bg }} />}{item.label}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onRefreshLive}
          disabled={liveLoading}
          title="Odśwież pozycje GPS autobusów"
          aria-label="Odśwież pozycje GPS autobusów"
          className="grid h-6 w-6 place-items-center rounded-md text-mute transition-colors hover:bg-raised hover:text-brand-ink disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", liveLoading && "animate-spin")} />
        </button>
      </div>

      {showLiveBuses && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/80 bg-surface/94 px-2 py-1 shadow-[0_8px_24px_rgba(13,42,28,0.14)] backdrop-blur-xl md:flex">
          {(
            [
              ["late-high", "− opóźnienie > 3 min"],
              ["late", "− do 3 min"],
              ["early-small", "+ do 1 min / planowo"],
              ["early-big", "+ przyspieszenie > 1 min"],
            ] as Array<[DelayTone, string]>
          ).map(([tone, text]) => (
            <span key={tone} className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
              <span
                className="h-2 w-2 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: DELAY_STYLES[tone].bg }}
              />
              {text}
            </span>
          ))}
        </div>
      )}

      <div className="w-full max-w-[360px]"><BusSearch vehicles={liveVehicles} onSelectVehicle={onSelectBus} compact /></div>

      {signalCount > 0 && (
        <button
          type="button"
          onClick={onToggleTrafficSignals}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[8.5px] font-extrabold shadow-[0_8px_24px_rgba(13,42,28,0.12)] backdrop-blur-xl transition-colors",
            showTrafficSignals
              ? "border-amber-500/40 bg-surface/94 text-amber-700 dark:text-amber-300"
              : "border-line/80 bg-surface/94 text-mute"
          )}
        >
          <TrafficCone className="h-3 w-3" />
          Światła na trasie: <span className="metric">{signalCount}</span>
        </button>
      )}

      {kursowkaOverlayTitle && (
        <div className="flex h-8 items-center gap-1.5 rounded-xl border border-brand/40 bg-brand-soft px-2.5 text-[8.5px] font-extrabold text-brand-ink shadow-md">
          <BusFront className="h-3 w-3" />
          <span>{kursowkaOverlayTitle}</span>
          <button
            type="button"
            onClick={onClearKursowkaOverlay}
            aria-label="Ukryj podgląd kursówki"
            className="grid h-4 w-4 place-items-center rounded hover:bg-surface"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Selected Live Bus Card                                                    */
/* -------------------------------------------------------------------------- */

export function LiveBusCard({
  bus,
  onClose,
  onOpenKursowka,
  onCenter,
  onSetOperator,
}: {
  bus: LiveBusVehicle;
  onClose: () => void;
  onOpenKursowka: (kursowkaCode: string) => void;
  onCenter: () => void;
  onSetOperator: (vehicleId: string, key: WalbrzychOperatorKey | null) => void;
}) {
  const style = DELAY_STYLES[delayTone(bus.delaySeconds)];
  const operators: Array<{ key: WalbrzychOperatorKey; label: string }> = [
    { key: "mzuk", label: "MZUK" },
    { key: "ska", label: "ŚKA" },
    { key: "other", label: "Inny" },
  ];

  return (
    <div className="w-[318px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border border-line/80 bg-surface/96 shadow-[0_16px_44px_rgba(13,42,28,0.19)] backdrop-blur-xl animate-rise-in dark:bg-surface/93">
      <div className="flex items-start gap-2.5 border-b border-line/70 bg-brand-soft/80 px-3 py-2.5">
        <span
          className="metric mt-px grid h-8 min-w-[34px] shrink-0 place-items-center rounded-lg px-1.5 text-[12px] font-extrabold shadow-xs"
          style={{ backgroundColor: OPERATOR_STYLES[bus.operatorKey].bg, color: OPERATOR_STYLES[bus.operatorKey].fg }}
        >
          {bus.routeName || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[7.5px] font-extrabold uppercase tracking-[0.15em] text-brand-ink/80">
            GPS na żywo · {bus.operatorName}
          </span>
          <h3 className="mt-0.5 text-[13px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Linia {bus.routeName} · Kursówka {bus.kursowka || "—"}{" "}
            <span className="font-mono text-brand-ink">
              {formatVehicleNumber(bus.vehicleId)}
            </span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kartę autobusu"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-surface hover:text-ink"
        >
          <X className="h-3 w-3" strokeWidth={2.3} />
        </button>
      </div>

      <div className="px-3 py-2.5 text-[10px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-mute">Końcowy:</span>
          <span className="truncate font-bold text-ink">{bus.headsign || "Kurs techniczny / brak"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-semibold text-mute">Numer taborowy:</span>
          <span className="metric font-extrabold text-ink">
            Wóz {formatVehicleNumber(bus.vehicleId)}
            {bus.model ? ` · ${bus.model}` : ""}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-semibold text-mute">Prędkość:</span>
          <span className="metric font-extrabold text-ink">{formatSpeed(bus.speedKmh)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-semibold text-mute">Punktualność:</span>
          <span
            className="metric rounded-md px-1.5 py-0.5 font-extrabold"
            style={{ backgroundColor: style.bg, color: style.fg }}
            title={style.label}
          >
            {formatDelay(bus.delaySeconds)} · {describeDelay(bus.delaySeconds)}
          </span>
        </div>

        <div className="mt-2 border-t border-line/70 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-mute">
              Przewoźnik {bus.operatorSource === "manual" ? "(ustawiony ręcznie)" : "(automatycznie)"}
            </span>
            {bus.operatorSource === "manual" && (
              <button
                type="button"
                onClick={() => onSetOperator(bus.vehicleId, null)}
                className="text-[8px] font-bold text-brand-ink underline underline-offset-2"
              >
                Przywróć auto
              </button>
            )}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {operators.map((operator) => (
              <button
                key={operator.key}
                type="button"
                onClick={() => onSetOperator(bus.vehicleId, operator.key)}
                aria-pressed={bus.operatorKey === operator.key}
                style={bus.operatorKey === operator.key ? { background: OPERATOR_STYLES[operator.key].bg, color: OPERATOR_STYLES[operator.key].fg } : undefined}
                className={cn(
                  "h-6 rounded-md border text-[9px] font-extrabold transition-colors",
                  bus.operatorKey === operator.key
                    ? "border-transparent"
                    : "border-line bg-surface text-ink-soft hover:bg-raised"
                )}
              >
                {operator.label}
              </button>
            ))}
          </div>
        </div>

        {bus.upcomingStops.length > 0 && (
          <div className="mt-2 border-t border-line/70 pt-2">
            <span className="block text-[8px] font-extrabold uppercase tracking-[0.14em] text-mute">
              Najbliższe przystanki
            </span>
            <ul className="mt-1 space-y-1">
              {bus.upcomingStops.slice(0, 3).map((st) => {
                const dt = new Date(st.scheduledDeparture + bus.delaySeconds * 1000);
                const clock = `${String(dt.getHours()).padStart(2, "0")}:${String(
                  dt.getMinutes()
                ).padStart(2, "0")}`;
                return (
                  <li
                    key={`${st.sequence}-${st.name}`}
                    className="flex items-center justify-between gap-2 rounded bg-raised px-2 py-1 text-[9px]"
                  >
                    <span className="truncate font-semibold text-ink">{st.name}</span>
                    <span className="metric shrink-0 font-bold text-brand-ink">{clock}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-2.5 flex gap-1.5">
          {bus.kursowka && (
            <button
              type="button"
              onClick={() => onOpenKursowka(bus.kursowka)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand text-[9.5px] font-extrabold text-on-brand transition-opacity hover:opacity-90"
            >
              <BusFront className="h-3.5 w-3.5" />
              Wszystkie kursy {bus.kursowka}
            </button>
          )}
          <button
            type="button"
            onClick={onCenter}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-soft hover:bg-raised"
            title="Wyśrodkuj na autobusie"
            aria-label="Wyśrodkuj na autobusie"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const MAP_STYLES: Array<{
  id: MapStyle;
  label: string;
  hint: string;
  icon: typeof Sun;
  swatch: string;
}> = [
  {
    id: "osm",
    label: "Szczegółowa OSM",
    hint: "Ulice, chodniki, przystanki",
    icon: MapIcon as typeof Sun,
    swatch: "linear-gradient(135deg, #f6f1e2 0%, #e6ecd9 55%, #cfe0e6 100%)",
  },
  {
    id: "light",
    label: "Mapa jasna",
    hint: "Esri Light Gray · OSM",
    icon: Sun,
    swatch: "linear-gradient(135deg, #eef1e9 0%, #dfe6d8 60%, #cbd8c6 100%)",
  },
  {
    id: "dark",
    label: "Mapa ciemna",
    hint: "OSM · ciemny (rozjaśniony)",
    icon: Moon,
    swatch: "linear-gradient(135deg, #4b5563 0%, #374151 55%, #27303d 100%)",
  },
  {
    id: "satellite",
    label: "Satelita",
    hint: "Esri World Imagery + PL",
    icon: Satellite,
    swatch: "linear-gradient(135deg, #62705a 0%, #394f3e 50%, #263e44 100%)",
  },
];

export function MapControls({
  mapStyle,
  onMapStyle,
  onZoomIn,
  onZoomOut,
  onFit,
  busCount,
  busLoading,
  onRefreshBusStops,
  onHome,
}: {
  mapStyle: MapStyle;
  onMapStyle: (style: MapStyle) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  busCount: number;
  busLoading: boolean;
  onRefreshBusStops: () => void;
  onHome: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-end gap-1.5">
      <div className="flex flex-col gap-0.5 rounded-xl border border-line/80 bg-surface/94 p-1 shadow-[0_8px_24px_rgba(13,42,28,0.14)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onRefreshBusStops}
          title="Pobierz przystanki dla bieżącego widoku"
          aria-label="Pobierz przystanki dla bieżącego widoku mapy"
          className="relative grid h-7 w-7 place-items-center rounded-lg bg-brand text-on-brand transition-opacity hover:opacity-90"
        >
          <Bus className="h-3.5 w-3.5" strokeWidth={2} />
          {busLoading && (
            <span className="absolute inset-0 grid place-items-center rounded-lg bg-brand/90">
              <Loader2 className="h-3 w-3 animate-spin text-on-brand" />
            </span>
          )}
          {!busLoading && busCount > 0 && (
            <span className="metric absolute -right-1 -top-1 min-w-[15px] rounded-full bg-highlight px-[3px] text-[7px] font-extrabold leading-[13px] text-[#17240f] shadow-sm">
              {busCount > 999 ? "999+" : busCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onHome}
          title="Wróć do Wałbrzycha"
          aria-label="Wróć do widoku Wałbrzycha"
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-soft hover:text-ink"
        >
          <Crosshair className="h-3.5 w-3.5" strokeWidth={2.1} />
        </button>
        <span className="mx-1.5 h-px bg-line" />
      </div>

      <div className="flex flex-col gap-0.5 rounded-xl border border-line/80 bg-surface/94 p-1 shadow-[0_8px_24px_rgba(13,42,28,0.14)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          title="Styl mapy"
          aria-label="Styl mapy"
          aria-expanded={open}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-soft hover:text-ink",
            open && "bg-soft text-brand-ink"
          )}
        >
          <Layers className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <span className="mx-1.5 h-px bg-line" />
        <button
          type="button"
          onClick={onZoomIn}
          title="Przybliż"
          aria-label="Przybliż mapę"
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-soft hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          title="Oddal"
          aria-label="Oddal mapę"
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-soft hover:text-ink"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
        <span className="mx-1.5 h-px bg-line" />
        <button
          type="button"
          onClick={onFit}
          title="Dopasuj trasę do widoku"
          aria-label="Dopasuj trasę do widoku"
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-soft hover:text-ink"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div className="absolute right-10 top-0 w-[186px] rounded-xl border border-line bg-surface p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.22)] animate-fade-in">
          <div className="px-2 py-1 text-[7.5px] font-extrabold uppercase tracking-[0.16em] text-mute">
            Warstwy podkładu
          </div>
          {MAP_STYLES.map((style) => {
            const Icon = style.icon;
            const active = mapStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  onMapStyle(style.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  active ? "bg-brand-soft" : "hover:bg-raised"
                )}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line/60"
                  style={{ background: style.swatch }}
                >
                  <Icon
                    className={cn(
                      "h-3 w-3",
                      style.id === "dark" || style.id === "satellite"
                        ? "text-white"
                        : "text-ink"
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9.5px] font-bold text-ink">{style.label}</span>
                  <span className="block truncate text-[7.5px] text-mute">{style.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export const MapContextMenu = forwardRef<
  HTMLDivElement,
  {
    lat: number;
    lon: number;
    left: number;
    top: number;
    onSetStart: () => void;
    onSetEnd: () => void;
  }
>(function MapContextMenu({ lat, lon, left, top, onSetStart, onSetEnd }, ref) {
  const coordinate = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Menu punktu na mapie"
      style={{ left, top }}
      className="fixed z-[1150] w-[224px] overflow-hidden rounded-[8px] border border-line bg-surface p-1 shadow-[0_12px_32px_rgba(13,42,28,0.18)] animate-fade-in"
    >
      <div className="px-2.5 py-2">
        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-mute">
          Punkt na mapie
        </span>
        <span className="metric mt-0.5 block text-[12px] font-semibold text-ink">
          {coordinate}
        </span>
      </div>
      <div className="h-px bg-line" />
      <button
        type="button"
        role="menuitem"
        onClick={onSetStart}
        className="flex h-10 w-full items-center gap-2.5 rounded px-3 text-left text-[11px] font-semibold text-ink transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
      >
        <Crosshair className="h-3.5 w-3.5 shrink-0 text-brand-ink" />
        Ustaw miejsce startowe
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onSetEnd}
        className="flex h-10 w-full items-center gap-2.5 rounded px-3 text-left text-[11px] font-semibold text-ink transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
      >
        <Flag className="h-3.5 w-3.5 shrink-0 text-brand-ink" />
        Ustaw miejsce końcowe
      </button>
    </div>
  );
});

/* -------------------------------------------------------------------------- */

export function PickBanner({
  target,
  onCancel,
}: {
  target: "start" | "meta" | "punkt";
  onCancel: () => void;
}) {
  const text =
    target === "start"
      ? "Kliknij mapę albo przystanek, aby ustawić START"
      : target === "meta"
        ? "Kliknij mapę albo przystanek, aby ustawić METĘ"
        : "Kliknij mapę albo przystanek, aby ustawić ten punkt";
  return (
    <div className="flex max-w-[460px] items-center gap-2 rounded-full border border-line bg-ink px-2 py-1.5 text-canvas shadow-[0_12px_30px_rgba(0,0,0,0.25)] animate-rise-in">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-highlight text-[#13210f]">
        <MousePointer2 className="h-3 w-3" strokeWidth={2.6} />
      </span>
      <span className="text-[9px] font-bold leading-snug">{text}</span>
      <button
        type="button"
        onClick={onCancel}
        className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-bold hover:bg-white/20"
      >
        Anuluj
      </button>
    </div>
  );
}

export function MapDrawingBanner({
  count,
  onDone,
  onUndo,
}: {
  count: number;
  onDone: () => void;
  onUndo: () => void;
}) {
  const hint =
    count === 0
      ? "1. kliknięcie ustawia START A"
      : count === 1
        ? "2. kliknięcie ustawia METĘ B"
        : `Każde kliknięcie dodaje punkt przed metą · ${count} / ${MAX_WAYPOINTS}`;
  return (
    <div
      className="max-w-[430px] rounded-xl border border-brand/20 bg-surface/95 p-3 shadow-lg backdrop-blur animate-rise-in"
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-on-brand">
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold text-ink">Klikaj mapę lub przystanki</p>
          <p className="text-[9px] text-mute">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={count <= 2}
          aria-label="Cofnij ostatni punkt"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-mute hover:bg-soft disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-highlight text-[10px] font-extrabold text-[#16240f]"
      >
        <Check className="h-3 w-3" /> Gotowe, wyznacz trasę
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function NavigationHud({
  active,
  playing,
  progress,
  step,
  stepIndex,
  totalSteps,
  remainingDistance,
  remainingTime,
  vehicle,
  vehicleShort,
  onStart,
  onToggle,
  onStop,
  onOpenSteps,
}: {
  active: boolean;
  playing: boolean;
  progress: number;
  step?: RouteStep;
  stepIndex: number;
  totalSteps: number;
  remainingDistance: number;
  remainingTime: number;
  vehicle: VehicleId;
  vehicleShort?: string;
  onStart: () => void;
  onToggle: () => void;
  onStop: () => void;
  onOpenSteps: () => void;
}) {
  return (
    <div className="w-[326px] max-w-[calc(100vw-116px)] overflow-hidden rounded-[14px] border border-line/80 bg-surface/94 shadow-[0_16px_45px_rgba(13,42,28,0.18)] backdrop-blur-xl dark:bg-surface/92">
      <div className="flex items-center justify-between border-b border-line/80 bg-raised/70 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              active ? "bg-emerald-500" : "bg-line-strong"
            )}
          />
          <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-mute">
            {active ? "Nawigacja aktywna" : "Nawigacja krok po kroku"}
          </span>
        </div>
        <span className="font-mono text-[8px] font-bold text-mute">
          {active
            ? `${String(Math.min(stepIndex + 1, totalSteps)).padStart(2, "0")} / ${String(
                totalSteps
              ).padStart(2, "0")}`
            : `${totalSteps} manewrów`}
        </span>
      </div>
      <div className="flex items-start gap-2.5 px-2.5 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-on-brand">
          <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[10.5px] font-extrabold leading-snug tracking-[-0.01em] text-ink">
            {step?.instruction ?? "Przelicz trasę, aby pobrać instrukcje."}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="metric text-[8.5px] font-bold text-brand-ink">
              za {formatDistance(step?.distance ?? 0)}
            </span>
            <span className="h-2 w-px bg-line" />
            <span className="metric text-[8px] text-mute">
              {formatDuration(step?.duration ?? 0)}
            </span>
            <span className="ml-auto flex items-center gap-0.5 text-[7.5px] font-semibold text-mute">
              <VehicleGlyph id={vehicle} className="h-2.5 w-2.5" />
              {vehicleShort ?? "Autobus"}
            </span>
          </div>
        </div>
      </div>
      <div className="px-2.5">
        <div className="h-1 overflow-hidden rounded-full bg-soft">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${Math.max(active ? 2 : 0, progress * 100)}%` }}
          />
        </div>
        {active && (
          <div className="mt-1 flex items-center justify-between text-[7.5px] font-semibold text-mute">
            <span>
              {Math.round(progress * 100)}% trasy · pozostało {formatDistance(remainingDistance)}
            </span>
            <span className="metric font-bold text-ink">{formatDurationShort(remainingTime)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button
          type="button"
          onClick={active ? onToggle : onStart}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-highlight text-[9px] font-extrabold text-[#16240f] transition-all hover:brightness-[0.97]"
        >
          {active && playing ? (
            <Pause className="h-3 w-3" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="h-3 w-3" fill="currentColor" strokeWidth={0} />
          )}
          {active ? (playing ? "Pauza" : "Wznów") : "Uruchom podgląd"}
        </button>
        <button
          type="button"
          onClick={onOpenSteps}
          className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:bg-soft hover:text-ink"
          title="Wszystkie instrukcje"
          aria-label="Wszystkie instrukcje"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        {active && (
          <button
            type="button"
            onClick={onStop}
            className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-mute transition-colors hover:bg-soft hover:text-danger"
            title="Zakończ nawigację"
            aria-label="Zakończ nawigację"
          >
            <Square className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function QuickComparison({
  metrics,
  activeVehicle,
  onSelectVehicle,
  onOpenReport,
}: {
  metrics: ProfileMetrics[];
  activeVehicle: VehicleId;
  onSelectVehicle: (vehicle: VehicleId) => void;
  onOpenReport: () => void;
}) {
  const rows = metrics.slice(0, 5);
  const base = rows[0];
  return (
    <div className="w-[302px] overflow-hidden rounded-[14px] border border-line/80 bg-surface/94 shadow-[0_16px_45px_rgba(13,42,28,0.18)] backdrop-blur-xl dark:bg-surface/92">
      <div className="flex items-center justify-between border-b border-line/80 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3 w-3 text-brand-ink" />
          <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-mute">
            Porównanie czasów
          </span>
        </div>
        <Pill tone="outline" className="px-1.5 py-0 text-[7px]">
          {metrics.length} pojazdów
        </Pill>
      </div>
      <div className="px-2 py-1.5">
        {rows.map((metric) => {
          const profileShort = metric.short ?? metric.id;
          const active = activeVehicle === metric.id;
          const slowest = Math.max(...rows.map((row) => row.duration), 1);
          const width = Math.max(1, (metric.duration / Math.max(1, slowest)) * 100);
          return (
            <button
              key={metric.id}
              type="button"
              onClick={() => onSelectVehicle(metric.id)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                active ? "bg-brand-soft" : "hover:bg-raised"
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-md border",
                  active
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-surface text-ink-soft"
                )}
              >
                <VehicleGlyph id={metric.id} className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[9px] font-bold text-ink">{profileShort}</span>
                  <span className="metric text-[8px] font-bold text-ink-soft">
                    {formatDuration(metric.duration)}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1">
                  <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-soft">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        active ? "bg-brand" : "bg-line-strong group-hover:bg-brand/50"
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "metric w-[47px] text-right text-[6.5px] font-semibold",
                      metric.id === base.id ? "text-mute" : "text-warning"
                    )}
                  >
                    {metric.id === base.id
                      ? "baza"
                      : metric.duration === base.duration
                        ? "0s"
                        : `${metric.duration > base.duration ? "+" : "−"}${formatDurationShort(
                            Math.abs(metric.duration - base.duration)
                          )}`}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onOpenReport}
        className="flex w-full items-center justify-between border-t border-line/80 bg-raised/60 px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1 text-[7.5px] font-semibold text-mute">
          <Timer className="h-2.5 w-2.5" />
          {metrics.length} autobusów · pełna tabela w raporcie
        </span>
        <span className="text-[7.5px] font-extrabold text-brand-ink group-hover:underline">
          Otwórz →
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function MobilePlannerSheet({
  expanded,
  onToggle,
  waypoints,
  metrics,
  vehicleShort,
  brigade,
  children,
  routeReady,
}: {
  expanded: boolean;
  onToggle: () => void;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  vehicleShort?: string;
  brigade?: BrigadeInfo;
  children: React.ReactNode;
  routeReady: boolean;
}) {
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];
  const hasStart = isWaypointSet(start);
  const hasEnd = isWaypointSet(end);
  const brigadeTitle = formatBrigadeTitle(brigade);
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-[750] flex flex-col overflow-hidden rounded-t-[20px] border-t border-line bg-canvas shadow-[0_-18px_60px_rgba(0,0,0,0.24)] transition-[height] duration-300 lg:hidden",
        expanded ? "h-[82%]" : "h-auto"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full shrink-0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5 text-left"
      >
        <span className="mx-auto block h-1 w-9 rounded-full bg-line-strong" />
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="text-[7.5px] font-extrabold uppercase tracking-[0.16em] text-mute">
              {brigadeTitle ||
                (routeReady ? "Trasa aktywna" : hasStart && hasEnd ? "Podgląd trasy" : "Nowy plan")}
            </span>
            <span className="rounded-full bg-surface px-1.5 py-px font-mono text-[7px] font-bold text-brand-ink ring-1 ring-line">
              {vehicleShort ?? "Autobus"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[8px] font-bold text-mute">
            {expanded ? "Zwiń" : "Edytuj trasę"}
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </span>
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[14px] font-extrabold tracking-[-0.03em] text-ink">
          <span className="truncate">{hasStart ? start.short : "Wybierz start"}</span>
          <span className="text-[11px] text-mute">→</span>
          <span className="truncate">{hasEnd ? end.short : "Wybierz metę"}</span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="metric text-[10px] font-bold text-ink">
            {formatDistance(metrics.distance)}
          </span>
          <span className="h-2.5 w-px bg-line-strong" />
          <span className="metric text-[10px] font-bold text-ink">
            {formatDuration(metrics.duration)}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[8px] font-semibold text-mute">
            <ChevronUp className="h-2.5 w-2.5" /> planer
          </span>
        </span>
        {routeReady && metrics.journey && (
          <span className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-ink-soft">
            <span>
              Wyjazd{" "}
              <strong className="metric text-brand-ink">
                {journeyClock(metrics.journey.departure)}
              </strong>
            </span>
            <span>
              Przyjazd <strong className="metric">{journeyClock(metrics.journey.arrival)}</strong>
            </span>
          </span>
        )}
      </button>
      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-canvas">
          <div className="flex shrink-0 items-center justify-between bg-surface px-3.5 py-1.5">
            <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-mute">
              Edycja trasy
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="text-[8px] font-bold text-brand-ink"
            >
              Zwiń panel
            </button>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Selected bus stop                                                          */
/* -------------------------------------------------------------------------- */

export function BusStopCard({
  stop,
  alreadyInRoute,
  canAdd,
  className,
  onClose,
  onAddVia,
  onSetStart,
  onSetEnd,
  onCenter,
  onOpenKursowka,
}: {
  className?: string;
  stop: BusStop;
  alreadyInRoute: boolean;
  canAdd: boolean;
  onClose: () => void;
  onAddVia: () => void;
  onSetStart: () => void;
  onSetEnd: () => void;
  onCenter: () => void;
  onOpenKursowka?: (kursowkaId: string, kursowkaCode: string) => void;
}) {
  return (
    <div
      title={stopDisplayName(stop)}
      className={cn(
        "w-[336px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border border-line/80 bg-surface/96 shadow-[0_16px_44px_rgba(13,42,28,0.17)] backdrop-blur-xl animate-rise-in dark:bg-surface/93",
        className
      )}
    >
      <div className="flex items-start gap-2.5 border-b border-line/70 bg-brand-soft/70 px-3 py-2.5">
        <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-on-brand">
          <Bus className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[7.5px] font-extrabold uppercase tracking-[0.16em] text-brand-ink/70">
            Przystanek autobusowy · {stop.source === "osm" ? "OSM" : "Rozkład Wałbrzych"}{stop.ref ? ` · stan. ${stop.ref}` : ""}
          </span>
          <h3 className="mt-0.5 text-[13px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            {stop.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kartę przystanku"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-surface hover:text-ink"
        >
          <X className="h-3 w-3" strokeWidth={2.3} />
        </button>
      </div>

      <div className="scroll-area max-h-[65vh] overflow-y-auto px-3 py-2.5">
        {stop.lines.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {stop.lines.slice(0, 10).map((line) => (
              <span
                key={line}
                className="metric rounded-md border border-line bg-raised px-1.5 py-[2px] text-[9px] font-bold text-ink-soft"
              >
                {line}
              </span>
            ))}
            {stop.lines.length > 10 && (
              <span className="rounded-md px-1 py-[2px] text-[8px] font-semibold text-mute">
                +{stop.lines.length - 10}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[9px] text-mute">
            Współrzędne przystanku dokładne. Kursówki i linie w tabeli GTFS poniżej.
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2 text-[8px] text-mute">
          <span className="truncate">{stop.operator ?? "Dane: © OpenStreetMap contributors"}</span>
          <span className="metric shrink-0 font-semibold text-ink-soft">
            {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
          </span>
        </div>

        {alreadyInRoute ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-2 text-[9.5px] font-bold text-brand-ink">
            <Check className="h-3 w-3" strokeWidth={2.6} />
            Ten przystanek jest już punktem trasy.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onSetEnd}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-highlight text-[10px] font-extrabold text-[#16240f] transition-all hover:brightness-[0.97] active:translate-y-px"
            >
              <Flag className="h-3.5 w-3.5" strokeWidth={2.4} />
              Jedź tutaj
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onSetStart}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[9px] font-bold text-ink-soft transition-colors hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                <Crosshair className="h-2.5 w-2.5" /> Start stąd
              </button>
              <button
                type="button"
                onClick={onAddVia}
                disabled={!canAdd}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[9px] font-bold text-ink-soft transition-colors hover:border-line-strong hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-2.5 w-2.5" /> Dodaj jako punkt trasy
              </button>
            </div>
            <div className="grid grid-cols-1">
              <button
                type="button"
                onClick={onCenter}
                className="flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[9px] font-bold text-ink-soft transition-colors hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                <Maximize2 className="h-2.5 w-2.5" /> Pokaż na mapie
              </button>
            </div>
          </div>
        )}
        <GtfsSchedule
          stop={stop}
          onAddDeparture={alreadyInRoute ? undefined : onSetEnd}
          onOpenKursowka={onOpenKursowka}
        />
      </div>
    </div>
  );
}
