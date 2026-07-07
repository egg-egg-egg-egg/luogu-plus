// 任务进度轮询 hook
//
// 启动后每 500ms 发 GET_TASK_STATUS 消息查任务状态，
// 任务完成（completed/failed）自动停止轮询。
//
// 用法：
//   const { task, loading } = useTaskProgress(taskId);
//   // taskId 为 null 时不轮询
//   // task 完成后通过 onDone 回调通知调用方刷新数据

import { useEffect, useRef, useState } from 'react';
import type { TaskProgress } from '@/db/types';

/** 保证 onDone 始终是最新引用，且不会因回调 identity 变化导致轮询 effect 反复重订阅 */
function useEventCallback<A extends unknown[], R>(fn?: (...args: A) => R) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useRef((...args: A) => ref.current?.(...args)).current;
}

/** 轮询间隔 */
const POLL_INTERVAL = 500;

/** hook 返回值 */
interface UseTaskProgressResult {
  /** 任务进度数据，未拉到为 null */
  task: TaskProgress | null;
  /** 是否正在加载（首次拉取中） */
  loading: boolean;
  /** 进度百分比 0-1 */
  progress: number;
  /** 是否完成（status !== 'running'） */
  done: boolean;
}

/**
 * 任务进度轮询 hook
 *
 * @param taskId 任务 ID，null 时不轮询
 * @param onDone 任务完成回调（status 变为 completed/failed 时触发一次）
 */
export function useTaskProgress(
  taskId: string | null,
  onDone?: (task: TaskProgress) => void,
): UseTaskProgressResult {
  const [task, setTask] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(false);
  // 已触发 onDone 的 taskId，避免重复回调
  const firedRef = useRef<string | null>(null);
  // 用 ref 持有最新 onDone，使轮询 effect 仅依赖 taskId，避免回调 identity 变化触发重复轮询
  const onDoneStable = useEventCallback(onDone);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    firedRef.current = null;
    setLoading(true);

    const poll = async () => {
      try {
        const resp = (await chrome.runtime.sendMessage({
          type: 'GET_TASK_STATUS',
          taskId,
        })) as { ok: true; task: TaskProgress | null } | { ok: false; error: string };

        if (cancelled) return;

        if (resp.ok && resp.task) {
          setTask(resp.task);
          setLoading(false);

          // 完成或失败：停止轮询 + 触发回调
          if (resp.task.status !== 'running') {
            if (firedRef.current !== taskId) {
              firedRef.current = taskId;
              onDoneStable(resp.task);
            }
            return; // 不再调度下一次
          }
        } else if (!resp.ok) {
          setLoading(false);
          return; // 出错停止轮询
        }
      } catch {
        if (cancelled) return;
        setLoading(false);
        return; // 异常停止轮询
      }

      // 调度下一次
      timer = setTimeout(poll, POLL_INTERVAL);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId]);

  const progress =
    task && task.total > 0 ? task.done / task.total : 0;
  const isDone = task !== null && task.status !== 'running';

  return { task, loading, progress, done: isDone };
}
