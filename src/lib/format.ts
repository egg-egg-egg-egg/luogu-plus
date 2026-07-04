// 时间格式化工具

/** 一分钟、一小时、一天的毫秒数 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 将时间戳格式化为相对时间（如"3 天前"、"刚刚"、"未更新"）
 *
 * @param ts 时间戳（毫秒），null 表示从未更新
 * @returns 相对时间字符串
 */
export function formatRelativeTime(ts: number | null): string {
  if (ts === null) return '未更新';
  const diff = Date.now() - ts;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  // 超过 7 天显示日期
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** sleep 毫秒 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
