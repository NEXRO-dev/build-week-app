import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { getAuthErrorResponse } from "@/lib/auth-api";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { PLAN_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { PlanGenerationSchema, PlanRequestSchema } from "@/lib/openai/schemas";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const input = PlanRequestSchema.parse(await request.json());
    const tomorrowTasks = input.tasks.filter(isTomorrowActionableTask);
    const generated = await runCloudflareStructuredOutput({
      systemPrompt: `${PLAN_SYSTEM_PROMPT}\n\n${input.locale === "us-en" ? "IMPORTANT: Return every user-facing string, reason, and email draft in natural US English." : "重要: ユーザー向けの文字列はすべて自然な日本語で返してください。"}`,
      input: { ...input, tasks: tomorrowTasks },
      schema: PlanGenerationSchema,
    });
    return Response.json({ plan: { condition: input.condition, ...generated } });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
