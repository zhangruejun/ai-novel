import re

forbidden_words = [
    '然而', '与此同时', '值得注意的是', '不得不提', '众所周知',
    '毫无疑问', '显而易见', '毋庸置疑', '不言而喻',
    '嘴角勾起', '眼中闪过', '倒吸一口凉气', '他心中暗道',
    '他心中一惊', '他心中一凛', '他心中暗自',
    '月光如水', '阳光透过', '空气中弥漫着',
    '一股莫名的', '一股暖流', '一股清流', '一股寒意',
    '脸色微微一变', '脸色骤变', '眉头紧锁',
    '不置可否地', '意味深长地', '若有所思地',
    '犹如', '宛如', '仿佛',
    '他感到一阵复杂的情绪', '他的内心久久不能平静',
    'mixed',
]

files = [
    'drafts/vol01/ch014_场景1_草稿.md',
    'drafts/vol01/ch014_场景2_草稿.md',
    'drafts/vol01/ch014_场景3_草稿.md',
]

found_issues = False
for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for word in forbidden_words:
        if word in content:
            # Find line numbers
            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                if word in line:
                    print(f'[{filepath}:{i}] 发现禁用语: "{word}"')
                    print(f'  内容: {line.strip()}')
                    found_issues = True

if not found_issues:
    print('未发现禁用语，检查通过。')
else:
    print('\n存在禁用语，需要修改。')
