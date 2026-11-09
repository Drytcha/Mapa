import { NextRequest, NextResponse } from "next/server";
import { getLiveWalbrzychBuses } from "@/lib/server/gtfsRt";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    const data = await getLiveWalbrzychBuses(force);
    return NextResponse.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        vehicles: [],
        traffic: null,
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać pozycji GPS autobusów Wałbrzych.",
      },
      { status: 502 }
    );
  }
}
