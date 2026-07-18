# Echly Development Plan

## 目的

`ECHLY_PRODUCT_PLAN_SUMMARY.md` の内容をもとに、React、TypeScript、Next.jsでEchlyのMVPを開発する。UIコンポーネントはHeroUIを採用し、AI処理は基本的にOpenAI APIを使用する。

MVPの最重要体験は、ユーザーが夜に音声で話すだけで、翌日のタスク、予定、負荷シグナル、調整案、メール下書きまで確認できること。

## 前提

- フレームワーク: Next.js App Router
- 言語: TypeScript
- UI: HeroUI
- スタイリング: Tailwind CSS v4
- AI: OpenAI API
- 音声入力: Browser MediaRecorder API
- 初期データ保存: ローカル状態または簡易DB
- 外部連携: Google Calendar / Gmail は後半フェーズで接続

現在のプロジェクトは `next@16.2.10`、`react@19.2.4`、`tailwindcss@4` を利用しているため、HeroUIの要件に合う構成として進める。

## 参照ドキュメント

- HeroUI Frameworks: https://heroui.com/en/docs/react/getting-started/frameworks
- HeroUI CLI: https://heroui.com/en/docs/react/getting-started/cli
- HeroUI Components: https://heroui.com/en/docs/react/components
- OpenAI Developer Quickstart: https://platform.openai.com/docs/quickstart/make-your-first-api-request
- OpenAI Audio API Reference: https://platform.openai.com/docs/api-reference/audio
- OpenAI Responses API Reference: https://platform.openai.com/docs/api-reference/responses

## プロダクトスコープ

### MVPで作るもの

- 音声チェックイン画面
- 録音、停止、再生、送信
- 音声の文字起こし
- 発話テキストからのタスク抽出
- 簡易的な負荷シグナル推定
- 翌日プラン生成
- 維持、移動、延期、休息ブロックの提案
- 調整メール下書き生成
- 承認前の差分確認UI
- デモ用の疑似Calendar/Gmail反映

### MVPで作らないもの

- 医学的な疲労、ストレス診断
- 本人承認なしのCalendar変更
- 本人承認なしのメール送信
- 企業管理者向けの個人監視機能
- 高精度な音声バイオマーカーモデル
- B2B管理画面

## 推奨アーキテクチャ

```text
Browser
  - MediaRecorder
  - HeroUI UI
  - Zustand or React state
  - Timeline / approval views

Next.js App Router
  - Server Actions or Route Handlers
  - OpenAI API client
  - Audio upload handling
  - Structured JSON validation

OpenAI
  - Audio transcription
  - Task extraction
  - Plan generation
  - Email draft generation

Future Integrations
  - Google OAuth
  - Google Calendar API
  - Gmail Draft API
  - Supabase / PostgreSQL
```

## OpenAI API設計

### 1. 音声文字起こし

録音ファイルをNext.js Route Handlerに送信し、サーバー側からOpenAI Audio Transcriptions APIを呼び出す。

候補モデル:

- `gpt-4o-transcribe`
- `gpt-4o-mini-transcribe`

初期方針:

- MVPはコストと速度を優先し、`gpt-4o-mini-transcribe` から開始する。
- デモ品質が不足する場合は `gpt-4o-transcribe` に切り替える。
- 音声ファイルは処理後に保存しない。

### 2. タスク抽出

文字起こしテキストから、タスク、予定、期限、関係者、悩み、明示された疲労表現を抽出する。

OpenAI Responses APIでStructured Outputsを使い、以下のような型に揃える。

```ts
type ExtractedTask = {
  id: string;
  title: string;
  type: "meeting" | "focus_work" | "admin" | "communication" | "personal" | "unknown";
  date?: string;
  startTime?: string;
  endTime?: string;
  deadline?: string;
  people: string[];
  importance: "high" | "medium" | "low";
  movable: boolean;
  burden: "high" | "medium" | "low";
  sourceText: string;
};
```

### 3. 負荷シグナル推定

MVPでは2系統を組み合わせる。

- 音響特徴: 音量、無音比率、発話速度、録音時間
- 発話内容: 疲労、睡眠不足、焦り、限界感を示す表現

表示は医学的な数値ではなく、以下の3段階にする。

- 通常
- 注意
- 高負荷

UI表現:

- 「負荷シグナル: 高」
- 「通常時より高い可能性」
- 「診断ではなく、音声と発話内容からの推定です」

### 4. 翌日プラン生成

抽出タスク、負荷シグナル、仮Calendar予定、勤務時間、休息方針を入力にして、翌日プランを生成する。

