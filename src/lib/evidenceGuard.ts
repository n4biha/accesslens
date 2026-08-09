import type { Analysis } from "./schema";

/**
 * A quote the educator can check is the difference between a barrier trace and
 * a plausible-sounding paragraph. Anything the model did not copy verbatim from
 * the source is blanked here rather than rendered, so the interface can never
 * show an educator a sentence their assignment does not contain.
 */

function normalize(value: string): string {
  return value.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

export interface EvidenceCheck {
  analysis: Analysis;
  verified: number;
  discarded: number;
  discardedStepIds: string[];
}

export function verifyEvidence(analysis: Analysis, assignmentText: string): EvidenceCheck {
  const haystack = normalize(assignmentText);
  const discardedStepIds: string[] = [];
  let verified = 0;

  const steps = analysis.steps.map((step) => {
    const needle = normalize(step.evidence);
    if (needle.length > 0 && haystack.includes(needle)) {
      verified++;
      return step;
    }
    discardedStepIds.push(step.id);
    return { ...step, evidence: "" };
  });

  return {
    analysis: { ...analysis, steps },
    verified,
    discarded: discardedStepIds.length,
    discardedStepIds,
  };
}

/**
 * Locates a verified quote inside the source so the UI can highlight it in
 * place. Returns null when the quote is absent, which callers must treat as
 * "render without a highlight" rather than falling back to a search string.
 */
export function locateEvidence(
  assignmentText: string,
  evidence: string
): { start: number; end: number } | null {
  if (!evidence) return null;

  const direct = assignmentText.indexOf(evidence);
  if (direct !== -1) return { start: direct, end: direct + evidence.length };

  // Fall back to a whitespace-tolerant scan so a quote that differs only in
  // line wrapping still highlights the right characters in the original.
  const target = normalize(evidence);
  const words = target.split(" ");
  if (words.length === 0) return null;

  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(assignmentText);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
