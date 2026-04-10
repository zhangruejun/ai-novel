# -*- coding: utf-8 -*-
import os

forbidden = ['仿佛','似乎','感觉到','意识到','不知为何','莫名','一股','一丝','缓缓','渐渐','然而','与此同时','值得注意的是','不得不提','众所周知','毫无疑问','显而易见','毋庸置疑','不言而喻','可以说','换句话说','也就是说','总而言之','不仅如此','更重要的是','除此之外','反观','诚然','无独有偶','犹如','宛如','如同']

total = 0
for i in range(1, 4):
    fname = f'drafts/vol01/ch020_场景{i}_草稿.md'
    with open(fname, 'r', encoding='utf-8') as f:
        text = f.read()
    chars = len(text.replace('\n','').replace('\r','').replace(' ','').replace('#','').replace('-','').replace('*','').replace('—','').replace('.','').replace(',','').replace('"','').replace("'",'').replace('、','').replace('，','').replace('。','').replace('！','').replace('？','').replace('：','').replace('；','').replace('（','').replace('）','').replace('—','').replace('…','').replace('"','').replace('"','').replace('「','').replace('」','').replace('『','').replace('』','').replace('〔','').replace('〕','').replace('【','').replace('】','').replace('《','').replace('》','').replace('〈','').replace('〉','').replace('〉','').replace('（','').replace('）','').replace('｛','').replace('｝','').replace('［','').replace('］','').replace('〈','').replace('〉','').replace('～','').replace('·',''))
    total += chars
    found = [w for w in forbidden if w in text]
    if found:
        print(f'场景{i}: {chars}字, 发现禁用词: {found}')
    else:
        print(f'场景{i}: {chars}字, 禁用词: 无')

print(f'总字数: {total}')
if total >= 2800 and total <= 3200:
    print('总字数在目标范围内(2800-3200)')
elif total < 2800:
    print(f'总字数不足目标下限，还差{2800-total}字')
else:
    print(f'总字数超出目标上限，多出{total-3200}字')
