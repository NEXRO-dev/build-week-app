import { renderLocaleWorkspace } from "../../workspace-route";

export default async function LocaleApprovalPage({
  params,
}: PageProps<"/[locale]/plan/approval">) {
  const { locale } = await params;
  return renderLocaleWorkspace(locale, "approval");
}
