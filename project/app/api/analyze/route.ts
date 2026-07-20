import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { getAuthErrorResponse } from "@/lib/auth-api";
import { calculateLoadSignal } from "@/lib/load/calculateLoadSignal";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  TaskExtractionResultSchema,
  AnalyzeRequestSchema,
} from "@/lib/openai/schemas";
import { normalizeExtractedTaskTimes } from "@/lib/tasks/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const input = AnalyzeRequestSchema.parse(await request.json());
    const extraction = await runCloudflareStructuredOutput({
      systemPrompt: `${ANALYSIS_SYSTEM_PROMPT}\n\n${input.locale === "us-en" ? "IMPORTANT: Understand English input and return every user-facing string in natural US English." : "重要: ユーザー向けの文字列はすべて自然な日本語で返してください。"}`,
      input: {
        entryKind: "combined",
        transcript: input.transcript,
        referenceDate: input.referenceDate,
        timeZone: input.timeZone,
        locale: input.locale,
      },
      schema: TaskExtractionResultSchema,
    });
    const condition = calculateLoadSignal({
      selfReport: input.selfReport,
      audioMeta: input.audioMeta,
      audioBaseline: input.audioBaseline,
    });
    return Response.json({
      tasks: extraction.tasks.map(normalizeExtractedTaskTimes),
      condition,
    });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
