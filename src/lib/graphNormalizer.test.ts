import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAnalysisGraph } from "./graphNormalizer";
import { BIOLOGY_SAMPLE } from "../samples/biology";

test("normalization repairs duplicate ids and discards ambiguous relationships", () => {
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  source.steps[0].id = "duplicate";
  source.steps[1].id = "duplicate";
  source.steps[1].consumes = ["not_produced_yet"];
  source.steps[2].consumes = ["never_produced"];
  source.steps[2].demands.contextSwitch = false;
  source.frictionMoments = [
    { ...source.frictionMoments[0], id: "finding", stepIds: ["duplicate", "missing"] },
  ];
  source.timeConstraints = [
    { id: "timer", limitMinutes: 12, stepIds: ["duplicate", "missing"], evidence: "" },
  ];

  const result = normalizeAnalysisGraph(source);
  assert.equal(new Set(result.analysis.steps.map((step) => step.id)).size, source.steps.length);
  assert.match(result.analysis.steps[0].id, /^duplicate__/);
  assert.match(result.analysis.steps[1].id, /^duplicate__/);
  assert.deepEqual(result.analysis.steps[1].consumes, []);
  assert.deepEqual(result.analysis.steps[2].consumes, []);
  assert.equal(result.analysis.steps[2].demands.contextSwitch, true);
  assert.deepEqual(result.analysis.frictionMoments, []);
  assert.deepEqual(result.analysis.timeConstraints, []);
  assert.ok(result.warnings.length >= 6);
});

test("normalization preserves valid references and removes duplicate values", () => {
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  source.steps[0].produces = ["reference", "reference"];
  source.steps[1].consumes = ["reference", "reference"];
  const result = normalizeAnalysisGraph(source);

  assert.deepEqual(result.analysis.steps[0].produces, ["reference"]);
  assert.deepEqual(result.analysis.steps[1].consumes, ["reference"]);
  assert.deepEqual(result.analysis.timeConstraints[0].stepIds, ["s8", "s9"]);
  assert.equal(result.analysis.frictionMoments.length, source.frictionMoments.length);
});
