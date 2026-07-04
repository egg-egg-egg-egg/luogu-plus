// 批量更新任务调度（规格 §3.3、§4.1、§6）
//
// 职责：
// 1. 单学生更新：fetchStudentAC → 落库 AC 记录 + 题目 + 更新 lastSyncedAt
// 2. 班级更新：串行遍历学生，每人间隔 2s，best-effort，失败重试，风控暂停
// 3. 断点续传：每完成一个学生写 taskProgress 表，SW 重启后从 done 续传
// 4. SW 保活：任务启动时 startKeepalive，结束时 stopKeepalive
//
// 数据层依赖：直接使用 Dexie Table API（db.students.get / db.acRecords.where 等），
// 未依赖数据层 subagent 的 CRUD 封装，避免方法名不匹配问题。

import { db } from '@/db/schema';
import type { Student, TaskProgress, Problem, AcRecord } from '@/db/types';
import {
  fetchStudentAC,
  type FetchError,
  type LuoguAcEntry,
} from '@/lib/luogu-fetcher';
import { startKeepalive, stopKeepalive } from './keepalive';

// ---- 配置常量（规格 §6） ----

/** 单学生失败重试次数上限（仅 E_NETWORK 重试） */
const MAX_RETRY = 2;
/** 重试退避间隔（毫秒） */
const RETRY_BACKOFF_MS = 10000;
/** 风控触发后暂停时长（毫秒，5 分钟） */
const RATE_LIMIT_PAUSE_MS = 300000;
/** 默认请求间隔（毫秒），可被 meta.requestInterval 覆盖 */
const DEFAULT_REQUEST_INTERVAL = 2000;

// ---- 类型定义 ----

/** 单学生更新结果 */
export type UpdateResult =
  | { success: true; acCount: number }
  | { success: false; error: FetchError };

/** 班级更新结果 */
export interface ClassUpdateResult {
  taskId: string;
  total: number;
  done: number;
  failed: string[]; // 失败的学生内部 ID 列表
}

/** 进度回调类型 */
export type ProgressCallback = (
  done: number,
  total: number,
  failed: string[],
) => void;

// ---- 模块级状态（仅 SW 存活期间有效，SW 被杀后从 Dexie 重建） ----

/** 当前运行中的任务 ID，防止重复启动 */
let currentTaskId: string | null = null;

// ---- 工具函数 ----

/** 生成唯一任务 ID */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** sleep 毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 通知图标（32x32 SVG data URL） */
const NOTIFICATION_ICON_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#52c41a"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="white">洛</text></svg>',
  );

/**
 * 任务完成时发系统通知 + 设置扩展图标 badge（规格 §3.5）
 *
 * 在 background 中调用，确保 Popup 关闭时也能收到通知。
 */
function notifyTaskDone(done: number, failed: string[]): void {
  const failedCount = failed.length;
  const successCount = Math.max(0, done - failedCount);

  // 设置扩展图标 badge
  try {
    if (failedCount > 0) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff4d4f' });
    } else {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#52c41a' });
    }
  } catch (e) {
    console.warn('[batch-task] 设置 badge 失败:', e);
  }

  // 发系统通知
  try {
    if (failedCount > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: NOTIFICATION_ICON_URL,
        title: '更新完成（部分失败）',
        message: `成功 ${successCount}，失败 ${failedCount}`,
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: NOTIFICATION_ICON_URL,
        title: '更新完成',
        message: `共更新 ${done} 项`,
      });
    }
  } catch (e) {
    console.warn('[batch-task] 发送通知失败:', e);
  }
}

/** 从 meta 表读取请求间隔，读不到则用默认值 */
async function getRequestInterval(): Promise<number> {
  try {
    const meta = await db.meta.get('requestInterval');
    if (meta && typeof meta.value === 'number') {
      return meta.value;
    }
  } catch {
    // 忽略，用默认值
  }
  return DEFAULT_REQUEST_INTERVAL;
}

