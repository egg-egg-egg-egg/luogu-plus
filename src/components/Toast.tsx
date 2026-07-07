// Toast 提示组件（轻量全局实现）
//
// 设计要点（修复「闪烁」与「重复弹窗」两个问题的核心）：
// 1. toast 状态存放在模块级外部 store，而非 Provider 的 React state。
//    这样新增/移除 toast 只触发独立的 <ToastViewport /> 重渲染，
//    不会带着整棵 App 树（学生列表、进度条等）一起重渲染，杜绝页面闪烁。
// 2. 通过 context 暴露的是「稳定的单例函数引用」，不会因为 toast 变化而改变
//    identity。下游 useCallback/useEffect 依赖 toast 时不会误触发，
//    从而避免 useTaskProgress 的回调被反复重置、重复调用。
// 3. 相同 type + message 的 toast 自动去重，避免一次操作堆叠多条。
// 4. 提供进入/退出动画，消失过程平滑无突兀闪烁。

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** Toast 类型 */
export type ToastType = 'success' | 'error' | 'info';

/** 单条 Toast 数据 */
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** 是否正在退出（用于播放退出动画） */
  leaving: boolean;
}

/** 自动消失时长（ms） */
const TOAST_TTL = 3000;
/** 退出动画时长（ms），需与 CSS 中的 toastOut 动画一致 */
const TOAST_LEAVE_MS = 200;

// ===================== 外部 store（模块级，脱离 React 渲染） =====================

let toastState: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ToastItem[] {
  return toastState;
}

/** 调度自动消失 */
function scheduleAutoRemove(id: string) {
  window.setTimeout(() => removeToast(id), TOAST_TTL);
}

/** 新增一条 toast（默认去重） */
function addToast(type: ToastType, message: string, dedupe = true) {
  if (dedupe && toastState.some((t) => t.type === type && t.message === message && !t.leaving)) {
    // 相同操作已有一条可见 toast，不再堆叠
    return;
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  toastState = [...toastState, { id, type, message, leaving: false }];
  emit();
  scheduleAutoRemove(id);
}

/** 移除一条 toast（先播放退出动画，再真正卸载） */
function removeToast(id: string) {
  const target = toastState.find((t) => t.id === id);
  if (!target || target.leaving) return;
  // 标记离开，触发退出动画
  toastState = toastState.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  // 动画结束后真正移除
  window.setTimeout(() => {
    toastState = toastState.filter((t) => t.id !== id);
    emit();
  }, TOAST_LEAVE_MS);
}

// 模块级稳定函数引用：保证 context value 永远不变
function show(type: ToastType, message: string) {
  addToast(type, message);
}
function showSuccess(message: string) {
  addToast('success', message);
}
function showError(message: string) {
  addToast('error', message);
}
function showInfo(message: string) {
  addToast('info', message);
}

// ===================== Context（稳定单例，不随渲染变化） =====================

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const toastContextValue: ToastContextValue = {
  show,
  success: showSuccess,
  error: showError,
  info: showInfo,
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Toast Provider，包裹在 App 根部 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={toastContextValue}>
      {children}
      {/* 独立视图层：toast 状态变化只重渲染它，不影响 children */}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

/** 使用 toast */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return ctx;
}

// ===================== 视图层 =====================

const toastStyles: Record<ToastType, { container: string; icon: ReactNode }> = {
  success: {
    container:
      'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  error: {
    container:
      'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  info: {
    container:
      'bg-blue-50 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

/** 进入/退出动画 keyframes（始终注入，供 toast 复用） */
const TOAST_KEYFRAMES = `
@keyframes toastIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(20px); }
}
`;

/** Toast 视图层：仅订阅外部 store，独立重渲染，不影响 App 其余部分 */
function ToastViewport() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <>
      <style>{TOAST_KEYFRAMES}</style>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} onClose={() => removeToast(t.id)} />
          ))}
        </div>
      )}
    </>
  );
}

/** 单条 Toast 卡片 */
function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}) {
  const style = toastStyles[item.type];
  const animClass = item.leaving
    ? 'animate-[toastOut_0.2s_ease-in_forwards]'
    : 'animate-[toastIn_0.25s_ease-out]';

  return (
    <div
      className={[
        'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg',
        'backdrop-blur-md min-w-[240px] max-w-md',
        animClass,
        style.container,
      ].join(' ')}
      role="status"
    >
      {style.icon}
      <span className="text-sm font-medium flex-1">{item.message}</span>
      <button
        onClick={onClose}
        className="text-current opacity-50 hover:opacity-100 transition-opacity"
        aria-label="关闭"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
