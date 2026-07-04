// 详情页状态条注入器
// 规格文档 §3.4.3
//
// 在题目详情页顶部插入状态条：
// - 选班级：本班 {done}/{total} 已AC：{学生名单}（数据更新于 X 天前）
// - 选学生：{备注名} 已 AC 或 {备注名} 未做过
// - 关闭按钮：本次浏览期间不再显示（sessionStorage 记忆）
// - a11y: role="status" aria-live="polite"

import {
  STATUS_BAR_ATTR,
  STATUS_BAR_ANCHOR_SELECTOR,
  detectLuoguTheme,
  extractProblemIdFromUrl,
} from './selectors';
import {
  type Selection,
  type StudentAcInfo,
  type ContentToBackgroundMessage,
  sendMessageToBackground,
} from '@/store/selection';

/** 已关闭状态条的题目 ID 集合（内存变量，刷新后自动重置，符合规格 §3.4.3） */
const dismissedProblemIds = new Set<string>();

/** 默认缓存过期阈值（天） */
const DEFAULT_STALE_THRESHOLD_DAYS = 7;

/** staleThresholdDays 本地缓存 */
let cachedStaleThreshold: number | null = null;

/**
 * 获取缓存过期阈值（带本地缓存）
 */
async function getStaleThreshold(): Promise<number> {
  if (cachedStaleThreshold !== null) return cachedStaleThreshold;
  try {
    const resp = await sendMessageToBackground({ type: 'GET_STALE_THRESHOLD' });
    if (resp.ok && 'staleThresholdDays' in resp) {
      cachedStaleThreshold = resp.staleThresholdDays;
      return cachedStaleThreshold;
    }
  } catch {
    // background 未实现，用默认值
  }
  cachedStaleThreshold = DEFAULT_STALE_THRESHOLD_DAYS;
  return cachedStaleThreshold;
}

/**
 * 格式化相对时间（与 badge-injector 相同逻辑）
 */
function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return '从未更新';
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  return `${Math.floor(diffDay / 30)} 个月前`;
}

/** 获取学生显示名 */
function getDisplayName(student: StudentAcInfo): string {
  return student.remark || student.luoguName || student.studentId;
}

/** 检查当前题目的状态条是否已被用户关闭（本次浏览期间） */
function isDismissed(problemId: string): boolean {
  return dismissedProblemIds.has(problemId);
}

/** 标记当前题目的状态条已关闭 */
function markDismissed(problemId: string): void {
  dismissedProblemIds.add(problemId);
}

/**
 * 查询单题 AC 数据
 */
async function queryProblemAc(
  problemId: string,
  selection: Selection,
): Promise<{ students: StudentAcInfo[]; total: number } | null> {
  try {
    const msg: ContentToBackgroundMessage = {
      type: 'QUERY_PROBLEM_AC',
      problemId,
      selection,
    };
    const resp = await sendMessageToBackground(msg);
    if (resp.ok && 'students' in resp) {
      return { students: resp.students, total: resp.total };
    }
    console.warn('[洛谷老师助手] 查询单题 AC 数据失败:', resp.ok ? '' : resp.error);
    return null;
  } catch (err) {
    console.warn('[洛谷老师助手] 查询单题 AC 数据异常（background 可能未实现）:', err);
    return null;
  }
}

/**
 * 构建状态条文本
 */
