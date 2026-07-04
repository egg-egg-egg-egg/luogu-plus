// 任务进度轮询 hook
//
// 每 500ms 向 background 发 GET_TASK_STATUS 拉取任务进度，
// 任务完成/失败时自动停止轮询。
// Popup 关闭后重新打开时，传入已恢复的 taskId 即可继续轮询。

import { useEffect, useRef, useState } from 'react';
import type { Student, TaskProgress } from '@/db/types';
import { getClassMembers, getStudent } from '@/db/schema';

// ---- background 消息响应类型 ----

type GetTaskStatusResponse =
  | { ok: true; task: TaskProgress | null }
  | { ok: false; error: string };

// ---- hook 返回值 ----

export interface UseTaskProgressResult {
  /** 当前任务进度记录，未拉取到时为 null */
  task: TaskProgress | null;
  /** 任务是否仍在运行 */
  isRunning: boolean;
  /** 已完成数 */
  done: number;
  /** 总数 */
  total: number;
  /** 失败的学生 ID 列表 */
  failed: string[];
  /** 当前正在处理的学生名（用于"正在更新：XXX..."），无则为 null */
  currentStudentName: string | null;
}

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 500;

/**
 * 任务进度轮询 hook
 *
 * @param taskId 任务 ID，null 时不轮询
 */
export function useTaskProgress(taskId: string | null): UseTaskProgressResult {
  const [task, setTask] = useState<TaskProgress | null>(null);
  // 用于显示"正在更新：XXX"的学生列表
  const [students, setStudents] = useState<Student[]>([]);
  // 记录已为学生列表拉取过的 taskId，避免重复拉取
  const fetchedForRef = useRef<string | null>(null);

  // taskId 变化时重置状态
  useEffect(() => {
    setTask(null);
    setStudents([]);
    fetchedForRef.current = null;
  }, [taskId]);

  // 轮询任务状态
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || !taskId) return;

      try {
        const res = (await chrome.runtime.sendMessage({
          type: 'GET_TASK_STATUS',
          taskId,
        })) as GetTaskStatusResponse;

        if (cancelled) return;

        if (res.ok && res.task) {
          setTask(res.task);
          // 任务结束（completed / failed）时停止轮询
          if (res.task.status === 'completed' || res.task.status === 'failed') {
            return;
          }
        }
      } catch (e) {
        console.error('[popup] 轮询任务状态失败:', e);
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [taskId]);

  // 首次拿到任务后，拉取学生列表用于显示"正在更新：XXX"
  useEffect(() => {
    if (!task || !taskId) return;
    if (fetchedForRef.current === taskId) return;
    fetchedForRef.current = taskId;

    let cancelled = false;

    const fetchStudents = async () => {
      try {
        if (task.type === 'class_update') {
          const members = await getClassMembers(task.targetId);
          // 与 batch-task.ts 保持一致的排序（studentId 升序），确保索引对齐
          members.sort((a, b) => a.id.localeCompare(b.id));
          if (!cancelled) setStudents(members);
        } else if (task.type === 'student_update') {
          const student = await getStudent(task.targetId);
          if (!cancelled && student) setStudents([student]);
        }
      } catch (e) {
        console.error('[popup] 拉取学生列表失败:', e);
      }
    };

    fetchStudents();

    return () => {
      cancelled = true;
    };
  }, [task, taskId]);

  const isRunning = task?.status === 'running';
  const done = task?.done ?? 0;
  const total = task?.total ?? 0;
  const failed = task?.failed ?? [];

  // 计算当前正在处理的学生名
  let currentStudentName: string | null = null;
  if (isRunning && students.length > 0) {
    if (task?.type === 'class_update' && done < students.length) {
      const current = students[done];
      currentStudentName = current.remark || current.luoguName;
    } else if (task?.type === 'student_update') {
      const s = students[0];
      currentStudentName = s ? (s.remark || s.luoguName) : null;
    }
  }

  return { task, isRunning, done, total, failed, currentStudentName };
}
