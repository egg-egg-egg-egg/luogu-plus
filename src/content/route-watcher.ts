// SPA 路由监听（洛谷是 Vue SPA，pushState/replaceState 切页不刷新页面）
// 规格文档 §3.4.4
//
// 三重保险：
// 1. 拦截 history.pushState / history.replaceState
// 2. 监听 popstate 事件（前进/后退）
// 3. MutationObserver 监听 document.body 子树变化（兜底）
//
// 路由变化后延迟 300ms 再触发回调（等 Vue 渲染完成）
// 防抖：连续变化只触发最后一次
//
// 重要：首次页面加载时 SPA 可能调用 replaceState 做 URL 规范化，
// 这不是真正的路由变化，不应触发注入。通过 skipInitialReplace 跳过。

/** 防抖延迟（ms），等 Vue 渲染完成 */
const DEBOUNCE_MS = 300;

/** MutationObserver 兜底节流间隔（ms），避免高频回调 */
const MUTATION_THROTTLE_MS = 500;

export interface RouteWatchOptions {
  /**
   * 是否跳过首次 replaceState 调用（SPA 初始化时的 URL 规范化）。
   * 默认 false，但在 content script 入口应设为 true 以避免
   * 和 onSelectionChange 产生双重注入竞争。
   */
  skipInitialReplace?: boolean;
}

/**
 * 监听 SPA 路由变化
 *
 * @param callback 路由变化回调，参数为当前完整 URL
 * @param options 配置选项
 * @returns 取消监听函数
 */
export function onRouteChange(
  callback: (url: string) => void,
  options: RouteWatchOptions = {},
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let mutationThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUrl = location.href;
  /** 是否允许触发：skipInitialReplace=true 时首次 replaceState 不触发 */
  let allowTrigger = !options.skipInitialReplace;

  /** 触发防抖回调 */
  const trigger = (url: string): void => {
    if (!allowTrigger) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // 防抖结束后再次校验 URL 是否真的变了（避免重复触发）
      if (url !== lastUrl) {
        lastUrl = url;
        callback(url);
      }
    }, DEBOUNCE_MS);
  };

  /** 获取当前完整 URL 并触发 */
  const triggerCurrent = (): void => {
    trigger(location.href);
  };

  // ========== 1. 拦截 history.pushState / history.replaceState ==========
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  const patchedPushState = (
    ...args: Parameters<typeof history.pushState>
  ): void => {
    originalPushState(...args);
    // pushState 始终是真正的用户导航，直接触发
    allowTrigger = true;
    triggerCurrent();
  };

  const patchedReplaceState = (
    ...args: Parameters<typeof history.replaceState>
  ): void => {
    originalReplaceState(...args);
    // 首次 replaceState 可能是 SPA 初始化规范化 URL，跳过
    // 之后每次 replaceState 都是真正的路由变化
    if (!allowTrigger) {
      allowTrigger = true; // 允许后续触发
      lastUrl = location.href; // 同步当前 URL，避免后续误判
      console.log('[洛谷老师助手] 跳过首次 replaceState（SPA 初始化规范化 URL）');
      return;
    }
    triggerCurrent();
  };

  history.pushState = patchedPushState;
  history.replaceState = patchedReplaceState;

  // ========== 2. 监听 popstate（前进/后退） ==========
  const onPopState = (): void => triggerCurrent();
  window.addEventListener('popstate', onPopState);

  // ========== 3. MutationObserver 监听 body 子树变化（兜底） ==========
  // 洛谷某些内部路由切换可能不走 history API（罕见但防万一），用 DOM 变化作兜底
  const observer = new MutationObserver(() => {
    // 节流：避免短时间内大量 DOM 变化触发过多回调
    if (mutationThrottleTimer) return;
    mutationThrottleTimer = setTimeout(() => {
      mutationThrottleTimer = null;
      // DOM 变化时检查 URL 是否变了
      if (location.href !== lastUrl) {
        triggerCurrent();
      }
    }, MUTATION_THROTTLE_MS);
  });

  // body 可能尚未就绪，延迟挂载
  const attachObserver = (): void => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      // body 未就绪，等 DOMContentLoaded
      document.addEventListener('DOMContentLoaded', attachObserver, {
        once: true,
      });
    }
  };
  attachObserver();

  // ========== 返回取消监听函数 ==========
  return (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (mutationThrottleTimer) clearTimeout(mutationThrottleTimer);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', onPopState);
    observer.disconnect();
  };
}
