import { useId, useMemo, useState } from "react";
import { Bus, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Search } from "lucide-react";
import { filterStops, stopDisplayName } from "../lib/busStops";
import type { BusStop, Place, Waypoint } from "../lib/types";
import { cn } from "../utils/cn";

interface Props {
  role: "start" | "end";
  point?: Waypoint;
  stops: BusStop[];
  loading: boolean;
  error: string;
  onSelect: (place: Place) => void;
  onRefresh: () => void;
  onOpen: () => void;
}

export default function EndpointStopPicker({ role, point, stops, loading, error, onSelect, onRefresh, onOpen }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const isEnd = role === "end";
  const filtered = useMemo(() => filterStops(stops, query), [stops, query]);
  const select = (stop: BusStop) => {
    onSelect({
      id: `stop-${stop.id}`,
      short: stopDisplayName(stop).slice(0, 46),
      label: `Przystanek autobusowy ${stopDisplayName(stop)}, Polska`,
      lat: stop.lat,
      lon: stop.lon,
      source: "osm",
      kind: "Przystanek",
    });
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="mt-1.5" data-testid={isEnd ? "destination-stops" : "start-stops"}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { if (!open) onOpen(); setOpen((current) => !current); setLimit(30); }}
        className={cn("flex min-h-8 w-full items-center justify-between gap-1.5 rounded-md border px-2 text-left text-[10px] font-bold transition-colors", open ? "border-brand/40 bg-brand-soft text-brand-ink" : "border-line text-ink-soft hover:bg-raised hover:text-brand-ink")}>
        <Bus className="h-3.5 w-3.5 shrink-0 text-brand-ink" />
        <span className="flex-1">Przystanki autobusowe: {isEnd ? "wybierz metę" : "wybierz start"}</span>
        <span className="metric text-[8px] text-mute">{stops.length}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <div id={id} className="mt-2 animate-rise-in" role="region" aria-label={isEnd ? "Przystanki do wyboru jako meta B" : "Przystanki do wyboru jako start A"}>
        <div className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-2 focus-within:border-brand/50">
          <Search className="h-3 w-3 shrink-0 text-mute" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(30); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && filtered[0]) { event.preventDefault(); select(filtered[0]); }
            }}
            aria-label={isEnd ? "Szukaj przystanku jako mety" : "Szukaj przystanku jako startu"}
            placeholder="Nazwa przystanku lub linia" autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none placeholder:text-mute" />
          <button type="button" onClick={onRefresh} disabled={loading} aria-label="Odśwież listę przystanków"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-mute hover:bg-soft disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>
        <p className="mb-1 mt-1.5 text-[9px] leading-relaxed text-mute">
          {isEnd ? "Kliknięcie zastępuje metę B, nie dodaje przystanku pośredniego." : "Kliknięcie zastępuje start A."} Filtr dotyczy tylko tej listy.
        </p>
        {loading && <p role="status" className="py-2 text-[10px] text-brand-ink">Pobieranie przystanków OSM. Dostępne pozycje możesz już wybrać.</p>}
        {error && <div role="status" className="py-2 text-[9px] leading-relaxed text-warning">{error} <button type="button" onClick={onRefresh} disabled={loading} className="font-bold underline underline-offset-2">Ponów pobieranie</button></div>}
        {!loading && !error && !stops.length && <p role="status" className="py-2 text-[10px] text-mute">Brak pobranych przystanków. Odśwież listę lub ustaw punkt myszką.</p>}
        {stops.length > 0 && <div className="scroll-area max-h-[230px] overflow-y-auto overscroll-contain" aria-label="Wyniki przystanków">
          {filtered.slice(0, limit).map((stop) => {
            const selected = point?.lat === stop.lat && point?.lon === stop.lon;
            return <button key={stop.id} type="button" onClick={() => select(stop)}
              aria-label={`Ustaw ${stop.name} jako ${isEnd ? "metę" : "start"}${stop.ref ? `, stanowisko ${stop.ref}` : ""}`}
              className={cn("flex w-full items-center gap-2 border-b border-line/70 px-1 py-2 text-left transition-colors last:border-0", selected ? "bg-brand-soft" : "hover:bg-raised")}>
              <Bus className="h-3 w-3 shrink-0 text-brand-ink" />
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold leading-snug text-ink">{stopDisplayName(stop)}</span>
                <span className="mt-0.5 block text-[8px] text-mute">{stop.ref ? `Stanowisko ${stop.ref} · ` : ""}{stop.lines.length ? `Linie: ${stop.lines.join(", ")}` : `${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}`}</span>
              </span>
              {selected ? <Check className="h-3.5 w-3.5 text-brand-ink" /> : <span className="rounded bg-brand-soft px-1.5 py-1 text-[8px] font-extrabold text-brand-ink">{isEnd ? "META B" : "START A"}</span>}
            </button>;
          })}
          {!filtered.length && <p role="status" className="py-4 text-center text-[10px] text-mute">Brak pasujących przystanków. Spróbuj fragmentu nazwy.</p>}
          {filtered.length > limit && <button type="button" onClick={() => setLimit((current) => current + 30)} className="my-2 h-8 w-full rounded-md bg-soft text-[10px] font-bold text-brand-ink">Pokaż kolejne przystanki ({filtered.length - limit})</button>}
        </div>}
        <div className="mt-1 flex justify-between text-[8px] text-mute"><span>{filtered.length} pasujących przystanków</span><span>© OpenStreetMap</span></div>
      </div>}
    </div>
  );
}