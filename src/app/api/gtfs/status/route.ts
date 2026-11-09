import { NextResponse } from "next/server";
import { db } from "@/db";
import { gtfsFeeds } from "@/db/schema";
import { ensureGtfsSeeded } from "@/lib/server/gtfsSync";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureGtfsSeeded();
    const [feed] = await db
      .select()
      .from(gtfsFeeds)
      .where(eq(gtfsFeeds.id, "walbrzych"));
    return NextResponse.json({
      ok: true,
      feed: feed ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Błąd odczytu GTFS",
      },
      { status: 500 }
    );
  }
}
