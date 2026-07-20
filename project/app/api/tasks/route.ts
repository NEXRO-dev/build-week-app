import { getAuthErrorResponse } from "@/lib/auth-api";
import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  TaskExtractionRequestSchema,
  TaskExtractionResultSchema,
} from "@/lib/openai/schemas";
import { normalizeExtractedTaskTimes } from "@/lib/tasks/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const input = TaskExtractionRequestSchema.parse(await request.json());
    const extraction = await runCloudflareStructuredOutput({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT +
        (input.locale === "us-en"
          ? "\n\nIMPORTANT: Understand English input and return every user-facing string in natural US English."
          : "\n\n重要: ユーザー向けの文字列はすべて自然な日本語で返してください。"),
      input: {
        locale: input.locale,
        entryKind: "planning",
        transcript: input.transcript,
        referenceDate: input.referenceDate,
        timeZone: input.timeZone,
      },
      schema: TaskExtractionResultSchema,
    });
    return Response.json({
      tasks: extraction.tasks.map(normalizeExtractedTaskTimes),
    });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
