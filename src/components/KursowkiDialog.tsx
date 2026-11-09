"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BusFront, Calendar, ChevronDown, ChevronUp, Clock, Crosshair, Info, Loader2, Map as MapIcon, Navigation, Radio, RefreshCw } from "lucide-react";
import { Dialog, ModalHeader } from "./Modals";
import BusSearch from "./BusSearch";
import type { LiveBusVehicle, Waypoint } from "@/lib/types";
import { cn } from "@/utils/cn";
import { DELAY_STYLES, delayTone, describeDelay, formatDelay, formatSpeed, formatVehicleNumber } from "@/lib/delay";
import { findBuses, normalizeDutyCode, normalizeSearch, OPERATOR_STYLES } from "@/lib/transit";

interface RouteItem {
  id: string; shortName: string; longName: string; color: string; textColor: string;
  perService: Record<string, { kursowkiCount: number; tripsCount: number }>;
}
interface ServiceItem { serviceId: string; label: string; isToday: boolean; datesCount: number }
interface DutySummary {
  id: string; routeId: string; routeShort: string; serviceId: string;
  kursowkaCode: string; brigadeNum: string; source: string; tripCount: number;
  firstDepartureMin: number | null; lastArrivalMin: number | null;
  firstStopName: string; lastStopName: string;
  hasSchedule: boolean; unassigned: boolean; availableServices: string[];
  liveBus: LiveBusVehicle | null;
}
interface TripStop {
  stopId: string; stopSequence: number; stopName: string; lat: number; lon: number;
  arrivalClock: string; departureClock: string;
}
interface TripDetail {
  id: string; kursowkaCode: string; brigadeSource: string; headsign: string;
  firstStopName: string; lastStopName: string; stopCount: number;
  startClock: string; endClock: string; durationMinutes: number;
  layoverMinutes: number | null; stops: TripStop[];
}
interface DetailResponse {
  ok: boolean; kursowka: DutySummary; route: RouteItem | null;
  trips: TripDetail[]; shapes: Record<string, [number, number][]>;
  notice?: string | null; error?: string;
}
interface Props {
  open: boolean;
  initialKursowkaId?: string | null;
  initialKursowkaCode?: string | null;
  liveVehicles: LiveBusVehicle[];
  onSelectBus: (bus: LiveBusVehicle) => void;
  onClose: () => void;
  onLoadTripToPlanner: (payload: { line: string; duty: string; waypoints: Waypoint[]; departureTime?: string; headsign?: string }) => void;
  onShowShapeOnMap: (payload: { title: string; color: string; polylines: [number, number][][]; stops: Array<{ name: string; lat: number; lon: number }> }) => void;
}
function clock(minutes: number | null): string {
  if (minutes === null) return "—";
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function sourceLabel(source: string): string {
  return source === "live_gps" ? "Potwierdzona w GPS" : source === "gps_estimated" ? "GPS + przebieg szacowany" : source === "gtfs" ? "Blok GTFS" : source === "conflict" ? "Do weryfikacji · nakładające się godziny" : "Bez przypisanej kursówki";
}
function CompanyBadge({ bus }: { bus: LiveBusVehicle }) {
  const company = OPERATOR_STYLES[bus.operatorKey];
  return <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold" style={{ background: company.bg, color: company.fg }}>{company.label}</span>;
}
function DelayBadge({ seconds }: { seconds: number }) {
  const style = DELAY_STYLES[delayTone(seconds)];
  return <span className="metric inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold" style={{ background: style.bg, color: style.fg }} title={describeDelay(seconds)}><span>{formatDelay(seconds)}</span><span className="font-sans text-[9px]">{seconds > 0 ? "opóźn." : seconds < 0 ? "przysp." : "planowo"}</span></span>;
}

export default function KursowkiDialog({ open, initialKursowkaId, initialKursowkaCode, liveVehicles, onSelectBus, onClose, onLoadTripToPlanner, onShowShapeOnMap }: Props) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceId, setServiceId] = useState("weekday");
  const [routeId, setRouteId] = useState("all");
  const [catalog, setCatalog] = useState<DutySummary[]>([]);
  const [selection, setSelection] = useState<{ id?: string; code?: string }>({});
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [liveError, setLiveError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingLines(true);
    fetch("/api/gtfs/lines", { cache: "no-store" }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Nie udało się pobrać linii.");
      if (cancelled) return;
      setRoutes(json.routes);
      setServices(json.services);
      setServiceId((previous) => json.services.some((item: ServiceItem) => item.serviceId === previous) ? previous : json.defaultServiceId);
    }).catch((error) => { if (!cancelled) setCatalogError(error instanceof Error ? error.message : "Błąd wczytywania linii."); }).finally(() => { if (!cancelled) setLoadingLines(false); });
    return () => { cancelled = true; };
  }, [open, revision]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLiveOnly(false);
    setSyncMessage("");
    setCatalogError("");
    if (initialKursowkaId) {
      const parts = initialKursowkaId.split("|");
      if (parts.length === 3 && !initialKursowkaId.startsWith("live|")) { setRouteId(parts[0]); setServiceId(parts[1]); }
      setSelection({ id: initialKursowkaId });
      setMobileView("detail");
    } else if (initialKursowkaCode) {
      setRouteId("all");
      setSelection({ code: initialKursowkaCode });
      setMobileView("detail");
    } else {
      setSelection({});
      setMobileView("list");
    }
  }, [open, initialKursowkaId, initialKursowkaCode]);

  useEffect(() => {
    if (!open || loadingLines) return;
    const controller = new AbortController();
    setLoadingCatalog(true);
    setCatalogError("");
    setLiveError("");
    setCatalog([]);
    setDetail(null);
    const params = new URLSearchParams({ serviceId });
    if (routeId !== "all") params.set("routeId", routeId);
    fetch(`/api/gtfs/kursowki?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Nie udało się pobrać kursówek.");
      if (controller.signal.aborted) return;
      setCatalog(json.kursowki);
      setLiveError(json.liveError || "");
      setSelection((previous) => previous.id || previous.code ? previous : json.kursowki[0] ? { id: json.kursowki[0].id } : {});
    }).catch((error) => { if (!controller.signal.aborted) { setCatalogError(error instanceof Error ? error.message : "Błąd wczytywania kursówek."); setSelection({}); } }).finally(() => { if (!controller.signal.aborted) setLoadingCatalog(false); });
    return () => controller.abort();
  }, [open, routeId, serviceId, revision, loadingLines]);

  useEffect(() => {
    if (!open || (!selection.id && !selection.code)) { setDetail(null); setLoadingDetail(false); return; }
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    setLoadingDetail(true);
    const params = new URLSearchParams({ serviceId });
    if (selection.id) params.set("id", selection.id);
    else if (selection.code) params.set("code", selection.code);
    fetch(`/api/gtfs/kursowka?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Nie udało się pobrać kursów.");
      if (controller.signal.aborted) return;
      setDetail(json);
      setExpandedTripId(json.trips[0]?.id ?? null);
    }).catch((error) => { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Błąd wczytywania kursów."); }).finally(() => { if (!controller.signal.aborted) setLoadingDetail(false); });
    return () => controller.abort();
  }, [open, selection.id, selection.code, serviceId, revision]);

  const liveByCode = useMemo(() => new Map(liveVehicles.filter((bus) => bus.kursowka.includes("/")).map((bus) => [bus.kursowka, bus])), [liveVehicles]);
  const items = useMemo(() => catalog.map((item) => ({ ...item, liveBus: liveByCode.get(item.kursowkaCode) ?? item.liveBus })), [catalog, liveByCode]);
  const filtered = useMemo(() => {
    const term = normalizeDutyCode(query);
    return items.filter((item) => {
      if (liveOnly && !item.liveBus) return false;
      if (!term) return true;
      const code = normalizeDutyCode(item.kursowkaCode);
      if (term.includes("/")) return code === term || Boolean(item.liveBus && findBuses([item.liveBus], query).length);
      return code.includes(term) || Boolean(item.liveBus && findBuses([item.liveBus], query).length) || normalizeSearch(item.kursowkaCode).includes(normalizeSearch(query));
    });
  }, [items, query, liveOnly]);
  const current = detail ? { ...detail, kursowka: { ...detail.kursowka, liveBus: liveByCode.get(detail.kursowka.kursowkaCode) ?? detail.kursowka.liveBus } } : null;
  const selectDuty = (item: DutySummary) => { setSelection({ id: item.id }); setMobileView("detail"); };
  const selectRoute = (id: string) => { setRouteId(id); setSelection({}); setDetail(null); setMobileView("list"); };
  const selectService = (id: string) => { setServiceId(id); setSelection({}); setDetail(null); setMobileView("list"); };

  const sync = async () => {
    setSyncing(true); setSyncMessage(""); setCatalogError("");
    try {
      const response = await fetch("/api/gtfs/sync", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Synchronizacja nie powiodła się.");
      setSyncMessage(`Zaktualizowano rozkład: ${json.routes} linii i ${json.trips} kursów w katalogu.`);
      setRevision((value) => value + 1);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : "Błąd synchronizacji."); }
    finally { setSyncing(false); }
  };
  const loadTrip = (trip: TripDetail) => {
    if (!current || trip.stops.length < 2) return;
    let picked = trip.stops;
    if (picked.length > 50) picked = Array.from({ length: 50 }, (_, index) => trip.stops[index === 49 ? trip.stops.length - 1 : Math.round(index * (trip.stops.length - 1) / 49)]);
    onLoadTripToPlanner({
      line: current.route?.shortName ?? current.kursowka.routeShort,
      duty: current.kursowka.unassigned ? "" : current.kursowka.kursowkaCode,
      waypoints: picked.map((stop, index) => ({ id: `gtfs-${trip.id}-${index}`, label: `${stop.stopName} (${stop.departureClock})`, short: stop.stopName, lat: stop.lat, lon: stop.lon, empty: false })),
      departureTime: trip.startClock, headsign: trip.headsign,
    });
    onClose();
  };
  const showShape = () => {
    if (!current) return;
    const seen = new Set<string>();
    const stops = current.trips.flatMap((trip) => trip.stops).filter((stop) => { if (seen.has(stop.stopId)) return false; seen.add(stop.stopId); return true; });
    const lines = Object.values(current.shapes).filter((line) => line.length > 1);
    onShowShapeOnMap({ title: `Kursówka ${current.kursowka.kursowkaCode}`, color: current.route?.color ?? "#60a5fa", polylines: lines.length ? lines : current.trips.map((trip) => trip.stops.map((stop) => [stop.lat, stop.lon] as [number, number])), stops: stops.map((stop) => ({ name: stop.stopName, lat: stop.lat, lon: stop.lon })) });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} label="Kursówki Wałbrzych" className="max-w-[1120px] duty-dialog-shell">
      <ModalHeader eyebrow="Rozkład Wałbrzych · GPS na żywo" title="Kursówki" subtitle="Wybierz linię i kursówkę albo znajdź autobus po numerze." onClose={onClose} icon={<BusFront className="h-5 w-5" />} />
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-3 sm:p-5" aria-busy={loadingCatalog}>
        <BusSearch vehicles={liveVehicles} onSelectVehicle={onSelectBus} query={query} onQueryChange={setQuery} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1" aria-label="Typ dnia rozkładu">
            <Calendar className="mr-1 h-3.5 w-3.5 text-mute" />
            {services.map((service) => <button key={service.serviceId} type="button" aria-pressed={serviceId === service.serviceId} onClick={() => selectService(service.serviceId)} className={cn("rounded-lg border px-2.5 py-2 text-[11px] font-bold", serviceId === service.serviceId ? "border-brand bg-brand text-on-brand" : "border-line bg-raised text-ink-soft hover:border-line-strong")}>{service.label}{service.isToday && <span className="ml-1.5 text-[9px] opacity-75">· dziś</span>}</button>)}
          </div>
          <button type="button" onClick={sync} disabled={syncing} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[11px] font-bold text-ink-soft hover:bg-raised disabled:opacity-50"><RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />{syncing ? "Aktualizuję…" : "Odśwież GTFS"}</button>
        </div>
        <div className="mt-3 flex min-w-0 gap-1.5 overflow-x-auto pb-2" aria-label="Wybierz linię">
          <button type="button" aria-pressed={routeId === "all"} onClick={() => selectRoute("all")} className={cn("shrink-0 rounded-lg border px-3 py-2 text-xs font-bold", routeId === "all" ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-raised text-ink-soft")}>Wszystkie linie</button>
          {routes.map((route) => <button key={route.id} type="button" aria-label={`Linia ${route.shortName}`} aria-pressed={routeId === route.id} onClick={() => selectRoute(route.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5", routeId === route.id ? "border-brand bg-brand-soft" : "border-line bg-raised hover:border-line-strong")}><span className="metric grid h-6 min-w-6 place-items-center rounded px-1 text-xs font-bold" style={{ background: route.color, color: route.textColor }}>{route.shortName}</span><span className="text-[10px] font-semibold text-mute">{route.perService[serviceId]?.tripsCount ?? 0} kursów</span></button>)}
        </div>
        {(catalogError || liveError || syncMessage) && <div className="mt-2 space-y-2" role="status">{catalogError && <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs text-warning">{catalogError} <button className="underline" onClick={() => setRevision((value) => value + 1)}>Spróbuj ponownie</button></p>}{liveError && <p className="text-[11px] text-warning">{liveError}</p>}{syncMessage && <p className="text-[11px] text-brand-ink">{syncMessage}</p>}</div>}
        <details className="mt-2 text-[10px] leading-relaxed text-mute"><summary className="cursor-pointer">Skąd pochodzą numery kursówek?</summary><p className="mt-1 max-w-3xl">Numery potwierdzają obserwacje GPS. Połączenia pozostałych kursów z rozkładem są szacowane i oznaczone osobno. Kursy bez wiarygodnego przypisania trafiają do „Bez numeru”, nie do wymyślonej kursówki. Kolory ikon oznaczają firmę; pasek czasu pokazuje punktualność.</p></details>

        <div className="duty-browser-grid mt-3 gap-3" data-mobile-view={mobileView}>
          <section className="duty-list-pane min-w-0 rounded-xl border border-line bg-raised p-3" aria-label="Lista kursówek">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2"><h3 className="text-xs font-bold text-ink">{routeId === "all" ? "Wszystkie linie" : `Linia ${routes.find((route) => route.id === routeId)?.shortName ?? ""}`} <span className="ml-1 font-normal text-mute">({filtered.length})</span></h3><button type="button" aria-pressed={liveOnly} onClick={() => setLiveOnly((value) => !value)} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold", liveOnly ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-mute")}><Radio className="h-3 w-3" />Tylko GPS</button></div>
            {loadingCatalog ? <div className="space-y-2 py-3" role="status" aria-label="Wczytywanie kursówek">{[0, 1, 2, 3].map((value) => <div key={value} className="stop-skeleton h-24 rounded-lg" />)}</div> : filtered.length === 0 ? <div className="px-2 py-8 text-center"><BusFront className="mx-auto mb-2 h-6 w-6 text-mute" /><p className="text-xs leading-relaxed text-mute">{query ? `Brak kursówki „${query}” w katalogu. Autobusy GPS sprawdzisz w wyszukiwarce powyżej.` : liveOnly ? "Brak autobusów GPS w tym widoku. Wyłącz filtr „Tylko GPS”, aby zobaczyć rozkład." : "Brak kursówek w wybranym typie dnia. Nie podstawiamy rozkładu z innego dnia."}</p>{(query || liveOnly) && <button className="mt-3 text-xs font-bold text-brand-ink underline" onClick={() => { setQuery(""); setLiveOnly(false); }}>Pokaż wszystkie</button>}</div> : <div className="duty-list-scroll mt-2 space-y-2 pr-1">
              {filtered.map((item) => {
                const active = selection.id === item.id || detail?.kursowka.id === item.id;
                const company = item.liveBus ? OPERATOR_STYLES[item.liveBus.operatorKey] : null;
                return <button key={item.id} type="button" data-testid="duty-card" aria-pressed={active} onClick={() => selectDuty(item)} className={cn("block w-full min-w-0 rounded-lg border bg-surface p-3 text-left transition-colors hover:border-line-strong", active ? "border-brand ring-1 ring-brand/30" : "border-line")} style={company ? { borderLeftWidth: 3, borderLeftColor: company.bg } : undefined}>
                  <span className="flex items-center justify-between gap-2"><span className="metric text-sm font-bold text-ink">{item.unassigned ? `${item.routeShort} · Bez numeru` : item.kursowkaCode}</span><span className="shrink-0 rounded bg-soft px-1.5 py-0.5 text-[10px] text-ink-soft">{item.tripCount} kursów</span></span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-mute"><Clock className="h-3 w-3 shrink-0" />{item.hasSchedule ? `${clock(item.firstDepartureMin)}–${clock(item.lastArrivalMin)}` : "GPS · brak rozkładu w tym dniu"}{routeId === "all" && <span className="ml-auto rounded border border-line px-1.5 text-[10px]">Linia {item.routeShort}</span>}</span>
                  {item.firstStopName && <span className="mt-1 block text-[10px] leading-relaxed text-mute break-words">{item.firstStopName} → {item.lastStopName}</span>}
                  {item.liveBus ? <span className="mt-2 flex flex-wrap items-center gap-1.5"><CompanyBadge bus={item.liveBus} /><span className="metric text-[11px] font-bold text-ink">{formatVehicleNumber(item.liveBus.vehicleId)}</span><span className="text-[10px] text-mute">{formatSpeed(item.liveBus.speedKmh)}</span><span className="ml-auto"><DelayBadge seconds={item.liveBus.delaySeconds} /></span></span> : <span className="mt-2 block text-[9px] text-mute">{sourceLabel(item.source)}{item.source === "gps_estimated" ? " · część kursów szacowana" : ""}</span>}
                </button>;
              })}
            </div>}
          </section>

          <section className="duty-detail-pane min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-4" aria-label="Kursy wybranej kursówki">
            <button type="button" onClick={() => setMobileView("list")} className="mb-3 flex items-center gap-1.5 text-xs font-bold text-brand-ink min-[900px]:hidden"><ArrowLeft className="h-3.5 w-3.5" />Wróć do listy</button>
            {loadingDetail ? <div role="status" className="flex items-center gap-2 py-12 text-xs text-mute"><Loader2 className="h-4 w-4 animate-spin" />Wczytywanie kursów…</div> : detailError ? <div role="alert" className="py-8 text-center"><p className="text-xs leading-relaxed text-warning">{detailError}</p><button type="button" onClick={() => { setRevision((value) => value + 1); }} className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-bold">Spróbuj ponownie</button></div> : !current ? <div className="grid min-h-48 place-items-center px-4 text-center text-xs leading-relaxed text-mute">{loadingCatalog ? "Wczytywanie katalogu…" : "Wybierz kursówkę z listy, aby zobaczyć wszystkie jej kursy."}</div> : <>
              <div className="border-b border-line pb-3">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-raised px-2 py-1 text-[11px] font-bold text-ink-soft">Linia {current.route?.shortName ?? current.kursowka.routeShort}</span><h3 className="metric min-w-0 break-words text-lg font-bold text-ink">{current.kursowka.unassigned ? "Kursy bez numeru" : `Kursówka ${current.kursowka.kursowkaCode}`}</h3></div>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mute"><span>{current.trips.length} kursów w rozkładzie</span>{current.kursowka.hasSchedule && <span className="metric">{clock(current.kursowka.firstDepartureMin)}–{clock(current.kursowka.lastArrivalMin)}</span>}<span>· {sourceLabel(current.kursowka.source)}</span></p>
                {current.kursowka.liveBus && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-raised p-2.5"><CompanyBadge bus={current.kursowka.liveBus} /><span className="metric text-sm font-bold text-ink">{formatVehicleNumber(current.kursowka.liveBus.vehicleId)}</span><span className="text-[11px] text-mute">{formatSpeed(current.kursowka.liveBus.speedKmh)}</span><DelayBadge seconds={current.kursowka.liveBus.delaySeconds} /></div>}
                {current.notice && <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{current.notice}</p>}
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!current.kursowka.liveBus} onClick={() => current.kursowka.liveBus && onSelectBus(current.kursowka.liveBus)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-bold text-on-brand disabled:cursor-not-allowed disabled:opacity-40"><Crosshair className="h-3.5 w-3.5" />{current.kursowka.liveBus ? "Znajdź autobus na mapie" : "Autobus poza GPS"}</button><button type="button" disabled={!current.trips.length} onClick={showShape} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[11px] font-bold text-ink-soft hover:bg-raised disabled:opacity-40"><MapIcon className="h-3.5 w-3.5" />Pokaż trasę</button></div>
              </div>
              <div className="duty-trips-scroll mt-3 space-y-2 pr-1">
                {current.trips.map((trip, index) => {
                  const expanded = expandedTripId === trip.id;
                  return <article key={trip.id} className="duty-trip-card overflow-hidden rounded-lg border border-line bg-raised">
                    <div className="flex min-w-0 items-start gap-2 p-3">
                      <span className="metric grid h-6 w-6 shrink-0 place-items-center rounded bg-soft text-[10px] font-bold text-mute">{index + 1}</span>
                      <button type="button" onClick={() => setExpandedTripId(expanded ? null : trip.id)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-center gap-1.5"><span className="metric text-sm font-bold text-brand-ink">{trip.startClock}</span><ArrowRight className="h-3 w-3 text-mute" /><span className="metric text-sm font-bold text-ink">{trip.endClock}</span><span className="ml-1 text-[10px] text-mute">{trip.durationMinutes} min · {trip.stopCount} przyst.</span></span>
                        <span className="mt-1.5 block break-words text-[11px] leading-relaxed text-ink-soft">{trip.firstStopName} → <strong>Końcowy: {trip.headsign || trip.lastStopName}</strong></span>
                        <span className="mt-1 flex flex-wrap gap-2 text-[9px] text-mute">{trip.layoverMinutes !== null && <span>Postój: {trip.layoverMinutes} min</span>}<span>{trip.brigadeSource === "live_gps" ? "Przypisanie potwierdzone w GPS" : trip.brigadeSource === "gtfs" ? "Blok GTFS" : "Przypisanie szacowane"}</span></span>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1.5"><button type="button" onClick={() => loadTrip(trip)} disabled={trip.stops.length < 2} title="Wczytaj kurs do Planera" aria-label={`Wczytaj kurs ${trip.startClock} do Planera`} className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] font-bold text-brand-ink disabled:opacity-40"><Navigation className="h-3 w-3" /><span className="hidden sm:inline">Do Planera</span></button><button type="button" onClick={() => setExpandedTripId(expanded ? null : trip.id)} aria-label={expanded ? "Zwiń przystanki" : "Rozwiń przystanki"} className="p-1 text-mute">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
                    </div>
                    {expanded && <ol className="grid min-w-0 gap-1 border-t border-line bg-surface p-2 sm:grid-cols-2" aria-label={`Przystanki kursu ${trip.startClock}`}>{trip.stops.map((stop, stopIndex) => <li key={`${stop.stopSequence}-${stop.stopId}`} className="flex min-w-0 items-center gap-2 rounded border border-line bg-raised px-2 py-2"><span className="metric shrink-0 text-[11px] font-bold text-brand-ink">{stop.departureClock}</span><span className="w-4 shrink-0 text-[9px] text-mute">{stopIndex + 1}</span><span className="min-w-0 break-words text-[11px] leading-snug text-ink">{stop.stopName}</span></li>)}</ol>}
                  </article>;
                })}
              </div>
            </>}
          </section>
        </div>
      </div>
    </Dialog>
  );
}
