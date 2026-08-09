import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, getClient } from "@/lib/claude";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { revisedAssignmentSchema } from "@/lib/schema";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

interface AcceptedRepair {
  action: string;
  suggestion: string;
  rigorNote: string;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "preview", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let assignmentText: string;
  let lockedObjective: string;
  let repairs: AcceptedRepair[];
  try {
    ({ assignmentText, lockedObjective, repairs } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof assignmentText !== "string" || assignmentText.trim().length < 40) {
    return NextResponse.json({ error: "Nothing to rewrite." }, { status: 400 });
  }

  if (!Array.isArray(repairs) || repairs.length === 0) {
    return NextResponse.json(
      { error: "Apply at least one repair before generating the revised assignment." },
      { status: 400 }
    );
  }

  const repairList = repairs
    .map(
      (repair, index) =>
        `${index + 1}. At the step "${repair.action}":\n   Change: ${repair.suggestion}\n   Must still be assessed: ${repair.rigorNote}`
    )
    .join("\n\n");

  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: { effort: "medium", format: zodOutputFormat(revisedAssignmentSchema) },
      messages: [
        {
          role: "user",
          content: `Rewrite this assignment so a student can read it directly, applying exactly the repairs the educator accepted and nothing else.

Rules:
- Keep the academic content identical. The locked objective below is still assessed in full, at the same level of difficulty. You are changing how students access and demonstrate the learning, never what they must learn.
- Apply only the listed repairs. Do not fix, tidy, shorten, or improve anything the educator did not accept, however tempting.
- Write in the educator's own voice, addressing the student directly. Preserve the original's structure, numbering, and any resource names or links.
- Where a repair removes a requirement, the replacement must carry the same academic weight — an alternative route to demonstrating the same understanding, not an easier one.
- Return the complete assignment, not a diff or a summary.

<locked_objective>
${lockedObjective}
</locked_objective>

<accepted_repairs>
${repairList}
</accepted_repairs>

<original_assignment>
${assignmentText}
</original_assignment>`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "The revised assignment came back empty. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(response.parsed_output);
  } catch (error) {
    console.error("preview generation failed", error);
    return NextResponse.json(
      { error: "Could not generate the revised assignment. Try again." },
      { status: 502 }
    );
  }
}
