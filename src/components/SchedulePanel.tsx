import { useId } from "react";
import { ArrowRight, CalendarClock, Clock3, Info, Timer } from "lucide-react";
import { formatDuration, formatDurationShort } from "../lib/geo";
import { journeyClock, journeyDate, journeyDateTime, journeyIso, trafficDayProfile, type ScheduleEvaluation } from "../lib/schedule";
import type { JourneyTiming, ScheduleSettings } from "../lib/types";
import { cn } from "../utils/cn";
import { CollapseToggle, FieldLabel } from "./UI";

export function ScheduleReadout({ timing, now, compact = false }: { timing: JourneyTiming; now?: number; compact?: boolean }) {
  return (
    <div className={cn("border-t border-line pt-3", compact ? "mt-2" : "mt-3")} data-testid="schedule-result">
      <div className="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
        <div className="min-w-0" title={journeyDateTime(timing.departure)}>
          <FieldLabel>{timing.mode === "arrival" ? "Kierowca wyjeżdża o" : "Wyjazd"}</FieldLabel>
          <div className={cn("metric mt-1 font-bold tracking-tight text-brand-ink", compact ? "text-[17px]" : "text-[23px]")} data-testid="scheduled-departure">
            {journeyClock(timing.departure)}
          </div>
          <p className="mt-0.5 text-[9px] text-mute" data-testid="departure-date">{journeyDate(timing.departure)}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-mute" />
        <div className="min-w-0 text-right" title={journeyDateTime(timing.arrival)}>
          <FieldLabel>Szacowany przyjazd</FieldLabel>
          <div className={cn("metric mt-1 font-bold tracking-tight text-ink", compact ? "text-[17px]" : "text-[21px]")} data-testid="scheduled-arrival">
            {journeyClock(timing.arrival)}
          </div>
          <p className="mt-0.5 text-[9px] text-mute" data-testid="arrival-date">{journeyDate(timing.arrival)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[10px]">
        <div className="flex items-center justify-between gap-2 text-mute"><span>Czas bazowy</span><span className="metric">{formatDuration(timing.baseSeconds)}</span></div>
        <div className="flex items-center justify-between gap-2 text-mute"><span>{timing.trafficEnabled ? "Korki (symulacja)" : "Korki wyłączone"}</span><span className={cn("metric", timing.trafficEnabled && "text-warning")} data-testid="traffic-delay">+{formatDuration(timing.delaySeconds)}</span></div>
        <div className="flex items-center justify-between gap-2 font-bold text-ink"><span>Łącznie jazda</span><span className="metric" data-testid="scheduled-duration">{formatDuration(timing.travelSeconds)}</span></div>
      </div>
      {timing.targetArrival !== undefined && (
        <p className="mt-2 rounded-md bg-brand-soft px-2 py-1.5 text-[9px] leading-relaxed text-brand-ink">
          Na mecie do <strong>{journeyClock(timing.targetArrival, false)}</strong> ({journeyDate(timing.targetArrival)}).
          {timing.bufferSeconds > 0 ? ` Zapas na mecie: ${formatDurationShort(timing.bufferSeconds)}. Wyjazd uwzględnia zapas.` : " Bez dodatkowego zapasu."}
        </p>
      )}
      {now !== undefined && timing.departure < now - 1000 && (
        <p role="status" className="mt-2 text-[10px] font-semibold leading-relaxed text-warning">Wyliczony wyjazd przypada w przeszłości. Zmień termin lub potraktuj wynik jako symulację.</p>
      )}
      <p className="mt-2 text-[8px] text-mute">Czas polski (Europe/Warsaw). Wynik orientacyjny, nie gwarancja przyjazdu.</p>
    </div>
  );
}

interface Props {
  settings: ScheduleSettings;
  evaluation: ScheduleEvaluation;
  routeReady: boolean;
  now: number;
  onChange: (settings: ScheduleSettings) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SchedulePanel({ settings, evaluation, routeReady, now, onChange, collapsed, onToggleCollapse }: Props) {
  const id = useId();
  const update = (partial: Partial<ScheduleSettings>) => onChange({ ...settings, ...partial });
  const profile = trafficDayProfile(settings.mode === "now" ? journeyIso(now).slice(0, 10) : settings.date);
  const modes: { id: ScheduleSettings["mode"]; label: string }[] = [
    { id: "now", label: "Teraz" }, { id: "departure", label: "Wyjazd o" }, { id: "arrival", label: "Przyjazd na" },
  ];

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-surface" aria-labelledby={`${id}-heading`} data-testid="schedule-panel">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-brand-ink" />
          <h2 id={`${id}-heading`} className="truncate text-[12px] font-extrabold text-ink">Plan przejazdu</h2>
          <span className="truncate text-[8px] font-semibold text-mute">
            {collapsed && routeReady && evaluation.timing
              ? `${journeyClock(evaluation.timing.departure, false)} → ${journeyClock(evaluation.timing.arrival, false)}`
              : "Czas polski"}
          </span>
        </button>
        <CollapseToggle
          collapsed={collapsed}
          onToggle={onToggleCollapse}
          sectionName="Plan przejazdu"
        />
      </header>
      {!collapsed && <div className="p-3.5">
        <div className="flex gap-1 rounded-lg bg-soft p-1" aria-label="Tryb planowania">
          {modes.map((mode) => <button type="button" key={mode.id} onClick={() => update({ mode: mode.id })} aria-pressed={settings.mode === mode.id}
            className={cn("h-8 flex-1 rounded-md text-[11px] font-bold transition-colors", settings.mode === mode.id ? "bg-brand text-on-brand shadow-sm" : "text-mute hover:text-ink")}>
            {mode.label}
          </button>)}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-mute">
          {settings.mode === "arrival" ? "Podaj termin na mecie B. Wyliczymy godzinę wyjazdu z A." : settings.mode === "departure" ? "Wybierz godzinę wyjazdu, aby sprawdzić czas dojazdu do B." : "Plan dla wyjazdu teraz. Wybierz „Przyjazd na”, aby zaplanować wyjazd kierowcy."}
        </p>
        {settings.mode !== "now" && <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-2 animate-rise-in">
          <label className="min-w-0"><FieldLabel>{settings.mode === "arrival" ? "Data przyjazdu" : "Data wyjazdu"}</FieldLabel>
            <input type="date" min="2000-01-01" max="2100-12-31" value={settings.date} onChange={(e) => update({ date: e.target.value })}
              aria-label="Data przejazdu" className="mt-1 h-9 w-full min-w-0 rounded-lg border border-line bg-raised px-2 text-[11px] font-bold text-ink outline-none focus:border-brand" />
          </label>
          <label className="min-w-0"><FieldLabel>{settings.mode === "arrival" ? "Godzina na mecie" : "Godzina wyjazdu"}</FieldLabel>
            <input type="time" step="60" value={settings.time} onChange={(e) => update({ time: e.target.value })}
              aria-label={settings.mode === "arrival" ? "Godzina przyjazdu na metę" : "Godzina wyjazdu"}
              className="mt-1 h-9 w-full min-w-0 rounded-lg border border-line bg-raised px-2 text-[13px] font-bold text-ink outline-none focus:border-brand" />
          </label>
        </div>}
        {evaluation.ambiguous && settings.mode !== "now" && <label className="mt-2 block text-[10px] text-warning">
          Ta godzina występuje dwa razy po zmianie czasu:
          <select aria-label="Wystąpienie godziny przy zmianie czasu" value={settings.occurrence} onChange={(e) => update({ occurrence: e.target.value as ScheduleSettings["occurrence"] })}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-raised px-2 text-[10px] text-ink">
            <option value="earlier">Pierwsze wystąpienie (czas letni)</option><option value="later">Drugie wystąpienie (czas zimowy)</option>
          </select>
        </label>}
        {settings.mode === "arrival" && <label className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-soft"><Timer className="h-3 w-3 text-mute" /> Zapas przed terminem</span>
          <span className="flex h-8 w-24 items-center gap-1 rounded-md border border-line bg-raised px-2">
            <input type="number" min="0" max="120" step="1" aria-label="Zapas czasu w minutach" value={Number.isFinite(settings.bufferMinutes) ? settings.bufferMinutes : ""}
              onChange={(e) => update({ bufferMinutes: e.target.value === "" ? NaN : Number(e.target.value) })}
              className="metric min-w-0 w-full bg-transparent text-[12px] font-bold text-ink outline-none" /><span className="text-[9px] text-mute">min</span>
          </span>
        </label>}

        <div className="mt-3 border-t border-line pt-3">
          <button type="button" role="switch" aria-checked={settings.trafficEnabled} aria-describedby={`${id}-disclaimer`} onClick={() => update({ trafficEnabled: !settings.trafficEnabled })}
            className="flex w-full items-center justify-between gap-2 text-left" aria-label="Symulacja godzin szczytu">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink"><Clock3 className="h-3.5 w-3.5 text-brand-ink" /> Uwzględnij godziny szczytu</span>
            <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", settings.trafficEnabled ? "bg-brand" : "bg-line-strong")}>
              <span className={cn("absolute left-0 top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform", settings.trafficEnabled ? "translate-x-[18px]" : "translate-x-0.5")} />
            </span>
          </button>
          <p id={`${id}-disclaimer`} className="mt-1.5 flex items-start gap-1.5 text-[9px] leading-relaxed text-mute">
            <Info className="mt-0.5 h-3 w-3 shrink-0" /><span>Model orientacyjny, <strong>nie statystyki ani ruch na żywo</strong>. Bez danych Google i bez płatnego API.</span>
          </p>
          {settings.trafficEnabled && <div className="mt-2.5 animate-rise-in">
            <div className="flex items-center justify-between gap-2 text-[10px]"><label htmlFor={`${id}-peak`} className="text-ink-soft">Maks. wydłużenie w szczycie</label><strong className="metric text-warning">+{settings.peakDelayPercent}%</strong></div>
            <input id={`${id}-peak`} type="range" min="0" max="100" step="5" value={settings.peakDelayPercent} onChange={(e) => update({ peakDelayPercent: Number(e.target.value) })}
              aria-label="Maksymalne wydłużenie w szczycie" className="my-2 h-1 w-full cursor-pointer" />
            <div className="flex h-9 items-end gap-[3px]" role="img" aria-label={`Założony profil dobowy, ${profile.weekend ? "weekend" : "dzień roboczy"}, nie dane pomiarowe`}>
              {profile.hours.map((pressure, hour) => <span key={hour} title={`${hour}:00: +${Math.round(pressure * settings.peakDelayPercent)}% (założenie)`}
                className={cn("min-w-0 flex-1 rounded-t-sm transition-[height] duration-300", pressure >= 0.6 ? "bg-warning/70" : "bg-brand/30")}
                style={{ height: `${Math.max(6, pressure * 100)}%` }} />)}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[8px] text-mute"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            <p className="mt-1.5 text-[9px] leading-relaxed text-mute">{profile.weekend ? "Model weekendowy" : "Model dnia roboczego"}. Zmienny w czasie jazdy, bez świąt, zdarzeń i analizy konkretnych ulic. Jeśli Twoje 25 km/h już obejmuje korki, wyłącz korektę.</p>
          </div>}
        </div>

        {evaluation.error ? <p role="alert" className="mt-3 rounded-lg bg-warning-soft p-2 text-[10px] font-semibold leading-relaxed text-warning">{evaluation.error}</p>
          : !routeReady ? <p role="status" className="mt-3 border-t border-line pt-3 text-[10px] text-mute">Wybierz i wyznacz trasę, aby wyliczyć godziny przejazdu.</p>
            : evaluation.timing && <ScheduleReadout timing={evaluation.timing} now={now} />}
      </div>}
    </section>
  );
}