const env = import.meta.env ?? {};

// Public endpoints are best-effort. A self-hosted instance needs no API key either.
export const ROUTING_URL = (env.VITE_OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
/** OSRM profile segment: `driving` on public OSRM, `bus` on a self-hosted bus graph. */
export const ROUTING_PROFILE = (env.VITE_OSRM_PROFILE || "driving").replace(/[^a-z0-9_-]/gi, "") || "driving";
/** Optional separate endpoint for a self-hosted bus OSRM; falls back to ROUTING_URL. */
export const BUS_ROUTING_URL = (env.VITE_OSRM_BUS_URL || ROUTING_URL).replace(/\/$/, "");
export const GEOCODING_URL = (env.VITE_NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
export const OVERPASS_URL = (env.VITE_OVERPASS_URL || "https://overpass-api.de/api/interpreter").replace(/\/$/, "");

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export interface TileSource {
  base: string;
  labels?: string;
  attribution: string;
  printAttribution: string;
  maxZoom: number;
}

export const TILES: Record<"osm" | "light" | "dark" | "satellite", TileSource> = {
  // Detailed OSM basemap: real streets and footways, so stop markers sit on mapped geometry.
  osm: {
    base: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    printAttribution: "Mapa i dane: © OpenStreetMap contributors. openstreetmap.org/copyright",
    maxZoom: 19,
  },
  light: {
    base: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    printAttribution: "Mapa: Esri, HERE, Garmin; dane: © OpenStreetMap contributors. openstreetmap.org/copyright",
    maxZoom: 16,
  },
  dark: {
    base: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    printAttribution: "Mapa: Esri, HERE, Garmin; dane: © OpenStreetMap contributors. openstreetmap.org/copyright",
    maxZoom: 16,
  },
  satellite: {
    base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, GIS User Community",
    printAttribution: "Mapa: Esri, Maxar, Earthstar Geographics, GIS User Community.",
    maxZoom: 18,
  },
};
