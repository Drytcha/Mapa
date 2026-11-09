"use client";

import { useDeferredValue, useMemo } from "react";
import {
  Bus,
  Crosshair,
  Layers3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { BusStop } from "@/lib/types";
import { filterStops, groupStopsByName } from "@/lib/busStops";
import { cn } from "@/utils/cn";
import { CollapseToggle, FieldLabel } from "./UI";
import GtfsSchedule from "./GtfsSchedule";

export type StopScope = "all" | "near" | "used";

interface BusStopPanelProps {
  stops: BusStop[];
  loading: boolean;
  error: string;
  seconds: number;
  query: string;
  scope: StopScope;
  selectedId: string | null;
  selectedStop: BusStop | null;
  usedKeys: Set<string>;
  nearRoute: Map<string, number>;
  scopeLabel: string;
  canAdd: boolean;
  onQuery: (value: string) => void;
  onScope: (scope: StopScope) => void;
  onRefresh: () => void;
  onSelect: (stop: BusStop) => void;
  onAdd: (stop: BusStop) => void;
  onAddNearRoute: () => void;
  onCenterWałbrzych: () => void;
  onOpenKursowka?: (kursowkaId: string, kursowkaCode: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const stopKey = (stop: BusStop) => `${stop.lat.toFixed(5)},${stop.lon.toFixed(5)}`;

export default function BusStopPanel({
  stops,
  loading,
  error,
  seconds,
  query,
  scope,
  selectedId,
  selectedStop,
  usedKeys,
  nearRoute,
  scopeLabel,
  canAdd,
  onQuery,
  onScope,
  onRefresh,
  onSelect,
  onAdd,
  onAddNearRoute,
  onCenterWałbrzych,
  onOpenKursowka,
  collapsed,
  onToggleCollapse,
}: BusStopPanelProps) {
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(() => {
    if (collapsed) return [];
    const visible = filterStops(stops, deferredQuery);
    const scoped =
      scope === "near"
        ? visible.filter((stop) => nearRoute.has(stop.id))
        : scope === "used"
          ? visible.filter((stop) => usedKeys.has(stopKey(stop)))
          : visible;
    return groupStopsByName(scoped);
  }, [collapsed, stops, deferredQuery, scope, nearRoute, usedKeys]);
  const shown = collapsed ? [] : groups.slice(0, 80);
  const usedCount = collapsed
    ? 0
    : stops.reduce((count, stop) => count + (usedKeys.has(stopKey(stop)) ? 1 : 0), 0);

  const scopes: Array<{ id: StopScope; label: string; count: number }> = [
    { id: "all", label: "Wszystkie", count: stops.length },
    { id: "near", label: "Przy trasie", count: nearRoute.size },
    { id: "used", label: "W trasie", count: usedCount },
  ];

  return (
    <section
      className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]"
      data-testid="bus-stop-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand text-on-brand">
            <Bus className="h-3 w-3" strokeWidth={2.1} />
          </span>
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">
            Przystanki autobusowe
          </h2>
          <span className="metric shrink-0 rounded-full bg-soft px-1.5 py-[2px] text-[8px] font-bold text-mute">
            {stops.length}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onCenterWałbrzych}
            title="Wróć do Wałbrzycha"
            aria-label="Wróć do widoku Wałbrzycha"
            className="grid h-6 w-6 place-items-center rounded-md text-mute transition-colors hover:bg-soft hover:text-brand-ink"
          >
            <Crosshair className="h-3 w-3" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Pobierz przystanki dla bieżącego widoku mapy"
            aria-label="Pobierz przystanki dla bieżącego widoku mapy"
            className="grid h-6 w-6 place-items-center rounded-md text-mute transition-colors hover:bg-soft hover:text-brand-ink disabled:opacity-40"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" strokeWidth={2.2} />
            )}
          </button>
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Przystanki autobusowe"
          />
        </div>
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-2.5 pt-2">
          <div className="flex items-center gap-1 rounded-lg bg-soft p-0.5">
            {scopes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScope(item.id)}
                aria-pressed={scope === item.id}
                className={cn(
                  "flex h-6 flex-1 items-center justify-center gap-1 rounded-md text-[9px] font-bold transition-all",
                  scope === item.id
                    ? "bg-surface text-brand-ink shadow-[0_1px_3px_rgba(13,42,28,0.12)]"
                    : "text-mute hover:text-ink"
                )}
              >
                {item.id === "near" && <RouteIcon className="h-2.5 w-2.5" />}
                {item.label}
                <span className="metric text-[7.5px] opacity-70">{item.count}</span>
              </button>
            ))}
          </div>

          <div
            className={cn(
              "mt-1.5 flex h-[30px] items-center gap-1.5 rounded-lg border bg-raised px-2 transition-colors focus-within:border-brand/50 focus-within:bg-surface",
              query ? "border-line-strong" : "border-transparent"
            )}
          >
            <Search className="h-3 w-3 shrink-0 text-mute" strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Filtruj: nazwa, numer linii…"
              aria-label="Filtruj przystanki autobusowe"
              className="min-w-0 flex-1 bg-transparent text-[10.5px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-mute"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => onQuery("")}
                aria-label="Wyczyść filtr przystanków"
                className="grid h-4 w-4 shrink-0 place-items-center rounded text-mute hover:text-ink"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.4} />
              </button>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[7.5px] font-semibold text-mute">
              <Layers3 className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">Zawsze na mapie · {scopeLabel}</span>
            </p>
            <button
              type="button"
              onClick={onAddNearRoute}
              disabled={!canAdd || nearRoute.size === 0}
              className="flex shrink-0 items-center gap-1 rounded-md border border-brand/25 bg-brand-soft px-1.5 py-1 text-[8px] font-extrabold text-brand-ink transition-colors hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Wstaw wszystkie przystanki leżące przy trasie, w kolejności przejazdu"
            >
              <Plus className="h-2.5 w-2.5" strokeWidth={2.8} />
              Ustaw pod trasę
            </button>
          </div>

          {loading && (
            <p
              role="status"
              aria-live="polite"
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[9px] font-bold text-brand-ink"
            >
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span className="truncate">
                Pobieram przystanki…{seconds > 0 ? ` ${seconds} s` : ""}
              </span>
            </p>
          )}

          {error && (
            <div role="alert" className="mt-2 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-2">
              <p className="text-[9px] font-bold leading-snug text-warning">{error}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-1 text-[9px] font-extrabold text-warning underline underline-offset-2"
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          {!loading && !error && stops.length > 0 && (
            <div className="scroll-area -mr-1.5 mt-2 max-h-[236px] overflow-y-auto pr-1.5">
              {shown.map((group) => {
                const member = group.members[0];
                const inRoute = group.members.some((stop) => usedKeys.has(stopKey(stop)));
                const isSelected = group.members.some((stop) => stop.id === selectedId);
                const nearDistance = Math.min(
                  ...group.members.map((stop) => nearRoute.get(stop.id) ?? Number.POSITIVE_INFINITY)
                );
                return (
                  <div
                    key={group.key}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors",
                      isSelected ? "bg-brand-soft" : "hover:bg-raised"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(member)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[8.5px] font-extrabold",
                          inRoute
                            ? "border-brand bg-brand text-on-brand"
                            : isSelected
                              ? "border-[#17240f] bg-highlight text-[#17240f]"
                              : Number.isFinite(nearDistance)
                                ? "border-brand/40 bg-highlight-soft text-brand-ink"
                                : "border-line bg-surface text-brand-ink"
                        )}
                      >
                        <MapPin className="h-2.5 w-2.5" strokeWidth={2.3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className="truncate text-[10px] font-bold text-ink">
                            {group.name}
                          </span>
                          {group.members.some((stop) => stop.shelter) && (
                            <span title="Wiata przystankowa">
                              <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          {Number.isFinite(nearDistance) && (
                            <span className="metric rounded bg-highlight-soft px-1 py-[1px] text-[7.5px] font-bold text-brand-ink">
                              {Math.round(nearDistance)} m od trasy
                            </span>
                          )}
                          {group.lines.slice(0, 6).map((line) => (
                            <span
                              key={line}
                              className="metric rounded border border-line bg-surface px-1 py-[1px] text-[7.5px] font-bold text-ink-soft"
                            >
                              {line}
                            </span>
                          ))}
                          {group.lines.length === 0 && !Number.isFinite(nearDistance) && (
                            <span className="text-[7.5px] text-mute">
                              {member.operator ?? "Przystanek OSM"}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!canAdd || inRoute}
                      onClick={() => onAdd(member)}
                      title={inRoute ? "Przystanek jest już w trasie" : "Dodaj przystanek jako punkt pośredni"}
                      aria-label={`Dodaj przystanek ${group.name} do trasy`}
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors",
                        inRoute
                          ? "border-brand/20 bg-brand-soft text-brand-ink"
                          : "border-line bg-surface text-ink-soft hover:border-brand/50 hover:text-brand-ink disabled:opacity-40"
                      )}
                    >
                      <Plus className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}

              {shown.length === 0 && (
                <p className="py-4 text-center text-[9.5px] text-mute">
                  {scope === "near"
                    ? "Wyznacz trasę, aby zobaczyć przystanki leżące przy niej."
                    : "Brak przystanków pasujących do filtra."}
                </p>
              )}
              {groups.length > shown.length && (
                <p className="pt-1.5 text-center text-[8px] font-semibold text-mute">
                  Pokazano pierwsze {shown.length} z {groups.length} przystanków — użyj filtra powyżej.
                </p>
              )}
            </div>
          )}

          {selectedStop && (
            <div className="mt-2.5 border-t border-line pt-2">
              <FieldLabel>Wybrany przystanek</FieldLabel>
              <GtfsSchedule stop={selectedStop} onOpenKursowka={onOpenKursowka} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
