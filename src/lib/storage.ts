// chrome.storage.local 封装（带命名空间前缀，避免键名冲突）

const PREFIX = 'luogu-plus:';

/** 当前选中类型（与 src/store/selection.ts 保持一致，独立定义以避免 SW 引入 zustand） */
export type SelectionType = 'none' | 'student' | 'class';

/** 当前选中状态持久化结构（存 storage.local，跨标签页广播） */
export interface CurrentSelection {
  type: SelectionType; // 'none' | 'student' | 'class'
  id: string | null; // 学生 ID 或班级 ID，type='none' 时为 null
  updatedAt: number; // 最后更新时间戳
}

/** selection 的存储 key（不含前缀） */
const SELECTION_KEY = 'currentSelection';

/** 读取存储项 */
export async function getItem<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(PREFIX + key);
  return result[PREFIX + key] as T | undefined;
}

/** 写入存储项 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [PREFIX + key]: value });
}

/** 删除存储项 */
export async function removeItem(key: string): Promise<void> {
  await chrome.storage.local.remove(PREFIX + key);
}

/** 监听存储变化（仅 local 区域，自动剥离命名空间前缀） */
export function onStorageChanged(
  callback: (key: string, newValue: unknown, oldValue: unknown) => void,
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [fullKey, change] of Object.entries(changes)) {
      if (!fullKey.startsWith(PREFIX)) continue;
      const key = fullKey.slice(PREFIX.length);
      callback(key, change.newValue, change.oldValue);
    }
  });
}

// ---- currentSelection 读写（跨标签页同步的核心） ----

/** 读取当前选中（无选中时返回 type='none' 的默认值） */
export async function getCurrentSelection(): Promise<CurrentSelection> {
  const sel = await getItem<CurrentSelection>(SELECTION_KEY);
  if (!sel) {
    return { type: 'none', id: null, updatedAt: 0 };
  }
  return sel;
}

/** 设置当前选中（写入 storage.local，自动触发 onChanged 广播到所有标签页） */
export async function setCurrentSelection(
  type: SelectionType,
  id: string | null,
): Promise<void> {
  await setItem<CurrentSelection>(SELECTION_KEY, {
    type,
    id,
    updatedAt: Date.now(),
  });
}

/** 清除当前选中（回到零干扰状态） */
export async function clearSelection(): Promise<void> {
  await setItem<CurrentSelection>(SELECTION_KEY, {
    type: 'none',
    id: null,
    updatedAt: Date.now(),
  });
}
