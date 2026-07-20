import type { NotificationKind } from "@/lib/notifications/time";

type Locale = "jp-ja" | "us-en";
type DailyInputStatus = {
  reflectionEntered: boolean;
  tomorrowEntered: boolean;
};

export function getReminderPayload(
  kind: NotificationKind,
  locale: Locale,
  status?: DailyInputStatus,
) {
  if (kind === "evening") {
    return locale === "us-en"
      ? {
          title: "Time for your daily check-in",
          body: "Let's add today's reflection and tomorrow's plans in Echly.",
        }
      : {
          title: "今日のチェックインの時間です",
          body: "今日の振り返りと明日の予定をEchlyに入力しましょう！",
        };
  }

  if (!status || (status.reflectionEntered && status.tomorrowEntered)) {
    return null;
  }

  if (locale === "us-en") {
    return {
      title: "Your daily check-in is still waiting",
      body: !status.reflectionEntered && !status.tomorrowEntered
        ? "Add today's reflection and tomorrow's plans before the day ends."
        : !status.reflectionEntered
          ? "Please add today's reflection before the day ends."
          : "Please add tomorrow's plans before the day ends.",
    };
  }

  return {
    title: "今日のチェックインがまだ完了していません",
    body: !status.reflectionEntered && !status.tomorrowEntered
      ? "今日の振り返りと明日の予定を入力して、一日を終えましょう。"
      : !status.reflectionEntered
        ? "今日の振り返りを入力してください。"
        : "明日の予定を入力してください。",
  };
}
