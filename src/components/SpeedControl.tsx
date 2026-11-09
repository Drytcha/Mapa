import { useEffect, useState } from "react";
import { Check, Gauge, RotateCcw } from "lucide-react";
import { durationAtSpeed, formatDistance, formatDuration, isValidSpeed } from "../lib/geo";
import { cn } from "../utils/cn";

interface SpeedControlProps {
  speed?: number;
  assignedSpeed: number;
  automaticSpeed: number;
  distance: number;
  maximumSpeed: number;
  onChange: (speed: number | undefined) => void;
  onSaveToVehicle?: (speed: number) => void;
}

export default function SpeedControl({
  speed,
  assignedSpeed,
  automaticSpeed,
  distance,
  maximumSpeed,
  onChange,
  onSaveToVehicle,
}: SpeedControlProps) {
  const [draft, setDraft] = useState(speed === undefined ? "" : String(speed));
  useEffect(() => setDraft(speed === undefined ? "" : String(speed)), [speed]);
  const manual = speed !== undefined;
  const valid = isValidSpeed(Number(draft.replace(",", ".")));
  const defaultSpeed = isValidSpeed(assignedSpeed)
    ? assignedSpeed
    : Math.min(200, Math.max(1, Math.round(automaticSpeed) || 25));
  const differsFromVehicle = manual && Math.abs(speed - assignedSpeed) >= 0.05;

  return (
    <div className="mt-3 border-t border-line pt-2.5" data-testid="speed-control">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-ink">
          <Gauge className="h-3.5 w-3.5 text-brand-ink" /> Średnia prędkość
        </span>
        <div className="flex rounded-md bg-soft p-0.5">
          {[
            { label: "Auto", active: !manual, run: () => onChange(undefined) },
            { label: "Własna", active: manual, run: () => onChange(speed ?? defaultSpeed) },
          ].map((item) => (
            <button key={item.label} type="button" aria-pressed={item.active} onClick={item.run}
              className={cn("rounded px-2 py-1 text-[9px] font-bold transition-colors", item.active ? "bg-surface text-brand-ink shadow-sm" : "text-mute hover:text-ink")}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {manual ? (
        <div className="animate-rise-in">
          <div className="mt-2 flex items-center gap-2">
            <div className={cn("flex h-9 w-[106px] shrink-0 items-center gap-1 rounded-lg border bg-raised px-2 focus-within:border-brand/50", valid ? "border-line" : "border-danger")}>
              <input aria-label="Własna średnia prędkość" aria-invalid={!valid} inputMode="decimal"
                value={draft} onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  const parsed = Number(value.replace(",", "."));
                  if (value.trim() && isValidSpeed(parsed)) onChange(parsed);
                }}
                className="metric min-w-0 flex-1 bg-transparent text-[17px] font-bold text-ink outline-none" />
              <span className="shrink-0 text-[9px] font-bold text-mute">km/h</span>
            </div>
            <input type="range" min={1} max={200} step={0.5} value={speed}
              aria-label="Suwak średniej prędkości" onChange={(event) => onChange(Number(event.target.value))}
              className="h-1 w-full cursor-pointer" />
            <button
              type="button"
              onClick={() => onChange(differsFromVehicle ? assignedSpeed : undefined)}
              aria-label={differsFromVehicle ? "Przywróć przypisaną prędkość wozu" : "Przywróć automatyczny czas"}
              title={differsFromVehicle ? `Przywróć prędkość wozu (${assignedSpeed} km/h)` : "Przywróć automatyczny czas"}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-mute hover:bg-soft hover:text-brand-ink"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
          {!valid && <p role="alert" className="mt-1 text-[9px] text-danger">Wpisz liczbę od 1 do 200. Czas używa ostatniej poprawnej wartości.</p>}

          <div className="mt-2 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-mute">Baza: {formatDistance(distance)} / {speed.toLocaleString("pl-PL")} km/h</span>
            <span className="metric font-bold text-brand-ink" data-testid="custom-duration">{formatDuration(durationAtSpeed(distance, speed))}</span>
          </div>

          {differsFromVehicle && onSaveToVehicle && (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-brand-soft px-2 py-1">
              <span className="text-[8.5px] font-semibold text-brand-ink">
                Stała wozu to {assignedSpeed.toLocaleString("pl-PL")} km/h
              </span>
              <button
                type="button"
                onClick={() => onSaveToVehicle(speed)}
                className="flex items-center gap-1 text-[8.5px] font-extrabold text-brand-ink underline underline-offset-2"
              >
                <Check className="h-2.5 w-2.5" /> Przypisz do wozu
              </button>
            </div>
          )}

          <p className={cn("mt-1 text-[8px] leading-relaxed", speed > maximumSpeed ? "text-warning" : "text-mute")}>
            {speed > maximumSpeed ? "Prędkość przekracza limit autostradowy profilu. " : ""}
            Czas bazowy bez postojów. Opcjonalną korektę korków włączysz w planie przejazdu poniżej.
          </p>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[9px] leading-relaxed text-mute">
            Czas szacowany przez OSRM. Stała prędkość tego wozu: <strong className="text-ink-soft">{assignedSpeed.toLocaleString("pl-PL")} km/h</strong>.
          </p>
          <button
            type="button"
            onClick={() => onChange(defaultSpeed)}
            className="shrink-0 rounded bg-brand-soft px-1.5 py-1 text-[8.5px] font-bold text-brand-ink hover:opacity-90"
          >
            Użyj z wozu
          </button>
        </div>
      )}
      <span className="mt-1 block text-[8px] font-semibold text-mute">
        Przypisana prędkość wozu we flocie: {assignedSpeed.toLocaleString("pl-PL")} km/h.
      </span>
    </div>
  );
}
