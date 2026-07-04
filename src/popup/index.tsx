import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useSelectionStore } from '@/store/selection';
import '../styles/tailwind.css';

// ---- 暗色模式适配（跟随系统） ----
function applySystemTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', prefersDark);
}

applySystemTheme();
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', applySystemTheme);

// ---- 设置 body 宽度为 360px（规格 §3.5） ----
document.body.style.width = '360px';

// ---- 初始化选中状态 store（从 chrome.storage.local 恢复） ----
useSelectionStore.getState().hydrate();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
