"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  FileDown,
  MousePointer2,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type {
  AvoidOptions,
  BrigadeInfo,
  BusStop,
  LiveTrafficSummary,
  Place,
  ProfileMetrics,
  RouteData,
  ScheduleSettings,
  SpeedOverrides,
  VehicleId,
  Waypoint,
} from "@/lib/types";
import type { SavedBrigadePlan } from "@/lib/brigade";
import { readableEngine } from "@/lib/geo";
import BrigadePanel from "./BrigadePanel";
import RouteForm from "./RouteForm";
import FleetSpeedPanel from "./FleetSpeedPanel";
import BusStopPanel from "./BusStopPanel";
import SchedulePanel from "./SchedulePanel";
import type { ScheduleEvaluation } from "@/lib/schedule";
import { TripSummary, VehicleComparison } from "./TripSummary";
import { IconButton, Pill } from "./UI";

const SIDEBAR_COLLAPSED_KEY = "mapplaner.sidebar.v2";

type SidebarSection =
  | "brigade"
  | "route"
  | "fleet"
  | "schedule"
  | "stops"
  | "summary"
  | "comparison";

type CollapsedState = Record<SidebarSection, boolean>;

const DEFAULT_COLLAPSED: CollapsedState = {
  brigade: true,
  route: false,
  fleet: true,
  schedule: false,
  stops: true,
  summary: true,
  comparison: true,
};

function loadCollapsedState(): CollapsedState {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (!raw) return DEFAULT_COLLAPSED;
    const parsed = JSON.parse(raw) as Partial<CollapsedState>;
    if (!parsed || typeof parsed !== "object") return DEFAULT_COLLAPSED;
    return {
      brigade: parsed.brigade !== false,
      route: parsed.route === true,
      fleet: parsed.fleet !== false,
      schedule: parsed.schedule === true,
      stops: parsed.stops !== false,
      summary: parsed.summary !== false,
      comparison: parsed.comparison !== false,
    };
  } catch {
    return DEFAULT_COLLAPSED;
  }
}

interface PlanningPanelProps {
  brigade: BrigadeInfo;
  onBrigadeChange: (next: BrigadeInfo) => void;
  savedBrigades: SavedBrigadePlan[];
  onSaveBrigade: () => void;
  onLoadBrigade: (plan: SavedBrigadePlan) => void;
  onDeleteBrigade: (id: string) => void;
  waypoints: Waypoint[];
  vehicle: VehicleId;
  avoid: AvoidOptions;
  route: RouteData;
  metrics: ProfileMetrics;
  comparisons: ProfileMetrics[];
  isRouting: boolean;
  routingError: string;
  routeReady: boolean;
  exportReady: boolean;
  schedule: ScheduleSettings;
  scheduleEvaluation: ScheduleEvaluation;
  clockNow: number;
  signalCount: number;
  signalsLoading: boolean;
  liveTraffic: LiveTrafficSummary | null;
  onScheduleChange: (settings: ScheduleSettings) => void;
  speeds: SpeedOverrides;
  addMode: boolean;
  automaticSpeed: number;
  onSpeedChange: (speed: number | undefined) => void;
  onSaveVehicleAverageSpeed: (vehicle: VehicleId, speed: number) => void;
  onToggleAddMode: () => void;
  onOpenPdf: () => void;
  navPlaying: boolean;
  pickTarget: string | null;
  onSelectPlace: (index: number, place: Place) => void;
  onRemovePoint: (id: string) => void;
  onClearEndpoint: (id: string) => void;
  onClearRoute: () => void;
  onAddVia: () => void;
  onSwap: () => void;
  onPick: (id: string) => void;
  onVehicleChange: (vehicle: VehicleId) => void;
  onAvoidChange: (avoid: AvoidOptions) => void;
  onRecalculate: () => void;
  onOpenFleet: () => void;
  onOpenSettings: () => void;
  onOpenSteps: () => void;
  onToggleNavigation: () => void;
  onSave: () => void;
  onShare: () => void;
  onSelectVehicle: (vehicle: VehicleId) => void;
  onOpenReport: () => void;
  busStops: BusStop[];
  busLoading: boolean;
  busError: string;
  busQuery: string;
  stopScope: "all" | "near" | "used";
  nearRoute: Map<string, number>;
  selectedStopId: string | null;
  selectedStop: BusStop | null;
  usedStopKeys: Set<string>;
  busScopeLabel: string;
  busSeconds: number;
  onBusQuery: (value: string) => void;
  onBusScope: (scope: "all" | "near" | "used") => void;
  onRefreshBusStops: () => void;
  onSelectBusStop: (stop: BusStop) => void;
  onAddBusStop: (stop: BusStop) => void;
  onAddStopsAlongRoute: () => void;
  onCenterWalbrzych: () => void;
  onOpenKursowka: (kursowkaId: string, kursowkaCode: string) => void;
}

