import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import {
  importWorkspace,
  loadWorkspace,
} from "@/lib/workspace/repository";
import { workspaceApiErrorResponse } from "@/lib/workspace/route-error";
import { WorkspaceImportSchema } from "@/lib/workspace/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    return Response.json(await loadWorkspace(session.user.id));
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const input = WorkspaceImportSchema.parse(await request.json());
    await importWorkspace(
      session.user.id,
      input.history,
      input.scheduleEntries,
    );
    return Response.json({ imported: true });
  } catch (error) {
    return workspaceApiErrorResponse(error);
  }
}
