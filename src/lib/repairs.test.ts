import assert from "node:assert/strict";
import { test } from "node:test";

import { runEngine, scoreAccessibility } from "./engine";
import { applyRepairs } from "./repairs";
import type { Analysis, FrictionMoment, RepairEffects, Step } from "./schema";

function effects(partial: Partial<RepairEffects> = {}): RepairEffects {
  return {
    keepsInfoVisible: false,
    reducesWorkingMemory: false,
    reducesFineMotor: false,
    timeConstraintId: null,
    timeConstraintAction: null,
    timeConstraintLimitMinutes: null,
    reducesReadingLoad: false,
    addsNonColorCue: false,
    addsCaptionOrTranscript: false,
    addsResponseAlternative: false,
    replacementEnvironment: null,
    ...partial,
  };
}

function step(
  id: string,
  overrides: Partial<Step> & { repairEffects?: RepairEffects | null } = {}
): Step {
  const { repairEffects = null, demands, ...rest } = overrides;
  return {
    id,
    action: `Completes ${id}`,
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    estimatedMinutes: null,
    evidence: "",
    goalRelevance: "incidental",
    relevanceReason: "",
    ...rest,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
      ...demands,
    },
    repair:
      repairEffects === null
        ? null
        : {
            suggestion: `Repair ${id}`,
            effects: repairEffects,
            barrierReduced: "barrier",
            rigorPreserved: true,
            rigorNote: "The same evidence is assessed.",
          },
  };
}

function moment(overrides: Partial<FrictionMoment> = {}): FrictionMoment {
  return {
    id: "f1",
    title: "Finding",
    stepIds: ["a"],
    severity: "high",
    barrierType: "fine_motor",
    explanation: "",
    ...overrides,
  };
}

function analysis(
  steps: Step[],
  frictionMoments: FrictionMoment[] = [],
  timeConstraints: Analysis["timeConstraints"] = []
): Analysis {
  return { steps, frictionMoments, timeConstraints };
}

test("no accepted repair preserves the graph and leaves findings unresolved", () => {
  const source = analysis(
    [step("a", { demands: { fineMotor: 3 } as Step["demands"] })],
    [moment()]
  );
  const result = applyRepairs(source, []);
  assert.deepEqual(result.analysis, source);
  assert.equal(result.frictionResolutions[0].status, "unresolved");
});

test("a repair changes only its explicit effects", () => {
  const source = analysis([
    step("a", {
      repairEffects: effects({ reducesFineMotor: true }),
      demands: {
        workingMemory: 3,
        fineMotor: 3,
        timePressure: 3,
        readingLoad: 3,
        contextSwitch: false,
        sensory: { colorOnly: true, audioOnly: true },
        communication: "spoken",
        wordCount: 0,
      },
    }),
  ]);
  const repaired = applyRepairs(source, ["a"]).analysis.steps[0];
  assert.equal(repaired.demands.fineMotor, 1);
  assert.equal(repaired.demands.workingMemory, 3);
  assert.equal(repaired.demands.timePressure, 3);
  assert.equal(repaired.demands.readingLoad, 3);
  assert.deepEqual(repaired.demands.sensory, { colorOnly: true, audioOnly: true });
  assert.equal(repaired.demands.communication, "spoken");
});

