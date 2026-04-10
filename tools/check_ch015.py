# -*- coding: utf-8 -*-
import re

with open('drafts/vol01/ch015_完整草稿.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 中文字符数
chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', content))
print(f'完整草稿总中文字数: {chinese_chars}')

# 按场景拆分
scenes = content.split('****')
for i, scene in enumerate(scenes, 1):
    scene_chars = len(re.findall(r'[\u4e00-\u9fff]', scene))
    print(f'  场景{i}中文字数: {scene_chars}')

# 禁用语检查
forbidden_words = [
    '然而', '与此同时', '值得注意的是', '不得不提', '嘴角勾起', '冷笑',
    '眼中闪过一丝精光', '眼中闪过一丝杀意', '他心中暗道', '倒吸一口凉气',
    '他心中一惊', '他心中一凛', '他感到一阵复杂的情绪涌上心头',
    '犹如', '宛如', '如同', '仿佛', '恐怖如斯', '狰狞', '令人胆寒',
    '快如闪电', '难解难分', '倒飞而出', '重重摔落', '喷出一口鲜血',
    '如遭雷击', '久久不语', '转身离去', '握紧了拳头', '却也不',
    '心中不禁', '一股', '宛如', '犹如', '仿佛', '似乎',
    '值得注意的是', '不得不提', '众所周知', '毫无疑问',
    '却说', '且说', '话说', '按下不表', '话分两头',
    '负手而立', '背负双手', '双手抱胸', '相视一笑',
    '快如闪电', '势如破竹', '摧枯拉朽', '难解难分', '难分难解',
]

print('\n禁用语检查结果:')
for word in forbidden_words:
    if word in content:
        # 找出行号
        lines = content.split('\n')
        for j, line in enumerate(lines, 1):
            if word in line:
                print(f'  发现: "{word}" 在第{j}行: {line.strip()[:80]}')

print('\n检查完成。')