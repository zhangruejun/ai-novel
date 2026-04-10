import re

with open('drafts/vol01/ch013_审校定稿.md', 'r', encoding='utf-8') as f:
    content = f.read()

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

body_text = re.sub(r'\n\s*\*\*\*\s*\n', '\n', body_text)

chinese_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', body_text))

print(f'总字数（中文）：{chinese_chars}')
print(f'目标范围：2800-3200字')
if 2800 <= chinese_chars <= 3200:
    print('是否达标：是')
else:
    print('是否达标：否')
