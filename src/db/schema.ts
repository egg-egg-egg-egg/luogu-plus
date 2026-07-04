import Dexie, { type Table } from 'dexie';
import type {
  Student,
  Class,
  ClassMember,
  AcRecord,
  Problem,
  Meta,
  TaskProgress,
  Log,
  StudentStatus,
  LogLevel,
} from './types';

/**
 * 洛谷老师助手 IndexedDB 数据库
 * Schema 升级路径见规格文档 §5.9
 */
export class LuoguPlusDB extends Dexie {
  students!: Table<Student, string>;
  classes!: Table<Class, string>;
  class_members!: Table<ClassMember, [string, string]>;
  acRecords!: Table<AcRecord, [string, string]>;
  problems!: Table<Problem, string>;
  meta!: Table<Meta, string>;
  taskProgress!: Table<TaskProgress, string>;
  logs!: Table<Log, string>;

  constructor() {
    super('luogu-plus');
    // v1 初始版本（规格 §5.9），8 张表
    this.version(1).stores({
      students: 'id, luoguId',
      classes: 'id',
      class_members: '[classId+studentId], classId, studentId',
      acRecords: '[studentId+problemId], studentId, problemId',
      problems: 'id, difficulty',
      meta: 'key',
      taskProgress: 'taskId',
      logs: 'id, createdAt',
    });
  }
}

/** 数据库单例 */
export const db = new LuoguPlusDB();

// ============ 工具函数 ============

/** 生成 UUID（Chrome 92+ 支持 crypto.randomUUID） */
function genId(): string {
  return crypto.randomUUID();
}

/** 获取当前时间戳 */
function now(): number {
  return Date.now();
}

/** 一天的毫秒数，用于日志清理 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ============ Student 操作 ============

/**
 * 添加学生
 *
 * luoguId 全局唯一，重复添加抛出错误。
 *
 * @param luoguId 洛谷 UID
 * @param luoguName 洛谷昵称
 * @param remark 老师备注名（真实姓名），可留空
 * @returns 新创建的学生记录
 * @throws Error "该学生已存在" —— 重复添加时抛出
 */
export async function addStudent(
  luoguId: number,
  luoguName: string,
  remark: string,
): Promise<Student> {
  // 应用层校验 luoguId 唯一性（schema 未加 & 唯一约束，靠代码保证）
  const existing = await db.students.where('luoguId').equals(luoguId).first();
  if (existing) {
    throw new Error('该学生已存在');
  }
  const ts = now();
  const student: Student = {
    id: genId(),
    luoguId,
    luoguName,
    remark,
    status: 'active',
    lastSyncedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.students.add(student);
  return student;
}

/**
 * 按内部 ID 获取学生
 *
 * @param id 学生内部 UUID
 * @returns 学生记录，不存在返回 undefined
 */
export async function getStudent(id: string): Promise<Student | undefined> {
  return db.students.get(id);
}

/**
 * 按洛谷 UID 获取学生
 *
 * @param luoguId 洛谷 UID
 * @returns 学生记录，不存在返回 undefined
 */
export async function getStudentByLuoguId(
  luoguId: number,
): Promise<Student | undefined> {
  return db.students.where('luoguId').equals(luoguId).first();
}

/**
 * 获取所有学生
 *
 * @returns 全部学生列表
 */
export async function getAllStudents(): Promise<Student[]> {
  return db.students.toArray();
}

/**
 * 更新学生记录（部分字段）
 *
 * 自动刷新 updatedAt 时间戳。
 *
 * @param id 学生内部 UUID
 * @param changes 待更新的字段
 */
export async function updateStudent(
  id: string,
  changes: Partial<Student>,
): Promise<void> {
  await db.students.update(id, { ...changes, updatedAt: now() });
}

/**
 * 刷新学生洛谷昵称
 *
 * 每次更新学生 AC 记录时顺带调用，同步最新昵称。
 *
 * @param id 学生内部 UUID
 * @param luoguName 最新的洛谷昵称
 */
export async function updateStudentName(
  id: string,
  luoguName: string,
): Promise<void> {
  await db.students.update(id, { luoguName, updatedAt: now() });
}

/**
 * 删除学生（事务级联清理）
 *
 * 级联规则（规格 §3.1）：
 * ① 删除该学生的 acRecords
 * ② 删除 class_members 中的引用
 * ③ 删除 students 记录
 * problems 表不动（题目可能被其他学生 AC 过）
 *
 * 使用事务确保三步同步完成，中途失败全部回滚。
 *
 * @param id 学生内部 UUID
 */
export async function deleteStudent(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.acRecords,
    db.class_members,
    db.students,
    async () => {
      await db.acRecords.where('studentId').equals(id).delete();
      await db.class_members.where('studentId').equals(id).delete();
      await db.students.delete(id);
    },
  );
}

