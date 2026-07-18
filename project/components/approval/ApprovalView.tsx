"use client";

import {
  Button,
  Card,
  Checkbox,
  Chip,
  Label,
  Modal,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  ArrowLeft,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  Mail,
  PencilLine,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { EmailDraft, TomorrowPlan } from "@/types/echly";

type ApprovalViewProps = {
  plan: TomorrowPlan;
  appliedActionIds: string[];
  onPlanChange: (plan: TomorrowPlan) => void;
  onApply: (ids: string[]) => void;
  onBack: () => void;
};

type CalendarAction = {
  id: string;
  title: string;
  before: string;
  after: string;
  reason: string;
  kind: "move" | "reschedule" | "rest";
};

function getCalendarActions(plan: TomorrowPlan): CalendarAction[] {
  return [
    ...plan.move.map((item) => ({
      id: item.id,
      title: item.title,
      before: item.originalTime ?? "時間未定",
      after: item.proposedTime ?? "時間未定",
      reason: item.reason,
      kind: "move" as const,
    })),
    ...plan.reschedule.map((item) => ({
      id: item.id,
      title: item.title,
      before: item.originalTime ?? "時間未定",
      after: item.proposedTime ?? "翌日以降",
      reason: item.reason,
      kind: "reschedule" as const,
    })),
    ...plan.restBlocks.map((item) => ({
      id: item.id,
      title: "回復ブロックを追加",
      before: "予定なし",
      after: `${item.startTime} - ${item.endTime}`,
      reason: item.reason,
      kind: "rest" as const,
    })),
  ];
}

function ApprovalCheckbox({
  isSelected,
  onChange,
  label,
}: {
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  label: string;
}) {
  return (
    <Checkbox isSelected={isSelected} onChange={onChange} aria-label={label}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <span className="text-sm font-medium text-[#3b4744]">{label}</span>
      </Checkbox.Content>
    </Checkbox>
  );
}

export function ApprovalView({
  plan,
  appliedActionIds,
  onPlanChange,
  onApply,
  onBack,
}: ApprovalViewProps) {
  const calendarActions = useMemo(() => getCalendarActions(plan), [plan]);
  const allIds = useMemo(
    () => [...calendarActions.map((item) => item.id), ...plan.emailDrafts.map((draft) => draft.id)],
    [calendarActions, plan.emailDrafts],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(allIds));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const applied = new Set(appliedActionIds);

  function toggle(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(selected: boolean) {
    setSelectedIds(selected ? new Set(allIds.filter((id) => !applied.has(id))) : new Set());
  }

  function updateDraft(id: string, body: string) {
    onPlanChange({
      ...plan,
      emailDrafts: plan.emailDrafts.map((draft) => (draft.id === id ? { ...draft, body } : draft)),
    });
  }

  function applySelected() {
    onApply(Array.from(selectedIds));
    setConfirmOpen(false);
  }

  const pendingSelected = Array.from(selectedIds).filter((id) => !applied.has(id));
  const allSelected = pendingSelected.length > 0 && pendingSelected.length === allIds.filter((id) => !applied.has(id)).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button variant="ghost" size="sm" onPress={onBack} className="mb-2 px-0 text-[#53615d]">
            <ArrowLeft size={16} />
            明日のプランへ戻る
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-8">変更の確認と承認</h1>
            <Chip size="sm" variant="soft" color="warning">
              未適用
            </Chip>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#687471]">
            選択した変更だけを適用します。メールは送信されず、下書きとして扱います。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#65716e]">
          <ShieldCheck size={16} className="text-[#397466]" />
          自動送信・自動変更は行いません
        </div>
      </section>

      {appliedActionIds.length ? (
        <div className="flex items-center gap-3 rounded-md border border-[#bcd8cf] bg-[#edf7f3] px-4 py-3 text-sm text-[#285f54]">
          <CheckCircle2 size={18} />
          選択した{appliedActionIds.length}件をデモ環境へ適用しました。
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce2e0] bg-white px-4 py-3">
        <ApprovalCheckbox isSelected={allSelected} onChange={toggleAll} label="未適用の項目をすべて選択" />
        <p className="text-xs text-[#6f7b78]">
          {pendingSelected.length} / {allIds.filter((id) => !applied.has(id)).length}件を選択中
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="border border-[#dbe1df] bg-white shadow-none">
          <Card.Header className="flex-row items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <Card.Title className="flex items-center gap-2 text-lg font-semibold">
                <CalendarCheck2 size={19} className="text-[#2c675c]" />
                Calendar変更案
              </Card.Title>
              <Card.Description className="mt-1 text-sm text-[#6e7976]">
                時間変更、日程調整、回復ブロック
              </Card.Description>
            </div>
            <Chip size="sm" variant="soft" color="success">
              {calendarActions.length}件
            </Chip>
          </Card.Header>
          <Card.Content className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            <div className="divide-y divide-[#e3e8e6]">
              {calendarActions.map((action) => {
                const isApplied = applied.has(action.id);
                return (
                  <div key={action.id} className={`py-4 first:pt-0 last:pb-0 ${isApplied ? "opacity-65" : ""}`}>
                    <div className="flex items-start gap-3">
                      <ApprovalCheckbox
                        isSelected={isApplied || selectedIds.has(action.id)}
                        onChange={(selected) => toggle(action.id, selected)}
                        label={isApplied ? "適用済み" : "この変更を選択"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium text-[#303b38]">{action.title}</p>
                          <Chip size="sm" variant="soft" color={isApplied ? "success" : action.kind === "rest" ? "accent" : "warning"}>
                            {isApplied ? "適用済み" : action.kind === "rest" ? "追加" : "変更"}
                          </Chip>
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md bg-[#f6f8f7] px-3 py-2.5 text-sm">
                          <span className="truncate text-[#7b6560] line-through">{action.before}</span>
                          <span className="text-[#8a9592]">→</span>
                          <span className="truncate font-semibold text-[#2f645a]">{action.after}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#6b7673]">{action.reason}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card.Content>
        </Card>

        <div className="space-y-5">
          {plan.emailDrafts.map((draft: EmailDraft) => {
            const isApplied = applied.has(draft.id);
            return (
              <Card key={draft.id} className={`border border-[#dbe1df] bg-white shadow-none ${isApplied ? "opacity-70" : ""}`}>
                <Card.Header className="flex-row items-start justify-between gap-3 px-5 pt-5">
                  <div>
                    <Card.Title className="flex items-center gap-2 text-base font-semibold">
                      <Mail size={18} className="text-[#9a5947]" />
                      メール下書き
                    </Card.Title>
                    <Card.Description className="mt-1 text-sm text-[#6e7976]">
                      宛先候補: {draft.to.join("、")}
                    </Card.Description>
                  </div>
                  <ApprovalCheckbox
                    isSelected={isApplied || selectedIds.has(draft.id)}
                    onChange={(selected) => toggle(draft.id, selected)}
                    label={isApplied ? "作成済み" : "下書きを選択"}
                  />
                </Card.Header>
                <Card.Content className="px-5 pb-5 pt-4">
                  <div className="rounded-md border border-[#e1e6e4] bg-[#fafbfa] p-3">
                    <p className="text-xs text-[#78837f]">件名</p>
                    <p className="mt-1 text-sm font-medium text-[#36423f]">{draft.subject}</p>
                  </div>
                  <TextField fullWidth className="mt-3">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-[#68736f]">
                      <PencilLine size={13} />
                      本文を編集
                    </Label>
                    <TextArea
                      value={draft.body}
                      onChange={(event) => updateDraft(draft.id, event.target.value)}
                      rows={10}
                      fullWidth
                      className="mt-1.5 min-h-56 resize-y whitespace-pre-wrap text-sm leading-6"
                      disabled={isApplied}
                    />
                  </TextField>
                  <p className="mt-3 flex gap-2 text-xs leading-5 text-[#756961]">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    {draft.caution}
                  </p>
                </Card.Content>
              </Card>
            );
          })}

          {!plan.emailDrafts.length ? (
            <section className="rounded-md border border-[#dfe5e3] bg-[#f8faf9] p-5 text-sm text-[#677370]">
              メール下書きが必要な変更はありません。
            </section>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-[68px] z-10 -mx-4 flex flex-col items-stretch justify-between gap-3 border-t border-[#dce2e0] bg-[#eef2f0]/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center lg:bottom-0 lg:mx-0 lg:bg-transparent lg:px-0">
        <p className="flex items-center gap-2 text-xs text-[#66716e]">
          <Clock3 size={15} />
          適用時刻と選択内容は履歴に保存されます
        </p>
        {!pendingSelected.length ? (
          <Button variant="primary" size="lg" fullWidth isDisabled className="h-12 px-5 sm:w-auto">
            <Check size={18} />
            選択した0件を適用
          </Button>
        ) : (
          <Modal isOpen={confirmOpen} onOpenChange={setConfirmOpen}>
            <Modal.Trigger className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#195b52] px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#144b44] focus-visible:ring-2 focus-visible:ring-[#438b7d] focus-visible:ring-offset-2 sm:w-auto">
              <Check size={18} />
              選択した{pendingSelected.length}件を適用
            </Modal.Trigger>
            <Modal.Backdrop isDismissable>
              <Modal.Container size="md">
                <Modal.Dialog>
                  <Modal.Header>
                    <Modal.Icon className="bg-[#e2efeb] text-[#2b685d]">
                      <ShieldCheck size={22} />
                    </Modal.Icon>
                    <Modal.Heading>選択した変更を適用しますか？</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <p className="text-sm leading-6 text-[#5e6a67]">
                      Calendar変更とGmail下書き作成をデモ環境へ反映します。実際のGoogleアカウントには接続しません。
                    </p>
                    <div className="mt-4 rounded-md bg-[#f3f6f5] px-4 py-3 text-sm font-medium text-[#35413e]">
                      適用対象: {pendingSelected.length}件
                    </div>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="ghost" onPress={() => setConfirmOpen(false)}>
                      キャンセル
                    </Button>
                    <Button variant="primary" onPress={applySelected} className="bg-[#1d5b50] text-white">
                      <Send size={17} />
                      デモ環境へ適用
                    </Button>
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>
        )}
      </div>
    </div>
  );
}
