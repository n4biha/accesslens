import assert from "node:assert/strict";
import { test } from "node:test";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";

import {
  analysisSchema,
  objectiveExtractionSchema,
  repairProposalsSchema,
  repairSchema,
  revisedAssignmentSchema,
  taskGraphSchema,
} from "./schema";

/**
 * Structured outputs compile a grammar from the schema, and the API rejects one
 * that grows too large. The whole task graph in a single request crossed that
 * line and surfaced to educators as "the analysis service could not be
 * reached", which pointed at the network rather than at the schema.
 *
 * The limit is not published as a number, so these bounds are empirical: the
 * whole graph measured 304 nodes and was rejected, while every schema actually
 * sent measured 184 or fewer and was accepted. A budget between the two fails
 * here, offline and in a second, rather than in production.
 */
const NODE_BUDGET = 220;

function nodeCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + nodeCount(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce<number>((sum, item) => sum + nodeCount(item), 1);
  }
  return 1;
}

function sizeOf(schema: ZodType): number {
  const format = zodOutputFormat(schema as never) as unknown as { schema: unknown };
  return nodeCount(format.schema);
}

// Every schema passed to output_config.format anywhere in the app.
const SENT_TO_THE_MODEL: Array<[string, ZodType]> = [
  ["objectiveExtractionSchema", objectiveExtractionSchema],
  ["taskGraphSchema", taskGraphSchema],
  ["repairProposalsSchema", repairProposalsSchema],
  ["repairSchema", repairSchema],
  ["revisedAssignmentSchema", revisedAssignmentSchema],
];

for (const [name, schema] of SENT_TO_THE_MODEL) {
  test(`${name} stays inside the grammar budget`, () => {
    const size = sizeOf(schema);
    assert.ok(
      size <= NODE_BUDGET,
      `${name} compiled to ${size} nodes, over the ${NODE_BUDGET} budget. Split it across another request rather than raising this number: the API rejects an oversized grammar outright.`
    );
  });
}

test("the full analysis is assembled locally, never requested in one call", () => {
  // Kept as a reminder of why the split exists. If this ever drops under the
  // budget the two passes could be merged again, but not before.
  assert.ok(
    sizeOf(analysisSchema) > NODE_BUDGET,
    "analysisSchema now fits; the two-pass split in /api/analyze could be reconsidered"
  );
  assert.equal(
    "repair" in (taskGraphSchema.shape.steps.element.shape as Record<string, unknown>),
    false,
    "the repair must stay out of pass one, which is what brought the graph under the limit"
  );
});
