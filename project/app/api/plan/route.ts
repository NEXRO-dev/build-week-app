import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { PLAN_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { PlanGenerationSchema, PlanRequestSchema } from "@/lib/openai/schemas";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = PlanRequestSchema.parse(await request.json());
    const tomorrowTasks = input.tasks.filter(isTomorrowActionableTask);
    const generated = await runCloudflareStructuredOutput({
      systemPrompt: PLAN_SYSTEM_PROMPT,
      input: { ...input, tasks: tomorrowTasks },
      schema: PlanGenerationSchema,
    });
    return Response.json({ plan: { condition: input.condition, ...generated } });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
