#!/usr/bin/env python3
"""最终报告：从 lentille-context JSON 提取训练题目列表"""

import urllib.request
import http.cookiejar
import re
import json
import ssl
import gzip
from collections import Counter

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPRedirectHandler(),
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

PAGES = {
    "training": "https://www.luogu.com.cn/training/556",
    "problem":  "https://www.luogu.com.cn/problem/P17013",
}

def _decode_body(resp):
    body = resp.read()
    if resp.getheader('Content-Encoding') == 'gzip' or (body[:2] == b'\x1f\x8b'):
        body = gzip.decompress(body)
    return body.decode('utf-8')

def fetch(url):
    try:
        req = urllib.request.Request("https://www.luogu.com.cn/", headers=HEADERS)
        opener.open(req, timeout=15).read()
    except:
        pass
    req = urllib.request.Request(url, headers=HEADERS)
    resp = opener.open(req, timeout=15)
    return _decode_body(resp)


print("=" * 80)
print("洛谷页面 CSS 选择器 & DOM 结构报告")
print("=" * 80)

# ============ TRAINING PAGE ============
html = fetch(PAGES["training"])
print("\n\n### 页面 1: 题单页 (training/556)")
print("=" * 60)

# 提取 lentille-context JSON
script_match = re.search(r'<script id="lentille-context"[^>]*>\s*(\{.*?\})\s*</script>', html, re.DOTALL)
lt = json.loads(script_match.group(1))

# 分析 HTML DOM 结构
print("\n【HTML SSR DOM 结构】")
print("  根容器: <div id=\"app\">")
print("  唯一 class: .no-js (在 <html> 上)")
print("  题目列表结构: <ol> → <li> → <a href=\"/problem/PID\">")
print()

# 提取所有题目链接
problem_links = re.findall(r'<li><a href="(/problem/([^"]+))"[^>]*>(.*?)</a></li>', html)
print(f"  HTML 中题目链接数: {len(problem_links)}")
print("  格式示例:")
for href, pid, text in problem_links[:3]:
    print(f"    <a href=\"{href}\">  →  PID={pid},  text=\"{text.strip()}\"")

# 分析 JSON 数据
training = lt['data']['training']
problems = training['problems']
print(f"\n【JSON (lentille-context) 数据】")
print(f"  题单 ID: {training['id']}")
print(f"  题单名称: {training['name']}")
print(f"  题目数量: {training['problemCount']}")
print(f"  JSON 结构: data.training.problems[0].pid, .type, .name, .difficulty, .tags, ...")
print(f"  题目字段: {list(problems[0].keys())}")
print()
print("  数据示例:")
for p in problems[:3]:
    print(f"    {{pid: '{p['pid']}', type: '{p['type']}', name: '{p['name']}', "
          f"difficulty: {p['difficulty']}, tags: {p['tags']}}}")

# ============ PROBLEM PAGE ============
html = fetch(PAGES["problem"])
print("\n\n### 页面 2: 题目详情页 (problem/P17013)")
print("=" * 60)

script_match = re.search(r'<script id="lentille-context"[^>]*>\s*(\{.*?\})\s*</script>', html, re.DOTALL)
lt = json.loads(script_match.group(1))

# 分析 HTML DOM 结构
print("\n【HTML SSR DOM 结构】")
print("  根容器: <div id=\"app\">")
print("  唯一 class: .no-js (在 <html> 上)")
print("  内容容器: <article lang=\"zh-CN\">")
print("  区块结构:")
sections = re.findall(r'<h2>(.*?)</h2>', html)
for s in sections:
    print(f"    <section> → <h2>{s}</h2>")

print()
print("  HTML id 属性:")
for id_val in re.findall(r'id="([^"]+)"', html):
    print(f"    #{id_val}")

# 分析 JSON 数据
problem = lt['data']['problem']
print(f"\n【JSON (lentille-context) 数据】")
print(f"  题目 PID: {problem['pid']}")
print(f"  题目名称: {problem['name']}")
print(f"  难度: {problem['difficulty']}")
print(f"  JSON 路径: data.problem.pid, .type, .contenu.description, .contenu.formatI, .contenu.formatO, .contenu.hint, ...")
print(f"  顶层字段: {list(problem.keys())[:15]}")

# ============ 最终选择器方案 ============
print("\n\n" + "=" * 80)
print("最终选择器方案")
print("=" * 80)

print("""
【页面 1: 题单页 training/556】

  方案 A - JSON 数据提取（推荐，最可靠）:
    数据源: <script id="lentille-context" type="application/json">
    Python: json.loads(script.textContent)['data']['training']['problems']
    JS:     JSON.parse(document.getElementById('lentille-context').textContent)
             .data.training.problems
    题目 ID: problem.pid
    题目名:  problem.name

  方案 B - SSR DOM 选择器（用于 JS 内容脚本/querySelector）:
    每道题:  #app section ol > li
    题目链接:  #app section ol > li a[href^="/problem/"]
    ID 提取:  li.href.match(/\\/problem\\/(P\\d+|B\\d+)/)[1]
    
  方案 C - 链接正则（备用）:
    正则:    /href="\\/problem\\/([^"]+)"/g
    用法:    re.findall(r'/problem/(P\\d+|B\\d+)', html_text)

  方案 D - 洛谷官方 API（如有 auth）:
    https://www.luogu.com.cn/problem/list?type=P&page=1&_contentOnly=1

注意: 洛谷 SSR HTML 中无 CSS class（除 no-js），所有 CSS class 由 Vue/JS 运行时注入。
写入内容脚本时，上述 CSS 选择器在页面加载后有效，此时 Vue 已渲染 class。
但 SSR HTML 本身就完整，可直接解析 JSON。


【页面 2: 题目详情页 problem/PXXXXX】

  方案 A - JSON 数据提取（推荐）:
    数据源: <script id="lentille-context" type="application/json">
    JS:     JSON.parse(document.getElementById('lentille-context').textContent)
             .data.problem
    内容:    .contenu.description / .contenu.formatI / .contenu.formatO / .contenu.hint

  方案 B - SSR DOM 选择器:
    顶层容器:  #app article                (内容容器)
    标题:      #app article > h1            (题目标题)
    描述区块:  #app article section         (nth-of-type(1))
    输入区块:  #app article section         (nth-of-type(2))
    输出区块:  #app article section         (nth-of-type(3))
    提示区块:  #app article section         (nth-of-type(4))

  方案 C - 更精确的标题选择器:
    标题:      #app article h1
    区块标题:  #app article section h2
    区块内容:  #app article section > div

  方案 D - 洛谷官方 API:
    https://www.luogu.com.cn/problem/P17013?_contentOnly=1


【关键发现】

1. 洛谷是 Vue SSR + lentille-context JSON hydration 架构
2. SSR HTML 只有 1 个 CSS class: no-js (在 <html> 上)
3. 所有其他 class 由 Vue 运行时动态添加，SSR 时不输出 class
4. 最可靠的提取方式: 解析 <script id="lentille-context"> 中的 JSON
5. 训练页题目列表在 SSR HTML 中以 <ol> → <li> → <a> 呈现，无需 class
6. 题目详情页内容在 <noscript> 后面的 <article> 中，语义化 HTML
7. 训练页每个题目的链接格式: <a href="/problem/PID">，文本包含 PID 和题目名
""")
