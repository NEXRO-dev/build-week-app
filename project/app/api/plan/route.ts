import { zodTextFormat } from "openai/helpers/zod";

import { getOpenAIClient, getTextModel } from "@/lib/openai/client";
import { PLAN_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { apiErrorResponse } from "@/lib/openai/route-error";
import { PlanRequestSchema, TomorrowPlanSchema } from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = PlanRequestSchema.parse(await request.json());
    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: getTextModel(),
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(TomorrowPlanSchema, "echly_tomorrow_plan"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed plan.");
    }

    return Response.json({ plan: response.output_parsed });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
