import { useCallback, useRef, useState } from "react";

import { commands, events, type TaskProgress } from "../../bindings";
import { type Lane, nextLane } from "../jobs/store";

/**
 * Runs a long command with a fresh task id, tracks its progress events and
 * allows cancelling it. Only one task per hook instance runs at a time.
 */
export function useTask() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [lane, setLane] = useState<Lane | null>(null);
  const taskId = useRef<string | null>(null);

  const run = useCallback(async <T>(work: (taskId: string) => Promise<T>): Promise<T> => {
    const id = crypto.randomUUID();
    taskId.current = id;
    setRunning(true);
    setProgress(null);
    setLane(null);
    const unlisten = await events.taskProgress.listen((event) => {
      if (event.payload.taskId === id && event.payload.state === "running") {
        setProgress(event.payload);
        const { current, total } = event.payload;
        setLane((prev) => nextLane(prev, current ?? 0, total ?? 0, Date.now()));
      }
    });
    try {
      return await work(id);
    } finally {
      unlisten();
      taskId.current = null;
      setRunning(false);
      setProgress(null);
      setLane(null);
    }
  }, []);

  const cancel = useCallback(() => {
    if (taskId.current) void commands.cancelTask(taskId.current);
  }, []);

  return { running, progress, lane, run, cancel };
}
