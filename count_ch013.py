import re

with open('drafts/vol01/ch013_完整草稿.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 提取正文（跳过标题和第一个---）
lines = content.split('\n')
body_start = None
body_end = None
for i, line in enumerate(lines):
    if line.strip() == '---':
        if body_start is None:
            body_start = i + 1
        else:
            body_end = i

if body_end is None:
    body_text = '\n'.join(lines[body_start:])
else:
    body_text = '\n'.join(lines[body_start:body_end])

# 统计中文字符
chinese_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', body_text))

print(f'总字数：{chinese_chars}')
print(f'是否达标：{"是" if 2800 <= chinese_chars <= 3200 else "否"}')
