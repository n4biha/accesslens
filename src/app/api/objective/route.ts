import { NextResponse } from "next/server";

import { MODEL, SYSTEM_PROMPT, getClient } from "@/lib/claude";
import { LIGHT_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { objectiveExtractionSchema } from "@/lib/schema";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "objective", LIGHT_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let assignmentText: string;
  try {
    ({ assignmentText } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof assignmentText !== "string" || assignmentText.trim().length < 40) {
    return NextResponse.json(
      { error: "Paste the full assignment text so there is something to analyse." },
      { status: 400 }
    );
  }

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
    return NextResponse.json(
      { error: "The analysis service could not be reached. Try again." },
      { status: 502 }
    );
  }
}
