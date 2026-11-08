import type { Place, TruckParams, Waypoint } from "./types";

/** Legacy object kept only for old saved-session migration; not used by the fleet UI. */
export const DEFAULT_TRUCK: TruckParams = {
  weight: 40,
  height: 4,
  width: 2.55,
  length: 16.5,
  axles: 5,
  adr: false,
  trailer: true,
};

/** Offline base index: Wałbrzych, its districts and Lower Silesia. */
export const PLACES: Place[] = [
  { id: "w1", label: "Wałbrzych, Rynek, Dolnośląskie, Polska", short: "Wałbrzych · Rynek", lat: 50.7716, lon: 16.2843, source: "local", kind: "Centrum" },
  { id: "w2", label: "Stara Kopalnia, ul. Wysockiego, Wałbrzych, Polska", short: "Stara Kopalnia", lat: 50.7788, lon: 16.2728, source: "local", kind: "Obiekt" },
  { id: "w3", label: "Zamek Książ, Wałbrzych, Dolnośląskie, Polska", short: "Zamek Książ", lat: 50.8231, lon: 16.2931, source: "local", kind: "Zabytek" },
  { id: "w4", label: "Palmiarnia Lubiechowska, Wałbrzych, Polska", short: "Palmiarnia Lubiechowska", lat: 50.817, lon: 16.287, source: "local", kind: "Obiekt" },
  { id: "w5", label: "Wałbrzych Główny, dworzec kolejowy, Polska", short: "Wałbrzych Główny", lat: 50.7795, lon: 16.2905, source: "local", kind: "Dworzec" },
  { id: "w5b", label: "Andersa - Dąbrowskiego, przystanek autobusowy, Wałbrzych, Polska", short: "Andersa - Dąbrowskiego", lat: 50.78741, lon: 16.25577, source: "local", kind: "Przystanek" },
  { id: "w5c", label: "Plac Solidarności - muzeum, przystanek autobusowy, Wałbrzych, Polska", short: "Plac Solidarności - muzeum", lat: 50.76506, lon: 16.27948, source: "local", kind: "Przystanek" },
  { id: "w6", label: "Wałbrzych Miasto, stacja kolejowa, Polska", short: "Wałbrzych Miasto", lat: 50.7745, lon: 16.2812, source: "local", kind: "Dworzec" },
  { id: "w7", label: "Aqua-Zdrój, ul. Ratuszowa, Wałbrzych, Polska", short: "Aqua-Zdrój", lat: 50.7975, lon: 16.3008, source: "local", kind: "Obiekt" },
  { id: "w8", label: "Wałbrzych, Podzamcze, Dolnośląskie, Polska", short: "Podzamcze", lat: 50.802, lon: 16.288, source: "local", kind: "Dzielnica" },
  { id: "w9", label: "Wałbrzych, Piaskowa Góra, Dolnośląskie, Polska", short: "Piaskowa Góra", lat: 50.795, lon: 16.305, source: "local", kind: "Dzielnica" },
  { id: "w10", label: "Wałbrzych, Sobięcin, Dolnośląskie, Polska", short: "Sobięcin", lat: 50.764, lon: 16.253, source: "local", kind: "Dzielnica" },
  { id: "w11", label: "Wałbrzych, Biały Kamień, Dolnośląskie, Polska", short: "Biały Kamień", lat: 50.787, lon: 16.254, source: "local", kind: "Dzielnica" },
  { id: "w12", label: "Wałbrzych, Nowe Miasto, Dolnośląskie, Polska", short: "Nowe Miasto", lat: 50.76, lon: 16.29, source: "local", kind: "Dzielnica" },
  { id: "w13", label: "Wałbrzych, Szczawienko, Dolnośląskie, Polska", short: "Szczawienko", lat: 50.801, lon: 16.311, source: "local", kind: "Dzielnica" },
  { id: "w14", label: "Wałbrzych, Poniatów, Dolnośląskie, Polska", short: "Poniatów", lat: 50.748, lon: 16.276, source: "local", kind: "Dzielnica" },
  { id: "r1", label: "Szczawno-Zdrój, Dolnośląskie, Polska", short: "Szczawno-Zdrój", lat: 50.8272, lon: 16.2516, source: "local", kind: "Uzdrowisko" },
  { id: "r2", label: "Boguszów-Gorce, Dolnośląskie, Polska", short: "Boguszów-Gorce", lat: 50.7533, lon: 16.1969, source: "local", kind: "Miasto" },
  { id: "r3", label: "Chełmiec, szczyt, Dolnośląskie, Polska", short: "Chełmiec (szczyt)", lat: 50.7995, lon: 16.2478, source: "local", kind: "Góra" },
  { id: "r4", label: "Jedlina-Zdrój, Dolnośląskie, Polska", short: "Jedlina-Zdrój", lat: 50.7271, lon: 16.34, source: "local", kind: "Uzdrowisko" },
  { id: "r5", label: "Głuszyca, Dolnośląskie, Polska", short: "Głuszyca", lat: 50.6966, lon: 16.3717, source: "local", kind: "Miasto" },
  { id: "r6", label: "Mieroszów, Dolnośląskie, Polska", short: "Mieroszów", lat: 50.6667, lon: 16.1833, source: "local", kind: "Miasto" },
  { id: "r7", label: "Zamek Grodno, Zagórze Śląskie, Polska", short: "Zamek Grodno", lat: 50.7825, lon: 16.4033, source: "local", kind: "Zabytek" },
  { id: "r8", label: "Świebodzice, Dolnośląskie, Polska", short: "Świebodzice", lat: 50.86, lon: 16.318, source: "local", kind: "Miasto" },
  { id: "r9", label: "Świdnica, Dolnośląskie, Polska", short: "Świdnica", lat: 50.8438, lon: 16.4886, source: "local", kind: "Miasto" },
  { id: "r10", label: "Nowa Ruda, Dolnośląskie, Polska", short: "Nowa Ruda", lat: 50.5803, lon: 16.5042, source: "local", kind: "Miasto" },
  { id: "r11", label: "Kamienna Góra, Dolnośląskie, Polska", short: "Kamienna Góra", lat: 50.7833, lon: 16.0333, source: "local", kind: "Miasto" },
  { id: "r12", label: "Dzierżoniów, Dolnośląskie, Polska", short: "Dzierżoniów", lat: 50.7284, lon: 16.6511, source: "local", kind: "Miasto" },
  { id: "r13", label: "Kłodzko, Dolnośląskie, Polska", short: "Kłodzko", lat: 50.4344, lon: 16.6614, source: "local", kind: "Miasto" },
  { id: "r14", label: "Jelenia Góra, Dolnośląskie, Polska", short: "Jelenia Góra", lat: 50.9044, lon: 15.7197, source: "local", kind: "Miasto" },
  { id: "r15", label: "Legnica, Dolnośląskie, Polska", short: "Legnica", lat: 51.21, lon: 16.1619, source: "local", kind: "Miasto" },
  { id: "r16", label: "Wrocław, Dolnośląskie, Polska", short: "Wrocław", lat: 51.1079, lon: 17.0385, source: "local", kind: "Miasto" },
];

import type { RouteData } from "./types";

export const DEFAULT_BUS_SPEED = 25;

export function createEmptyWaypoint(id: string): Waypoint {
  return {
    id,
    label: "",
    short: "",
    lat: 0,
    lon: 0,
    empty: true,
  };
}

export function isWaypointSet(point?: Waypoint | null): point is Waypoint {
  return Boolean(
    point &&
    !point.empty &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    (point.label.trim().length > 0 || point.lat !== 0 || point.lon !== 0)
  );
}

export function createInitialWaypoints(): Waypoint[] {
  return [
    createEmptyWaypoint("wp-start"),
    createEmptyWaypoint("wp-end"),
  ];
}

export const INITIAL_WAYPOINTS: Waypoint[] = createInitialWaypoints();

export const EMPTY_ROUTE: RouteData = {
  coords: [],
  distance: 0,
  duration: 0,
  steps: [],
  engine: "demo",
  labels: [],
  warnings: [],
};
