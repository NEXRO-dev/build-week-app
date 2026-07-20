import { renderLocaleWorkspace } from "../workspace-route";

export default async function LocaleHistoryPage({
  params,
}: PageProps<"/[locale]/history">) {
  const { locale } = await params;
  return renderLocaleWorkspace(locale, "history");
}