出力型:

```ts
type TomorrowPlan = {
  condition: {
    level: "normal" | "caution" | "high";
    summary: string;
    signals: string[];
  };
  keep: PlanItem[];
  move: PlanItem[];
  reschedule: PlanItem[];
  restBlocks: RestBlock[];
  emailDrafts: EmailDraft[];
  rationale: string[];
};
```

### 5. メール下書き生成

Gmail送信ではなく、MVPでは下書き文面の生成までに留める。

出力内容:

- 宛先候補
- 件名
- 本文
- 変更理由
- 送信前の注意点

## 画面設計

### 1. Home / Check-in

目的:

- 迷わず録音開始できる状態にする。

HeroUI候補:

- `Button`
- `Card`
- `Chip`
- `Progress`
- `Tooltip`

主なUI:

- 大きな録音ボタン
- 録音状態表示
- 録音時間
- 再生、破棄、解析ボタン
- 前回チェックインの負荷シグナル

### 2. Analysis

目的:

- Echlyが声と内容を理解していることを見せる。

HeroUI候補:

- `Card`
- `Tabs`
- `Snippet`
- `Progress`
- `Accordion`
- `Chip`

主なUI:

- 文字起こし結果
- 抽出タスクカード
- 負荷シグナル
- 推定根拠
- 修正可能なタスク項目

### 3. Tomorrow Plan

目的:

- 明日の予定をどう守り、どこを軽くするかを提示する。

HeroUI候補:

- `Card`
- `Listbox`
- `Divider`
- `Badge`
- `Chip`
- `ButtonGroup`

主なUI:

- タイムライン
- 維持する予定
- 移動する作業
- 延期候補
- 休息ブロック
- 判断理由

### 4. Approval

目的:

- AIが外部変更を行う前に、ユーザーが差分を確認できるようにする。

HeroUI候補:

- `Modal`
- `Table`
- `Checkbox`
- `Switch`
- `Button`

主なUI:

- Calendar変更案
- Gmail下書き案
- 個別承認
- 一括承認
- 適用結果

### 5. History

目的:

- 過去のチェックインと負荷推移を確認できるようにする。

MVPでは簡易表示に留める。

主なUI:

- 過去7日分のチェックイン
- 負荷シグナル
- 実行した調整
- 翌日自己評価

### 6. Settings

目的:

- データ保存、Google連携、権限、安全設定を管理する。

MVPでは未接続状態のUIだけ作り、連携は後続フェーズで実装する。

## データモデル

```ts
type CheckIn = {
  id: string;
  createdAt: string;
  transcript: string;
  audioMeta: AudioMeta;
  condition: ConditionSignal;
  tasks: ExtractedTask[];
  plan: TomorrowPlan;
  approvalStatus: "draft" | "approved" | "partially_approved" | "rejected";
};

type AudioMeta = {
  durationSec: number;
  averageVolume?: number;
  silenceRatio?: number;
  speechRate?: number;
};

type ConditionSignal = {
  level: "normal" | "caution" | "high";
  label: string;
  summary: string;
  evidence: string[];
  disclaimer: string;
};

type PlanItem = {
  id: string;
  title: string;
  originalTime?: string;
  proposedTime?: string;
  reason: string;
  impact: "low" | "medium" | "high";
};

type RestBlock = {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
};

type EmailDraft = {
  id: string;
  to: string[];
  subject: string;
  body: string;
  relatedTaskId?: string;
  tone: "polite" | "casual" | "formal";
};
```

## ディレクトリ設計

```text
app/
  page.tsx
  layout.tsx
  api/
    transcribe/route.ts
    analyze/route.ts
    plan/route.ts
    draft-email/route.ts

components/
  check-in/
    RecorderPanel.tsx
    AudioPreview.tsx
  analysis/
    TranscriptCard.tsx
    TaskExtractionList.tsx
    ConditionSignalCard.tsx
  plan/
    TomorrowTimeline.tsx
    PlanSection.tsx
    RestBlockCard.tsx
  approval/
    ApprovalModal.tsx
    CalendarDiffTable.tsx
    EmailDraftCard.tsx
  layout/
    AppShell.tsx
    TopNav.tsx

lib/
  openai/
    client.ts
    schemas.ts
    prompts.ts
  audio/
    analyzeAudio.ts
  demo/
    mockCalendar.ts
    sampleCheckIns.ts
  validation/
    checkInSchema.ts

types/
  echly.ts
```

## 実装フェーズ

### Phase 0: セットアップ

