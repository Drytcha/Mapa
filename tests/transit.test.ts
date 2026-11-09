import test from "node:test";
import assert from "node:assert/strict";
import { delayTone, describeDelay, formatDelay, formatVehicleNumber } from "../src/lib/delay";
import { findBuses, normalizeDutyCode, OPERATOR_STYLES, serviceForDate } from "../src/lib/transit";
import { assignDuties, type ScheduleTrip } from "../src/lib/server/dutyAssignment";
import type { LiveBusVehicle } from "../src/lib/types";

const trip = (id: string, start: number, end: number, first = "A", last = "B"): ScheduleTrip => ({ rawTripId: id, routeId: "2", routeShort: "2", startMinutes: start, endMinutes: end, firstStopId: first, lastStopId: last });
const stops = new Map([["A", { lat: 50.77, lon: 16.28 }], ["B", { lat: 50.78, lon: 16.29 }], ["far", { lat: 51.2, lon: 17.2 }]]);

test("punctuality uses minus for delay and plus for earliness", () => {
  assert.equal(formatDelay(200), "-3:20");
  assert.equal(formatDelay(60), "-1:00");
  assert.equal(formatDelay(-90), "+1:30");
  assert.equal(formatDelay(-60), "+1:00");
  assert.equal(formatDelay(0), "0:00");
  assert.match(describeDelay(200), /^Opóźnienie/);
  assert.match(describeDelay(-90), /^Przyspieszenie/);
  assert.equal(delayTone(181), "late-high");
  assert.equal(delayTone(180), "late");
  assert.equal(delayTone(-60), "early-small");
  assert.equal(delayTone(-61), "early-big");
});

test("company colours are distinct from punctuality colours", () => {
  assert.equal(OPERATOR_STYLES.mzuk.bg, "#86efac");
  assert.equal(OPERATOR_STYLES.ska.bg, "#c084fc");
  assert.notEqual(OPERATOR_STYLES.mzuk.bg, OPERATOR_STYLES.ska.bg);
  assert.equal(formatVehicleNumber("1"), "#01");
  assert.equal(formatVehicleNumber("404"), "#404");
});

test("GPS codes anchor duties rather than being renumbered by sorting", () => {
  const input = [trip("a", 400, 430), trip("b", 440, 470, "B", "A"), trip("c", 480, 510), trip("d", 600, 630)];
  const result = assignDuties(input, stops, [
    { tripId: "a", routeShort: "2", kursowkaCode: "2/03", brigadeNum: "03" },
    { tripId: "c", routeShort: "2", kursowkaCode: "2/03", brigadeNum: "03" },
    { tripId: "d", routeShort: "2", kursowkaCode: "2/01", brigadeNum: "01" },
  ]);
  assert.deepEqual(result.find((d) => d.kursowkaCode === "2/03")?.trips.map((t) => t.trip.rawTripId), ["a", "b", "c"]);
  assert.equal(result.find((d) => d.kursowkaCode === "2/03")?.source, "gps_estimated");
  assert.equal(result.find((d) => d.kursowkaCode === "2/03")?.trips[1].source, "estimated");
  assert.equal(result.flatMap((d) => d.trips).length, input.length);
  assert.equal(new Set(result.flatMap((d) => d.trips.map((t) => t.trip.rawTripId))).size, input.length);
});

test("unconnected trips stay visible without inventing a numbered duty", () => {
  const result = assignDuties([trip("unknown", 300, 330, "far", "far"), trip("known", 400, 430)], stops, [
    { tripId: "known", routeShort: "2", kursowkaCode: "2/03", brigadeNum: "03" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find((d) => d.source === "unassigned")?.trips[0].trip.rawTripId, "unknown");
  assert.deepEqual(result.filter((d) => d.source !== "unassigned").map((d) => d.kursowkaCode), ["2/03"]);
});

test("overlapping GPS observations keep their numbers and are explicitly flagged", () => {
  const observation = { tripId: "a", routeShort: "2", kursowkaCode: "2/03", brigadeNum: "03" };
  const result = assignDuties([trip("a", 400, 450), trip("b", 420, 470)], stops, [observation, { ...observation, tripId: "b" }]);
  const confirmed = result.find((d) => d.kursowkaCode === "2/03")!;
  assert.equal(confirmed.trips.length, 2);
  assert.equal(confirmed.source, "conflict");
  assert.equal(result.flatMap((d) => d.trips).length, 2);
});

test("search accepts unpadded duty codes and fleet numbers", () => {
  const bus = { vehicleId: "404", kursowka: "A/02", routeName: "A", operatorName: "ŚKA" } as LiveBusVehicle;
  assert.equal(normalizeDutyCode(" a / 2 "), "A/02");
  assert.deepEqual(findBuses([bus], "a/2").map((b) => b.vehicleId), ["404"]);
  assert.deepEqual(findBuses([bus], "#404").map((b) => b.vehicleId), ["404"]);
  assert.equal(findBuses([bus], "2/03").length, 0);
});

test("holiday calendar takes precedence over weekday fallback", () => {
  const services = [{ serviceId: "weekday", datesJson: [20261109] }, { serviceId: "sunday", datesJson: [20261111] }];
  assert.equal(serviceForDate(services, 20261111, 3), "sunday");
  assert.equal(serviceForDate(services, 20261114, 6), "saturday");
});