/**
 * 设置学生状态
 *
 * 抓取遇 404/403 时标记 invalid，恢复时标记 active。
 *
 * @param id 学生内部 UUID
 * @param status 学生状态
 */
export async function setStudentStatus(
  id: string,
  status: StudentStatus,
): Promise<void> {
  await db.students.update(id, { status, updatedAt: now() });
}

// ============ Class 操作 ============

/**
 * 创建班级
 *
 * 新班级 lastSyncedAt 为 null（无成员，视为从未更新）。
 *
 * @param name 班级名
 * @returns 新创建的班级记录
 */
export async function addClass(name: string): Promise<Class> {
  const ts = now();
  const cls: Class = {
    id: genId(),
    name,
    lastSyncedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.classes.add(cls);
  return cls;
}

/**
 * 获取班级
 *
 * @param id 班级 UUID
 * @returns 班级记录，不存在返回 undefined
 */
export async function getClass(id: string): Promise<Class | undefined> {
  return db.classes.get(id);
}

/**
 * 获取所有班级
 *
 * @returns 全部班级列表
 */
export async function getAllClasses(): Promise<Class[]> {
  return db.classes.toArray();
}

/**
 * 更新班级（部分字段）
 *
 * 自动刷新 updatedAt 时间戳。
 *
 * @param id 班级 UUID
 * @param changes 待更新的字段
 */
export async function updateClass(
  id: string,
  changes: Partial<Class>,
): Promise<void> {
  await db.classes.update(id, { ...changes, updatedAt: now() });
}

/**
 * 删除班级（事务级联清理）
 *
 * 仅删 classes 记录 + class_members 关系（规格 §3.2）。
 * 不动 students 和 acRecords —— 学生可能在别的班。
 *
 * 使用事务确保两步同步完成。
 *
 * @param id 班级 UUID
 */
export async function deleteClass(id: string): Promise<void> {
  await db.transaction('rw', db.classes, db.class_members, async () => {
    await db.class_members.where('classId').equals(id).delete();
    await db.classes.delete(id);
  });
}

/**
 * 班级重命名
 *
 * @param id 班级 UUID
 * @param name 新班级名
 */
export async function renameClass(id: string, name: string): Promise<void> {
  await db.classes.update(id, { name, updatedAt: now() });
}

// ============ ClassMember 操作 ============

/**
 * 将学生加入班级（幂等）
 *
 * 同一学生加入同一班级自动去重，不报错（规格 §3.2）。
 *
 * @param classId 班级 UUID
 * @param studentId 学生内部 UUID
 */
export async function addStudentToClass(
  classId: string,
  studentId: string,
): Promise<void> {
  const existing = await db.class_members.get([classId, studentId]);
  if (existing) return; // 幂等：已存在不报错
  const member: ClassMember = {
    classId,
    studentId,
    addedAt: now(),
  };
  await db.class_members.add(member);
}

/**
 * 将学生移出班级
 *
 * @param classId 班级 UUID
 * @param studentId 学生内部 UUID
 */
export async function removeStudentFromClass(
  classId: string,
  studentId: string,
): Promise<void> {
  await db.class_members.delete([classId, studentId]);
}

/**
 * 获取班级内所有学生
 *
 * 通过 class_members 关系表反查 students。
 *
 * @param classId 班级 UUID
 * @returns 班级内学生列表
 */
export async function getClassMembers(classId: string): Promise<Student[]> {
  const members = await db.class_members
    .where('classId')
    .equals(classId)
    .toArray();
  if (members.length === 0) return [];
  const studentIds = members.map((m) => m.studentId);
  const students = await db.students.bulkGet(studentIds);
  return students.filter((s): s is Student => s !== undefined);
}

/**
 * 获取学生所在的所有班级
 *
 * 通过 class_members 关系表反查 classes。
 *
 * @param studentId 学生内部 UUID
 * @returns 学生所在班级列表
 */
export async function getStudentClasses(studentId: string): Promise<Class[]> {
  const members = await db.class_members
    .where('studentId')
    .equals(studentId)
    .toArray();
  if (members.length === 0) return [];
  const classIds = members.map((m) => m.classId);
  const classes = await db.classes.bulkGet(classIds);
  return classes.filter((c): c is Class => c !== undefined);
}

/**
 * 获取班级成员数量
 *
 * @param classId 班级 UUID
 * @returns 成员数量
 */
export async function getClassMemberCount(classId: string): Promise<number> {
  return db.class_members.where('classId').equals(classId).count();
}

// ============ AcRecord 操作 ============

/**
 * 全量覆盖学生的 AC 记录（事务：先删后插）
 *
 * 每次更新学生 AC 记录时调用，用最新数据替换旧缓存。
 * 0 AC 学生传空数组，对应 0 条记录。
 *
 * 使用事务确保删除和插入原子完成。
 *
 * @param studentId 学生内部 UUID
 * @param records 新的 AC 记录列表
 */
export async function saveAcRecords(
  studentId: string,
  records: AcRecord[],
): Promise<void> {
  await db.transaction('rw', db.acRecords, async () => {
    await db.acRecords.where('studentId').equals(studentId).delete();
    if (records.length > 0) {
      await db.acRecords.bulkPut(records);
    }
  });
}

/**
 * 获取学生的所有 AC 记录
 *
 * @param studentId 学生内部 UUID
 * @returns AC 记录列表
 */
export async function getAcRecordsByStudent(
  studentId: string,
): Promise<AcRecord[]> {
  return db.acRecords.where('studentId').equals(studentId).toArray();
}

/**
 * 获取 AC 过某题的学生 ID 列表
 *
 * 用于详情页状态条 / 列表页徽章展示。
 * 复合主键 [studentId+problemId] 保证同一学生同一题目只有一条记录，无重复。
 *
 * @param problemId 题目 ID
 * @returns 学生内部 ID 列表
 */
export async function getStudentsByProblem(
  problemId: string,
): Promise<string[]> {
  const records = await db.acRecords
    .where('problemId')
    .equals(problemId)
    .toArray();
  return records.map((r) => r.studentId);
}

/**
 * 获取学生 AC 记录数量
 *
 * @param studentId 学生内部 UUID
 * @returns AC 题目数
 */
export async function getAcRecordCount(studentId: string): Promise<number> {
  return db.acRecords.where('studentId').equals(studentId).count();
}

// ============ Problem 操作 ============

/**
 * upsert 单个题目（存在则更新，不存在则插入）
 *
 * 每次抓取学生 AC 记录时顺带 upsert 题目难度（洛谷改难度自动同步）。
 * Dexie put 语义为 insert-or-replace，自动覆盖旧记录。
 *
 * @param problem 题目记录
 */
export async function upsertProblem(problem: Problem): Promise<void> {
  await db.problems.put({ ...problem, updatedAt: now() });
}

/**
 * 批量 upsert 题目
 *
 * @param problems 题目记录列表
 */
export async function upsertProblems(problems: Problem[]): Promise<void> {
  if (problems.length === 0) return;
  const ts = now();
  await db.problems.bulkPut(
    problems.map((p) => ({ ...p, updatedAt: ts })),
  );
}

/**
 * 获取题目
 *
 * @param id 题目 ID
 * @returns 题目记录，不存在返回 undefined
 */
export async function getProblem(id: string): Promise<Problem | undefined> {
  return db.problems.get(id);
}

/**
 * 批量获取题目
 *
 * @param ids 题目 ID 列表
 * @returns 题目列表（不存在的 ID 自动跳过）
 */
export async function getProblemsByIds(ids: string[]): Promise<Problem[]> {
  if (ids.length === 0) return [];
  const results = await db.problems.bulkGet(ids);
  return results.filter((p): p is Problem => p !== undefined);
}

// ============ Meta 操作 ============

/**
 * 读取元数据
 *
 * 用于 requestInterval / theme / staleThresholdDays 等配置项。
 *
 * @param key 元数据键
 * @returns 元数据值，不存在返回 undefined
 */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const m = await db.meta.get(key);
  return m?.value as T | undefined;
}

