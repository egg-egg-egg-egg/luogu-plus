// 洛谷页面选择器（分页面定义，洛谷改版时改此一处）
// 规格文档 §3.4.2
//
// 洛谷是 Vue SPA，不同页面的 DOM 结构差异较大，选择器分页面配置。
// 所有选择器集中在此文件，洛谷改版时只需改这里 + content.css。

/** 页面类型 */
export type PageType =
  | 'training' // 题单页 /training/{id}
  | 'problem_list' // 题目列表 /problem/list
  | 'problemset' // 题目集 /problemset
  | 'problem_detail' // 题目详情 /problem/{pid}
  | 'other'; // 其他页面（不注入）

/** 页面配置：描述某类页面的选择器与注入策略 */
export interface PageConfig {
  type: PageType;
  /** 题目元素选择器（列表页用） */
  problemItemSelector: string;
  /** 从题目元素提取 problemId，提取失败返回 null */
  extractProblemId: (el: Element) => string | null;
  /** 将徽章注入到题目元素中（列表页用） */
  injectBadge: (el: Element, badge: HTMLElement) => void;
}

/** 注入元素标记属性，防重复注入 */
export const BADGE_ATTR = 'data-luogu-plus-badge';
export const STATUS_BAR_ATTR = 'data-luogu-plus-status-bar';

/** 题目 ID 正则：匹配 P1234 / B2001 / T123456 等，保留前缀 */
const PROBLEM_ID_REGEX = /^\/problem\/([A-Z]\d+)$/i;

/**
 * 从链接 href 中提取题目 ID
 * 洛谷题目链接格式：/problem/P1234
 * 返回 "P1234" 或 null
 */
function extractProblemIdFromHref(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(PROBLEM_ID_REGEX);
  return match ? match[1].toUpperCase() : null;
}

/**
 * 识别当前页面类型（基于 URL pathname）
 * 规格文档 §3.4.2 页面识别规则
 */
export function detectPageType(pathname: string = location.pathname): PageType {
  // 题单页 /training/{id}
  if (/^\/training\/\d+/.test(pathname)) return 'training';
  // 题目列表 /problem/list
  if (/^\/problem\/list/.test(pathname)) return 'problem_list';
  // 题目集 /problemset
  if (/^\/problemset\/?$/i.test(pathname)) return 'problemset';
  // 题目详情 /problem/{pid}（注意要排除 /problem/list）
  if (/^\/problem\/[A-Z]\d+/i.test(pathname)) return 'problem_detail';
  return 'other';
}

/**
 * 从链接 el（<a>）的 href 中提取题目 ID
 * 三页面（training / problem_list / problemset）共用。
 */
function extractProblemIdFromLink(el: Element): string | null {
  return extractProblemIdFromHref(el.getAttribute('href'));
}

/** 题单页 /training/{id} 配置：用链接定位，不依赖具体 DOM 结构 */
const trainingConfig: PageConfig = {
  type: 'training',
  // 洛谷题单页是 Vue SPA，DOM 结构变化频繁（SSR 有 ol>li，但客户端 hydrate 后可能不同）。
  // 不依赖标签选择器，直接用链接定位：所有在 #app 内指向 /problem/ 的链接。
  problemItemSelector: '#app a[href*="/problem/"]',
  extractProblemId: extractProblemIdFromLink,
  injectBadge: (el, badge) => {
    // el 是 <a> 链接，找到其父 <li> 或列表容器注入徽章
    const li = el.closest('li');
    if (li) {
      li.appendChild(badge);
    } else {
      // 回退：直接追加到链接后面
      el.insertAdjacentElement('afterend', badge);
    }
  },
};

/** 列表页 /problem/list + 题库页 /problemset 共用配置
 *  二者 DOM 结构相同：.list-wrap > .row-wrap > .row（div 模拟表格行） */
const listCommonConfig: PageConfig = {
  type: 'problem_list', // 默认类型，problemset 会覆盖
  // 定位每一行的题目链接：.row > .title > a[href="/problem/Pxxx"]
  problemItemSelector: '.list-wrap .row a[href*="/problem/"]',
  extractProblemId: extractProblemIdFromLink,
  injectBadge: (el, badge) => {
    // el 是 <a> 链接（在 .title 内），append 到 .title 内部末尾
    // 效果：徽章紧贴题目名称链接后面，与题单页显示位置一致，不挤占其他列
    const title = el.closest('.title');
    if (title) {
      title.appendChild(badge);
    } else {
      // 回退：追加到行末尾
      const row = el.closest('.row');
      if (row) {
        row.appendChild(badge);
      } else {
        el.insertAdjacentElement('afterend', badge);
      }
    }
  },
};

/** 各页面配置表 */
const PAGE_CONFIGS: Partial<Record<PageType, PageConfig>> = {
  training: trainingConfig,
  problem_list: listCommonConfig,
  problemset: { ...listCommonConfig, type: 'problemset' },
};

/**
 * 获取当前页面配置（列表页用）
 * 返回 null 表示当前页面不需要徽章注入（详情页/其他页）
 */
export function getPageConfig(
  pageType: PageType = detectPageType(),
): PageConfig | null {
  return PAGE_CONFIGS[pageType] ?? null;
}

/**
 * 从题目详情页 URL 提取 problemId
 * /problem/P1234 → "P1234"
 */
export function extractProblemIdFromUrl(
  pathname: string = location.pathname,
): string | null {
  const match = pathname.match(/^\/problem\/([A-Z]\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** 详情页状态条插入锚点选择器 — 实测洛谷无 .main-container，用 #app article */
export const STATUS_BAR_ANCHOR_SELECTOR = '#app article';

/** 洛谷暗色模式探测：body 上的 data-theme 或 class */
export function detectLuoguTheme(): 'light' | 'dark' {
  // 洛谷暗色模式通常在 body 或 html 上有特定标记
  // 常见实现：body[data-theme="dark"] 或 html.dark 或 body 有 dark class
  const body = document.body;
  const html = document.documentElement;

  if (
    body.getAttribute('data-theme') === 'dark' ||
    html.getAttribute('data-theme') === 'dark' ||
    html.classList.contains('dark') ||
    body.classList.contains('dark') ||
    html.classList.contains('theme-dark') ||
    body.classList.contains('theme-dark')
  ) {
    return 'dark';
  }

  // 回退：根据背景色亮度判断
  const bgColor = window.getComputedStyle(body).backgroundColor;
  const rgb = bgColor.match(/\d+/g);
  if (rgb && rgb.length >= 3) {
    const [r, g, b] = rgb.map(Number);
    // 相对亮度公式（简化）：暗色背景亮度低
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance < 0.5) return 'dark';
  }

  return 'light';
}
