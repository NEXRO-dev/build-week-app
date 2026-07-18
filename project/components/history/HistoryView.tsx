"use client";

import type { CheckIn, ConditionLevel } from "@/types/echly";

type Props = { checkIns: CheckIn[]; onNewCheckIn: () => void };
const score: Record<ConditionLevel, number> = { normal: 36, caution: 58, high: 82 };
function loadScore(item: CheckIn) {
  return item.condition.score ?? score[item.condition.level];
}

export function HistoryView({ checkIns }: Props) {
  const measured = checkIns.filter((item) => item.condition.methodVersion === "echly-load-v1");
  const recent = measured.slice(0, 7).reverse();
  const avg = recent.length ? Math.round(recent.reduce((sum, item) => sum + loadScore(item), 0) / recent.length) : 0;
  const avgLabel = avg >= 60 ? "高い" : avg >= 40 ? "やや高い" : "低〜通常";
  const points = recent.map((item, index) => `${20 + index * (260 / Math.max(1, recent.length - 1))},${120 - loadScore(item)}`).join(" ");
  const latest = measured[0];
  return (
    <div>
      <header className="flex h-16 items-center justify-center border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]"><h1 className="text-base font-bold">履歴</h1></header>
      <div className="space-y-3 px-4 pb-8 pt-4">
        <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
          {[
            ["実測チェックイン", `${measured.length}回`], ["平均負荷", measured.length ? `${avgLabel} (${avg})` : "記録なし"], ["調整実行数", `${measured.reduce((sum, item) => sum + item.approvedActionIds.length, 0)}件`], ["最新Raw TLX", latest?.condition.components ? `${latest.condition.components.rawTlx}/100` : "記録なし"],
          ].map(([label, value]) => <section key={label} className="min-w-0 rounded-lg border border-[#e3e5ef] px-2 py-3 text-center"><p className="text-[9px] leading-4 text-[#707895]">{label}</p><p className="mt-1 break-words text-sm font-bold">{value}</p></section>)}
        </div>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">負荷スコアの推移</h2>
          <svg viewBox="0 0 300 140" className="mt-2 h-40 w-full" role="img" aria-label="直近の負荷推移">
            {[30,60,90,120].map((y) => <line key={y} x1="20" y1={y} x2="280" y2={y} stroke="#eceef4" strokeWidth="1" />)}
            {points ? <polyline points={points} fill="none" stroke="#ff4f82" strokeWidth="2.5" strokeLinejoin="round" /> : null}
            {points ? points.split(" ").map((point, index) => { const [cx, cy] = point.split(","); return <circle key={index} cx={cx} cy={cy} r="3.5" fill="#ff4f82" />; }) : (
              <text x="150" y="75" textAnchor="middle" className="fill-[#8188a1] text-[10px]">実測記録はまだありません</text>
            )}
          </svg>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">直近7日のサマリー</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            {[['注意シグナル', `${recent.filter((item) => item.condition.level !== 'normal').length}回`], ['延期候補', `${recent.reduce((sum, item) => sum + item.plan.reschedule.length, 0)}件`], ['休息時間', `${recent.reduce((sum, item) => sum + item.plan.restBlocks.length, 0) * 2}時間`]].map(([label,value]) => <div key={label} className="min-w-0 rounded-md bg-[#f7f8fc] p-3"><p className="text-[10px] text-[#707895]">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
          </div>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">最新の算出結果</h2>
          {latest?.condition.score !== undefined ? <p className="mt-3 text-2xl font-bold">{latest.condition.score}<span className="text-xs">/100</span></p> : null}
          <p className="mt-3 text-xs leading-5 text-[#535c79]">{latest?.condition.summary ?? "まだ記録がありません。"}</p>
        </section>
      </div>
    </div>
  );
}
