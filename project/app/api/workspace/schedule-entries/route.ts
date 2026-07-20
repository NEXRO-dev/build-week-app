import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import {
  deleteScheduleEntry,
  upsertScheduleEntry,
} from "@/lib/workspace/repository";
import { workspaceApiErrorResponse } from "@/lib/workspace/route-error";
import {
  ScheduleEntryDeleteSchema,
  ScheduleEntryWriteSchema,
} from "@/lib/workspace/schemas";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const { scheduleEntry } = ScheduleEntryWriteSchema.parse(
      await request.json(),
    );
    await upsertScheduleEntry(session.user.id, scheduleEntry);
    return Response.json({ scheduleEntry });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const { id } = ScheduleEntryDeleteSchema.parse(await request.json());
    const deleted = await deleteScheduleEntry(session.user.id, id);
    return Response.json({ deleted });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}
