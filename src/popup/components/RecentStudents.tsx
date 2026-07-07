// 最近学生（快速选择）
//
// 显示最近 5 个学生（按 updatedAt 倒序），点击整行直接设为选中。
// 每行右侧的学生洛谷 ID 为独立可点击元素：点击将其复制到剪贴板，
// 并给出即时视觉反馈（图标切换为对勾 + “已复制”文字），且不会触发整行选中。

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Student } from '@/db/types';
import { getStudentDisplayName } from './SelectionSwitcher';
import { copyToClipboard } from '@/lib/clipboard';

interface RecentStudentsProps {
  students: Student[];
  /** 当前选中的学生 ID（高亮显示） */
  currentStudentId: string | null;
  onSelect: (studentId: string) => void;
}

const MAX_DISPLAY = 5;
/** 复制成功反馈展示时长（毫秒） */
const COPIED_FEEDBACK_MS = 1500;

// 复制图标
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 已复制（对勾）图标
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecentStudentsBase({
  students,
  currentStudentId,
  onSelect,
}: RecentStudentsProps) {
  // 按 updatedAt 倒序取前 5
  const recent = useMemo(() => {
    return [...students]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DISPLAY);
  }, [students]);

  // 刚复制成功的行 ID（用于切换反馈态）
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async (student: Student) => {
    const ok = await copyToClipboard(String(student.luoguId));
    if (!ok) return; // 复制失败则不切换反馈态
    setCopiedId(student.id);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(null), COPIED_FEEDBACK_MS);
  }, []);

  return (
    <section className="px-4 py-3">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        最近学生
      </label>

      {recent.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
          暂无学生，请先在管理页添加
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {recent.map((s) => {
            const isActive = s.id === currentStudentId;
            const isCopied = s.id === copiedId;
            const name = getStudentDisplayName(s);
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
                aria-label={`选择学生 ${name}`}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-luogu-ac/40 ${
                  isActive
                    ? 'text-luogu-ac font-medium bg-luogu-ac/5'
                    : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{name}</span>
                  {s.status === 'invalid' && (
                    <span className="shrink-0 text-xs text-red-500">
                      已失效
                    </span>
                  )}
                </div>

                {/* 学生洛谷 ID —— 独立可点击，点击复制 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopy(s);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={isCopied ? `${name} 的洛谷 ID 已复制` : `复制 ${name} 的洛谷 ID ${s.luoguId}`}
                  className={`group/copy flex items-center gap-1 text-xs shrink-0 tabular-nums rounded px-1 py-0.5 transition-colors hover:text-luogu-ac hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-luogu-ac/40 ${
                    isCopied
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span className="font-medium">已复制</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-3.5 h-3.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                      <span>{s.luoguId}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const RecentStudents = memo(RecentStudentsBase);
