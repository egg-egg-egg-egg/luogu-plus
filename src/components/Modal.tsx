// 通用弹窗组件
import { type ReactNode, useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  /** 是否显示 */
  open: boolean;
  /** 标题 */
  title: string;
  /** 内容 */
  children: ReactNode;
  /** 底部按钮区，不传默认显示"关闭"按钮 */
  footer?: ReactNode;
  /** 关闭回调（点击遮罩 / 右上角 X / Esc 触发） */
  onClose: () => void;
  /** 弹窗宽度，默认 max-w-lg */
  maxWidth?: string;
  /** 是否可点击遮罩关闭，默认 true */
  closeOnOverlay?: boolean;
}

/** 通用弹窗：标题 + 内容 + 关闭按钮 */
export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  maxWidth = 'max-w-lg',
  closeOnOverlay = true,
}: ModalProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    // 禁止 body 滚动
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* 弹窗主体 */}
      <div
        className={[
          'relative w-full',
          maxWidth,
          'bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl',
          'border border-zinc-200 dark:border-zinc-800',
          'animate-[modalIn_0.2s_ease-out]',
        ].join(' ')}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="关闭"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">{children}</div>

        {/* 底部 */}
        {footer !== undefined ? (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
            {footer}
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          </div>
        )}
      </div>

      {/* 动画 keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
