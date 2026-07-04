# -*- coding: utf-8 -*-
"""
抓取洛谷用户 practice 页面原始 HTML，用于后续 __INITIAL_STATE__ 解析。
不使用 WebFetch（会转 markdown 丢 script），直接用 requests。
"""
import sys
import json
import re
from pathlib import Path

import requests

URL = "https://www.luogu.com.cn/user/1403058/practice"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

FIXTURES_DIR = Path(r"D:/Workspace/workbuddy/luogu-plus/预研/fixtures")
RAW_HTML_PATH = FIXTURES_DIR / "practice-raw.html"
META_PATH = FIXTURES_DIR / "fetch-meta.json"

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def main() -> int:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[fetch] GET {URL}")
    # 不带 cookie，模拟未登录
    resp = requests.get(URL, headers=HEADERS, timeout=30, allow_redirects=True)
    print(f"[fetch] status={resp.status_code}")
    print(f"[fetch] final_url={resp.url}")
    print(f"[fetch] content-length={len(resp.content)} bytes")
    print(f"[fetch] content-type={resp.headers.get('content-type')}")
    print(f"[fetch] response headers:")
    for k, v in resp.headers.items():
        print(f"    {k}: {v}")

    # 保存原始 HTML（resp.text 已按 charset 解码）
    encoding = resp.encoding or "utf-8"
    print(f"[fetch] encoding={encoding}")
    text = resp.text
    RAW_HTML_PATH.write_text(text, encoding="utf-8")
    print(f"[fetch] saved raw html -> {RAW_HTML_PATH} ({len(text)} chars)")

    # 探测关键字段
    has_initial_state = "__INITIAL_STATE__" in text
    has_decoded = "decodeURIComponent" in text
    has_login_wall = any(kw in text for kw in ["登录后", "请登录", "sign in", "您未登录"])
    has_block = any(
        kw in text
        for kw in ["block", "风控", "验证", "captcha", "访问过于频繁"]
    )
    print(f"[probe] __INITIAL_STATE__ present: {has_initial_state}")
    print(f"[probe] decodeURIComponent wrapper: {has_decoded}")
    print(f"[probe] login-wall keyword: {has_login_wall}")
    print(f"[probe] block/captcha keyword: {has_block}")

    meta = {
        "url": URL,
        "final_url": resp.url,
        "status_code": resp.status_code,
        "encoding": encoding,
        "content_length_bytes": len(resp.content),
        "text_length_chars": len(text),
        "headers": dict(resp.headers),
        "cookies_received": [
            {"name": c.name, "domain": c.domain, "path": c.path}
            for c in resp.cookies
        ],
        "probe": {
            "has_initial_state": has_initial_state,
            "has_decodeURIComponent_wrapper": has_decoded,
            "has_login_wall_keyword": has_login_wall,
            "has_block_keyword": has_block,
        },
    }
    META_PATH.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[fetch] saved meta -> {META_PATH}")

    # 提前做一次 __INITIAL_STATE__ 提取尝试，便于在 fetch 阶段就发现问题
    if has_initial_state:
        try:
            state = extract_initial_state(text)
            STATE_PATH = FIXTURES_DIR / "practice-state.json"
            STATE_PATH.write_text(
                json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"[fetch] saved state -> {STATE_PATH}")
            # 顶层键
            print(f"[state] top-level keys: {list(state.keys())}")
        except Exception as e:
            print(f"[state] extract failed: {e!r}")

    return 0


# 复用：先实现一份提取函数，供后续脚本共用
def extract_initial_state(html: str):
    """
    洛谷 HTML 中的 __INITIAL_STATE__ 通常以两种形式出现：
      1) window.__INITIAL_STATE__ = decodeURIComponent("...");  (需要 URL decode)
      2) window.__INITIAL_STATE__ = {...};                       (直接 JSON)
    本函数兼容两种，并返回 dict。
    """
    # 模式 1：decodeURIComponent("...")
    m = re.search(
        r"window\.__INITIAL_STATE__\s*=\s*decodeURIComponent\(\s*['\"](.*?)['\"]\s*\)",
        html,
        re.DOTALL,
    )
    if m:
        from urllib.parse import unquote

        raw = unquote(m.group(1))
        return json.loads(raw)

    # 模式 2：直接对象
    m = re.search(
        r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script>",
        html,
        re.DOTALL,
    )
    if m:
        return json.loads(m.group(1))

    raise ValueError("无法定位 window.__INITIAL_STATE__")


if __name__ == "__main__":
    sys.exit(main())
