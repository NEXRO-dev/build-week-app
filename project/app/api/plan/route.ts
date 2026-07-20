import { getAuthErrorResponse } from "@/lib/auth-api";
import { runCloudflareStructuredOutput } from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";
import { PLAN_SYSTEM_PROMPT } from "@/lib/openai/prompts";
import { PlanGenerationSchema, PlanRequestSchema } from "@/lib/openai/schemas";
import { applySpokenTimesToPlan } from "@/lib/plan/applySpokenTimes";
import {
  completePlanWithTasks,
  createTaskBasedPlan,
} from "@/lib/plan/createTaskBasedPlan";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const input = PlanRequestSchema.parse(await request.json());
    const tomorrowTasks = input.tasks.filter(isTomorrowActionableTask);
    if (!tomorrowTasks.length) {
      return Response.json(
        { code: "NO_TOMORROW_TASKS", error: "明日の予定がありません。" },
        { status: 400 },
      );
    }

    try {
      const generated = await runCloudflareStructuredOutput({
        systemPrompt: `${PLAN_SYSTEM_PROMPT}\n\n${
          input.locale === "us-en"
            ? "IMPORTANT: Return every user-facing string and reason in natural US English."
            : "重要: ユーザー向けの文章と理由はすべて自然な日本語で返してください。"
        }`,
        input: { ...input, tasks: tomorrowTasks },
        schema: PlanGenerationSchema,
      });
      const completed = completePlanWithTasks(
        { condition: input.condition, ...generated },
        tomorrowTasks,
        input.locale,
      );
      const plan = applySpokenTimesToPlan(completed, tomorrowTasks);
      return Response.json({ plan, generationSource: "cloudflare" });
    } catch {
      const fallback = createTaskBasedPlan(
        tomorrowTasks,
        input.condition,
        input.locale,
      );
      const plan = applySpokenTimesToPlan(fallback, tomorrowTasks);
      return Response.json({ plan, generationSource: "fallback" });
    }
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
