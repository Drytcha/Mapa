"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BusFront, CalendarClock, Info, Loader2, MapPinned, RefreshCw } from "lucide-react";
import type { BusStop, WalbrzychOperatorKey } from "@/lib/types";
import { cn } from "@/utils/cn";
import { DELAY_STYLES, delayTone, describeDelay, formatDelay, formatVehicleNumber } from "@/lib/delay";
import { OPERATOR_STYLES } from "@/lib/transit";

export interface StopDepartureItem {
  tripId: string; kursowkaId: string; kursowka: string; brigadeSource: string;
  routeShort: string; routeColor: string; routeTextColor: string;
  headsign: string; finalStop: string; atMs: number; clock: string; dateLabel: string;
  isRealtime: boolean; delaySeconds: number; vehicleId: string | null;
  operatorName: string | null; operatorKey?: WalbrzychOperatorKey | null;
}
interface MatchedStop { id: string; name: string; lat: number; lon: number; distanceMeters: number }
interface Props {
  stop: BusStop;
  onAddDeparture?: (stop: { id: string; name: string; lat: number; lon: number }) => void;
  onOpenKursowka?: (id: string, code: string) => void;
  className?: string;
}

export default function GtfsSchedule({ stop, onAddDeparture, onOpenKursowka, className }: Props) {
  const [matched, setMatched] = useState<MatchedStop | null>(null);
  const [departures, setDepartures] = useState<StopDepartureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(() => new Date());
  const [limit, setLimit] = useState(8);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ lat: String(stop.lat), lon: String(stop.lon), name: stop.name, from: String(from.getTime()), limit: String(limit) });
      if (stop.gtfsId) params.set("stopId", stop.gtfsId);
      const response = await fetch(`/api/gtfs/stop-departures?${params}`, { cache: "no-store", signal: controller.signal });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Błąd odczytu rozkładu.");
      if (controller.signal.aborted) return;
      setMatched(json.matched); setDepartures(json.departures ?? []);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Nie udało się odczytać rozkładu.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [stop.lat, stop.lon, stop.name, stop.gtfsId, from, limit]);
  useEffect(() => { setDepartures([]); setMatched(null); void load(); return () => request.current?.abort(); }, [load, retry]);
  const fromClock = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(from);

  return (
    <section className={cn("mt-2 overflow-hidden rounded-xl border border-line bg-raised", className)} data-testid="gtfs-schedule">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink"><CalendarClock className="h-3.5 w-3.5 text-brand-ink" />Rozkład jazdy · kursówki</h4>
        <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => setFrom(new Date())} aria-label="Pokaż najbliższe kursy" className="p-1.5 text-mute hover:text-ink"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /></button><button type="button" onClick={() => setFrom(new Date(from.getTime() + 30 * 60000))} className="rounded px-1.5 py-1 text-[10px] font-bold text-brand-ink">+30 min</button></div>
      </div>
      <div className="p-3">
        {loading && !departures.length && <p role="status" className="flex items-center gap-2 py-4 text-xs text-mute"><Loader2 className="h-4 w-4 animate-spin" />Wczytywanie rozkładu…</p>}
        {error && <div role="alert" className="rounded-lg bg-warning-soft p-2 text-xs text-warning">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 block font-bold underline">Spróbuj ponownie</button></div>}
        {!loading && !error && !matched && <p className="py-3 text-xs leading-relaxed text-mute">Brak odpowiednika tego przystanku w rozkładzie GTFS Wałbrzych.</p>}
        {!error && matched && <>
          <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="break-words text-xs font-bold text-ink">{matched.name}</p><p className="mt-0.5 text-[10px] text-mute">Od {fromClock} ·czas polski</p></div>{onAddDeparture && <button type="button" onClick={() => onAddDeparture(matched)} className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1.5 text-[10px] font-bold text-brand-ink"><MapPinned className="h-3 w-3" />Ustaw jako metę</button>}</div>
          {departures.length === 0 ? <p className="py-4 text-xs text-mute">Brak kolejnych kursów w tym oknie czasowym.</p> : <ul className="mt-2 space-y-1.5" aria-label="Najbliższe odjazdy">{departures.map((departure) => {
            const style = DELAY_STYLES[delayTone(departure.delaySeconds)];
            const company = departure.operatorKey ? OPERATOR_STYLES[departure.operatorKey] : null;
            return <li key={`${departure.tripId}-${departure.atMs}`} className="min-w-0 rounded-lg border border-line bg-surface p-2.5">
              <div className="flex flex-wrap items-center gap-1.5"><span className="metric text-sm font-bold text-brand-ink">{departure.clock}</span><span className="metric rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: departure.routeColor, color: departure.routeTextColor }}>Linia {departure.routeShort}</span>{new Date(departure.atMs).toDateString() !== new Date().toDateString() && <span className="text-[9px] text-mute">{departure.dateLabel}</span>}{departure.isRealtime && <span className="metric ml-auto rounded px-1.5 py-1 text-[10px] font-bold" style={{ background: style.bg, color: style.fg }} title={describeDelay(departure.delaySeconds)}>{formatDelay(departure.delaySeconds)} <span className="font-sans text-[9px]">{departure.delaySeconds > 0 ? "opóźn." : departure.delaySeconds < 0 ? "przysp." : "planowo"}</span></span>}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => onOpenKursowka?.(departure.kursowkaId, departure.kursowka)} className="flex min-w-0 items-center gap-1 rounded border border-brand/30 bg-brand-soft px-1.5 py-1 text-[10px] font-bold text-brand-ink"><BusFront className="h-3 w-3 shrink-0" /><span className="metric break-all">Kursówka: {departure.kursowka}</span></button>{departure.brigadeSource === "estimated" && <span className="text-[9px] text-mute" title="Przypisanie kursu do kursówki jest szacowane">szac.</span>}{company && <span className="rounded px-1.5 py-0.5 text-[9px] font-extrabold" style={{ background: company.bg, color: company.fg }}>{company.label}</span>}{departure.vehicleId && <span className="metric ml-auto text-[10px] font-bold text-ink">{formatVehicleNumber(departure.vehicleId)}</span>}</div>
              <p className="mt-1.5 break-words text-[10px] leading-relaxed text-ink-soft"><span className="text-mute">Końcowy:</span> {departure.finalStop}</p>
            </li>;
          })}</ul>}
          <button type="button" onClick={() => setLimit((value) => value + 8)} className="mt-2 w-full rounded-md bg-soft py-2 text-[10px] font-bold text-brand-ink">Pokaż więcej kursów</button>
          <p className="mt-2 flex items-start gap-1 text-[9px] leading-relaxed text-mute"><Info className="mt-0.5 h-3 w-3 shrink-0" />− opóźnienie · + przyspieszenie. Kliknij kursówkę, aby zobaczyć jej kursy lub znaleźć autobus.</p>
        </>}
      </div>
    </section>
  );
}
