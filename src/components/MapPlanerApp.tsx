"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KursowkaShapeOverlay, MapHandle } from "./MapView";
import PlanningPanel from "./PlanningPanel";
import TopBar from "./TopBar";
import KursowkiDialog from "./KursowkiDialog";
import {
  BusStopCard,
  LiveBusCard,
  LiveFleetControl,
  MapContextMenu,
  MapControls,
  MapDrawingBanner,
  MapRouteCard,
  MobilePlannerSheet,
  NavigationHud,
  PickBanner,
  QuickComparison,
} from "./MapOverlays";
import {
  FleetDialog,
  ReportDialog,
  SettingsDialog,
  StepsDrawer,
  Toast,
} from "./Modals";
import PdfExportDialog from "./PdfExportDialog";
import { APP_NAME } from "@/config/branding";
import {
  cleanBrigade,
  formatBrigadeTitle,
  hasBrigade,
  loadBrigade,
  loadSavedBrigades,
  persistSavedBrigades,
  saveBrigade,
  type SavedBrigadePlan,
} from "@/lib/brigade";
import {
  createEmptyWaypoint,
  createInitialWaypoints,
  DEFAULT_BUS_SPEED,
  EMPTY_ROUTE,
  isWaypointSet,
} from "@/lib/data";
import {
  fetchBusStops,
  filterStops,
  stopDisplayName,
  WALBRZYCH_BOUNDS,
  WALBRZYCH_CENTER,
  WALBRZYCH_ZOOM,
  type Bounds,
} from "@/lib/busStops";
import {
  buildComparisons,
  currentStepForProgress,
  estimateAverageSpeed,
  fetchRoute,
  formatDistance,
  formatDuration,
  haversine,
  insertionSlot,
  isValidSpeed,
  pointAtProgress,
  reverseGeocode,
  scaleRouteTimes,
  stopsAlongRoute,
} from "@/lib/geo";
import {
  calculateJourney,
  defaultSchedule,
  scheduleSummaryLines,
  SCHEDULE_STORAGE_KEY,
  withJourney,
} from "@/lib/schedule";
import {
  buildPlanKey,
  buildSnapshot,
  cleanSpeeds,
  defaultSpeedMap,
  loadLastRoute,
  snapshotSignature,
  SPEEDS_KEY,
  writeSnapshot,
  type LastRouteSnapshot,
} from "@/lib/lastRoute";
import { FLEET_STORAGE_KEY, replaceFleet } from "@/lib/fleet";
import {
  MAX_WAYPOINTS,
  type AvoidOptions,
  type BrigadeInfo,
  type BusStop,
  type LiveBusVehicle,
  type LiveTrafficSummary,
  type MapStyle,
  type Place,
  type RouteData,
  type RouteStep,
  type ScheduleSettings,
  type SpeedOverrides,
  type ThemeMode,
  type TrafficSignalIntersection,
  type VehicleId,
  type VehicleProfile,
  type WalbrzychOperatorKey,
  type Waypoint,
} from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const THEME_STORAGE_KEY = "mapplaner.theme";

interface MapContextMenuState {
  lat: number;
  lon: number;
  left: number;
  top: number;
}

