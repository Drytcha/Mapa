import { NextResponse } from "next/server";
import { syncWalbrzychGtfs } from "@/lib/server/gtfsSync";
import { refreshOfficialStops } from "@/lib/server/officialStops";
import { invalidateTimetableStops } from "@/lib/server/timetableStops";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncWalbrzychGtfs({ forceLive: true });
    // The official stop list (rozklad.walbrzych.eu) is refreshed best-effort alongside GTFS
    let officialStops: number | null = null;
    try {
      officialStops = (await refreshOfficialStops()).count;
    } catch {
      officialStops = null;
    }
    invalidateTimetableStops();
    return NextResponse.json({ ok: true, ...result, officialStops });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać najnowszego Wałbrzych GTFS.",
      },
      { status: 500 }
    );
  }
}
