import { renderLocaleWorkspace } from "../workspace-route";

export default async function LocaleAnalysisPage({
  params,
}: PageProps<"/[locale]/analysis">) {
  const { locale } = await params;
  return renderLocaleWorkspace(locale, "analysis");
}
