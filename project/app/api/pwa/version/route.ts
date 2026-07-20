export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    null;

  return Response.json(
    { version },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
