// 列表页徽章注入器
// 规格文档 §3.4.2
//
// 流程：
// 1. 识别当前页面类型（用 selectors.ts）
// 2. 找到所有题目元素
// 3. 批量查询哪些学生 AC 过（通过 message 发给 background 查 IndexedDB）
// 4. 注入徽章 <span class="luogu-plus-badge" data-luogu-plus-badge>
//
// 徽章内容：
// - 选学生：该学生 AC 过 → ✅ {备注名}已AC；未 AC → 灰色「未做过」
// - 选班级：✅ {done}/{total} 已AC
// - hover tooltip：显示完整学生名单 + "数据更新于 X 天前"
//
// 缓存过期感知：lastSyncedAt 超过阈值 → data-stale="true"（CSS 褪色）
// 防重复注入：已存在则更新内容不重复创建

import {
  BADGE_ATTR,
  detectPageType,
  detectLuoguTheme,
  getPageConfig,
} from './selectors';
import {
  type Selection,
  type StudentAcInfo,
  type ContentToBackgroundMessage,
  sendMessageToBackground,
} from '@/store/selection';

/** 默认缓存过期阈值（天），从 background 获取失败时用 */
const DEFAULT_STALE_THRESHOLD_DAYS = 7;

/** staleThresholdDays 本地缓存（避免每次注入都查 background） */
let cachedStaleThreshold: number | null = null;

/**
 * 获取缓存过期阈值（带本地缓存）
 * 从 background 通过消息获取，失败时用默认值 7 天
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
    // background 未实现或出错，用默认值
  }
  cachedStaleThreshold = DEFAULT_STALE_THRESHOLD_DAYS;
  return cachedStaleThreshold;
}

/**
 * 判断 lastSyncedAt 是否过期
 * @param lastSyncedAt 最近同步时间戳，null 视为过期（从未更新）
 * @param thresholdDays 过期阈值（天）
 */
function isStale(lastSyncedAt: number | null, thresholdDays: number): boolean {
  if (lastSyncedAt === null) return true;
  const ageMs = Date.now() - lastSyncedAt;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  return ageMs > thresholdMs;
}

/**
 * 格式化相对时间
 * @param timestamp 时间戳，null 返回 "从未更新"
 * @returns 如 "刚刚" / "3 天前" / "从未更新"
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
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} 个月前`;
}

/**
 * 获取学生显示名（优先备注名，其次洛谷昵称，最后学生 ID）
 */
function getDisplayName(student: StudentAcInfo): string {
  return student.remark || student.luoguName || student.studentId;
}

/**
 * 构造 tooltip 文本
 * - 选学生：显示该学生状态 + 数据更新时间
 * - 选班级：显示 AC 学生名单 + 数据更新时间
 */
function buildTooltip(students: StudentAcInfo[], isClassMode: boolean): string {
  const updateTimeText = formatRelativeTime(
    students.length > 0
      ? Math.min(...students.map((s) => s.lastSyncedAt ?? Infinity))
      : null,
  );

  if (!isClassMode) {
    // 学生模式
    if (students.length === 0) {
      return `未做过（数据更新于 ${updateTimeText}）`;
    }
    return `已 AC（数据更新于 ${updateTimeText}）`;
  }

  // 班级模式：列出所有 AC 学生
  if (students.length === 0) {
    return `本班无人 AC（数据更新于 ${updateTimeText}）`;
  }
  const names = students.map(getDisplayName).join('、');
  return `已 AC：${names}（数据更新于 ${updateTimeText}）`;
}

/**
 * 获取或创建徽章元素
 * 在题目的容器（<li> 或 <tr>）内查找，避免同一行多个链接导致重复徽章
 */
function getOrCreateBadge(el: Element): HTMLElement {
  const container = el.closest('li') || el.closest('tr') || el;
  const existing = container.querySelector<HTMLElement>(`[${BADGE_ATTR}]`);
  if (existing) return existing;

  const badge = document.createElement('span');
  badge.className = 'luogu-plus-badge';
  badge.setAttribute(BADGE_ATTR, 'true');
  badge.setAttribute('data-theme', detectLuoguTheme());
  return badge;
}

/**
 * 更新徽章内容和样式
 * @param badge 徽章元素
 * @param students AC 该题的学生列表
 * @param total 选中范围总人数
 * @param selection 当前选中状态
 * @param staleThreshold 过期阈值
 */
function updateBadge(
  badge: HTMLElement,
  students: StudentAcInfo[],
  total: number,
  selection: Selection,
  staleThreshold: number,
): void {
  const isClassMode = selection?.type === 'class';
  const done = students.length;

  // 判断是否过期：取所有学生的 lastSyncedAt，任一过期则整个徽章标记过期
  // 班级模式取最新的 lastSyncedAt 判断（班级整体新鲜度）
  // 学生模式取该学生的 lastSyncedAt
  const relevantTimestamp =
    students.length > 0
      ? Math.min(...students.map((s) => s.lastSyncedAt ?? Infinity))
      : null;
  const stale = isStale(
    relevantTimestamp === Infinity ? null : relevantTimestamp,
    staleThreshold,
  );

  badge.setAttribute('data-theme', detectLuoguTheme());
  badge.setAttribute('data-stale', stale ? 'true' : 'false');

  if (selection === null) {
    // 无选择：不应到达此处（调用方会拦截），防御性处理
    badge.textContent = '';
    badge.style.display = 'none';
    return;
  }

  badge.style.display = '';

  if (isClassMode) {
    // 班级模式：✅ 3/20 已AC
    if (done === 0) {
      badge.textContent = `0/${total} 已AC`;
      badge.setAttribute('data-ac', 'false');
    } else {
      badge.textContent = `✅ ${done}/${total} 已AC`;
      badge.setAttribute('data-ac', 'true');
    }
  } else {
    // 学生模式：✅ 张三已AC 或 灰色「未做过」
    if (done > 0) {
      const name = getDisplayName(students[0]);
      badge.textContent = `✅ ${name}已AC`;
      badge.setAttribute('data-ac', 'true');
    } else {
      badge.textContent = '未做过';
      badge.setAttribute('data-ac', 'false');
    }
  }

  // tooltip
  badge.title = buildTooltip(students, isClassMode);
}

