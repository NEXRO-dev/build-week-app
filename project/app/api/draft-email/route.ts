import { zodTextFormat } from "openai/helpers/zod";

import { getOpenAIClient, getTextModel } from "@/lib/openai/client";
import { EMAIL_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { apiErrorResponse } from "@/lib/openai/route-error";
import {
  DraftEmailRequestSchema,
  EmailDraftSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = DraftEmailRequestSchema.parse(await request.json());
    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: getTextModel(),
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: EMAIL_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(EmailDraftSchema, "echly_email_draft"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed email draft.");
    }

    return Response.json({ draft: response.output_parsed });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
