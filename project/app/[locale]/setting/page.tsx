import { renderLocaleWorkspace } from "../workspace-route";

export default async function LocaleSettingPage({
  params,
}: PageProps<"/[locale]/setting">) {
  const { locale } = await params;
  return renderLocaleWorkspace(locale, "settings");
}
