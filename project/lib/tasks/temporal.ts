import type { ExtractedTask } from "@/types/echly";

export function isTomorrowActionableTask(task: ExtractedTask) {
  return (
    task.temporalContext === "tomorrow" &&
    task.kind !== "topic" &&
    task.status !== "completed" &&
    task.status !== "cancelled"
  );
}
