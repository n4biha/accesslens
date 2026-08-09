import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, getClient } from "@/lib/claude";
import { clampAnalysis } from "@/lib/engine";
import { verifyEvidence } from "@/lib/evidenceGuard";
import { normalizeAnalysisGraph } from "@/lib/graphNormalizer";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { analysisRequestSchema, analysisSchema } from "@/lib/schema";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = analysisRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paste the full assignment and lock a learning objective before analysing." },
      { status: 400 }
    );
  }

  const rate = checkRateLimit(request, "analyze", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { assignmentText, lockedObjective } = parsed.data;

  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: { effort: "medium", format: zodOutputFormat(analysisSchema) },
      messages: [
        {
          role: "user",
          content: `The educator has locked this learning objective:

<learning_objective>
${lockedObjective}
</learning_objective>

Decompose the assignment below into the sequence of actions a student performs, and judge every demand against that objective.

Remember: evidence quotes must be copied character-for-character from the assignment; information dependencies drive the working-memory analysis; each independent timer belongs in timeConstraints with its exact step scope; a duration attached to one step belongs in estimatedMinutes; and every repair must state only the effects its own suggestion delivers.

<assignment>
${assignmentText}
</assignment>`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "The analysis came back empty. Try again." },
        { status: 502 }
      );
    }

    const normalized = normalizeAnalysisGraph(clampAnalysis(response.parsed_output));
    const checked = verifyEvidence(normalized.analysis, assignmentText);
    if (checked.discarded > 0) {
      console.warn(
        `evidence guard discarded ${checked.discarded} unverifiable quote(s): ${checked.discardedStepIds.join(", ")}`
      );
    }

    const warnings = [...normalized.warnings];
    if (checked.discarded > 0) {
      warnings.push(
        `${checked.discarded} evidence quote${checked.discarded === 1 ? " was" : "s were"} removed because the text could not be verified in the assignment.`
      );
    }
    return NextResponse.json({ analysis: checked.analysis, warnings });
  } catch (error) {
    console.error("analysis failed", error);
    return NextResponse.json(
      { error: "The analysis service could not be reached. Try again." },
      { status: 502 }
    );
  }
}
