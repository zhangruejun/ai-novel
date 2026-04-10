# -*- coding: utf-8 -*-
"""统计第017章字数"""
import re

def count_ch017():
    with open(r'chapters\第017章_地下遗迹.md', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 去掉markdown标题标记
    text = re.sub(r'^# .*$', '', content, flags=re.MULTILINE)
    
    # 统计中文字符（汉字+中文标点）
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', text))
    
    # 统计总字符数（排除空白）
    total_chars = len(re.sub(r'\s+', '', text))
    
    # 统计各场景字数（通过空行分隔）
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    print(f"第017章 地下遗迹")
    print(f"="*40)
    print(f"中文字符数: {chinese_chars}")
    print(f"总字符数(排除空白): {total_chars}")
    print(f"段落数: {len(paragraphs)}")
    print(f"总行数: {len(content.splitlines())}")
    
    # 判断是否达到目标
    if 3000 <= chinese_chars <= 3700:
        print(f"\n✓ 字数达标！目标: 3000-3700字")
    else:
        print(f"\n✗ 字数未达标！目标: 3000-3700字")

if __name__ == '__main__':
    count_ch017()