目標:

- HeroUIとOpenAI SDKを導入し、開発基盤を整える。

作業:

- `@heroui/react` を導入
- 必要に応じて `framer-motion` を導入
- `openai` SDKを導入
- `.env.local.example` を作成
- `OPENAI_API_KEY` をサーバー側のみで参照
- HeroUIの基本Button表示を確認
- 既存のNext.jsスターター画面をEchly用AppShellへ置き換える

完了条件:

- `npm run lint` が通る
- `npm run build` が通る
- HeroUIのButtonが表示される

### Phase 1: 音声チェックイン

目標:

- 録音して、音声ファイルをサーバーへ送信できる。

作業:

- MediaRecorderで録音
- 録音時間の表示
- 録音の再生
- 録音破棄
- `/api/transcribe` へ送信
- OpenAI Audio Transcriptions APIで文字起こし
- 結果を画面に表示

完了条件:

- 30秒から2分程度の日本語音声を録音できる
- 文字起こし結果が画面に表示される
- 音声ファイルはサーバーに永続保存しない

### Phase 2: タスク抽出と負荷シグナル

目標:

- 発話内容からタスクと負荷シグナルを抽出する。

作業:

- `/api/analyze` を作成
- OpenAI Responses APIでStructured Outputsを使用
- タスク抽出スキーマを定義
- 簡易音響特徴を算出
- 発話内容と音響特徴を統合して負荷シグナルを作成
- 抽出タスクを編集可能なカードとして表示

完了条件:

- デモ発話から3件以上の予定、タスクを抽出できる
- 負荷シグナルが通常、注意、高負荷のいずれかで表示される
- 推定であり診断ではない旨が常に見える

### Phase 3: 翌日プラン生成

目標:

- タスク、負荷、仮予定をもとに翌日の実行計画を生成する。

作業:

- `/api/plan` を作成
- デモ用Calendar予定を用意
- 維持、移動、延期、休息ブロックを生成
- 判断理由を表示
- タイムラインUIを作成

完了条件:

- 高負荷時に休息ブロックが提案される
- 移動可能な低重要度予定が延期候補になる
- 重要予定は維持される
- 判断理由がユーザーに説明される

### Phase 4: 承認UIとメール下書き

目標:

- 外部変更前に、ユーザーが差分と下書きを確認できる。

作業:

- Approval画面を作成
- Calendar変更案の差分表示
- Gmail下書きカードを作成
- 個別承認、一括承認
- デモ用の「適用済み」状態を実装

完了条件:

- ユーザーが承認した項目だけ適用状態になる
- メール本文が自然で失礼のない文面になる
- 自動送信はしない

### Phase 5: Google連携

目標:

- 実Google CalendarとGmail Draftに接続する。

作業:

- Google OAuth設定
- Calendar read/write scope
- Gmail compose scope
- Calendar予定取得
- Calendarイベント作成、更新
- Gmail下書き作成
- 監査ログ保存

完了条件:

- テストGoogleアカウントでCalendar変更が成功する
- Gmailに下書きが作成される
- 送信は常にユーザー操作に委ねる

### Phase 6: 履歴と安全設計

目標:

- 継続利用と信頼性に必要な履歴、安全設定を追加する。

作業:

- CheckIn履歴保存
- 過去7日分の表示
- 音声保存オプトイン
- 文字起こし保存設定
- 負荷判定の訂正
- 操作ログ

完了条件:

- ユーザーが保存方針を理解、変更できる
- 音声生データはデフォルトで保存されない
- 負荷判定をユーザーが訂正できる

## UIデザイン方針

- 画面は実用アプリとして設計し、ランディングページにしない。
- 最初の画面は録音チェックインにする。
- HeroUIコンポーネントを基本にし、独自UIは最小限にする。
- 重要操作は `Button`、危険操作は色と文言で明確にする。
- 負荷シグナルは不安を煽る赤一色にしない。
- 承認前後の差分を明確に表示する。
- モバイルでも録音、確認、承認が無理なく使えるようにする。

## セキュリティとプライバシー

- `OPENAI_API_KEY` は必ずサーバー側でのみ使用する。
- ブラウザへAPIキーを渡さない。
- 音声ファイルは処理後に破棄する。
- 保存は明示的なオプトインにする。
- 負荷推定は診断ではないと表示する。
- Calendar変更とGmail下書き作成は承認後のみ実行する。
- メール送信はMVP範囲外にする。
- 操作ログには、変更内容、承認時刻、結果を残す。

## 環境変数

