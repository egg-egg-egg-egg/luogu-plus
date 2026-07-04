// 主题状态 hook
//
// 封装 theme 读取/写入/应用，对外暴露当前 theme 和 setTheme。
// theme 持久化到 IndexedDB meta 表（key='theme'），即时生效。

import { useEffect, useState, useCallback } from 'react';
import { applyTheme, type Theme } from '@/lib/theme';
import { getMeta, setMeta } from '@/db/schema';

const THEME_KEY = 'theme';
const DEFAULT_THEME: Theme = 'system';

/** 主题管理 hook */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getMeta<Theme>(THEME_KEY);
      if (cancelled) return;
      const t = stored ?? DEFAULT_THEME;
      setThemeState(t);
      applyTheme(t);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 监听系统主题变化（仅 system 模式生效）
  useEffect(() => {
    if (!loaded || theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, loaded]);

  const setTheme = useCallback(async (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    await setMeta<Theme>(THEME_KEY, t);
  }, []);

  return { theme, setTheme, loaded };
}
