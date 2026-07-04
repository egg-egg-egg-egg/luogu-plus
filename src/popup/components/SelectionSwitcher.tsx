// 选中切换器（下拉选择学生/班级）+ 清除选择按钮

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Student, Class } from '@/db/types';
import type { SelectionType } from '@/store/selection';

// ---- 工具函数 ----

/** 获取学生显示名：备注名优先，无备注用洛谷昵称 */
export function getStudentDisplayName(student: Student): string {
  return student.remark || student.luoguName || `UID ${student.luoguId}`;
}

/** 获取班级显示名（含人数） */
function getClassDisplayName(cls: Class, count: number): string {
  return `${cls.name}（${count}人）`;
}

// ---- 组件 Props ----

interface SelectionSwitcherProps {
  students: Student[];
  classes: Class[];
  classCounts: Record<string, number>;
  currentType: SelectionType;
  currentId: string | null;
  onSelect: (type: 'student' | 'class', id: string) => void;
  onClear: () => void;
}

// ---- 组件实现 ----

function SelectionSwitcherBase({
  students,
  classes,
  classCounts,
  currentType,
  currentId,
  onSelect,
  onClear,
}: SelectionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 当前选中的显示名
  const currentLabel = useMemo(() => {
    if (currentType === 'none' || !currentId) return '';
    if (currentType === 'student') {
      const s = students.find((s) => s.id === currentId);
      return s ? getStudentDisplayName(s) : '';
    }
    const c = classes.find((c) => c.id === currentId);
    return c ? getClassDisplayName(c, classCounts[c.id] || 0) : '';
  }, [currentType, currentId, students, classes, classCounts]);

  const hasOptions = students.length > 0 || classes.length > 0;
  const isEmpty = !hasOptions;

  const handleSelect = (type: 'student' | 'class', id: string) => {
    onSelect(type, id);
    setOpen(false);
  };

  return (
    <section className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        当前选中
      </label>

      {/* 下拉选择器 */}
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => !isEmpty && setOpen(!open)}
          disabled={isEmpty}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <span className={currentLabel ? '' : 'text-zinc-400 dark:text-zinc-500'}>
            {currentLabel || (isEmpty ? '暂无学生/班级' : '请选择...')}
          </span>
          {!isEmpty && (
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </button>

        {/* 下拉面板 */}
        {open && hasOptions && (
          <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg shadow-zinc-900/10 dark:shadow-black/30">
            {students.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 sticky top-0">
                  学生
                </div>
                {students.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect('student', s.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors duration-150 flex items-center justify-between gap-2 ${
                      currentType === 'student' && currentId === s.id
                        ? 'text-luogu-ac font-medium bg-luogu-ac/5'
                        : 'text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{getStudentDisplayName(s)}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                      {s.luoguId}
                    </span>
                  </button>
                ))}
              </>
            )}
            {classes.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 sticky top-0">
                  班级
                </div>
                {classes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelect('class', c.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors duration-150 ${
                      currentType === 'class' && currentId === c.id
                        ? 'text-luogu-ac font-medium bg-luogu-ac/5'
                        : 'text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    {getClassDisplayName(c, classCounts[c.id] || 0)}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 清除选择按钮 */}
      {currentType !== 'none' && (
        <button
          onClick={onClear}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors duration-200"
        >
          清除选择
        </button>
      )}
    </section>
  );
}

export const SelectionSwitcher = memo(SelectionSwitcherBase);
