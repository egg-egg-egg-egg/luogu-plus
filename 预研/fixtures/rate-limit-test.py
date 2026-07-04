# -*- coding: utf-8 -*-
"""
洛谷未登录访问频率限制实测脚本
================================
目标：https://www.luogu.com.cn/user/1403058/practice

测试方案：
  第一轮：20 次请求，间隔 2 秒（模拟老师批量刷新 20 个学生 AC 记录）
  第二轮：20 次请求，间隔 3 秒（第一轮结束后至少等 5 分钟再开始）
  每次请求新建 requests.Session（清 cookie，模拟未登录）

每次记录：HTTP 状态码、响应大小、请求耗时、是否重定向、<title>、
         __INITIAL_STATE__ 是否存在、风控关键词命中、关键响应头。

风控判定（基线校准后）：
  - 状态码 != 200
  - 或 请求被重定向到非目标 URL
  - 或 命中强风控关键词（验证/block/拒绝/频繁/稍后/限制/captcha/禁止/forbidden/rate）
  - 或 响应大小偏离基线 > 30%（疑似被替换为拦截/验证页）

注：匿名访问基线响应不含 __INITIAL_STATE__（SPA 外壳），故 __INITIAL_STATE__ 缺失
    不作为风控触发条件，仅作为数据记录。

触发风控后：暂停 5 分钟，重试 1 次看是否恢复，然后停止本轮。
两轮之间：至少等 5 分钟。

结果输出：rate-limit-results.json（同目录），供生成报告。
"""

import json
import os
import re
import sys
import time
from datetime import datetime

import requests

# ---------------- 配置 ----------------
TARGET_URL = "https://www.luogu.com.cn/user/1403058/practice"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
TIMEOUT = 10
ROUND_COUNT = 20
ROUND1_INTERVAL = 2
ROUND2_INTERVAL = 3
RECOVERY_WAIT = 300  # 5 分钟
BETWEEN_ROUNDS_WAIT = 300  # 5 分钟

# 强风控关键词（命中任一即视为风控）
STRONG_KEYWORDS = [
    "验证", "block", "拒绝", "频繁", "稍后", "限制",
    "captcha", "禁止", "forbidden", "rate limit", "请稍", "请求过多",
]
# 参考关键词（仅记录，不触发）
REF_KEYWORDS = ["登录", "login", "访问"]

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def log(msg):
    """带时间戳的输出，立即刷新。"""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def make_request():
    """新建 Session 发起一次请求，返回结果字典。"""
    session = requests.Session()
    session.cookies.clear()
    start = time.time()
    result = {
        "timestamp": datetime.now().isoformat(),
        "status": None,
        "size": 0,
        "duration": 0.0,
        "redirected": False,
        "final_url": "",
        "title": "",
        "initial_state": False,
        "keywords_strong": [],
        "keywords_ref": [],
        "headers": {},
        "error": None,
        "snippet": "",
    }
    try:
        resp = session.get(
            TARGET_URL, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True
        )
        elapsed = time.time() - start
        if not resp.encoding:
            resp.encoding = "utf-8"
        text = resp.text or ""
        result["status"] = resp.status_code
        result["size"] = len(resp.content)
        result["duration"] = round(elapsed, 3)
        result["redirected"] = (resp.url != TARGET_URL)
        result["final_url"] = resp.url
        # title
        m = re.search(r"<title>(.*?)</title>", text, re.S)
        if m:
            result["title"] = m.group(1).strip()
        # __INITIAL_STATE__
        result["initial_state"] = "__INITIAL_STATE__" in text
        # 关键词
        result["keywords_strong"] = [kw for kw in STRONG_KEYWORDS if kw in text]
        result["keywords_ref"] = [kw for kw in REF_KEYWORDS if kw in text]
        # 关键响应头
        result["headers"] = {
            "Content-Type": resp.headers.get("Content-Type", ""),
            "Server": resp.headers.get("Server", ""),
            "CF-RAY": resp.headers.get("CF-RAY", ""),
            "X-Cache": resp.headers.get("X-Cache", ""),
            "X-Via": resp.headers.get("X-Via", ""),
            "luogu-serve-by": resp.headers.get("luogu-serve-by", ""),
            "Location": resp.headers.get("Location", ""),
            "Retry-After": resp.headers.get("Retry-After", ""),
        }
        # 响应片段（前 200 字符）
        result["snippet"] = text[:200].replace("\n", " ").replace("\r", " ")
    except requests.exceptions.Timeout:
        result["error"] = "timeout"
        result["duration"] = round(time.time() - start, 3)
    except requests.exceptions.ConnectionError as e:
        msg = str(e)
        result["error"] = f"connection_error: {msg[:120]}"
        result["duration"] = round(time.time() - start, 3)
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)[:120]}"
        result["duration"] = round(time.time() - start, 3)
    finally:
        session.close()
    return result


