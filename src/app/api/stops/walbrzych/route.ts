import { NextRequest, NextResponse } from "next/server";
import { refreshOfficialStops } from "@/lib/server/officialStops";
import { getTimetableStops, invalidateTimetableStops } from "@/lib/server/timetableStops";

export const dynamic = "force-dynamic";

/**
 * All stops of the Wałbrzych timetable: GTFS stops merged with the official
 * rozklad.walbrzych.eu list (Andrzejówka, Głuszyca, Mieroszów, Sokołowsko, …).
 * `?refresh=1` re-downloads the official list first.
 */
export async function GET(request: NextRequest) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    let refreshError = "";
    if (refresh) {
      try {
        await refreshOfficialStops();
        invalidateTimetableStops();
      } catch (error) {
        refreshError = error instanceof Error ? error.message : "Nie udało się odświeżyć rozkładu.";
      }
    }
    const { stops, meta } = await getTimetableStops(refresh);
    return NextResponse.json({ ok: true, stops, meta, refreshError: refreshError || undefined });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stops: [],
        error: error instanceof Error ? error.message : "Błąd odczytu przystanków",
      },
      { status: 500 }
    );
  }
}
