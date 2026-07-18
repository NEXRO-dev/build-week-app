import { EchlyApp } from "@/components/EchlyApp";
import { connection } from "next/server";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

export default async function Home() {
  await connection();
  const today = new Date();
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日 ${weekdays[today.getDay()]}曜日`;

  return <EchlyApp todayLabel={todayLabel} />;
}
