"use client";

import { Button, Card, Chip, Switch } from "@heroui/react";
import {
  CalendarDays,
  Database,
  ExternalLink,
  KeyRound,
  Mail,
  Mic,
  Settings,
  ShieldCheck,
} from "lucide-react";

type SettingsViewProps = {
  saveTranscript: boolean;
  onSaveTranscriptChange: (value: boolean) => void;
};

function SettingsSwitch({
  selected,
  onChange,
  label,
  description,
  disabled = false,
}: {
  selected: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-[#35413e]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[#73807c]">{description}</p>
      </div>
      <Switch isSelected={selected} onChange={onChange} isDisabled={disabled} size="sm">
        <Switch.Content aria-label={label}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}

export function SettingsView({ saveTranscript, onSaveTranscriptChange }: SettingsViewProps) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section>
        <p className="flex items-center gap-2 text-xs font-medium text-[#687370]">
          <Settings size={16} />
          Preferences
        </p>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-8">設定</h1>
        <p className="mt-1 text-sm leading-6 text-[#687471]">
          データ保存、外部連携、安全設定を管理します。
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-[#dbe1df] bg-white shadow-none">
          <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
            <Card.Title className="flex items-center gap-2 text-lg font-semibold">
              <Database size={19} className="text-[#2f6b60]" />
              データとプライバシー
            </Card.Title>
            <Card.Description className="mt-1 text-sm text-[#6e7976]">
              初期設定は保存を最小限にしています
            </Card.Description>
          </Card.Header>
          <Card.Content className="divide-y divide-[#e3e8e6] px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
            <SettingsSwitch
              selected={saveTranscript}
              onChange={onSaveTranscriptChange}
              label="文字起こしを履歴に保存"
              description="オフの場合、承認結果だけをローカルに残します"
            />
            <SettingsSwitch
              selected={false}
              onChange={() => undefined}
              label="音声データを保存"
              description="MVPでは利用できません。音声は解析後に破棄されます"
              disabled
            />
          </Card.Content>
        </Card>

        <Card className="border border-[#dbe1df] bg-white shadow-none">
          <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
            <Card.Title className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound size={19} className="text-[#9c6a22]" />
              AI接続
            </Card.Title>
            <Card.Description className="mt-1 text-sm text-[#6e7976]">
              サーバー側の環境変数からOpenAIを利用
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
            <div className="flex items-center justify-between rounded-md border border-[#e0e5e3] bg-[#fafbfa] p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-md bg-[#f3e7d1] text-[#95631b]">
                  <KeyRound size={17} />
                </span>
                <div>
                  <p className="text-sm font-medium">OpenAI API</p>
                  <p className="mt-0.5 text-xs text-[#74807d]">OPENAI_API_KEY</p>
                </div>
              </div>
              <Chip size="sm" variant="soft" color="warning">
                要設定
              </Chip>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#6c7774]">
              キーはブラウザへ送信されません。設定後に開発サーバーを再起動すると、音声文字起こしとAI解析が有効になります。
            </p>
          </Card.Content>
        </Card>

        <Card className="border border-[#dbe1df] bg-white shadow-none lg:col-span-2">
          <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
            <Card.Title className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays size={19} className="text-[#456d82]" />
              Google連携
            </Card.Title>
            <Card.Description className="mt-1 text-sm text-[#6e7976]">
              Phase 5でOAuthと実サービスを接続します
            </Card.Description>
          </Card.Header>
          <Card.Content className="grid gap-3 px-5 pb-5 pt-5 sm:grid-cols-2 sm:px-6 sm:pb-6">
            {[
              {
                icon: CalendarDays,
                title: "Google Calendar",
                description: "予定の読み取り・承認済み変更",
              },
              {
                icon: Mail,
                title: "Gmail Draft",
                description: "承認済みメールの下書き作成のみ",
              },
            ].map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.title} className="flex items-center justify-between gap-3 rounded-md border border-[#e0e5e3] bg-[#fafbfa] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-md bg-[#e5edf1] text-[#456d82]">
                      <Icon size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{service.title}</p>
                      <p className="mt-0.5 text-xs text-[#74807d]">{service.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" isDisabled>
                    未接続
                    <ExternalLink size={14} />
                  </Button>
                </div>
              );
            })}
          </Card.Content>
        </Card>
      </div>

      <section className="grid gap-4 rounded-md border border-[#cfe0da] bg-[#eaf3f0] p-5 sm:grid-cols-[auto_1fr] sm:p-6">
        <span className="grid size-10 place-items-center rounded-md bg-white text-[#2f6b60] shadow-sm">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 className="font-semibold text-[#2f514a]">Echlyの安全方針</h2>
          <p className="mt-1 text-sm leading-6 text-[#58716a]">
            負荷シグナルは医学的診断ではありません。Calendar変更とメール下書きは、必ず内容を確認して承認した項目だけが対象になります。
          </p>
          <p className="mt-3 flex items-center gap-2 text-xs text-[#617a73]">
            <Mic size={14} />
            音声生データはデフォルトで保存されません
          </p>
        </div>
      </section>
    </div>
  );
}
