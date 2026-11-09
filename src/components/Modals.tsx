import { useEffect, useState, type ReactNode } from "react";
import { APP_NAME, routeFilename } from "../config/branding";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  BadgeCheck,
  Bus,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileDown,
  Flag,
  Gauge,
  Loader2,
  MapPin,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Route as RouteIcon,
  Save,
  Scale,
  ShieldAlert,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import type {
  BrigadeInfo,
  ProfileMetrics,
  RouteData,
  RouteStep,
  VehicleId,
  VehicleProfile,
  Waypoint,
} from "../lib/types";
import { formatBrigadeTitle } from "../lib/brigade";
import { isWaypointSet } from "../lib/data";
import { createFleetProfile, fleetSpec, type FleetDraft } from "../lib/fleet";
import {
  formatDelta,
  formatDistance,
  formatDuration,
  readableEngine,
  estimateAverageSpeed,
} from "../lib/geo";
import { cn } from "../utils/cn";
import { Button, FieldLabel, IconButton, Pill, VehicleGlyph } from "./UI";
import { journeyClock, journeyIso, scheduleSummaryLines } from "../lib/schedule";
import { ScheduleReadout } from "./SchedulePanel";

/* -------------------------------------------------------------------------- */
/*  Shared shells                                                            */
/* -------------------------------------------------------------------------- */

