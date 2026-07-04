// MV3 Service Worker 入口
//
// 职责：
// 1. onInstalled：初始化默认配置（requestInterval / staleThresholdDays）
// 2. alarms.onAlarm：保活心跳（调 getPlatformInfo 给 SW 续命）
// 3. 初始化消息路由
// 4. 顶层调用 batch-task 的断点续传恢复（SW 被杀后重启时自动恢复运行中任务）
//
// SW 生命周期：MV3 SW 30 秒无活动即休眠。keepalive alarm 24s 心跳保活，
// 断点续传作为双保险（详见规格 §4.1）。

import { db } from '@/db/schema';
import { initMessaging } from './messaging';
import { handleKeepaliveAlarm } from './keepalive';
import { resumeInterruptedTask } from './batch-task';

/** 默认配置（规格 §6） */
const DEFAULT_CONFIG = {
  requestInterval: 2000, // 请求间隔 2s
  staleThresholdDays: 7, // 缓存过期阈值 7 天
};

/**
 * 初始化默认配置到 meta 表（仅对缺失的 key 写入，不覆盖用户已设置的值）
 */
async function initDefaultConfig(): Promise<void> {
  try {
    const existing = await db.meta.toArray();
    const existingKeys = new Set(existing.map((m) => m.key));

    const defaults: Array<{ key: string; value: unknown }> = [
      { key: 'requestInterval', value: DEFAULT_CONFIG.requestInterval },
      { key: 'staleThresholdDays', value: DEFAULT_CONFIG.staleThresholdDays },
    ];

    for (const item of defaults) {
      if (!existingKeys.has(item.key)) {
        await db.meta.put({ key: item.key, value: item.value });
      }
    }
  } catch (e) {
    console.error('[bg] 初始化默认配置失败:', e);
  }
}

// ---- 1. 扩展安装/更新 ----
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[洛谷老师助手] onInstalled:', details.reason);
  // 初始化默认配置（异步，不阻塞）
  initDefaultConfig().catch((e) => {
    console.error('[bg] initDefaultConfig failed:', e);
  });
});

// ---- 0. SW 启动日志 ----
console.log('[洛谷老师助手] background SW 启动');

// ---- 2. alarm 心跳保活 ----
// 每 24s 触发一次，回调里调用 getPlatformInfo() 给 SW 续命。
// 仅处理 keepalive alarm，其他 alarm 忽略。
chrome.alarms.onAlarm.addListener((alarm) => {
  handleKeepaliveAlarm(alarm).catch((e) => {
    console.warn('[bg] keepalive alarm 处理异常:', e);
  });
});

// ---- 3. 初始化消息路由 ----
initMessaging();

// ---- 4. SW 启动恢复（顶层立即执行）----
// SW 每次启动都会执行顶层代码。检查是否有未完成任务，有则断点续传。
// 这是"双保险"：即便 alarm 没能阻止休眠，SW 被杀后下次被任何事件唤醒时，
// 都能从这里自动恢复。
resumeInterruptedTask().catch((e) => {
  console.error('[bg] 断点续传恢复失败:', e);
});
