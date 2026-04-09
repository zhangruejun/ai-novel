#!/usr/bin/env python3
"""
《剑道通神》AI辅助写作自动化控制工具

通过代码强制执行7步写作流程，每步验证通过才能进入下一步。
"""

import json
import os
import re
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any

class ChapterWriter:
    """章节写作控制器，强制执行7步流程"""
    
    def __init__(self, config_path: str = "tools/config.json"):
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)
        self.state = self._load_state()
        self.forbidden_words = self._load_forbidden_words()
        self.character_cards = self._load_character_cards()
        self.foreshadowing = self._load_foreshadowing()
    
    def _load_state(self) -> Dict:
        state_path = "tools/state.json"
        if os.path.exists(state_path):
            with open(state_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"current_chapter": 5, "completed_steps": {}, "last_step": None}
    
    def _save_state(self):
        state_path = "tools/state.json"
        with open(state_path, 'w', encoding='utf-8') as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)
    
    def _load_forbidden_words(self) -> List[str]:
        words = []
        try:
            with open(self.config["forbidden_words_file"], 'r', encoding='utf-8') as f:
                content = f.read()
                # 提取代码块中的禁用词
                for match in re.finditer(r'```\n(.*?)```', content, re.DOTALL):
                    block = match.group(1)
                    words.extend([w.strip() for w in block.split('\n') if w.strip()])
        except FileNotFoundError:
            pass
        return words
    
    def _load_character_cards(self) -> str:
        try:
            with open(self.config["character_cards_file"], 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return ""
    
    def _load_foreshadowing(self) -> str:
        try:
            with open(self.config["foreshadowing_file"], 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return ""
    
    def _validate_outline(self, outline_path: str) -> Tuple[bool, List[str]]:
        """验证细纲是否符合标准"""
        errors = []
        try:
            with open(outline_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 检查场景数量
            scene_count = len(re.findall(r'### 场景[一二三四五六七八九十\d]+', content))
            if scene_count < self.config["min_scenes"]:
                errors.append(f"场景数量不足：{scene_count} < {self.config['min_scenes']}")
            if scene_count > self.config["max_scenes"]:
                errors.append(f"场景数量过多：{scene_count} > {self.config['max_scenes']}")
            
            # 检查必需字段
            required_fields = ['核心事件', '场景类型', '时间地点', '出场角色', '核心动作', '对话要点', '结尾钩子']
            for field in required_fields:
                if field not in content:
                    errors.append(f"缺少必需字段：{field}")
            
        except FileNotFoundError:
            errors.append(f"细纲文件不存在：{outline_path}")
        
        return len(errors) == 0, errors
    
    def _validate_prompt(self, prompt_path: str) -> Tuple[bool, List[str]]:
        """验证Prompt是否符合标准"""
        errors = []
        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            required_sections = ['前情提要', '当前状态摘要', '写作风格要求', '禁用语', '范围限制']
            for section in required_sections:
                if section not in content:
                    errors.append(f"缺少必需段落：{section}")
            
        except FileNotFoundError:
            errors.append(f"Prompt文件不存在：{prompt_path}")
        
        return len(errors) == 0, errors
    
    def _validate_draft(self, draft_path: str) -> Tuple[bool, List[str]]:
        """验证草稿是否符合标准"""
        errors = []
        try:
            with open(draft_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 字数检查
            word_count = len(re.findall(r'[\u4e00-\u9fff]', content))
            if word_count < self.config["min_words_per_scene"]:
                errors.append(f"字数不足：{word_count} < {self.config['min_words_per_scene']}")
            if word_count > self.config["max_words_per_scene"]:
                errors.append(f"字数过多：{word_count} > {self.config['max_words_per_scene']}")
            
            # 禁用词检查
            for word in self.forbidden_words[:20]:  # 只检查高频禁用词
                if word in content:
                    errors.append(f"包含禁用词：{word}")
        
        except FileNotFoundError:
            errors.append(f"草稿文件不存在：{draft_path}")
        
        return len(errors) == 0, errors
    
    def _validate_assembled(self, assembled_path: str) -> Tuple[bool, List[str]]:
        """验证拼接后的章节是否符合标准"""
        errors = []
        try:
            with open(assembled_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 总字数检查
            word_count = len(re.findall(r'[\u4e00-\u9fff]', content))
            if word_count < self.config["min_words_per_chapter"]:
                errors.append(f"总字数不足：{word_count} < {self.config['min_words_per_chapter']}")
            if word_count > self.config["max_words_per_chapter"]:
                errors.append(f"总字数过多：{word_count} > {self.config['max_words_per_chapter']}")
            
        except FileNotFoundError:
            errors.append(f"拼接文件不存在：{assembled_path}")
        
        return len(errors) == 0, errors
    
    def prepare(self, chapter: int) -> bool:
        """步骤1：准备工作"""
        print(f"=== 步骤1：准备工作（第{chapter:03d}章）===")
        
        # 读取角色状态卡
        print(f"✓ 已加载角色状态卡（{len(self.character_cards)} 字符）")
        
        # 读取伏笔追踪表
        print(f"✓ 已加载伏笔追踪表（{len(self.foreshadowing)} 字符）")
        
        # 检查前3章是否存在
        prev_chapters = []
        for i in range(max(1, chapter-3), chapter):
            chapter_files = list(Path(self.config["chapters_dir"]).glob(f"第{i:03d}章_*.md"))
            if chapter_files:
                prev_chapters.append(chapter_files[0].name)
        
        print(f"✓ 前3章定稿：{', '.join(prev_chapters) if prev_chapters else '无'}")
        
        # 保存状态
        self.state["current_chapter"] = chapter
        self.state["completed_steps"]["prepare"] = True
        self.state["last_step"] = "prepare"
        self._save_state()
        
        print("✅ 准备工作完成\n")
        return True
    
    def create_outline(self, chapter: int, core_event: str, scenes: List[Dict]) -> bool:
        """步骤2：制作章级细纲"""
        print(f"=== 步骤2：制作细纲（第{chapter:03d}章）===")
        
        outline_path = os.path.join(self.config["outlines_dir"], f"ch{chapter:03d}_细纲.md")
        
        # 生成细纲内容
        outline_content = self._generate_outline(chapter, core_event, scenes)
        
        with open(outline_path, 'w', encoding='utf-8') as f:
            f.write(outline_content)
        
        # 验证细纲
        valid, errors = self._validate_outline(outline_path)
        if not valid:
            print("❌ 细纲验证失败：")
            for error in errors:
                print(f"  - {error}")
            return False
        
        self.state["completed_steps"]["outline"] = True
        self.state["last_step"] = "outline"
        self._save_state()
        
        print(f"✅ 细纲已保存：{outline_path}")
        print(f"   场景数量：{len(scenes)}")
        print()
        return True
    
    def create_prompts(self, chapter: int) -> bool:
        """步骤3：生成场景Prompt"""
        print(f"=== 步骤3：生成Prompt（第{chapter:03d}章）===")
        
        # 读取细纲
        outline_path = os.path.join(self.config["outlines_dir"], f"ch{chapter:03d}_细纲.md")
        if not os.path.exists(outline_path):
            print(f"❌ 细纲不存在：{outline_path}")
            return False
        
        with open(outline_path, 'r', encoding='utf-8') as f:
            outline_content = f.read()
        
        # 提取场景信息
        scenes = re.findall(r'### 场景[一二三四五六七八九十\d]+[：:].*?(?=### 场景|## 结尾钩子|$)', outline_content, re.DOTALL)
        
        for i, scene in enumerate(scenes, 1):
            prompt_path = os.path.join(self.config["prompts_dir"], f"ch{chapter:03d}_场景{i}.md")
            
            # 生成Prompt内容
            prompt_content = self._generate_prompt(chapter, i, scene, outline_content)
            
            with open(prompt_path, 'w', encoding='utf-8') as f:
                f.write(prompt_content)
            
            # 验证Prompt
            valid, errors = self._validate_prompt(prompt_path)
            if not valid:
                print(f"❌ Prompt验证失败（场景{i}）：")
                for error in errors:
                    print(f"  - {error}")
                return False
            
            print(f"✓ Prompt已保存：{prompt_path}")
        
        self.state["completed_steps"]["prompts"] = True
        self.state["last_step"] = "prompts"
        self._save_state()
        
        print(f"✅ 共生成 {len(scenes)} 个Prompt文件\n")
        return True
    
    def generate_drafts(self, chapter: int) -> bool:
        """步骤4：AI生成草稿"""
        print(f"=== 步骤4：生成草稿（第{chapter:03d}章）===")
        print("⚠️ 此步骤需要调用AI模型，请使用以下方式之一：")
        print("  1. 手动调用AI生成每个场景的草稿")
        print("  2. 使用AI对话工具依次生成每个场景")
        print()
        
        # 读取Prompts
        prompt_files = list(Path(self.config["prompts_dir"]).glob(f"ch{chapter:03d}_场景*.md"))
        if not prompt_files:
            print(f"❌ 没有找到Prompt文件")
            return False
        
        for i, prompt_file in enumerate(sorted(prompt_files), 1):
            draft_path = os.path.join(self.config["drafts_dir"], f"ch{chapter:03d}_场景{i}_草稿.md")
            
            # 检查草稿是否已存在
            if os.path.exists(draft_path):
                print(f"✓ 草稿已存在：{draft_path}")
                # 验证草稿
                valid, errors = self._validate_draft(draft_path)
                if not valid:
                    print(f"❌ 草稿验证失败（场景{i}）：")
                    for error in errors:
                        print(f"  - {error}")
                    return False
            else:
                print(f"⚠️ 草稿未生成（场景{i}）：{draft_path}")
                return False
        
        self.state["completed_steps"]["drafts"] = True
        self.state["last_step"] = "drafts"
        self._save_state()
        
        print(f"✅ 共验证 {len(prompt_files)} 个草稿文件\n")
        return True
    
    def assemble_chapter(self, chapter: int) -> bool:
        """步骤5：拼接与初校"""
        print(f"=== 步骤5：拼接与初校（第{chapter:03d}章）===")
        
        # 读取所有草稿
        draft_files = list(Path(self.config["drafts_dir"]).glob(f"ch{chapter:03d}_场景*_草稿.md"))
        if not draft_files:
            print(f"❌ 没有找到草稿文件")
            return False
        
        assembled_content = []
        total_words = 0
        
        for i, draft_file in enumerate(sorted(draft_files), 1):
            with open(draft_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            assembled_content.append(content)
            word_count = len(re.findall(r'[\u4e00-\u9fff]', content))
            total_words += word_count
            print(f"✓ 场景{i}：{word_count} 字")
        
        # 拼接章节
        chapter_content = "\n\n".join(assembled_content)
        
        # 保存拼接文件
        assembled_path = os.path.join(self.config["drafts_dir"], f"ch{chapter:03d}_拼接初校.md")
        with open(assembled_path, 'w', encoding='utf-8') as f:
            f.write(chapter_content)
        
        # 验证拼接
        valid, errors = self._validate_assembled(assembled_path)
        if not valid:
            print("❌ 拼接验证失败：")
            for error in errors:
                print(f"  - {error}")
            return False
        
        self.state["completed_steps"]["assemble"] = True
        self.state["last_step"] = "assemble"
        self._save_state()
        
        print(f"✅ 拼接完成：{total_words} 字")
        print(f"   已保存：{assembled_path}\n")
        return True
    
    def review_chapter(self, chapter: int) -> bool:
        """步骤6：深度审校"""
        print(f"=== 步骤6：深度审校（第{chapter:03d}章）===")
        
        assembled_path = os.path.join(self.config["drafts_dir"], f"ch{chapter:03d}_拼接初校.md")
        if not os.path.exists(assembled_path):
            print(f"❌ 拼接文件不存在：{assembled_path}")
            return False
        
        with open(assembled_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 禁用词检查
        found_forbidden = []
        for word in self.forbidden_words:
            if word in content:
                found_forbidden.append(word)
        
        if found_forbidden:
            print(f"❌ 发现 {len(found_forbidden)} 个禁用词：")
            for word in found_forbidden[:10]:
                print(f"  - {word}")
            return False
        
        # 生成检查清单
        checklist_path = os.path.join(self.config["reviews_dir"], f"ch{chapter:03d}_检查清单.md")
        checklist_content = self._generate_checklist(chapter, content)
        
        with open(checklist_path, 'w', encoding='utf-8') as f:
            f.write(checklist_content)
        
        self.state["completed_steps"]["review"] = True
        self.state["last_step"] = "review"
        self._save_state()
        
        print("✅ 审校完成")
        print(f"   检查清单：{checklist_path}\n")
        return True
    
    def finalize_chapter(self, chapter: int, chapter_name: str) -> bool:
        """步骤7：保存定稿并更新状态"""
        print(f"=== 步骤7：保存定稿（第{chapter:03d}章）===")
        
        assembled_path = os.path.join(self.config["drafts_dir"], f"ch{chapter:03d}_拼接初校.md")
        if not os.path.exists(assembled_path):
            print(f"❌ 拼接文件不存在：{assembled_path}")
            return False
        
        with open(assembled_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 添加章节标题
        final_content = f"# 第{chapter:03d}章 {chapter_name}\n\n{content}"
        
        # 保存定稿
        final_path = os.path.join(self.config["chapters_dir"], f"第{chapter:03d}章_{chapter_name}.md")
        with open(final_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
        
        # 更新日志
        log_path = os.path.join(self.config["logs_dir"], "每日写作日志.md")
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f"- 第{chapter:03d}章：{chapter_name} ✅\n")
        
        self.state["completed_steps"]["finalize"] = True
        self.state["last_step"] = "finalize"
        self.state["current_chapter"] = chapter
        self._save_state()
        
        print(f"✅ 定稿已保存：{final_path}")
        print(f"   字数：{len(re.findall(r'[\u4e00-\u9fff]', content))}")
        print(f"   日志已更新\n")
        return True
    
    def write_chapter(self, chapter: int, chapter_name: str, core_event: str, scenes: List[Dict]) -> bool:
        """完整流程：写一章"""
        print(f"\n{'='*60}")
        print(f"开始写作：第{chapter:03d}章 {chapter_name}")
        print(f"{'='*60}\n")
        
        steps = [
            ("prepare", lambda: self.prepare(chapter)),
            ("outline", lambda: self.create_outline(chapter, core_event, scenes)),
            ("prompts", lambda: self.create_prompts(chapter)),
            ("drafts", lambda: self.generate_drafts(chapter)),
            ("assemble", lambda: self.assemble_chapter(chapter)),
            ("review", lambda: self.review_chapter(chapter)),
            ("finalize", lambda: self.finalize_chapter(chapter, chapter_name)),
        ]
        
        for step_name, step_func in steps:
            if step_name in self.state.get("completed_steps", {}) and self.state.get("last_step") == step_name:
                print(f"⏭️ 跳过已完成步骤：{step_name}\n")
                continue
            
            if not step_func():
                print(f"\n❌ 流程中止于：{step_name}")
                return False
        
        print(f"\n{'='*60}")
        print(f"✅ 第{chapter:03d}章写作完成！")
        print(f"{'='*60}\n")
        return True
    
    def get_status(self):
        """获取当前状态"""
        print("=== 项目状态 ===")
        print(f"当前章节：{self.state.get('current_chapter', 0)}")
        print(f"最后完成步骤：{self.state.get('last_step', '无')}")
        print(f"已完成步骤：{', '.join(self.state.get('completed_steps', {}).keys())}")
        
        # 列出已定稿章节
        chapters = list(Path(self.config["chapters_dir"]).glob("第*.md"))
        print(f"\n已定稿章节：{len(chapters)}")
        for ch in sorted(chapters)[:10]:
            print(f"  - {ch.name}")
        
        # 列出草稿
        drafts = list(Path(self.config["drafts_dir"]).glob("ch*_草稿.md"))
        print(f"\n草稿文件：{len(drafts)}")
        for d in sorted(drafts)[:10]:
            print(f"  - {d.name}")
    
    def _generate_outline(self, chapter: int, core_event: str, scenes: List[Dict]) -> str:
        """生成细纲内容"""
        scenes_md = []
        for i, scene in enumerate(scenes, 1):
            scene_md = f"""### 场景{i}：{scene.get('name', '')}
| 项目 | 内容 |
|------|------|
| 场景类型 | {scene.get('type', 'A')} |
| 时间地点 | {scene.get('location', '')} |
| 出场角色 | {scene.get('characters', '')} |
| 核心动作 | {scene.get('action', '')} |
| 对话要点 | {scene.get('dialogue', '')} |
| 过渡方式 | {scene.get('transition', '')} |
"""
            scenes_md.append(scene_md)
        
        return f"""# 第{chapter:03d}章：{core_event}

## 基本信息
| 项目 | 内容 |
|------|------|
| 所属卷 | 第1卷：穿越觉醒 |
| 章节序号 | 第{chapter:03d}章 |
| 字数目标 | 2800-3200字 |
| 场景数量 | {len(scenes)}个 |
| 场景类型 | {','.join([s.get('type', 'A') for s in scenes])} |

## 本章核心
- **核心事件**：{core_event}
- **情绪基调**：{scenes[0].get('mood', '紧张')}
- **核心冲突**：{scenes[0].get('conflict', '')}

## 场景拆分

{chr(10).join(scenes_md)}

## 结尾钩子
- **钩子类型**：悬念
- **具体内容**：{scenes[-1].get('hook', '')}
- **预期效果**：读者好奇后续发展
"""
    
    def _generate_prompt(self, chapter: int, scene_num: int, scene_content: str, outline_content: str) -> str:
        """生成Prompt内容"""
        return f"""# 第{chapter:03d}章 场景{scene_num} Prompt

## 前情提要
【上一章结尾】
（请填入上一章最后200-300字）

【当前状态摘要】
- 李长风：引气（初入），持断剑+锈剑，真气一缕
- 林婉儿：凡人（隐藏实力），穿越者身份隐藏中
- 当前位置：青州城外十里铺

【必须遵守的信息】
- 主角已觉醒真气一缕，但实力仍然很弱
- 系统面板已激活，但有异常（乱码扩散）
- 林婉儿手背有剑形纹路，身份可疑

---

## 章节信息
- 章名：第{chapter:03d}章
- 核心事件：{outline_content.split('**核心事件**：')[-1].split(chr(10))[0] if '**核心事件**：' in outline_content else ''}
- 情绪基调：紧张
- 字数要求：800-1200字

---

## 场景{scene_num}
{scene_content}

---

## 写作风格要求
- 战斗描写：突出剑道特色，强调策略而非数值
- 对话风格：符合角色性格，李长风冷静果断，林婉儿聪明缜密
- 环境描写：简洁有画面感，不要过度堆砌辞藻
- 节奏控制：张弛有度

## 禁用语
请参考references/禁用语列表.md，严禁使用以下词汇：
- 然而、与此同时、值得注意的是、不得不提
- 他感到一阵复杂的情绪涌上心头
- 嘴角勾起一抹微笑/冷笑
- 眼中闪过一丝精光/杀意
- 倒吸一口凉气
- 犹如/宛如/如同/仿佛（慎用）

## 范围限制
- 只写到场景描述的事件为止
- 不要添加大纲中没有的情节
- 不要推进感情线超过当前阶段
- 不要引入新角色（除非细纲中明确要求）
"""
    
    def _generate_checklist(self, chapter: int, content: str) -> str:
        """生成检查清单"""
        word_count = len(re.findall(r'[\u4e00-\u9fff]', content))
        return f"""# 第{chapter:03d}章 检查清单

## 基本信息
- 字数：{word_count}
- 禁用词检查：通过

## 角色一致性
- [ ] 角色名字正确
- [ ] 角色境界正确
- [ ] 角色状态正确
- [ ] 角色性格符合设定

## 剧情一致性
- [ ] 时间线正确
- [ ] 地点正确
- [ ] 前文物品/信息正确使用
- [ ] 与上一章衔接自然

## 语言质量
- [ ] 无禁用AI词汇
- [ ] 无现代用语
- [ ] 对话符合角色性格
- [ ] 无重复句式

## 节奏检查
- [ ] 有明确核心事件
- [ ] 场景转换自然
- [ ] 结尾有钩子

## 评分
- 剧情推进：__/15
- 角色塑造：__/15
- 对话质量：__/15
- 战斗描写：__/10
- 情感表达：__/10
- 节奏控制：__/10
- 结尾钩子：__/10
- 语言质量：__/10
- 一致性：__/5
- **总分：__/100**
"""


def main():
    parser = argparse.ArgumentParser(description='《剑道通神》AI辅助写作工具')
    subparsers = parser.add_subparsers(dest='command')
    
    # write 命令
    write_parser = subparsers.add_parser('write', help='写一章')
    write_parser.add_argument('--chapter', type=int, required=True, help='章节号')
    write_parser.add_argument('--name', type=str, required=True, help='章节名')
    write_parser.add_argument('--core-event', type=str, required=True, help='核心事件')
    
    # status 命令
    subparsers.add_parser('status', help='查看当前状态')
    
    # prepare 命令
    prepare_parser = subparsers.add_parser('prepare', help='准备工作')
    prepare_parser.add_argument('--chapter', type=int, required=True, help='章节号')
    
    args = parser.parse_args()
    
    writer = ChapterWriter()
    
    if args.command == 'status':
        writer.get_status()
    elif args.command == 'prepare':
        writer.prepare(args.chapter)
    elif args.command == 'write':
        # 默认场景配置
        default_scenes = [
            {
                'name': '场景一',
                'type': 'A',
                'location': '',
                'characters': '李长风',
                'action': '',
                'dialogue': '',
                'transition': '',
                'mood': '紧张',
                'conflict': '',
                'hook': ''
            }
        ]
        writer.write_chapter(args.chapter, args.name, args.core_event, default_scenes)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()