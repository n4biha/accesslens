import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, describeModelFailure, getClient } from "@/lib/claude";
import { LIGHT_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { objectiveExtractionSchema, objectiveRequestSchema } from "@/lib/schema";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = objectiveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paste the full assignment text so there is something to analyse." },
      { status: 400 }
    );
  }

  const rate = checkRateLimit(request, "objective", LIGHT_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { assignmentText } = parsed.data;

  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: { format: zodOutputFormat(objectiveExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `Identify what this assignment is actually trying to teach. Give at most three candidate learning objectives, most likely first, each phrased as what the student should be able to do.

If the assignment states an objective explicitly, quote it as the source. Otherwise infer it from the content and set source to "inferred".

<assignment>
${assignmentText}
</assignment>`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: "Could not read a learning objective from that assignment." },
        { status: 502 }
      );
    }

    return NextResponse.json(response.parsed_output);
  } catch (error) {
    console.error("objective extraction failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
