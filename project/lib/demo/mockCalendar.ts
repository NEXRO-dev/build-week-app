import type { CalendarEvent } from "@/types/echly";

export const mockCalendarEvents: CalendarEvent[] = [
  {
    id: "cal-budget",
    title: "A社 予算会議",
    startTime: "10:00",
    endTime: "11:00",
    movable: false,
    importance: "high",
  },
  {
    id: "cal-focus",
    title: "提案資料の仕上げ",
    startTime: "13:00",
    endTime: "15:00",
    movable: true,
    importance: "high",
  },
  {
    id: "cal-brainstorm",
    title: "Cさんとブレスト",
    startTime: "17:00",
    endTime: "18:00",
    movable: true,
    importance: "medium",
  },
];
