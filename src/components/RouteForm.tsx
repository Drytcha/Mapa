import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  CircleDollarSign,
  Construction,
  Loader2,
  MapPin,
  MapPinned,
  MousePointer2,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Ship,
  X,
} from "lucide-react";
import { isWaypointSet } from "../lib/data";
import { geocode, searchLocalPlaces } from "../lib/geo";
import { MAX_WAYPOINTS } from "../lib/types";
import EndpointStopPicker from "./EndpointStopPicker";
import type {
  AvoidOptions,
  BusStop,
  Place,
  Waypoint,
} from "../lib/types";
import { cn } from "../utils/cn";
import { Button, CollapseToggle, FieldLabel, IconButton, Pill, Pin } from "./UI";

/* -------------------------------------------------------------------------- */

interface WaypointFieldProps {
  point?: Waypoint;
  index: number;
  total: number;
  isPicking: boolean;
  onSelect: (place: Place) => void;
  onRemove: () => void;
  onClearEndpoint: () => void;
  onPick: () => void;
  busStops: BusStop[];
  busLoading: boolean;
  busError: string;
  onRefreshBusStops: () => void;
}

function WaypointField({
  point,
  index,
  total,
  isPicking,
  onSelect,
  onRemove,
  onClearEndpoint,
  onPick,
  busStops,
  busLoading,
  busError,
  onRefreshBusStops,
}: WaypointFieldProps) {
  const assigned = isWaypointSet(point);
  const [query, setQuery] = useState(assigned ? point.label : "");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchError, setSearchError] = useState("");
  const searchController = useRef<AbortController | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const label = isFirst ? "Start" : isLast ? "Meta" : `Przez ${index}`;

  useEffect(() => {
    setQuery(isWaypointSet(point) ? point.label : "");
  }, [point?.id, point?.label, point?.empty]);

  useEffect(() => () => searchController.current?.abort(), []);

  const searchAddress = async () => {
    if (query.trim().length < 3) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setOpen(true);
    setSearching(true);
    setSearchError("");
    try {
      const places = await geocode(query, controller.signal);
      if (controller.signal.aborted) return;
      setRemote(places);
      setActiveIndex(0);
      if (!places.length) setSearchError("Brak wyników OSM. Zmień adres lub wskaż punkt na mapie.");
    } catch {
      if (!controller.signal.aborted) setSearchError("OSM jest chwilowo niedostępne. Użyj lokalnej bazy lub mapy.");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!holderRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const results = useMemo(() => {
    const local = searchLocalPlaces(query);
    const merged = [...local, ...remote];
    const seen = new Set<string>();
    const normalizeKey = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    return merged
      .filter((place) => {
        const labelKey = normalizeKey(place.label.split(",").slice(0, 2).join(","));
        const shortKey = normalizeKey(place.short);
        const coordKey = `${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`;
        if (seen.has(labelKey) || seen.has(shortKey) || seen.has(coordKey)) return false;
        seen.add(labelKey);
        seen.add(shortKey);
        seen.add(coordKey);
        return true;
      })
      .slice(0, 6);
  }, [query, remote]);

  const choose = (place: Place) => {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
  };

  return (
    <div ref={holderRef} className="relative flex items-center gap-2.5">
      {!isLast && (
        <span
          className="absolute left-[10.5px] top-[29px] h-[calc(100%-10px)] w-px bg-line"
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 shrink-0">
        <Pin kind={isFirst ? "from" : isLast ? "to" : "via"} />
      </div>

      <div className="min-w-0 flex-1">
        <FieldLabel>{label}</FieldLabel>
        <div
          className={cn(
            "mt-0.5 flex h-[34px] items-center gap-1 rounded-lg border bg-raised px-2 transition-all",
            open
              ? "border-brand/50 bg-surface ring-2 ring-brand/10"
              : "border-transparent hover:border-line-strong",
            isPicking && "border-brand/60 bg-surface"
          )}
        >
          <Search className="h-3 w-3 shrink-0 text-mute" strokeWidth={2.2} />
          <input
            value={query}
            placeholder={
              isFirst ? "Adres startowy" : isLast ? "Adres docelowy" : "Dodaj punkt pośredni"
            }
            onChange={(event) => {
              searchController.current?.abort();
              setSearching(false);
              setRemote([]);
              setSearchError("");
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => Math.min(current + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (open && results[activeIndex]) choose(results[activeIndex]);
                else void searchAddress();
              }
              if (event.key === "Escape") setOpen(false);
            }}
            className="min-w-0 flex-1 bg-transparent text-[11.5px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-mute"
            aria-label={label}
            aria-expanded={open}
            autoComplete="off"
            spellCheck={false}
          />
          {searching && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-mute" />}
          {(isFirst || isLast) && (assigned || query) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onClearEndpoint();
              }}
              title={isFirst ? "Wyczyść punkt startowy" : "Wyczyść punkt docelowy"}
              aria-label={isFirst ? "Wyczyść punkt startowy" : "Wyczyść punkt docelowy"}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-mute transition-colors hover:bg-surface hover:text-danger"
            >
              <X className="h-3 w-3" strokeWidth={2.3} />
            </button>
          )}
          <button
            type="button"
            onClick={onPick}
            title={isPicking ? "Anuluj wybór na mapie" : "Wskaż punkt na mapie"}
            aria-label="Wskaż punkt na mapie"
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded text-mute transition-colors hover:bg-surface hover:text-brand-ink",
              isPicking && "bg-brand text-on-brand hover:bg-brand hover:text-on-brand"
            )}
          >
            <MapPin className="h-3 w-3" strokeWidth={2.3} />
          </button>
          {!isFirst && !isLast && (
            <button
              type="button"
              onClick={onRemove}
              title="Usuń punkt pośredni"
              aria-label="Usuń punkt pośredni"
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-mute transition-colors hover:bg-surface hover:text-danger"
            >
              <X className="h-3 w-3" strokeWidth={2.3} />
            </button>
          )}
        </div>
        {(isFirst || isLast) && (
          <button
            type="button"
            onClick={onPick}
            aria-pressed={isPicking}
            className={cn(
              "mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[10px] font-extrabold transition-colors",
              isPicking
                ? "border-brand bg-brand text-on-brand"
                : "border-brand/30 bg-brand-soft text-brand-ink hover:border-brand/60"
            )}
          >
            <MousePointer2 className="h-3 w-3" strokeWidth={2.4} />
            {isPicking
              ? "Teraz kliknij mapę albo przystanek"
              : isFirst
                ? "Ustaw start myszką"
                : "Ustaw metę myszką"}
          </button>
        )}
        {(isFirst || isLast) && <EndpointStopPicker role={isLast ? "end" : "start"} point={assigned ? point : undefined} stops={busStops}
          loading={busLoading} error={busError} onRefresh={onRefreshBusStops}
          onOpen={() => setOpen(false)}
          onSelect={(place) => { searchController.current?.abort(); setSearching(false); choose(place); }} />}
      </div>

      {open && (
        <div
          className={cn(
            "absolute left-[32px] z-[700] w-[calc(100%-32px)] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_45px_rgba(12,42,29,0.16)] animate-fade-in",
            isLast ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          )}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
            <span className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-mute">
              {query.trim().length > 2 ? "Wyniki wyszukiwania" : "Popularne miejsca"}
            </span>
            <span className="text-[8px] font-semibold text-mute">
              {searching ? "OSM…" : "OSM + baza PL"}
            </span>
          </div>
          <button type="button" onClick={() => void searchAddress()} disabled={searching || query.trim().length < 3}
            className="flex w-full items-center gap-2 border-b border-line bg-brand-soft px-3 py-2 text-left text-[10px] font-bold text-brand-ink disabled:opacity-50">
            {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            Szukaj adresu w OpenStreetMap
          </button>
          {searchError && <p role="status" className="px-3 py-2 text-[9px] text-warning">{searchError}</p>}
          <div className="max-h-[210px] overflow-y-auto scroll-area">
            {results.map((place, resultIndex) => (
              <button
                key={place.id}
                type="button"
                onMouseEnter={() => setActiveIndex(resultIndex)}
                onClick={() => choose(place)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors",
                  resultIndex === activeIndex ? "bg-soft" : "hover:bg-raised"
                )}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-mute">
                  <MapPin className="h-3 w-3" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold text-ink">
                    {place.short}
                  </span>
                  <span className="block truncate text-[9px] text-mute">{place.label}</span>
                </span>
                {place.kind && (
                  <span className="shrink-0 rounded border border-line px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-mute">
                    {place.kind.slice(0, 12)}
                  </span>
                )}
              </button>
            ))}
            {!results.length && !searching && (
              <div className="px-3 py-4 text-center text-[10px] text-mute">
                Brak wyników. Spróbuj wpisać miasto lub ulicę.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface RouteFormProps {
  waypoints: Waypoint[];
  avoid: AvoidOptions;
  isRouting: boolean;
  pickTarget: string | null;
  onSelectPlace: (index: number, place: Place) => void;
  onRemovePoint: (id: string) => void;
  onClearEndpoint: (id: string) => void;
  onClearRoute: () => void;
  onAddVia: () => void;
  onSwap: () => void;
  onPick: (id: string) => void;
  onAvoidChange: (avoid: AvoidOptions) => void;
  onRecalculate: () => void;
  addMode: boolean;
  onToggleAddMode: () => void;
  busStops: BusStop[];
  busLoading: boolean;
  busError: string;
  onRefreshBusStops: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function RouteForm({
  waypoints,
  avoid,
  isRouting,
  pickTarget,
  onSelectPlace,
  onRemovePoint,
  onClearEndpoint,
  onClearRoute,
  onAddVia,
  onSwap,
  onPick,
  onAvoidChange,
  onRecalculate,
  addMode,
  onToggleAddMode,
  busStops,
  busLoading,
  busError,
  onRefreshBusStops,
  collapsed,
  onToggleCollapse,
}: RouteFormProps) {
  const [expandedPoints, setExpandedPoints] = useState(false);
  const assignedCount = waypoints.filter(isWaypointSet).length;
  const readyForRoute = waypoints.length >= 2 && waypoints.every(isWaypointSet);

  const toggles = [
    {
      key: "tolls" as const,
      label: "Bez opłat",
      icon: CircleDollarSign,
      title: "Unikaj dróg płatnych",
    },
    {
      key: "ferries" as const,
      label: "Bez promów",
      icon: Ship,
      title: "Unikaj przepraw promowych",
    },
    {
      key: "unpaved" as const,
      label: "Bez gruntowych",
      icon: Construction,
      title: "Unikaj dróg nieutwardzonych",
    },
  ];

  return (
    <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]" data-testid="route-form-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">Punkty trasy</h2>
          <Pill tone="neutral" className="shrink-0 font-mono text-[8.5px]">
            {assignedCount.toString().padStart(2, "0")} / {MAX_WAYPOINTS}
          </Pill>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {assignedCount > 0 && (
            <IconButton label="Wyczyść całą trasę" onClick={onClearRoute} className="h-6 w-6">
              <RotateCcw className="h-3 w-3" strokeWidth={2.2} />
            </IconButton>
          )}
          <IconButton label="Zamień start i metę" onClick={onSwap} className="h-6 w-6">
            <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
          </IconButton>
          <IconButton label="Dodaj punkt pośredni" onClick={onAddVia} disabled={waypoints.length >= MAX_WAYPOINTS} className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
          </IconButton>
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Punkty trasy"
          />
        </div>
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-2.5 pt-2">
          <div className="flex flex-col gap-1">
            {waypoints.map((point, index) => {
              if (!expandedPoints && waypoints.length > 6 && index > 1 && index < waypoints.length - 2) {
                return index === 2 ? (
                  <button key="expand" type="button" onClick={() => setExpandedPoints(true)}
                    className="ml-8 rounded-md bg-soft px-2 py-2 text-[9px] font-bold text-brand-ink">
                    Pokaż pozostałe {waypoints.length - 4} punktów
                  </button>
                ) : null;
              }
              return (
                <WaypointField
                  key={point.id}
                  point={point}
                  index={index}
                  total={waypoints.length}
                  isPicking={pickTarget === point.id}
                  onSelect={(place) => onSelectPlace(index, place)}
                  onRemove={() => onRemovePoint(point.id)}
                  onClearEndpoint={() => onClearEndpoint(point.id)}
                  onPick={() => onPick(point.id)}
                  busStops={busStops}
                  busLoading={busLoading}
                  busError={busError}
                  onRefreshBusStops={onRefreshBusStops}
                />
              );
            })}
          </div>
          {expandedPoints && waypoints.length > 6 && (
            <button type="button" onClick={() => setExpandedPoints(false)} className="ml-8 mt-1 text-[9px] font-bold text-brand-ink">
              Zwiń listę punktów
            </button>
          )}

          <button type="button" onClick={onToggleAddMode} aria-pressed={addMode}
            disabled={waypoints.length >= MAX_WAYPOINTS && !addMode}
            className={cn("mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[10px] font-bold transition-colors disabled:opacity-50", addMode ? "border-brand bg-brand text-on-brand" : "border-brand/25 bg-brand-soft text-brand-ink hover:border-brand/50")}>
            <MapPinned className="h-3.5 w-3.5" />
            {addMode ? "Zakończ zaznaczanie punktów" : "Zaznacz wiele punktów na mapie"}
          </button>
          <p className="mt-1 text-center text-[8px] text-mute">Do 50 punktów. Kolejne kliknięcia ustawiają start, metę i przystanki po drodze.</p>

          <button
            type="button"
            onClick={onAddVia}
            disabled={waypoints.length >= MAX_WAYPOINTS}
            className="mt-1.5 flex h-[25px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-[9.5px] font-bold text-mute transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand-ink"
          >
            <Plus className="h-3 w-3" strokeWidth={2.4} />
            Dodaj punkt pośredni
          </button>

          <div className="mt-2 grid grid-cols-3 gap-1">
            {toggles.map((toggle) => {
              const active = avoid[toggle.key];
              const Icon = toggle.icon;
              return (
                <button
                  key={toggle.key}
                  type="button"
                  title={toggle.key === "unpaved" ? "Publiczny OSRM nie obsługuje tego wykluczenia" : toggle.title}
                  disabled={toggle.key === "unpaved"}
                  aria-pressed={active}
                  onClick={() => onAvoidChange({ ...avoid, [toggle.key]: !active })}
                  className={cn(
                    "flex h-[25px] items-center justify-center gap-1 rounded-md border text-[8.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    active
                      ? "border-brand/30 bg-brand-soft text-brand-ink"
                      : "border-line bg-surface text-mute hover:border-line-strong hover:text-ink-soft"
                  )}
                >
                  {active ? (
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  ) : (
                    <Icon className="h-2.5 w-2.5" strokeWidth={2.1} />
                  )}
                  <span>{toggle.label}</span>
                </button>
              );
            })}
          </div>

          <Button
            onClick={onRecalculate}
            loading={isRouting}
            disabled={!readyForRoute && !isRouting}
            className="mt-2 h-[36px] w-full rounded-[9px] text-[11.5px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!isRouting && <Navigation className="h-3.5 w-3.5" strokeWidth={2.3} />}
            {isRouting ? "Przeliczam trasę…" : readyForRoute ? "Wyznacz trasę" : "Wybierz start A i metę B"}
          </Button>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[8px] font-semibold text-mute">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            Bez konta i kluczy API · flotę i godziny ustawisz poniżej
          </div>
        </div>
      )}
    </section>
  );
}
