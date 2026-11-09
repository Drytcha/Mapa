import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, brandedHeading } from "../config/branding";
import { Check, Download, FileDown, Loader2 } from "lucide-react";
import { Dialog, ModalHeader } from "./Modals";
import { Button, FieldLabel } from "./UI";
import { WALBRZYCH_CENTER } from "../lib/busStops";
import { formatBrigadeTitle } from "../lib/brigade";
import { isWaypointSet } from "../lib/data";
import { formatDistance, formatDuration } from "../lib/geo";
import { createMapProjection, DEFAULT_PDF_OPTIONS, getPdfLayout, type PdfOptions } from "../lib/printLayout";
import type { BrigadeInfo, ProfileMetrics, RouteData, VehicleId, Waypoint } from "../lib/types";

const PRINT_BRAND_KEY = "mapplaner.print-brand.v1";

function loadCustomBrand(): string {
  try {
    return localStorage.getItem(PRINT_BRAND_KEY) ?? "";
  } catch {
    return "";
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  route: RouteData;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  vehicle: VehicleId;
  brigade?: BrigadeInfo;
  routeReady: boolean;
}

export default function PdfExportDialog({
  open,
  onClose,
  route,
  waypoints,
  metrics,
  vehicle,
  brigade,
  routeReady,
}: Props) {
  const [options, setOptions] = useState<PdfOptions>(() => ({
    ...DEFAULT_PDF_OPTIONS,
    customBrandName: loadCustomBrand(),
  }));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) { setError(""); setSuccess(""); setProgress(""); }
    else { controllerRef.current?.abort(); setBusy(false); }
    return () => controllerRef.current?.abort();
  }, [open]);

  const activeWaypoints = useMemo(() => waypoints.filter(isWaypointSet), [waypoints]);
  const coordinates = useMemo<[number, number][]>(() => {
    const list: [number, number][] = [
      ...route.coords,
      ...activeWaypoints.map((p) => [p.lat, p.lon] as [number, number]),
    ];
    return list.length
      ? list
      : [WALBRZYCH_CENTER, [WALBRZYCH_CENTER[0] + 0.01, WALBRZYCH_CENTER[1] + 0.01]];
  }, [route.coords, activeWaypoints]);
  const layout = useMemo(() => getPdfLayout(options, coordinates), [options, coordinates]);
  const preview = useMemo(() => {
    const h = 230 * layout.map.height / layout.map.width;
    const p = createMapProjection(coordinates, 230, Math.max(90, h), 18);
    return { height: Math.max(90, h), projection: p, points: route.coords.map((coord) => p.toPoint(coord).join(",")).join(" ") };
  }, [coordinates, layout, route.coords]);
  const patch = (next: Partial<PdfOptions>) => {
    setOptions((current) => {
      const updated = { ...current, ...next };
      if ("customBrandName" in next) {
        try { localStorage.setItem(PRINT_BRAND_KEY, updated.customBrandName ?? ""); } catch { /* noop */ }
      }
      return updated;
    });
    setSuccess("");
  };
  const close = () => { controllerRef.current?.abort(); onClose(); };

  const activeBrand = options.customBrandName?.trim() || APP_NAME;
  const brigadeTitle = formatBrigadeTitle(brigade);

  const download = async () => {
    if (busy || !routeReady) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setSuccess("");
    setProgress("Przygotowuję PDF...");
    try {
      const { exportRoutePdf } = await import("../lib/pdf");
      const result = await exportRoutePdf({
        route,
        waypoints: activeWaypoints,
        metrics,
        vehicle,
        brigade,
        options,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (!controller.signal.aborted) setSuccess(result.missingTiles
        ? `PDF zapisany (${result.pageCount} str.). Podkład mapy jest niepełny, ale cała trasa i wszystkie punkty są zachowane. Możesz spróbować ponownie.`
        : `PDF zapisany (${result.pageCount} str.). Pełna trasa i marginesy 2 cm są gotowe do wydruku.`);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Nie udało się utworzyć PDF. Spróbuj ponownie.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); setProgress(""); }
    }
  };

  return (
    <Dialog open={open} onClose={close} className="max-w-[730px]" label="Eksport trasy do PDF">
      <div className="scroll-area max-h-[90dvh] overflow-y-auto">
        <ModalHeader eyebrow="Bezpłatny eksport" title="Cała trasa w PDF"
          subtitle="Nie zrzut ekranu. Pełny przebieg trasy, wszystkie punkty i dokładnie 2 cm marginesu z każdej strony."
          icon={<FileDown className="h-4 w-4" />} onClose={close} />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-[0.95fr_1fr]">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-raised p-4">
            <div className="relative w-full max-w-[235px] border border-line bg-white p-[15px] shadow-sm" style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>
              <div className="flex h-full flex-col border border-dashed border-[#cbd8c5]">
                <span className="truncate px-2 pb-0.5 pt-2 text-[9px] font-extrabold text-[#0d4f3b]" title={brandedHeading("PLAN PODRÓŻY", activeBrand)}>
                  {brandedHeading("PLAN PODRÓŻY", activeBrand)}
                </span>
                {brigadeTitle && (
                  <span className="truncate px-2 text-[7px] font-bold text-[#13221b]">{brigadeTitle}</span>
                )}
                <span className="truncate px-2 text-[6px] text-[#68776c]">{formatDistance(metrics.distance)} · {formatDuration(metrics.duration)}</span>
                <svg viewBox={`0 0 230 ${preview.height}`} className="my-2 min-h-0 flex-1 bg-[#edf1e9]" role="img" aria-label="Podgląd całej trasy do PDF" preserveAspectRatio="xMidYMid meet">
                  <polyline points={preview.points} fill="none" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round" />
                  <polyline points={preview.points} fill="none" stroke="#0d4f3b" strokeWidth="2" strokeLinejoin="round" />
                  {activeWaypoints.map((point, index) => {
                    const [x, y] = preview.projection.toPoint([point.lat, point.lon]);
                    return <circle key={point.id} cx={x} cy={y} r={index === 0 || index === activeWaypoints.length - 1 ? 4 : 2.5} fill={index === 0 ? "#d7f36e" : "#0d4f3b"} stroke="white" strokeWidth="1" />;
                  })}
                </svg>
                <span className="px-2 pb-2 text-[5px] text-[#68776c]">Pełna trasa · {activeWaypoints.length} punktów · OSM / Esri</span>
              </div>
            </div>
            <p className="text-center text-[9px] leading-relaxed text-mute">Automatyczne dopasowanie do kartki.<br />Aktualny zoom mapy nie wpływa na PDF.</p>
            {metrics.customSpeed !== undefined && <p className="text-center text-[10px] font-semibold text-ink-soft">Własna prędkość: {metrics.customSpeed.toLocaleString("pl-PL")} km/h</p>}
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-3.5 disabled:opacity-60">
            <label className="block"><FieldLabel>Nazwa na wydruku (placeholder)</FieldLabel>
              <input
                type="text"
                aria-label="Nazwa na wydruku PDF"
                value={options.customBrandName ?? ""}
                onChange={(e) => patch({ customBrandName: e.target.value.slice(0, 48) })}
                placeholder={`${APP_NAME} (zmień na własną nazwę)`}
                className="mt-1.5 h-9 w-full rounded-lg border border-line bg-raised px-2.5 text-[11px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-mute focus:border-brand"
              />
              <span className="mt-1 block text-[8.5px] leading-snug text-mute">
                Zastępuje placeholder „{APP_NAME}” w nagłówku każdej strony PDF, metadanych i nazwie pliku.
              </span>
            </label>
            <label className="block"><FieldLabel>Format papieru</FieldLabel>
              <select aria-label="Format papieru PDF" value={options.format} onChange={(e) => patch({ format: e.target.value as PdfOptions["format"] })}
                className="mt-1.5 h-9 w-full rounded-lg border border-line bg-raised px-2.5 text-[11px] font-bold text-ink outline-none focus:border-brand">
                <option value="a4">A4 (210 × 297 mm)</option><option value="a3">A3 (297 × 420 mm)</option>
              </select>
            </label>
            <label className="block"><FieldLabel>Orientacja</FieldLabel>
              <select aria-label="Orientacja PDF" value={options.orientation} onChange={(e) => patch({ orientation: e.target.value as PdfOptions["orientation"] })}
                className="mt-1.5 h-9 w-full rounded-lg border border-line bg-raised px-2.5 text-[11px] font-bold text-ink outline-none focus:border-brand">
                <option value="auto">Auto (dopasuj do trasy)</option><option value="portrait">Pionowa</option><option value="landscape">Pozioma</option>
              </select>
            </label>
            <div className="space-y-2.5 border-t border-line pt-3">
              {[
                { key: "includeWaypoints" as const, label: "Pełna lista punktów", detail: "Współrzędne, kilometry i czas od startu przy każdym punkcie." },
                { key: "includeInstructions" as const, label: "Instrukcje krok po kroku", detail: "Wszystkie manewry z Twoim czasem." },
                { key: "background" as const, label: "Podkład mapy", detail: "Jasny i czytelny do wydruku." },
              ].map((item) => (
                <label key={item.key} className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={options[item.key]} onChange={(e) => patch({ [item.key]: e.target.checked })} className="mt-0.5 h-3.5 w-3.5 accent-brand" />
                  <span><span className="block text-[11px] font-bold text-ink">{item.label}</span><span className="block text-[9px] text-mute">{item.detail}</span></span>
                </label>
              ))}
            </div>
            <p className="text-[9px] leading-relaxed text-mute">Margines: <strong className="text-ink">20 mm z każdej strony</strong>. Przy drukowaniu wybierz skalę 100%, bez dodatkowego dopasowania.</p>
          </fieldset>
        </div>
        <div className="border-t border-line bg-raised px-5 py-3">
          {!routeReady && <p role="alert" className="mb-2 text-[10px] text-warning">Sprawdź aktualność trasy oraz poprawność daty i godziny przed eksportem.</p>}
          {error && <p role="alert" className="mb-2 text-[10px] text-danger">{error}</p>}
          {success && <p role="status" className="mb-3 flex items-start gap-2 text-[10px] leading-relaxed text-brand-ink"><Check className="mt-0.5 h-3 w-3 shrink-0" />{success}</p>}
          {busy && <p role="status" aria-live="polite" className="mb-2 flex items-center gap-1.5 text-[10px] text-brand-ink"><Loader2 className="h-3 w-3 animate-spin" />{progress}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button onClick={close} variant="secondary" className="h-9">{busy ? "Anuluj eksport" : "Zamknij"}</Button>
            <Button onClick={() => void download()} loading={busy} disabled={busy || !routeReady} className="h-9">
              {!busy && <Download className="h-3.5 w-3.5" />}{busy ? "Tworzę PDF..." : "Pobierz PDF"}
            </Button>
          </div>
          <p className="mt-2 text-center text-[8px] text-mute">Plik generowany w przeglądarce. Bez konta, kluczy API i płatnych usług.</p>
        </div>
      </div>
    </Dialog>
  );
}
