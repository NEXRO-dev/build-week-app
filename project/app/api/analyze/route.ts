import { zodTextFormat } from "openai/helpers/zod";

import { getOpenAIClient, getTextModel } from "@/lib/openai/client";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { apiErrorResponse } from "@/lib/openai/route-error";
import {
  AnalysisResultSchema,
  AnalyzeRequestSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = AnalyzeRequestSchema.parse(await request.json());
    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: getTextModel(),
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      text: {
        format: zodTextFormat(AnalysisResultSchema, "echly_analysis"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed analysis.");
    }

    return Response.json(response.output_parsed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
