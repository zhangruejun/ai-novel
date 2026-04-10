import re

with open('drafts/vol01/ch014_完整草稿.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 去除标题和分隔线
lines = content.split('\n')
body_lines = []
skip = True
for line in lines:
    stripped = line.strip()
    if stripped.startswith('#'):
        skip = True
        continue
    if stripped == '---':
        skip = False
        continue
    if stripped == '***':
        continue
    if not skip:
        body_lines.append(line)

body_text = '\n'.join(body_lines)

# 统计中文字符（包括标点）
chinese_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', body_text))

print(f'总字数（中文）：{chinese_chars}')
print(f'目标范围：2800-3200字')

is_ok = 2800 <= chinese_chars <= 3200
if is_ok:
    print(f'是否达标：是（实际{chinese_chars}字）')
else:
    print(f'是否达标：否（实际{chinese_chars}字）')
