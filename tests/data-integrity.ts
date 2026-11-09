import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "../src/db";
import { gtfsKursowki, gtfsServices, gtfsStopTimes, gtfsTrips, liveTripBrigades } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { syncWalbrzychGtfs } from "../src/lib/server/gtfsSync";

async function main() {
  await syncWalbrzychGtfs({ forceLive: false });
  const files = unzipSync(fs.readFileSync("src/data/walbrzych-gtfs.zip"));
  const csv = (name: string) => strFromU8(files[name]).trim().split(/\r?\n/).slice(1).map((line) => line.split(","));
  const rawTrips = csv("trips.txt");
  const rawTimes = csv("stop_times.txt");
  const rawCalendar = csv("calendar_dates.txt");
  const [services, duties, trips, observations] = await Promise.all([
    db.select().from(gtfsServices), db.select().from(gtfsKursowki), db.select().from(gtfsTrips), db.select().from(liveTripBrigades),
  ]);
  const stopCounts = await db.select({ tripId: gtfsStopTimes.tripId, n: sql<number>`count(*)::int` }).from(gtfsStopTimes).groupBy(gtfsStopTimes.tripId);
  const stopCountMap = new Map(stopCounts.map((row) => [row.tripId, Number(row.n)]));
  const rawTimeCounts = new Map<string, number>();
  for (const row of rawTimes) rawTimeCounts.set(row[0], (rawTimeCounts.get(row[0]) ?? 0) + 1);
  const observationsByTrip = new Map(observations.map((row) => [row.tripId, row]));
  let total = 0;
  for (const service of services) {
    const firstDate = String(service.datesJson[0]);
    const rawIds = new Set(rawCalendar.filter((row) => row[1] === firstDate && row[2] === "1").map((row) => row[0]));
    const expected = rawTrips.filter((row) => rawIds.has(row[2]));
    const actual = trips.filter((trip) => trip.serviceId === service.serviceId);
    assert.equal(actual.length, expected.length, `${service.serviceId}: trip count`);
    assert.equal(new Set(actual.map((trip) => trip.id)).size, actual.length, "unique trip IDs");
    for (const raw of expected) {
      const trip = actual.find((item) => item.id === `${raw[0]}_${service.serviceId}`);
      assert.ok(trip, `missing trip ${raw[0]}`);
      assert.equal(stopCountMap.get(trip.id), rawTimeCounts.get(raw[0]), `stop times for ${raw[0]}`);
      const observation = observationsByTrip.get(raw[0]);
      if (observation) assert.equal(trip.kursowkaCode, observation.kursowkaCode, `GPS duty mismatch for ${raw[0]}`);
    }
    const dayDuties = duties.filter((duty) => duty.serviceId === service.serviceId);
    assert.equal(dayDuties.reduce((sum, duty) => sum + duty.tripCount, 0), actual.length, "duty counts equal trip count");
    for (const duty of dayDuties) {
      const assigned = actual.filter((trip) => trip.kursowkaId === duty.id).sort((a, b) => a.startMinutes - b.startMinutes);
      assert.equal(assigned.length, duty.tripCount);
      if (duty.brigadeNum !== "?" && duty.source !== "conflict") for (let i = 1; i < assigned.length; i++) assert.ok(assigned[i].startMinutes >= assigned[i - 1].endMinutes, `overlapping duty ${duty.kursowkaCode}`);
    }
    total += actual.length;
    console.log(`${service.serviceId}: ${actual.length} trips, ${dayDuties.length} directory entries, all stop times preserved`);
  }
  assert.equal(total, 2202);
  const base = process.env.PREVIEW_URL || "http://127.0.0.1:3000";
  for (const routeId of ["2", "4", "ex"]) {
    const response = await fetch(`${base}/api/gtfs/kursowki?routeId=${routeId}&serviceId=sunday`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.serviceId, "sunday", "never silently substitute weekday");
    const expected = duties.filter((duty) => duty.routeId === routeId && duty.serviceId === "sunday").reduce((sum, duty) => sum + duty.tripCount, 0);
    assert.equal(json.kursowki.reduce((sum: number, duty: { tripCount: number }) => sum + duty.tripCount, 0), expected);
  }
  const vanishedResponse = await fetch(`${base}/api/gtfs/kursowka?id=${encodeURIComponent("live|2|2/999")}&serviceId=sunday`);
  const vanished = await vanishedResponse.json();
  assert.equal(vanishedResponse.status, 200, "a GPS-only duty remains readable after its bus leaves the feed");
  assert.equal(vanished.kursowka.hasSchedule, false);
  assert.equal(vanished.trips.length, 0);
  assert.ok(vanished.notice);
  const all = await fetch(`${base}/api/gtfs/kursowki?serviceId=all`).then((response) => response.json());
  assert.ok(all.ok && all.kursowki.length >= duties.length);
  assert.equal(new Set(all.kursowki.map((duty: { id: string }) => duty.id)).size, all.kursowki.length);
  console.log(`PASS: ${total} timetable trips and ${all.kursowki.length} searchable directory entries`);
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