/**
 * 写入元数据
 *
 * @param key 元数据键
 * @param value 元数据值
 */
export async function setMeta<T>(key: string, value: T): Promise<void> {
  await db.meta.put({ key, value });
}

// ============ TaskProgress 操作 ============

/**
 * 创建任务进度
 *
 * 用于 SW 保活断点续传，任务启动时创建记录。
 *
 * @param task 任务进度记录
 */
export async function createTask(task: TaskProgress): Promise<void> {
  await db.taskProgress.put(task);
}

/**
 * 更新任务进度
 *
 * 自动刷新 updatedAt 时间戳。每抓完一个学生就调用更新 done/failed。
 *
 * @param taskId 任务 UUID
 * @param changes 待更新的字段
 */
export async function updateTask(
  taskId: string,
  changes: Partial<TaskProgress>,
): Promise<void> {
  await db.taskProgress.update(taskId, { ...changes, updatedAt: now() });
}

/**
 * 获取任务进度
 *
 * @param taskId 任务 UUID
 * @returns 任务进度记录，不存在返回 undefined
 */
export async function getTask(taskId: string): Promise<TaskProgress | undefined> {
  return db.taskProgress.get(taskId);
}

/**
 * 获取正在运行的任务（用于断点续传）
 *
 * SW 重启后调用此函数检查是否有未完成的任务。
 * taskProgress 表无 status 索引，使用 filter 遍历（任务数量极少，性能无忧）。
 *
 * @returns 正在运行的任务，无则返回 undefined
 */
