import { elapsedAtProgress } from "./schedule";
import type { ProfileMetrics, RouteData, RouteLeg, Waypoint } from "./types";

export interface WaypointProgress {
  point: Waypoint;
  distance: number | null;
  duration: number | null;
}

function routeLegs(route: RouteData, count: number): RouteLeg[] | null {
  const valid = (leg: RouteLeg) => Number.isFinite(leg.distance) && leg.distance >= 0 && Number.isFinite(leg.duration) && leg.duration >= 0;
  if (route.legs?.length === count && route.legs.every(valid)) return route.legs;

  const groups = new Map<number, RouteLeg>();
  for (const step of route.steps) {
    if (!Number.isInteger(step.leg) || step.leg < 0 || step.leg >= count || !valid(step)) continue;
    const total = groups.get(step.leg) ?? { distance: 0, duration: 0 };
    total.distance += step.distance;
    total.duration += step.duration;
    groups.set(step.leg, total);
  }
  if (groups.size !== count) return null;
  return Array.from({ length: count }, (_, index) => groups.get(index)!);
}

/** Cumulative road metrics preserve route order, including loops and repeated coordinates. */
export function waypointProgress(route: RouteData, points: Waypoint[], metrics: ProfileMetrics): WaypointProgress[] {
  if (!points.length) return [];
  const legs = routeLegs(route, points.length - 1);
  const distanceTotal = legs?.reduce((sum, leg) => sum + leg.distance, 0) ?? 0;
  const durationTotal = legs?.reduce((sum, leg) => sum + leg.duration, 0) ?? 0;
  let distance = 0;
  let duration = 0;

  return points.map((point, index) => {
    if (index === 0) return { point, distance: 0, duration: 0 };
    if (index === points.length - 1) return { point, distance: metrics.distance, duration: metrics.duration };
    if (!legs || (distanceTotal === 0 && metrics.distance > 0)) {
      return { point, distance: null, duration: null };
    }
    distance += legs[index - 1].distance;
    duration += legs[index - 1].duration;
    const distanceFraction = distanceTotal > 0 ? distance / distanceTotal : 0;
    const fraction = metrics.customSpeed !== undefined || durationTotal === 0 ? distanceFraction : duration / durationTotal;
    return {
      point,
      distance: distanceFraction * metrics.distance,
      duration: metrics.journey ? elapsedAtProgress(metrics.journey, fraction) : Math.round(fraction * metrics.duration),
    };
  });
}

export function printKilometres(metres: number | null): string {
  return metres === null ? "--" : `${(metres / 1000).toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km`;
}