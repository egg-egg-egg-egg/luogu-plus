// 班级 Tab
//
// 功能：
// - 班级列表（班级名 / 成员数 / 最近更新 / 操作）
// - 创建班级
// - 单班级操作：重命名、管理成员、批量更新、删除、设为当前选中
// - 管理成员弹窗：左侧班级内学生（可移除），右侧所有学生（可添加），含搜索框
// - 批量更新：发 START_CLASS_UPDATE → 轮询 GET_TASK_STATUS 显示进度

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProgressBar } from '@/components/ProgressBar';
import { useToast } from '@/components/Toast';
import { useTaskProgress } from './use-task-progress';
import { formatRelativeTime } from '@/lib/format';
import {
  addClass,
  addStudentToClass,
  deleteClass,
  getAllClasses,
  getClassMemberCount,
  getClassMembers,
  getAllStudents,
  renameClass,
  removeStudentFromClass,
} from '@/db/schema';
import { useSelectionStore } from '@/store/selection';
import type { Class, Student } from '@/db/types';

/** 班级行额外信息（成员数） */
interface ClassRow extends Class {
  memberCount: number;
}

/** 当前选中类型 */
type SelectionType = 'none' | 'student' | 'class';

export function ClassesTab() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  const selectionType = useSelectionStore((s) => s.type) as SelectionType;
  const selectionId = useSelectionStore((s) => s.id);
  const setSelection = useSelectionStore((s) => s.setSelection);

  // 弹窗状态
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<ClassRow | null>(null);
  const [managing, setManaging] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState<ClassRow | null>(null);

  // 班级更新任务
  const [updateTaskId, setUpdateTaskId] = useState<string | null>(null);
  const [updatingClassId, setUpdatingClassId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllClasses();
      // 拉取每个班级的成员数（班级数量少，串行即可）
      const withCount: ClassRow[] = [];
      for (const c of list) {
        const count = await getClassMemberCount(c.id);
        withCount.push({ ...c, memberCount: count });
      }
      // 按创建时间倒序
      withCount.sort((a, b) => b.createdAt - a.createdAt);
      setClasses(withCount);
    } catch (e) {
      toast.error('加载班级列表失败');
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
    setUpdatingClassId(null);
    setTimeout(() => setUpdateTaskId(null), 800);
    toast.success('班级更新完成');
  }, [refresh, toast]);

  const { task, progress } = useTaskProgress(updateTaskId, handleTaskDone);

  // ---- 操作 ----

  const handleSetSelection = useCallback(
    async (cls: ClassRow) => {
      if (selectionType === 'class' && selectionId === cls.id) {
        await setSelection('none', null);
        toast.info('已清除选中');
      } else {
        if (cls.memberCount === 0) {
          toast.error('空班级不能设为选中');
          return;
        }
        await setSelection('class', cls.id);
        toast.success(`已选中班级：${cls.name}`);
      }
    },
    [selectionType, selectionId, setSelection, toast],
  );

  const handleStartUpdate = useCallback(
    async (cls: ClassRow) => {
      if (updateTaskId) {
        toast.error('已有更新任务在运行');
        return;
      }
      if (cls.memberCount === 0) {
        toast.error('空班级无法更新');
        return;
      }
      try {
        const resp = (await chrome.runtime.sendMessage({
          type: 'START_CLASS_UPDATE',
          classId: cls.id,
        })) as { ok: true; taskId: string } | { ok: false; error: string };
        if (resp.ok) {
          setUpdateTaskId(resp.taskId);
          setUpdatingClassId(cls.id);
          toast.info('开始更新班级…');
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

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteClass(deleting.id);
      toast.success(`已删除班级：${deleting.name}`);
      if (selectionType === 'class' && selectionId === deleting.id) {
        await setSelection('none', null);
      }
      setDeleting(null);
      await refresh();
    } catch (e) {
      toast.error('删除失败');
      console.error(e);
    }
  }, [deleting, refresh, toast, selectionType, selectionId, setSelection]);

  const handleRename = useCallback(
    async (cls: ClassRow, name: string) => {
      if (!name.trim()) {
        toast.error('班级名不能为空');
        return;
      }
      try {
        await renameClass(cls.id, name.trim());
        toast.success('已重命名');
        setRenaming(null);
        await refresh();
      } catch (e) {
        toast.error('重命名失败');
        console.error(e);
      }
    },
    [refresh, toast],
  );

  // ---- 渲染 ----

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">班级管理</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            共 {classes.length} 个班级
            {selectionType === 'class' && (
              <span className="ml-2 text-luogu-ac">· 已选中一个班级</span>
            )}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          创建班级
        </Button>
      </div>

      {/* 任务进度条 */}
      {updateTaskId && task && (
        <div className="rounded-xl border border-luogu-ac/30 bg-luogu-ac/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-luogu-ac">
              正在更新班级：{classes.find((c) => c.id === updatingClassId)?.name ?? '...'}
            </span>
            <span className="text-xs text-zinc-500">{task.status}</span>
          </div>
          <ProgressBar
            progress={progress}
            done={task.done}
            total={task.total}
            failed={task.failed.length}
          />
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {loading ? (
          <SkeletonRows />
        ) : classes.length === 0 ? (
          <EmptyState
            title="还没有班级"
            description="创建第一个班级，开始管理学生集体"
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                创建班级
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">班级名</th>
                  <th className="px-4 py-3 font-medium">成员数</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const isSelected = selectionType === 'class' && selectionId === c.id;
                  const isUpdating = updatingClassId === c.id && updateTaskId !== null;
                  return (
                    <tr
                      key={c.id}
                      className={[
                        'border-b border-zinc-100 dark:border-zinc-800/50 transition-colors',
                        isSelected
                          ? 'bg-luogu-ac/5'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {c.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
                          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {c.memberCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">
                        {formatRelativeTime(c.lastSyncedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSelected || c.memberCount === 0}
                            onClick={() => handleSetSelection(c)}
                            title={c.memberCount === 0 ? '空班级不可选中' : isSelected ? '当前已选中' : '设为当前选中'}
                          >
                            {isSelected ? (
                              <span className="text-luogu-ac font-medium">已选中</span>
                            ) : (
                              '选中'
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setManaging(c)}>
                            成员
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRenaming(c)}>
                            重命名
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={isUpdating}
                            disabled={isUpdating || c.memberCount === 0}
                            onClick={() => handleStartUpdate(c)}
                            title={c.memberCount === 0 ? '空班级无法更新' : '批量更新 AC 记录'}
                          >
                            更新
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(c)}
                            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
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

      {/* 创建班级弹窗 */}
      <CreateClassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void refresh();
        }}
      />

      {/* 重命名弹窗 */}
      {renaming && (
        <RenameClassModal
          cls={renaming}
          onClose={() => setRenaming(null)}
          onSave={(name) => handleRename(renaming, name)}
        />
      )}

      {/* 管理成员弹窗 */}
      {managing && (
        <ManageMembersModal
          cls={managing}
          onClose={() => setManaging(null)}
          onChanged={() => {
            void refresh();
          }}
        />
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除班级"
        message={`确认删除班级「${deleting?.name ?? ''}」？班级内的学生引用关系会被移除，但学生本身和 AC 记录保留。`}
        confirmText="删除"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ============ 子组件 ============

/** 创建班级弹窗 */
function CreateClassModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('班级名不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await addClass(name.trim());
      toast.success('班级已创建');
      onCreated();
    } catch (e) {
      toast.error('创建失败');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="创建班级"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!name.trim()}>创建</Button>
        </>
      }
    >
      <div>
        <label className="block text-sm font-medium mb-1.5">班级名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：提高班 2026 春"
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
        />
      </div>
    </Modal>
  );
}

/** 重命名弹窗 */
function RenameClassModal({
  cls,
  onClose,
  onSave,
}: {
  cls: Class;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(cls.name);
  useEffect(() => {
    setName(cls.name);
  }, [cls]);

  return (
    <Modal
      open
      title="重命名班级"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(name)}>保存</Button>
        </>
      }
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
      />
    </Modal>
  );
}

/** 管理成员弹窗：左侧班级内学生，右侧所有学生 */
function ManageMembersModal({
  cls,
  onClose,
  onChanged,
}: {
  cls: Class;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, all] = await Promise.all([getClassMembers(cls.id), getAllStudents()]);
      m.sort((a, b) => a.luoguId - b.luoguId);
      all.sort((a, b) => a.luoguId - b.luoguId);
      setMembers(m);
      setAllStudents(all);
    } catch (e) {
      toast.error('加载失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [cls.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // 班级内学生 ID 集合
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  // 非成员（可添加）
  const nonMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return allStudents
      .filter((s) => !memberIds.has(s.id))
      .filter((s) => {
        if (!keyword) return true;
        return (
          String(s.luoguId).includes(keyword) ||
          s.luoguName.toLowerCase().includes(keyword) ||
          s.remark.toLowerCase().includes(keyword)
        );
      });
  }, [allStudents, memberIds, search]);

  // 成员（可移除）
  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((s) => {
      return (
        String(s.luoguId).includes(keyword) ||
        s.luoguName.toLowerCase().includes(keyword) ||
        s.remark.toLowerCase().includes(keyword)
      );
    });
  }, [members, search]);

  const handleAdd = async (s: Student) => {
    try {
      await addStudentToClass(cls.id, s.id);
      toast.success(`已添加：${s.remark || s.luoguName}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error('添加失败');
      console.error(e);
    }
  };

  const handleRemove = async (s: Student) => {
    try {
      await removeStudentFromClass(cls.id, s.id);
      toast.info(`已移除：${s.remark || s.luoguName}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error('移除失败');
      console.error(e);
    }
  };

  return (
    <Modal
      open
      title={`管理成员 - ${cls.name}`}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <Button variant="primary" onClick={onClose}>完成</Button>
      }
    >
      <div className="space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 洛谷ID / 昵称 / 备注"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
          />
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-zinc-500">加载中…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 左：班级内成员 */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-medium text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                班级内（{filteredMembers.length}/{members.length}）
              </div>
              <div className="max-h-80 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">暂无成员</div>
                ) : (
                  filteredMembers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {s.remark || <span className="text-zinc-400 italic">未填备注</span>}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          UID {s.luoguId} · {s.luoguName}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleRemove(s)}>
                        移除
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右：可添加学生 */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-medium text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                可添加（{nonMembers.length}）
              </div>
              <div className="max-h-80 overflow-y-auto">
                {nonMembers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">
                    {allStudents.length === 0 ? '请先在「学生」Tab 添加学生' : '全部已在班级内'}
                  </div>
                ) : (
                  nonMembers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {s.remark || <span className="text-zinc-400 italic">未填备注</span>}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          UID {s.luoguId} · {s.luoguName}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-luogu-ac hover:bg-luogu-ac/10" onClick={() => handleAdd(s)}>
                        添加
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 骨架屏 */
function SkeletonRows() {
  return (
    <div className="p-4 space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">{description}</p>
      {action}
    </div>
  );
}
