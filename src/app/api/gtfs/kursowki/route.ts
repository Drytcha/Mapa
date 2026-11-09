import { NextRequest, NextResponse } from "next/server";
import { getDutyCatalog } from "@/lib/server/kursowkiCatalog";

export const dynamic = "force-dynamic";

/** Omit routeId for the complete directory. serviceId=all includes every day type. */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const routeId = params.get("routeId")?.trim() || undefined;
    const serviceId = params.get("serviceId")?.trim() || "weekday";
    if (!["all", "weekday", "saturday", "sunday"].includes(serviceId)) {
      return NextResponse.json({ ok: false, error: "Nieznany typ dnia." }, { status: 400 });
    }
    const catalog = await getDutyCatalog({ routeId, serviceId });
    if (routeId && !catalog.routes.some((route) => route.id === routeId)) {
      return NextResponse.json({ ok: false, error: "Nie znaleziono linii." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      route: catalog.routes.find((route) => route.id === routeId) ?? null,
      serviceId,
      kursowki: catalog.items,
      liveError: catalog.liveError,
    });
  } catch (error) {
    console.error("Duty catalog:", error);
    return NextResponse.json({ ok: false, error: "Nie udało się odczytać katalogu kursówek. Spróbuj ponownie." }, { status: 500 });
  }
}
