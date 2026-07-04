// 洛谷抓取器
// 抓取架构：background fetch 拉 HTML → 提取 lentille-context JSON → 解析 data.passed
// 双路兼容：lentille-context 优先（新架构 Spilopelia），找不到回退 __INITIAL_STATE__（旧架构 Lentille）

import type { Difficulty } from '@/db/types';

/** 洛谷 AC 记录条目（practice 页面 data.passed[i]） */
export interface LuoguAcEntry {
  pid: string; // 题目 ID，如 "P1234"
  name: string; // 题目标题（已含 [NOIP ...] 等前缀）
  difficulty: Difficulty; // 难度 0-7
  type: string; // 题目类型 "P"/"B"
}

/** 抓取错误类型（规格 §10） */
export type FetchError =
  | { code: 'E_LUOGU_404'; message: string }
  | { code: 'E_LUOGU_403'; message: string }
  | { code: 'E_LUOGU_RATE_LIMIT'; message: string }
  | { code: 'E_LUOGU_PARSE'; message: string }
  | { code: 'E_NETWORK'; message: string };

/** 抓取成功结果 */
export interface FetchSuccess {
  success: true;
  luoguName: string;
  acRecords: LuoguAcEntry[];
}

/** 抓取失败结果 */
export interface FetchFailure {
  success: false;
  error: FetchError;
}

/** 抓取结果（成功或失败联合类型） */
export type FetchResult = FetchSuccess | FetchFailure;

/** practice 页面正常响应基线大小（字节，预研实测 24228） */
const BASELINE_RESPONSE_SIZE = 24228;
/** 响应大小偏离基线的阈值（30%） */
const SIZE_DEVIATION_THRESHOLD = 0.3;
/** 风控关键词（命中任一即判定为风控） */
const RATE_LIMIT_KEYWORDS = ['登录', '验证', 'block', '频繁'];

/** lentille-context 数据载体里的 passed 数组元素结构 */
interface LuoguPassedEntry {
  type: string;
  name: string;
  difficulty: number;
  pid: string;
}

/** lentille-context 顶层结构（仅声明用到的字段） */
interface LentilleContext {
  data?: {
    passed?: LuoguPassedEntry[];
    user?: {
      uid?: number;
      name?: string;
      isBanned?: boolean;
      passedProblemCount?: number;
    };
  };
}

/** 旧架构 __INITIAL_STATE__ 顶层结构（字段名不同：passedProblems） */
interface InitialState {
  user?: {
    uid?: number;
    name?: string;
    isBanned?: boolean;
    passedProblemCount?: number;
  };
  passedProblems?: LuoguPassedEntry[];
}

/** 构造错误辅助函数 */
function makeError<T extends FetchError>(err: T): FetchFailure {
  return { success: false, error: err };
}

/** 网络错误转 E_NETWORK */
function toNetworkError(e: unknown): FetchFailure {
  const msg = e instanceof Error ? e.message : String(e);
  return makeError({ code: 'E_NETWORK', message: `网络请求失败: ${msg}` });
}

/**
 * 状态码检测：根据 HTTP 状态码判断是否触发错误。
 * 返回 FetchError 表示命中错误，返回 null 表示状态码正常（200）。
 *
 * 在数据提取前调用，404/403/非200 直接返回，不进入数据提取流程。
 */
export function detectStatusError(status: number): FetchError | null {
  if (status === 404) {
    return { code: 'E_LUOGU_404', message: '洛谷账号不存在' };
  }
  if (status === 403) {
    return { code: 'E_LUOGU_403', message: '洛谷账号已被封禁或访问被拒绝' };
  }
  if (status !== 200) {
    return {
      code: 'E_LUOGU_RATE_LIMIT',
      message: `HTTP ${status}，疑似触发风控`,
    };
  }
  return null;
}

/**
 * 内容风控检测：根据响应内容和大小判断是否触发风控。
 * 返回 FetchError 表示命中风控，返回 null 表示未检测到风控特征。
 *
 * 在数据提取失败后调用，避免对正常页面（含"登录"等常规关键词）误判。
 */
export function detectContentRateLimit(
  bodyText: string,
  contentLength: number,
): FetchError | null {
  // 1. 关键词判定
  for (const kw of RATE_LIMIT_KEYWORDS) {
    if (bodyText.includes(kw)) {
      return {
        code: 'E_LUOGU_RATE_LIMIT',
        message: `响应含风控关键词"${kw}"，疑似触发风控`,
      };
    }
  }

  // 2. 响应大小偏离判定（拦截页通常远小于正常页面）
  if (contentLength > 0) {
    const deviation = Math.abs(contentLength - BASELINE_RESPONSE_SIZE) / BASELINE_RESPONSE_SIZE;
    if (deviation > SIZE_DEVIATION_THRESHOLD) {
      return {
        code: 'E_LUOGU_RATE_LIMIT',
        message: `响应大小 ${contentLength} 字节偏离基线 ${BASELINE_RESPONSE_SIZE} 超过 30%，疑似风控拦截页`,
      };
    }
  }

  return null;
}

/**
 * 从 HTML 中提取 lentille-context JSON（新架构 Spilopelia）
 * 匹配 <script id="lentille-context" type="application/json">{...}</script>
 */
function extractLentilleContext(html: string): LentilleContext | null {
  const match = html.match(
    /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1]) as LentilleContext;
  } catch {
    return null;
  }
}

