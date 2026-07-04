// 关于 Tab
//
// 功能：
// - 版本号（从 manifest 读）
// - 项目说明
// - 隐私政策摘要（数据仅本地存储，不上传）
// - 开源地址（占位）

import { useEffect, useState } from 'react';

/** 从 manifest 读取版本号 */
function useExtensionInfo() {
  const [info, setInfo] = useState<{ version: string; name: string; description: string }>({
    version: '0.0.0',
    name: '',
    description: '',
  });

  useEffect(() => {
    try {
      const manifest = chrome.runtime.getManifest();
      setInfo({
        version: manifest.version ?? '0.0.0',
        name: manifest.name ?? '',
        description: manifest.description ?? '',
      });
    } catch (e) {
      console.error('读取 manifest 失败', e);
    }
  }, []);

  return info;
}

export function AboutTab() {
  const info = useExtensionInfo();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">关于</h2>
      </div>

      {/* 应用信息 */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-luogu-ac to-green-600 flex items-center justify-center shadow-lg shrink-0">
            <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold">{info.name}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              版本 <span className="font-mono">v{info.version}</span>
            </p>
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-4 leading-relaxed">
          {info.description}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-3 leading-relaxed">
          帮信息学老师维护学生和班级，一键拉取学生 AC 记录到本地缓存。在洛谷题目列表和详情页自动标注哪些题"已被 AC"，避免布置到学生已经做过的题。
        </p>
      </div>

      {/* 隐私政策摘要 */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-luogu-ac" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 className="text-base font-semibold">隐私政策</h3>
        </div>
        <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
          <li className="flex gap-2">
            <span className="text-luogu-ac mt-0.5">•</span>
            <span><strong>数据仅本地存储</strong>：所有学生、班级、AC 记录仅保存在浏览器 IndexedDB，不上传任何服务器。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-luogu-ac mt-0.5">•</span>
            <span><strong>不收集个人信息</strong>：扩展不向开发者发送任何数据。诊断日志仅本地保存，可随时导出或清空。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-luogu-ac mt-0.5">•</span>
            <span><strong>未成年人保护</strong>：学生备注名可留空或使用化名；卸载扩展时本地数据自动清除。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-luogu-ac mt-0.5">•</span>
            <span><strong>访问范围</strong>：仅在洛谷（www.luogu.com.cn）页面注入内容脚本，不访问其他网站。</span>
          </li>
        </ul>
      </div>

      {/* 开源地址（占位） */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-luogu-ac" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <h3 className="text-base font-semibold">开源与反馈</h3>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
          本项目开源，欢迎社区贡献。如遇问题或建议，请通过 issue 反馈。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="https://cnb.cool/codebuddy/codebuddy-code/-/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M7.414 15.414a2 2 0 11-2.828-2.828l3-3a2 2 0 012.828 0 1 1 0 001.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5z" clipRule="evenodd" />
            </svg>
            提交 Issue
          </a>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            仓库地址：待公开
          </span>
        </div>
      </div>

      {/* 合规提示 */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4">
        <div className="flex gap-2">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">使用须知</p>
            <p className="mt-1 leading-relaxed">
              本扩展通过自动化请求洛谷用户页面获取 AC 记录。使用者需自行承担洛谷封号风险。默认 2 秒请求间隔为保守值，如需进一步降低风险可在「设置」中调至 5 秒。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
