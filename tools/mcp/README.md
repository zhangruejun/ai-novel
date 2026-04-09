# 《剑道通神》MCP服务使用指南 (v4.0 - 状态追踪版)

## 设计理念

**AI主动补偿 + 状态强制追踪 + 会话级编排**：
- AI不再只是被动接收指令，而是主动参与草稿生成、审校修改、状态更新
- **角色状态和境界变更强制记录**：每章完成后必须确认是否有状态变更
- 每个章节写作是一个独立会话(session)
- 流程强制顺序执行，防止跳步
- 每章完成后自动归档会话状态

## ⚠️ 核心安全机制：状态追踪

### 为什么需要状态追踪？

在修仙/仙侠小说中，**角色境界、持有物品、当前位置**是核心设定。如果写错：
- 角色境界跳跃（凡人→化神）→ 战力崩坏
- 物品凭空消失/出现 → 逻辑漏洞
- 角色在A地却出现在B地 → 剧情bug

**v4.0 通过三重机制防止这些问题**：

### 1. 写作前验证：`validate_state_consistency`
- 解析角色状态卡中的当前境界、位置、持有物品
- 对照力量体系验证境界合法性
- 检查细纲中的出场角色是否与状态卡冲突（如"未出场"角色被安排出场）
- 输出验证报告，AI必须确认后才能继续

### 2. 写作后确认：`finalize_chapter` 强制确认
- **即使本章没有任何状态变更，也必须明确确认**
- 角色状态：要么提供变更详情，要么确认"本章无变更"
- 伏笔处理：要么提供处理记录，要么确认"本章无伏笔"
- 未提供任何确认时，输出⚠️警告提醒可能的遗漏

### 3. 自动提取+主动更新：`update_references`
- 如果AI没有提供变更信息，尝试从章节内容中自动提取（正则匹配）
- 支持结构化更新：角色名+属性+旧值+新值
- 伏笔支持3种操作：plant(埋设)、echo(呼应)、resolve(回收)

### 使用示例

```
# 步骤A：写作前验证
validate_state_consistency(chapter=6)
→ 输出：李长风当前境界=凡人(引气感应)，位置=青州城外
→ 确认无误后开始写作

# 步骤B：写作后更新（推荐）
update_references(
  chapter=6,
  chapter_content="完整章节内容",
  character_updates=[
    {"character": "李长风", "attribute": "当前境界", "old_value": "凡人", "new_value": "引气期"}
  ],
  foreshadowing_updates=[
    {"id": "F008", "action": "plant", "description": "神秘老人的身份线索"}
  ]
)

# 步骤C：定稿（强制确认）
finalize_chapter(
  chapter=6,
  chapter_name="山路遇险",
  final_content="完整内容",
  quality_score=85,
  character_updates="李长风当前境界更新为引气期",  # 必填！
  foreshadowing_updates="埋设F008：神秘老人的身份线索"  # 必填！
)
```

**如果没有变更**：
```
finalize_chapter(
  chapter=6,
  chapter_name="平静的一天",
  final_content="完整内容",
  quality_score=85,
  character_updates="本章无角色状态变更",  # 确认无变更
  foreshadowing_updates="本章无伏笔处理"   # 确认无伏笔
)
```

## v3.0 核心改进

### 1. 草稿生成：从"被动等待"到"逐步引导"

**v2.0问题**：一次性返回所有场景Prompt，AI容易混淆或跳过某些场景。

**v3.0方案**：
- `generate_drafts` 只返回**场景1**的Prompt
- AI生成场景1草稿 → 调用 `save_draft` 保存
- 调用 `get_next_prompt` 获取场景2的Prompt → 重复
- 直到所有场景完成，系统自动提示调用 `assemble_chapter`

### 2. 审校修改：从"只检查不修改"到"主动修改+提取信息"

**v2.0问题**：AI审校后只是"看看"，finalize时可能忘记提供修改后的内容。

**v3.0方案**：
- `review_chapter` 要求AI**直接修改内容**
- 同时提取"角色状态变更"和"伏笔处理记录"
- finalize时必须提供 `final_content` + 更新信息

