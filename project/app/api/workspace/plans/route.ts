import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import {
  deletePlanRecord,
  upsertPlanRecord,
} from "@/lib/workspace/repository";
import { workspaceApiErrorResponse } from "@/lib/workspace/route-error";
import {
  PlanRecordDeleteSchema,
  PlanRecordWriteSchema,
} from "@/lib/workspace/schemas";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const { planRecord } = PlanRecordWriteSchema.parse(await request.json());
    await upsertPlanRecord(session.user.id, planRecord);
    return Response.json({ planRecord });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const { targetDate } = PlanRecordDeleteSchema.parse(await request.json());
    const deleted = await deletePlanRecord(session.user.id, targetDate);
    return Response.json({ deleted });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}