/**
 * 从 HTML 中提取旧架构 __INITIAL_STATE__（回退路径）
 * 兼容两种形式：
 *   1) window.__INITIAL_STATE__ = decodeURIComponent("...");  需 URL decode
 *   2) window.__INITIAL_STATE__ = {...};                       直接 JSON
 */
function extractInitialState(html: string): InitialState | null {
  // 模式 1：decodeURIComponent("...")
  const m1 = html.match(
    /window\.__INITIAL_STATE__\s*=\s*decodeURIComponent\(\s*['"](.*?)['"]\s*\)/,
  );
  if (m1 && m1[1]) {
    try {
      const decoded = decodeURIComponent(m1[1]);
      return JSON.parse(decoded) as InitialState;
    } catch {
      // fallthrough 到模式 2
    }
  }

  // 模式 2：直接对象 {...} 后接 </script>
  const m2 = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  );
  if (m2 && m2[1]) {
    try {
      return JSON.parse(m2[1]) as InitialState;
    } catch {
      return null;
    }
  }

  return null;
}

/** 将洛谷返回的 passed 条目转为本地 LuoguAcEntry（做难度范围校验） */
function normalizeAcEntries(passed: LuoguPassedEntry[]): LuoguAcEntry[] {
  return passed.map((p) => ({
    pid: String(p.pid),
    name: String(p.name ?? ''),
    // 难度限制在 0-7，越界值钳为 0（暂无评定）
    difficulty: (Number.isInteger(p.difficulty) && p.difficulty >= 0 && p.difficulty <= 7
      ? p.difficulty
      : 0) as Difficulty,
    type: String(p.type ?? ''),
  }));
}

/**
 * 抓取指定学生的 AC 记录
 *
 * 流程：
 * 1. fetch 洛谷 user/{id}/practice 页面 HTML
 * 2. 风控检测（状态码 / 关键词 / 响应大小）
 * 3. 双路兼容提取：lentille-context 优先，找不到回退 __INITIAL_STATE__
 * 4. 封禁检测（data.user.isBanned === true → E_LUOGU_403）
 * 5. 一致性校验（len(passed) === passedProblemCount，不等则告警但不阻断）
 * 6. 返回 luoguName + acRecords
 *
 * @param luoguId 洛谷 UID
 */
export async function fetchStudentAC(luoguId: number): Promise<FetchResult> {
  const url = `https://www.luogu.com.cn/user/${luoguId}/practice`;

  // ---- 1. 发起请求 ----
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'GET',
      credentials: 'include', // 带上 __client_id 等 cookie，降低风控概率
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (e) {
    return toNetworkError(e);
  }

  const bodyText = await resp.text();

  // ---- 2. 状态码检测（404/403/非200 直接返回） ----
  const statusErr = detectStatusError(resp.status);
  if (statusErr) {
    return makeError(statusErr);
  }

  // ---- 3. 双路兼容提取 ----
  // 优先 lentille-context（新架构）
  const lentille = extractLentilleContext(bodyText);
  if (lentille && lentille.data) {
    const data = lentille.data;
    const user = data.user;

    // 封禁检测
    if (user?.isBanned === true) {
      return makeError({
        code: 'E_LUOGU_403',
        message: `洛谷账号 ${luoguId} 已被封禁`,
      });
    }

    const passed = Array.isArray(data.passed) ? data.passed : [];
    const luoguName = user?.name ?? String(luoguId);

    // 一致性校验（不等则告警，不阻断）
    if (user && typeof user.passedProblemCount === 'number') {
      if (passed.length !== user.passedProblemCount) {
        console.warn(
          `[luogu-fetcher] 一致性告警: uid=${luoguId} len(passed)=${passed.length} !== passedProblemCount=${user.passedProblemCount}`,
        );
      }
    }

    return {
      success: true,
      luoguName,
      acRecords: normalizeAcEntries(passed),
    };
  }

  // 回退 __INITIAL_STATE__（旧架构）
  const initialState = extractInitialState(bodyText);
  if (initialState) {
    const user = initialState.user;

    // 封禁检测
    if (user?.isBanned === true) {
      return makeError({
        code: 'E_LUOGU_403',
        message: `洛谷账号 ${luoguId} 已被封禁`,
      });
    }

    // 旧架构字段名为 passedProblems
    const passed = Array.isArray(initialState.passedProblems)
      ? initialState.passedProblems
      : [];
    const luoguName = user?.name ?? String(luoguId);

    // 一致性校验
    if (user && typeof user.passedProblemCount === 'number') {
      if (passed.length !== user.passedProblemCount) {
        console.warn(
          `[luogu-fetcher] 一致性告警(旧架构): uid=${luoguId} len(passedProblems)=${passed.length} !== passedProblemCount=${user.passedProblemCount}`,
        );
      }
    }

    return {
      success: true,
      luoguName,
      acRecords: normalizeAcEntries(passed),
    };
  }

  // 两种数据载体都找不到：检查是否是风控拦截页
  // 仅在数据提取失败后才检查关键词和响应大小，避免对正常页面误判
  // （正常页面可能含"登录"等常规关键词，0 AC 学生页面大小会偏离基线）
  const contentLength = new TextEncoder().encode(bodyText).length;
  const contentRateLimitErr = detectContentRateLimit(bodyText, contentLength);
  if (contentRateLimitErr) {
    return makeError(contentRateLimitErr);
  }

  return makeError({
    code: 'E_LUOGU_PARSE',
    message: `无法从页面提取数据（lentille-context 与 __INITIAL_STATE__ 均未找到），洛谷页面结构可能已变更`,
  });
}
