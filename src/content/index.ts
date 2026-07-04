// Content Script 入口（洛谷页面注入）
// 规格文档 §3.4
//
// 职责：
// - 初始化路由监听（SPA）
// - 初始化选中状态同步（chrome.storage.onChanged）
// - 路由变化时：判断页面类型 → 调用对应注入器
// - 选中变化时：重新注入当前页面的徽章/状态条
// - 主题检测：根据洛谷页面暗色模式设置 data-theme

// ========== 单例守卫 ==========
// 防止 content script 模块被重复注入（@crxjs/vite-plugin 在某些配置下可能加载两次，
// 导致两套独立的 injectionLock 并发运行，产生重复徽章）
const SCRIPT_GUARD = '__luogu_plus_content_script_v1__';
const alreadyInjected =
  typeof self !== 'undefined' &&
  (self as unknown as Record<string, boolean>)[SCRIPT_GUARD];

if (typeof self !== 'undefined') {
  (self as unknown as Record<string, boolean>)[SCRIPT_GUARD] = true;
}

// 导入注入样式（@crxjs/vite-plugin 会自动注入到页面）
import '@/styles/content.css';

import { onRouteChange } from './route-watcher';
import {
  initSelectionSync,
  onSelectionChange,
  getCurrentSelection,
} from './selection-sync';
import { injectBadges, clearAllBadges } from './badge-injector';
import { detectPageType, detectLuoguTheme } from './selectors';
import type { Selection } from '@/store/selection';

/** 注入锁：串行化所有注入调用，防止并发叠加导致重复徽章 */
let injectionLock: Promise<void> = Promise.resolve();

/**
 * 注入当前页面，锁内执行，确保同一时刻只有一个注入在运行。
 */
async function injectForCurrentPage(selection: Selection): Promise<void> {
  const doInject = async (): Promise<void> => {
    const pageType = detectPageType();

    if (selection === null) {
      console.log('[洛谷老师助手] selection=null, 零干扰——清理旧徽章');
      clearAllBadges();
      return;
    }

    // 先清理旧注入，再注入新的（切换学生/班级时旧徽章先被清理）
    clearAllBadges();

    try {
      if (
        pageType === 'training' ||
        pageType === 'problem_list' ||
        pageType === 'problemset'
      ) {
        console.log('[洛谷老师助手] → 注入徽章, pageType:', pageType);
        await injectBadges(selection);
      } else {
        console.log('[洛谷老师助手] 非目标页面:', pageType);
      }
    } catch (err) {
      console.warn('[洛谷老师助手] 注入失败:', err);
    }
  };

  // 链式串行化：每次调用排队到上一次注入完成之后
  // 注意：只用 then(() => doInject()) 而非 then(doInject, doInject)
  // 后者在 doInject 同步抛错/返回 rejected promise 时会重复调用 doInject
  injectionLock = injectionLock.then(() => doInject());
  await injectionLock;
}

/**
 * 路由变化处理器 — 注入锁会确保同一时间只有一个注入执行
 */
async function handleRouteChange(): Promise<void> {
  const selection = getCurrentSelection();
  await injectForCurrentPage(selection);
}

/**
 * 选中状态变化处理器 — 注入锁会确保同一时间只有一个注入执行
 */
async function handleSelectionChange(selection: Selection): Promise<void> {
  await injectForCurrentPage(selection);
}

// ========== 初始化入口 ==========
// 单例守卫：已注入则跳过所有副作用注册，避免重复监听导致双倍注入
if (alreadyInjected) {
  console.warn('[洛谷老师助手] content script 重复注入，跳过初始化');
} else {
  console.log('[洛谷老师助手] content script loaded');

  // 1. 初始化选中状态同步（监听 chrome.storage.onChanged）
  initSelectionSync();

  // 2. 注册选中状态变化回调（变化时重新注入）
  onSelectionChange((selection) => {
    void handleSelectionChange(selection);
  });

  // 3. 初始化路由监听（SPA 路由变化时重新注入）
  //    skipInitialReplace: 跳过 SPA 初始化时的 replaceState
  //    （避免与 handleSelectionChange 双重注入竞争）
  const unlistenRoute = onRouteChange(() => {
    void handleRouteChange();
  }, { skipInitialReplace: true });

  // 4. 等待 selection 加载完成（首次注入由 handleSelectionChange 回调触发）
  void (async (): Promise<void> => {
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
    }
    // 如果 selection 还没加载，等待 onSelectionChange 首次回调
    if (getCurrentSelection() === null) {
      await new Promise<void>((resolve) => {
        const unsub = onSelectionChange(() => { unsub(); resolve(); });
        setTimeout(() => { unsub(); resolve(); }, 5000);
      });
    }
    // 注入由 handleSelectionChange 回调负责，这里不再触发以避免双重注入
    console.log('[洛谷老师助手] selection 就绪, 由 onSelectionChange 回调接管注入');
  })();

  // ========== 主题切换监听（实时响应洛谷暗色模式切换） ==========

  // 监听系统暗色模式变化（如果洛谷跟随系统主题）
  if (window.matchMedia) {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', () => {
      // 主题变化时重新注入（会重新检测 data-theme）
      const selection = getCurrentSelection();
      void injectForCurrentPage(selection);
    });
  }

  // 监听洛谷页面主题切换（MutationObserver 观察 body 的 class/data-theme 变化）
  let themeObserver: MutationObserver | null = null;
  const attachThemeObserver = (): void => {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', attachThemeObserver, {
        once: true,
      });
      return;
    }
    themeObserver = new MutationObserver(() => {
      const newTheme = detectLuoguTheme();
      // 更新所有已注入元素的 data-theme
      document
        .querySelectorAll<HTMLElement>('[data-luogu-plus-badge]')
        .forEach((el) => {
          el.setAttribute('data-theme', newTheme);
        });
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
  };
  attachThemeObserver();

  // 导出 unlistenRoute 供测试用（content script 生命周期内不主动取消）
  void unlistenRoute;
}
