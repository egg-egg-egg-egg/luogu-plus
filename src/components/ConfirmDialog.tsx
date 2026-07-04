// 二次确认弹窗
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  /** 标题 */
  title: string;
  /** 提示文案 */
  message: string;
  /** 确认按钮文案，默认"确认" */
  confirmText?: string;
  /** 取消按钮文案，默认"取消" */
  cancelText?: string;
  /** 是否危险操作（红色按钮） */
  danger?: boolean;
  /** 需要输入的验证文本（如"确认删除"），不传则无输入框 */
  confirmPrompt?: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消/关闭回调 */
  onCancel: () => void;
}

/** 二次确认弹窗，支持输入文本验证（用于危险操作） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  confirmPrompt,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  // 重置输入框
  useEffect(() => {
    if (open) setInputValue('');
  }, [open]);

  // 验证通过条件：无需验证文本 或 输入匹配
  const canConfirm = !confirmPrompt || inputValue === confirmPrompt;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
        {message}
      </p>
      {confirmPrompt && (
        <div className="mt-4">
          <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
            请输入 <span className="font-mono font-semibold text-red-600 dark:text-red-400">{confirmPrompt}</span> 以确认
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            placeholder={confirmPrompt}
          />
        </div>
      )}
    </Modal>
  );
}
