"use client";

import { useId, useMemo, useState } from "react";
import { BusFront, Search, X } from "lucide-react";
import type { LiveBusVehicle } from "@/lib/types";
import { describeDelay, formatDelay, formatVehicleNumber } from "@/lib/delay";
import { findBuses, OPERATOR_STYLES } from "@/lib/transit";
import { cn } from "@/utils/cn";

interface Props {
  vehicles: LiveBusVehicle[];
  onSelectVehicle: (bus: LiveBusVehicle) => void;
  compact?: boolean;
  onQueryChange?: (query: string) => void;
  query?: string;
}

/** Search is independent of the map's company filter or the selected timetable day. */
export default function BusSearch({ vehicles, onSelectVehicle, compact = false, onQueryChange, query: controlledQuery }: Props) {
  const id = useId();
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlledQuery ?? internalQuery;
  const setQuery = (value: string) => { setInternalQuery(value); onQueryChange?.(value); };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => findBuses(vehicles, query).slice(0, 8), [vehicles, query]);
  const choose = (bus: LiveBusVehicle) => {
    onSelectVehicle(bus);
       setQuery(bus.kursowka || formatVehicleNumber(bus.vehicleId));
    setOpen(false);
  };

  return (
    <div
      className="relative min-w-0 w-full"
      data-testid="bus-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 shadow-sm focus-within:border-brand-ink">
        <Search className="h-4 w-4 shrink-0 text-mute" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label="Znajdź autobus po kursówce lub numerze wozu"
          aria-expanded={open && !!query.trim()}
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={compact ? "Znajdź autobus: 2/03 lub #404" : "Szukaj autobusu: kursówka 2/03 lub wóz #404"}
          className={cn("min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-mute", compact ? "h-9" : "h-11")}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); return; }
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
          }}
        />
        {query && <button type="button" aria-label="Wyczyść wyszukiwanie autobusu" className="p-1 text-mute hover:text-ink" onClick={() => { setQuery(""); setOpen(false); }}><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && query.trim() && (
        <div id={`${id}-results`} role="listbox" aria-label="Znalezione autobusy GPS" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
          {results.length ? results.map((bus, index) => {
            const company = OPERATOR_STYLES[bus.operatorKey];
            return (
              <button
                key={bus.vehicleId}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                type="button"
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left", active === index ? "bg-raised" : "hover:bg-raised")}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(bus)}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: company.bg, color: company.fg }}><BusFront className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-ink">{bus.kursowka || `Linia ${bus.routeName}`} <span className="metric ml-1">{formatVehicleNumber(bus.vehicleId)}</span></span>
                  <span className="block truncate text-[10px] text-mute">{company.label} · GPS na żywo · {describeDelay(bus.delaySeconds)} {formatDelay(bus.delaySeconds)}</span>
                </span>
              </button>
            );
          }) : <p className="px-3 py-4 text-xs leading-relaxed text-mute">Brak autobusu GPS dla „{query}”. Sprawdź kursówkę lub numer wozu. Autobus może być teraz poza trasą.</p>}
        </div>
      )}
    </div>
  );
}
