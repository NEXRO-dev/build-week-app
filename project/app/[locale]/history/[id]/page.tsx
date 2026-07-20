import { renderLocaleWorkspace } from "../../workspace-route";

export default async function LocaleHistoryDetailPage({
  params,
}: PageProps<"/[locale]/history/[id]">) {
  const { locale, id } = await params;
  return renderLocaleWorkspace(locale, "history", id);
}
