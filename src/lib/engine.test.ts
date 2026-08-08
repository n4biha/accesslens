import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeMemory,
  analyzeSwitching,
  analyzeText,
  analyzeTiming,
  WORKING_MEMORY_CAPACITY,
} from "./engine";
import type { Analysis, Step } from "./schema";

/**
 * A hand-built fixture with dependencies chosen so every metric has one
 * correct answer that can be worked out on paper. If the engine drifts, these
 * break before anything reaches an educator.
 *
 * Journey: Canvas -> PhET -> Canvas -> Docs -> Canvas
 * Five values are produced in the simulation, do not stay visible, and are not
 * needed until the written explanation two steps later.
 */

function step(overrides: Partial<Step> & Pick<Step, "id" | "environment">): Step {
  return {
    action: "does something",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    evidence: "",
    goalRelevance: "unknown",
    relevanceReason: "",
    repair: null,
    ...overrides,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
      ...overrides.demands,
    },
  } as Step;
}

const VALUES = ["trial_1", "trial_2", "trial_3", "trial_4", "trial_5"];

const steps: Step[] = [
  step({
    id: "s1",
    environment: "Canvas",
    demands: { wordCount: 120 } as Step["demands"],
  }),
  step({
    id: "s2",
    environment: "PhET",
    produces: VALUES,
    producedInfoStaysVisible: false,
    demands: { contextSwitch: true, fineMotor: 3 } as Step["demands"],
  }),
  step({
    id: "s3",
    environment: "Canvas",
    demands: { contextSwitch: true, wordCount: 30 } as Step["demands"],
  }),
  step({
    id: "s4",
    environment: "Docs",
    consumes: VALUES,
    demands: { contextSwitch: true, communication: "typed" } as Step["demands"],
  }),
  step({
    id: "s5",
    environment: "Canvas",
    demands: { contextSwitch: true } as Step["demands"],
  }),
];

const analysis: Analysis = {
  timeLimitMinutes: 5,
  steps,
  frictionMoments: [],
};

test("liveness: peak load is the number of values carried, at the producing step", () => {
  const memory = analyzeMemory(steps);
  assert.equal(memory.peakLoad, 5);
  assert.equal(memory.peakStepId, "s2");
  assert.equal(memory.capacity, WORKING_MEMORY_CAPACITY);
});

test("liveness: values are live from production through last consumption only", () => {
  const loads = analyzeMemory(steps).perStep.map((s) => s.load);
  assert.deepEqual(loads, [0, 5, 5, 5, 0]);
});

test("liveness: steps above capacity are exactly those holding more than 4", () => {
  const memory = analyzeMemory(steps);
  assert.deepEqual(memory.overCapacityStepIds, ["s2", "s3", "s4"]);
});

test("carry distance counts steps and context switches crossed", () => {
  const carried = analyzeMemory(steps).carried;
  assert.equal(carried.length, 5);
  for (const item of carried) {
    assert.equal(item.stepsCarried, 2);
    assert.equal(item.switchesCrossed, 2);
    assert.equal(item.decayRisk, true);
    assert.equal(item.producedAtStepId, "s2");
    assert.equal(item.consumedAtStepId, "s4");
  }
});

test("information that stays visible creates no memory burden", () => {
  const visible = steps.map((s) =>
    s.id === "s2" ? { ...s, producedInfoStaysVisible: true } : s
  );
  const memory = analyzeMemory(visible);
  assert.equal(memory.peakLoad, 0);
  assert.deepEqual(memory.carried, []);
});

test("switching counts transitions and A-B-A bounces", () => {
  const switching = analyzeSwitching(steps);
  assert.equal(switching.transitions, 4);
  assert.equal(switching.bounces, 2);
  assert.deepEqual(switching.uniqueEnvironments, ["Canvas", "PhET", "Docs"]);
});

test("timer feasibility: mean reader is tight where a slower reader runs out", () => {
  const timing = analyzeTiming(analysis);
  assert.equal(timing.totalWords, 150);
  assert.equal(timing.actionMinutes, 4);
  assert.equal(timing.readingMinutesMean, 0.6);
  assert.equal(timing.readingMinutesConservative, 1.2);
  assert.equal(timing.requiredMinutesMean, 4.6);
  assert.equal(timing.requiredMinutesConservative, 5.2);
  assert.equal(timing.verdict, "tight");
  assert.equal(timing.verdictConservative, "infeasible");
  assert.equal(timing.utilizationMean, 0.93);
});

test("an untimed assignment is never judged infeasible", () => {
  const timing = analyzeTiming({ ...analysis, timeLimitMinutes: null });
  assert.equal(timing.verdict, "untimed");
  assert.equal(timing.utilizationMean, null);
});

test("instruction density finds the densest paragraph", () => {
  const text = [
    "Open the simulation. Read the introduction carefully. Adjust the concentration slider.",
    "Students will be assessed on their explanation.",
  ].join("\n\n");

  const report = analyzeText(text);
  assert.equal(report.instructionDensity, 3);
  assert.equal(report.densestParagraphIndex, 0);
  assert.equal(report.wordCount, 18);
  assert.ok(report.fleschKincaidGrade > 0);
});

test("empty text does not throw", () => {
  const report = analyzeText("");
  assert.equal(report.wordCount, 0);
  assert.equal(report.instructionDensity, 0);
});
