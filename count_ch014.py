import re

files = [
    ('drafts/vol01/ch014_场景1_草稿.md', 900, 1000),
    ('drafts/vol01/ch014_场景2_草稿.md', 1000, 1100),
    ('drafts/vol01/ch014_场景3_草稿.md', 800, 1000),
]

total = 0
for filepath, min_words, max_words in files:
    with open(filepath, 'r', encoding='utf-8') as f:
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
    
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', body_text))
    total += chinese_chars
    
    if min_words <= chinese_chars <= max_words:
        status = '达标'
    else:
        status = '不达标'
    print(f'{filepath}: {chinese_chars}字 (目标:{min_words}-{max_words}) [{status}]')

if 2800 <= total <= 3200:
    total_status = '达标'
else:
    total_status = '不达标'
print(f'\n总计: {total}字 (目标:2800-3200) [{total_status}]')
