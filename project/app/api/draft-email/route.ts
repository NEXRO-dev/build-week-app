import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { getAuthErrorResponse } from "@/lib/auth-api";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { EMAIL_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  DraftEmailRequestSchema,
  EmailDraftSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const input = DraftEmailRequestSchema.parse(await request.json());
    const draft = await runCloudflareStructuredOutput({
      systemPrompt: `${EMAIL_SYSTEM_PROMPT}\n\n${input.locale === "us-en" ? "IMPORTANT: Write the entire draft in natural US English." : "重要: 下書きは自然な日本語で書いてください。"}`,
      input,
      schema: EmailDraftSchema,
    });
    return Response.json({ draft });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