### 3. 状态更新：从"依赖AI主动提供"到"自动提取+验证"

**v3.0新增工具**：`update_references`
- 接收结构化的角色状态变更和伏笔处理记录
- 自动更新角色状态卡和伏笔追踪表
- 如果没有提供，尝试从章节内容中自动提取（简易模式）

## 安装和启动

### 1. 安装依赖

```bash
cd E:\Novel\ai-novel\tools\mcp
npm install
```

### 2. Kilo Code配置

打开Kilo Code的设置文件（`.kilocode/mcp.json`），添加MCP服务器配置：

```json
{
  "mcpServers": {
    "novel-workflow": {
      "command": "node",
      "args": ["E:\\Novel\\ai-novel\\tools\\mcp\\mcp_server.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### 3. 重启Kilo Code

配置完成后，重启Kilo Code。连接成功后，你就可以看到13个写作工具。

## 可用工具

| 工具名 | 用途 | 输入参数 |
|--------|------|---------|
| `prepare_work` | 准备工作：读取角色卡、伏笔表、前3章 | `chapter` (章节号) |
| `make_outline` | 制作章级细纲（2-4场景） | `chapter`, `chapter_name`, `core_event`, `mood`, `conflict`, `scenes[]`, `hook_type`, `hook_content`, `foreshadowing`(可选) |
| `generate_prompts` | 为每个场景生成Prompt文件 | `chapter` |
| `generate_drafts` | 返回**场景1**的Prompt，指示AI生成草稿 | `chapter` |
| `get_next_prompt` | 获取下一个场景的Prompt（中途调用） | `chapter`, `scene_num` (已完成的场景序号) |
| `save_draft` | 保存AI生成的草稿到文件 | `chapter`, `scene_num`, `content` |
| `assemble_chapter` | 拼接所有场景，初校 | `chapter` |
| `review_chapter` | 深度审校，生成检查清单+要求修改 | `chapter` |
| `finalize_chapter` | 保存定稿，**强制确认**状态更新 | `chapter`, `chapter_name`, `final_content`, `quality_score`, `character_updates`(必填!), `foreshadowing_updates`(必填!) |
| `update_references` | 🆕 主动更新角色状态卡和伏笔追踪表 | `chapter`, `chapter_content`, `character_updates[]`, `foreshadowing_updates[]` |
| `validate_state_consistency` | 🆕 写作前状态一致性验证 | `chapter`, `outline_content`(可选) |
| `reset_session` | 重置会话（新章节开始时） | `chapter` |
| `get_status` | 查看项目状态 | 无 |

## 使用流程（v4.0 状态追踪版）

### 写新章节（以第6章为例）

#### 步骤0：状态一致性验证（推荐）
调用 `validate_state_consistency` → 输入 `{"chapter": 6}`
- 系统解析角色状态卡中的当前境界、位置、持有物品
- 对照力量体系验证境界合法性
- 输出验证报告
- ⚠️ 如有冲突，请先修正角色状态卡

#### 步骤1：准备工作
调用 `prepare_work` → 输入 `{"chapter": 6}`

#### 步骤2：制作细纲
调用 `make_outline` → 输入章节信息

#### 步骤3：生成Prompt
调用 `generate_prompts` → 输入 `{"chapter": 6}`

#### 步骤4-1：生成草稿（逐步引导模式）

**第一次调用**：
调用 `generate_drafts` → 输入 `{"chapter": 6}`
- 系统返回**场景1**的完整Prompt
- AI根据Prompt生成草稿
- AI调用 `save_draft(chapter=6, scene_num=1, content="草稿内容")`

**保存成功后**：
调用 `get_next_prompt` → 输入 `{"chapter": 6, "scene_num": 1}`
- 系统返回**场景2**的完整Prompt
- AI根据Prompt生成草稿
- AI调用 `save_draft(chapter=6, scene_num=2, content="草稿内容")`

**重复以上步骤**，直到所有场景完成。

#### 步骤5：拼接初校
调用 `assemble_chapter` → 输入 `{"chapter": 6}`

#### 步骤6：深度审校（主动修改模式）
调用 `review_chapter` → 输入 `{"chapter": 6}`

AI需要完成以下任务：
1. 根据检查清单逐项审校
2. **直接修改章节内容**（不只是列出问题）
3. 提取"角色状态变更"和"伏笔处理记录"
4. 调用 `update_references` 主动更新（可选，推荐）
5. 调用 `finalize_chapter` 保存定稿

**推荐工作流**：
```
review_chapter → AI修改内容并提取更新信息
→ update_references(chapter=6, chapter_content="修改后的内容", character_updates=[...], foreshadowing_updates=[...])
→ finalize_chapter(chapter=6, chapter_name="...", final_content="修改后的内容", ...)
```

#### 步骤7：保存定稿（强制确认）
调用 `finalize_chapter` → 输入：
```json
{
  "chapter": 6,
  "chapter_name": "山路遇险",
  "final_content": "...修改后的完整内容...",
  "quality_score": 85,
  "character_updates": "李长风当前境界更新为引气期",
  "foreshadowing_updates": "埋设F008：神秘老人的身份线索"
}
```

⚠️ **重要**：`character_updates` 和 `foreshadowing_updates` 不再是可选参数！
- 如果有变更：提供详细信息
- 如果无变更：填写"本章无角色状态变更" / "本章无伏笔处理"

## update_references 工具详解

这是v3.0新增的核心工具，让AI主动更新参考资料。

### 使用场景

1. **审校后更新**：在review_chapter完成后调用
2. **定稿前更新**：在finalize_chapter之前调用

### 参数说明

```json
{
  "chapter": 6,
  "chapter_content": "完整的章节内容文本",
  "character_updates": [
    {
      "character": "李长风",
      "attribute": "当前境界",
      "old_value": "凡人",
      "new_value": "引气期"
    }
  ],
  "foreshadowing_updates": [
    {
      "id": "F008",
      "action": "plant",
      "description": "神秘老人的身份线索"
    }
  ]
}
```

### action 类型说明

- `plant`：埋设新伏笔
- `echo`：呼应已有伏笔
- `resolve`：回收已有伏笔

## 步骤验证机制

MCP服务会**自动验证**每步的前置条件：

```
如果AI试图跳过 generate_drafts 直接调用 assemble_chapter：
❌ 错误：无法跳过 "generate_drafts" 直接执行 "assemble_chapter"。请先完成上一步骤。
```

## 自动卷检测

卷号根据章节号自动计算：
- 第1-10章 → vol01
- 第11-20章 → vol02
- 以此类推...

## 会话管理

每次写新章节时，MCP会自动创建会话记录：

```json
{
  "sessions": {
    "chapter_6": {
      "chapter": 6,
      "status": "completed",
      "steps_completed": ["prepare_work", "make_outline", ...],
      "started_at": "2026-04-09T12:00:00Z",
      "completed_at": "2026-04-09T13:00:00Z"
    }
  }
}
```

## 原子写入保护

所有状态文件使用原子写入（先写临时文件，再rename），防止意外中断导致数据损坏。

## v2.0 → v3.0 变化总结

| 功能 | v2.0 | v3.0 |
|------|------|------|
| 草稿生成 | 一次性返回所有Prompt | 逐个引导，逐步生成 |
| 审校修改 | 只生成检查清单 | 要求AI直接修改+提取信息 |
| 状态更新 | 依赖finalize参数 | 新增update_references主动更新 |
| 进度追踪 | 无 | save_draft显示进度（X/Y） |
| 工具数量 | 10个 | 11个（新增get_next_prompt） |

## 注意事项

- ⚠️ **步骤强制顺序执行**，不可跳步
- ✅ **上下文自动保存**，通过state.json传递
- ✅ **每步都有验证**，验证失败会明确提示
- ✅ **支持断点续传**，中途停止后可以从上一步继续
- ✅ **卷号自动检测**，无需手动指定
- 🆕 **草稿逐步引导**，避免AI一次生成过多内容
- 🆕 **审校主动修改**，AI不再只是"看看"
- 🆕 **参考资料主动更新**，不再依赖手动操作
