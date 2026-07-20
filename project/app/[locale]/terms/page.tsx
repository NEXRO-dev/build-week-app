import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";
import { isAppLocale } from "@/lib/i18n-config";

const englishSections: LegalSection[] = [
  {
    title: "Acceptance of these Terms",
    paragraphs: ["These Terms of Service govern your access to and use of Echly. By using the service, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service."],
  },
  {
    title: "What Echly provides",
    paragraphs: ["Echly is a voice-based work assistant that can transcribe check-ins, summarize reflections, organize tasks, estimate workload signals, propose plans, and provide reminders. Features may change as the service develops."],
  },
  {
    title: "Accounts and eligibility",
    paragraphs: ["You must provide accurate account information, protect access to your account, and promptly report suspected unauthorized use. You must meet the minimum age required to consent to online services in your jurisdiction; otherwise, a parent or guardian must authorize your use."],
  },
  {
    title: "AI output and your responsibility",
    paragraphs: ["Transcriptions, summaries, workload estimates, schedules, and other AI-generated output may be incomplete or inaccurate. Review important output before relying on it. You remain responsible for your decisions, communications, calendar changes, and work."],
  },
  {
    title: "Health and emergency disclaimer",
    paragraphs: ["Echly is a productivity tool, not a medical device or healthcare service. It does not provide medical diagnosis, treatment, or emergency support. If you may be in danger or need medical help, contact local emergency services or a qualified professional."],
  },
  {
    title: "Connected services and approvals",
    paragraphs: ["Some features may connect to third-party services such as identity, calendar, AI, hosting, database, or push-notification providers. Their own terms and policies may apply. Where Echly asks for approval before an external action, you must review the proposed action before approving it."],
  },
  {
    title: "Acceptable use",
    paragraphs: ["You may not misuse Echly or help another person do so."],
    items: [
      "Do not violate laws or another person’s rights.",
      "Do not upload content you lack permission to process.",
      "Do not attempt to bypass security, disrupt the service, or access another user’s data.",
      "Do not use output to make unlawful, deceptive, discriminatory, or harmful decisions.",
    ],
  },
  {
    title: "Your content and service rights",
    paragraphs: ["You retain your rights in content you submit. You grant the service operator a limited right to host, process, transmit, and display that content only as needed to provide, secure, and improve Echly. Echly and its software, branding, and original materials remain protected by applicable intellectual-property laws."],
  },
  {
    title: "Privacy",
    paragraphs: ["Our collection and use of personal information is described in the Privacy Policy. Do not submit sensitive information unless it is necessary and you are comfortable with the processing described there."],
  },
  {
    title: "Availability, changes, and termination",
    paragraphs: ["The service may be changed, suspended, or discontinued, and may occasionally be unavailable. We may restrict or terminate access when reasonably necessary for security, legal compliance, service integrity, or a material breach of these Terms. You may stop using Echly at any time."],
  },
  {
    title: "Disclaimers and limitation of liability",
    paragraphs: ["To the extent permitted by law, Echly is provided “as is” and “as available,” without warranties that it will be uninterrupted, error-free, or fit for a particular purpose. To the extent permitted by law, the operator is not liable for indirect, incidental, special, consequential, or punitive losses arising from use of the service. Nothing in these Terms excludes rights or liability that cannot legally be excluded."],
  },
  {
    title: "Governing law and changes to these Terms",
    paragraphs: ["These Terms are governed by the laws of Japan, without limiting any mandatory consumer protections that apply where you live. Unless mandatory law requires otherwise, disputes are subject to the exclusive jurisdiction of the Tokyo District Court. Material updates will be communicated in the service or by another reasonable method, and the effective date above will be updated."],
  },
];

