import type { Analysis, ObjectiveCandidate, RevisedAssignment } from "./schema";
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

  const data = await post<{ objectives: ObjectiveCandidate[] }>("/api/objective", {
    assignmentText: text,
  });
  return data.objectives;
}

export async function analyzeAssignment(
  text: string,
  lockedObjective: string
): Promise<Analysis> {
  const sample = matchSample(text);
  if (sample) return sample.analysis;

  return post<Analysis>("/api/analyze", { assignmentText: text, lockedObjective });
}

export interface AcceptedRepair {
  action: string;
  suggestion: string;
  rigorNote: string;
}

/**
 * Rewrites the assignment with only the accepted repairs applied. Unlike the
 * other two calls this has no sample shortcut: the revision depends on which
 * repairs the educator actually accepted, so a cached answer would be a
 * fabrication rather than a shortcut.
 */
export async function generatePreview(
  assignmentText: string,
  lockedObjective: string,
  repairs: AcceptedRepair[]
): Promise<RevisedAssignment> {
  return post<RevisedAssignment>("/api/preview", {
    assignmentText,
    lockedObjective,
    repairs,
  });
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!response) {
    throw new AnalysisUnavailableError(
      "Could not reach the analysis service. Check your connection and try again."
    );
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((data: { error?: string }) => data.error)
      .catch(() => null);
    throw new AnalysisUnavailableError(
      message ?? "The analysis service returned an error. Try again."
    );
  }

  return (await response.json()) as T;
}