```bash
OPENAI_API_KEY=

# Phase 5以降
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

## 導入予定パッケージ

```bash
npm install @heroui/react framer-motion openai zod
```

必要に応じて追加:

```bash
npm install zustand
npm install @react-oauth/google
```

## APIルート案

### `POST /api/transcribe`

入力:

- `multipart/form-data`
- `audio`

処理:

- 音声ファイルをOpenAIへ送信
- 文字起こしテキストを返す

出力:

```json
{
  "transcript": "明日は10時にA社の予算会議..."
}
```

### `POST /api/analyze`

入力:

```json
{
  "transcript": "...",
  "audioMeta": {}
}
```

出力:

```json
{
  "tasks": [],
  "condition": {}
}
```

### `POST /api/plan`

入力:

```json
{
  "tasks": [],
  "condition": {},
  "calendarEvents": []
}
```

出力:

```json
{
  "plan": {}
}
```

### `POST /api/draft-email`

入力:

```json
{
  "rescheduleItem": {},
  "tone": "polite"
}
```

出力:

```json
{
  "draft": {}
}
```

## プロンプト設計方針

- システムプロンプトで医学的診断を禁止する。
- 「負荷シグナル」は推定として扱う。
- 予定変更は提案に留める。
- 出力は必ずJSON Schemaに従わせる。
- 変更理由を短く、ユーザー向けに説明する。
- メール文面は日本語で丁寧にし、断定的な体調説明を避ける。

## テスト計画

### 単体テスト

- タスク抽出スキーマのバリデーション
- 負荷シグナル算出
- プラン生成結果の型チェック
- メール下書き生成の最低限の構造チェック

### UI確認

- 録音開始、停止、再生
- 解析中ローディング
- タスク編集
- プラン表示
- 承認モーダル
- モバイル表示

### デモ確認

- サンプル発話で30秒以内に結果表示
- 高負荷シグナルが表示される
- 休息ブロックが提案される
- 延期メール下書きが生成される

## デモ用サンプル発話

```text
明日は10時にA社の予算会議。午後は資料の仕上げ、17時からCさんとブレスト。でも、今日はほとんど寝てなくて、正直もう頭が回らない。
```

期待結果:

- A社の予算会議は維持
- 資料作成は集中時間として整理
- Cさんとのブレストは延期候補
- 13:00から15:00に休息または回復ブロック
- Cさん宛ての日程変更メール下書き

## リスクと対策

| リスク | 対策 |
| --- | --- |
| 音声認識が不安定 | デモ発話を複数用意し、テキスト入力フォールバックを用意する |
| 負荷推定が過剰に見える | 診断表現を避け、推定と通常時との差に限定する |
| OpenAI出力が揺れる | Structured OutputsとZodで検証する |
| Google連携に時間がかかる | Phase 4まではデモ用モックで完成させる |
| メール文面が不自然 | 下書き生成プロンプトと編集UIを分離する |
| APIキー漏洩 | サーバーRoute HandlerからのみOpenAIを呼ぶ |

## 優先順位

### Must

- 録音
- 文字起こし
- タスク抽出
- 負荷シグナル
- 翌日プラン
- 休息ブロック
- メール下書き
- 承認UI

### Should

- 履歴
- 負荷推移
- Google Calendar実連携
- Gmail Draft実連携

### Could

- PWA通知
- Tauriラップ
- 個人ベースライン学習
- 自己評価入力

## 最初の実装順

1. HeroUIとOpenAI SDKを導入する。
2. 既存スターター画面をEchlyのCheck-in画面へ置き換える。
3. MediaRecorderで録音UIを作る。
4. `/api/transcribe` を実装する。
5. 文字起こし結果をAnalysis画面へ表示する。
6. `/api/analyze` でタスクと負荷シグナルを生成する。
7. `/api/plan` で翌日プランを生成する。
8. Approval UIで差分とメール下書きを確認できるようにする。
9. デモ用モックGoogle反映を実装する。
10. Google実連携へ進む。

## 完了定義

MVP完了時点で、ユーザーは以下を1本の流れで実行できる。

1. 夜の予定や疲れを音声で話す。
2. Echlyが文字起こしする。
3. Echlyがタスクと負荷シグナルを表示する。
4. Echlyが翌日の守る予定、動かす予定、休息ブロックを提示する。
5. Echlyが日程変更メールの下書きを作る。
6. ユーザーが承認した変更だけ適用される。

この段階では、Echlyの価値である「疲れている時ほど、話すだけで明日が軽くなる」をデモできる状態を完成とする。