const waypointId = () =>
  `wp-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

function loadTheme(): ThemeMode {
  try {
    return typeof window !== "undefined" && localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
};

const subscribeToHydration = () => () => {};

export default function MapPlanerApp() {
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  if (!mounted) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink" role="status">
        <div className="text-center">
          <p className="text-xl font-extrabold tracking-tight">MapPlaner</p>
          <p className="mt-2 text-xs text-mute">Ładowanie mapy i kursówek Wałbrzych…</p>
        </div>
      </div>
    );
  }
  return <MapPlanerWorkspace />;
}

function MapPlanerWorkspace() {
  const [boot] = useState<LastRouteSnapshot | null>(() => loadLastRoute());
  const initialWaypoints = boot?.waypoints ?? createInitialWaypoints();
  const [fleet, setFleet] = useState<VehicleProfile[]>(() => replaceFleet(boot?.fleet));
  const initialVehicle =
    boot?.vehicle && fleet.some((item) => item.id === boot.vehicle)
      ? boot.vehicle
      : fleet[0]?.id ?? "";

  const [isDesktop, setIsDesktop] = useState(() =>
    true
  );
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => loadTheme() === "dark" ? "dark" : "light");
  const [brigade, setBrigade] = useState<BrigadeInfo>(() => boot?.brigade ?? loadBrigade());
  const [savedBrigades, setSavedBrigades] = useState<SavedBrigadePlan[]>(() =>
    loadSavedBrigades()
  );
  const [waypoints, setWaypoints] = useState<Waypoint[]>(initialWaypoints);
  const [vehicle, setVehicle] = useState<VehicleId>(initialVehicle);
  const [avoid, setAvoid] = useState<AvoidOptions>(
    boot?.avoid ?? { tolls: false, ferries: false, unpaved: false }
  );
  const [speeds, setSpeeds] = useState<SpeedOverrides>(
    () => boot?.speeds ?? defaultSpeedMap(fleet)
  );
  const [schedule, setSchedule] = useState<ScheduleSettings>(
    () => boot?.schedule ?? defaultSchedule()
  );
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [route, setRoute] = useState<RouteData>(() => boot?.route ?? EMPTY_ROUTE);
  const [resolvedKey, setResolvedKey] = useState(() =>
    boot?.route ? buildPlanKey(initialWaypoints, boot.avoid) : ""
  );

  // Bus stops
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState("");
  const [busQuery, setBusQuery] = useState("");
  const [stopScope, setStopScope] = useState<"all" | "near" | "used">("all");
  const [busScope, setBusScope] = useState("Wałbrzych i okolice");
  const [busSeconds, setBusSeconds] = useState(0);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [contextMenu, setContextMenu] = useState<MapContextMenuState | null>(null);

  // Traffic signals along route
  const [trafficSignals, setTrafficSignals] = useState<TrafficSignalIntersection[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [showTrafficSignals, setShowTrafficSignals] = useState(true);

  // Live GPS Wałbrzych buses (ZDKiUM, ŚKA, MZUK)
  const [liveVehicles, setLiveVehicles] = useState<LiveBusVehicle[]>([]);
  const [liveTraffic, setLiveTraffic] = useState<LiveTrafficSummary | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [showLiveBuses, setShowLiveBuses] = useState(true);
  const [operatorFilter, setOperatorFilter] = useState<"all" | WalbrzychOperatorKey>("all");
  const [selectedLiveBus, setSelectedLiveBus] = useState<LiveBusVehicle | null>(null);

  // Kursówki dialog & shape overlay
  const [kursowkiOpen, setKursowkiOpen] = useState(false);
  const [kursowkaDeepLink, setKursowkaDeepLink] = useState<{
    id?: string | null;
    code?: string | null;
  }>({});
  const [kursowkaOverlay, setKursowkaOverlay] = useState<KursowkaShapeOverlay | null>(null);

  // Route editing & dialogs
  const [addMode, setAddMode] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [routingError, setRoutingError] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const [stepsOpen, setStepsOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [navActive, setNavActive] = useState(false);
  const [navPlaying, setNavPlaying] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    nonce: number;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const mapRef = useRef<MapHandle | null>(null);
  const mapAreaRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const pendingFitRef = useRef(false);
  const busAbortRef = useRef<AbortController | null>(null);
  const arrivalToastRef = useRef(false);
  const lastSavedSignatureRef = useRef(
    boot?.route ? snapshotSignature(boot as LastRouteSnapshot) : ""
  );
  const skipNextRouteKeyRef = useRef<string | null>(null);

  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const avoidRef = useRef(avoid);
  avoidRef.current = avoid;

  const showToast = useCallback((message: string) => setToastMessage(message), []);
  const closeToast = useCallback(() => setToastMessage(null), []);

  // Poll live GPS Wałbrzych buses every 15s
  const fetchLiveBuses = useCallback(async (force = false) => {
    setLiveLoading(true);
    try {
      const res = await fetch(`/api/buses/live${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok: boolean;
        vehicles?: LiveBusVehicle[];
        traffic?: LiveTrafficSummary | null;
      };
      if (json.ok && Array.isArray(json.vehicles)) {
        setLiveVehicles(json.vehicles);
        setLiveTraffic(json.traffic ?? null);
        setSelectedLiveBus((prev) =>
          prev ? json.vehicles?.find((v) => v.vehicleId === prev.vehicleId) ?? prev : null
        );
      }
    } catch {
      // Keep last known positions
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLiveBuses();
    const interval = window.setInterval(() => {
      void fetchLiveBuses();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [fetchLiveBuses]);

  // Trigger initial GTFS seed check once
  useEffect(() => {
    void fetch("/api/gtfs/status", { cache: "no-store" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("keydown", dismissEscape);
    };
  }, [contextMenu]);

  const readyForRouting = waypoints.length >= 2 && waypoints.every(isWaypointSet);
  const assignedCount = useMemo(() => waypoints.filter(isWaypointSet).length, [waypoints]);

  const planKey = buildPlanKey(waypoints, avoid);
  const routeReady =
    readyForRouting &&
    resolvedKey === planKey &&
    route.engine === "osrm" &&
    !isRouting &&
    !addMode &&
    !routingError;

  // Detect traffic signals whenever route geometry updates
  useEffect(() => {
    if (!routeReady || route.coords.length < 2) {
      setTrafficSignals([]);
      return;
    }
    let cancelled = false;
    setSignalsLoading(true);
    fetch("/api/traffic-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coords: route.coords }),
    })
      .then((res) => res.json())
      .then((json: { ok: boolean; intersections?: TrafficSignalIntersection[] }) => {
        if (!cancelled && json.ok && Array.isArray(json.intersections)) {
          setTrafficSignals(json.intersections);
        }
      })
      .catch(() => {
        if (!cancelled) setTrafficSignals([]);
      })
      .finally(() => {
        if (!cancelled) setSignalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeReady, route.coords]);

  const baseComparisons = useMemo(
    () => buildComparisons(route, undefined, avoid, speeds),
    [route, avoid, speeds, fleet]
  );

  const scheduleContext = useMemo(
    () => ({
      signalCount: trafficSignals.length,
      liveDelayPercent: liveTraffic?.recommendedPeakPercent,
    }),
    [trafficSignals.length, liveTraffic?.recommendedPeakPercent]
  );

  const scheduledProfiles = useMemo(
    () =>
      baseComparisons.map((metric) => {
        const evaluation = calculateJourney(metric.duration, schedule, clockNow, scheduleContext);
        return { metric: withJourney(metric, evaluation), evaluation };
      }),
    [baseComparisons, schedule, clockNow, scheduleContext]
  );

  const comparisons = useMemo(
    () => scheduledProfiles.map((item) => item.metric),
    [scheduledProfiles]
  );
  const activePlan =
    scheduledProfiles.find((item) => item.metric.id === vehicle) ?? scheduledProfiles[0];
  const metrics = activePlan.metric;
  const scheduleEvaluation = activePlan.evaluation;

  const exportReady = routeReady && !!metrics.journey;
  const navigationRoute = useMemo(
    () => scaleRouteTimes(route, metrics.duration),
    [route, metrics.duration]
  );
  const visibleStops = useMemo(() => filterStops(busStops, busQuery), [busStops, busQuery]);
  const visibleLiveBuses = useMemo(
    () =>
      operatorFilter === "all"
        ? liveVehicles
        : liveVehicles.filter((v) => v.operatorKey === operatorFilter),
    [liveVehicles, operatorFilter]
  );

  const usedStopKeys = useMemo(
    () =>
      new Set(
        waypoints
          .filter(isWaypointSet)
          .map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)
      ),
    [waypoints]
  );
  const nearRoute = useMemo(() => {
    if (!routeReady || route.coords.length < 2) return new Map<string, number>();
    return new Map(
      stopsAlongRoute(busStops, route.coords, 70).map((item) => [item.stop.id, item.distance])
    );
  }, [busStops, route.coords, routeReady]);
  const nearRouteIds = useMemo(() => new Set(nearRoute.keys()), [nearRoute]);
  const selectedStopInRoute = Boolean(
    selectedStop &&
      usedStopKeys.has(`${selectedStop.lat.toFixed(5)},${selectedStop.lon.toFixed(5)}`)
  );

  const makeSnapshot = (): LastRouteSnapshot =>
    buildSnapshot({
      waypoints,
      vehicle,
      fleet,
      speeds,
      schedule,
      avoid,
      brigade,
      route,
    });

  useEffect(() => {
    replaceFleet(fleet);
    try {
      localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(fleet));
    } catch {
      /* Storage optional */
    }
  }, [fleet]);

  useEffect(() => {
    try {
      localStorage.setItem(SPEEDS_KEY, JSON.stringify(cleanSpeeds(speeds, fleet)));
    } catch {
      /* Storage optional */
    }
  }, [speeds, fleet]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
    } catch {
      /* Storage optional */
    }
  }, [schedule]);

  useEffect(() => {
    saveBrigade(brigade);
  }, [brigade]);

  useEffect(() => {
    persistSavedBrigades(savedBrigades);
  }, [savedBrigades]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!routeReady || addMode) return;
    const snapshot = makeSnapshot();
    const signature = snapshotSignature(snapshot);
    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;
    writeSnapshot(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeReady, addMode, planKey, route, waypoints, vehicle, fleet, speeds, schedule, avoid, brigade]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) setMobileExpanded(false);
    };
    setIsDesktop(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  useEffect(() => {
    if (addMode) {
      setIsRouting(false);
      return;
    }
    if (!readyForRouting) {
      requestIdRef.current += 1;
      setIsRouting(false);
      setRoutingError("");
      setRoute(EMPTY_ROUTE);
      setResolvedKey("");
      return;
    }
    if (skipNextRouteKeyRef.current === planKey && refreshTick === 0) {
      skipNextRouteKeyRef.current = null;
      setIsRouting(false);
      return;
    }
    if (boot?.route && boot.planKey === planKey && refreshTick === 0) {
      setIsRouting(false);
      return;
    }
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setIsRouting(true);
    setRoutingError("");
    const timer = window.setTimeout(() => {
      fetchRoute({
        waypoints: waypointsRef.current,
        avoid: avoidRef.current,
        signal: controller.signal,
      })
        .then((data) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          setRoute(data);
          setResolvedKey(planKey);
          if (pendingFitRef.current) {
            pendingFitRef.current = false;
            setFitNonce((current) => current + 1);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          setRoutingError(
            error instanceof Error
              ? error.message
              : "Nie udało się pobrać trasy. Spróbuj ponownie."
          );
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === requestIdRef.current) {
            setIsRouting(false);
          }
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [planKey, refreshTick, addMode, readyForRouting, boot]);

  useEffect(() => {
    if (!navActive || !navPlaying) return;
    const interval = window.setInterval(() => {
      setNavProgress((current) => Math.min(1, current + 0.0055));
    }, 170);
    return () => window.clearInterval(interval);
  }, [navActive, navPlaying]);

  useEffect(() => {
    if (navActive && navProgress >= 1 && !arrivalToastRef.current) {
      arrivalToastRef.current = true;
      setNavPlaying(false);
      showToast("Dojechałeś do celu. Dziękujemy za podróż!");
    }
    if (!navActive) arrivalToastRef.current = false;
  }, [navActive, navProgress, showToast]);

  const stopNavigation = useCallback(() => {
    setNavActive(false);
    setNavPlaying(false);
    setNavProgress(0);
    arrivalToastRef.current = false;
  }, []);

  const startNavigation = useCallback(() => {
    if (!exportReady) {
      showToast("Najpierw wyznacz aktualną trasę i podaj poprawny termin.");
      return;
    }
    arrivalToastRef.current = false;
    setNavProgress(0);
    setNavActive(true);
    setNavPlaying(true);
    setMobileExpanded(false);
    const start = waypointsRef.current[0];
    if (isWaypointSet(start)) mapRef.current?.centerOn(start.lat, start.lon, 13);
    showToast("Podgląd nawigacji uruchomiony.");
  }, [showToast, exportReady]);

  const toggleNavigation = useCallback(() => {
    if (!navActive) {
      startNavigation();
      return;
    }
    setNavPlaying((current) => !current);
  }, [navActive, startNavigation]);

  const loadBusStops = useCallback(async (bounds: Bounds, scope: string, force = false) => {
    busAbortRef.current?.abort();
    const controller = new AbortController();
    busAbortRef.current = controller;
    setBusLoading(true);
    setBusError("");
    setBusSeconds(0);
    try {
      const stops = await fetchBusStops(bounds, {
        signal: controller.signal,
        force,
        onProgress: setBusSeconds,
      });
      if (controller.signal.aborted) return;
      setBusStops(stops);
      setBusScope(scope);
      if (!stops.length) {
        setBusError("Brak przystanków autobusowych w tym obszarze.");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBusError(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać przystanków."
      );
    } finally {
      if (!controller.signal.aborted) setBusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBusStops(WALBRZYCH_BOUNDS, "Wałbrzych i okolice");
    return () => busAbortRef.current?.abort();
  }, [loadBusStops]);

  const refreshBusStops = useCallback(() => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;
    const area = (bounds.north - bounds.south) * (bounds.east - bounds.west);
    if (area > 0.6) {
      showToast("Zbyt duży obszar dla Overpass. Przybliż mapę do miasta lub regionu.");
      return;
    }
    setSelectedStop(null);
    void loadBusStops(bounds, "Bieżący widok mapy", true);
  }, [loadBusStops, showToast]);

  const selectBusStop = useCallback((stop: BusStop, center: boolean) => {
    setSelectedLiveBus(null);
    setSelectedStop((current) => (current?.id === stop.id ? null : stop));
    if (center) mapRef.current?.centerOn(stop.lat, stop.lon, 16);
  }, []);

  const addBusStop = useCallback(
    (stop: BusStop, role: "via" | "start" | "end" = "via") => {
      const current = waypointsRef.current;
      const startEmpty = !isWaypointSet(current[0]);
      const endEmpty = !isWaypointSet(current[current.length - 1]);
      const effectiveRole: "via" | "start" | "end" =
        role === "via" ? (startEmpty ? "start" : endEmpty ? "end" : "via") : role;

      if (effectiveRole === "via" && current.length >= MAX_WAYPOINTS) {
        showToast(`Osiągnięto limit ${MAX_WAYPOINTS} punktów trasy.`);
        return;
      }
      stopNavigation();
      setPickTarget(null);
      const point: Waypoint = {
        id: waypointId(),
        label: `Przystanek autobusowy ${stopDisplayName(stop)}, Polska`,
        short: stopDisplayName(stop).slice(0, 46),
        lat: stop.lat,
        lon: stop.lon,
      };
      setWaypoints((list) => {
        if (effectiveRole === "start") return [{ ...point, id: list[0].id }, ...list.slice(1)];
        if (effectiveRole === "end") {
          return [...list.slice(0, -1), { ...point, id: list[list.length - 1].id }];
        }
        const next = [...list];
        const slot =
          routeReady && route.coords.length > 1
            ? insertionSlot(route, list, [stop.lat, stop.lon])
            : next.length - 2;
        next.splice(Math.min(Math.max(slot + 1, 1), next.length - 1), 0, point);
        return next;
      });
      pendingFitRef.current = true;
      setMobileExpanded(false);
      showToast(
        effectiveRole === "via"
          ? `Przystanek ${stopDisplayName(stop)} dodany do trasy.`
          : effectiveRole === "start"
            ? `Start ustawiony na przystanku ${stopDisplayName(stop)}.`
            : `Meta ustawiona na przystanku ${stopDisplayName(stop)}.`
      );
    },
    [showToast, stopNavigation, route, routeReady]
  );

  const addStopsAlongRoute = useCallback(() => {
    const current = waypointsRef.current;
    if (!routeReady || route.coords.length < 2) {
      showToast("Najpierw wyznacz trasę, aby dopasować do niej przystanki.");
      return;
    }
    const near = stopsAlongRoute(busStops, route.coords, 70);
    if (!near.length) {
      showToast("Nie znaleziono przystanków przy wyznaczonej trasie.");
      return;
    }
    const used = new Set(
      current
        .filter(isWaypointSet)
        .map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)
    );
    const working = [...current];
    let offset = 0;
    let added = 0;
    for (const item of near) {
      if (working.length >= MAX_WAYPOINTS) break;
      const key = `${item.stop.lat.toFixed(5)},${item.stop.lon.toFixed(5)}`;
      if (used.has(key)) continue;
      used.add(key);
      const slot = insertionSlot(route, current, [item.stop.lat, item.stop.lon]);
      working.splice(Math.min(slot + 1 + offset, working.length - 1), 0, {
        id: waypointId(),
        label: `Przystanek autobusowy ${stopDisplayName(item.stop)}, Polska`,
        short: stopDisplayName(item.stop).slice(0, 46),
        lat: item.stop.lat,
        lon: item.stop.lon,
      });
      offset += 1;
      added += 1;
    }
    if (!added) {
      showToast("Wszystkie przystanki przy trasie są już punktami trasy.");
      return;
    }
    stopNavigation();
    setAddMode(false);
    setPickTarget(null);
    setWaypoints(working);
    pendingFitRef.current = true;
    setMobileExpanded(false);
    showToast(
      added === 1
        ? "Dodano 1 przystanek przy trasie."
        : `Dodano ${added} przystanków w kolejności przejazdu.`
    );
  }, [busStops, route, routeReady, showToast, stopNavigation]);

  const centerWalbrzych = useCallback(() => {
    mapRef.current?.centerOn(WALBRZYCH_CENTER[0], WALBRZYCH_CENTER[1], WALBRZYCH_ZOOM);
    void loadBusStops(WALBRZYCH_BOUNDS, "Wałbrzych i okolice");
  }, [loadBusStops]);

  const updateCoordinate = (
    id: string,
    lat: number,
    lon: number,
    options: { fit?: boolean; resolveAddress?: boolean } = {}
  ) => {
    stopNavigation();
    if (options.fit) pendingFitRef.current = true;
    setWaypoints((current) =>
      current.map((point) => {
        if (point.id !== id) return point;
        const coordinate = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        return {
          ...point,
          lat,
          lon,
          label: coordinate,
          short: coordinate,
          empty: false,
        };
      })
    );
    if (options.resolveAddress !== false) {
      reverseGeocode(lat, lon)
        .then((place) => {
          if (!place) return;
          setWaypoints((current) =>
            current.map((point) =>
              point.id === id &&
              !point.empty &&
              Math.abs(point.lat - lat) < 0.000001 &&
              Math.abs(point.lon - lon) < 0.000001
                ? { ...point, label: place.label, short: place.short.slice(0, 46), empty: false }
                : point
            )
          );
        })
        .catch(() => undefined);
    }
  };

  const handleMapContextMenu = (lat: number, lon: number, clientX: number, clientY: number) => {
    const bounds = mapAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const menuWidth = 284;
    const menuHeight = 136;
    setSelectedStop(null);
    setSelectedLiveBus(null);
    setPickTarget(null);
    setAddMode(false);
    setContextMenu({
      lat,
      lon,
      left: Math.max(8, Math.min(clientX - bounds.left, bounds.width - menuWidth - 8)),
      top: Math.max(8, Math.min(clientY - bounds.top, bounds.height - menuHeight - 8)),
    });
  };

  const setContextCoordinate = (role: "start" | "end") => {
    if (!contextMenu) return;
    const current = waypointsRef.current;
    const endpoint = role === "start" ? current[0] : current[current.length - 1];
    if (!endpoint) return;
    const { lat, lon } = contextMenu;
    setContextMenu(null);
    setSelectedStop(null);
    setPickTarget(null);
    setAddMode(false);
    setMobileExpanded(false);
    updateCoordinate(endpoint.id, lat, lon, { fit: true, resolveAddress: false });
    showToast(
      `${role === "start" ? "Miejsce startowe" : "Miejsce końcowe"} ustawione.`
    );
  };

  const appendMapPoint = (lat: number, lon: number, slot?: number) => {
    const current = waypointsRef.current;
    const firstId = current[0]?.id;
    const lastId = current[current.length - 1]?.id;
    if (firstId && !isWaypointSet(current[0])) {
      updateCoordinate(firstId, lat, lon, { fit: false, resolveAddress: false });
      return;
    }
    if (lastId && !isWaypointSet(current[current.length - 1])) {
      updateCoordinate(lastId, lat, lon, { fit: true, resolveAddress: false });
      return;
    }
    if (current.length >= MAX_WAYPOINTS) {
      setAddMode(false);
      showToast(`Osiągnięto limit ${MAX_WAYPOINTS} punktów.`);
      return;
    }
    stopNavigation();
    const newPoint: Waypoint = {
      id: waypointId(),
      lat,
      lon,
      label: `Punkt na mapie (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
      short: `Punkt ${current.length - 1}`,
    };
    const next = [...current];
    next.splice(slot === undefined ? next.length - 1 : slot + 1, 0, newPoint);
    waypointsRef.current = next;
    setWaypoints(next);
    if (next.length >= MAX_WAYPOINTS) setAddMode(false);
    pendingFitRef.current = true;
  };

  const handleToggleAddMode = () => {
    stopNavigation();
    setPickTarget(null);
    if (!addMode && waypoints.length >= MAX_WAYPOINTS) {
      showToast(`Limit to ${MAX_WAYPOINTS} punktów.`);
      return;
    }
    setAddMode((current) => !current);
    setMobileExpanded(false);
  };

  const nearestStop = (lat: number, lon: number, maxMetres: number) => {
    let best: BusStop | null = null;
    let bestDistance = maxMetres;
    for (const stop of busStops) {
      const distance = haversine([lat, lon], [stop.lat, stop.lon]);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = stop;
      }
    }
    return best;
  };

  const handleMapClick = (lat: number, lon: number) => {
    setContextMenu(null);
    if (addMode) {
      appendMapPoint(lat, lon);
      return;
    }
    if (!pickTarget) return;
    const stop = nearestStop(lat, lon, 40);
    if (stop) {
      assignStopToPoint(pickTarget, stop);
      return;
    }
    const target = pickTarget;
    setPickTarget(null);
    updateCoordinate(target, lat, lon, { fit: true });
    showToast("Punkt został ustawiony na mapie.");
  };

  const handleMarkerDrag = (id: string, lat: number, lon: number) => {
    setPickTarget(null);
    updateCoordinate(id, lat, lon);
    showToast("Punkt przesunięty — trasa jest przeliczana.");
  };

  const handleLineClick = (point: [number, number]) => {
    if (addMode || pickTarget) {
      handleMapClick(point[0], point[1]);
      return;
    }
    if (!routeReady) {
      showToast("Poczekaj na trasę lub włącz zaznaczanie wielu punktów.");
      return;
    }
    const slot = insertionSlot(route, waypoints, point);
    appendMapPoint(point[0], point[1], slot);
    showToast("Dodano punkt pośredni. Przeciągnij pinezkę, aby go przesunąć.");
  };

  const handleAddVia = () => {
    if (waypoints.length >= MAX_WAYPOINTS) {
      showToast(`Limit to ${MAX_WAYPOINTS} punktów.`);
      return;
    }
    setAddMode(false);
    stopNavigation();
    const previous = waypoints[waypoints.length - 2] ?? waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const prevSet = isWaypointSet(previous) ? previous : null;
    const destSet = isWaypointSet(destination) ? destination : null;
    const via: Waypoint = {
      id: waypointId(),
      label: "Nowy punkt pośredni — kliknij mapę",
      short: "Nowy punkt",
      lat:
        prevSet && destSet
          ? (prevSet.lat + destSet.lat) / 2
          : (prevSet?.lat ?? destSet?.lat ?? WALBRZYCH_CENTER[0]),
      lon:
        prevSet && destSet
          ? (prevSet.lon + destSet.lon) / 2
          : (prevSet?.lon ?? destSet?.lon ?? WALBRZYCH_CENTER[1]),
    };
    setWaypoints((current) => {
      const next = [...current];
      next.splice(next.length - 1, 0, via);
      return next;
    });
    setPickTarget(via.id);
    setMobileExpanded(false);
    showToast("Dodano punkt pośredni. Wskaż jego lokalizację na mapie.");
  };

  const handleRemovePoint = (id: string) => {
    if (waypoints.length <= 2) return;
    if (id === waypoints[0]?.id || id === waypoints[waypoints.length - 1]?.id) return;
    stopNavigation();
    setWaypoints((current) => current.filter((point) => point.id !== id));
    showToast("Punkt pośredni usunięty.");
  };

  const handleClearEndpoint = (id: string) => {
    stopNavigation();
    setPickTarget((current) => (current === id ? null : current));
    setWaypoints((current) =>
      current.map((point) => (point.id === id ? createEmptyWaypoint(point.id) : point))
    );
  };

  const handleClearRoute = () => {
    stopNavigation();
    setAddMode(false);
    setPickTarget(null);
    setRoutingError("");
    setRoute(EMPTY_ROUTE);
    setResolvedKey("");
    setTrafficSignals([]);
    setWaypoints(createInitialWaypoints());
    showToast("Trasa wyczyszczona.");
  };

  const handleSwap = () => {
    stopNavigation();
    setWaypoints((current) => [...current].reverse());
    setPickTarget(null);
    pendingFitRef.current = true;
    showToast("Zamieniono punkt startowy z metą.");
  };

  const handleSelectPlace = (index: number, place: Place) => {
    stopNavigation();
    setWaypoints((current) =>
      current.map((point, pointIndex) =>
        pointIndex === index
          ? {
              ...point,
              label: place.label,
              short: place.short.slice(0, 46),
              lat: place.lat,
              lon: place.lon,
              empty: false,
            }
          : point
      )
    );
    setPickTarget(null);
    setMobileExpanded(false);
    pendingFitRef.current = true;
    showToast(`Ustawiono: ${place.short}`);
  };

  const handlePick = (id: string) => {
    setAddMode(false);
    const next = pickTarget === id ? null : id;
    setPickTarget(next);
    setSelectedStop(null);
    setMobileExpanded(false);
  };

  const assignStopToPoint = (id: string, stop: BusStop) => {
    stopNavigation();
    setAddMode(false);
    setPickTarget(null);
    setSelectedStop(stop);
    setWaypoints((current) =>
      current.map((point) =>
        point.id === id
          ? {
              ...point,
              lat: stop.lat,
              lon: stop.lon,
              label: `Przystanek autobusowy ${stopDisplayName(stop)}, Polska`,
              short: stopDisplayName(stop).slice(0, 46),
              empty: false,
            }
          : point
      )
    );
    pendingFitRef.current = true;
    const role =
      id === waypointsRef.current[0]?.id
        ? "Start"
        : id === waypointsRef.current[waypointsRef.current.length - 1]?.id
          ? "Meta"
          : "Punkt";
    showToast(`${role}: ${stopDisplayName(stop)}. Trasa zostanie przeliczona.`);
  };

  const handleVehicleChange = (next: VehicleId) => {
    if (!fleet.some((item) => item.id === next)) return;
    stopNavigation();
    setVehicle(next);
  };

  const handleFleetChange = (nextFleet: VehicleProfile[]) => {
    const previousMap = new Map(fleet.map((item) => [item.id, item]));
    const cleaned = replaceFleet(nextFleet);
    stopNavigation();
    setFleet(cleaned);
    if (!cleaned.some((item) => item.id === vehicle)) setVehicle(cleaned[0].id);
    setSpeeds((current) => {
      const next = cleanSpeeds(current, cleaned);
      for (const item of cleaned) {
        const prev = previousMap.get(item.id);
        if (
          !prev ||
          Math.abs(prev.averageSpeed - item.averageSpeed) >= 0.05 ||
          next[item.id] === undefined
        ) {
          next[item.id] = item.averageSpeed ?? DEFAULT_BUS_SPEED;
        }
      }
      return next;
    });
  };

  const handleSaveVehicleAverageSpeed = (targetVehicleId: VehicleId, nextSpeed: number) => {
    if (!isValidSpeed(nextSpeed)) return;
    const rounded = Math.round(nextSpeed * 10) / 10;
    const updatedFleet = replaceFleet(
      fleet.map((item) =>
        item.id === targetVehicleId ? { ...item, averageSpeed: rounded } : item
      )
    );
    setFleet(updatedFleet);
    setSpeeds((current) => ({ ...current, [targetVehicleId]: rounded }));
    const found = updatedFleet.find((item) => item.id === targetVehicleId);
    showToast(
      `Przypisano ${rounded.toLocaleString("pl-PL")} km/h na stałe do wozu ${found?.short ?? ""}.`
    );
  };

  const handleAvoidChange = (next: AvoidOptions) => {
    stopNavigation();
    setAvoid(next);
  };

  const handleRecalculate = () => {
    if (!readyForRouting) {
      showToast("Wybierz najpierw punkt startowy A i metę B.");
      return;
    }
    pendingFitRef.current = true;
    setIsRouting(true);
    setRefreshTick((current) => current + 1);
  };

  const handleSaveRoute = () => {
    if (!routeReady) {
      showToast("Najpierw wyznacz poprawną trasę, aby zapisać ostatni plan.");
      return;
    }
    const snapshot = makeSnapshot();
    if (writeSnapshot(snapshot)) {
      lastSavedSignatureRef.current = snapshotSignature(snapshot);
      showToast("Ostatnia wyznaczona trasa zapisana w tej przeglądarce.");
    } else {
      showToast("Nie udało się zapisać trasy.");
    }
  };

  const handleSaveBrigadePlan = () => {
    const cleaned = cleanBrigade(brigade);
    const title = formatBrigadeTitle(cleaned);
    if (!hasBrigade(cleaned) || !title) {
      showToast("Wpisz numer linii lub służby, aby zapisać brygadę.");
      return;
    }
    if (!routeReady) {
      showToast("Najpierw wyznacz aktualną trasę dla tej brygady.");
      return;
    }
    const plan: SavedBrigadePlan = {
      id: `brigade-${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
      title,
      brigade: cleaned,
      waypoints,
      vehicle,
      fleet,
      speeds,
      schedule,
      avoid,
      route,
      savedAt: new Date().toISOString(),
    };
    setSavedBrigades((current) =>
      [plan, ...current.filter((item) => item.id !== plan.id)].slice(0, 30)
    );
    showToast(`Zapisano brygadę: ${title}.`);
  };

  const handleLoadBrigadePlan = (plan: SavedBrigadePlan) => {
    stopNavigation();
    setAddMode(false);
    setPickTarget(null);
    setRoutingError("");
    setBrigade(plan.brigade);
    if (plan.fleet?.length) {
      const restored = replaceFleet(plan.fleet);
      setFleet(restored);
      setVehicle(
        restored.some((item) => item.id === plan.vehicle) ? plan.vehicle : restored[0].id
      );
    } else if (fleet.some((item) => item.id === plan.vehicle)) {
      setVehicle(plan.vehicle);
    }
    if (plan.speeds) setSpeeds(plan.speeds);
    if (plan.schedule) setSchedule(plan.schedule);
    setAvoid(plan.avoid);
    setWaypoints(plan.waypoints);
    const nextPlanKey = buildPlanKey(plan.waypoints, plan.avoid);
    if (plan.route && plan.route.engine === "osrm" && plan.route.coords.length >= 2) {
      skipNextRouteKeyRef.current = nextPlanKey;
      setRoute(plan.route);
      setResolvedKey(nextPlanKey);
      setFitNonce((current) => current + 1);
    } else {
      pendingFitRef.current = true;
    }
    showToast(`Wczytano brygadę: ${plan.title}.`);
  };

  const handleDeleteBrigadePlan = (id: string) => {
    setSavedBrigades((current) => current.filter((item) => item.id !== id));
    showToast("Usunięto zapisaną brygadę.");
  };

  const handleOpenKursowkaFromItem = useCallback((kursowkaId: string, kursowkaCode: string) => {
    setKursowkaDeepLink({ id: kursowkaId || null, code: kursowkaCode || null });
    setKursowkiOpen(true);
  }, []);

  const handleSelectBus = useCallback((bus: LiveBusVehicle) => {
    setOperatorFilter("all");
    setShowLiveBuses(true);
    setSelectedStop(null);
    setSelectedLiveBus(bus);
    setKursowkiOpen(false);
    setMobileExpanded(false);
    mapRef.current?.centerOn(bus.lat, bus.lon, 16);
  }, []);

  const handleSetOperator = useCallback(
    async (vehicleId: string, key: WalbrzychOperatorKey | null) => {
      try {
        const res = await fetch("/api/buses/operator", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleId, operatorKey: key }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error || "Nie udało się zapisać przypisania.");
        await fetchLiveBuses(true);
        const names = { mzuk: "MZUK", ska: "ŚKA", other: "Inny" } as const;
        showToast(
          key
            ? `Wóz #${vehicleId} przypisano do: ${names[key]}.`
            : `Wóz #${vehicleId}: przywrócono automatyczne przypisanie.`
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Nie udało się zapisać przypisania.");
      }
    },
    [fetchLiveBuses, showToast]
  );

  const handleLoadTripToPlanner = useCallback(
    (payload: {
      line: string;
      duty: string;
      waypoints: Waypoint[];
      departureTime?: string;
      headsign?: string;
    }) => {
      stopNavigation();
      setAddMode(false);
      setPickTarget(null);
      setRoutingError("");
      setBrigade({ line: payload.line, duty: payload.duty });
      setWaypoints(payload.waypoints);
      if (payload.departureTime) {
        setSchedule((prev) => ({
          ...prev,
          mode: "departure",
          time: payload.departureTime!,
        }));
      }
      pendingFitRef.current = true;
      setMobileExpanded(false);
      showToast(
        `Wczytano kurs kursówki ${payload.duty} (${payload.headsign || payload.waypoints.length + " przyst."}) do Planera.`
      );
    },
    [stopNavigation, showToast]
  );

  const handleShare = async () => {
    if (!exportReady || !metrics.journey) {
      showToast("Wyznacz trasę i sprawdź datę przed kopiowaniem planu.");
      return;
    }
    const profile = metrics.profile?.name ?? metrics.name ?? vehicle;
    const brigadeTitle = formatBrigadeTitle(brigade);
    const text = [
      `${APP_NAME}${brigadeTitle ? ` · ${brigadeTitle}` : ""} · plan podróży`,
      ...(brigadeTitle ? [`Brygada: ${brigadeTitle}`] : []),
      waypoints.map((point) => point.short).join(" → "),
      `Profil: ${profile}`,
      `Dystans: ${formatDistance(metrics.distance)}`,
      `Czas: ${formatDuration(metrics.duration)}`,
      ...scheduleSummaryLines(metrics.journey),
      window.location.href,
    ].join("\n");
    const copied = await copyToClipboard(text);
    showToast(copied ? "Podsumowanie trasy skopiowane do schowka." : "Nie udało się skopiować.");
  };

  const handleSpeedChange = (speed: number | undefined) => {
    if (speed !== undefined && !isValidSpeed(speed)) return;
    setSpeeds((current) => {
      const next = { ...current };
      if (speed === undefined) delete next[vehicle];
      else next[vehicle] = speed;
      return next;
    });
  };

  const handleScheduleChange = (next: ScheduleSettings) => {
    stopNavigation();
    setClockNow(Date.now());
    setSchedule(next);
  };

  const openPdf = () => {
    if (!routeReady) {
      showToast("Zakończ zaznaczanie i poczekaj na aktualną trasę przed eksportem.");
      return;
    }
    if (!metrics.journey) {
      showToast("Popraw datę i godzinę w planie przejazdu przed eksportem.");
      return;
    }
    setPdfOpen(true);
  };

  const handleFocusStep = (step: RouteStep) => {
    if (!step.location) {
      showToast("Dla tego manewru nie ma zapisanej lokalizacji.");
      return;
    }
    setFocus({
      lat: step.location[0],
      lon: step.location[1],
      zoom: 14,
      nonce: Date.now(),
    });
    setStepsOpen(false);
    setMobileExpanded(false);
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (mapStyle !== "satellite") {
      setMapStyle(next === "dark" ? "dark" : "light");
    }
  };

  const currentStepInfo = useMemo(
    () => currentStepForProgress(navigationRoute, navProgress),
    [navigationRoute, navProgress]
  );
  const suggestedStepIndex = useMemo(() => {
    const index = route.steps.findIndex((step) => step.maneuver !== "depart");
    return index >= 0 ? index : 0;
  }, [route]);
  const hudStepIndex = navActive ? currentStepInfo.index : suggestedStepIndex;
  const hudStep = navigationRoute.steps[hudStepIndex];
  const hudRemainingDistance = navActive
    ? metrics.distance * (1 - navProgress)
    : hudStep?.distance ?? 0;
  const hudRemainingTime = navActive
    ? metrics.duration * (1 - navProgress)
    : hudStep?.duration ?? 0;
  const navCoord = useMemo<[number, number] | null>(
    () => (navActive ? pointAtProgress(route, navProgress) : null),
    [navActive, route, navProgress]
  );

  const panelProps = {
    brigade,
    onBrigadeChange: setBrigade,
    savedBrigades,
    onSaveBrigade: handleSaveBrigadePlan,
    onLoadBrigade: handleLoadBrigadePlan,
    onDeleteBrigade: handleDeleteBrigadePlan,
    waypoints,
    vehicle,
    avoid,
    route,
    metrics,
    comparisons,
    isRouting,
    routingError,
    routeReady,
    exportReady,
    schedule,
    scheduleEvaluation,
    clockNow,
    signalCount: trafficSignals.length,
    signalsLoading,
    liveTraffic,
    onScheduleChange: handleScheduleChange,
    speeds,
    addMode,
    automaticSpeed: estimateAverageSpeed(route.distance, metrics.automaticDuration),
    onSpeedChange: handleSpeedChange,
    onSaveVehicleAverageSpeed: handleSaveVehicleAverageSpeed,
    onToggleAddMode: handleToggleAddMode,
    onOpenPdf: openPdf,
    navPlaying,
    pickTarget,
    onSelectPlace: handleSelectPlace,
    onRemovePoint: handleRemovePoint,
    onClearEndpoint: handleClearEndpoint,
    onClearRoute: handleClearRoute,
    onAddVia: handleAddVia,
    onSwap: handleSwap,
    onPick: handlePick,
    onVehicleChange: handleVehicleChange,
    onAvoidChange: handleAvoidChange,
    onRecalculate: handleRecalculate,
    onOpenFleet: () => setFleetOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
    onOpenSteps: () => setStepsOpen(true),
    onToggleNavigation: toggleNavigation,
    onSave: handleSaveRoute,
    onShare: handleShare,
    onSelectVehicle: handleVehicleChange,
    onOpenReport: () => setReportOpen(true),
    busStops,
    busLoading,
    busError,
    busQuery,
    stopScope,
    nearRoute,
    selectedStopId: selectedStop?.id ?? null,
    selectedStop,
    usedStopKeys,
    busScopeLabel: busScope,
    busSeconds,
    onBusQuery: setBusQuery,
    onBusScope: setStopScope,
    onRefreshBusStops: refreshBusStops,
    onSelectBusStop: (stop: BusStop) => selectBusStop(stop, true),
    onAddBusStop: (stop: BusStop) => addBusStop(stop, "via"),
    onAddStopsAlongRoute: addStopsAlongRoute,
    onCenterWalbrzych: centerWalbrzych,
    onOpenKursowka: handleOpenKursowkaFromItem,
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      <TopBar
        route={route}
        isRouting={isRouting}
        routeReady={routeReady}
        theme={theme}
        liveBusCount={liveVehicles.length}
        showLiveBuses={showLiveBuses}
        kursowkiOpen={kursowkiOpen}
        onToggleLiveBuses={() => setShowLiveBuses((c) => !c)}
        onToggleTheme={toggleTheme}
        onOpenPdf={openPdf}
        pdfDisabled={!exportReady}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSteps={() => setStepsOpen(true)}
        onOpenFleet={() => setFleetOpen(true)}
        onOpenReport={() => setReportOpen(true)}
        onOpenKursowki={() => {
          setKursowkaDeepLink({});
          setKursowkiOpen(true);
        }}
        onOpenPlanner={() => {
          setKursowkiOpen(false);
          if (window.innerWidth < 1024) setMobileExpanded(true);
        }}
      />

      <div className="flex min-h-0 flex-1">
        {isDesktop && (
          <aside className="flex min-h-0 w-[404px] shrink-0 flex-col border-r border-line bg-canvas 2xl:w-[416px]">
            <PlanningPanel {...panelProps} />
          </aside>
        )}

        <main
          ref={mapAreaRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#dfe6d9] dark:bg-[#313944]"
        >
          <MapView
            ref={mapRef}
            route={route}
            waypoints={waypoints}
            mapStyle={mapStyle}
            theme={theme}
            fitNonce={fitNonce}
            pickMode={Boolean(pickTarget) || addMode}
            draftMode={addMode}
            busStops={visibleStops}
            selectedStopId={selectedStop?.id ?? null}
            nearRouteIds={nearRouteIds}
            usedStopKeys={usedStopKeys}
            onBusStopClick={(stop) => {
              if (pickTarget) {
                assignStopToPoint(pickTarget, stop);
                return;
              }
              if (addMode) {
                addBusStop(stop, "via");
                return;
              }
              selectBusStop(stop, false);
            }}
            liveBuses={visibleLiveBuses}
            showLiveBuses={showLiveBuses}
            selectedLiveBusId={selectedLiveBus?.vehicleId ?? null}
            onLiveBusClick={(bus) => {
              setSelectedStop(null);
              setSelectedLiveBus((prev) =>
                prev?.vehicleId === bus.vehicleId ? null : bus
              );
            }}
            trafficSignals={trafficSignals}
            showTrafficSignals={showTrafficSignals}
            kursowkaOverlay={kursowkaOverlay}
            navCoord={navCoord}
            followNav={navActive && navPlaying}
            focus={focus}
            onLineClick={handleLineClick}
            onMarkerDrag={handleMarkerDrag}
            onMapClick={handleMapClick}
            onMapContextMenu={handleMapContextMenu}
          />

          <div className="pointer-events-none absolute inset-0 z-[500]">
            <div className="absolute left-3 top-5 flex max-w-[calc(100%-72px)] flex-col gap-2 lg:top-3">
              {addMode ? (
                <div className="pointer-events-auto">
                  <MapDrawingBanner
                    count={assignedCount}
                    onDone={() => setAddMode(false)}
                    onUndo={() => {
                      if (waypoints.length > 2) {
                        handleRemovePoint(waypoints[waypoints.length - 2].id);
                      }
                    }}
                  />
                </div>
              ) : pickTarget ? (
                <div className="pointer-events-auto">
                  <PickBanner
                    target={
                      pickTarget === waypoints[0]?.id
                        ? "start"
                        : pickTarget === waypoints[waypoints.length - 1]?.id
                          ? "meta"
                          : "punkt"
                    }
                    onCancel={() => setPickTarget(null)}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="pointer-events-auto">
                    <LiveFleetControl
                      showLiveBuses={showLiveBuses}
                      onToggleLiveBuses={() => setShowLiveBuses((c) => !c)}
                      operatorFilter={operatorFilter}
                      onOperatorFilter={setOperatorFilter}
                      liveVehicles={liveVehicles}
                      liveTraffic={liveTraffic}
                      liveLoading={liveLoading}
                      onRefreshLive={() => void fetchLiveBuses(true)}
                      signalCount={trafficSignals.length}
                      showTrafficSignals={showTrafficSignals}
                      onToggleTrafficSignals={() => setShowTrafficSignals((c) => !c)}
                      kursowkaOverlayTitle={kursowkaOverlay?.title ?? null}
                      onClearKursowkaOverlay={() => setKursowkaOverlay(null)}
                      onSelectBus={handleSelectBus}
                    />
                  </div>
                  <MapRouteCard
                    route={route}
                    waypoints={waypoints}
                    metrics={metrics}
                    vehicle={vehicle}
                    brigade={brigade}
                    mapStyle={mapStyle}
                    routeReady={routeReady}
                  />
                  {selectedStop && (
                    <BusStopCard
                      className="pointer-events-auto"
                      stop={selectedStop}
                      alreadyInRoute={selectedStopInRoute}
                      canAdd={waypoints.length < MAX_WAYPOINTS}
                      onClose={() => setSelectedStop(null)}
                      onAddVia={() => addBusStop(selectedStop, "via")}
                      onSetStart={() => addBusStop(selectedStop, "start")}
                      onSetEnd={() => addBusStop(selectedStop, "end")}
                      onCenter={() =>
                        mapRef.current?.centerOn(selectedStop.lat, selectedStop.lon, 16)
                      }
                      onOpenKursowka={handleOpenKursowkaFromItem}
                    />
                  )}
                  {selectedLiveBus && (
                    <div className="pointer-events-auto">
                      <LiveBusCard
                        bus={selectedLiveBus}
                        onClose={() => setSelectedLiveBus(null)}
                        onOpenKursowka={(code) => handleOpenKursowkaFromItem("", code)}
                        onSetOperator={handleSetOperator}
                        onCenter={() =>
                          mapRef.current?.centerOn(
                            selectedLiveBus.lat,
                            selectedLiveBus.lon,
                            16
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pointer-events-auto absolute right-3 top-3">
              <MapControls
                mapStyle={mapStyle}
                onMapStyle={setMapStyle}
                onZoomIn={() => mapRef.current?.zoomIn()}
                onZoomOut={() => mapRef.current?.zoomOut()}
                onFit={() => mapRef.current?.fitRoute()}
                busCount={visibleStops.length}
                busLoading={busLoading}
                onRefreshBusStops={refreshBusStops}
                onHome={centerWalbrzych}
              />
            </div>

            <div className="pointer-events-auto absolute bottom-8 left-3 hidden lg:block">
              <NavigationHud
                active={navActive}
                playing={navPlaying}
                progress={navProgress}
                step={hudStep}
                stepIndex={hudStepIndex}
                totalSteps={route.steps.length}
                remainingDistance={hudRemainingDistance}
                remainingTime={hudRemainingTime}
                vehicle={vehicle}
                vehicleShort={metrics.short}
                onStart={startNavigation}
                onToggle={toggleNavigation}
                onStop={stopNavigation}
                onOpenSteps={() => setStepsOpen(true)}
              />
            </div>

            <div className="pointer-events-auto absolute bottom-8 right-3 hidden xl:block">
              <QuickComparison
                metrics={comparisons}
                activeVehicle={vehicle}
                onSelectVehicle={handleVehicleChange}
                onOpenReport={() => setReportOpen(true)}
              />
            </div>

            <div className="absolute bottom-[14px] left-3 hidden items-center gap-2 rounded-full border border-line/70 bg-surface/80 px-2 py-1 backdrop-blur sm:flex">
              <span className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> A start
              </span>
              <span className="h-2 w-px bg-line" />
              <span className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
                <span className="h-1.5 w-1.5 rounded-full bg-ink ring-1 ring-highlight" /> B meta
              </span>
              <span className="h-2 w-px bg-line" />
              <span className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1a73e8]" /> przystanek (
                {visibleStops.length})
              </span>
              <span className="h-2 w-px bg-line" />
              <span className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
                <span className="h-1.5 w-1.5 rounded-full bg-[#86efac]" /> MZUK
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#c084fc]" /> ŚKA ({visibleLiveBuses.length})
              </span>
              {trafficSignals.length > 0 && (
                <>
                  <span className="h-2 w-px bg-line" />
                  <span className="flex items-center gap-1 text-[7.5px] font-bold text-mute">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> światła (
                    {trafficSignals.length})
                  </span>
                </>
              )}
            </div>
          </div>

          {contextMenu && (
            <div className="pointer-events-none absolute inset-0 z-[1200]">
              <MapContextMenu
                ref={contextMenuRef}
                lat={contextMenu.lat}
                lon={contextMenu.lon}
                left={contextMenu.left}
                top={contextMenu.top}
                onSetStart={() => setContextCoordinate("start")}
                onSetEnd={() => setContextCoordinate("end")}
              />
            </div>
          )}

          {!isDesktop && (
            <MobilePlannerSheet
              expanded={mobileExpanded}
              onToggle={() => setMobileExpanded((current) => !current)}
              waypoints={waypoints}
              metrics={metrics}
              vehicleShort={metrics.short}
              brigade={brigade}
              routeReady={exportReady}
            >
              <PlanningPanel {...panelProps} />
            </MobilePlannerSheet>
          )}

          {isRouting && (
            <div className="pointer-events-none absolute left-0 top-0 z-[800] h-[3px] w-full overflow-hidden bg-brand/15">
              <div className="route-progress h-full w-1/3 rounded-full bg-highlight" />
            </div>
          )}
        </main>
      </div>

      <KursowkiDialog
        open={kursowkiOpen}
        initialKursowkaId={kursowkaDeepLink.id}
        initialKursowkaCode={kursowkaDeepLink.code}
        onClose={() => setKursowkiOpen(false)}
        liveVehicles={liveVehicles}
        onSelectBus={handleSelectBus}
        onLoadTripToPlanner={handleLoadTripToPlanner}
        onShowShapeOnMap={(shape) => {
          setKursowkaOverlay(shape);
          showToast(`Wyświetlono trasę: ${shape.title}`);
        }}
      />

      <StepsDrawer
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        route={navigationRoute}
        waypoints={waypoints}
        metrics={metrics}
        vehicle={vehicle}
        onFocusStep={handleFocusStep}
        onStartNavigation={startNavigation}
      />
      <FleetDialog
        open={fleetOpen}
        onClose={() => setFleetOpen(false)}
        fleet={fleet}
        activeId={vehicle}
        onSelect={handleVehicleChange}
        onChange={handleFleetChange}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        engine={route.engine === "osrm" ? "OSRM (bez klucza)" : "Schemat demonstracyjny"}
      />
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        waypoints={waypoints}
        route={route}
        metrics={comparisons}
        activeVehicle={vehicle}
        brigade={brigade}
        onOpenPdf={openPdf}
        pdfDisabled={!exportReady}
      />
      <PdfExportDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        route={navigationRoute}
        waypoints={waypoints}
        metrics={metrics}
        vehicle={vehicle}
        brigade={brigade}
        routeReady={exportReady}
      />
      {toastMessage && <Toast message={toastMessage} onClose={closeToast} />}
    </div>
  );
}
