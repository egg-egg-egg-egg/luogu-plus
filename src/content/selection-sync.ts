// 选中状态同步（content script 专用）
// 规格文档 §3.4.1 被动触发模型
//
// 监听 chrome.storage.onChanged，key = 'currentSelection'
// 变化时通知所有注入器更新
//
// 跨标签页广播机制：一个标签页切换选择，所有标签页同步更新徽章

import {
  type Selection,
  getSelection,
  onSelectionChange as onSelectionChangeBase,
} from '@/store/selection';

/** 选中状态变化回调 */
type SelectionChangeCallback = (selection: Selection) => void;

/** 当前选中状态（content script 本地缓存，避免每次都查 storage） */
let currentSelection: Selection = null;

/** 已注册的回调列表 */
const callbacks = new Set<SelectionChangeCallback>();

/** 是否已初始化 */
let initialized = false;

/**
 * 获取当前选中状态（同步接口，从本地缓存读）
 * 未初始化时返回 null，初始化后返回最新值
 */
export function getCurrentSelection(): Selection {
  return currentSelection;
}

/**
 * 监听选中状态变化（content script 注入器用）
 * 回调会在每次 selection 变化时被调用
 * @returns 取消订阅函数
 */
export function onSelectionChange(callback: SelectionChangeCallback): () => void {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

/** 通知所有注册的回调 */
function notifyCallbacks(selection: Selection): void {
  for (const cb of callbacks) {
    try {
      cb(selection);
    } catch (err) {
      // 单个回调失败不影响其他回调
      console.warn('[洛谷老师助手] 选中状态回调执行失败:', err);
    }
  }
}

/**
 * 初始化选中状态同步
 * - 从 storage 读取当前值并缓存
 * - 监听 storage.onChanged，变化时更新缓存并通知回调
 * 内部有 initialized 守卫，多次调用安全。
 */
export function initSelectionSync(): void {
  if (initialized) return;
  initialized = true;

  // 监听变化（onSelectionChangeBase 会先触发一次当前值）
  onSelectionChangeBase((selection) => {
    currentSelection = selection;
    notifyCallbacks(selection);
  });

  // 异步读取初始值（确保 onSelectionChangeBase 的首次触发已覆盖）
  void getSelection().then((selection) => {
    currentSelection = selection;
  });
}
