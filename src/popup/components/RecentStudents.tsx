// 最近学生（快速选择）
//
// 显示最近 5 个学生（按 updatedAt 倒序），点击直接设为选中。

import { memo, useMemo } from 'react';
import type { Student } from '@/db/types';
import { getStudentDisplayName } from './SelectionSwitcher';

interface RecentStudentsProps {
  students: Student[];
  /** 当前选中的学生 ID（高亮显示） */
  currentStudentId: string | null;
  onSelect: (studentId: string) => void;
}

const MAX_DISPLAY = 5;

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
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150 text-left ${
                  isActive
                    ? 'text-luogu-ac font-medium bg-luogu-ac/5'
                    : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{getStudentDisplayName(s)}</span>
                  {s.status === 'invalid' && (
                    <span className="shrink-0 text-xs text-red-500">
                      已失效
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 tabular-nums">
                  {s.luoguId}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const RecentStudents = memo(RecentStudentsBase);
