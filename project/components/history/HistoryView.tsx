"use client";

import { Plus } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { CheckIn, ConditionLevel } from "@/types/echly";

type Props = { checkIns: CheckIn[]; onNewCheckIn: () => void };
const score: Record<ConditionLevel, number> = { normal: 36, caution: 58, high: 82 };
function loadScore(item: CheckIn) {
  return item.condition.score ?? score[item.condition.level];
}

export function HistoryView({ checkIns, onNewCheckIn }: Props) {
  const { t } = useI18n();
  const measured = checkIns.filter((item) => typeof item.condition.score === "number");
  const recent = measured.slice(0, 7).reverse();
  const avg = recent.length ? Math.round(recent.reduce((sum, item) => sum + loadScore(item), 0) / recent.length) : 0;
  const avgLabel = avg >= 60 ? t("高い", "High") : avg >= 40 ? t("やや高い", "Elevated") : t("低〜通常", "Low–normal");
  const points = recent.map((item, index) => `${20 + index * (260 / Math.max(1, recent.length - 1))},${120 - loadScore(item)}`).join(" ");
  const latest = measured[0];
  const latestComponents = latest?.condition.components;
  const voiceBaselineTarget = latestComponents?.voiceBaselineTarget ?? 5;
  const voiceMinimumDurationSec =
    latestComponents?.voiceMinimumDurationSec ?? 10;
  const voiceCurrentEligible =
    latestComponents?.voiceCurrentEligible ??
    Boolean(
      latest &&
        latest.audioMeta.durationSec >= voiceMinimumDurationSec &&
        (Number.isFinite(latest.audioMeta.speechRate) ||
          Number.isFinite(latest.audioMeta.silenceRatio)),
    );
  const voiceEligibilityReason =
    latestComponents?.voiceEligibilityReason ??
    (voiceCurrentEligible
      ? "eligible"
      : latest && latest.audioMeta.durationSec < voiceMinimumDurationSec
        ? "too_short"
        : "no_features");
  const voiceSamplesCollected =
    latestComponents?.voiceSamplesCollected ??
    Math.min(
      voiceBaselineTarget,
      (latestComponents?.voiceBaselineCount ?? 0) +
        (voiceCurrentEligible ? 1 : 0),
    );
  const voiceTrendReady =
    typeof latestComponents?.voiceDeviation === "number";
  const voiceUsesSingleFeature =
    voiceTrendReady &&
    ((latestComponents?.voiceFeaturesUsed?.length ?? 0) === 1 ||
      latestComponents?.voiceWeight === 0.05);
  const voiceProgress = latest
    ? voiceTrendReady
      ? 100
      : (voiceSamplesCollected / voiceBaselineTarget) * 100
    : 0;
  const voiceStatus = !latest
    ? t("記録なし", "No records")
    : voiceTrendReady
      ? voiceUsesSingleFeature
        ? t("一部特徴で比較中", "Comparing one feature")
        : t("個人内比較中", "Personal comparison active")
      : !voiceCurrentEligible
        ? voiceEligibilityReason === "too_short"
          ? t("参考記録（短時間）", "Reference only (short)")
          : t("特徴を取得できず", "Features unavailable")
        : voiceSamplesCollected + "/" + voiceBaselineTarget;
  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <span />
        <h1 className="text-center text-base font-bold">{t("履歴", "History")}</h1>
        <button
          type="button"
          onClick={onNewCheckIn}
          aria-label={t("新しく記録する", "Create a new check-in")}
          title={t("新しく記録する", "Create a new check-in")}
          className="grid size-10 place-items-center text-[#303857] active:scale-95"
        >
          <Plus size={19} />
        </button>
      </header>
      <div className="space-y-3 px-4 pb-8 pt-4">
        <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
          {[
            [t("実測チェックイン", "Measured check-ins"), String(measured.length)], [t("平均負荷", "Average load"), measured.length ? avgLabel + " (" + avg + ")" : t("記録なし", "No records")], [t("調整実行数", "Adjustments made"), String(measured.reduce((sum, item) => sum + item.approvedActionIds.length, 0))], [t("最新Raw TLX", "Latest Raw TLX"), latest?.condition.components ? latest.condition.components.rawTlx + "/100" : t("記録なし", "No records")],
          ].map(([label, value]) => <section key={label} className="min-w-0 rounded-lg border border-[#e3e5ef] px-2 py-3 text-center"><p className="text-[9px] leading-4 text-[#707895]">{label}</p><p className="mt-1 break-words text-sm font-bold">{value}</p></section>)}
        </div>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("音声の個人内ベースライン", "Personal voice baseline")}</h2>
            <span className="text-[10px] font-bold text-[#303857]">
              {voiceStatus}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eceef4]">
            <span
              className="block h-full rounded-full bg-[#168f78] transition-[width] duration-500"
              style={{ width: voiceProgress + "%" }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-5 text-[#68708f]">
            {!latest
              ? t(
                  voiceMinimumDurationSec + "秒以上で、話速または間を取得できると作成が始まります。",
                  "Baseline collection starts with recordings of at least " + voiceMinimumDurationSec + " seconds when speech rate or pauses can be measured.",
                )
              : voiceTrendReady
                ? voiceUsesSingleFeature
                  ? t("取得できた1特徴だけで比較し、音声の重みを半分にしています。", "Only one available voice feature is compared, with half weight.")
                  : t("本人の過去音声と比べて、話す速さと間の変化を算出しています。", "Speech rate and pauses are compared with your own past recordings.")
                : !voiceCurrentEligible
                  ? voiceEligibilityReason === "too_short"
                    ? voiceMinimumDurationSec +
                      "秒未満のため保存のみ行い、ベースラインには加えていません。"
                    : "録音は保存しましたが、音声特徴を取得できなかったため参考記録です。"
                  : voiceSamplesCollected >= voiceBaselineTarget
                    ? "基準がそろいました。次回から取得できた特徴で個人内変化を算出します。"
                    : "あと" +
                      (voiceBaselineTarget - voiceSamplesCollected) +
                      "件で個人内比較を開始します。"}
          </p>
        </section>
        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("負荷スコアの推移", "Load score trend")}</h2>
          <svg viewBox="0 0 300 140" className="mt-2 h-40 w-full" role="img" aria-label={t("直近の負荷推移", "Recent load trend")}>
            {[30,60,90,120].map((y) => <line key={y} x1="20" y1={y} x2="280" y2={y} stroke="#eceef4" strokeWidth="1" />)}
            {points ? <polyline points={points} fill="none" stroke="#ff4f82" strokeWidth="2.5" strokeLinejoin="round" /> : null}
            {points ? points.split(" ").map((point, index) => { const [cx, cy] = point.split(","); return <circle key={index} cx={cx} cy={cy} r="3.5" fill="#ff4f82" />; }) : (
              <text x="150" y="75" textAnchor="middle" className="fill-[#8188a1] text-[10px]">{t("実測記録はまだありません", "No measured records yet")}</text>
            )}
          </svg>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("直近7日のサマリー", "Last 7 days")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            {[[t("注意シグナル", "Elevated signals"), String(recent.filter((item) => item.condition.level !== "normal").length)], [t("延期候補", "Reschedule options"), String(recent.reduce((sum, item) => sum + item.plan.reschedule.length, 0))], [t("休息時間", "Rest time"), String(recent.reduce((sum, item) => sum + item.plan.restBlocks.length, 0) * 2) + t("時間", "h")]].map(([label,value]) => <div key={label} className="min-w-0 rounded-md bg-[#f7f8fc] p-3"><p className="text-[10px] text-[#707895]">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
          </div>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("最新の算出結果", "Latest result")}</h2>
          {latest?.condition.score !== undefined ? <p className="mt-3 text-2xl font-bold">{latest.condition.score}<span className="text-xs">/100</span></p> : null}
          <p className="mt-3 text-xs leading-5 text-[#535c79]">{latest?.condition.summary ?? t("まだ記録がありません。", "No records yet.")}</p>
        </section>
      </div>
    </div>
  );
}
