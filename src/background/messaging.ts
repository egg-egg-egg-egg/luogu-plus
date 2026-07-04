// 消息路由（规格 §3.5）
//
// 处理来自 popup / options / content script 的消息。
// 用 chrome.runtime.onMessage.addListener 监听，返回 true 表示异步响应。
//
// 消息协议：
// - START_STUDENT_UPDATE { studentId } → 启动单学生更新，返回 { taskId }
// - START_CLASS_UPDATE { classId } → 启动班级更新，返回 { taskId }
// - GET_TASK_STATUS { taskId } → 返回任务进度 { task: TaskProgress | null }
// - GET_CURRENT_SELECTION → 返回当前选中 { selection: CurrentSelection }
// - SET_CURRENT_SELECTION { selection: { type, id } } → 设置选中，返回 { ok: true }
// - CLEAR_SELECTION → 清除选中，返回 { ok: true }
// - QUERY_PROBLEM_AC { problemId, selection } → 返回 { students, total }（content script 用）
// - QUERY_PROBLEMS_AC { problemIds, selection } → 返回 { results, total }（content script 用）
// - GET_STALE_THRESHOLD → 返回 { staleThresholdDays }（content script 用）

import type { TaskProgress } from '@/db/types';
import type { CurrentSelection, SelectionType } from '@/lib/storage';
import {
  getCurrentSelection,
  setCurrentSelection,
  clearSelection,
} from '@/lib/storage';
import {
  startStudentUpdate,
  startClassUpdate,
  getTaskStatus,
} from './batch-task';
import { db } from '@/db/schema';
import { getClassMembers, getMeta } from '@/db/schema';
import type { Selection, StudentAcInfo } from '@/store/selection';

// ---- 消息类型定义 ----

/** 入站消息联合类型 */
export type InboundMessage =
  | { type: 'START_STUDENT_UPDATE'; studentId: string }
  | { type: 'START_CLASS_UPDATE'; classId: string }
  | { type: 'GET_TASK_STATUS'; taskId: string }
  | { type: 'GET_CURRENT_SELECTION' }
  | {
      type: 'SET_CURRENT_SELECTION';
      selection: { type: SelectionType; id: string | null };
    }
  | { type: 'CLEAR_SELECTION' }
  // content script 查询消息
  | { type: 'QUERY_PROBLEM_AC'; problemId: string; selection: Selection }
  | {
      type: 'QUERY_PROBLEMS_AC';
      problemIds: string[];
      selection: Selection;
    }
  | { type: 'GET_STALE_THRESHOLD' };

/** 出站响应类型 */
export type OutboundResponse =
  | { ok: true; taskId: string }
  | { ok: true; task: TaskProgress | null }
  | { ok: true; selection: CurrentSelection }
  | { ok: true }
  // content script 查询响应
  | { ok: true; students: StudentAcInfo[]; total: number }
  | { ok: true; results: Record<string, StudentAcInfo[]>; total: number }
  | { ok: true; staleThresholdDays: number }
  | { ok: false; error: string };

/** 判断入站消息是否合法 */
function isInboundMessage(msg: unknown): msg is InboundMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as { type?: unknown };
  return (
    typeof m.type === 'string' &&
    [
      'START_STUDENT_UPDATE',
      'START_CLASS_UPDATE',
      'GET_TASK_STATUS',
      'GET_CURRENT_SELECTION',
      'SET_CURRENT_SELECTION',
      'CLEAR_SELECTION',
      'QUERY_PROBLEM_AC',
      'QUERY_PROBLEMS_AC',
      'GET_STALE_THRESHOLD',
    ].includes(m.type)
  );
}

/**
 * 根据 selection 解析出学生 ID 列表
 * - 学生：返回 [studentId]
 * - 班级：返回班级所有成员的学生 ID
 * - null：返回空数组
 */
async function resolveStudentIds(selection: Selection): Promise<string[]> {
  if (selection === null) return [];
  if (selection.type === 'student') return [selection.studentId];
  // 班级：取所有成员
  const members = await getClassMembers(selection.classId);
  return members.map((s) => s.id);
}

/**
 * 查询单个题目被哪些学生（在 selection 范围内）AC 过
 */
async function queryProblemAc(
  problemId: string,
  selection: Selection,
): Promise<{ students: StudentAcInfo[]; total: number }> {
  const candidateIds = await resolveStudentIds(selection);
  const total = candidateIds.length;
  if (total === 0) return { students: [], total: 0 };

  // 查 acRecords 找 AC 过该题的学生
  const acRecords = await db.acRecords
    .where('problemId')
    .equals(problemId)
    .toArray();
  const acStudentIds = new Set(acRecords.map((r) => r.studentId));

  // 取交集（在候选范围内且 AC 过该题）
  const hitIds = candidateIds.filter((id) => acStudentIds.has(id));
  if (hitIds.length === 0) return { students: [], total };

  // 批量查 students 表取展示信息
  const students = await db.students.bulkGet(hitIds);
  const studentAcInfos: StudentAcInfo[] = students
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => ({
      studentId: s.id,
      remark: s.remark,
      luoguName: s.luoguName,
      lastSyncedAt: s.lastSyncedAt,
    }));

  return { students: studentAcInfos, total };
}

