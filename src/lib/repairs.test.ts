import { test } from "node:test";
import assert from "node:assert/strict";

import { runEngine, scoreAccessibility } from "./engine";
import { applyRepairs, outstandingRepairs } from "./repairs";
import type { Analysis, FrictionMoment, RepairEffects, Step } from "./schema";

const NO_EFFECT: RepairEffects = {
  keepsInfoVisible: false,
  reducesWorkingMemory: false,
  reducesFineMotor: false,
  removesTimePressure: false,
  reducesReadingLoad: false,
  addsNonColorCue: false,
  addsCaptionOrTranscript: false,
  addsResponseAlternative: false,
};

function effects(partial: Partial<RepairEffects>): RepairEffects {
  return { ...NO_EFFECT, ...partial };
}

function step(
  o: Partial<Step> & Pick<Step, "id" | "environment">,
  repairEffects: Partial<RepairEffects> | null = { keepsInfoVisible: true, reducesWorkingMemory: true },
): Step {
  return {
    action: "does something",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    estimatedMinutes: null,
    evidence: "",
    goalRelevance: "incidental",
    relevanceReason: "",
    repair: {
      suggestion: "keep it visible",
      effects: repairEffects === null ? null : effects(repairEffects),
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
    step(
      {
        id: "s4",
        environment: "Docs",
        consumes: VALUES,
        demands: { contextSwitch: true, communication: "spoken", timePressure: 3 } as Step["demands"],
      },
      { removesTimePressure: true, addsResponseAlternative: true },
    ),
  ],
};

test("an unapplied repair changes nothing", () => {
  assert.deepEqual(applyRepairs(analysis, []), analysis);
});

test("a repair moves only the demands it states", () => {
  // s2 carries a memory barrier and a separate motor barrier. Accepting the
  // memory repair must not silently resolve the motor one: the educator agreed
  // to keep values on screen, not to add an alternative to dragging.
  const s2 = applyRepairs(analysis, ["s2"]).steps.find((s) => s.id === "s2")!;

  assert.equal(s2.producedInfoStaysVisible, true, "the stated effect applies");
  assert.equal(s2.demands.workingMemory, 1, "the stated effect applies");
  assert.equal(s2.demands.fineMotor, 3, "an unaddressed demand is left alone");
});

test("a timing repair does not clear an unrelated sensory or memory demand", () => {
  const source: Analysis = {
    ...analysis,
    steps: [
      step(
        {
          id: "only",
          environment: "Canvas",
          demands: {
            timePressure: 3,
            workingMemory: 3,
            sensory: { colorOnly: true, audioOnly: true },
            communication: "spoken",
          } as Step["demands"],
        },
        { removesTimePressure: true },
      ),
    ],
  };

  const repaired = applyRepairs(source, ["only"]).steps[0];
  assert.equal(repaired.demands.timePressure, 0);
  assert.equal(repaired.demands.workingMemory, 3);
  assert.equal(repaired.demands.sensory.colorOnly, true);
  assert.equal(repaired.demands.sensory.audioOnly, true);
  assert.equal(repaired.demands.communication, "spoken");
});

test("a repair with no stated effects falls back to the barrier that flagged it", () => {
  const source: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [
      {
        id: "f1",
        title: "Dragging is the only route",
        stepIds: ["only"],
        severity: "high",
        barrierType: "fine_motor",
        explanation: "",
      },
    ],
    steps: [
      step(
        {
          id: "only",
          environment: "PhET",
          demands: { fineMotor: 3, workingMemory: 3 } as Step["demands"],
        },
        null,
      ),
    ],
  };

  const repaired = applyRepairs(source, ["only"]).steps[0];
  assert.equal(repaired.demands.fineMotor, 1, "derived from the friction moment");
  assert.equal(repaired.demands.workingMemory, 3, "still not a blanket reset");
});

