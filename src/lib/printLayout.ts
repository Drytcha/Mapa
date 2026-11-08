export interface PdfOptions {
  format: "a4" | "a3";
  orientation: "auto" | "portrait" | "landscape";
  includeWaypoints: boolean;
  includeInstructions: boolean;
  background: boolean;
  customBrandName?: string;
}

export const PDF_MARGIN_MM = 20;
export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  format: "a4",
  orientation: "auto",
  includeWaypoints: true,
  includeInstructions: false,
  background: true,
  customBrandName: "",
};

type Coordinate = [number, number];

function worldPoint([lat, lon]: Coordinate, anchor: number): Coordinate {
  let x = (lon + 180) / 360;
  while (x - anchor > 0.5) x -= 1;
  while (x - anchor < -0.5) x += 1;
  const sine = Math.sin(Math.max(-85.051128, Math.min(85.051128, lat)) * Math.PI / 180);
  return [x, 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)];
}

export function createMapProjection(coords: Coordinate[], width: number, height: number, padding = 32) {
  if (!coords.length || width <= padding * 2 || height <= padding * 2) throw new Error("Nieprawidłowy obszar mapy.");
  const anchor = (coords[0][1] + 180) / 360;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const coord of coords) {
    if (!coord.every(Number.isFinite)) throw new Error("Nieprawidłowe współrzędne trasy.");
    const [x, y] = worldPoint(coord, anchor);
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  const spanX = Math.max(1e-8, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-8, bounds.maxY - bounds.minY);
  const zoom = Math.min(16, Math.log2(Math.min((width - padding * 2) / (spanX * 256), (height - padding * 2) / (spanY * 256))));
  const worldSize = 256 * 2 ** zoom;
  const origin: Coordinate = [
    (bounds.minX + bounds.maxX) / 2 * worldSize - width / 2,
    (bounds.minY + bounds.maxY) / 2 * worldSize - height / 2,
  ];
  return {
    bounds, zoom, nativeZoom: Math.max(0, Math.floor(zoom)), origin, width, height,
    toPoint: (coord: Coordinate): Coordinate => {
      const [x, y] = worldPoint(coord, anchor);
      return [x * worldSize - origin[0], y * worldSize - origin[1]];
    },
  };
}

export function getPdfLayout(options: PdfOptions, coords: Coordinate[]) {
  const projection = createMapProjection(coords, 1000, 1000);
  const { bounds } = projection;
  const orientation = options.orientation === "auto"
    ? (bounds.maxX - bounds.minX > (bounds.maxY - bounds.minY) * 1.15 ? "landscape" : "portrait")
    : options.orientation;
  const short = options.format === "a3" ? 297 : 210;
  const long = options.format === "a3" ? 420 : 297;
  const width = orientation === "landscape" ? long : short;
  const height = orientation === "landscape" ? short : long;
  return {
    orientation, width, height, margin: PDF_MARGIN_MM,
    map: { x: PDF_MARGIN_MM, y: 49, width: width - PDF_MARGIN_MM * 2, height: height - 49 - PDF_MARGIN_MM - 16 },
  };
}