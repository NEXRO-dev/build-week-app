"use client";

import type { CheckIn, ConditionLevel } from "@/types/echly";
import { useI18n } from "@/lib/i18n";

type Props = { checkIns: CheckIn[]; onNewCheckIn: () => void };
const score: Record<ConditionLevel, number> = { normal: 36, caution: 58, high: 82 };
function loadScore(item: CheckIn) {
  return item.condition.score ?? score[item.condition.level];
}

export function HistoryView({ checkIns }: Props) {
  const { t } = useI18n();
  const measured = checkIns.filter((item) => item.condition.methodVersion === "echly-load-v1");
  const recent = measured.slice(0, 7).reverse();
  const avg = recent.length ? Math.round(recent.reduce((sum, item) => sum + loadScore(item), 0) / recent.length) : 0;
  const avgLabel = avg >= 60 ? t("高い", "High") : avg >= 40 ? t("やや高い", "Elevated") : t("低〜通常", "Low–normal");
  const points = recent.map((item, index) => `${20 + index * (260 / Math.max(1, recent.length - 1))},${120 - loadScore(item)}`).join(" ");
  const latest = measured[0];
  return (
    <div>
      <header className="flex h-16 items-center justify-center border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]"><h1 className="text-base font-bold">{t("履歴", "History")}</h1></header>
      <div className="space-y-3 px-4 pb-8 pt-4">
        <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
          {[
            [t("実測チェックイン", "Measured check-ins"), `${measured.length}`], [t("平均負荷", "Average load"), measured.length ? `${avgLabel} (${avg})` : t("記録なし", "No records")], [t("調整実行数", "Adjustments made"), `${measured.reduce((sum, item) => sum + item.approvedActionIds.length, 0)}`], [t("最新Raw TLX", "Latest Raw TLX"), latest?.condition.components ? `${latest.condition.components.rawTlx}/100` : t("記録なし", "No records")],
          ].map(([label, value]) => <section key={label} className="min-w-0 rounded-lg border border-[#e3e5ef] px-2 py-3 text-center"><p className="text-[9px] leading-4 text-[#707895]">{label}</p><p className="mt-1 break-words text-sm font-bold">{value}</p></section>)}
        </div>

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
            {[[t("注意シグナル", "Elevated signals"), `${recent.filter((item) => item.condition.level !== "normal").length}`], [t("延期候補", "Reschedule options"), `${recent.reduce((sum, item) => sum + item.plan.reschedule.length, 0)}`], [t("休息時間", "Rest time"), `${recent.reduce((sum, item) => sum + item.plan.restBlocks.length, 0) * 2}${t("時間", "h")}`]].map(([label,value]) => <div key={label} className="min-w-0 rounded-md bg-[#f7f8fc] p-3"><p className="text-[10px] text-[#707895]">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
          </div>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("最新の算出結果", "Latest result")}</h2>
          {latest?.condition.score !== undefined ? <p className="mt-3 text-2xl font-bold">{latest.condition.score}<span className="text-xs">/100</span></p> : null}
          <p className="mt-3 text-xs leading-5 text-[#535c79]">{latest ? t(latest.condition.summary, latest.condition.level === "high" ? "Your recent load was high. Protect recovery time." : latest.condition.level === "caution" ? "Your recent load was elevated. Leave room to recover." : "Your recent load was in the normal range.") : t("まだ記録がありません。", "No records yet.")}</p>
        </section>
      </div>
    </div>
  );
}
