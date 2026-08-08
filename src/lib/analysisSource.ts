import type { Analysis, ObjectiveCandidate } from "./schema";
import { SAMPLES } from "@/samples/biology";

/**
 * Where analysis comes from. Samples resolve locally so the demo runs instantly
 * and offline; anything else goes to the API routes. Phase 2 fills in the
 * routes — until then a pasted assignment surfaces a clear message rather than
 * failing silently.
 */

function matchSample(text: string) {
  const normalized = text.trim();
  return SAMPLES.find((sample) => sample.text.trim() === normalized);
}

export class AnalysisUnavailableError extends Error {}

export async function extractObjectives(text: string): Promise<ObjectiveCandidate[]> {
  const sample = matchSample(text);
  if (sample) return sample.objectives;

  const response = await fetch("/api/objective", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentText: text }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new AnalysisUnavailableError(
      "Live analysis is not connected yet. Load one of the sample assignments to explore the full flow."
    );
  }

  const data = await response.json();
  return data.objectives as ObjectiveCandidate[];
}

export async function analyzeAssignment(
  text: string,
  lockedObjective: string
): Promise<Analysis> {
  const sample = matchSample(text);
  if (sample) return sample.analysis;

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentText: text, lockedObjective }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new AnalysisUnavailableError(
      "Live analysis is not connected yet. Load one of the sample assignments to explore the full flow."
    );
  }

  return (await response.json()) as Analysis;
}