/**
 * 清理题目容器上的徽章（selection 为 null 时调用）
 */
function clearBadge(el: Element): void {
  const container = el.closest('li') || el.closest('tr') || el;
  const badge = container.querySelector<HTMLElement>(`[${BADGE_ATTR}]`);
  if (badge) {
    badge.remove();
  }
}

/**
 * 批量查询多题的 AC 数据
 * @param problemIds 题目 ID 列表
 * @param selection 当前选中状态
 * @returns results[problemId] = AC 学生列表，total = 总人数
 */
async function queryProblemsAc(
  problemIds: string[],
  selection: Selection,
): Promise<{
  results: Record<string, StudentAcInfo[]>;
  total: number;
} | null> {
  if (problemIds.length === 0) return { results: {}, total: 0 };
  try {
    const msg: ContentToBackgroundMessage = {
      type: 'QUERY_PROBLEMS_AC',
      problemIds,
      selection,
    };
    const resp = await sendMessageToBackground(msg);
    if (resp.ok && 'results' in resp) {
      return { results: resp.results, total: resp.total };
    }
    console.warn('[洛谷老师助手] 批量查询 AC 数据失败:', resp.ok ? '' : resp.error);
    return null;
  } catch (err) {
    console.warn('[洛谷老师助手] 批量查询 AC 数据异常（background 可能未实现）:', err);
    return null;
  }
}

/**
 * 注入徽章到当前列表页
 * 规格文档 §3.4.2
 *
 * @param selection 当前选中状态，null 时不注入（零干扰）
 */
export async function injectBadges(selection: Selection): Promise<void> {
  // 无选择：清理已有徽章，零干扰
  if (selection === null) {
    const config = getPageConfig();
    if (config) {
      const items = document.querySelectorAll(config.problemItemSelector);
      items.forEach(clearBadge);
    }
    return;
  }

  // 防御性清理：确保所有旧徽章在注入前已清除
  // （injectForCurrentPage 也会调 clearAllBadges，这里是双保险）
  clearAllBadges();

  const pageType = detectPageType();
  const config = getPageConfig(pageType);
  if (!config) return; // 非列表页，不注入徽章

  // 找到所有题目元素
  let items = Array.from(document.querySelectorAll(config.problemItemSelector));
  console.log('[洛谷老师助手] 徽章注入:', pageType, '选择器:', config.problemItemSelector, '首次匹配数:', items.length);

  // Vue SPA 可能还没渲染完，重试最多 3 次（每次间隔 500ms）
  for (let retry = 0; retry < 3 && items.length === 0; retry++) {
    console.log('[洛谷老师助手] 选择器无匹配，重试', retry + 1, '/ 3');
    await new Promise((r) => setTimeout(r, 500));
    items = Array.from(document.querySelectorAll(config.problemItemSelector));
    console.log('[洛谷老师助手] 重试后匹配数:', items.length);
  }

  if (items.length === 0) {
    console.warn('[洛谷老师助手] 选择器最终未匹配任何元素，DOM 结构可能已变更');
    return;
  }

  // 提取 problemId，按 pid 去重：同一行若有两个链接（如题号链接+标题链接）只保留第一个
  const pidToEl = new Map<string, Element>();
  for (const el of items) {
    const pid = config.extractProblemId(el);
    if (pid && !pidToEl.has(pid)) {
      pidToEl.set(pid, el);
    }
  }

  if (pidToEl.size === 0) {
    console.warn('[洛谷老师助手] 当前页面未提取到任何题目 ID，选择器可能需要更新');
    return;
  }

  console.log('[洛谷老师助手] 去重后题目数:', pidToEl.size);

  // 批量查询 AC 数据
  const problemIds = Array.from(pidToEl.keys());
  const queryResult = await queryProblemsAc(problemIds, selection);
  if (!queryResult) {
    // 查询失败（background 未实现等），静默降级
    return;
  }

  const { results, total } = queryResult;
  const staleThreshold = await getStaleThreshold();

  // 注入或更新徽章
  for (const [pid, el] of pidToEl) {
    try {
      const students = results[pid] ?? [];
      const badge = getOrCreateBadge(el);
      updateBadge(badge, students, total, selection, staleThreshold);
      // 如果徽章是新创建的，需要注入到 DOM
      if (!badge.parentElement) {
        config.injectBadge(el, badge);
      }
    } catch (err) {
      // 单个题目注入失败不影响其他题目
      console.warn(`[洛谷老师助手] 题目 ${pid} 徽章注入失败:`, err);
    }
  }
}

/**
 * 清理当前页面所有徽章（路由变化/选择清除时用）
 */
export function clearAllBadges(): void {
  const badges = document.querySelectorAll<HTMLElement>(`[${BADGE_ATTR}]`);
  badges.forEach((b) => b.remove());
}
