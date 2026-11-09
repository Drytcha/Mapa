import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { db } from "@/db";
import { officialStopsCache } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface OfficialStop {
  id: number;
  name: string;
  symbol: string;
  lat: number;
  lon: number;
  lines: string[];
}

const BASE_URL = "http://rozklad.walbrzych.eu";
const CACHE_ID = "walbrzych-official";
const SNAPSHOT_PATH = path.join(process.cwd(), "src", "data", "walbrzych-official-stops.json");

function readSnapshot(): OfficialStop[] {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as OfficialStop[];
  } catch {
    return [];
  }
}

/** Parses GetMapBusStopList rows: [id, name, symbol, ?, lon, lat, ?, [[0,[routeId,"5",...]],...], ...]. */
function parseMapRows(rows: unknown): OfficialStop[] {
  if (!Array.isArray(rows)) return [];
  const result: OfficialStop[] = [];
  for (const raw of rows) {
    if (!Array.isArray(raw)) continue;
    const lon = Number(raw[4]);
    const lat = Number(raw[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 40 || lon < 10) continue;
    const lines: string[] = [];
    const groups = raw[7];
    if (Array.isArray(groups)) {
      for (const group of groups) {
        const arr = Array.isArray(group) ? (Array.isArray(group[1]) ? group[1] : group) : [];
        for (let i = 0; i + 1 < arr.length; i += 2) {
          if (typeof arr[i + 1] === "string") lines.push(arr[i + 1]);
        }
      }
    }
    result.push({
      id: Number(raw[0]),
      name: String(raw[1]).trim(),
      symbol: String(raw[2]),
      lat,
      lon,
      lines: [...new Set(lines)],
    });
  }
  return result;
}

/**
 * The timetable site requires an "Accept-Language" token that its own script computes in
 * the browser. The script is evaluated here in an isolated VM context with a tiny jQuery stub.
 */
export async function fetchOfficialStopsLive(): Promise<OfficialStop[]> {
  const home = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!home.ok) throw new Error(`rozklad.walbrzych.eu: HTTP ${home.status}`);
  const cookies = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const html = await home.text();
  const scriptMatch = html.match(/src="(\/cache\/js\/[^"]+)"/);
  if (!scriptMatch) throw new Error("Nie znaleziono skryptu tokenu rozkładu.");
  const script = await (
    await fetch(BASE_URL + scriptMatch[1], {
      headers: { Cookie: cookies },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
  ).text();

  const panes = (html.match(/class="[^"]*layout-tab-pane/g) ?? []).length;
  let acceptLanguage = "";
  const jq = Object.assign(
    (selector: string) => ({
      each: (fn: () => void) => {
        const count = selector === ".layout-tab-pane" ? panes : 0;
        for (let i = 0; i < count; i += 1) fn();
      },
    }),
    {
      ajaxSetup: (options: { headers?: Record<string, string> }) => {
        acceptLanguage = options.headers?.["Accept-Language"] ?? "";
      },
    }
  );
  vm.runInNewContext(`${script}\nstartCache();`, {
    window: { navigator: { language: "pl-PL" } },
    navigator: { language: "pl-PL" },
    $: jq,
  });
  if (!acceptLanguage) throw new Error("Nie udało się wyliczyć tokenu rozkładu.");

  const response = await fetch(`${BASE_URL}/Home/GetMapBusStopList?ttId=0`, {
    headers: {
      Cookie: cookies,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/`,
      "Accept-Language": acceptLanguage,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await response.text();
  const stops = parseMapRows(JSON.parse(text));
  if (stops.length < 100) throw new Error("Rozkład zwrócił zbyt mało przystanków.");
  return stops;
}

export async function refreshOfficialStops(): Promise<{ count: number }> {
  const stops = await fetchOfficialStopsLive();
  await db
    .insert(officialStopsCache)
    .values({ id: CACHE_ID, payload: stops, source: "rozklad.walbrzych.eu", fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: officialStopsCache.id,
      set: { payload: stops, source: "rozklad.walbrzych.eu", fetchedAt: new Date() },
    });
  return { count: stops.length };
}

export async function loadOfficialStops(): Promise<{
  stops: OfficialStop[];
  source: string;
  fetchedAt: string | null;
}> {
  try {
    const [row] = await db
      .select()
      .from(officialStopsCache)
      .where(eq(officialStopsCache.id, CACHE_ID));
    if (row && Array.isArray(row.payload) && row.payload.length > 0) {
      return {
        stops: row.payload,
        source: "rozklad.walbrzych.eu (baza)",
        fetchedAt: row.fetchedAt.toISOString(),
      };
    }
  } catch {
    // Fall back to the bundled snapshot
  }
  return { stops: readSnapshot(), source: "rozklad.walbrzych.eu (migawka)", fetchedAt: null };
}
