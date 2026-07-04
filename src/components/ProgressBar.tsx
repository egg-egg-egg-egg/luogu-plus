// 进度条组件
interface ProgressBarProps {
  /** 当前进度 0-1 */
  progress: number;
  /** 是否带失败计数显示 */
  failed?: number;
  /** 总数 */
  total?: number;
  /** 已完成数 */
  done?: number;
  /** 高度，默认 h-2 */
  height?: string;
  /** 是否显示文字（在进度条右侧），默认 true */
  showLabel?: boolean;
}

/** 进度条：带百分比、可选失败计数 */
export function ProgressBar({
  progress,
  failed = 0,
  total,
  done,
  height = 'h-2',
  showLabel = true,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const hasFailed = failed > 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className={[
          'flex-1 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700',
          height,
        ].join(' ')}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={[
            'h-full rounded-full transition-all duration-300 ease-out',
            hasFailed
              ? 'bg-gradient-to-r from-luogu-ac to-amber-500'
              : 'bg-luogu-ac',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono text-zinc-600 dark:text-zinc-300 whitespace-nowrap tabular-nums">
          {done !== undefined && total !== undefined
            ? `${done}/${total}${hasFailed ? ` (失败 ${failed})` : ''}`
            : `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}
