# -*- coding: utf-8 -*-
# 读取3个场景
with open('drafts/vol01/ch019_场景1_草稿.md', 'r', encoding='utf-8') as f:
    scene1 = f.read()
with open('drafts/vol01/ch019_场景2_草稿.md', 'r', encoding='utf-8') as f:
    scene2 = f.read()
with open('drafts/vol01/ch019_场景3_草稿.md', 'r', encoding='utf-8') as f:
    scene3 = f.read()

# 删除场景2开头的重复句
scene2 = scene2.replace('李长风转头看向林婉儿。\n\n', '', 1)

# 拼接
content = scene1 + '\n\n***\n\n' + scene2 + '\n\n***\n\n' + scene3

# 计算字数（粗略统计，排除空白、标点、符号）
import re
clean = re.sub(r'[\s\n\r#*\-—，。！？：；、""\'\"\"（）()\u2014\u2026\u00b7]', '', content)
char_count = len(clean)
print(f'总字数: {char_count}')

# 禁用词检查
forbidden = ['仿佛','似乎','感觉到','意识到','不知为何','莫名','一股','一丝','缓缓','渐渐','然而','与此同时','值得注意的是','不得不提','众所周知','毫无疑问','显而易见','毋庸置疑','不言而喻','可以说','换句话说','也就是说','总而言之','不仅如此','更重要的是','除此之外','反观','诚然','无独有偶','犹如','宛如','如同']
found = [w for w in forbidden if w in content]
if found:
    print(f'发现禁用词: {found}')
else:
    print('未发现禁用语')

# 保存
with open('drafts/vol01/ch019_完整草稿.md', 'w', encoding='utf-8') as f:
    f.write(content)
print('文件已保存')
