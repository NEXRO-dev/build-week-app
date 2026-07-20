"use client";

import { Button } from "@heroui/react";
import { Clock3, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useI18n } from "@/lib/i18n";

export type PlanActivityInput = {
  title: string;
  startTime: string | null;
  endTime: string | null;
  movable: boolean;
};

type Props = {
  disabled?: boolean;
  defaultOpen?: boolean;
  onAdd: (activity: PlanActivityInput) => Promise<void>;
};

function oneHourAfter(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const total = hour * 60 + minute + 60;
  if (total >= 24 * 60) return "23:59";
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function PlanActivityForm({
  disabled = false,
  defaultOpen = false,
  onAdd,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [movable, setMovable] = useState(true);
  const [saving, setSaving] = useState(false);

  const invalidRange = Boolean(startTime && endTime && endTime <= startTime);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || invalidRange || saving || disabled) return;

    setSaving(true);
    try {
      await onAdd({
        title: normalizedTitle,
        startTime: startTime || null,
        endTime: endTime || null,
        movable,
      });
      setTitle("");
      setStartTime("");
      setEndTime("");
      setMovable(true);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        fullWidth
        isDisabled={disabled}
        onPress={() => setOpen(true)}
        className="h-11 border-[#d9dcef] bg-white text-[#4e3ad0]"
      >
        <Plus size={17} />
        {t("予定を追加", "Add activity")}
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="border-y border-[#e4e6ef] bg-[#fafbfe] px-3 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold text-[#303857]">
          {t("明日の予定を追加", "Add tomorrow's activity")}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("閉じる", "Close")}
          className="grid size-8 shrink-0 place-items-center text-[#6f7792]"
        >
          <X size={17} />
        </button>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">{t("予定名", "Activity name")}</span>
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("例：チーム朝会", "e.g. Team stand-up")}
          className="h-11 w-full rounded-md border border-[#dfe2ec] bg-white px-3 text-sm outline-none focus:border-[#7a66ee] focus:ring-2 focus:ring-[#ddd7ff]"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-[#69718d]">
            <Clock3 size={12} />
            {t("開始", "Start")}
          </span>
          <input
            type="time"
            step={900}
            value={startTime}
            onChange={(event) => {
              const value = event.target.value;
              setStartTime(value);
              if (value && !endTime) setEndTime(oneHourAfter(value));
            }}
            className="h-10 w-full rounded-md border border-[#dfe2ec] bg-white px-2 text-xs tabular-nums outline-none focus:border-[#7a66ee]"
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-semibold text-[#69718d]">
            {t("終了", "End")}
          </span>
          <input
            type="time"
            step={900}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="h-10 w-full rounded-md border border-[#dfe2ec] bg-white px-2 text-xs tabular-nums outline-none focus:border-[#7a66ee]"
          />
        </label>
      </div>

      {invalidRange ? (
        <p className="mt-2 text-[11px] text-[#c82f59]">
          {t("終了時刻は開始時刻より後にしてください。", "End time must be after start time.")}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="flex min-w-0 items-center gap-2 text-xs text-[#555e7b]">
          <input
            type="checkbox"
            checked={movable}
            onChange={(event) => setMovable(event.target.checked)}
            className="size-4 accent-[#5b42ff]"
          />
          <span className="break-words">{t("AIによる時間調整を許可", "Allow AI time adjustments")}</span>
        </label>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          isDisabled={!title.trim() || invalidRange || saving || disabled}
          className="h-9 shrink-0 bg-[#5b42ff] px-3 text-white"
        >
          <Plus size={15} />
          {saving ? t("保存中", "Saving") : t("追加", "Add")}
        </Button>
      </div>
    </form>
  );
}