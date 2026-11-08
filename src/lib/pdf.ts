import { jsPDF } from "jspdf";
import { APP_NAME, brandedHeading, PRINT_TITLE_TEMPLATE, resolveBrandPlaceholders, routeFilename } from "../config/branding";
import { formatBrigadeTitle } from "./brigade";
import { LATO_REGULAR_TTF } from "./latoFont";
import { formatDistance, formatDuration } from "./geo";
import { createMapProjection, getPdfLayout, type PdfOptions } from "./printLayout";
import { TILES } from "./services";
import type { BrigadeInfo, ProfileMetrics, RouteData, VehicleId, Waypoint } from "./types";
import { printKilometres, waypointProgress } from "./waypointProgress";

interface PdfInput {
  route: RouteData;
  waypoints: Waypoint[];
  metrics: ProfileMetrics;
  vehicle: VehicleId;
  brigade?: BrigadeInfo;
  options: PdfOptions;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000);
const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};

async function renderMap(input: PdfInput, layout: ReturnType<typeof getPdfLayout>) {
  const { route, waypoints, options, signal, onProgress } = input;
  const width = 1100;
  const height = Math.round(width * layout.map.height / layout.map.width);
  const coords: [number, number][] = [...route.coords, ...waypoints.map((p) => [p.lat, p.lon] as [number, number])];
  const projection = createMapProjection(coords, width, height, 42);
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ta przeglądarka nie obsługuje eksportu mapy.");
  ctx.scale(2, 2);
  ctx.fillStyle = "#eef1eb";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dce3d7";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= width; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y <= height; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  let missingTiles = 0;
  if (options.background) {
    const tileScale = 2 ** (projection.zoom - projection.nativeZoom);
    const tileSize = 256 * tileScale;
    const x0 = Math.floor(projection.origin[0] / tileSize);
    const y0 = Math.floor(projection.origin[1] / tileSize);
    const x1 = Math.floor((projection.origin[0] + width) / tileSize);
    const y1 = Math.floor((projection.origin[1] + height) / tileSize);
    const count = 2 ** projection.nativeZoom;
    const tiles: { x: number; y: number }[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (y >= 0 && y < count) tiles.push({ x, y });
      }
    }
    // A single overview only, not a multi-zoom or offline tile archive.
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 16000);
    let completed = 0;
    const loadLayer = async (template: string) => {
      let next = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < tiles.length) {
          checkAbort(signal);
          const tile = tiles[next++];
          const x = ((tile.x % count) + count) % count;
          const url = template.replace("{z}", String(projection.nativeZoom)).replace("{x}", String(x)).replace("{y}", String(tile.y));
          try {
            const response = await fetch(url, { mode: "cors", signal: controller.signal });
            if (!response.ok) throw new Error("Tile unavailable");
            const blob = await response.blob();
            const image = await createImageBitmap(blob);
            ctx.drawImage(image, tile.x * tileSize - projection.origin[0], tile.y * tileSize - projection.origin[1], tileSize + 0.5, tileSize + 0.5);
            image.close();
          } catch {
            checkAbort(signal);
            missingTiles += 1;
          }
          completed += 1;
          onProgress?.(`Przygotowuję podkład mapy (${completed}/${tiles.length * 2})...`);
        }
      }));
    };
    try {
      // The printable basemap stays on the light Esri layer, not the interactive OSM tiles.
      await loadLayer(TILES.light.base);
      if (TILES.light.labels) await loadLayer(TILES.light.labels);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }

  checkAbort(signal);
  onProgress?.("Rysuję całą trasę i wszystkie punkty...");
  const line = (color: string, weight: number) => {
    ctx.beginPath();
    route.coords.forEach((coord, index) => {
      const [x, y] = projection.toPoint(coord);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  };
  line("#ffffff", 9);
  line("#0d4f3b", 4.5);
  waypoints.forEach((point, index) => {
    const [x, y] = projection.toPoint([point.lat, point.lon]);
    const end = index === waypoints.length - 1;
    const start = index === 0;
    ctx.beginPath();
    ctx.arc(x, y, start || end ? 13 : 10, 0, Math.PI * 2);
    ctx.fillStyle = start ? "#d7f36e" : end ? "#0d4f3b" : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0d4f3b";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = end ? "#ffffff" : "#0d4f3b";
    ctx.fillText(start ? "A" : end ? "B" : String(index), x, y + 0.5);
  });
  return { canvas, missingTiles };
}

export async function createRoutePdf(input: PdfInput) {
  const { route, waypoints, metrics, vehicle, brigade, options, signal, onProgress } = input;
  if (route.engine !== "osrm" || route.coords.length < 2) throw new Error("Najpierw wyznacz trasę drogową.");
  checkAbort(signal);
  const brandName = options.customBrandName?.trim() || APP_NAME;
  const brigadeTitle = formatBrigadeTitle(brigade);
  const allCoords: [number, number][] = [...route.coords, ...waypoints.map((p) => [p.lat, p.lon] as [number, number])];
  const layout = getPdfLayout(options, allCoords);
  const { width, height, margin, map } = layout;
  const contentWidth = width - margin * 2;
  onProgress?.("Przygotowuję dokument z marginesem 20 mm...");
  const doc = new jsPDF({ orientation: layout.orientation, unit: "mm", format: options.format, compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS("Lato-Regular.ttf", LATO_REGULAR_TTF);
  doc.addFont("Lato-Regular.ttf", "Lato", "normal");
  doc.setFont("Lato", "normal");
  doc.setProperties({
    title: resolveBrandPlaceholders(PRINT_TITLE_TEMPLATE, brandName),
    author: brandName,
    creator: brandName,
    subject: brigadeTitle || "Plan przejazdu",
  });

  const fitText = (text: string, x: number, y: number, maxWidth: number, fontSize = 11) => {
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(text) > maxWidth && fontSize > 6) { fontSize -= 0.5; doc.setFontSize(fontSize); }
    const lines = doc.splitTextToSize(clean(text), maxWidth) as string[];
    doc.text(lines[0] || "", x, y);
  };

  doc.setTextColor("#0d4f3b");
  fitText(brandedHeading("PLAN PODRÓŻY", brandName), margin, 26, contentWidth, 20);
  doc.setTextColor("#13221b");
  const routeHeadline = brigadeTitle
    ? `${brigadeTitle}  |  ${clean(waypoints[0].short)} > ${clean(waypoints[waypoints.length - 1].short)}`
    : `${clean(waypoints[0].short)} > ${clean(waypoints[waypoints.length - 1].short)}`;
  fitText(routeHeadline, margin, 34, contentWidth, 12);
  const profile = metrics.name ?? vehicle;
  const timeModel = metrics.customSpeed === undefined ? "czas orientacyjny" : `Własna prędkość: ${metrics.customSpeed.toLocaleString("pl-PL")} km/h`;
  fitText(`${profile}  |  ${formatDistance(metrics.distance)}  |  ${formatDuration(metrics.duration)}  |  ${timeModel}  |  ${waypoints.length} punktów`, margin, 42, contentWidth, 9);

  const { canvas, missingTiles } = await renderMap(input, layout);
  checkAbort(signal);
  doc.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", map.x, map.y, map.width, map.height, undefined, "FAST");
  doc.setDrawColor("#d2dccf");
  doc.setLineWidth(0.2);
  doc.rect(map.x, map.y, map.width, map.height);

  const warning = missingTiles > 0
    ? "Podkład mapy niepełny lub niedostępny. Cała geometria trasy i wszystkie punkty są zachowane."
    : !options.background ? "Schemat bez podkładu. Cała geometria trasy i wszystkie punkty są zachowane."
      : "Cała trasa na jednej mapie, niezależnie od widoku w aplikacji. A: start, B: meta, numery: przystanki.";
  doc.setTextColor(missingTiles ? "#946114" : "#586b60");
  fitText(warning, margin, map.y + map.height + 5, contentWidth, 7.5);

  let y = 0;
  const newSectionPage = (heading: string) => {
    doc.addPage(options.format, layout.orientation);
    doc.setTextColor("#0d4f3b");
    const pageHeading = brigadeTitle ? `${heading} · ${brigadeTitle}` : heading;
    fitText(brandedHeading(pageHeading, brandName), margin, 27, contentWidth, 17);
    doc.setDrawColor("#d2dccf");
    doc.line(margin, 31, width - margin, 31);
    y = 39;
  };
  const bottom = height - margin - 15;
  const row = (label: string, text: string, detail: string, heading: string) => {
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(clean(text), contentWidth - 65) as string[];
    let offset = 0;
    do {
      if (bottom - y < 13) newSectionPage(`${heading} (cd.)`);
      const capacity = Math.max(1, Math.floor((bottom - y - 4) / 4.4));
      const part = lines.slice(offset, offset + capacity);
      const rowHeight = Math.max(13, part.length * 4.4 + 4);
      doc.setFontSize(9);
      doc.setTextColor("#0d4f3b");
      doc.text(offset === 0 ? label : "cd.", margin, y);
      doc.setTextColor("#13221b");
      doc.setFontSize(9.5);
      doc.text(part, margin + 12, y, { lineHeightFactor: 1.3 });
      if (offset === 0) {
        doc.setTextColor("#68776c");
        doc.setFontSize(8);
        const details = doc.splitTextToSize(detail, 48) as string[];
        doc.text(details, width - margin - 48, y, { lineHeightFactor: 1.3 });
      }
      y += rowHeight;
      doc.setDrawColor("#e3e9e0");
      doc.line(margin, y - 4, width - margin, y - 4);
      offset += part.length;
    } while (offset < lines.length);
  };

  if (options.includeWaypoints) {
    onProgress?.("Dodaję pełną listę przystanków...");
    const endX = width - margin;
    const coordinatesX = endX - 109;
    const distanceRight = endX - 36;
    const addressX = margin + 10;
    const addressWidth = coordinatesX - addressX - 4;
    const progress = waypointProgress(route, waypoints, metrics);
    const waypointPage = (continuation = false) => {
      newSectionPage(`Wszystkie punkty (${waypoints.length})${continuation ? " (cd.)" : ""}`);
      doc.setFillColor("#edf1e9");
      doc.rect(margin, 35, contentWidth, 10, "F");
      doc.setTextColor("#4d6254");
      doc.setFontSize(8);
      doc.text("Punkt / adres", margin + 1, 41);
      doc.text("Współrzędne", coordinatesX, 41);
      doc.text("Km od startu", distanceRight, 41, { align: "right" });
      doc.text("Czas od startu", endX - 1, 41, { align: "right" });
      y = 53;
    };
    waypointPage();
    progress.forEach((item, index) => {
      const { point } = item;
      const label = index === 0 ? "A" : index === waypoints.length - 1 ? "B" : String(index);
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(clean(point.label), addressWidth) as string[];
      let offset = 0;
      do {
        if (bottom - y < 14) waypointPage(true);
        const capacity = Math.max(1, Math.floor((bottom - y - 5) / 4.5));
        const part = lines.slice(offset, offset + capacity);
        const rowHeight = Math.max(14, part.length * 4.5 + 5);
        doc.setFontSize(9);
        doc.setTextColor("#0d4f3b");
        doc.text(offset === 0 ? label : "cd.", margin + 1, y);
        doc.setTextColor("#13221b");
        doc.setFontSize(9.5);
        doc.text(part, addressX, y, { lineHeightFactor: 1.3 });
        doc.setFontSize(8);
        doc.setTextColor("#68776c");
        doc.text(`${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`, coordinatesX, y);
        doc.setTextColor("#13221b");
        const distance = printKilometres(item.distance);
        doc.setFontSize(8.5);
        while (doc.getTextWidth(distance) > 29 && doc.getFontSize() > 6) doc.setFontSize(doc.getFontSize() - 0.5);
        doc.text(distance, distanceRight, y, { align: "right" });
        doc.setFontSize(8.5);
        const duration = item.duration === null ? "--" : formatDuration(item.duration);
        while (doc.getTextWidth(duration) > 33 && doc.getFontSize() > 6) doc.setFontSize(doc.getFontSize() - 0.5);
        doc.text(duration, endX - 1, y, { align: "right" });
        y += rowHeight;
        doc.setDrawColor("#e3e9e0");
        doc.line(margin, y - 4, endX, y - 4);
        offset += part.length;
      } while (offset < lines.length);
    });
  }
  if (options.includeInstructions && route.steps.length) {
    onProgress?.("Dodaję instrukcje przejazdu...");
    newSectionPage("Instrukcje przejazdu");
    route.steps.forEach((step, index) => row(String(index + 1), step.instruction, `${formatDistance(step.distance)}\n${formatDuration(step.duration)}`, "Instrukcje przejazdu"));
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setTextColor("#68776c");
    // One legible credit by the map satisfies attribution without repeating long footers.
    if (page === 1) {
      const credit = options.background
        ? "© Esri, HERE, Garmin | © OpenStreetMap contributors | openstreetmap.org/copyright"
        : "© OpenStreetMap contributors | openstreetmap.org/copyright";
      fitText(credit, margin, height - margin - 1, contentWidth - 16, 7.5);
    }
    doc.setFontSize(7);
    doc.text(`${page}/${pageCount}`, width - margin, height - margin - 1, { align: "right" });
  }
  checkAbort(signal);
  return { doc, missingTiles, pageCount, layout };
}

export async function exportRoutePdf(input: PdfInput) {
  const result = await createRoutePdf(input);
  checkAbort(input.signal);
  input.onProgress?.("Zapisuję plik PDF...");
  const brandName = input.options.customBrandName?.trim() || APP_NAME;
  const brigadeTitle = formatBrigadeTitle(input.brigade);
  await result.doc.save(
    routeFilename(input.waypoints[0].short, input.waypoints[input.waypoints.length - 1].short, "pdf", brigadeTitle, brandName),
    { returnPromise: true }
  );
  return { missingTiles: result.missingTiles, pageCount: result.pageCount };
}