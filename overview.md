# 徽章重复 Bug 修复报告

> 修复时间: 2026-07-04 15:12

## 变更文件

| 文件 | 变更内容 |
|------|---------|
| `src/content/index.ts` | 单例守卫 + 注入锁修复 + skipInitialReplace |
| `src/content/route-watcher.ts` | 新增 skipInitialReplace 选项 |
| `src/content/badge-injector.ts` | 防御性 clearAllBadges |

## 根因与修复

### 修复 1：单例守卫
**根因**: `@crxjs/vite-plugin@beta` 在某些场景下会将 content script 注入两次（isolated world + main world dynamic import），产生两套独立的 `injectionLock`，各自并发执行。

**修复**: 在 `index.ts` 顶部用 `self.__luogu_plus_content_script_v1__` 标记检测重复注入，已注入时跳过所有副作用注册。

### 修复 2：injectionLock 双重执行风险
**根因**: `.then(doInject, doInject)` — 当 `doInject` 返回 rejected promise 时，rejection handler（也是 `doInject`）会再次执行，同一次入队可能产生两次注入。

**修复**: 改为 `.then(() => doInject())`，错误只在 `doInject` 内部 catch 处理。

### 修复 3：首次 replaceState 误触发
**根因**: 页面刷新时 SPA 调用 `history.replaceState` 做 URL 规范化，300ms 防抖后触发 `handleRouteChange`，与 `handleSelectionChange` 形成两次注入排队。

**修复**: `onRouteChange` 新增 `skipInitialReplace` 选项，首次 `replaceState` 跳过回调，只同步 `lastUrl`。

### 修复 4：防御性清理
**根因**: 即使外部调用正确，`injectBadges` 内部没有自己的清理步骤。

**修复**: 在 `injectBadges` 开头加 `clearAllBadges()`，双重保险。
