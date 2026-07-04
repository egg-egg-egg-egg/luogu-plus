// 设置 Tab
//
// 功能：
// - 请求间隔配置（1000-5000ms，默认 2000）→ setMeta('requestInterval', value)
// - 缓存过期阈值（1-30 天，默认 7）→ setMeta('staleThresholdDays', value)
// - 主题切换：浅色/深色/跟随系统
// - 导出诊断日志：db.logs.toArray() 导出 JSON
// - 清除所有数据（危险操作，二次确认 + 输入"确认删除"）→ db.delete()

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useTheme } from './use-theme';
import { db, getMeta, setMeta } from '@/db/schema';
import type { Theme } from '@/lib/theme';

/** 配置项元数据 key */
const META_REQUEST_INTERVAL = 'requestInterval';
const META_STALE_THRESHOLD = 'staleThresholdDays';

/** 默认值 */
const DEFAULT_REQUEST_INTERVAL = 2000;
const DEFAULT_STALE_DAYS = 7;

export function SettingsTab() {
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  const [requestInterval, setRequestInterval] = useState(DEFAULT_REQUEST_INTERVAL);
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS);
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 清空数据确认弹窗
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // 初始加载
  useEffect(() => {
    void (async () => {
      try {
        const [interval, days] = await Promise.all([
          getMeta<number>(META_REQUEST_INTERVAL),
          getMeta<number>(META_STALE_THRESHOLD),
        ]);
        if (typeof interval === 'number') setRequestInterval(interval);
        if (typeof days === 'number') setStaleDays(days);
      } catch (e) {
        console.error('加载配置失败', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /** 保存请求间隔 */
  const handleSaveInterval = useCallback(
    async (value: number) => {
      setSavingKey(META_REQUEST_INTERVAL);
      try {
        await setMeta(META_REQUEST_INTERVAL, value);
        setRequestInterval(value);
        toast.success(`请求间隔已设为 ${value} ms`);
      } catch (e) {
        toast.error('保存失败');
        console.error(e);
      } finally {
        setSavingKey(null);
      }
    },
    [toast],
  );

  /** 保存过期阈值 */
  const handleSaveStaleDays = useCallback(
    async (value: number) => {
      setSavingKey(META_STALE_THRESHOLD);
      try {
        await setMeta(META_STALE_THRESHOLD, value);
        setStaleDays(value);
        toast.success(`过期阈值已设为 ${value} 天`);
      } catch (e) {
        toast.error('保存失败');
        console.error(e);
      } finally {
        setSavingKey(null);
      }
    },
    [toast],
  );

  /** 导出诊断日志 */
  const handleExportLogs = useCallback(async () => {
    setExporting(true);
    try {
      const logs = await db.logs.toArray();
      const meta = {
        exportedAt: new Date().toISOString(),
        logCount: logs.length,
        extensionVersion: chrome.runtime.getManifest().version,
      };
      const payload = JSON.stringify({ meta, logs }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `luogu-plus-logs-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${logs.length} 条日志`);
    } catch (e) {
      toast.error('导出失败');
      console.error(e);
    } finally {
      setExporting(false);
    }
  }, [toast]);

  /** 清空所有数据 */
  const handleConfirmClear = useCallback(async () => {
    try {
      await db.delete();
      toast.success('已清空所有本地数据');
      setConfirmClearOpen(false);
      // 重置表单到默认值
      setRequestInterval(DEFAULT_REQUEST_INTERVAL);
      setStaleDays(DEFAULT_STALE_DAYS);
      // 刷新页面以确保所有 UI 状态归零
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error('清空失败');
      console.error(e);
    }
  }, [toast]);

  if (!loaded) {
    return <div className="py-8 text-sm text-zinc-500">加载中…</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          调整请求频率、缓存策略与外观。
        </p>
      </div>

      {/* 请求间隔 */}
      <SettingCard
        title="请求间隔"
        description="班级批量更新时，每两个学生之间的请求间隔。默认 2000 ms，范围 1000-5000 ms。"
      >
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1000}
            max={5000}
            step={500}
            value={requestInterval}
            onChange={(e) => setRequestInterval(parseInt(e.target.value, 10))}
            className="flex-1 accent-luogu-ac"
          />
          <span className="font-mono text-sm w-20 text-right tabular-nums">
            {requestInterval} ms
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={savingKey === META_REQUEST_INTERVAL}
            onClick={() => handleSaveInterval(requestInterval)}
          >
            保存
          </Button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
          间隔越长越安全（不易触发风控），但更新班级耗时也越长。20 人 × 2s ≈ 40s。
        </p>
      </SettingCard>

      {/* 缓存过期阈值 */}
      <SettingCard
        title="缓存过期阈值"
        description={'学生 AC 记录超过该天数视为"过期"，徽章会褪色提示。默认 7 天，范围 1-30 天。'}
      >
        <div className="flex items-center gap-4">
          <input
            type="number"
            min={1}
            max={30}
            value={staleDays}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setStaleDays(Math.max(1, Math.min(30, v)));
            }}
            className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-luogu-ac/40"
          />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">天</span>
          <Button
            size="sm"
            variant="secondary"
            loading={savingKey === META_STALE_THRESHOLD}
            onClick={() => handleSaveStaleDays(staleDays)}
          >
            保存
          </Button>
        </div>
      </SettingCard>

      {/* 主题切换 */}
      <SettingCard
        title="主题"
        description="选择浅色 / 深色 / 跟随系统。"
      >
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => {
            const labels: Record<Theme, string> = {
              light: '浅色',
              dark: '深色',
              system: '跟随系统',
            };
            const active = theme === t;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-luogu-ac text-white shadow-md'
                    : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700',
                ].join(' ')}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>
      </SettingCard>

      {/* 导出诊断日志 */}
      <SettingCard
        title="诊断日志"
        description="导出本地诊断日志为 JSON 文件。日志仅保存在本地，不会上传。"
      >
        <Button variant="secondary" loading={exporting} onClick={handleExportLogs}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出诊断日志
        </Button>
      </SettingCard>

      {/* 危险区：清空数据 */}
      <SettingCard
        title="危险区"
        description="清空所有本地数据（学生、班级、AC 记录、设置等），不可恢复。"
        danger
      >
        <Button variant="danger" onClick={() => setConfirmClearOpen(true)}>
          清空所有数据
        </Button>
      </SettingCard>

      {/* 二次确认（需输入"确认删除"） */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="清空所有数据"
        message="此操作将删除本地 IndexedDB 中的全部数据，包括学生、班级、AC 记录和设置。操作不可恢复。"
        confirmText="清空数据"
        danger
        confirmPrompt="确认删除"
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}

/** 设置卡片容器 */
function SettingCard({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-2xl border bg-white dark:bg-zinc-900 p-5 shadow-sm',
        danger
          ? 'border-red-200 dark:border-red-900/50'
          : 'border-zinc-200 dark:border-zinc-800',
      ].join(' ')}
    >
      <h3 className={['text-base font-semibold mb-1', danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'].join(' ')}>
        {title}
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">{description}</p>
      {children}
    </div>
  );
}