const japaneseSections: LegalSection[] = [
  {
    title: "規約への同意",
    paragraphs: ["本利用規約は、Echlyへのアクセスおよび利用に適用されます。本サービスを利用することで、本規約およびプライバシーポリシーに同意したものとみなされます。同意しない場合は、本サービスを利用しないでください。"],
  },
  {
    title: "Echlyが提供する機能",
    paragraphs: ["Echlyは、音声チェックインの文字起こし、振り返りの要約、タスク整理、負荷シグナルの推定、予定の提案、通知などを行うワークアシスタントです。サービスの発展に伴い、機能を変更する場合があります。"],
  },
  {
    title: "アカウントと利用資格",
    paragraphs: ["正確なアカウント情報を提供し、アカウントへのアクセスを適切に管理してください。不正利用が疑われる場合は速やかにお知らせください。居住地域でオンラインサービスへの同意に必要な年齢に達していない場合は、保護者の同意が必要です。"],
  },
  {
    title: "AIの出力と利用者の責任",
    paragraphs: ["文字起こし、要約、負荷推定、予定その他のAI出力は、不完全または不正確な場合があります。重要な内容は利用前に確認してください。意思決定、コミュニケーション、カレンダー変更および業務についての最終的な責任は利用者にあります。"],
  },
  {
    title: "医療・緊急時に関する注意",
    paragraphs: ["Echlyは生産性向上のためのツールであり、医療機器または医療サービスではありません。診断、治療、緊急対応を提供しません。危険が迫っている場合や医療上の支援が必要な場合は、地域の緊急窓口または有資格の専門家に連絡してください。"],
  },
  {
    title: "外部サービスと承認",
    paragraphs: ["一部の機能は、認証、カレンダー、AI、ホスティング、データベース、Push通知等の外部サービスと連携します。各外部サービスの規約およびポリシーが適用される場合があります。外部操作の前にEchlyが承認を求める場合は、内容を確認した上で承認してください。"],
  },
  {
    title: "禁止事項",
    paragraphs: ["Echlyを不正に利用し、または第三者の不正利用を助けてはなりません。"],
    items: [
      "法令または第三者の権利を侵害する行為",
      "処理する権限のないコンテンツを入力する行為",
      "セキュリティの回避、サービスの妨害、他の利用者のデータへの不正アクセス",
      "違法、欺瞞的、差別的または有害な判断のために出力を利用する行為",
    ],
  },
  {
    title: "利用者のコンテンツとサービスの権利",
    paragraphs: ["利用者は入力したコンテンツに関する権利を保持します。利用者は、Echlyの提供、安全確保および改善に必要な範囲で、当該コンテンツを保存、処理、送信および表示する限定的な権利を運営者に許諾します。Echlyのソフトウェア、ブランドおよび独自素材は、適用される知的財産法により保護されます。"],
  },
  {
    title: "プライバシー",
    paragraphs: ["個人情報の収集および利用については、プライバシーポリシーに記載します。必要がなく、記載された処理に同意できない機微な情報は入力しないでください。"],
  },
  {
    title: "提供、変更および利用停止",
    paragraphs: ["本サービスは変更、一時停止または終了する場合があり、一時的に利用できない場合もあります。セキュリティ、法令遵守、サービスの健全性確保、または本規約の重大な違反への対応として合理的に必要な場合、アクセスを制限または停止することがあります。利用者はいつでも利用を終了できます。"],
  },
  {
    title: "免責および責任の制限",
    paragraphs: ["法令で認められる範囲において、Echlyは現状有姿かつ提供可能な状態で提供され、中断や誤りがないこと、特定目的に適合することを保証しません。法令で認められる範囲において、運営者は本サービスの利用から生じる間接的、付随的、特別、結果的または懲罰的損害について責任を負いません。本規約は、法令上排除できない利用者の権利または責任を排除するものではありません。"],
  },
  {
    title: "準拠法、管轄および規約の変更",
    paragraphs: ["本規約は日本法に準拠します。ただし、利用者の居住地域で適用される強行的な消費者保護法を制限しません。強行法規に別段の定めがない限り、紛争の専属的合意管轄裁判所は東京地方裁判所とします。重要な変更はサービス内その他の合理的な方法で通知し、上記の制定日を更新します。"],
  },
];

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return locale === "us-en"
    ? { title: "Terms of Service | Echly", description: "Terms governing your use of Echly." }
    : { title: "利用規約 | Echly", description: "Echlyの利用に適用される規約です。" };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  const isEnglish = locale === "us-en";
  return (
    <LegalDocument
      locale={locale}
      title={isEnglish ? "Terms of Service" : "利用規約"}
      description={isEnglish ? "Please read these terms before using Echly." : "Echlyをご利用になる前に、以下の内容をご確認ください。"}
      sections={isEnglish ? englishSections : japaneseSections}
    />
  );
}