/** 获取班级下所有学生（按 studentId 排序，保证顺序确定性便于断点续传） */
async function getClassStudents(classId: string): Promise<Student[]> {
  const members = await db.class_members
    .where('classId')
    .equals(classId)
    .toArray();
  // 复合主键 [classId, studentId] 已按 studentId 排序，但显式排序更稳妥
  members.sort((a, b) => a.studentId.localeCompare(b.studentId));
  const studentIds = members.map((m) => m.studentId);
  if (studentIds.length === 0) return [];
  const students = (await db.students.bulkGet(studentIds)).filter(
    (s): s is Student => s !== undefined,
  );
  return students;
}

/**
 * 刷新班级 lastSyncedAt（取班级内所有学生 lastSyncedAt 的最小值，任一为 null 则班级为 null）
 * 规格 §5.2：班级 lastSyncedAt 为所有学生 lastSyncedAt 的最小值。
 */
export async function refreshClassLastSyncedAt(
  classId: string,
): Promise<void> {
  const members = await db.class_members
    .where('classId')
    .equals(classId)
    .toArray();
  if (members.length === 0) {
    await db.classes.update(classId, {
      lastSyncedAt: null,
      updatedAt: Date.now(),
    });
    return;
  }
  const studentIds = members.map((m) => m.studentId);
  const students = (await db.students.bulkGet(studentIds)).filter(
    (s): s is Student => s !== undefined,
  );

  let hasNull = false;
  let minSyncedAt: number | null = null;
  for (const s of students) {
    if (s.lastSyncedAt === null) {
      hasNull = true;
      break;
    }
    if (minSyncedAt === null || s.lastSyncedAt < minSyncedAt) {
      minSyncedAt = s.lastSyncedAt;
    }
  }
  await db.classes.update(classId, {
    lastSyncedAt: hasNull ? null : minSyncedAt,
    updatedAt: Date.now(),
  });
}

/**
 * 保存学生 AC 记录（先删旧记录再插新记录，事务保证原子性）
 */
async function saveAcRecords(
  studentId: string,
  entries: LuoguAcEntry[],
  fetchedAt: number,
): Promise<void> {
  await db.transaction('rw', db.acRecords, async () => {
    await db.acRecords.where('studentId').equals(studentId).delete();
    const records: AcRecord[] = entries.map((e) => ({
      studentId,
      problemId: e.pid,
      fetchedAt,
    }));
    if (records.length > 0) {
      await db.acRecords.bulkPut(records);
    }
  });
}

/**
 * 批量 upsert 题目（难度/标题随抓取同步更新）
 */
async function upsertProblems(
  entries: LuoguAcEntry[],
  updatedAt: number,
): Promise<void> {
  const problems: Problem[] = entries.map((e) => ({
    id: e.pid,
    difficulty: e.difficulty,
    title: e.name,
    type: e.type,
    updatedAt,
  }));
  if (problems.length > 0) {
    await db.problems.bulkPut(problems);
  }
}

/** 查询当前是否有运行中的任务 */
async function getRunningTask(): Promise<TaskProgress | null> {
  const tasks = await db.taskProgress
    .filter((t) => t.status === 'running')
    .toArray();
  return tasks.length > 0 ? tasks[0] : null;
}

// ---- 单学生更新（核心） ----

/**
 * 更新单个学生的 AC 记录（不含任务调度、保活）
 *
 * 流程：
 * 1. 从 Dexie 读取学生记录（取 luoguId）
 * 2. 调 fetchStudentAC 抓取
 * 3. 成功：删旧 AC 记录 → 插新 AC 记录 → upsert 题目 → 更新学生 lastSyncedAt/luoguName/status
 * 4. 失败：404/403 标记 status='invalid'
 *
 * @param studentId 学生内部 ID
 */
