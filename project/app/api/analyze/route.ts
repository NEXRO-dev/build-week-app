import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  AnalysisResultSchema,
  AnalyzeRequestSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = AnalyzeRequestSchema.parse(await request.json());
    const result = await runCloudflareStructuredOutput({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      input,
      schema: AnalysisResultSchema,
    });
    return Response.json(result);
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
