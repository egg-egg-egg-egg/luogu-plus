// 学生 Tab
//
// 功能：
// - 学生列表（备注名 / 洛谷ID / 洛谷昵称 / 状态 / 最近更新 / 操作）
// - 添加学生（输入洛谷ID + 备注名）
// - 批量导入（一行一个洛谷ID，串行处理，间隔 2s）
// - 单学生操作：编辑备注、刷新昵称（顺带更新 AC）、单独更新 AC、删除、设为当前选中

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProgressBar } from '@/components/ProgressBar';
import { useToast } from '@/components/Toast';
import { useTaskProgress } from './use-task-progress';
import { formatRelativeTime, sleep } from '@/lib/format';
import {
  addStudent,
  deleteStudent,
  getAllStudents,
  getStudentByLuoguId,
  updateStudent,
} from '@/db/schema';
import { useSelectionStore } from '@/store/selection';
import type { Student } from '@/db/types';

/** 当前选中类型，用于"设为选中"按钮的高亮显示 */
type SelectionType = 'none' | 'student' | 'class';

export function StudentsTab() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 选中状态（用于高亮"设为选中"按钮）
  const selectionType = useSelectionStore((s) => s.type) as SelectionType;
  const selectionId = useSelectionStore((s) => s.id);
  const setSelection = useSelectionStore((s) => s.setSelection);

  // 添加学生弹窗
  const [addOpen, setAddOpen] = useState(false);
  // 批量导入弹窗
  const [batchOpen, setBatchOpen] = useState(false);
  // 编辑备注弹窗
  const [editing, setEditing] = useState<Student | null>(null);
  // 删除确认弹窗
  const [deleting, setDeleting] = useState<Student | null>(null);

  // 单学生更新任务（一次只允许一个）
  const [updateTaskId, setUpdateTaskId] = useState<string | null>(null);
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null);

  // 刷新列表
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllStudents();
      // 按洛谷 ID 升序
      list.sort((a, b) => a.luoguId - b.luoguId);
      setStudents(list);
    } catch (e) {
      toast.error('加载学生列表失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 任务完成回调
  const handleTaskDone = useCallback(() => {
    void refresh();
    setUpdatingStudentId(null);
    setTimeout(() => setUpdateTaskId(null), 800);
    toast.success('更新完成');
  }, [refresh, toast]);

  const { task, progress } = useTaskProgress(updateTaskId, handleTaskDone);

  // ---- 操作 ----

  /** 设为当前选中 */
  const handleSetSelection = useCallback(
    async (student: Student) => {
      // 再次点击同一个学生 → 取消选中
      if (selectionType === 'student' && selectionId === student.id) {
        await setSelection('none', null);
        toast.info('已清除选中');
      } else {
        await setSelection('student', student.id);
        toast.success(`已选中：${student.remark || student.luoguName}`);
      }
    },
    [selectionType, selectionId, setSelection, toast],
  );

  /** 启动单学生 AC 更新 */
  const handleStartUpdate = useCallback(
    async (student: Student) => {
      if (updateTaskId) {
        toast.error('已有更新任务在运行');
        return;
      }
      try {
        const resp = (await chrome.runtime.sendMessage({
          type: 'START_STUDENT_UPDATE',
          studentId: student.id,
        })) as { ok: true; taskId: string } | { ok: false; error: string };
        if (resp.ok) {
          setUpdateTaskId(resp.taskId);
          setUpdatingStudentId(student.id);
          toast.info('开始更新…');
        } else {
          toast.error(`启动失败：${resp.error}`);
        }
      } catch (e) {
        toast.error('发送消息失败');
        console.error(e);
      }
    },
    [updateTaskId, toast],
  );

  /** 刷新昵称：实际是触发一次单学生更新（会顺带刷新昵称） */
  const handleRefreshName = useCallback(
    async (student: Student) => {
      // 直接调用更新流程
      await handleStartUpdate(student);
    },
    [handleStartUpdate],
  );

  /** 保存编辑备注 */
  const handleSaveRemark = useCallback(
    async (student: Student, remark: string) => {
      try {
        await updateStudent(student.id, { remark });
        toast.success('备注已更新');
        setEditing(null);
        await refresh();
      } catch (e) {
        toast.error('保存失败');
        console.error(e);
      }
    },
    [refresh, toast],
  );

  /** 删除学生 */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteStudent(deleting.id);
      toast.success(`已删除：${deleting.remark || deleting.luoguName}`);
      setDeleting(null);
      // 若删除的是当前选中，清除选中
      if (selectionType === 'student' && selectionId === deleting.id) {
        await setSelection('none', null);
      }
      await refresh();
    } catch (e) {
      toast.error('删除失败');
      console.error(e);
    }
  }, [deleting, refresh, toast, selectionType, selectionId, setSelection]);

  // ---- 渲染 ----

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">学生管理</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            共 {students.length} 名学生
            {selectionType === 'student' && (
              <span className="ml-2 text-luogu-ac">· 已选中一名学生</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => setBatchOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            批量导入
          </Button>
          <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加学生
          </Button>
        </div>
      </div>

      {/* 进行中的任务提示条 */}
      {updateTaskId && task && (
        <div className="rounded-xl border border-luogu-ac/30 bg-luogu-ac/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-luogu-ac">
              正在更新：{students.find((s) => s.id === updatingStudentId)?.remark ?? '...'}
            </span>
            <span className="text-xs text-zinc-500">{task.status}</span>
          </div>
          <ProgressBar progress={progress} done={task.done} total={task.total} failed={task.failed.length} />
        </div>
      )}

      {/* 学生列表 */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {loading ? (
          <SkeletonRows />
        ) : students.length === 0 ? (
          <EmptyState
            title="还没有学生"
            description="点击「添加学生」录入第一个学生的洛谷 ID"
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                添加学生
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">备注名</th>
                  <th className="px-4 py-3 font-medium">洛谷 ID</th>
                  <th className="px-4 py-3 font-medium">洛谷昵称</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const isSelected = selectionType === 'student' && selectionId === s.id;
                  const isUpdating = updatingStudentId === s.id && updateTaskId !== null;
                  return (
                    <tr
                      key={s.id}
                      className={[
                        'border-b border-zinc-100 dark:border-zinc-800/50 transition-colors',
                        isSelected
                          ? 'bg-luogu-ac/5'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {s.remark || <span className="text-zinc-400 italic">未填备注</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://www.luogu.com.cn/user/${s.luoguId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-luogu-ac hover:underline"
                        >
                          {s.luoguId}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {s.luoguName}
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-luogu-ac/10 text-luogu-ac">
                            <span className="w-1.5 h-1.5 rounded-full bg-luogu-ac" />
                            正常
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            账号失效
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">
                        {formatRelativeTime(s.lastSyncedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetSelection(s)}
                            disabled={isSelected}
                            title={isSelected ? '当前已选中' : '设为当前选中'}
                          >
                            {isSelected ? (
                              <span className="text-luogu-ac font-medium">已选中</span>
                            ) : (
                              '选中'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(s)}
                            title="编辑备注"
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRefreshName(s)}
                            disabled={isUpdating}
                            title="刷新昵称（顺带更新 AC 记录）"
                          >
                            刷新
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={isUpdating}
                            onClick={() => handleStartUpdate(s)}
                            disabled={isUpdating}
                          >
                            更新
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(s)}
                            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="删除"
                          >
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加学生弹窗 */}
      <AddStudentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          void refresh();
        }}
      />

      {/* 批量导入弹窗 */}
      <BatchImportModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onCompleted={() => {
          void refresh();
        }}
      />

      {/* 编辑备注弹窗 */}
      {editing && (
        <EditRemarkModal
          student={editing}
          onClose={() => setEditing(null)}
          onSave={(remark) => handleSaveRemark(editing, remark)}
        />
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除学生"
        message={`确认删除「${deleting?.remark || deleting?.luoguName || ''}」？该学生的 AC 记录和班级关系将一并清除，操作不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ============ 子组件 ============

/** 添加学生弹窗 */
function AddStudentModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [luoguId, setLuoguId] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 重置表单
  useEffect(() => {
    if (open) {
      setLuoguId('');
      setRemark('');
    }
  }, [open]);

  const validId = /^\d+$/.test(luoguId.trim());

  const handleSubmit = async () => {
    const idStr = luoguId.trim();
    if (!idStr || !validId) {
      toast.error('洛谷 ID 必须为纯数字');
      return;
    }
    const luoguIdNum = parseInt(idStr, 10);
    setSubmitting(true);
    try {
      // 检查重复
      const existing = await getStudentByLuoguId(luoguIdNum);
      if (existing) {
        toast.error('该学生已存在');
        return;
      }
      // 先用占位昵称添加（后续老师点"更新"时 background 会拉取真实昵称）
      const placeholderName = `用户${luoguIdNum}`;
      await addStudent(luoguIdNum, placeholderName, remark.trim());
      toast.success('已添加，点击"更新"按钮拉取 AC 记录');
      onAdded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`添加失败：${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="添加学生"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!validId}>
            添加
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">洛谷 ID *</label>
          <input
            type="text"
            value={luoguId}
            onChange={(e) => setLuoguId(e.target.value)}
            placeholder="如 100001"
            autoFocus
            className={[
              'w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100',
              'focus:outline-none focus:ring-2 focus:ring-luogu-ac/40',
              validId || luoguId === ''
                ? 'border-zinc-300 dark:border-zinc-700'
                : 'border-red-400 dark:border-red-700',
            ].join(' ')}
          />
          {luoguId && !validId && (
            <p className="text-xs text-red-500 mt-1">洛谷 ID 必须为纯数字</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">备注名（可选）</label>
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="学生真实姓名"
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            添加后请点击列表中的"更新"按钮，自动拉取洛谷昵称和 AC 记录。
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** 批量导入弹窗 */
function BatchImportModal({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; skipped: number; failed: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setProgress(null);
    }
  }, [open]);

  // 解析输入：每行一个洛谷ID（纯数字）
  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const valid: number[] = [];
    const invalid: string[] = [];
    for (const line of lines) {
      if (/^\d+$/.test(line)) {
        valid.push(parseInt(line, 10));
      } else {
        invalid.push(line);
      }
    }
    return { valid, invalid, total: lines.length };
  }, [text]);

  const handleSubmit = async () => {
    if (parsed.valid.length === 0) {
      toast.error('没有有效的洛谷 ID');
      return;
    }
    setSubmitting(true);
    setProgress({ done: 0, total: parsed.valid.length, skipped: 0, failed: [] });

    let done = 0;
    let skipped = 0;
    const failed: string[] = [];

    try {
      for (const id of parsed.valid) {
        try {
          // 重复跳过
          const existing = await getStudentByLuoguId(id);
          if (existing) {
            skipped++;
          } else {
            const placeholder = `用户${id}`;
            await addStudent(id, placeholder, '');
          }
        } catch (e) {
          console.error('批量导入失败:', id, e);
          failed.push(String(id));
        }
        done++;
        setProgress({ done, total: parsed.valid.length, skipped, failed });
        // 间隔 2s（最后一个不睡）
        if (done < parsed.valid.length) {
          await sleep(2000);
        }
      }
      const ok = done - skipped - failed.length;
      toast.success(`导入完成：新增 ${ok}，跳过 ${skipped}，失败 ${failed.length}`);
      onCompleted();
      onClose();
    } catch (e) {
      toast.error('批量导入异常');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="批量导入学生"
      onClose={submitting ? () => {} : onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={parsed.valid.length === 0 || submitting}
          >
            开始导入（{parsed.valid.length} 个）
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          每行一个洛谷 ID（纯数字）。无效行将自动忽略。串行处理，每人间隔 2 秒。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          placeholder={'100001\n100002\n100003'}
          rows={8}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
        />
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>共 {parsed.total} 行</span>
          <span className="text-luogu-ac">有效 {parsed.valid.length}</span>
          {parsed.invalid.length > 0 && (
            <span className="text-red-500">无效 {parsed.invalid.length}</span>
          )}
        </div>

        {/* 进度条 */}
        {progress && (
          <div className="mt-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <ProgressBar
              progress={progress.done / progress.total}
              done={progress.done}
              total={progress.total}
              failed={progress.failed.length}
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-2">
              <span>跳过 {progress.skipped}</span>
              <span>失败 {progress.failed.length}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 编辑备注弹窗 */
function EditRemarkModal({
  student,
  onClose,
  onSave,
}: {
  student: Student;
  onClose: () => void;
  onSave: (remark: string) => void;
}) {
  const [remark, setRemark] = useState(student.remark);

  useEffect(() => {
    setRemark(student.remark);
  }, [student]);

  return (
    <Modal
      open
      title="编辑备注名"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(remark.trim())}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {student.luoguName}（UID {student.luoguId}）
        </div>
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="学生真实姓名（可留空）"
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
        />
      </div>
    </Modal>
  );
}

/** 骨架屏 */
function SkeletonRows() {
  return (
    <div className="p-4 space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"
        />
      ))}
    </div>
  );
}

/** 空状态 */
function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">{description}</p>
      {action}
    </div>
  );
}
