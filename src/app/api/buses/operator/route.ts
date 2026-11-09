import { NextRequest, NextResponse } from "next/server";
import {
  isOperatorKey,
  loadOperatorOverrides,
  setOperatorOverride,
} from "@/lib/server/fleetOperators";

export const dynamic = "force-dynamic";

export async function GET() {
  const overrides = await loadOperatorOverrides();
  return NextResponse.json({
    ok: true,
    overrides: Array.from(overrides.entries()).map(([vehicleId, operatorKey]) => ({
      vehicleId,
      operatorKey,
    })),
  });
}

/** Body: { vehicleId: string, operatorKey: "mzuk" | "ska" | "other" | null } — null resets to automatic. */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { vehicleId?: unknown; operatorKey?: unknown };
    const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
    if (!vehicleId || vehicleId.length > 32) {
      return NextResponse.json({ ok: false, error: "Nieprawidłowy numer pojazdu." }, { status: 400 });
    }
    if (body.operatorKey !== null && !isOperatorKey(body.operatorKey)) {
      return NextResponse.json({ ok: false, error: "Nieprawidłowy przewoźnik." }, { status: 400 });
    }
    await setOperatorOverride(vehicleId, body.operatorKey as "mzuk" | "ska" | "other" | null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Nie udało się zapisać przypisania.",
      },
      { status: 500 }
    );
  }
}