export async function updateStudentAC(
  studentId: string,
): Promise<UpdateResult> {
  const student = await db.students.get(studentId);
  if (!student) {
    return {
      success: false,
      error: {
        code: 'E_LUOGU_PARSE',
        message: `学生 ${studentId} 不存在于本地数据库`,
      },
    };
  }

  const result = await fetchStudentAC(student.luoguId);
  if (!result.success) {
    // 404/403 标记账号失效
    if (
      result.error.code === 'E_LUOGU_404' ||
      result.error.code === 'E_LUOGU_403'
    ) {
      await db.students.update(studentId, {
        status: 'invalid',
        updatedAt: Date.now(),
      });
    }
    return result;
  }

  // 成功：落库
  const now = Date.now();
  await saveAcRecords(studentId, result.acRecords, now);
  await upsertProblems(result.acRecords, now);
  await db.students.update(studentId, {
    luoguName: result.luoguName,
    status: 'active',
    lastSyncedAt: now,
    updatedAt: now,
  });

  return { success: true, acCount: result.acRecords.length };
}

/**
 * 带重试的单学生更新（仅 E_NETWORK 重试，退避 10s，最多 2 次）
 */
async function updateStudentACWithRetry(
  studentId: string,
): Promise<UpdateResult> {
  let lastResult: UpdateResult | null = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const result = await updateStudentAC(studentId);
    if (result.success) return result;
    lastResult = result;
    // 仅网络错误重试；404/403/PARSE/RATE_LIMIT 不重试
    if (result.error.code !== 'E_NETWORK') return result;
    if (attempt < MAX_RETRY) {
      await sleep(RETRY_BACKOFF_MS);
    }
  }
  return lastResult!;
}

// ---- 班级更新循环（含断点续传） ----

/**
 * 班级更新主循环（start 和 resume 共用）
 *
 * @param taskId 任务 ID
 * @param classId 班级 ID
 * @param students 有序学生列表
 * @param startFrom 从第几个开始（断点续传偏移量）
 * @param initialFailed 初始失败列表（断点续传时从 Dexie 恢复）
 * @param onProgress 进度回调（SW 重启续传时为 undefined）
 */
async function runClassUpdateLoop(
  taskId: string,
  classId: string,
  students: Student[],
  startFrom: number,
  initialFailed: string[],
  onProgress?: ProgressCallback,
): Promise<ClassUpdateResult> {
  const total = students.length;
  let done = startFrom;
  let failed = [...initialFailed];

  try {
    for (let i = startFrom; i < students.length; i++) {
      // 每次循环前检查任务是否仍为 running（防止被外部取消）
      const task = await db.taskProgress.get(taskId);
      if (!task || task.status !== 'running') {
        break;
      }

      const student = students[i];
      const result = await updateStudentACWithRetry(student.id);

      if (!result.success) {
        // 去重加入失败列表
        if (!failed.includes(student.id)) {
          failed.push(student.id);
        }
        // 风控触发：暂停 5 分钟后继续后续学生
        if (result.error.code === 'E_LUOGU_RATE_LIMIT') {
          console.warn(
            `[batch-task] 触发风控，暂停 ${RATE_LIMIT_PAUSE_MS / 1000}s 后继续`,
          );
          await sleep(RATE_LIMIT_PAUSE_MS);
        }
      }

      // ---- 断点续传存档点：每完成一个学生立即写 Dexie ----
      done = i + 1;
      await db.taskProgress.update(taskId, {
        done,
        failed,
        updatedAt: Date.now(),
      });
      onProgress?.(done, total, failed);

      // 学生间间隔（最后一个不睡）
      if (i < students.length - 1) {
        const interval = await getRequestInterval();
        await sleep(interval);
      }
    }

    // 标记完成
    await db.taskProgress.update(taskId, {
      status: 'completed',
      done,
      failed,
      updatedAt: Date.now(),
    });
    // 刷新班级 lastSyncedAt
    await refreshClassLastSyncedAt(classId);
    // 发系统通知 + 设置 badge（规格 §3.5）
    notifyTaskDone(done, failed);
  } catch (e) {
    console.error('[batch-task] 班级更新任务异常:', e);
    await db.taskProgress.update(taskId, {
      status: 'failed',
      done,
      failed,
      updatedAt: Date.now(),
    });
    // 失败也发通知
    notifyTaskDone(done, failed);
  } finally {
    currentTaskId = null;
    await stopKeepalive();
  }

  return { taskId, total, done, failed };
}