test("a response alternative becomes multiple, while typed remains a forced mode", () => {
  const source = analysis(
    [
      step("a", {
        repairEffects: effects({ addsResponseAlternative: true }),
        demands: { communication: "typed" } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "single_modality_communication" })]
  );
  const result = applyRepairs(source, ["a"]);
  assert.equal(result.analysis.steps[0].demands.communication, "multiple");
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("removing one timer clears its full scope without touching another timer", () => {
  const source = analysis(
    [
      step("quiz-a", { demands: { timePressure: 3 } as Step["demands"] }),
      step("quiz-b", {
        repairEffects: effects({
          timeConstraintId: "quiz",
          timeConstraintAction: "remove",
        }),
        demands: { timePressure: 3 } as Step["demands"],
      }),
      step("recording", {
        estimatedMinutes: 2,
        demands: { timePressure: 2, communication: "spoken" } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "time_pressure", stepIds: ["quiz-a", "quiz-b"] })],
    [
      { id: "quiz", limitMinutes: 12, stepIds: ["quiz-a", "quiz-b"], evidence: "" },
      { id: "recording-window", limitMinutes: 5, stepIds: ["recording"], evidence: "" },
    ]
  );
  const result = applyRepairs(source, ["quiz-b"]);
  assert.deepEqual(result.analysis.timeConstraints.map((item) => item.id), ["recording-window"]);
  assert.equal(result.analysis.steps[0].demands.timePressure, 0);
  assert.equal(result.analysis.steps[1].demands.timePressure, 0);
  assert.equal(result.analysis.steps[2].demands.timePressure, 2);
  assert.equal(result.analysis.steps[2].estimatedMinutes, 2);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("a timer can be extended without removing independent constraints", () => {
  const source = analysis(
    [step("a", {
      estimatedMinutes: 2,
      demands: { timePressure: 3 } as Step["demands"],
      repairEffects: effects({ timeConstraintId: "clock", timeConstraintAction: "set_limit", timeConstraintLimitMinutes: 20 }),
    })],
    [moment({ barrierType: "time_pressure" })],
    [{ id: "clock", limitMinutes: 1, stepIds: ["a"], evidence: "" }]
  );
  const result = applyRepairs(source, ["a"]);
  assert.equal(result.analysis.timeConstraints[0].limitMinutes, 20);
  assert.equal(result.analysis.steps[0].demands.timePressure, 1);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("an unrelated motor repair never resolves context switching", () => {
  const source = analysis(
    [
      step("a"),
      step("b", {
        environment: "PhET",
        demands: { contextSwitch: true } as Step["demands"],
      }),
      step("c", {
        environment: "PhET",
        repairEffects: effects({ reducesFineMotor: true }),
        demands: { fineMotor: 3 } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "context_switching", stepIds: ["b"] })]
  );
  const result = applyRepairs(source, ["c"]);
  assert.equal(result.analysis.steps[1].environment, "PhET");
  assert.equal(result.frictionResolutions[0].status, "unresolved");
});

test("an explicit environment consolidation can resolve a measured transition", () => {
  const source = analysis(
    [
      step("a"),
      step("b", {
        environment: "PhET",
        repairEffects: effects({ replacementEnvironment: "Canvas" }),
        demands: { contextSwitch: true } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "context_switching", stepIds: ["b"] })]
  );
  const result = applyRepairs(source, ["b"]);
  assert.equal(result.analysis.steps[1].demands.contextSwitch, false);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("navigation repairs are recorded but remain unverified", () => {
  const source = analysis(
    [step("a", { repairEffects: effects() })],
    [moment({ barrierType: "navigation_ambiguity" })]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "unverified");
});

test("a repair cannot resolve a condition absent from the original graph", () => {
  const source = analysis(
    [step("a", { repairEffects: effects({ reducesFineMotor: true }) })],
    [moment()]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "unverified");
});

test("making carried values visible resolves measured memory friction", () => {
  const source = analysis(
    [
      step("a", {
        produces: ["value"],
        producedInfoStaysVisible: false,
        repairEffects: effects({ keepsInfoVisible: true }),
      }),
      step("b", { consumes: ["value"] }),
    ],
    [moment({ barrierType: "working_memory", stepIds: ["a", "b"] })]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "resolved");
});

test("the after-score stops charging only verified resolved findings", () => {
  const source = analysis(
    [
      step("a", {
        repairEffects: effects({ reducesFineMotor: true }),
        demands: { fineMotor: 3 } as Step["demands"],
      }),
    ],
    [moment()]
  );
  const application = applyRepairs(source, ["a"]);
  const before = scoreAccessibility(runEngine(source, "text"), source).score;
  const resolved = new Set(
    application.frictionResolutions
      .filter((item) => item.status === "resolved")
      .map((item) => item.frictionId)
  );
  const after = scoreAccessibility(
    runEngine(application.analysis, "text"),
    application.analysis,
    resolved
  ).score;
  assert.ok(after > before);
});
