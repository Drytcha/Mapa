import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Info, Loader2, MapPinned, RefreshCw } from "lucide-react";
import {
  findGtfsStopByCoordinates,
  formatGtfsDate,
  formatGtfsTime,
  loadGtfsData,
  nextGtfsDepartures,
  type GtfsData,
  type GtfsDeparture,
  type GtfsStop,
} from "../lib/gtfs";
import type { BusStop } from "../lib/types";
import { cn } from "../utils/cn";

interface ScheduleProps {
  stop: BusStop;
  onAddDeparture?: (stop: GtfsStop) => void;
  className?: string;
}

/** Shows the real municipal timetable for one OSM bus stop, if GTFS maps to it. */
export default function GtfsSchedule({ stop, onAddDeparture, className }: ScheduleProps) {
  const [data, setData] = useState<GtfsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(() => new Date());
  const [limit, setLimit] = useState(8);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadGtfsData());
    } catch {
      setError("Nie udało się odczytać rozkładu jazdy z lokalnych danych GTFS.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data && !loading) void load();
  }, [data, loading, load]);

  const matched = useMemo(
    () => (data ? findGtfsStopByCoordinates(data, stop.lat, stop.lon, stop.name, 120) : null),
    [data, stop.lat, stop.lon, stop.name]
  );
  const departures = useMemo<GtfsDeparture[]>(
    () => (data && matched ? nextGtfsDepartures(data, matched.id, from, limit) : []),
    [data, matched, from, limit]
  );

  return (
    <section className={cn("mt-2 overflow-hidden rounded-xl border border-line bg-raised/70", className)} data-testid="gtfs-schedule">
      <div className="flex items-center justify-between border-b border-line/80 px-2.5 py-1.5">
        <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold text-ink">
          <CalendarClock className="h-3 w-3 text-brand-ink" />
          Rozkład jazdy
          <span className="text-[8px] font-semibold text-mute">GTFS · ZDKiUM</span>
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFrom(new Date())}
            title="Pokaż najbliższe kursy"
            aria-label="Pokaż najbliższe kursy"
            className="rounded p-1 text-mute transition-colors hover:bg-surface hover:text-brand-ink"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setFrom(new Date(from.getTime() + 30 * 60000))}
            title="Pół godziny później"
            aria-label="Pół godziny później"
            className="rounded px-1.5 py-1 text-[8px] font-bold text-brand-ink transition-colors hover:bg-surface"
          >
            +30 min
          </button>
        </div>
      </div>

      <div className="px-2.5 py-2">
        {loading && (
          <p role="status" className="flex items-center gap-1.5 py-3 text-[10px] font-semibold text-brand-ink">
            <Loader2 className="h-3 w-3 animate-spin" /> Wczytuję rozkład jazdy…
          </p>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-2 py-2">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
            <div>
              <p className="text-[9px] font-bold leading-snug text-warning">{error}</p>
              <button type="button" onClick={() => void load()} className="mt-1 text-[9px] font-bold text-warning underline underline-offset-2">
                Spróbuj ponownie
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && !matched && (
          <p className="py-3 text-center text-[9px] leading-relaxed text-mute">
            Brak odpowiednika tego przystanku w rozkładzie GTFS (odległość większa niż 120 m
            albo inna nazwa). Pozostałe przystanki możesz ustawić jako metę.
          </p>
        )}

        {!loading && !error && matched && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block truncate text-[10px] font-extrabold text-ink">{matched.name}</span>
                <span className="block truncate text-[8px] text-mute">
                  {formatGtfsDate(from)} · od {formatGtfsTime(from)}
                </span>
              </div>
              {onAddDeparture && (
                <button
                  type="button"
                  onClick={() => onAddDeparture(matched)}
                  aria-label={`Ustaw ${matched.name} jako metę`}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-brand/30 bg-brand-soft px-2 text-[8px] font-extrabold text-brand-ink transition-colors hover:border-brand/60"
                >
                  <MapPinned className="h-2.5 w-2.5" /> Ustaw jako metę
                </button>
              )}
            </div>

            {departures.length === 0 ? (
              <p className="py-3 text-center text-[9px] text-mute">Brak kursów w tym czasie w danych GTFS.</p>
            ) : (
              <ul className="mt-2 flex flex-col" aria-label="Najbliższe odjazdy">
                {departures.map((departure) => (
                  <li key={`${departure.tripId}-${departure.at.getTime()}`} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-0">
                    <span className="metric w-[38px] shrink-0 text-[9px] font-extrabold text-brand-ink">
                      {formatGtfsTime(departure.at)}
                    </span>
                    <span className="metric w-[24px] shrink-0 rounded bg-soft px-1 py-0.5 text-center text-[8px] font-bold text-ink">
                      {departure.route.short}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-ink-soft">
                      {departure.headsign || departure.route.long || "kurs bez kierunku"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setLimit((current) => current + 10)}
              className="mt-2 h-7 w-full rounded-md bg-soft text-[9px] font-bold text-brand-ink transition-colors hover:bg-surface"
            >
              Pokaż więcej kursów
            </button>
            <p className="mt-1.5 flex items-start gap-1 text-[7.5px] leading-snug text-mute">
              <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              Rozkład ZDKiUM / operatorów, dane GTFS. Nie obejmuje opóźnień ani zmian doraźnych.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
