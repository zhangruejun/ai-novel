import re

f = open('drafts/vol01/ch020_完整草稿.md', 'r', encoding='utf-8')
content = f.read()
f.close()

# Split into 3 scenes
scenes = re.split(r'\n---\n', content)
scene_names = ['场景一：夜色行路', '场景二：途中露宿', '场景三：青州镇在望']

forbidden = ['仿佛', '似乎', '感觉到', '意识到', '不知为何', '莫名', '一股', '一丝', 
             '缓缓', '渐渐', '然而', '与此同时', '值得注意的是', '不得不提', '众所周知', 
             '毫无疑问', '显而易见', '毋庸置疑', '不言而喻', '可以说', '换句话说', 
             '也就是说', '总而言之', '不仅如此', '更重要的是', '除此之外', '反观', 
             '诚然', '无独有偶', '犹如', '宛如', '如同']

print('=' * 60)
print('第020章 拼接与初校检查报告')
print('=' * 60)

# Word count for each scene
print('\n--- 各场景字数统计 ---')
total_chars = 0
for i, scene in enumerate(scenes):
    # Remove all whitespace and punctuation
    chars = scene.replace('\n', '').replace('\r', '').replace(' ', '')
    # Remove all punctuation using regex
    chars = re.sub(r'[^\w]', '', chars, flags=re.UNICODE)
    # Remove markdown symbols
    chars = chars.replace('#', '').replace('-', '').replace('*', '')
    total_chars += len(chars)
    status = '合格' if 900 <= len(chars) <= 1100 else '不合格'
    print(f'{scene_names[i]}: {len(chars)}字 [{status}]')

print(f'\n总字数（不含标点空格）: {total_chars}')
status = '合格' if 2800 <= total_chars <= 3200 else '不合格'
print(f'目标范围 2800-3200: [{status}]')

# Forbidden words check
print('\n--- 禁用词检查 ---')
found_any = False
for w in forbidden:
    if w in content:
        lines = [i + 1 for i, line in enumerate(content.split('\n')) if w in line]
        print(f'发现禁用词 [{w}] 在第 {lines} 行')
        found_any = True
if not found_any:
    print('未发现禁用词 [合格]')

# Markdown format check
print('\n--- Markdown格式检查 ---')
checks = []
if content.startswith('# 第020章 青州镇在望'):
    checks.append(('主标题格式 # 第020章 青州镇在望', True))
else:
    checks.append(('主标题格式', False))

for name in scene_names:
    found = f'## {name}' in content
    checks.append((f'场景标题 ## {name}', found))

if '\n---\n' in content:
    checks.append(('分割线格式 ---', True))
else:
    checks.append(('分割线格式', False))

for name, status in checks:
    print(f'{name}: [{"合格" if status else "不合格"}]')

print('\n' + '=' * 60)
print('检查完成')
print('=' * 60)