test("a repair with neither effects nor a friction moment falls back to its own wording", () => {
  const source: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [],
    steps: [
      {
        ...step({ id: "only", environment: "Canvas", demands: { timePressure: 3, fineMotor: 3 } as Step["demands"] }, null),
        repair: {
          suggestion: "Remove the countdown so students can work at their own pace.",
          effects: null,
          barrierReduced: "Processing-speed pressure",
          rigorPreserved: true,
          rigorNote: "",
        },
      },
    ],
  };

  const repaired = applyRepairs(source, ["only"]).steps[0];
  assert.equal(repaired.demands.timePressure, 0);
  assert.equal(repaired.demands.fineMotor, 3);
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

  // s4's repair states addsResponseAlternative, so the spoken requirement goes.
  // s2's states nothing about motor precision, so dragging is still required —
  // the screen reports that honestly rather than showing a blanket pass.
  const repaired = applyRepairs(analysis, ["s2", "s4"]);
  assert.equal(repaired.steps.filter(failsSpoken).length, 0);
  assert.equal(repaired.steps.filter(failsMotor).length, 1);
});

test("the time limit only clears when every timed step is repaired for timing", () => {
  const twoTimed: Analysis = {
    ...analysis,
    steps: [
      ...analysis.steps,
      step(
        { id: "s5", environment: "Canvas", demands: { timePressure: 3 } as Step["demands"] },
        { removesTimePressure: true },
      ),
    ],
  };

  assert.equal(applyRepairs(twoTimed, ["s4"]).timeLimitMinutes, 5, "one of two repaired");
  assert.equal(applyRepairs(twoTimed, ["s4", "s5"]).timeLimitMinutes, null, "both repaired");
});

test("a repair that ignores timing does not clear the time limit", () => {
  const source: Analysis = {
    ...analysis,
    steps: [
      step(
        { id: "only", environment: "Canvas", demands: { timePressure: 3 } as Step["demands"] },
        { keepsInfoVisible: true },
      ),
    ],
  };
  assert.equal(applyRepairs(source, ["only"]).timeLimitMinutes, 5);
});

const moment = (o: Partial<FrictionMoment> & Pick<FrictionMoment, "id" | "barrierType" | "stepIds">): FrictionMoment => ({
  title: "",
  severity: "high",
  explanation: "",
  ...o,
});

test("a friction moment clears once no step it spans still shows its barrier", () => {
  const source: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [
      moment({ id: "f1", barrierType: "fine_motor", stepIds: ["a", "b"] }),
      moment({ id: "f2", barrierType: "time_pressure", stepIds: ["b"], severity: "medium" }),
    ],
    steps: [
      step({ id: "a", environment: "PhET", demands: { fineMotor: 3 } as Step["demands"] }, { reducesFineMotor: true }),
      step(
        { id: "b", environment: "PhET", demands: { fineMotor: 3, timePressure: 3 } as Step["demands"] },
        { reducesFineMotor: true },
      ),
    ],
  };

  assert.equal(applyRepairs(source, ["a"]).frictionMoments.length, 2, "step b still drags");
  const both = applyRepairs(source, ["a", "b"]);
  assert.deepEqual(
    both.frictionMoments.map((f) => f.id),
    ["f2"],
    "motor friction clears; the untouched timing friction stays",
  );
});

test("resolved friction stops being deducted, unresolved friction keeps counting", () => {
  const source: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [moment({ id: "f1", barrierType: "fine_motor", stepIds: ["a"] })],
    steps: [
      step({ id: "a", environment: "PhET", demands: { fineMotor: 3 } as Step["demands"] }, { reducesFineMotor: true }),
    ],
  };

  assert.equal(scoreOf(source), 94, "-4 for one high-severity moment, -2 for the open repair");
  assert.equal(scoreOf(applyRepairs(source, ["a"])), 100);
});

test("a barrier the schema cannot measure is never reported as resolved", () => {
  const source: Analysis = {
    timeLimitMinutes: null,
    frictionMoments: [moment({ id: "f1", barrierType: "navigation_ambiguity", stepIds: ["a"] })],
    steps: [step({ id: "a", environment: "Canvas" }, {})],
  };

  assert.equal(applyRepairs(source, ["a"]).frictionMoments.length, 1);
});

test("outstanding repairs counts only undecided steps", () => {
  assert.equal(outstandingRepairs(analysis, []), 4);
  assert.equal(outstandingRepairs(analysis, ["s2", "s4"]), 2);
});
