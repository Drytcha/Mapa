import { BookmarkPlus, BusFront, FolderOpen, Trash2, X } from "lucide-react";
import type { BrigadeInfo } from "../lib/types";
import { formatBrigadeTitle, hasBrigade, type SavedBrigadePlan } from "../lib/brigade";
import { CollapseToggle, FieldLabel, IconButton, Pill } from "./UI";

interface BrigadePanelProps {
  brigade: BrigadeInfo;
  onChange: (next: BrigadeInfo) => void;
  savedBrigades: SavedBrigadePlan[];
  routeReady: boolean;
  onSaveBrigade: () => void;
  onLoadBrigade: (plan: SavedBrigadePlan) => void;
  onDeleteBrigade: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function BrigadePanel({
  brigade,
  onChange,
  savedBrigades,
  routeReady,
  onSaveBrigade,
  onLoadBrigade,
  onDeleteBrigade,
  collapsed,
  onToggleCollapse,
}: BrigadePanelProps) {
  const filled = hasBrigade(brigade);
  const title = formatBrigadeTitle(brigade);

  return (
    <section
      className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]"
      data-testid="brigade-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink">
            <BusFront className="h-3 w-3" strokeWidth={2.2} />
          </span>
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">
            Brygada i służba
          </h2>
          {filled ? (
            <Pill tone="green" className="max-w-[140px] truncate font-mono text-[8px]">
              {title}
            </Pill>
          ) : (
            <span className="text-[8.5px] font-semibold text-mute">opcjonalnie</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {filled && (
            <IconButton
              label="Wyczyść linię i służbę"
              onClick={() => onChange({ line: "", duty: "" })}
              className="h-6 w-6"
            >
              <X className="h-3 w-3" strokeWidth={2.3} />
            </IconButton>
          )}
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Brygada i służba"
          />
        </div>
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-3 pt-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <FieldLabel>Linia</FieldLabel>
              <input
                type="text"
                value={brigade.line}
                onChange={(event) => onChange({ ...brigade, line: event.target.value.slice(0, 20) })}
                placeholder="np. 2"
                aria-label="Numer linii"
                autoComplete="off"
                className="mt-1 h-8 w-full min-w-0 rounded-lg border border-line bg-raised px-2.5 font-mono text-[11.5px] font-bold text-ink outline-none placeholder:font-sans placeholder:font-medium placeholder:text-mute focus:border-brand/50 focus:bg-surface"
              />
            </label>
            <label className="min-w-0">
              <FieldLabel>Służba</FieldLabel>
              <input
                type="text"
                value={brigade.duty}
                onChange={(event) => onChange({ ...brigade, duty: event.target.value.slice(0, 32) })}
                placeholder="np. 02/01"
                aria-label="Numer służby / brygady"
                autoComplete="off"
                className="mt-1 h-8 w-full min-w-0 rounded-lg border border-line bg-raised px-2.5 font-mono text-[11.5px] font-bold text-ink outline-none placeholder:font-sans placeholder:font-medium placeholder:text-mute focus:border-brand/50 focus:bg-surface"
              />
            </label>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[9px] font-semibold text-mute">
              {filled ? (
                <span>
                  Oznaczenie wydruków: <strong className="text-brand-ink">{title}</strong>
                </span>
              ) : (
                "Wpisz linię i służbę — pojawią się w raporcie, CSV i PDF."
              )}
            </p>
            <button
              type="button"
              onClick={onSaveBrigade}
              disabled={!filled || !routeReady}
              title={
                !filled
                  ? "Wpisz linię lub służbę"
                  : !routeReady
                    ? "Najpierw wyznacz trasę"
                    : `Zapisz trasę jako ${title}`
              }
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-brand/25 bg-brand-soft px-2 text-[9px] font-bold text-brand-ink transition-colors hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <BookmarkPlus className="h-3 w-3" />
              Zapisz brygadę
            </button>
          </div>

          {savedBrigades.length > 0 && (
            <div className="mt-2.5 border-t border-line pt-2">
              <FieldLabel>Zapisane brygady ({savedBrigades.length})</FieldLabel>
              <div className="scroll-area mt-1.5 flex max-h-[124px] flex-col gap-1 overflow-y-auto pr-0.5">
                {savedBrigades.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-raised px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onLoadBrigade(item)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-brand-ink"
                      title={`Wczytaj trasę: ${item.title}`}
                    >
                      <FolderOpen className="h-3 w-3 shrink-0 text-brand-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-extrabold text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-[8px] text-mute">
                          {item.waypoints[0]?.short ?? "Start"} → {item.waypoints[item.waypoints.length - 1]?.short ?? "Meta"} · {item.waypoints.length} pkt
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBrigade(item.id)}
                      aria-label={`Usuń zapisaną brygadę ${item.title}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-mute hover:bg-surface hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
