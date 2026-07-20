import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import { updateWorkspacePreferences } from "@/lib/workspace/repository";
import { workspaceApiErrorResponse } from "@/lib/workspace/route-error";
import { WorkspacePreferencesSchema } from "@/lib/workspace/schemas";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const preferences = WorkspacePreferencesSchema.parse(await request.json());
    await updateWorkspacePreferences(
      session.user.id,
      preferences.saveTranscript,
      preferences.requireCalendarApproval,
    );
    return Response.json({ preferences });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}
