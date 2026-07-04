// 数据模型 TypeScript 类型定义（规格文档 §5）

/** 学生状态：active=正常, invalid=洛谷账号失效 */
export type StudentStatus = 'active' | 'invalid';

/**
 * 难度等级 0-7
 * 0=暂无评定, 1=入门, 2=普及-, 3=普及/提高-, 4=普及+/提高,
 * 5=提高+/省选-, 6=省选/NOI-, 7=NOI/NOI+
 */
export type Difficulty = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 任务类型 */
export type TaskType = 'class_update' | 'student_update' | 'batch_import';

/** 任务状态 */
export type TaskStatus = 'running' | 'completed' | 'failed';

/** 日志级别 */
export type LogLevel = 'info' | 'warn' | 'error';

/** §5.1 学生表 students */
export interface Student {
  id: string; // 内部 UUID
  luoguId: number; // 洛谷 UID，全局唯一索引
  luoguName: string; // 洛谷昵称，更新时顺带刷新
  remark: string; // 老师备注名（真实姓名），可留空
  status: StudentStatus; // active=正常, invalid=洛谷账号失效
  lastSyncedAt: number | null; // 最近一次成功更新 AC 记录的时间戳，null=从未更新
  createdAt: number;
  updatedAt: number;
}

/** §5.2 班级表 classes */
export interface Class {
  id: string; // 内部 UUID
  name: string; // 班级名
  lastSyncedAt: number | null; // 班级内所有学生 lastSyncedAt 的最小值，null=有人从未更新
  createdAt: number;
  updatedAt: number;
}

/** §5.3 班级-学生关系表 class_members（多对多） */
export interface ClassMember {
  classId: string; // 班级 ID
  studentId: string; // 学生 ID
  addedAt: number;
}

/** §5.4 AC 记录表 acRecords */
export interface AcRecord {
  studentId: string; // 学生内部 ID
  problemId: string; // 题目 ID，如 "P1234"，外键到 problems 表
  fetchedAt: number; // 拉取时间戳
}

/** §5.5 题目表 problems */
export interface Problem {
  id: string; // 题目 ID，如 "P1234"/"B2001"，主键（保留 P/B 前缀，原样存储）
  difficulty: Difficulty; // 最新已知难度（实测 number 类型 0-7）
  title: string; // 题目标题（已含 [NOIP ...] 等前缀，无需拼接）
  type: string; // 题目类型 "P"/"B"（历史可能有 T 等，不假设枚举封闭）
  updatedAt: number; // 难度最后刷新时间
}

/** §5.6 元数据表 meta */
export interface Meta {
  key: string; // 如 "requestInterval", "theme", "staleThresholdDays"
  value: unknown; // 值类型不固定，用 unknown 替代 any
}

/** §5.7 任务进度表 taskProgress（SW 保活双保险） */
export interface TaskProgress {
  taskId: string; // 任务 UUID
  type: TaskType;
  targetId: string; // 班级 ID / 学生 ID
  total: number; // 总人数
  done: number; // 已完成
  failed: string[]; // 失败的学生 ID 列表
  status: TaskStatus;
  startedAt: number;
  updatedAt: number;
}

/** §5.8 日志表 logs（本地诊断，不上报） */
export interface Log {
  id: string;
  level: LogLevel;
  message: string;
  context?: unknown; // 用 unknown 替代 any
  createdAt: number;
}