export async function getRunningTask(): Promise<TaskProgress | undefined> {
  return db.taskProgress.filter((t) => t.status === 'running').first();
}

/**
 * 删除任务进度
 *
 * @param taskId 任务 UUID
 */
export async function deleteTask(taskId: string): Promise<void> {
  await db.taskProgress.delete(taskId);
}

/**
 * 清理已完成任务
 *
 * 删除所有 status !== 'running' 的任务（含 completed 和 failed）。
 */
export async function cleanCompletedTasks(): Promise<void> {
  await db.taskProgress.filter((t) => t.status !== 'running').delete();
}

// ============ Log 操作 ============

/**
 * 添加日志
 *
 * 本地诊断用，不上报服务器。
 *
 * @param level 日志级别
 * @param message 日志消息
 * @param context 上下文数据（可选）
 */
export async function addLog(
  level: LogLevel,
  message: string,
  context?: unknown,
): Promise<void> {
  const log: Log = {
    id: genId(),
    level,
    message,
    context,
    createdAt: now(),
  };
  await db.logs.add(log);
}

/**
 * 获取日志（按时间倒序）
 *
 * @param limit 返回条数上限，不传返回全部
 * @returns 日志列表
 */
export async function getLogs(limit?: number): Promise<Log[]> {
  let collection = db.logs.orderBy('createdAt').reverse();
  if (limit !== undefined && limit > 0) {
    collection = collection.limit(limit);
  }
  return collection.toArray();
}

/**
 * 清理旧日志
 *
 * 删除 N 天前的日志（规格 §5.8 默认保留 7 天）。
 *
 * @param daysToKeep 保留天数
 */
export async function cleanOldLogs(daysToKeep: number): Promise<void> {
  const cutoff = now() - daysToKeep * ONE_DAY_MS;
  await db.logs.where('createdAt').below(cutoff).delete();
}

// ============ Class lastSyncedAt 计算 ============

/**
 * 刷新班级 lastSyncedAt
 *
 * 取班级所有学生 lastSyncedAt 的最小值更新到 class.lastSyncedAt。
 * 若任一学生从未更新（lastSyncedAt 为 null），则班级 lastSyncedAt 为 null。
 * 空班级（无成员）lastSyncedAt 为 null。
 *
 * 应在以下场景调用：
 * - 学生加入/移出班级后
 * - 班级任一学生的 AC 记录更新后
 * - 学生删除后（若该学生在班级内）
 *
 * @param classId 班级 UUID
 */
export async function refreshClassLastSyncedAt(
  classId: string,
): Promise<void> {
  const members = await db.class_members
    .where('classId')
    .equals(classId)
    .toArray();

  let lastSyncedAt: number | null = null;

  if (members.length > 0) {
    const students = await db.students.bulkGet(
      members.map((m) => m.studentId),
    );
    const validStudents = students.filter(
      (s): s is Student => s !== undefined,
    );

    if (validStudents.length > 0) {
      // 任一学生从未更新 → 班级为 null
      if (validStudents.some((s) => s.lastSyncedAt === null)) {
        lastSyncedAt = null;
      } else {
        // 取所有学生 lastSyncedAt 的最小值
        const syncTimes = validStudents
          .map((s) => s.lastSyncedAt)
          .filter((t): t is number => t !== null);
        lastSyncedAt = syncTimes.length > 0 ? Math.min(...syncTimes) : null;
      }
    }
  }

  await db.classes.update(classId, { lastSyncedAt, updatedAt: now() });
}
