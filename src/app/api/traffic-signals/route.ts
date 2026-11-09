import { NextRequest, NextResponse } from "next/server";
import { detectTrafficSignalsAlongRoute } from "@/lib/server/trafficSignals";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { coords?: unknown };
    if (!Array.isArray(body?.coords) || body.coords.length < 2) {
      return NextResponse.json({
        ok: true,
        intersections: [],
        count: 0,
        source: "empty",
      });
    }
    const coords = body.coords.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) &&
        pt.length >= 2 &&
        typeof pt[0] === "number" &&
        typeof pt[1] === "number"
    );
    const result = await detectTrafficSignalsAlongRoute(coords);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        intersections: [],
        count: 0,
        error:
          error instanceof Error
            ? error.message
            : "Błąd analizy sygnalizacji świetlnej.",
      },
      { status: 500 }
    );
  }
}
