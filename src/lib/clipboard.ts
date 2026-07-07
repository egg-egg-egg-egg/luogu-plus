// 剪贴板工具
//
// 优先使用 Clipboard API（扩展 popup 属于安全上下文 chrome-extension://），
// 失败时回退到 execCommand('copy')，保证在受限环境下仍可复制。

/**
 * 将文本复制到系统剪贴板。
 * @returns 复制是否成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 主方案：Clipboard API（需在安全上下文且接口可用）
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 落到回退方案
    }
  }

  // 回退方案：临时 textarea + execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // 移出视图但保持可聚焦/可选中
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
