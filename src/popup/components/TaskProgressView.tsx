// 更新进度反馈区
//
// 三种状态：
// 1. running：进度条 + done/total + 当前学生名
// 2. completed（全部成功）：更新完成 ✓
// 3. completed（部分失败）：成功 X，失败 Y [查看详情]
// 4. failed：更新失败

import { memo } from 'react';
import type { TaskProgress } from '@/db/types';

interface TaskProgressViewProps {
  task: TaskProgress | null;
  /** 当前正在处理的学生名 */
  currentStudentName: string | null;
  /** 失败学生的显示名列表 */
  failedStudentNames: string[];
  /** 关闭进度区（用户点击 ×） */
  onDismiss: () => void;
  /** 查看详情（跳转管理页） */
  onViewDetails: () => void;
}

function TaskProgressViewBase({
  task,
  currentStudentName,
  failedStudentNames,
  onDismiss,
  onViewDetails,
}: TaskProgressViewProps) {
  if (!task) return null;

  const done = task.done;
  const total = task.total;
  const failedCount = task.failed.length;
  const successCount = done - failedCount;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  // ---- 完成状态 ----
  if (task.status === 'completed') {
    const hasFailures = failedCount > 0;
    return (
      <section className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80 bg-luogu-ac/5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm">
              {hasFailures ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  成功 {successCount}，失败 {failedCount}
                </span>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 text-luogu-ac"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-luogu-ac font-medium">更新完成</span>
                </>
              )}
            </div>
            {hasFailures && failedStudentNames.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                失败：{failedStudentNames.join('、')}
              </p>
            )}
            {hasFailures && (
              <button
                onClick={onViewDetails}
                className="mt-1 text-xs text-luogu-ac hover:underline"
              >
                查看详情
              </button>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </section>
    );
  }

  // ---- 失败状态 ----
  if (task.status === 'failed') {
    return (
      <section className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80 bg-red-50 dark:bg-red-900/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              更新失败
            </div>
            <button
              onClick={onViewDetails}
              className="mt-1 text-xs text-luogu-ac hover:underline"
            >
              查看详情
            </button>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </section>
    );
  }

  // ---- 运行中状态 ----
  return (
    <section className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        更新进度
      </label>

      {/* 进度条 */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-luogu-ac transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums shrink-0">
          {done}/{total}
        </span>
      </div>

      {/* 当前处理学生 */}
      {currentStudentName && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
          正在更新：{currentStudentName}...
        </p>
      )}
    </section>
  );
}

export const TaskProgressView = memo(TaskProgressViewBase);
