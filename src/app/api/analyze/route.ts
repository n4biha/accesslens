import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, getClient } from "@/lib/claude";
import { clampAnalysis } from "@/lib/engine";
import { verifyEvidence } from "@/lib/evidenceGuard";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { analysisSchema } from "@/lib/schema";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "analyze", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let assignmentText: string;
  let lockedObjective: string;
  try {
    ({ assignmentText, lockedObjective } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof assignmentText !== "string" || assignmentText.trim().length < 40) {
    return NextResponse.json(
      { error: "Paste the full assignment text so there is something to analyse." },
      { status: 400 }
    );
  }

  if (typeof lockedObjective !== "string" || lockedObjective.trim().length === 0) {
    return NextResponse.json(
      { error: "Lock a learning objective before analysing." },
      { status: 400 }
    );
  }

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

Remember: evidence quotes must be copied character-for-character from the assignment; information dependencies (produces / consumes / producedInfoStaysVisible) drive the working-memory analysis; any time limit stated anywhere in the assignment belongs in timeLimitMinutes, while a duration attached to a single step belongs in that step's estimatedMinutes; and every repair must use its "effects" object to state exactly which demands it moves, setting only the flags its own suggestion delivers.

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

    const checked = verifyEvidence(clampAnalysis(response.parsed_output), assignmentText);
    if (checked.discarded > 0) {
      console.warn(
        `evidence guard discarded ${checked.discarded} unverifiable quote(s): ${checked.discardedStepIds.join(", ")}`
      );
    }

    return NextResponse.json(checked.analysis);
  } catch (error) {
    console.error("analysis failed", error);
    return NextResponse.json(
      { error: "The analysis service could not be reached. Try again." },
      { status: 502 }
    );
  }
}
