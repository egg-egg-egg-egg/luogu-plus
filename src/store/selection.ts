// 选中状态 store + 跨上下文同步 + content↔background 消息协议类型
//
// 当前选中状态（学生 / 班级 / 无）通过 chrome.storage.local 持久化，
// 通过 chrome.storage.onChanged 事件广播到所有标签页的 content script。
// 一个标签页切换选择，所有标签页同步更新徽章。

import { create } from 'zustand';
import { getItem, setItem, onStorageChanged } from '@/lib/storage';

// ============ Selection 类型（content/background 共享） ============

/** 当前选中状态 */
export type Selection =
  | { type: 'student'; studentId: string }
  | { type: 'class'; classId: string }
  | null;

/** 选中状态类型（字符串形式，便于 store 内部使用） */
export type SelectionType = 'none' | 'student' | 'class';

// ============ 消息协议类型（content ↔ background 共享） ============

/** 单个学生的 AC 信息（消息返回值中的元素） */
export interface StudentAcInfo {
  studentId: string; // 学生内部 ID
  remark: string; // 老师备注名（真实姓名），可为空
  luoguName: string; // 洛谷昵称
  lastSyncedAt: number | null; // 最近一次同步时间戳，null=从未更新
}

/**
 * content script → background 的消息类型
 * 注意：background 需实现对应 handler（待 background 对齐）
 */
export type ContentToBackgroundMessage =
  /** 查询某题被哪些学生 AC 过（单题，详情页用） */
  | {
      type: 'QUERY_PROBLEM_AC';
      problemId: string;
      selection: Selection;
    }
  /** 批量查询多题（列表页优化，一次查所有题） */
  | {
      type: 'QUERY_PROBLEMS_AC';
      problemIds: string[];
      selection: Selection;
    }
  /** 获取缓存过期阈值（staleThresholdDays，从 meta 表读） */
  | { type: 'GET_STALE_THRESHOLD' };

/** background → content script 的响应类型 */
export type BackgroundToContentResponse =
  /** QUERY_PROBLEM_AC 的响应，total=选中范围内的总人数（学生=1，班级=班级人数） */
  | { ok: true; students: StudentAcInfo[]; total: number }
  /** QUERY_PROBLEMS_AC 的响应，results[problemId] = AC 该题的学生列表，total 同上 */
  | { ok: true; results: Record<string, StudentAcInfo[]>; total: number }
  /** GET_STALE_THRESHOLD 的响应，返回天数（默认 7） */
  | { ok: true; staleThresholdDays: number }
  /** 失败响应 */
  | { ok: false; error: string };

/** chrome.runtime.sendMessage 的类型化包装 */
export async function sendMessageToBackground(
  message: ContentToBackgroundMessage,
): Promise<BackgroundToContentResponse> {
  return (await chrome.runtime.sendMessage(
    message,
  )) as BackgroundToContentResponse;
}

// ============ storage 持久化常量 ============

/** chrome.storage.local 中存储 currentSelection 的 key（含命名空间前缀） */
export const SELECTION_STORAGE_KEY = 'currentSelection';

// ============ Zustand store（popup/options 等上下文内使用） ============

interface SelectionState {
  /** 当前选中类型 */
  type: SelectionType;
  /** 当前选中 ID（学生 ID 或班级 ID），type='none' 时为 null */
  id: string | null;
  /** 是否已完成首次从 storage 加载 */
  hydrated: boolean;
  /** 从 chrome.storage.local 加载初始状态 */
  hydrate: () => Promise<void>;
  /** 设置选择（同步更新 store + 持久化到 storage，广播到所有标签页） */
  setSelection: (type: SelectionType, id: string | null) => Promise<void>;
  /** 清除选择（回到零干扰状态） */
  clear: () => Promise<void>;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  type: 'none',
  id: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const stored = await getItem<Selection>(SELECTION_STORAGE_KEY);
    if (stored) {
      // 联合类型收窄：根据 type 判断访问 studentId 还是 classId
      if (stored.type === 'student') {
        set({ type: 'student', id: stored.studentId, hydrated: true });
      } else {
        set({ type: 'class', id: stored.classId, hydrated: true });
      }
    } else {
      set({ hydrated: true });
    }
  },

  setSelection: async (type, id) => {
    set({ type, id });
    const selection: Selection =
      type === 'none' || id === null
        ? null
        : type === 'student'
          ? { type: 'student', studentId: id }
          : { type: 'class', classId: id };
    await setItem<Selection>(SELECTION_STORAGE_KEY, selection);
  },

  clear: async () => {
    set({ type: 'none', id: null });
    await setItem<Selection>(SELECTION_STORAGE_KEY, null);
  },
}));

// ============ 跨标签页同步：监听 storage 变化更新 store ============

if (typeof chrome !== 'undefined' && chrome.storage) {
  onStorageChanged((key, newValue) => {
    if (key !== SELECTION_STORAGE_KEY) return;
    const selection = newValue as Selection | undefined;
    if (selection === null || selection === undefined) {
      useSelectionStore.setState({ type: 'none', id: null });
    } else if (selection.type === 'student') {
      useSelectionStore.setState({ type: 'student', id: selection.studentId });
    } else if (selection.type === 'class') {
      useSelectionStore.setState({ type: 'class', id: selection.classId });
    }
  });
}

// ============ content script 用的工具函数 ============

/**
 * 从 chrome.storage.local 读取当前选中状态（content script 入口用）
 * 返回 null 表示未选择（零干扰状态）
 */
export async function getSelection(): Promise<Selection> {
  return (await getItem<Selection>(SELECTION_STORAGE_KEY)) ?? null;
}

/**
 * 监听选中状态变化（content script 用，基于 chrome.storage.onChanged）
 * 回调立即触发一次当前值，之后每次变化触发
 */
export function onSelectionChange(callback: (selection: Selection) => void): void {
  // 先触发一次当前值
  void getSelection().then(callback);

  onStorageChanged((key, newValue) => {
    if (key !== SELECTION_STORAGE_KEY) return;
    callback((newValue as Selection) ?? null);
  });
}

/**
 * 将 store 内部的 { type, id } 转换为消息协议用的 Selection 类型
 */
export function selectionFromStore(state: {
  type: SelectionType;
  id: string | null;
}): Selection {
  if (state.type === 'none' || state.id === null) return null;
  if (state.type === 'student') return { type: 'student', studentId: state.id };
  return { type: 'class', classId: state.id };
}
