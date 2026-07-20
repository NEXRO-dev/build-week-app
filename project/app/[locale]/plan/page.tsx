import { renderLocaleWorkspace } from "../workspace-route";

export default async function LocalePlanPage({
  params,
}: PageProps<"/[locale]/plan">) {
  const { locale } = await params;
  return renderLocaleWorkspace(locale, "plan");
}