export default function PlanningPanel(props: PlanningPanelProps) {
  const [collapsed, setCollapsed] = useState<CollapsedState>(() => loadCollapsedState());

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* Storage optional */
    }
  }, [collapsed]);

  const toggleSection = (section: SidebarSection) => {
    setCollapsed((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-area flex-1 overflow-y-auto px-3.5 pb-3.5">
        <div className="flex items-start justify-between gap-2 pb-2.5 pt-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-[3px] w-[3px] rounded-full bg-emerald-500" />
              <span className="text-[8px] font-extrabold uppercase tracking-[0.2em] text-mute">
                Planer tras · GIS
              </span>
              <Pill tone="outline" className="px-1.5 py-0 text-[7px] tracking-[0.08em]">
                PL
              </Pill>
            </div>
            <h1 className="mt-0.5 text-[22px] font-extrabold leading-none tracking-[-0.045em] text-ink">
              Zaplanuj trasę
            </h1>
            <p className="mt-1 max-w-[280px] text-[9px] leading-snug text-mute">
              Do 50 punktów, kursówki GTFS Wałbrzych, światła, korki i autobusy GPS na żywo.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            <IconButton label="Zapisz trasę" onClick={props.onSave}>
              <Bookmark className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Udostępnij podsumowanie" onClick={props.onShare}>
              <Share2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <button
          type="button"
          onClick={props.onOpenPdf}
          disabled={!props.exportReady}
          className="mb-2.5 flex h-9 w-full items-center justify-between rounded-lg border border-brand/25 bg-brand-soft px-3 text-[11px] font-bold text-brand-ink transition-colors hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <FileDown className="h-3.5 w-3.5" /> Pobierz trasę PDF
          </span>
          <span className="text-[8px] font-semibold">Cała mapa · margines 2 cm</span>
        </button>

        <div className="mb-2.5">
          <BrigadePanel
            brigade={props.brigade}
            onChange={props.onBrigadeChange}
            savedBrigades={props.savedBrigades}
            routeReady={props.routeReady}
            onSaveBrigade={props.onSaveBrigade}
            onLoadBrigade={props.onLoadBrigade}
            onDeleteBrigade={props.onDeleteBrigade}
            collapsed={collapsed.brigade}
            onToggleCollapse={() => toggleSection("brigade")}
          />
        </div>

        <RouteForm
          waypoints={props.waypoints}
          busStops={props.busStops}
          busLoading={props.busLoading}
          busError={props.busError}
          onRefreshBusStops={props.onRefreshBusStops}
          avoid={props.avoid}
          isRouting={props.isRouting}
          pickTarget={props.pickTarget}
          addMode={props.addMode}
          onToggleAddMode={props.onToggleAddMode}
          onSelectPlace={props.onSelectPlace}
          onRemovePoint={props.onRemovePoint}
          onClearEndpoint={props.onClearEndpoint}
          onClearRoute={props.onClearRoute}
          onAddVia={props.onAddVia}
          onSwap={props.onSwap}
          onPick={props.onPick}
          onAvoidChange={props.onAvoidChange}
          onRecalculate={props.onRecalculate}
          collapsed={collapsed.route}
          onToggleCollapse={() => toggleSection("route")}
        />

        {props.routingError && (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[10px] leading-relaxed text-warning"
          >
            {props.routingError} Mapa może pokazywać poprzednią trasę. Eksport jest zablokowany do
            udanego przeliczenia.
          </div>
        )}
        {props.route.warnings?.map((warning) => (
          <p key={warning} role="status" className="mt-2 px-1 text-[9px] leading-relaxed text-warning">
            {warning}
          </p>
        ))}

        <div className="mt-2.5">
          <FleetSpeedPanel
            vehicle={props.vehicle}
            speed={props.speeds[props.vehicle]}
            automaticSpeed={props.automaticSpeed}
            distance={props.metrics.distance}
            onVehicleChange={props.onVehicleChange}
            onSpeedChange={props.onSpeedChange}
            onSaveVehicleAverageSpeed={props.onSaveVehicleAverageSpeed}
            onOpenFleet={props.onOpenFleet}
            collapsed={collapsed.fleet}
            onToggleCollapse={() => toggleSection("fleet")}
          />
        </div>

        <div className="mt-2.5">
          <SchedulePanel
            settings={props.schedule}
            evaluation={props.scheduleEvaluation}
            routeReady={props.routeReady}
            now={props.clockNow}
            signalCount={props.signalCount}
            signalsLoading={props.signalsLoading}
            liveTraffic={props.liveTraffic}
            onChange={props.onScheduleChange}
            collapsed={collapsed.schedule}
            onToggleCollapse={() => toggleSection("schedule")}
          />
        </div>

        <div className="mt-2.5">
          <BusStopPanel
            stops={props.busStops}
            loading={props.busLoading}
            error={props.busError}
            query={props.busQuery}
            scope={props.stopScope}
            nearRoute={props.nearRoute}
            canAdd={props.waypoints.length < 50}
            selectedId={props.selectedStopId}
            selectedStop={props.selectedStop}
            usedKeys={props.usedStopKeys}
            scopeLabel={props.busScopeLabel}
            seconds={props.busSeconds}
            onQuery={props.onBusQuery}
            onScope={props.onBusScope}
            onRefresh={props.onRefreshBusStops}
            onSelect={props.onSelectBusStop}
            onAdd={props.onAddBusStop}
            onAddNearRoute={props.onAddStopsAlongRoute}
            onCenterWałbrzych={props.onCenterWalbrzych}
            onOpenKursowka={props.onOpenKursowka}
            collapsed={collapsed.stops}
            onToggleCollapse={() => toggleSection("stops")}
          />
        </div>

        <div className="mt-2.5">
          <TripSummary
            route={props.route}
            waypoints={props.waypoints}
            metrics={props.metrics}
            brigade={props.brigade}
            isRouting={props.isRouting}
            navPlaying={props.navPlaying}
            routeReady={props.exportReady}
            onOpenSteps={props.onOpenSteps}
            onToggleNavigation={props.onToggleNavigation}
            collapsed={collapsed.summary}
            onToggleCollapse={() => toggleSection("summary")}
          />
        </div>

        <div className="mt-2.5">
          <VehicleComparison
            metrics={props.comparisons}
            activeVehicle={props.vehicle}
            onSelectVehicle={props.onSelectVehicle}
            onOpenMethodology={props.onOpenReport}
            className="xl:hidden"
            collapsed={collapsed.comparison}
            onToggleCollapse={() => toggleSection("comparison")}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-[9px] text-mute">
          <span className="flex items-center gap-1.5 truncate">
            <Sparkles className="h-3 w-3 shrink-0 text-brand-ink" />
            {readableEngine(props.route.engine)}
          </span>
          <button
            type="button"
            onClick={props.onOpenSettings}
            className="flex shrink-0 items-center gap-1 font-bold text-brand-ink hover:underline"
          >
            <SlidersHorizontal className="h-2.5 w-2.5" /> Źródła
          </button>
        </div>

        <p className="mt-2 flex items-center gap-1.5 px-1 text-[8.5px] text-mute">
          <MousePointer2 className="h-3 w-3 shrink-0" />
          Prawy przycisk na mapie ustawia start A lub metę B.
        </p>
      </div>
    </div>
  );
}
