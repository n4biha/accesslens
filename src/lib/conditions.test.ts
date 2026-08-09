import assert from "node:assert/strict";
import { test } from "node:test";

import { CONDITIONS, type ConditionContext } from "@/components/WorkflowScreens";
import { runEngine } from "./engine";
import { applyRepairs } from "./repairs";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";

const analysis = BIOLOGY_SAMPLE.analysis;
const contextFor = (a: typeof analysis, text = BIOLOGY_TEXT): ConditionContext => {
  const report = runEngine(a, text);
  return { memory: report.memory, timing: report.timing };
};

const condition = (id: string) => CONDITIONS.find((item) => item.id === id)!;

test("a step that holds nothing does not fail the working-memory condition", () => {
  const context = contextFor(analysis);
  const fails = condition("working_memory").fails;

  // s1 reads the instructions in Canvas. It carries nothing forward and
  // produces nothing that disappears, so failing it would tell an educator
  // that reading is a working-memory barrier.
  const reading = analysis.steps.find((step) => step.id === "s1")!;
  assert.equal(fails(reading, context), false);

  // s5 produces three values the simulation does not save. That is the barrier.
  const observing = analysis.steps.find((step) => step.id === "s5")!;
  assert.equal(fails(observing, context), true);
});

test("the working-memory condition does not fail every step at once", () => {
  const context = contextFor(analysis);
  const failing = analysis.steps.filter((step) =>
    condition("working_memory").fails(step, context)
  );
  assert.ok(
    failing.length < analysis.steps.length,
    `every one of ${analysis.steps.length} steps failed, which tells an educator nothing`
  );
});

test("keeping values visible flips the steps that depended on memory", () => {
  const before = contextFor(analysis);
  const repaired = applyRepairs(analysis, ["s5", "s8"]).analysis;
  const after = contextFor(repaired);
  const fails = condition("working_memory").fails;

  const failingBefore = analysis.steps.filter((step) => fails(step, before)).length;
  const failingAfter = repaired.steps.filter((step) => fails(step, after)).length;
  assert.ok(
    failingAfter < failingBefore,
    `repairs should reduce the failing steps: ${failingBefore} -> ${failingAfter}`
  );
});

test("only steps under a stated timer fail the processing-time condition", () => {
  const context = contextFor(analysis);
  const timed = new Set(analysis.timeConstraints.flatMap((c) => c.stepIds));
  for (const step of analysis.steps) {
    assert.equal(
      condition("processing_time").fails(step, context),
      timed.has(step.id),
      `${step.id} should fail only when a stated timer covers it`
    );
  }
});