/**
 * 启动班级更新任务
 *
 * 流程：
 * 1. 防重入检查
 * 2. 读取班级学生列表
 * 3. 创建 taskProgress 记录
 * 4. 启动保活
 * 5. 异步运行主循环（立即返回 taskId，循环在后台跑）
 *
 * @param classId 班级 ID
 * @param onProgress 进度回调（popup 可传，SW 重启续传时为 undefined）
 * @returns taskId（启动失败时抛异常）
 */
export async function startClassUpdate(
  classId: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  // 防重入
  if (currentTaskId) {
    throw new Error(`已有任务在运行: ${currentTaskId}`);
  }
  const existing = await getRunningTask();
  if (existing) {
    throw new Error(`已有任务在运行: ${existing.taskId}`);
  }

  const students = await getClassStudents(classId);
  const taskId = generateTaskId();
  const now = Date.now();

  await db.taskProgress.put({
    taskId,
    type: 'class_update',
    targetId: classId,
    total: students.length,
    done: 0,
    failed: [],
    status: 'running',
    startedAt: now,
    updatedAt: now,
  });
  currentTaskId = taskId;
  await startKeepalive();

  // 异步运行主循环（不 await，立即返回 taskId）
  runClassUpdateLoop(taskId, classId, students, 0, [], onProgress).catch(
    (e) => {
      console.error('[batch-task] 班级更新未捕获异常:', e);
    },
  );

  return taskId;
}

/**
 * 启动单学生更新任务
 *
 * 创建 taskProgress（type='student_update', total=1），启动保活，异步执行 updateStudentAC。
 * 完成后刷新该学生所在的所有班级的 lastSyncedAt。
 *
 * @param studentId 学生内部 ID
 * @returns taskId
 */
export async function startStudentUpdate(
  studentId: string,
): Promise<string> {
  if (currentTaskId) {
    throw new Error(`已有任务在运行: ${currentTaskId}`);
  }
  const existing = await getRunningTask();
  if (existing) {
    throw new Error(`已有任务在运行: ${existing.taskId}`);
  }

  const taskId = generateTaskId();
  const now = Date.now();

  await db.taskProgress.put({
    taskId,
    type: 'student_update',
    targetId: studentId,
    total: 1,
    done: 0,
    failed: [],
    status: 'running',
    startedAt: now,
    updatedAt: now,
  });
  currentTaskId = taskId;
  await startKeepalive();

  // 异步执行单学生更新
  (async () => {
    let failed: string[] = [];
    let done = 0;
    try {
      const result = await updateStudentACWithRetry(studentId);
      done = 1;
      if (!result.success) {
        failed = [studentId];
        // 风控暂停（单学生场景下仍暂停，便于后续手动重试其他学生）
        if (result.error.code === 'E_LUOGU_RATE_LIMIT') {
          console.warn(
            `[batch-task] 单学生更新触发风控，暂停 ${RATE_LIMIT_PAUSE_MS / 1000}s`,
          );
          await sleep(RATE_LIMIT_PAUSE_MS);
        }
      }
      await db.taskProgress.update(taskId, {
        status: 'completed',
        done,
        failed,
        updatedAt: Date.now(),
      });
      // 刷新该学生所在的所有班级的 lastSyncedAt
      const memberships = await db.class_members
        .where('studentId')
        .equals(studentId)
        .toArray();
      for (const m of memberships) {
        await refreshClassLastSyncedAt(m.classId);
      }
      // 发系统通知 + 设置 badge（规格 §3.5）
      notifyTaskDone(done, failed);
    } catch (e) {
      console.error('[batch-task] 单学生更新异常:', e);
      await db.taskProgress.update(taskId, {
        status: 'failed',
        done,
        failed: failed.length > 0 ? failed : [studentId],
        updatedAt: Date.now(),
      });
      // 失败也发通知
      notifyTaskDone(done, failed.length > 0 ? failed : [studentId]);
    } finally {
      currentTaskId = null;
      await stopKeepalive();
    }
  })().catch((e) => {
    console.error('[batch-task] 单学生更新未捕获异常:', e);
  });

  return taskId;
}

