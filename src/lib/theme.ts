// 主题切换工具

export type Theme = 'light' | 'dark' | 'system';

/** 应用主题到 document 根元素（通过 dark class 控制 Tailwind 暗色模式） */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}
