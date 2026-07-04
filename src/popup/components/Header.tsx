// 顶部标题栏 + 设置按钮

import { memo } from 'react';

/** 打开管理页（options page） */
function handleOpenOptions() {
  chrome.runtime.openOptionsPage();
}

function HeaderBase() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-luogu-ac/90 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          洛
        </div>
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          洛谷老师助手
        </h1>
      </div>
      <button
        onClick={handleOpenOptions}
        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-all duration-200"
        title="打开管理页"
        aria-label="打开管理页"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </header>
  );
}

export const Header = memo(HeaderBase);
