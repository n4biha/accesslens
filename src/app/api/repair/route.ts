import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, getClient } from "@/lib/claude";
import { normalizeAnalysisGraph } from "@/lib/graphNormalizer";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import {
  repairClassificationRequestSchema,
  repairSchema,
} from "@/lib/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = repairClassificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a complete repair suggestion for a valid task step." },
      { status: 400 }
    );
  }

  const normalized = normalizeAnalysisGraph(parsed.data.analysis).analysis;
  const step = normalized.steps.find((candidate) => candidate.id === parsed.data.stepId);
  if (!step) {
    return NextResponse.json({ error: "That task step no longer exists." }, { status: 400 });
  }

  const rate = checkRateLimit(request, "repair", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: { effort: "medium", format: zodOutputFormat(repairSchema) },
      messages: [
        {
          role: "user",
          content: `Classify the educator-authored repair below. Return the suggestion exactly as written, then recalculate its measured effects, barrier label, and whether it preserves the locked learning objective. Do not inherit any field from the previous repair unless the new wording independently supports it. Timer effects may reference only the supplied timer ids.

<learning_objective>
${parsed.data.lockedObjective}
</learning_objective>

<step>
${JSON.stringify(step)}
</step>

<time_constraints>
${JSON.stringify(normalized.timeConstraints)}
</time_constraints>

<educator_suggestion>
${parsed.data.suggestion}
</educator_suggestion>`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "The repair classification came back empty. Try again." },
        { status: 502 }
      );
    }

    const validConstraintIds = new Set(normalized.timeConstraints.map((item) => item.id));
    if (
      response.parsed_output.effects.timeConstraintChanges.some(
        (change) => !validConstraintIds.has(change.constraintId)
      )
    ) {
      return NextResponse.json(
        { error: "The repair referred to a timer that is not in this assignment. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...response.parsed_output,
      suggestion: parsed.data.suggestion,
    });
  } catch (error) {
    console.error("repair classification failed", error);
    return NextResponse.json(
      { error: "Could not validate that repair. Try again." },
      { status: 502 }
    );
  }
}
