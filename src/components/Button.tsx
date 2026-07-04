// 通用按钮组件
import { type ButtonHTMLAttributes, forwardRef } from 'react';

/** 按钮变体 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost';

/** 按钮尺寸 */
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/** 变体样式映射 */
const variantStyles: Record<ButtonVariant, string> = {
  // 主按钮：洛谷 AC 绿
  primary:
    'bg-luogu-ac text-white hover:bg-luogu-ac/90 active:bg-luogu-ac/80 shadow-sm hover:shadow-md hover:-translate-y-0.5',
  // 次按钮：玻璃质感
  secondary:
    'bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-700 shadow-sm backdrop-blur-sm hover:-translate-y-0.5',
  // 危险按钮：红色
  danger:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-sm hover:shadow-md hover:-translate-y-0.5',
  // 幽灵按钮：无边框
  ghost:
    'bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
};

/** 尺寸样式映射 */
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1',
  md: 'text-sm px-4 py-2 gap-1.5',
  lg: 'text-base px-6 py-3 gap-2',
};

/** 通用按钮组件 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center rounded-lg font-medium',
          'transition-all duration-200 ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-luogu-ac/50 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
          variantStyles[variant],
          sizeStyles[size],
          className ?? '',
        ].join(' ')}
        {...rest}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
