import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { EMAIL_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import {
  DraftEmailRequestSchema,
  EmailDraftSchema,
} from "@/lib/openai/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = DraftEmailRequestSchema.parse(await request.json());
    const draft = await runCloudflareStructuredOutput({
      systemPrompt: EMAIL_SYSTEM_PROMPT,
      input,
      schema: EmailDraftSchema,
    });
    return Response.json({ draft });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