function buildStatusText(
  students: StudentAcInfo[],
  total: number,
  selection: Selection,
  staleThreshold: number,
): { text: string; stale: boolean } {
  const done = students.length;

  // 计算数据新鲜度（取所有 AC 学生中最早的 lastSyncedAt）
  const relevantTimestamp =
    students.length > 0
      ? Math.min(...students.map((s) => s.lastSyncedAt ?? Infinity))
      : null;
  const stale =
    relevantTimestamp === null ||
    (relevantTimestamp !== Infinity &&
      Date.now() - relevantTimestamp > staleThreshold * 86400000);
  const updateTimeText = formatRelativeTime(
    relevantTimestamp === Infinity ? null : relevantTimestamp,
  );

  if (selection?.type === 'student') {
    const name = done > 0 ? getDisplayName(students[0]) : '';
    const statusText = done > 0 ? `${name} 已 AC` : `${name || '该学生'} 未做过`;
    return {
      text: `${statusText}（数据更新于 ${updateTimeText}）`,
      stale,
    };
  }

  // 班级模式
  if (done === 0) {
    return {
      text: `本班 0/${total} 已AC（数据更新于 ${updateTimeText}）`,
      stale,
    };
  }
  const names = students.map(getDisplayName).join('、');
  return {
    text: `本班 ${done}/${total} 已AC：${names}（数据更新于 ${updateTimeText}）`,
    stale,
  };
}

/**
 * 创建状态条 DOM 元素
 */
function createStatusBar(
  text: string,
  stale: boolean,
  onClose: () => void,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'luogu-plus-status-bar';
  bar.setAttribute(STATUS_BAR_ATTR, 'true');
  bar.setAttribute('data-theme', detectLuoguTheme());
  bar.setAttribute('data-stale', stale ? 'true' : 'false');
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');

  const textEl = document.createElement('span');
  textEl.className = 'luogu-plus-status-bar-text';
  textEl.textContent = text;
  bar.appendChild(textEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'luogu-plus-status-bar-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = '本次浏览期间不再显示';
  closeBtn.setAttribute('aria-label', '关闭状态条');
  closeBtn.addEventListener('click', () => {
    onClose();
    bar.remove();
  });
  bar.appendChild(closeBtn);

  return bar;
}

/**
 * 查找状态条插入点
 * 优先在 #app article 顶部插入，找不到回退到 body
 */
function findInsertPoint(): HTMLElement | null {
  const anchor = document.querySelector(STATUS_BAR_ANCHOR_SELECTOR);
  if (anchor) return anchor as HTMLElement;
  // 回退：插入到 body 顶部
  if (document.body) return document.body;
  return null;
}

/**
 * 注入状态条到当前题目详情页
 * 规格文档 §3.4.3
 *
 * @param selection 当前选中状态，null 时不注入
 */
export async function injectStatusBar(selection: Selection): Promise<void> {
  // 无选择：清理已有状态条
  if (selection === null) {
    removeStatusBar();
    return;
  }

  const problemId = extractProblemIdFromUrl();
  if (!problemId) {
    // URL 不含题目 ID，不是详情页，清理并返回
    removeStatusBar();
    return;
  }

  // 用户已关闭本次浏览期间的状态条
  if (isDismissed(problemId)) {
    removeStatusBar();
    return;
  }

  // 查询 AC 数据
  const queryResult = await queryProblemAc(problemId, selection);
  if (!queryResult) {
    // 查询失败（background 未实现等），静默降级
    return;
  }

  const { students, total } = queryResult;
  const staleThreshold = await getStaleThreshold();
  const { text, stale } = buildStatusText(students, total, selection, staleThreshold);

  // 移除已有状态条（避免重复）
  removeStatusBar();

  // 创建并插入新状态条
  const bar = createStatusBar(text, stale, () => markDismissed(problemId));
  const insertPoint = findInsertPoint();
  if (!insertPoint) {
    console.warn('[洛谷老师助手] 状态条插入点未找到，洛谷页面结构可能已变更');
    return;
  }

  try {
    // 插入到容器的第一个子元素之前（顶部）
    if (insertPoint.firstChild) {
      insertPoint.insertBefore(bar, insertPoint.firstChild);
    } else {
      insertPoint.appendChild(bar);
    }
  } catch (err) {
    console.warn('[洛谷老师助手] 状态条插入失败:', err);
  }
}

/**
 * 移除当前页面的状态条
 */
export function removeStatusBar(): void {
  const existing = document.querySelector(`[${STATUS_BAR_ATTR}]`);
  if (existing) existing.remove();
}
