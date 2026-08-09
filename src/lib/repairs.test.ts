import { test } from "node:test";
import assert from "node:assert/strict";

import { runEngine, scoreAccessibility } from "./engine";
import { applyRepairs, outstandingRepairs } from "./repairs";
import type { Analysis, Step } from "./schema";

function step(o: Partial<Step> & Pick<Step, "id" | "environment">): Step {
  return {
    action: "does something",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    evidence: "",
    goalRelevance: "incidental",
    relevanceReason: "",
    repair: {
      suggestion: "keep it visible",
      barrierReduced: "working memory",
      rigorPreserved: true,
      rigorNote: "same reasoning",
    },
    ...o,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
      ...o.demands,
    },
  } as Step;
}

const VALUES = ["v1", "v2", "v3", "v4", "v5"];

/** Simulation produces five values, carried across two switches into a timed quiz. */
const analysis: Analysis = {
  timeLimitMinutes: 5,
  frictionMoments: [],
  steps: [
    step({ id: "s1", environment: "Canvas", demands: { wordCount: 120 } as Step["demands"] }),
    step({
      id: "s2",
      environment: "PhET",
      produces: VALUES,
      producedInfoStaysVisible: false,
      demands: { contextSwitch: true, fineMotor: 3, workingMemory: 3 } as Step["demands"],
    }),
    step({ id: "s3", environment: "Canvas", demands: { contextSwitch: true } as Step["demands"] }),
    step({
      id: "s4",
      environment: "Docs",
      consumes: VALUES,
      demands: { contextSwitch: true, communication: "spoken", timePressure: 3 } as Step["demands"],
    }),
  ],
};

test("an unapplied repair changes nothing", () => {
  assert.deepEqual(applyRepairs(analysis, []), analysis);
});

test("applying a repair keeps the produced information visible", () => {
  const repaired = applyRepairs(analysis, ["s2"]);
  const s2 = repaired.steps.find((s) => s.id === "s2")!;
  assert.equal(s2.producedInfoStaysVisible, true);
  assert.equal(s2.demands.workingMemory, 1);
  assert.equal(s2.demands.fineMotor, 1);
});

test("a step with no repair is untouched even if its id is passed", () => {
  const withoutRepair: Analysis = {
    ...analysis,
    steps: analysis.steps.map((s) => (s.id === "s2" ? { ...s, repair: null } : s)),
  };
  const repaired = applyRepairs(withoutRepair, ["s2"]);
  assert.equal(repaired.steps.find((s) => s.id === "s2")!.producedInfoStaysVisible, false);
});

test("repairing the memory barrier removes the carried load entirely", () => {
  const before = runEngine(analysis, "text");
  assert.equal(before.memory.peakLoad, 5);

  const after = runEngine(applyRepairs(analysis, ["s2"]), "text");
  assert.equal(after.memory.peakLoad, 0);
  assert.deepEqual(after.memory.carried, []);
});

function scoreOf(a: Analysis): number {
  return scoreAccessibility(runEngine(a, "text"), a).score;
}

test("the score improves once repairs are applied", () => {
  const before = scoreOf(analysis);
  const partly = scoreOf(applyRepairs(analysis, ["s2", "s4"]));
  const fully = scoreOf(applyRepairs(analysis, ["s1", "s2", "s3", "s4"]));

  assert.ok(partly > before, `repairing the barriers should help: ${before} -> ${partly}`);
  assert.ok(fully > partly, `repairing the rest should help further: ${partly} -> ${fully}`);
  assert.equal(fully, 100, "a task with every barrier repaired has nothing left to deduct");
});

test("steps left undecided keep costing the score", () => {
  // s1 and s3 still carry outstanding repairs, at -2 each.
  assert.equal(scoreOf(applyRepairs(analysis, ["s2", "s4"])), 96);
});

test("constraint conditions flip from fail to pass", () => {
  const failsMotor = (s: Step) => s.demands.fineMotor >= 2;
  const failsSpoken = (s: Step) => s.demands.communication === "spoken";

  assert.equal(analysis.steps.filter(failsMotor).length, 1);
  assert.equal(analysis.steps.filter(failsSpoken).length, 1);

  const repaired = applyRepairs(analysis, ["s2", "s4"]);
  assert.equal(repaired.steps.filter(failsMotor).length, 0);
  assert.equal(repaired.steps.filter(failsSpoken).length, 0);
});

test("the time limit only clears when every timed step is repaired", () => {
  const twoTimed: Analysis = {
    ...analysis,
    steps: [
      ...analysis.steps,
      step({ id: "s5", environment: "Canvas", demands: { timePressure: 3 } as Step["demands"] }),
    ],
  };

  assert.equal(applyRepairs(twoTimed, ["s4"]).timeLimitMinutes, 5, "one of two repaired");
  assert.equal(applyRepairs(twoTimed, ["s4", "s5"]).timeLimitMinutes, null, "both repaired");
});

test("outstanding repairs counts only undecided steps", () => {
  assert.equal(outstandingRepairs(analysis, []), 4);
  assert.equal(outstandingRepairs(analysis, ["s2", "s4"]), 2);
});
