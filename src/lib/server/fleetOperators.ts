import { db } from "@/db";
import { vehicleOperatorOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { WalbrzychOperatorKey } from "@/lib/types";

export const OPERATOR_NAMES: Record<WalbrzychOperatorKey, string> = {
  mzuk: "MZUK Sp. z o.o.",
  ska: "Śląskie Konsorcjum Autobusowe (ŚKA)",
  other: "Inny / nieprzypisany",
};

export type OperatorOverrides = Map<string, WalbrzychOperatorKey>;

/**
 * Automatic assignment by fleet (side) number, based on the published fleet lists:
 *  - MZUK:  01–20 Solaris Urbino 12 hydrogen (to 45 with the purchase option),
 *           201–204 Solaris Urbino 12 / Mercedes Conecto LF (2025)
 *  - ŚKA:   3xx (Solaris Urbino 12/18, eCitaro) and 4xx (Mercedes O530G CNG),
 *           5xx (additional / leased vehicles)
 *  - ZDKiUM no longer runs vehicles (it was liquidated on 1 Jan 2025 – it was the organiser).
 * Anything else is "other" and can be assigned manually.
 */
export function classifyVehicleNumber(
  vehicleId: string,
  model?: string | null
): WalbrzychOperatorKey {
  if (model?.toLowerCase().includes("hydrogen")) return "mzuk";
  const num = Number.parseInt(vehicleId, 10);
  if (!Number.isFinite(num)) return "other";
  if (num >= 1 && num <= 45) return "mzuk";
  if (num >= 200 && num <= 299) return "mzuk";
  if (num >= 300 && num <= 599) return "ska";
  return "other";
}

export function resolveWalbrzychOperator(
  vehicleId: string,
  model?: string | null,
  overrides?: OperatorOverrides
): { key: WalbrzychOperatorKey; name: string; source: "auto" | "manual" } {
  const manual = overrides?.get(vehicleId);
  if (manual) return { key: manual, name: OPERATOR_NAMES[manual], source: "manual" };
  const key = classifyVehicleNumber(vehicleId, model);
  const hydrogen = key === "mzuk" && model?.toLowerCase().includes("hydrogen");
  return {
    key,
    name: hydrogen ? `${OPERATOR_NAMES.mzuk} (wodorowy)` : OPERATOR_NAMES[key],
    source: "auto",
  };
}

const isOperatorKey = (value: unknown): value is WalbrzychOperatorKey =>
  value === "mzuk" || value === "ska" || value === "other";

let overridesCache: { at: number; map: OperatorOverrides } | null = null;
const OVERRIDES_TTL_MS = 20_000;

export async function loadOperatorOverrides(): Promise<OperatorOverrides> {
  if (overridesCache && Date.now() - overridesCache.at < OVERRIDES_TTL_MS) {
    return overridesCache.map;
  }
  const map: OperatorOverrides = new Map();
  try {
    const rows = await db.select().from(vehicleOperatorOverrides);
    for (const row of rows) {
      if (isOperatorKey(row.operatorKey)) map.set(row.vehicleId, row.operatorKey);
    }
  } catch {
    // Fall back to the automatic rules when the table is unavailable
  }
  overridesCache = { at: Date.now(), map };
  return map;
}

export async function setOperatorOverride(
  vehicleId: string,
  operatorKey: WalbrzychOperatorKey | null
): Promise<void> {
  if (operatorKey === null) {
    await db.delete(vehicleOperatorOverrides).where(eq(vehicleOperatorOverrides.vehicleId, vehicleId));
  } else {
    await db
      .insert(vehicleOperatorOverrides)
      .values({ vehicleId, operatorKey, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: vehicleOperatorOverrides.vehicleId,
        set: { operatorKey, updatedAt: new Date() },
      });
  }
  overridesCache = null;
}

export { isOperatorKey };
