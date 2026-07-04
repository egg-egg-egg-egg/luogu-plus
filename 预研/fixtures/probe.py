# -*- coding: utf-8 -*-
"""单次探测：了解匿名访问 user/1403058/practice 的基线响应特征。"""
import requests, time, re

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
url = "https://www.luogu.com.cn/user/1403058/practice"
s = requests.Session()
h = {"User-Agent": UA,
     "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
     "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}
t = time.time()
r = s.get(url, headers=h, timeout=10)
e = time.time() - t
if not r.encoding:
    r.encoding = "utf-8"
txt = r.text or ""
print("status:", r.status_code)
print("size:", len(r.content))
print("dur:", round(e, 3))
print("final_url:", r.url)
print("redirected:", r.url != url)
print("has __INITIAL_STATE__:", "__INITIAL_STATE__" in txt)
print("has feConfigVersion:", "__feConfigVersion" in txt)
# 提取 title
m = re.search(r"<title>(.*?)</title>", txt)
print("title:", m.group(1) if m else "(none)")
# 关键词检测（从文件读取，UTF-8 正确）
for kw in ["登录", "验证", "block", "拒绝", "频繁", "稍后", "限制",
           "captcha", "禁止", "访问", "密码", "login", "authenticate"]:
    print(f"kw {kw!r}:", kw in txt)
print("---HEADERS---")
for k, v in r.headers.items():
    print(f"  {k}: {v}")
print("---SNIPPET (first 1500 chars)---")
print(txt[:1500])
print("---LAST 800 chars---")
print(txt[-800:])
s.close()
