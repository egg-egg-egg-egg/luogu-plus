// Popup 主组件
//
// 组合所有区块：Header / SelectionSwitcher / QuickActions / TaskProgressView / RecentStudents
// 管理选中状态、任务状态、数据加载，处理任务完成通知和 badge。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Student, Class } from '@/db/types';
import {
  getAllStudents,
  getAllClasses,
  getClassMemberCount,
} from '@/db/schema';
import { useSelectionStore } from '@/store/selection';
import { getItem, setItem, removeItem } from '@/lib/storage';
import { useTaskProgress } from './hooks/useTaskProgress';
import { Header } from './components/Header';
import { SelectionSwitcher, getStudentDisplayName } from './components/SelectionSwitcher';
import { QuickActions } from './components/QuickActions';
import { TaskProgressView } from './components/TaskProgressView';
import { RecentStudents } from './components/RecentStudents';

// ---- 常量 ----

/** chrome.storage.local 中存储当前 taskId 的 key */
const TASK_ID_STORAGE_KEY = 'currentTaskId';

// ---- background 消息响应类型 ----

type StartUpdateResponse =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

// ---- 主组件 ----

export default function App() {
  // 选中状态 store
  const type = useSelectionStore((s) => s.type);
  const id = useSelectionStore((s) => s.id);
  const hydrated = useSelectionStore((s) => s.hydrated);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const clear = useSelectionStore((s) => s.clear);

  // 数据
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});

  // 当前任务 ID（从 storage 恢复）
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 任务进度
  const { task, isRunning, currentStudentName } = useTaskProgress(taskId);

  // ---- 初始化 ----
  useEffect(() => {
    loadData();
    restoreTaskId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载学生和班级数据
  async function loadData() {
    try {
      const [allStudents, allClasses] = await Promise.all([
        getAllStudents(),
        getAllClasses(),
      ]);
      setStudents(allStudents);
      setClasses(allClasses);

      // 拉取每个班级的成员数
      const counts: Record<string, number> = {};
      await Promise.all(
        allClasses.map(async (c) => {
          counts[c.id] = await getClassMemberCount(c.id);
        }),
      );
      setClassCounts(counts);
    } catch (e) {
      console.error('[popup] 加载数据失败:', e);
    }
  }

  // 从 storage 恢复 taskId
  async function restoreTaskId() {
    try {
      const stored = await getItem<string>(TASK_ID_STORAGE_KEY);
      if (stored) setTaskId(stored);
    } catch (e) {
      console.error('[popup] 恢复 taskId 失败:', e);
    }
  }

  // ---- 任务完成处理（清除 storage 中的 taskId） ----
  // 通知和 badge 由 background 在任务完成时统一处理（规格 §3.5），
  // 确保 Popup 关闭时也能收到通知。Popup 仅负责清除 taskId storage。
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!task) {
      prevStatusRef.current = null;
      return;
    }

    const prev = prevStatusRef.current;
    prevStatusRef.current = task.status;

    if (task.status === 'completed' && prev !== 'completed') {
      // 清除 storage 中的 taskId（任务已结束）
      removeItem(TASK_ID_STORAGE_KEY);
    } else if (task.status === 'failed' && prev !== 'failed') {
      removeItem(TASK_ID_STORAGE_KEY);
    }
  }, [task]);

  // ---- 选中名称（用于更新按钮文案） ----
  const selectionName = useMemo(() => {
    if (type === 'none' || !id) return null;
    if (type === 'student') {
      const s = students.find((s) => s.id === id);
      return s ? getStudentDisplayName(s) : null;
    }
    const c = classes.find((c) => c.id === id);
    return c ? c.name : null;
  }, [type, id, students, classes]);

  // ---- 失败学生名列表 ----
  const failedStudentNames = useMemo(() => {
    if (!task || task.failed.length === 0) return [];
    return task.failed
      .map((sid) => {
        const s = students.find((s) => s.id === sid);
        return s ? getStudentDisplayName(s) : sid;
      });
  }, [task, students]);

  // ---- 事件处理 ----

  /** 选择学生/班级 */
  const handleSelect = useCallback(
    (selType: 'student' | 'class', selId: string) => {
      setSelection(selType, selId);
      setError(null);
    },
    [setSelection],
  );

  /** 清除选择 */
  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  /** 开始更新当前选中 */
  const handleStartUpdate = useCallback(async () => {
    if (type === 'none' || !id) return;
    setError(null);

    try {
      const msg =
        type === 'student'
          ? { type: 'START_STUDENT_UPDATE' as const, studentId: id }
          : { type: 'START_CLASS_UPDATE' as const, classId: id };

      const res = (await chrome.runtime.sendMessage(msg)) as StartUpdateResponse;

      if (res.ok) {
        setTaskId(res.taskId);
        await setItem(TASK_ID_STORAGE_KEY, res.taskId);
        // 清除旧 badge
        chrome.action.setBadgeText({ text: '' });
      } else {
        setError(res.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [type, id]);

  /** 打开管理页 */
  const handleOpenOptions = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  /** 关闭进度区 */
  const handleDismissProgress = useCallback(() => {
    setTaskId(null);
    removeItem(TASK_ID_STORAGE_KEY);
  }, []);

  /** 最近学生点击 */
  const handleSelectStudent = useCallback(
    (studentId: string) => {
      setSelection('student', studentId);
      setError(null);
    },
    [setSelection],
  );

  // ---- 渲染 ----

  // 未完成 hydrate 时显示加载骨架
  if (!hydrated) {
    return (
      <div className="w-[360px] max-h-[500px] overflow-y-auto bg-white dark:bg-zinc-900">
        <Header />
        <div className="px-4 py-8 flex items-center justify-center">
          <svg className="w-5 h-5 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
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
        </div>
      </div>
    );
  }

  const showProgress = task !== null;

  return (
    <div className="w-[360px] max-h-[500px] overflow-y-auto bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">
      <Header />

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* 选中切换器 */}
      <SelectionSwitcher
        students={students}
        classes={classes}
        classCounts={classCounts}
        currentType={type}
        currentId={id}
        onSelect={handleSelect}
        onClear={handleClear}
      />

      {/* 快捷操作 */}
      <QuickActions
        selectionName={selectionName}
        isUpdating={isRunning}
        onUpdate={handleStartUpdate}
        onOpenOptions={handleOpenOptions}
      />

      {/* 更新进度 */}
      {showProgress && (
        <TaskProgressView
          task={task}
          currentStudentName={currentStudentName}
          failedStudentNames={failedStudentNames}
          onDismiss={handleDismissProgress}
          onViewDetails={handleOpenOptions}
        />
      )}

      {/* 最近学生 */}
      <RecentStudents
        students={students}
        currentStudentId={type === 'student' ? id : null}
        onSelect={handleSelectStudent}
      />

      {/* 空状态引导 */}
      {students.length === 0 && classes.length === 0 && (
        <div className="px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-700/80">
          <div className="text-center py-2">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
              还没有学生或班级
            </p>
            <button
              onClick={handleOpenOptions}
              className="text-xs text-luogu-ac hover:underline"
            >
              去管理页添加 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