def is_rate_limited(result, baseline_size):
    """判断是否触发风控。"""
    if result.get("error"):
        return True
    if result.get("status") != 200:
        return True
    if result.get("redirected"):
        return True
    if result.get("keywords_strong"):
        return True
    # 响应大小偏离基线 > 30%
    if baseline_size and result.get("size"):
        ratio = abs(result["size"] - baseline_size) / baseline_size
        if ratio > 0.3:
            return True
    return False


def run_round(name, interval, count, baseline_size):
    """运行一轮测试。"""
    log(f"======== 开始{name}：{count}次请求，间隔{interval}s ========")
    results = []
    triggered = False
    trigger_index = None
    for i in range(1, count + 1):
        log(f"[{name}] 第{i}/{count}次请求...")
        r = make_request()
        results.append(r)
        limited = is_rate_limited(r, baseline_size)
        log(
            f"  -> status={r['status']} size={r['size']} dur={r['duration']}s "
            f"redir={r['redirected']} title={r['title'][:30]!r} "
            f"IS={r['initial_state']} strong_kw={r['keywords_strong']} "
            f"limited={limited}"
        )
        if r.get("error"):
            log(f"  !! error={r['error']}")
        if limited and not triggered:
            triggered = True
            trigger_index = i
            log(f"  !! 第{i}次触发风控，暂停{RECOVERY_WAIT}s后重试1次...")
            time.sleep(RECOVERY_WAIT)
            log(f"  -> 重试中...")
            retry = make_request()
            retry["retry_after_5min"] = True
            retry["retry_of"] = i
            results.append(retry)
            retry_limited = is_rate_limited(retry, baseline_size)
            log(
                f"  -> 重试结果：status={retry['status']} size={retry['size']} "
                f"dur={retry['duration']}s limited={retry_limited}"
            )
            if retry_limited:
                log(f"  !! 重试仍被风控，停止本轮")
            else:
                log(f"  -> 重试已恢复（但仍停止本轮，避免轰炸）")
            break  # 触发风控后停止本轮
        if i < count:
            time.sleep(interval)
    log(f"======== {name}结束 ========")
    if triggered:
        log(f"  触发风控：第{trigger_index}次")
    else:
        log(f"  未触发风控，完成全部{count}次")
    return {
        "name": name,
        "interval": interval,
        "count": count,
        "baseline_size": baseline_size,
        "results": results,
        "triggered": triggered,
        "trigger_index": trigger_index,
    }


def main():
    output = {
        "target": TARGET_URL,
        "user_agent": USER_AGENT,
        "timeout": TIMEOUT,
        "round1_interval": ROUND1_INTERVAL,
        "round2_interval": ROUND2_INTERVAL,
        "round_count": ROUND_COUNT,
        "start_time": datetime.now().isoformat(),
    }

    # ---- 建立基线（第 0 次探测，不计入两轮）----
    log("==== 建立基线 ====")
    baseline = make_request()
    baseline_size = baseline.get("size", 0) if baseline.get("status") == 200 else 0
    log(
        f"基线：status={baseline['status']} size={baseline['size']} "
        f"title={baseline['title']!r} IS={baseline['initial_state']} "
        f"strong_kw={baseline['keywords_strong']}"
    )
    output["baseline"] = baseline

    if baseline_size == 0:
        log("!! 基线请求失败，无法继续", )
        output["error"] = "baseline_failed"
        output["end_time"] = datetime.now().isoformat()
        _save(output)
        return

    # ---- 第一轮：2s 间隔 ----
    round1 = run_round("第一轮(2s)", ROUND1_INTERVAL, ROUND_COUNT, baseline_size)
    output["round1"] = round1

    # ---- 两轮之间至少等 5 分钟 ----
    log(f"==== 两轮之间等待{BETWEEN_ROUNDS_WAIT}s（{BETWEEN_ROUNDS_WAIT//60}分钟）====")
    time.sleep(BETWEEN_ROUNDS_WAIT)

    # ---- 第二轮：3s 间隔 ----
    # 若第一轮触发风控且重试仍失败，仍按任务进行第二轮（间隔3s）以对比；
    # 若第二轮也立即触发，则停止。
    round2 = run_round("第二轮(3s)", ROUND2_INTERVAL, ROUND_COUNT, baseline_size)
    output["round2"] = round2

    output["end_time"] = datetime.now().isoformat()
    _save(output)

    # ---- 摘要 ----
    log("=" * 50)
    log("摘要")
    log("=" * 50)
    log(f"第一轮(2s): 触发风控={round1['triggered']}, 触发时机={round1['trigger_index']}")
    log(f"第二轮(3s): 触发风控={round2['triggered']}, 触发时机={round2['trigger_index']}")


def _save(output):
    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "rate-limit-results.json"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    log(f"结果已保存：{out_path}")


if __name__ == "__main__":
    main()
