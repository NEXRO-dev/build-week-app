import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { calculateLoadSignal } from "@/lib/load/calculateLoadSignal";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  TaskExtractionResultSchema,
  AnalyzeRequestSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = AnalyzeRequestSchema.parse(await request.json());
    const extraction = await runCloudflareStructuredOutput({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      input: {
        transcript: input.transcript,
        referenceDate: input.referenceDate,
        timeZone: input.timeZone,
      },
      schema: TaskExtractionResultSchema,
    });
    const condition = calculateLoadSignal({
      selfReport: input.selfReport,
      audioMeta: input.audioMeta,
      audioBaseline: input.audioBaseline,
    });
    return Response.json({ tasks: extraction.tasks, condition });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
