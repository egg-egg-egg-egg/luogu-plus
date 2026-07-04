#!/usr/bin/env python3
"""深入分析洛谷 SSR HTML 中的 DOM 结构和 JSON 数据"""

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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
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

def fetch_page(url):
    print(f"\n【拉取: {url}】")
    try:
        req = urllib.request.Request("https://www.luogu.com.cn/", headers=HEADERS)
        resp = opener.open(req, timeout=15)
        _ = resp.read()
    except:
        pass
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        resp = opener.open(req, timeout=15)
        html = _decode_body(resp)
        print(f"  状态码: {resp.getcode()}, 长度: {len(html)}")
        print(f"  Cookies: {[c.name for c in cj]}")
        return html
    except Exception as e:
        print(f"  失败: {e}")
        return ""

def analyze_training(html):
    """分析 training 页面"""
    print("\n" + "="*80)
    print("【TRAINING 页面深度分析】")
    print("="*80)

    # 1. 看 HTML 头部结构
    print("\n--- HTML 前 200 行中有趣的内容 ---")
    lines = html.split('\n')
    for i, line in enumerate(lines[:300]):
        stripped = line.strip()
        if any(kw in stripped for kw in ['<div', '<a', '<li', '<tr', '<ul', '<table', '<section', '<article',
                                            '/problem/', 'class=', 'data-', '<meta', '<title', '<script',
                                            'lentille', '__NUXT__', '_pageContext']):
            snippet = stripped[:150]
            if len(stripped) > 150:
                snippet += "..."
            print(f"  L{i+1}: {snippet}")
        if i > 0 and i % 50 == 0:
            # 每 50 行输出一次进度
            pass

    # 2. 提取 JSON 数据
    print("\n--- 提取 JSON (lentille-context) ---")
    # 找所有 <script> 标签
    script_patterns = [
        (r'<script[^>]*>\s*window\._pageContext\s*=\s*(\{.*?\});?\s*(?:</script>|$)', "_pageContext"),
        (r'<script[^>]*>\s*window\.__NUXT__\s*=\s*(.*?);?\s*(?:</script>|$)', "__NUXT__"),
    ]
    
    all_scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    print(f"找到 {len(all_scripts)} 个 script 标签")

    # 找包含 JSON 的 script
    page_data = None
    for i, script in enumerate(all_scripts):
        script = script.strip()
        if len(script) > 500:
            # 可能包含 JSON
            if script.startswith('{'):
                try:
                    data = json.loads(script)
                    if 'data' in data and 'training' in data.get('data', {}):
                        page_data = data
                        print(f"在 script[{i}] 中找到 training 数据 (长度 {len(script)})")
                    elif 'data' in data and 'problem' in data.get('data', {}):
                        print(f"在 script[{i}] 中找到 problem 数据 (长度 {len(script)})")
                        page_data = data
                except:
                    pass

    # 3. 分析题目列表数据
    if page_data and 'data' in page_data and 'training' in page_data['data']:
        td = page_data['data']['training']
        print(f"\n--- 题单信息 ---")
        print(f"  ID: {td.get('id')}")
        print(f"  名称: {td.get('name')}")
        print(f"  类型: {td.get('type')}")
        print(f"  题目数: {td.get('problemCount')}")
        print(f"  收藏数: {td.get('markCount')}")
        print(f"  创建时间: {td.get('createTime')}")

        problems = td.get('problems', [])
        print(f"\n--- 题目列表（共 {len(problems)} 个）---")
        for i, p in enumerate(problems[:5]):
            print(f"  [{i+1}] pid={p.get('pid')}, name={p.get('name')}, type={p.get('type')}, "
                  f"difficulty={p.get('difficulty')}, tags={p.get('tags')}")
        if len(problems) > 5:
            print(f"  ... 省略 {len(problems)-5} 个")

    # 4. 分析 HTML 中题目链接的上下文
    print("\n--- /problem/ 链接的 HTML 上下文 ---")
    for m in re.finditer(r'(<a[^>]*href="([^"]*/problem/[^"]*)"[^>]*>)', html):
        a_tag = m.group(1)
        href = m.group(2)
        start = m.start()
        # 获取周围 200 字符的上下文
        ctx_start = max(0, start - 200)
        ctx_end = min(len(html), start + len(a_tag) + 200)
        context = html[ctx_start:ctx_end]
        # 提取父容器标签
        parent_search = html[max(0, start-500):start]
        # 提取 <div, <li, etc. 开标签
        parent_tags = re.findall(r'<(\w+)([^>]*)>', parent_search)
        if parent_tags:
            last_tag = parent_tags[-1]
            tag_name = last_tag[0]
            tag_attrs = last_tag[1]
            # 提取 class
            class_match = re.search(r'class="([^"]*)"', tag_attrs)
            tag_class = class_match.group(1) if class_match else '(无class)'
            # 提取 data 属性
            data_attrs = re.findall(r'(data-\w+)="([^"]*)"', tag_attrs)
            print(f"\n  链接: {href}")
            print(f"  父标签: <{tag_name}> class='{tag_class}'")
            if data_attrs:
                for da, dv in data_attrs[:5]:
                    print(f"    {da}='{dv}'")
            # 检查周围其他题目链接
            nearby_problems = re.findall(r'<a[^>]*href="([^"]*/problem/P\d+)"[^>]*>(.*?)</a>', context)
            if len(nearby_problems) > 1:
                print(f"  周围附近的题目链接: {nearby_problems[:5]}")
            # a 标签全文
            print(f"  <a> 全文: {a_tag[:200]}")

    # 5. 寻找包含 /problem/ 链接的列表容器
    print("\n--- 寻找包含题目链接的列表结构 ---")
    # 找出所有 /problem/ 链接的位置
    problem_positions = [(m.start(), m.end(), m.group(1))
                         for m in re.finditer(r'<a[^>]*href="([^"]*/problem/[^"]*)"[^>]*>', html)]

    if problem_positions:
        # 看第一组题目链接周围的 HTML
        first_start = problem_positions[0][0]
        first_end = problem_positions[-1][1]
        # 向左右扩展 300 字符找外层容器
        container_start = max(0, first_start - 300)
        container_end = min(len(html), first_end + 300)
        container_html = html[container_start:container_end]

        print(f"第一题到最后一题的 HTML 范围: {first_start}~{first_end}")
        print(f"扩展后的容器 HTML:")
        # 格式化输出，只显示标签
        tags = re.findall(r'</?\w+[^>]*>', container_html)
        indent = 0
        for tag in tags:
            is_closing = tag.startswith('</')
            is_self_closing = tag.endswith('/>')
            if is_closing:
                indent -= 1
            tag_short = tag[:120]
            print(f"  {'  '*max(0,indent)}{tag_short}")
            if not is_closing and not is_self_closing:
                indent += 1