/** 处理单条消息，返回响应 */
async function handleMessage(msg: InboundMessage): Promise<OutboundResponse> {
  switch (msg.type) {
    case 'START_STUDENT_UPDATE': {
      const taskId = await startStudentUpdate(msg.studentId);
      return { ok: true, taskId };
    }

    case 'START_CLASS_UPDATE': {
      const taskId = await startClassUpdate(msg.classId);
      return { ok: true, taskId };
    }

    case 'GET_TASK_STATUS': {
      const task = await getTaskStatus(msg.taskId);
      return { ok: true, task };
    }

    case 'GET_CURRENT_SELECTION': {
      const selection = await getCurrentSelection();
      return { ok: true, selection };
    }

    case 'SET_CURRENT_SELECTION': {
      await setCurrentSelection(msg.selection.type, msg.selection.id);
      // storage.local 写入会自动触发 chrome.storage.onChanged 广播到所有标签页
      return { ok: true };
    }

    case 'CLEAR_SELECTION': {
      await clearSelection();
      return { ok: true };
    }

    case 'QUERY_PROBLEM_AC': {
      console.log('[bg] QUERY_PROBLEM_AC:', msg.problemId, msg.selection);
      const { students, total } = await queryProblemAc(
        msg.problemId,
        msg.selection,
      );
      return { ok: true, students, total };
    }

    case 'QUERY_PROBLEMS_AC': {
      console.log('[bg] QUERY_PROBLEMS_AC:', msg.problemIds.length, '题, selection:', msg.selection?.type);
      // 批量查询多题
      const candidateIds = await resolveStudentIds(msg.selection);
      const total = candidateIds.length;
      const results: Record<string, StudentAcInfo[]> = {};

      if (total === 0) {
        // 空范围：每个题都返回空数组
        for (const pid of msg.problemIds) results[pid] = [];
        return { ok: true, results, total: 0 };
      }

      // 一次性查所有题目的 AC 记录
      const candidateSet = new Set(candidateIds);
      // 批量按 problemId 查询（Dexie anyOf）
      const allAcRecords = await db.acRecords
        .where('problemId')
        .anyOf(msg.problemIds)
        .toArray();

      // 按 problemId 分组，过滤出在候选范围内的学生
      const acByProblem = new Map<string, Set<string>>();
      for (const r of allAcRecords) {
        if (!candidateSet.has(r.studentId)) continue;
        if (!acByProblem.has(r.problemId)) {
          acByProblem.set(r.problemId, new Set());
        }
        acByProblem.get(r.problemId)!.add(r.studentId);
      }

      // 收集所有命中的学生 ID，一次性 bulkGet
      const allHitIds = new Set<string>();
      for (const set of acByProblem.values()) {
        for (const id of set) allHitIds.add(id);
      }
      const studentsMap = new Map<string, StudentAcInfo>();
      if (allHitIds.size > 0) {
        const students = await db.students.bulkGet([...allHitIds]);
        for (const s of students) {
          if (s) {
            studentsMap.set(s.id, {
              studentId: s.id,
              remark: s.remark,
              luoguName: s.luoguName,
              lastSyncedAt: s.lastSyncedAt,
            });
          }
        }
      }

      // 组装每个 problemId 的学生列表
      for (const pid of msg.problemIds) {
        const idSet = acByProblem.get(pid);
        if (!idSet) {
          results[pid] = [];
        } else {
          results[pid] = [...idSet]
            .map((id) => studentsMap.get(id))
            .filter((s): s is StudentAcInfo => s !== undefined);
        }
      }

      return { ok: true, results, total };
    }

    case 'GET_STALE_THRESHOLD': {
      const days = (await getMeta<number>('staleThresholdDays')) ?? 7;
      return { ok: true, staleThresholdDays: days };
    }
  }
}

/**
 * 初始化消息监听
 * 应在 SW 入口调用，注册 chrome.runtime.onMessage 监听器。
 */
export function initMessaging(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isInboundMessage(msg)) {
      sendResponse({ ok: false, error: 'unknown_message' } satisfies OutboundResponse);
      return false;
    }

    // 异步处理，返回 true 保持消息通道开放
    handleMessage(msg)
      .then((response) => sendResponse(response))
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: message } satisfies OutboundResponse);
      });
    return true; // 异步调用 sendResponse
  });
}
