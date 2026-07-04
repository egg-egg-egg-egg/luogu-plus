// SW 保活逻辑（规格 §4.1）
//
// 原理：MV3 SW 默认 30 秒无活动即休眠，班级更新 20 人 × 2s = 40s 长任务会被中断。
// chrome.alarms 每 24 秒触发一次事件（< 30s 阈值），回调里调用异步 chrome API
// (getPlatformInfo) 制造 pending 调用，重置 SW 的 30s 空闲计时器，实现保活。
//
// 任务完成后清除 alarm，释放保活。
//
// 注：Chrome 生产环境可能将 alarm 周期钳制到 1 分钟，此时依赖 batch-task 的断点续传
// 作为双保险（SW 被杀后从 taskProgress 表续传）。

/** 心跳 alarm 名称 */
export const ALARM_NAME = 'keepalive';
/** 心跳间隔（分钟），24 秒 = 0.4 分钟，必须 < 30s SW 休眠阈值 */
export const INTERVAL_MINUTES = 0.4;

/**
 * 启动 SW 保活：创建 24s 心跳 alarm。
 * 调用时机：批量更新任务启动时。
 */
export async function startKeepalive(): Promise<void> {
  // 先清除可能残留的同名 alarm，再创建（幂等）
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: INTERVAL_MINUTES,
  });
}

/**
 * 停止 SW 保活：清除心跳 alarm。
 * 调用时机：任务完成 / 失败 / 中止时。
 */
export async function stopKeepalive(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
}

/**
 * 处理 alarm 心跳事件。
 * 调用 getPlatformInfo() 制造一次 pending 异步 API 调用，给 SW 续命。
 * 应在 SW 入口的 chrome.alarms.onAlarm 监听器里调用。
 */
export async function handleKeepaliveAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM_NAME) return;
  try {
    // 关键保活技巧：异步 chrome API 调用延长 SW 生命周期
    await chrome.runtime.getPlatformInfo();
  } catch {
    // 忽略错误，保活目的已达（alarm 事件本身已唤醒 SW）
  }
}