def analyze_problem(html):
    """分析 problem 页面"""
    print("\n" + "="*80)
    print("【PROBLEM 页面深度分析】")
    print("="*80)

    # 1. 提取 JSON 数据
    print("\n--- 提取 JSON 数据 ---")
    all_scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)

    page_data = None
    for i, script in enumerate(all_scripts):
        script = script.strip()
        if len(script) > 500:
            if script.startswith('{'):
                try:
                    data = json.loads(script)
                    if 'data' in data and 'problem' in data.get('data', {}):
                        page_data = data
                        print(f"在 script[{i}] 中找到 problem 数据")
                        break
                except:
                    pass

    if page_data:
        pd = page_data['data']['problem']
        print(f"\n--- 题目信息 ---")
        print(f"  PID: {pd.get('pid')}")
        print(f"  名称: {pd.get('name')}")
        print(f"  难度: {pd.get('difficulty')}")
        print(f"  提交: {pd.get('totalSubmit')}")
        print(f"  通过: {pd.get('totalAccepted')}")
        print(f"  标签: {pd.get('tags')}")
        print(f"  作者: {pd.get('provider', {}).get('name')}")

        content = pd.get('contenu') or pd.get('content', {})
        if content:
            print(f"\n  题目内容字段: {list(content.keys())}")
            desc = content.get('description', '')[:200]
            print(f"  description 预览: {desc}")

    # 2. 看 HTML 中主体内容的容器
    print("\n--- HTML 标签结构（前 200 行） ---")
    lines = html.split('\n')
    for i, line in enumerate(lines[:250]):
        stripped = line.strip()
        if stripped and ('<' in stripped or 'class=' in stripped or 'data-' in stripped or '/problem/' in stripped):
            snippet = stripped[:150]
            print(f"  L{i+1}: {snippet}")

    # 3. 找 id 属性
    ids = re.findall(r'id="([^"]*)"', html)
    if ids:
        id_counter = Counter(ids)
        print(f"\n--- HTML id 属性（前 20）---")
        for id_val, cnt in id_counter.most_common(20):
            print(f"  id='{id_val}' x{cnt}")

    # 4. 找容器标签结构
    print("\n--- 页面根标签结构 ---")
    # 找 <body> 内的直接子元素
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
    if body_match:
        body_html = body_match.group(1)
        # 第一层子标签
        top_tags = re.findall(r'<(\w+)([^>]*)>', body_html[:5000])
        for tag, attrs in top_tags:
            id_match = re.search(r'id="([^"]*)"', attrs)
            class_match = re.search(r'class="([^"]*)"', attrs)
            id_val = id_match.group(1) if id_match else ''
            class_val = class_match.group(1) if class_match else ''
            print(f"  <{tag}> id='{id_val}' class='{class_val}'")


def main():
    for name, url in PAGES.items():
        html = fetch_page(url)
        if not html:
            continue
        if name == "training":
            analyze_training(html)
        else:
            analyze_problem(html)

    print("\n\n" + "="*80)
    print("【最终结论】")
    print("="*80)

if __name__ == "__main__":
    main()