/**
 * 获取任务状态（供 popup/管理页轮询）
 * @param taskId 任务 ID
 */
export async function getTaskStatus(
  taskId: string,
): Promise<TaskProgress | null> {
  const task = await db.taskProgress.get(taskId);
  return task ?? null;
}

/**
 * SW 重启恢复：检查是否有运行中的任务，有则从断点续传
 *
 * 应在 SW 入口模块顶层调用。触发时机：
 * - SW 首次安装/更新后启动
 * - SW 被 Chrome 杀后，被 alarm / 消息 / 图标点击等事件唤醒
 *
 * 续传策略：
 * - class_update：重新读取班级学生列表，从 done 偏移量继续
 * - student_update：单学生任务，done=0 则重试，done=1 则标记完成
 */
export async function resumeInterruptedTask(): Promise<void> {
  const task = await getRunningTask();
  if (!task) return;
  if (currentTaskId === task.taskId) return; // 已在恢复中

  console.warn(
    `[batch-task] SW 重启，从断点续传任务 ${task.taskId} (done=${task.done}/${task.total})`,
  );
  currentTaskId = task.taskId;
  await startKeepalive();

  if (task.type === 'class_update') {
    // 重新读取学生列表（顺序确定，与启动时一致）
    const students = await getClassStudents(task.targetId);
    // 从 done 续传（onProgress 为 undefined，popup 关闭后通过轮询获取进度）
    runClassUpdateLoop(
      task.taskId,
      task.targetId,
      students,
      task.done,
      task.failed,
    ).catch((e) => {
      console.error('[batch-task] 断点续传异常:', e);
    });
  } else if (task.type === 'student_update') {
    // 单学生任务：done=0 重试，done=1 已完成（标记 completed）
    if (task.done >= task.total) {
      await db.taskProgress.update(task.taskId, {
        status: 'completed',
        updatedAt: Date.now(),
      });
      currentTaskId = null;
      await stopKeepalive();
      return;
    }
    // 重试该学生（onProgress 为 undefined）
    (async () => {
      let failed: string[] = [];
      try {
        const result = await updateStudentACWithRetry(task.targetId);
        if (!result.success) {
          failed = [task.targetId];
          if (result.error.code === 'E_LUOGU_RATE_LIMIT') {
            await sleep(RATE_LIMIT_PAUSE_MS);
          }
        }
        await db.taskProgress.update(task.taskId, {
          status: 'completed',
          done: 1,
          failed,
          updatedAt: Date.now(),
        });
        const memberships = await db.class_members
          .where('studentId')
          .equals(task.targetId)
          .toArray();
        for (const m of memberships) {
          await refreshClassLastSyncedAt(m.classId);
        }
        // 发系统通知 + 设置 badge（规格 §3.5）
        notifyTaskDone(1, failed);
      } catch (e) {
        console.error('[batch-task] 单学生续传异常:', e);
        await db.taskProgress.update(task.taskId, {
          status: 'failed',
          done: 1,
          failed: [task.targetId],
          updatedAt: Date.now(),
        });
        // 失败也发通知
        notifyTaskDone(1, [task.targetId]);
      } finally {
        currentTaskId = null;
        await stopKeepalive();
      }
    })().catch((e) => {
      console.error('[batch-task] 单学生续传未捕获异常:', e);
    });
  }
}
