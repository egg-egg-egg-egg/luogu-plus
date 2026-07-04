// 快捷操作区：更新当前选中 + 打开管理页

import { memo } from 'react';

interface QuickActionsProps {
  /** 当前选中名称（用于按钮文案），null 表示无选中 */
  selectionName: string | null;
  /** 是否正在更新中（按钮 loading 状态） */
  isUpdating: boolean;
  /** 点击更新按钮 */
  onUpdate: () => void;
  /** 点击打开管理页 */
  onOpenOptions: () => void;
}

function QuickActionsBase({
  selectionName,
  isUpdating,
  onUpdate,
  onOpenOptions,
}: QuickActionsProps) {
  const canUpdate = selectionName !== null && !isUpdating;

  return (
    <section className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        快捷操作
      </label>
      <div className="flex flex-col gap-2">
        {/* 更新当前选中 */}
        <button
          onClick={onUpdate}
          disabled={!canUpdate}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-luogu-ac hover:bg-luogu-ac/90 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
        >
          {isUpdating ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
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
              更新中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              更新{selectionName || ''}
            </>
          )}
        </button>

        {/* 打开管理页 */}
        <button
          onClick={onOpenOptions}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          打开管理页
        </button>
      </div>
    </section>
  );
}

export const QuickActions = memo(QuickActionsBase);
