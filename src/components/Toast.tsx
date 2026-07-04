// Toast 提示组件（轻量全局实现）
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** Toast 类型 */
export type ToastType = 'success' | 'error' | 'info';

/** 单条 Toast 数据 */
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

/** Toast 上下文值 */
interface ToastContextValue {
  /** 显示一条 toast */
  show: (type: ToastType, message: string) => void;
  /** 便捷方法：成功 */
  success: (message: string) => void;
  /** 便捷方法：错误 */
  error: (message: string) => void;
  /** 便捷方法：信息 */
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Toast Provider，包裹在 App 根部 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      // 3 秒自动消失
      setTimeout(() => remove(id), 3000);
    },
    [remove],
  );

  const ctx: ToastContextValue = {
    show,
    success: (m) => show('success', m),
    error: (m) => show('error', m),
    info: (m) => show('info', m),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
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

/** Toast 样式映射 */
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

/** Toast 容器（固定右上角） */
function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const style = toastStyles[t.type];
        return (
          <div
            key={t.id}
            className={[
              'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg',
              'backdrop-blur-md min-w-[240px] max-w-md',
              'animate-[toastIn_0.25s_ease-out]',
              style.container,
            ].join(' ')}
            role="status"
          >
            {style.icon}
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button
              onClick={() => onClose(t.id)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
              aria-label="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/** 仅用于触发 useEffect 引入样式（占位，目前未使用） */
export function _ToastStylePlaceholder() {
  useEffect(() => {
    return () => {};
  }, []);
  return null;
}
