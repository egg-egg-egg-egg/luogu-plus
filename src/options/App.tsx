// 主应用组件
import { useEffect, useState } from 'react';
import { ToastProvider } from '@/components/Toast';
import { useTheme } from './use-theme';
import { StudentsTab } from './students-tab';
import { ClassesTab } from './classes-tab';
import { SettingsTab } from './settings-tab';
import { AboutTab } from './about-tab';
import { useSelectionStore } from '@/store/selection';

/** Tab 类型 */
type TabId = 'students' | 'classes' | 'settings' | 'about';

/** Tab 配置 */
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'students',
    label: '学生',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'classes',
    label: '班级',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: '设置',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: '关于',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('students');
  const { theme, setTheme, loaded } = useTheme();

  // 首次加载时从 storage 同步选中状态
  const hydrateSelection = useSelectionStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSelection();
  }, [hydrateSelection]);

  if (!loaded) {
    // 主题加载中：空白避免闪烁
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900" />
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100">
        {/* 顶部导航栏 */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            {/* Logo + 标题 */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-luogu-ac to-green-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  洛谷老师助手
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">管理面板</p>
              </div>
            </div>

            {/* 主题切换按钮 */}
            <ThemeToggle theme={theme} onThemeChange={setTheme} />
          </div>

          {/* Tab 导航 */}
          <div className="max-w-6xl mx-auto px-6">
            <nav className="flex gap-1 -mb-px" role="tablist">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                      active
                        ? 'border-luogu-ac text-luogu-ac'
                        : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700',
                    ].join(' ')}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        {/* 内容区 */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {activeTab === 'students' && <StudentsTab />}
          {activeTab === 'classes' && <ClassesTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'about' && <AboutTab />}
        </main>
      </div>
    </ToastProvider>
  );
}

/** 主题切换按钮：浅色/深色/跟随系统 三态循环 */
function ThemeToggle({
  theme,
  onThemeChange,
}: {
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (t: 'light' | 'dark' | 'system') => void;
}) {
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const label = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统';

  return (
    <button
      onClick={() => onThemeChange(next)}
      title={`当前：${label}（点击切换）`}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {theme === 'light' && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
      {theme === 'dark' && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {theme === 'system' && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
