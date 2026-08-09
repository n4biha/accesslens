import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeMemory,
  analyzeSwitching,
  analyzeText,
  analyzeTiming,
  clampAnalysis,
  runEngine,
  scoreAccessibility,
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
    estimatedMinutes: null,
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

test("confidence score deducts only from measured friction", () => {
  const report = runEngine(analysis, "Some assignment text.");
  const { score, breakdown } = scoreAccessibility(report, analysis);

  // 1 item over capacity (-8), 5 values carried across a switch (-25),
  // 1 switch beyond three (-3), a tight limit (-8), and a slower reader
  // running out entirely (-5) = 49 deducted from 100.
  assert.equal(score, 51);
  assert.equal(
    breakdown.reduce((sum, item) => sum + item.points, 0),
    -49
  );
  assert.ok(breakdown.every((item) => item.points < 0));
});

test("a task with no measured friction scores 100", () => {
  const clean: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [],
    steps: [step({ id: "a", environment: "Canvas" })],
  };
  const report = runEngine(clean, "Read the page.");
  const { score, breakdown } = scoreAccessibility(report, clean);
  assert.equal(score, 100);
  assert.deepEqual(breakdown, []);
});

test("score never falls below zero", () => {
  const brutal: Analysis = {
    ...analysis,
    frictionMoments: Array.from({ length: 40 }, (_, i) => ({
      id: `f${i}`,
      title: "friction",
      stepIds: ["s2"],
      severity: "high" as const,
      barrierType: "working_memory" as const,
      explanation: "",
    })),
  };
  const report = runEngine(brutal, "text");
  assert.equal(scoreAccessibility(report, brutal).score, 0);
});

test("a stated step duration is counted as the time it takes", () => {
  const withVideo: Analysis = {
    timeLimitMinutes: 30,
    frictionMoments: [],
    steps: [
      step({ id: "a", environment: "Canvas" }),
      step({ id: "b", environment: "Panopto", estimatedMinutes: 20 }),
    ],
  };

  // Two generic steps would cost a minute between them; the twenty-minute
  // video costs twenty. Without this a required lecture recording was worth
  // thirty seconds, and any timing verdict built on it was meaningless.
  assert.equal(analyzeTiming(withVideo).actionMinutes, 20.5);

  const withoutDuration = analyzeTiming({
    ...withVideo,
    steps: withVideo.steps.map((s) => ({ ...s, estimatedMinutes: null })),
  });
  assert.equal(withoutDuration.actionMinutes, 1);
});

test("a stated duration shorter than a generic step does not shrink it", () => {
  const brief: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [],
    steps: [step({ id: "a", environment: "Canvas", estimatedMinutes: 0.1 })],
  };
  assert.equal(analyzeTiming(brief).actionMinutes, 0.5);
});

test("demand levels outside the documented range are clamped, not rejected", () => {
  const wild: Analysis = {
    timeLimitMinutes: -4,
    frictionMoments: [],
    steps: [
      step({
        id: "a",
        environment: "Canvas",
        estimatedMinutes: -2,
        demands: {
          workingMemory: 9,
          fineMotor: -1,
          timePressure: 2.4,
          readingLoad: 3,
          contextSwitch: false,
          sensory: { colorOnly: false, audioOnly: false },
          communication: "none",
          wordCount: -50,
        },
      }),
    ],
  };

  const { steps, timeLimitMinutes } = clampAnalysis(wild);
  assert.equal(steps[0].demands.workingMemory, 3);
  assert.equal(steps[0].demands.fineMotor, 0);
  assert.equal(steps[0].demands.timePressure, 2);
  assert.equal(steps[0].demands.wordCount, 0);
  assert.equal(steps[0].estimatedMinutes, null);
  assert.equal(timeLimitMinutes, null);

  // The step itself survives: one bad integer must not cost the whole analysis.
  assert.equal(steps.length, 1);
  assert.equal(steps[0].id, "a");
});

test("a limit is judged against the steps it actually covers", () => {
  // A twelve-minute pre-lab video plus a fifteen-minute quiz. The video is not
  // taken during the quiz, so charging it against the quiz timer would report
  // a deadline that is impossible only because two unrelated things were added
  // together.
  const preLabVideo: Analysis = {
    timeLimitMinutes: 15,
    frictionMoments: [],
    steps: [
      step({ id: "video", environment: "Canvas", estimatedMinutes: 12 }),
      step({
        id: "quiz",
        environment: "Canvas",
        demands: { timePressure: 3, communication: "typed", wordCount: 250 } as Step["demands"],
      }),
    ],
  };

  const timing = analyzeTiming(preLabVideo);
  assert.equal(timing.limitedStepCount, 1);
  assert.equal(timing.requiredMinutesMean, 14.6, "the whole task still counts the video");
  assert.equal(timing.limitedMinutesMean, 2.6, "the limit is judged on the quiz alone");
  assert.equal(timing.verdict, "comfortable");
});

test("a limit with no step marked as timed still covers the whole task", () => {
  const untargeted: Analysis = {
    timeLimitMinutes: 1,
    frictionMoments: [],
    steps: [step({ id: "a", environment: "Canvas", estimatedMinutes: 20 })],
  };
  const timing = analyzeTiming(untargeted);
  assert.equal(timing.limitedStepCount, 1);
  assert.equal(timing.verdict, "infeasible");
});