function useDialog(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 bg-[#06130e]/55 backdrop-blur-[3px] animate-fade-in"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

export function Dialog({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <Backdrop onClose={onClose} />
      <div
        className={cn(
          "relative max-h-[90vh] w-full overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_30px_100px_rgba(0,0,0,0.32)] animate-rise-in",
          className ?? "max-w-[720px]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Drawer({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true" aria-label={label}>
      <Backdrop onClose={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[455px] flex-col border-l border-line bg-surface shadow-[-30px_0_80px_rgba(0,0,0,0.18)] animate-slide-right">
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink">
            {icon}
          </div>
        )}
        <div>
          <FieldLabel>{eyebrow}</FieldLabel>
          <h2 className="mt-0.5 text-[19px] font-extrabold leading-tight tracking-[-0.035em] text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-1 max-w-[430px] text-[11px] leading-relaxed text-mute">{subtitle}</p>}
        </div>
      </div>
      <IconButton label="Zamknij" onClick={onClose} className="h-7 w-7 shrink-0">
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Turn-by-turn drawer                                                       */
/* -------------------------------------------------------------------------- */

const MODIFIER_PL: Record<string, string> = {
  left: "w lewo",
  right: "w prawo",
  "slight left": "lekko w lewo",
  "slight right": "lekko w prawo",
  "sharp left": "ostro w lewo",
  "sharp right": "ostro w prawo",
  straight: "prosto",
  uturn: "zawróć",
};

function stepHint(step: RouteStep): string {
  if (step.maneuver === "arrive") return "Manewr końcowy · cel podróży";
  if (step.maneuver === "depart") return "Początek odcinka";
  if (step.maneuver === "roundabout" || step.maneuver === "rotary") return "Skrzyżowanie o ruchu okrężnym";
  if (step.maneuver === "fork") return "Rozwidlenie dróg";
  if (step.maneuver === "merge") return "Włączenie do ruchu";
  if (step.maneuver === "on ramp") return "Wjazd na drogę szybkiego ruchu";
  if (step.maneuver === "off ramp") return "Zjazd z drogi szybkiego ruchu";
  if (step.modifier && MODIFIER_PL[step.modifier]) return `Manewr ${MODIFIER_PL[step.modifier]}`;
  return "Kontynuuj wyznaczoną trasą";
}

function StepGlyph({ step }: { step: RouteStep }) {
  const Icon = (() => {
    if (step.maneuver === "arrive") return Flag;
    if (step.maneuver === "depart") return MapPin;
    if (step.maneuver === "roundabout" || step.maneuver === "rotary") return RotateCw;
    if (step.maneuver === "merge" || step.maneuver === "fork") return ArrowUpRight;
    if (step.maneuver === "turn") {
      if (step.modifier?.includes("left")) return ArrowUpLeft;
      if (step.modifier?.includes("right")) return ArrowUpRight;
      if (step.modifier?.includes("uturn")) return RotateCw;
    }
    return ArrowUp;
  })();
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-raised text-brand-ink">
      <Icon className="h-3.5 w-3.5" strokeWidth={2.05} />
    </span>
  );
}

interface StepsDrawerProps {
  open: boolean;
  onClose: () => void;
  route: RouteData;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  vehicle: VehicleId;
  onFocusStep: (step: RouteStep) => void;
  onStartNavigation: () => void;
}

export function StepsDrawer({
  open,
  onClose,
  route,
  waypoints,
  metrics,
  vehicle,
  onFocusStep,
  onStartNavigation,
}: StepsDrawerProps) {
  const groups = route.steps.reduce<Record<number, RouteStep[]>>((acc, step) => {
    acc[step.leg] = acc[step.leg] ?? [];
    acc[step.leg].push(step);
    return acc;
  }, {});

  return (
    <Drawer open={open} onClose={onClose} label="Nawigacja krok po kroku">
      <ModalHeader
        eyebrow="Nawigacja krok po kroku"
        title="Instrukcje jazdy"
        subtitle={`${waypoints[0]?.short || "Start"} → ${waypoints[waypoints.length - 1]?.short || "Meta"} · ${route.steps.length} manewrów · dane ${readableEngine(route.engine)}`}
        onClose={onClose}
        icon={<RouteIcon className="h-4 w-4" />}
      />

      <div className="flex items-center gap-2 border-b border-line bg-raised px-5 py-2.5">
        <Pill tone="green">
          <VehicleGlyph id={vehicle} className="h-2.5 w-2.5" />
          {metrics.short ?? vehicle}
        </Pill>
        <span className="metric text-[10px] font-bold text-ink">{formatDistance(metrics.distance)}</span>
        <span className="h-2.5 w-px bg-line-strong" />
        <span className="metric text-[10px] font-bold text-ink">{formatDuration(metrics.duration)}</span>
        <span className="ml-auto flex items-center gap-1 text-[8.5px] font-semibold text-mute">
          <Gauge className="h-2.5 w-2.5" />
          {estimateAverageSpeed(metrics.distance, metrics.duration).toFixed(1).replace(".", ",")} km/h
        </span>
      </div>

      <div className="scroll-area flex-1 overflow-y-auto px-5 py-3">
        {Object.entries(groups).map(([legIndex, steps]) => {
          const leg = Number(legIndex);
          return (
            <div key={legIndex} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-soft px-2.5 py-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-brand font-mono text-[8px] font-bold text-on-brand">
                  {leg + 1}
                </span>
                <span className="truncate text-[9.5px] font-extrabold text-brand-ink">
                  {waypoints[leg]?.short ?? route.labels[leg] ?? "Start"}
                  <span className="mx-1 font-normal text-brand-ink/50">→</span>
                  {waypoints[leg + 1]?.short ?? route.labels[leg + 1] ?? "Meta"}
                </span>
                <span className="metric ml-auto shrink-0 text-[8px] text-brand-ink/70">
                  {formatDistance(steps.reduce((sum, step) => sum + step.distance, 0))}
                </span>
              </div>
              <ol className="relative">
                <span className="absolute bottom-4 left-[13px] top-4 w-px bg-line" aria-hidden="true" />
                {steps.map((step, index) => (
                  <li key={`${leg}-${index}`}>
                    <button
                      type="button"
                      onClick={() => onFocusStep(step)}
                      disabled={!step.location}
                      className="group relative flex w-full items-start gap-3 rounded-lg py-2 text-left transition-colors hover:bg-raised disabled:cursor-default"
                    >
                      <span className="relative z-10">
                        <StepGlyph step={step} />
                      </span>
                      <span className="min-w-0 flex-1 pt-px">
                        <span className="block text-[11px] font-semibold leading-snug text-ink group-hover:text-brand-ink">
                          {step.instruction}
                        </span>
                        <span className="mt-0.5 block text-[8px] font-semibold text-mute">
                          {stepHint(step)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="metric block text-[9px] font-bold text-ink-soft">
                          {formatDistance(step.distance)}
                        </span>
                        <span className="metric mt-0.5 block text-[8px] text-mute">
                          {formatDuration(step.duration)}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-line-strong transition-transform group-hover:translate-x-0.5 group-hover:text-mute" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
        {!route.steps.length && (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-mute" />
            <p className="text-[11px] font-semibold text-mute">Instrukcje zostaną wygenerowane po przeliczeniu trasy.</p>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-surface px-5 py-3">
        <div className="mb-2 flex items-center justify-between rounded-lg bg-raised px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[9px] font-semibold text-mute">
            <Sparkles className="h-3 w-3 text-brand-ink" />
            Wskazówka: kliknij manewr, aby przybliżyć go na mapie.
          </span>
          <span className="metric shrink-0 text-[9px] font-bold text-ink">{formatDuration(metrics.duration)}</span>
        </div>
        <Button
          onClick={() => {
            onStartNavigation();
            onClose();
          }}
          className="h-10 w-full"
        >
          <Play className="h-3.5 w-3.5" fill="currentColor" />
          Rozpocznij podgląd nawigacji
        </Button>
      </div>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editable bus fleet                                                         */
/* -------------------------------------------------------------------------- */

const emptyFleetDraft: FleetDraft = {
  name: "", lengthM: "12", weightT: "12", heightM: "3.2", widthM: "2.55", maxSpeed: "90", averageSpeed: "25",
};

const fleetInput = "mt-1 h-9 w-full min-w-0 rounded-lg border border-line bg-raised px-2 text-[11px] font-bold text-ink outline-none focus:border-brand";

export function FleetDialog({
  open,
  onClose,
  fleet,
  activeId,
  onSelect,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  fleet: VehicleProfile[];
  activeId: VehicleId;
  onSelect: (id: VehicleId) => void;
  onChange: (fleet: VehicleProfile[]) => void;
}) {
  const [draft, setDraft] = useState<FleetDraft>(emptyFleetDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(emptyFleetDraft);
      setError("");
      setNotice("");
    }
  }, [open]);

  const patch = (partial: Partial<FleetDraft>) => setDraft((current) => ({ ...current, ...partial }));

  const submit = () => {
    const profile = createFleetProfile(draft);
    if (!profile) {
      setError("Podaj nazwę, długość 1–30 m, masę 0,5–80 t, średnią prędkość 1–200 km/h i maks. prędkość 20–140 km/h.");
      return;
    }
    const editing = Boolean(draft.id);
    const next = editing
      ? fleet.map((item) => item.id === draft.id ? profile : item)
      : [...fleet, profile];
    onChange(next);
    if (!editing) onSelect(profile.id);
    setDraft(emptyFleetDraft);
    setError("");
    setNotice(editing ? `Zapisano ${profile.name} (stała śr. ${profile.averageSpeed.toLocaleString("pl-PL")} km/h).` : `Dodano ${profile.name} do floty.`);
  };

  const edit = (profile: VehicleProfile) => {
    setDraft({
      id: profile.id,
      name: profile.name,
      lengthM: String(profile.lengthM),
      weightT: String(profile.weightT),
      heightM: profile.heightM === undefined ? "" : String(profile.heightM),
      widthM: profile.widthM === undefined ? "" : String(profile.widthM),
      maxSpeed: String(profile.limits.motorway),
      averageSpeed: String(profile.averageSpeed),
    });
    setError("");
    setNotice(`Edytujesz ${profile.name}.`);
  };

  const remove = (id: VehicleId) => {
    if (fleet.length <= 1) return;
    const next = fleet.filter((item) => item.id !== id);
    onChange(next);
    if (activeId === id) onSelect(next[0].id);
    if (draft.id === id) setDraft(emptyFleetDraft);
    setNotice("Usunięto pojazd z floty.");
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-[760px]" label="Flota autobusów">
      <div className="scroll-area max-h-[90vh] overflow-y-auto" data-testid="fleet-dialog">
        <ModalHeader
          eyebrow="Własna flota"
          title="Flota autobusów"
          subtitle="Dodaj pojazdy np. 12 m / 12 t albo 18 m / 20 t i przypisz każdemu wozowi stałą średnią prędkość. Flota zapisuje się w tej przeglądarce."
          onClose={onClose}
          icon={<Bus className="h-4 w-4" />}
        />
        <div className="px-5 py-4">
          <div className="rounded-xl border border-line bg-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-extrabold text-ink">
                {draft.id ? "Edytuj pojazd" : "Dodaj nowy pojazd"}
              </h3>
              {draft.id && <button type="button" onClick={() => { setDraft(emptyFleetDraft); setNotice(""); }} className="text-[9px] font-bold text-mute hover:text-ink">Anuluj edycję</button>}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2"><FieldLabel>Nazwa</FieldLabel>
                <input aria-label="Nazwa pojazdu" value={draft.name} onChange={(event) => patch({ name: event.target.value })}
                  placeholder="np. Solaris Urbino 12" className={fleetInput} autoComplete="off" />
              </label>
              <label><FieldLabel>Długość (m)</FieldLabel>
                <input aria-label="Długość w metrach" type="number" min="1" max="30" step="0.1" value={draft.lengthM}
                  onChange={(event) => patch({ lengthM: event.target.value })} className={fleetInput} />
              </label>
              <label><FieldLabel>Masa całkowita (t)</FieldLabel>
                <input aria-label="Masa w tonach" type="number" min="0.5" max="80" step="0.1" value={draft.weightT}
                  onChange={(event) => patch({ weightT: event.target.value })} className={fleetInput} />
              </label>
              <label><FieldLabel>Wysokość (m, opcjonalnie)</FieldLabel>
                <input aria-label="Wysokość w metrach" type="number" min="1" max="6" step="0.05" value={draft.heightM ?? ""}
                  onChange={(event) => patch({ heightM: event.target.value })} className={fleetInput} />
              </label>
              <label><FieldLabel>Szerokość (m, opcjonalnie)</FieldLabel>
                <input aria-label="Szerokość w metrach" type="number" min="1" max="4" step="0.05" value={draft.widthM ?? ""}
                  onChange={(event) => patch({ widthM: event.target.value })} className={fleetInput} />
              </label>
              <label><FieldLabel>Średnia prędkość wozu (km/h)</FieldLabel>
                <input aria-label="Średnia prędkość wozu w km/h" type="number" min="1" max="200" step="0.5" value={draft.averageSpeed}
                  onChange={(event) => patch({ averageSpeed: event.target.value })} className={fleetInput} />
              </label>
              <label><FieldLabel>Maks. prędkość (km/h)</FieldLabel>
                <input aria-label="Maksymalna prędkość w km/h" type="number" min="20" max="140" step="1" value={draft.maxSpeed}
                  onChange={(event) => patch({ maxSpeed: event.target.value })} className={fleetInput} />
              </label>
            </div>
            {error && <p role="alert" className="mt-2 text-[10px] font-semibold text-danger">{error}</p>}
            {notice && <p role="status" className="mt-2 text-[10px] font-semibold text-brand-ink">{notice}</p>}
            <Button onClick={submit} className="mt-3 h-9 w-full">
              {draft.id ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {draft.id ? "Zapisz zmiany" : "Dodaj pojazd"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel>Twoje autobusy ({fleet.length})</FieldLabel>
              <span className="text-[8px] text-mute">Kliknij „Użyj”, aby wybrać do trasy</span>
            </div>
            <div className="flex flex-col gap-2">
              {fleet.map((profile) => {
                const active = profile.id === activeId;
                return (
                  <div key={profile.id} data-testid={`fleet-row-${profile.id}`}
                    className={cn("flex flex-wrap items-center gap-2 rounded-xl border p-2.5", active ? "border-brand/40 bg-brand-soft" : "border-line bg-raised")}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-brand-ink"><Bus className="h-4 w-4" /></span>
                    <div className="min-w-[130px] flex-1">
                      <span className="block truncate text-[11px] font-extrabold text-ink">{profile.name}</span>
                      <span className="mt-0.5 block truncate text-[9px] text-mute">
                        {fleetSpec(profile)} · <strong className="text-brand-ink">śr. {profile.averageSpeed.toLocaleString("pl-PL")} km/h</strong> · max {profile.limits.motorway} km/h
                      </span>
                    </div>
                    {active && <Pill tone="green"><Check className="h-2.5 w-2.5" /> aktywny</Pill>}
                    <button type="button" onClick={() => { onSelect(profile.id); onClose(); }} aria-label={`Użyj ${profile.name}`}
                      className="h-7 rounded-md border border-line bg-surface px-2 text-[9px] font-bold text-brand-ink hover:border-brand/50">Użyj</button>
                    <button type="button" onClick={() => edit(profile)} aria-label={`Edytuj ${profile.name}`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-mute hover:text-ink"><Pencil className="h-3 w-3" /></button>
                    <button type="button" onClick={() => remove(profile.id)} disabled={fleet.length <= 1}
                      aria-label={`Usuń ${profile.name}`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-mute hover:text-danger disabled:opacity-35"><Trash2 className="h-3 w-3" /></button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-2.5 py-2 text-[9px] leading-relaxed text-warning">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            Publiczny OSRM nie sprawdza długości, masy ani zakazów wjazdu dla konkretnego autobusu.
            Parametry służą do identyfikacji pojazdu i planowania czasu.
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line bg-raised px-5 py-3">
          <span className="text-[8.5px] text-mute">Flota i ustawienia zapisują się automatycznie.</span>
          <Button onClick={onClose} variant="secondary" className="h-9">Gotowe</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  API settings                                                              */
/* -------------------------------------------------------------------------- */

export function SettingsDialog({ open, onClose, engine }: { open: boolean; onClose: () => void; engine: string }) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-[560px]" label="Darmowe źródła i informacje">
      <div className="scroll-area max-h-[90vh] overflow-y-auto">
        <ModalHeader eyebrow="Bez konta, abonamentu i kluczy" title="Wszystko bez opłat za API"
          subtitle="Mapy, wyznaczanie tras, własne czasy i eksport PDF. Żaden klucz ani karta płatnicza nie są wymagane."
          onClose={onClose} icon={<BadgeCheck className="h-4 w-4" />} />
        <div className="px-5 py-4">
          {[
            ["OSRM", "Publiczny routing samochodowy. Do 50 punktów, sekwencyjne zapytania z maksymalnie 20 punktami."],
            ["Nominatim / OSM", "Wyszukiwanie po kliknięciu, bez automatycznych zapytań podczas pisania. Wspólna kolejka: maks. 1 zapytanie na 1,1 s w tej karcie."],
            ["Overpass API / OSM", "Wszystkie przystanki, w tym oba stanowiska po przeciwnych stronach ulicy. Duplikaty jednego stanowiska łączymy; różne numery ref pozostają osobne. Własna kolejka, bufor 12 h i zapasowe instancje."],
            ["OSM Standard", "Domyślny, szczegółowy podkład z ulicami i zatokami przystanków - dzięki niemu widać, że znacznik stoi w realnym miejscu. Pobierany tylko dla oglądanego widoku."],
            ["Esri / dane OSM", "Podkłady jasny, ciemny i satelitarny bez klucza. Jasny Esri jest używany w PDF, żeby nie pobierać kafelków OSM poza widokiem."],
            ["jsPDF", "Darmowa biblioteka open source. PDF powstaje lokalnie, z osadzoną czcionką obsługującą polskie znaki."],
            ["Godziny przejazdu i korki", "Obliczenia lokalne w strefie Europe/Warsaw. Korekta godzin szczytu to konfigurowalna symulacja do planowania, nie statystyki ruchu ani prognoza dla konkretnej ulicy. Publiczny OSRM nie dostarcza tych danych."],
          ].map(([name, detail]) => (
            <div key={name} className="border-b border-line py-3 first:pt-0 last:border-0">
              <h3 className="text-[11px] font-extrabold text-ink">{name}</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-mute">{detail}</p>
            </div>
          ))}
          <div className="mt-2 rounded-lg bg-warning-soft p-3 text-[10px] leading-relaxed text-warning">
            Publiczne serwery są bezpłatne, ale mają limity i nie gwarantują dostępności. Publiczny OSRM nie weryfikuje gabarytów floty ani zakazów wjazdu.
            Opłaty za sam przejazd drogą, internet czy własny hosting nie są kosztami aplikacji.
          </div>
          <p className="mt-3 text-[9px] leading-relaxed text-mute">
            Współrzędne trasy trafiają do OSRM, a wyszukiwane adresy do Nominatim. Nie wysyłaj poufnych danych.
            Przy większej liczbie użytkowników użyj własnych instancji open source; adresy serwerów można ustawić bez kluczy w zmiennych środowiskowych.
          </p>
          <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer"
            className="mt-2 inline-block text-[10px] font-bold text-brand-ink underline underline-offset-2">Zasady korzystania z Nominatim</a>
          <p className="mt-3 text-[10px] font-semibold text-ink-soft">Aktywny silnik: {engine}</p>
        </div>
        <div className="flex justify-end border-t border-line bg-raised px-5 py-3"><Button onClick={onClose} className="h-9">Rozumiem</Button></div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Report + methodology                                                      */
/* -------------------------------------------------------------------------- */

export function ReportDialog({
  open,
  onClose,
  waypoints,
  route,
  metrics,
  activeVehicle,
  brigade,
  onOpenPdf,
  pdfDisabled,
}: {
  open: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  route: RouteData;
  metrics: ProfileMetrics[];
  activeVehicle: VehicleId;
  brigade?: BrigadeInfo;
  onOpenPdf: () => void;
  pdfDisabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const active = metrics.find((metric) => metric.id === activeVehicle) ?? metrics[0];
  const profileName = active.name ?? "Pojazd";
  const brigadeTitle = formatBrigadeTitle(brigade);

  const makeCsv = () => {
    if (pdfDisabled) return;
    const header = ["Brygada", "Linia", "Sluzba", "Profil", "Dystans [km]", "Dystans [m]", "Czas [s]", "Czas", "Srednia wlasna [km/h]", "Model czasu", "Czas bazowy [s]", "Korki symulacja [s]", "Wyjazd Europe/Warsaw", "Przyjazd Europe/Warsaw", "Termin na mecie", "Zapas [min]", "Zrodlo korkow", "Maks. szczyt [%]"];
    const rows = metrics.map((metric) => {
      const profile = metric.name ?? metric.id;
      return [
        brigadeTitle,
        brigade?.line.trim() ?? "",
        brigade?.duty.trim() ?? "",
        profile,
        (metric.distance / 1000).toFixed(3).replace(".", ","),
        Math.round(metric.distance),
        metric.duration,
        formatDuration(metric.duration),
        metric.customSpeed ?? "",
        metric.customSpeed === undefined ? "Model OSRM + wspolczynnik" : "Wlasna srednia",
        metric.journey?.baseSeconds ?? metric.duration,
        metric.journey?.delaySeconds ?? 0,
        metric.journey ? journeyIso(metric.journey.departure) : "",
        metric.journey ? journeyIso(metric.journey.arrival) : "",
        metric.journey?.targetArrival !== undefined ? journeyIso(metric.journey.targetArrival) : "",
        (metric.journey?.bufferSeconds ?? 0) / 60,
        metric.journey?.trafficEnabled ? "Symulacja - nie statystyki" : "Wylaczone",
        metric.journey?.trafficEnabled ? metric.journey.peakDelayPercent : 0,
      ];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = routeFilename(waypoints[0]?.short ?? "start", waypoints[waypoints.length - 1]?.short ?? "meta", "csv", brigadeTitle);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copySummary = async () => {
    if (pdfDisabled || !active.journey) return;
    const text = [
      `${APP_NAME}${brigadeTitle ? ` · ${brigadeTitle}` : ""} · ${waypoints.map((point) => point.short).join(" → ")}`,
      ...(brigadeTitle ? [`Brygada: ${brigadeTitle}`] : []),
      `Profil: ${profileName}`,
      `Dystans: ${formatDistance(active.distance)}`,
      `Czas: ${formatDuration(active.duration)}`,
      ...scheduleSummaryLines(active.journey),
      `Silnik: ${readableEngine(route.engine)}`,
      `Pojazd: ${active.profile ? fleetSpec(active.profile) : profileName}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-[780px]" label="Raport trasy i metodologia">
      <div className="scroll-area max-h-[90vh] overflow-y-auto">
        <ModalHeader
          eyebrow="Raport i metodologia"
          title="Jak policzona jest trasa?"
          subtitle="Porównanie profili pojazdów na tej samej geometrii trasy. Wszystkie dystanse podajemy z dokładnością do 3 miejsc po przecinku, a czasy do sekund."
          onClose={onClose}
          icon={<FileSpreadsheet className="h-4 w-4" />}
        />
        <div className="px-5 py-4">
          <div className="rounded-xl border border-line bg-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <FieldLabel>{brigadeTitle ? `Trasa · ${brigadeTitle}` : "Trasa"}</FieldLabel>
                <div className="mt-0.5 text-[13px] font-extrabold text-ink">
                  {waypoints.some((point) => point.short) ? waypoints.filter((point) => point.short).map((point) => point.short).join("  →  ") : "Brak wyznaczonej trasy"}
                </div>
              </div>
              <Pill tone="green">{readableEngine(route.engine)}</Pill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2 sm:grid-cols-4">
              <div>
                <FieldLabel>Dystans</FieldLabel>
                <div className="metric mt-0.5 text-[12px] font-bold text-ink">{formatDistance(active.distance)}</div>
              </div>
              <div>
                <FieldLabel>Czas</FieldLabel>
                <div className="metric mt-0.5 text-[12px] font-bold text-ink">{formatDuration(active.duration)}</div>
              </div>
              <div>
                <FieldLabel>Śr. prędkość</FieldLabel>
                <div className="metric mt-0.5 text-[12px] font-bold text-ink">
                  {estimateAverageSpeed(active.distance, active.duration).toFixed(1).replace(".", ",")} km/h
                </div>
              </div>
              <div>
                <FieldLabel>Punkty trasy</FieldLabel>
                <div className="metric mt-0.5 text-[12px] font-bold text-ink">
                  {waypoints.filter(isWaypointSet).length} / 50
                </div>
              </div>
            </div>
          </div>

          {active.journey && <ScheduleReadout timing={active.journey} compact />}
          {pdfDisabled && <p role="status" className="mt-3 text-[10px] text-warning">Eksport wymaga aktualnej trasy i poprawnej daty oraz godziny.</p>}

          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[600px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-soft">
                  {["Profil", "Dystans", "Czas", "Δ czas", "Δ dystans", "Model czasu"].map((head) => (
                    <th key={head} className="px-2.5 py-2 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-mute">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  const profile = metric.name ?? metric.id;
                  const base = metrics[0];
                  return (
                    <tr
                      key={metric.id}
                      className={cn("border-b border-line last:border-0", metric.id === activeVehicle && "bg-brand-soft/60")}
                    >
                      <td className="px-2.5 py-2">
                        <span className="flex items-center gap-1.5 text-[9.5px] font-bold text-ink">
                          <VehicleGlyph id={metric.id} className="h-3 w-3 text-brand-ink" />
                          {profile}
                        </span>
                      </td>
                      <td className="metric px-2.5 py-2 text-[9px] text-ink-soft">{formatDistance(metric.distance)}</td>
                      <td className="metric px-2.5 py-2 text-[9px] font-bold text-ink">{formatDuration(metric.duration)}
                        {metric.journey && <span className="mt-1 block text-[8px] font-normal text-mute">Wyjazd {journeyClock(metric.journey.departure)}</span>}
                      </td>
                      <td className={cn("metric px-2.5 py-2 text-[9px] font-semibold", metric.duration > base.duration ? "text-warning" : "text-emerald-700 dark:text-emerald-400")}>
                        {metric.id === base.id ? "—" : formatDelta(metric.duration - base.duration)}
                      </td>
                      <td className="metric px-2.5 py-2 text-[9px] text-ink-soft">
                        {metric.distance === base.distance ? "0 m" : `${metric.distance >= base.distance ? "+" : "−"}${formatDistance(Math.abs(metric.distance - base.distance))}`}
                      </td>
                      <td className="px-2.5 py-2 text-[9px] font-semibold text-mute">
                        {metric.customSpeed === undefined ? "Automatyczny" : `Własna: ${metric.customSpeed.toLocaleString("pl-PL")} km/h`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-ink">
                <Timer className="h-3 w-3 text-brand-ink" /> Model czasu
              </div>
              <p className="mt-1 text-[8.5px] leading-relaxed text-mute">
                W trybie Auto używamy bazowego czasu OSRM. W trybie Własna:
                czas [s] = dystans [km] / średnia [km/h] × 3600.
                To czas bazowy bez postojów. Opcjonalna symulacja godzin szczytu koryguje czas w kolejnych
                15-minutowych przedziałach przejazdu. Nie korzysta z historycznych statystyk, pomiarów korków
                ani zdarzeń na konkretnych ulicach. W trybie „Przyjazd na” plan liczymy wstecz od terminu,
                uwzględniając wybrany zapas. Ustawienia prędkości są osobne dla każdego pojazdu.
              </p>
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-ink">
                <Scale className="h-3 w-3 text-brand-ink" /> Ograniczenia floty
              </div>
              <p className="mt-1 text-[8.5px] leading-relaxed text-mute">
                Wszystkie autobusy z floty porównują ten sam rzeczywisty dystans i geometrię trasy OSRM.
                Nie dodajemy fikcyjnych kilometrów objazdu. Publiczny OSRM nie sprawdza długości, masy ani zakazów
                wjazdu dla danego pojazdu. Dokładność zapisu do metra i sekundy nie oznacza gwarancji przejazdu.
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-soft px-2.5 py-2">
            <span className="truncate text-[8.5px] text-ink-soft">
              Aktywny autobus: {active.profile ? fleetSpec(active.profile) : profileName}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[8px] font-extrabold text-brand-ink">
              <Bus className="h-3 w-3" /> Flota
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-raised px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { onClose(); onOpenPdf(); }} disabled={pdfDisabled} className="h-9"><FileDown className="h-3 w-3" /> Trasa PDF</Button>
            <Button variant="secondary" onClick={makeCsv} disabled={pdfDisabled} className="h-9">
              <Download className="h-3 w-3" /> Eksport CSV
            </Button>
            <Button variant="secondary" onClick={copySummary} disabled={pdfDisabled} className="h-9">
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Skopiowano" : "Kopiuj"}
            </Button>
          </div>
          <Button onClick={onClose} className="h-9">Zamknij raport</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toast                                                                     */
/* -------------------------------------------------------------------------- */

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3400);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[4000] -translate-x-1/2 animate-rise-in">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-soft text-brand-ink">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
        <span className="text-[10.5px] font-bold text-ink">{message}</span>
        <button type="button" onClick={onClose} aria-label="Zamknij" className="ml-1 text-mute hover:text-ink">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
