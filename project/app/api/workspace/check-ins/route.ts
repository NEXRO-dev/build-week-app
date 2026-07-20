import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import { upsertCheckIn } from "@/lib/workspace/repository";
import { workspaceApiErrorResponse } from "@/lib/workspace/route-error";
import { CheckInWriteSchema } from "@/lib/workspace/schemas";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const { checkIn } = CheckInWriteSchema.parse(await request.json());
    await upsertCheckIn(session.user.id, checkIn);
    return Response.json({ checkIn });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}
