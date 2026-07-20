import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";
import { isAppLocale } from "@/lib/i18n-config";

const englishSections: LegalSection[] = [
  {
    title: "Scope and data controller",
    paragraphs: ["This Privacy Policy explains how the operator of Echly (“we”) handles personal information when you use the service. Before a production launch, the operator’s legal name, address, privacy contact, and any deployment-specific disclosures must be added to this policy."],
  },
  {
    title: "Information we collect",
    paragraphs: ["We collect information you provide, information created through use of the service, and limited technical information needed to operate it."],
    items: [
      "Account data, such as your name, email address, profile image, authentication identifiers, and session information.",
      "Content and workspace data, such as transcripts, reflections, tasks, plans, schedule information, approvals, history, and preferences.",
      "Voice-derived information, such as transcription and limited audio features used to estimate workload signals. Echly does not retain raw recording audio after processing.",
      "Device and delivery data, such as language, time zone, browser or device information, notification permission state, and Push subscription endpoint and encryption keys.",
      "Operational data, such as request logs, errors, security events, and diagnostic information generated while using the service.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: ["We use information only for legitimate service purposes, including:"],
    items: [
      "Authenticating users and maintaining accounts and sessions.",
      "Transcribing check-ins, generating summaries and plans, organizing tasks, and calculating workload signals.",
      "Saving and synchronizing workspace history, plans, preferences, and notification settings.",
      "Sending reminders you enable, including reminders based on your selected time zone.",
      "Preventing abuse, protecting the service, diagnosing errors, and improving reliability and usability.",
      "Meeting legal obligations and enforcing our Terms of Service.",
    ],
  },
  {
    title: "AI and automated processing",
    paragraphs: ["Echly uses automated and AI-assisted processing to transcribe audio, extract tasks, summarize reflections, and propose schedules or messages. Workload signals are intended as productivity guidance and are not medical assessments. Echly does not use this processing to make decisions that produce legal or similarly significant effects about you."],
  },
  {
    title: "Legal grounds",
    paragraphs: ["Depending on where you live, we process information to perform our agreement with you, pursue legitimate interests in operating and securing the service, comply with law, and act on your consent where required. You may withdraw consent for optional processing, such as notifications, without affecting earlier lawful processing."],
  },
  {
    title: "Service providers and disclosures",
    paragraphs: ["We may share information with providers that process data for the service, including Google for sign-in, Turso/libSQL for database storage, Cloudflare Workers AI for AI and transcription processing, Vercel for hosting and scheduled jobs, and browser or platform push services for notifications. The providers actually used can vary by deployment. We may also disclose information when required by law, to protect rights and safety, or as part of a business reorganization with appropriate safeguards. We do not sell personal information."],
  },
  {
    title: "International transfers",
    paragraphs: ["Our service providers may process information in countries other than your own. Where required, we use an available lawful transfer mechanism and appropriate safeguards. Provider locations and safeguards depend on the production deployment."],
  },
  {
    title: "Retention and deletion",
    paragraphs: ["We keep personal information only as long as reasonably necessary for the purposes described above, to provide your account, and to meet legal or security obligations. Raw recording audio is not retained by Echly after processing. Push subscription data is removed from Echly when you turn notifications off on that device. Production-specific retention periods and the request contact must be published before launch."],
  },
  {
    title: "Security",
    paragraphs: ["We use reasonable technical and organizational measures intended to protect personal information, including access controls and secure transmission. No service can guarantee absolute security, so protect your account and avoid submitting information that is not needed."],
  },
  {
    title: "Your choices and rights",
    paragraphs: ["You can change language and notification settings in Echly and can revoke browser notification permission in device settings. Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or receive a copy of your personal information, and to complain to a data-protection authority. A verified request channel must be designated before production launch."],
  },
  {
    title: "Cookies and local storage",
    paragraphs: ["Echly uses cookies and browser storage that are necessary for authentication, language selection, preferences, PWA behavior, and service operation. Any non-essential analytics or advertising technology added later will require an updated notice and, where required, consent."],
  },
  {
    title: "Children and policy changes",
    paragraphs: ["Echly is not directed to children who cannot legally consent to the service in their jurisdiction. We may update this policy as the service or law changes. Material changes will be communicated in the service or by another reasonable method, and the effective date above will be updated."],
  },
];

const japaneseSections: LegalSection[] = [
  {
    title: "適用範囲と個人情報取扱事業者",
    paragraphs: ["本プライバシーポリシーは、Echlyの運営者（以下「当方」）が、本サービスの利用に伴う個人情報をどのように取り扱うかを説明するものです。本番公開前に、運営者の正式名称、住所、個人情報に関する連絡先、およびデプロイ環境固有の事項を本ポリシーに追記する必要があります。"],
  },
  {
    title: "取得する情報",
    paragraphs: ["当方は、利用者が提供する情報、サービスの利用によって作成される情報、および運営に必要な限定的な技術情報を取得します。"],
    items: [
      "氏名、メールアドレス、プロフィール画像、認証識別子、セッション情報等のアカウント情報",
      "文字起こし、振り返り、タスク、予定、スケジュール情報、承認、履歴、設定等のコンテンツおよびワークスペース情報",
      "文字起こしおよび負荷シグナル推定に用いる限定的な音声特徴。Echlyは処理後の録音音声そのものを保持しません",
      "言語、タイムゾーン、ブラウザ・端末情報、通知許可状態、Push通知のエンドポイントおよび暗号鍵等の端末・配信情報",
      "リクエストログ、エラー、セキュリティイベント、診断情報等の運用情報",
    ],
  },
  {
    title: "利用目的",
    paragraphs: ["取得した情報は、以下の正当なサービス提供目的に利用します。"],
    items: [
      "利用者の認証、アカウントおよびセッションの維持",
      "チェックインの文字起こし、要約・予定の生成、タスク整理、負荷シグナルの算出",
      "履歴、予定、設定および通知設定の保存・同期",
      "利用者が有効にした通知の、選択されたタイムゾーンに基づく配信",
      "不正利用の防止、セキュリティ確保、障害調査、信頼性および利便性の改善",
      "法的義務の履行および利用規約の執行",
    ],
  },
  {
    title: "AIおよび自動処理",
    paragraphs: ["Echlyは、音声の文字起こし、タスク抽出、振り返りの要約、予定やメッセージの提案に、自動処理およびAIを利用します。負荷シグナルは生産性に関する参考情報であり、医学的評価ではありません。法的効果または同様に重大な影響を生じさせる判断を、この処理だけで行うことはありません。"],
  },
  {
    title: "処理の法的根拠",
    paragraphs: ["居住地域に応じて、利用者との契約の履行、サービス運営・安全確保に関する正当な利益、法令上の義務、または必要な場合の同意を根拠として情報を処理します。通知等の任意の処理に対する同意は、撤回前の適法な処理に影響を与えることなく撤回できます。"],
  },
  {
    title: "外部委託先および情報提供",
    paragraphs: ["サービス提供のため、Google（ログイン）、Turso/libSQL（データベース）、Cloudflare Workers AI（AI・文字起こし処理）、Vercel（ホスティング・定期処理）、ブラウザまたはプラットフォームのPush通知サービス等に情報を処理させる場合があります。実際に利用する事業者はデプロイ環境により異なります。また、法令に基づく場合、権利・安全を守るために必要な場合、または適切な保護措置を伴う事業再編の場合に情報を開示することがあります。個人情報を販売しません。"],
  },
  {
    title: "国外移転",
    paragraphs: ["外部委託先が、利用者の居住国以外で情報を処理する場合があります。必要な場合は、利用可能な適法な移転根拠および適切な保護措置を講じます。委託先の所在地および保護措置は本番環境の構成により異なります。"],
  },
  {
    title: "保存期間と削除",
    paragraphs: ["個人情報は、上記の目的、アカウントの提供、法令・セキュリティ上の義務に合理的に必要な期間に限り保存します。Echlyは処理後の録音音声そのものを保持しません。端末で通知をオフにすると、EchlyのPush購読情報は削除されます。本番公開前に、具体的な保存期間および請求窓口を掲載する必要があります。"],
  },
  {
    title: "安全管理",
    paragraphs: ["アクセス制御や安全な通信など、個人情報を保護するための合理的な技術的・組織的措置を講じます。ただし、絶対的な安全性を保証できるサービスはありません。アカウントを適切に管理し、不要な情報は入力しないでください。"],
  },
  {
    title: "利用者の選択と権利",
    paragraphs: ["Echlyの設定から言語や通知を変更でき、端末設定からブラウザの通知権限を取り消せます。適用法令に応じて、個人情報の開示、訂正、削除、処理制限、異議申立て、データの受領、および監督機関への申立てを行う権利があります。本番公開前に、本人確認を伴う請求窓口を指定する必要があります。"],
  },
  {
    title: "Cookieおよびブラウザ保存領域",
    paragraphs: ["Echlyは、認証、言語選択、設定、PWA動作およびサービス提供に必要なCookieとブラウザ保存領域を利用します。将来、必須でない分析または広告技術を追加する場合は、本ポリシーを更新し、必要に応じて同意を取得します。"],
  },
  {
    title: "子どもの利用とポリシーの変更",
    paragraphs: ["Echlyは、居住地域で本サービスへの同意を法的に行えない子どもを対象としていません。サービスまたは法令の変更に応じて本ポリシーを更新する場合があります。重要な変更はサービス内その他の合理的な方法で通知し、上記の制定日を更新します。"],
  },
];

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return locale === "us-en"
    ? { title: "Privacy Policy | Echly", description: "How Echly handles personal information and service data." }
    : { title: "プライバシーポリシー | Echly", description: "Echlyにおける個人情報とサービスデータの取扱いについて説明します。" };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  const isEnglish = locale === "us-en";
  return (
    <LegalDocument
      locale={locale}
      title={isEnglish ? "Privacy Policy" : "プライバシーポリシー"}
      description={isEnglish ? "This policy explains what data Echly handles, why, and what choices you have." : "Echlyが取り扱う情報、その目的、および利用者の選択肢について説明します。"}
      sections={isEnglish ? englishSections : japaneseSections}
    />
  );
}
