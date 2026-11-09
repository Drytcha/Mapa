/**
 * The open GPS feed carries no speed, so it is derived from two consecutive GPS fixes
 * of the same vehicle (source timestamps, not request times). The history lives in
 * memory of the server process; speeds appear after the second distinct fix (~20–40 s).
 */
interface Fix {
  lat: number;
  lon: number;
  ts: number;
  speed: number | null;
  seenAt: number;
}

const history = new Map<string, Fix>();

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function trackSpeed(
  vehicleId: string,
  lat: number,
  lon: number,
  ts: number
): number | null {
  const now = Date.now();
  const prev = history.get(vehicleId);
  if (!prev) {
    history.set(vehicleId, { lat, lon, ts, speed: null, seenAt: now });
    return null;
  }
  prev.seenAt = now;
  // Same or older fix: keep the last known value
  if (ts <= prev.ts) return prev.speed;

  const dt = (ts - prev.ts) / 1000;
  if (dt > 180) {
    // Too old to be meaningful, restart tracking
    history.set(vehicleId, { lat, lon, ts, speed: null, seenAt: now });
    return null;
  }
  if (dt < 4) return prev.speed;

  const d = distanceMeters(prev.lat, prev.lon, lat, lon);
  let instant = d < 6 ? 0 : (d / dt) * 3.6;
  instant = Math.min(instant, 90);
  const smoothed = prev.speed === null ? instant : prev.speed * 0.35 + instant * 0.65;
  history.set(vehicleId, { lat, lon, ts, speed: smoothed, seenAt: now });
  return smoothed;
}

export function pruneSpeedHistory(maxAgeMs = 10 * 60_000): void {
  const limit = Date.now() - maxAgeMs;
  for (const [id, fix] of history) {
    if (fix.seenAt < limit) history.delete(id);
  }
}
