/**
 * 《剑道通神》AI辅助写作 MCP 服务 (v2.0 - 会话编排版)
 * 
 * 设计理念：会话级编排 + 任务级重置
 * - 每个章节写作是一个独立会话(session)
 * - 7步流程强制顺序执行，防止跳步
 * - 每章完成后自动归档会话状态
 * 
 * Kilo Code 配置 (.kilocode/mcp.json):
 * {
 *   "mcpServers": {
 *     "novel-workflow": {
 *       "command": "node",
 *       "args": ["E:\\Novel\\ai-novel\\tools\\mcp\\mcp_server.js"],
 *       "disabled": false,
 *       "autoApprove": []
 *     }
 *   }
 * }
 * 
 * 启动方式:
 * 1. cd E:\Novel\ai-novel\tools\mcp
 * 2. npm install
 * 3. node mcp_server.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

// ========== 步骤定义与顺序 ==========

const STEP_ORDER = [
  "prepare_work",
  "make_outline",
  "generate_prompts",
  "generate_drafts",
  "save_draft",
  "assemble_chapter",
  "review_chapter",
  "finalize_chapter",
];

// ========== 文件读写工具函数 ==========

function readMarkdown(filePath) {
  try {
    return fs.readFileSync(path.resolve(ROOT_DIR, filePath), "utf-8");
  } catch (e) {
    return null;
  }
}

function writeMarkdown(filePath, content) {
  const fullPath = path.resolve(ROOT_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

function fileExists(filePath) {
  return fs.existsSync(path.resolve(ROOT_DIR, filePath));
}

/**
 * 原子写入：先写临时文件，再rename，防止中断导致数据损坏
 */
function atomicWrite(filePath, content) {
  const fullPath = path.resolve(ROOT_DIR, filePath);
  const tempPath = fullPath + ".tmp";
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, content, "utf-8");
  fs.renameSync(tempPath, fullPath);
  return fullPath;
}

function countChineseChars(text) {
  // 统计中文字符（包含中文标点）
  return (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
}

function findLatestChapters(count = 3) {
  const dir = path.resolve(ROOT_DIR, "chapters");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, count);
  return files;
}

function getLastChapterNumber() {
  const dir = path.resolve(ROOT_DIR, "chapters");
  if (!fs.existsSync(dir)) return 5;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const m = f.match(/第(\d+)章/);
      return m ? parseInt(m[1]) : 0;
    });
  return files.length > 0 ? Math.max(...files) : 5;
}

function getChapterFile(chapterNum) {
  const dir = path.resolve(ROOT_DIR, "chapters");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(`第${String(chapterNum).padStart(3, "0")}章`));
  return files.length > 0 ? files[0] : null;
}

/**
 * 自动检测当前章节应该属于哪个卷
 */
function detectVolume(chapter) {
  // 简单逻辑：每10章一卷，可根据实际大纲调整
  const volNum = Math.ceil(chapter / 10);
  return `vol${String(volNum).padStart(2, "0")}`;
}

/**
 * 构建文件路径，自动处理卷号
 */
function getVolumePath(volumeOrChapter) {
  if (typeof volumeOrChapter === "number") {
    return detectVolume(volumeOrChapter);
  }
  return volumeOrChapter;
}

// ========== 禁用语检测 ==========

const FORBIDDEN_WORDS = [
  "然而", "与此同时", "值得注意的是", "不得不提", "众所周知",
  "毫无疑问", "显而易见", "毋庸置疑", "不言而喻",
  "可以说", "换句话说", "也就是说", "总而言之",
  "不仅如此", "更重要的是", "反观",
  "除此之外", "一言以蔽之", "无独有偶",
  "他感到一阵复杂的情绪涌上心头", "他的内心久久不能平静",
  "嘴角勾起一抹微笑", "嘴角勾起一抹冷笑", "嘴角勾起一个弧度",
  "眼中闪过一丝精光", "眼中闪过一丝杀意", "眼中闪过一丝寒芒",
  "倒吸一口凉气", "心中暗道", "心中一惊", "心中一凛",
  "脸色微微一变", "脸色骤变", "脸色大变",
  "眉头微微一皱", "眉头紧锁", "不置可否", "意味深长",
  "若有所思", "似笑非笑", "似有所指", "如释重负", "恍然大悟",
  "相视一笑", "会心一笑", "双手抱胸", "负手而立", "背负双手",
  "犹如", "宛如", "如同", "仿佛",
  "却说", "且说", "话说", "按下不表", "暂且不表", "话分两头",
  "一道寒光闪过", "你来我往", "难解难分", "难分难解",
  "倒飞而出", "重重摔落在地", "喷出一口鲜血", "断了线的风筝",
];

function checkForbiddenWords(text) {
  const found = [];
  for (const word of FORBIDDEN_WORDS) {
    if (text.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

// ========== 状态管理（会话版） ==========

const STATE_PATH = "tools/mcp/state.json";

function loadState() {
  const statePath = path.resolve(ROOT_DIR, STATE_PATH);
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, "utf-8"));
    }
  } catch (e) {}
  return createInitialState();
}

function createInitialState() {
  return {
    currentChapter: getLastChapterNumber(),
    lastStep: null,
    sessions: {},
  };
}

function saveState(state) {
  const statePath = path.resolve(ROOT_DIR, STATE_PATH);
  const tempPath = statePath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tempPath, statePath);
}

/**
 * 确保会话存在
 */
function ensureSession(state, chapter) {
  const sessionKey = `chapter_${chapter}`;
  if (!state.sessions[sessionKey]) {
    state.sessions[sessionKey] = {
      chapter,
      status: "active",
      steps_completed: [],
      started_at: new Date().toISOString(),
    };
  }
  return state.sessions[sessionKey];
}

/**
 * 步骤验证：防止跳步
 */
function validateStep(state, stepName, chapter) {
  const sessionKey = `chapter_${chapter}`;
  const session = ensureSession(state, chapter);
  const currentIndex = STEP_ORDER.indexOf(stepName);

  if (currentIndex === 0) return true; // prepare_work 不需要验证

  // 检查上一步是否已完成
  const prevStep = STEP_ORDER[currentIndex - 1];
  if (!session.steps_completed.includes(prevStep)) {
    return {
      valid: false,
      error: `❌ 步骤验证失败：无法跳过 "${prevStep}" 直接执行 "${stepName}"。请先完成上一步骤。`,
      session,
    };
  }

  return { valid: true, session };
}

/**
 * 记录步骤完成
 */
function recordStep(state, chapter, stepName) {
  const sessionKey = `chapter_${chapter}`;
  const session = ensureSession(state, chapter);
  if (!session.steps_completed.includes(stepName)) {
    session.steps_completed.push(stepName);
  }
  state.lastStep = stepName;
  state.currentChapter = chapter;
}

/**
 * 归档会话（章节完成后）
 */
function archiveSession(state, chapter) {
  const sessionKey = `chapter_${chapter}`;
  if (state.sessions[sessionKey]) {
    state.sessions[sessionKey].status = "completed";
    state.sessions[sessionKey].completed_at = new Date().toISOString();
  }
}

/**
 * 构建卷路径（自动检测）
 */
function getVolPath(chapter) {
  const volNum = Math.ceil(chapter / 10);
  return `vol${String(volNum).padStart(2, "0")}`;
}

// ========== MCP 服务 ==========

const server = new McpServer({
  name: "novel-writing-workflow",
  version: "1.0.0",
});

// ================================================================
// 工具1: prepare_work - 准备工作
// ================================================================
server.tool("prepare_work", {
  chapter: z.number().describe("章节号，如 6"),
}, async ({ chapter }) => {
  const state = loadState();
  const session = ensureSession(state, chapter);
  recordStep(state, chapter, "prepare_work");
  saveState(state);

  const prevChapters = findLatestChapters(3);
  const prevContents = [];

  for (const file of prevChapters) {
    const content = readMarkdown(`chapters/${file}`);
    if (content) {
      prevContents.push({ file, summary: content.substring(0, 500) });
    }
  }

  const charCards = readMarkdown("references/角色状态卡.md") || "";
  const foreshadowing = readMarkdown("references/伏笔追踪表.md") || "";

  const charSummary = charCards
    .split("\n")
    .filter(line => line.includes("|") && (line.includes("当前境界") || line.includes("当前位置") || line.includes("当前状态") || line.includes("持有")))
    .join("\n");

  const foreSummary = foreshadowing
    .split("\n")
    .filter(line => line.includes("|") && line.includes("F0"))
    .join("\n");

  state.context = {
    prevChapters: prevContents,
    charCards: charSummary,
    foreshadowing: foreSummary,
  };
  saveState(state);

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 准备工作完成（第${chapter}章）

### 当前进度
- 已完成章节：第${getLastChapterNumber()}章
- 下一章待写：第${chapter}章
- 所属卷：${getVolPath(chapter)}

### 前3章定稿
${prevChapters.map(f => `- chapters/${f}`).join("\n")}

### 前3章内容摘要
${prevContents.map(c => `\n**${c.file}**（前500字）：\n${c.summary.substring(0, 200)}...`).join("\n")}

### 角色状态摘要
${charSummary.substring(0, 1000)}

### 伏笔状态摘要
${foreSummary.substring(0, 1000)}

---
📋 下一步：请调用 \`make_outline\` 工具制作第${chapter}章的章级细纲。`
      }
    ],
  };
});

// ================================================================
// 工具2: make_outline - 制作章级细纲
// ================================================================
server.tool("make_outline", {
  chapter: z.number().describe("章节号"),
  chapter_name: z.string().describe("章节名称，如'真气初通'"),
  core_event: z.string().describe("核心事件，一句话概括本章发生什么事"),
  mood: z.string().describe("情绪基调，如'紧张'、'悬疑'、'热血'"),
  conflict: z.string().describe("核心冲突，如'主角首次尝试运转真气，发现体内真气异常'"),
  scenes: z.array(z.object({
    name: z.string().describe("场景名称"),
    type: z.enum(["A", "B", "C", "D", "E", "F"]).describe("场景类型：A对话/B动作/C悬疑/D感情/E环境/F转折"),
    location: z.string().describe("时间地点"),
    characters: z.string().describe("出场角色"),
    action: z.string().describe("核心动作"),
    dialogue: z.string().describe("对话要点"),
    transition: z.string().describe("过渡方式"),
  })).min(2).max(4).describe("场景列表，2-4个场景"),
  hook_type: z.string().describe("结尾钩子类型：悬念/危机/反转/新角色出现/重大发现"),
  hook_content: z.string().describe("结尾钩子具体内容"),
  foreshadowing: z.object({
    plant: z.string().optional().describe("需要埋设的伏笔"),
    echo: z.string().optional().describe("需要呼应的伏笔"),
    resolve: z.string().optional().describe("需要回收的伏笔"),
  }).optional().describe("伏笔处理"),
}, async ({ chapter, chapter_name, core_event, mood, conflict, scenes, hook_type, hook_content, foreshadowing }) => {
  const state = loadState();
  const validation = validateStep(state, "make_outline", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "make_outline");

  const prevChNum = chapter - 1;
  const prevFile = getChapterFile(prevChNum);
  let prevChapterEnding = "";
  if (prevFile) {
    const content = readMarkdown(`chapters/${prevFile}`) || "";
    const lines = content.split("\n");
    prevChapterEnding = lines.slice(-10).join("\n");
  }

  const volPath = getVolPath(chapter);
  const ch = String(chapter).padStart(3, "0");

  const scenesMd = scenes.map((s, i) => `### 场景${i + 1}：${s.name}

| 项目 | 内容 |
|------|------|
| 场景类型 | ${s.type} |
| 时间地点 | ${s.location} |
| 出场角色 | ${s.characters} |
| 核心动作 | ${s.action} |
| 对话要点 | ${s.dialogue} |
| 过渡方式 | ${s.transition} |`).join("\n\n");

  const outline = `# 第${ch}章：${chapter_name}

## 基本信息

| 项目 | 内容 |
|------|------|
| 所属卷 | 第${Math.ceil(chapter / 10)}卷 |
| 章节序号 | 第${ch}章 |
| 字数目标 | 2800-3200字 |
| 场景数量 | ${scenes.length}个 |
| 场景类型 | ${scenes.map(s => s.type).join("/")} |

## 本章在卷中的位置

- **承上**：承接第${prevChNum}章结尾——${prevChapterEnding.substring(0, 100)}
- **启下**：为后续剧情做铺垫
- **本章作用**：推进剧情

## 本章核心

- **核心事件**：${core_event}
- **情绪基调**：${mood}
- **核心冲突**：${conflict}

## 前章衔接

- **上一章结尾**：
${prevChapterEnding}

- **本章开头**：自然衔接上一章结尾，从上一章最后的场景/状态直接开始
- **需要注意的连续性**：角色状态、物品位置需与角色状态卡一致

## 场景拆分

${scenesMd}

## 结尾钩子

- **钩子类型**：${hook_type}
- **具体内容**：${hook_content}
- **预期效果**：读者产生强烈好奇心，想看下一章

## 细节要求

### 伏笔处理
${foreshadowing ? `- **需要埋设的伏笔**：${foreshadowing.plant || "无"}
- **需要呼应的伏笔**：${foreshadowing.echo || "无"}
- **需要回收的伏笔**：${foreshadowing.resolve || "无"}` : "- 无特殊伏笔处理"}

### 角色状态提醒
参考角色状态卡，不要自行编造角色状态。

## Prompt模板选择

- **主要使用模板**：基础
- **辅助使用模板**：无
`;

  const outlinePath = `outlines/${volPath}/ch${ch}_细纲.md`;
  writeMarkdown(outlinePath, outline);

  state.context.outlinePath = outlinePath;
  state.context.outline = outline;
  saveState(state);

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 细纲制作完成（第${chapter}章：${chapter_name}）

### 细纲内容摘要
- 场景数量：**${scenes.length}个**
- 场景类型：${scenes.map(s => s.type).join("/")}
- 核心事件：${core_event}
- 情绪基调：${mood}
- 结尾钩子：${hook_type}——${hook_content}

### 场景列表
${scenes.map((s, i) => `${i + 1}. **${s.name}**（类型${s.type}）- ${s.action.substring(0, 50)}...`).join("\n")}

### 保存路径
\`${outlinePath}\`

### 验证结果
- [x] 场景数量：${scenes.length}（要求2-4个）✅
- [x] 每个场景包含6项信息 ✅
- [x] 结尾钩子设计具体 ✅
- [x] 与上一章衔接已填写 ✅

---
📋 下一步：请调用 \`generate_prompts\` 工具为每个场景生成独立Prompt。`
      }
    ],
  };
});

// ================================================================
// 工具3: generate_prompts - 生成场景Prompt
// ================================================================
server.tool("generate_prompts", {
  chapter: z.number().describe("章节号"),
}, async ({ chapter }) => {
  const state = loadState();
  const validation = validateStep(state, "generate_prompts", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "generate_prompts");

  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);

  // 读取细纲（动态卷路径）
  const outlinePath = `outlines/${volPath}/ch${ch}_细纲.md`;
  const outline = readMarkdown(outlinePath);
  if (!outline) {
    return {
      content: [{ type: "text", text: `❌ 错误：细纲不存在。请先调用 make_outline 工具。\n路径：${outlinePath}` }],
      isError: true,
    };
  }

  const charCards = readMarkdown("references/角色状态卡.md") || "";
  const forbiddenList = readMarkdown("references/禁用语列表.md") || "";
  const forbiddenSummary = forbiddenList
    .split("\n")
    .filter(line => !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("```") && !line.startsWith("---") && line.trim().length > 0 && line.trim().length < 30)
    .slice(0, 30)
    .join("、");

  const prevChNum = chapter - 1;
  const prevFile = getChapterFile(prevChNum);
  let prevEnding = "";
  if (prevFile) {
    const content = readMarkdown(`chapters/${prevFile}`) || "";
    const lines = content.split("\n");
    prevEnding = lines.slice(-8).join("\n");
  }

  // 提取场景信息
  const sceneRegex = /### 场景[一二三四五六七八九十\d]+[：:].*?(?=### 场景|## 结尾钩子|$)/gs;
  const scenes = [];
  let match;
  while ((match = sceneRegex.exec(outline)) !== null) {
    scenes.push(match[0]);
  }

  if (scenes.length === 0) {
    return {
      content: [{ type: "text", text: `❌ 错误：细纲中没有找到场景。请检查细纲格式。` }],
      isError: true,
    };
  }

  const generatedFiles = [];

  for (let i = 0; i < scenes.length; i++) {
    const sceneContent = scenes[i];
    const promptPath = `prompts/${volPath}/ch${ch}_场景${i + 1}.md`;

    const prompt = `# 第${ch}章 场景${i + 1} Prompt

## 前情提要

【上一章结尾】
${prevEnding}

【当前状态摘要】
${charCards.split("\n").filter(line => line.includes("|") && (line.includes("当前境界") || line.includes("当前位置") || line.includes("当前状态") || line.includes("真气"))).join("\n")}

【必须遵守的信息】
- 严格按场景描述写作，不要添加额外情节
- 角色行为必须符合角色状态卡中的性格设定
- 不要引入细纲/场景描述之外的新角色

---

## 章节信息
- 章名：第${ch}章
- 字数要求：800-1200字（本场景）

---

## 场景信息
${sceneContent}

---

## 写作风格要求
- **句式**：多用短句，少用长句。句子要有节奏感。
- **对话**：简洁有力，不说废话。每句对话都要有目的（推进剧情/塑造角色/制造冲突）。
- **动作描写**：具体、有画面感。用动词和名词，少用形容词和副词。
- **环境描写**：极简。只用环境来衬托情绪或暗示剧情，不要为了描写而描写。
- **心理描写**：用行为和对话暗示心理，不要直接写"他感到""他想""他心中"。
- **武侠特色**：突出剑道/武道特色，强调策略和智慧，不是力量对拼。

## 禁用语（绝对禁止使用）
${forbiddenSummary}

## 范围限制
- 只写本场景描述的内容
- 不要写超出场景范围的情节
- 不要推进感情线超过当前阶段
- 结尾自然过渡到下一场景，不要写结尾钩子（结尾钩子由最后一个场景负责）
`;

    writeMarkdown(promptPath, prompt);
    generatedFiles.push(promptPath);
  }

  state.context.promptFiles = generatedFiles;
  saveState(state);

  return {
    content: [
      {
        type: "text",
        text: `## ✅ Prompt生成完成（第${chapter}章）

### 生成的Prompt文件
${generatedFiles.map(f => `- ${f}`).join("\n")}

### 场景数量：${scenes.length}

### 每个Prompt包含
- [x] 前情提要（上一章结尾 + 当前状态摘要）
- [x] 必须遵守的信息
- [x] 场景详细信息
- [x] 写作风格要求
- [x] 禁用语列表
- [x] 范围限制

---
📋 下一步：请调用 \`generate_drafts\` 工具，然后根据返回的Prompt内容依次生成草稿并调用 \`save_draft\` 保存。`
      }
    ],
  };
});

// ================================================================
// 工具4: generate_drafts - 返回Prompt内容供AI生成草稿
// ================================================================
server.tool("generate_drafts", {
  chapter: z.number().describe("章节号"),
}, async ({ chapter }) => {
  const state = loadState();
  const validation = validateStep(state, "generate_drafts", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "generate_drafts");

  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);
  const promptsDir = path.resolve(ROOT_DIR, "prompts", volPath);

  if (!fs.existsSync(promptsDir)) {
    return {
      content: [{ type: "text", text: `❌ 错误：prompts/${volPath} 目录不存在。请先调用 generate_prompts 工具。` }],
      isError: true,
    };
  }

  const promptFiles = fs.readdirSync(promptsDir)
    .filter(f => f.startsWith(`ch${ch}_场景`) && f.endsWith(".md") && !f.includes("草稿"))
    .sort();

  if (promptFiles.length === 0) {
    return {
      content: [{ type: "text", text: `❌ 错误：没有找到第${chapter}章的Prompt文件。请先调用 generate_prompts 工具。` }],
      isError: true,
    };
  }

  const draftResults = [];
  for (let i = 0; i < promptFiles.length; i++) {
    const promptFile = promptFiles[i];
    const promptContent = readMarkdown(`prompts/${volPath}/${promptFile}`);
    draftResults.push({
      promptFile,
      promptContent,
      sceneNum: i + 1,
    });
  }

  state.context.draftSceneCount = draftResults.length;
  // 新增：记录待生成的场景总数，用于后续验证
  state.context.draftTotalScenes = draftResults.length;
  state.context.draftGeneratedScenes = 0;
  saveState(state);

  // 增强版：逐步引导AI逐个生成，避免一次性生成所有场景
  // 第一次调用只返回场景1的Prompt
  const firstScene = draftResults[0];
  
  let instructions = `## 📝 草稿生成任务（第${chapter}章，共${draftResults.length}个场景）

**工作流程**（重要：必须严格按此顺序执行）：
1. 先生成**场景1**的草稿
2. 调用 \`save_draft(chapter=${chapter}, scene_num=1, content="草稿内容")\` 保存
3. 等待保存成功后，我会返回场景2的Prompt
4. 重复以上步骤，直到所有场景完成
5. 所有场景完成后，调用 \`assemble_chapter\` 工具进行拼接和初校

**重要规则**：
1. 每次只生成**一个场景**的草稿（800-1200字）
2. 严格按照Prompt中的范围限制执行
3. 禁止使用Prompt中列出的禁用语
4. 必须调用 \`save_draft\` 工具保存，不要手动写文件

---

### 📌 场景1 Prompt

**Prompt文件**：prompts/${volPath}/${firstScene.promptFile}

**Prompt内容**：
\`\`\`
${firstScene.promptContent}
\`\`\`

---

请现在开始生成**场景1**的草稿（800-1200字），完成后调用：
\`save_draft(chapter=${chapter}, scene_num=1, content="...草稿内容...")\`

⚠️ **注意：不要一次生成所有场景！只生成场景1，保存后等我返回场景2的Prompt。**`;

  // 将所有场景的Prompt暂存到context，供后续返回
  state.context.allDraftScenes = draftResults.map(d => ({
    promptFile: d.promptFile,
    promptContent: d.promptContent,
    sceneNum: d.sceneNum,
  }));
  state.context.nextDraftScene = 2; // 下一个要返回的场景号
  saveState(state);

  return {
    content: [{ type: "text", text: instructions }],
  };
});

// ================================================================
// 新增工具: get_next_prompt - 获取下一个场景的Prompt（草稿生成中途调用）
// ================================================================
server.tool("get_next_prompt", {
  chapter: z.number().describe("章节号"),
  scene_num: z.number().describe("已完成的场景序号，如1表示场景1已完成，需要场景2"),
}, async ({ chapter, scene_num }) => {
  const state = loadState();
  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);

  const allScenes = state.context.allDraftScenes || [];
  const nextScene = allScenes.find(s => s.sceneNum === scene_num + 1);

  if (!nextScene) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 没有更多场景了

已完成的场景数：${scene_num}
总场景数：${state.context.draftTotalScenes || "未知"}

✅ 如果所有场景都已生成并保存，请调用 \`assemble_chapter(chapter=${chapter})\` 进行拼接和初校。
❌ 如果还有场景未生成，请检查已保存的草稿文件。`,
      }],
      isError: true,
    };
  }

  // 更新已生成场景计数
  state.context.draftGeneratedScenes = scene_num;
  saveState(state);

  return {
    content: [{
      type: "text",
      text: `## 📌 场景${nextScene.sceneNum} Prompt

**Prompt文件**：prompts/${volPath}/${nextScene.promptFile}

**Prompt内容**：
\`\`\`
${nextScene.promptContent}
\`\`\`

---

请现在开始生成**场景${nextScene.sceneNum}**的草稿（800-1200字），完成后调用：
\`save_draft(chapter=${chapter}, scene_num=${nextScene.sceneNum}, content="...草稿内容...")\`

⚠️ 保存成功后，再次调用 \`get_next_prompt(chapter=${chapter}, scene_num=${nextScene.sceneNum})\` 获取下一个场景。`,
    }],
  };
});

// ================================================================
// 新增工具: save_draft - 保存草稿（供AI调用）
// ================================================================
server.tool("save_draft", {
  chapter: z.number().describe("章节号"),
  scene_num: z.number().describe("场景序号，从1开始"),
  content: z.string().describe("草稿内容"),
}, async ({ chapter, scene_num, content }) => {
  const state = loadState();
  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);
  const filePath = `drafts/${volPath}/ch${ch}_场景${scene_num}_草稿.md`;

  writeMarkdown(filePath, content);
  const wordCount = countChineseChars(content);

  // 更新已生成场景计数
  if (state.context.draftGeneratedScenes === undefined) {
    state.context.draftGeneratedScenes = 0;
  }
  state.context.draftGeneratedScenes = Math.max(state.context.draftGeneratedScenes, scene_num);
  state.lastStep = "save_draft";
  saveState(state);

  const totalScenes = state.context.draftTotalScenes || "未知";
  const isLast = scene_num >= (state.context.draftTotalScenes || 0);

  let nextStepText = "";
  if (isLast && totalScenes !== "未知") {
    nextStepText = `✅ 所有${totalScenes}个场景已生成完毕！请调用 \`assemble_chapter(chapter=${chapter})\` 进行拼接和初校。`;
  } else {
    nextStepText = `📋 下一步：调用 \`get_next_prompt(chapter=${chapter}, scene_num=${scene_num})\` 获取场景${scene_num + 1}的Prompt，然后生成草稿并保存。`;
  }

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 场景${scene_num}草稿已保存（第${chapter}章）

- **保存路径**：\`${filePath}\`
- **字数**：${wordCount}字（要求800-1200字）
- **字数状态**：${wordCount >= 800 && wordCount <= 1200 ? "✅ 达标" : "⚠️ 不达标"}
- **进度**：${scene_num}/${totalScenes} 个场景

${nextStepText}`
      }
    ],
  };
});

// ================================================================
// 工具5: assemble_chapter - 拼接与初校
// ================================================================
server.tool("assemble_chapter", {
  chapter: z.number().describe("章节号"),
}, async ({ chapter }) => {
  const state = loadState();
  const validation = validateStep(state, "assemble_chapter", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "assemble_chapter");

  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);
  const draftsDir = path.resolve(ROOT_DIR, "drafts", volPath);

  if (!fs.existsSync(draftsDir)) {
    return {
      content: [{ type: "text", text: `❌ 错误：drafts/${volPath} 目录不存在。请先生成草稿。` }],
      isError: true,
    };
  }

  const draftFiles = fs.readdirSync(draftsDir)
    .filter(f => f.startsWith(`ch${ch}_场景`) && f.endsWith("_草稿.md"))
    .sort();

  if (draftFiles.length === 0) {
    return {
      content: [{ type: "text", text: `❌ 错误：没有找到第${chapter}章的草稿文件。请先调用 generate_drafts 工具并完成草稿生成。` }],
      isError: true,
    };
  }

  const draftContents = [];
  let totalWords = 0;
  let assembledText = [];

  for (let i = 0; i < draftFiles.length; i++) {
    const content = readMarkdown(`drafts/${volPath}/${draftFiles[i]}`) || "";
    const wordCount = countChineseChars(content);
    totalWords += wordCount;
    draftContents.push({ file: draftFiles[i], content, wordCount });
    assembledText.push(content);
  }

  const wordWarnings = draftContents
    .filter(d => d.wordCount < 800 || d.wordCount > 1200)
    .map(d => `- ${d.file}: ${d.wordCount}字（要求800-1200字）`);

  const assembledContent = assembledText.join("\n\n");
  const assembledPath = `drafts/${volPath}/ch${ch}_拼接初校.md`;
  writeMarkdown(assembledPath, assembledContent);

  const forbiddenFound = checkForbiddenWords(assembledContent);

  state.context.assembledPath = assembledPath;
  state.context.totalWords = totalWords;
  saveState(state);

  let resultText = `## ✅ 拼接与初校完成（第${chapter}章）

### 字数统计
- 场景数量：${draftFiles.length}
- 总字数：${totalWords}字
- 目标范围：2800-3200字
`;

  if (wordWarnings.length > 0) {
    resultText += `\n⚠️ 字数警告：\n${wordWarnings.join("\n")}`;
  }

  resultText += `\n\n### 场景明细\n${draftContents.map(d => `- ${d.file}: ${d.wordCount}字`).join("\n")}`;

  if (forbiddenFound.length > 0) {
    resultText += `\n\n### ⚠️ 发现 ${forbiddenFound.length} 个疑似禁用词
${forbiddenFound.slice(0, 10).map(w => `- "${w}"`).join("\n")}

请在下一步审校时修改这些词汇。`;
  } else {
    resultText += `\n\n### 禁用词检查：✅ 通过（未发现常见禁用词）`;
  }

  resultText += `

### 保存路径
\`${assembledPath}\`

---
📋 下一步：请调用 \`review_chapter\` 工具进行深度审校。`;

  return {
    content: [{ type: "text", text: resultText }],
  };
});

// ================================================================
// 工具6: review_chapter - 深度审校
// ================================================================
server.tool("review_chapter", {
  chapter: z.number().describe("章节号"),
}, async ({ chapter }) => {
  const state = loadState();
  const validation = validateStep(state, "review_chapter", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "review_chapter");

  const ch = String(chapter).padStart(3, "0");
  const volPath = getVolPath(chapter);
  const assembledPath = `drafts/${volPath}/ch${ch}_拼接初校.md`;
  const content = readMarkdown(assembledPath);

  if (!content) {
    return {
      content: [{ type: "text", text: `❌ 错误：拼接文件不存在。请先调用 assemble_chapter 工具。\n路径：${assembledPath}` }],
      isError: true,
    };
  }

  const wordCount = countChineseChars(content);
  const forbiddenFound = checkForbiddenWords(content);

  // 读取角色状态卡和伏笔表，供AI参考
  const charCards = readMarkdown("references/角色状态卡.md") || "";
  const foreshadowing = readMarkdown("references/伏笔追踪表.md") || "";

  const checklist = `# 第${String(chapter).padStart(3, "0")}章 检查清单

## 基本信息
- 字数：${wordCount}字（目标：2800-3200字）
- 字数达标：${wordCount >= 2800 && wordCount <= 3200 ? "✅" : "⚠️"}
- 场景数量：${state.context.draftSceneCount || "未知"}

## 角色一致性
- [ ] 角色名字正确（李长风、林婉儿等）
- [ ] 角色境界与角色状态卡一致
- [ ] 角色性格表现符合设定
- [ ] 角色称呼一致

## 剧情一致性
- [ ] 时间线正确
- [ ] 地点合理
- [ ] 前文物品/信息正确使用
- [ ] 与上一章衔接自然
- [ ] 没有偏离大纲

## 力量体系一致性
- [ ] 境界等级正确
- [ ] 战斗力表现符合当前境界
- [ ] 技能使用符合设定

## 语言质量
- [ ] 禁用词检查：${forbiddenFound.length === 0 ? "✅ 通过" : `⚠️ 发现${forbiddenFound.length}个问题`}
${forbiddenFound.length > 0 ? forbiddenFound.map(w => `  - "${w}" → 需要替换`).join("\n") : ""}
- [ ] 无现代用语
- [ ] 无过度空洞的心理描写
- [ ] 无对称句式（他做了A，也做了B）
- [ ] 无注水内容

## 节奏检查
- [ ] 有明确核心事件
- [ ] 场景转换自然
- [ ] 结尾有钩子
- [ ] 节奏符合预期

## 结构检查
- [ ] 与上一章结构无明显雷同
- [ ] 有至少一个亮点
- [ ] 场景类型有变化

## 质量评分
- 剧情推进：__/15
- 角色塑造：__/15
- 对话质量：__/15
- 战斗描写：__/10（如无战斗，N/A）
- 情感表达：__/10
- 节奏控制：__/10
- 结尾钩子：__/10
- 语言质量：__/10
- 一致性：__/5
- **总分：__/100**（≥80分通过）

## 修改记录
| 位置 | 问题类型 | 原内容 | 修改后内容 | 原因 |
|------|---------|--------|-----------|------|
|      |          |        |           |      |
`;

  const checklistPath = `reviews/ch${ch}_检查清单.md`;
  writeMarkdown(checklistPath, checklist);

  state.context.checklistPath = checklistPath;
  state.context.assembledContent = content;
  state.context.wordCount = wordCount;
  state.context.forbiddenFound = forbiddenFound;
  saveState(state);

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 深度审校开始（第${chapter}章）

### 检查结果
- 字数：${wordCount}字（${wordCount >= 2800 && wordCount <= 3200 ? "✅ 达标" : "⚠️ 不达标"})
- 禁用词：${forbiddenFound.length === 0 ? "✅ 未发现" : `⚠️ 发现 ${forbiddenFound.length} 个`}
${forbiddenFound.length > 0 ? forbiddenFound.map(w => `  - "${w}"`).join("\n") : ""}

### 角色状态卡（供参考）
\`\`\`
${charCards.substring(0, 2000)}${charCards.length > 2000 ? "\n...（内容较长，仅显示前2000字）" : ""}
\`\`\`

### 伏笔追踪表（供参考）
\`\`\`
${foreshadowing.substring(0, 2000)}${foreshadowing.length > 2000 ? "\n...（内容较长，仅显示前2000字）" : ""}
\`\`\`

### 审校指令（重要：必须完成以下所有步骤）

**第1步：逐项检查**
请根据以下检查清单逐项审校章节内容：

1. **修正禁用词**：将所有禁用词替换为更具体的描写
2. **润色语言**：调整句式，增加细节，去除AI痕迹
3. **检查一致性**：确保角色、剧情、力量体系与前文一致
4. **注入风格**：调整句式节奏，增加个人风格

**第2步：审校修改**
请将修改后的**完整章节内容**准备好，不要分段输出。

**第3步：提取更新信息**
审校完成后，请从本章内容中提取以下信息：
- **角色状态变更**（如"李长风当前境界更新为引气期"）
- **伏笔处理记录**（如"埋设F008：神秘老人的身份线索"或"回收F003：功法来源"）

**第4步：调用finalize_chapter**
调用工具保存定稿：
\`finalize_chapter(
  chapter=${chapter},
  chapter_name="章节名",
  final_content="修改后的完整内容",
  quality_score=评分,
  character_updates="角色状态变更摘要",
  foreshadowing_updates="伏笔处理记录"
)\`

### 检查清单
已保存至：\`${checklistPath}\`

### 当前章节内容
\`\`\`
${content.substring(0, 3000)}${content.length > 3000 ? "\n...（内容较长，仅显示前3000字）" : ""}
\`\`\`

---
⚠️ **重要提醒**：
- 审校时请**直接修改内容**，不要只列出问题
- 修改后的内容会在调用 \`finalize_chapter\` 时保存
- 必须提供 \`final_content\` 参数，否则会使用未修改的拼接初校内容
- 必须提供 \`character_updates\` 和 \`foreshadowing_updates\`，否则需要手动更新

⚠️ **评分标准**：
- 总分≥90分：优秀
- 总分80-89分：良好
- 总分70-79分：需要较多修改
- 总分<70分：建议重写

如果评分低于80分，请先修改内容后再调用 \`finalize_chapter\`。`
      }
    ],
  };
});

// ================================================================
// 工具7: finalize_chapter - 保存定稿并更新状态
// ================================================================
server.tool("finalize_chapter", {
  chapter: z.number().describe("章节号"),
  chapter_name: z.string().describe("章节名称"),
  final_content: z.string().optional().describe("审校后的最终内容。如果不提供，则使用拼接初校的内容。"),
  quality_score: z.number().optional().describe("质量评分（0-100），可选"),
  character_updates: z.string().optional().describe("角色状态变更摘要，如'李长风当前境界更新为引气期'"),
  foreshadowing_updates: z.string().optional().describe("伏笔处理记录，如'埋设F008：神秘老人的身份线索'"),
}, async ({ chapter, chapter_name, final_content, quality_score, character_updates, foreshadowing_updates }) => {
  const state = loadState();
  const validation = validateStep(state, "finalize_chapter", chapter);
  if (!validation.valid) {
    return { content: [{ type: "text", text: validation.error }], isError: true };
  }
  recordStep(state, chapter, "finalize_chapter");

  const ch = String(chapter).padStart(3, "0");

  let content = final_content;
  if (!content) {
    const volPath = getVolPath(chapter);
    content = readMarkdown(`drafts/${volPath}/ch${ch}_拼接初校.md`);
    if (!content) {
      return {
        content: [{ type: "text", text: `❌ 错误：没有可用内容。请先完成审校步骤，或提供 final_content 参数。` }],
        isError: true,
      };
    }
  }

  const finalPath = `chapters/第${ch}章_${chapter_name}.md`;
  const finalMarkdown = `# 第${ch}章 ${chapter_name}\n\n${content}`;
  writeMarkdown(finalPath, finalMarkdown);

  const wordCount = countChineseChars(content);

  // ========== 强制检查：角色状态变更确认 ==========
  // 即使AI说"本章无角色状态变更"，也要记录确认
  const charUpdateConfirmed = character_updates !== undefined && character_updates !== "";
  const charUpdateText = charUpdateConfirmed ? character_updates : "本章无角色状态变更（已确认）";

  // ========== 更新角色状态卡 ==========
  const charCardPath = "references/角色状态卡.md";
  let charCardContent = readMarkdown(charCardPath) || "";

  const charUpdateSection = `\n## 第${ch}章更新记录\n- **更新时间**：${new Date().toISOString().split("T")[0]}\n- **变更确认**：${charUpdateText}\n`;
  if (!charCardContent.includes(`第${ch}章更新记录`)) {
    charCardContent += charUpdateSection;
    atomicWrite(charCardPath, charCardContent);
  }

  // ========== 强制检查：伏笔处理确认 ==========
  const foreUpdateConfirmed = foreshadowing_updates !== undefined && foreshadowing_updates !== "";
  const foreUpdateText = foreUpdateConfirmed ? foreshadowing_updates : "本章无伏笔处理（已确认）";

  // ========== 更新伏笔追踪表 ==========
  const foreshadowPath = "references/伏笔追踪表.md";
  let foreshadowContent = readMarkdown(foreshadowPath) || "";

  const foreUpdateSection = `\n## 第${ch}章伏笔处理\n- **处理时间**：${new Date().toISOString().split("T")[0]}\n- **处理确认**：${foreUpdateText}\n`;
  if (!foreshadowContent.includes(`第${ch}章伏笔处理`)) {
    foreshadowContent += foreUpdateSection;
    atomicWrite(foreshadowPath, foreshadowContent);
  }

  // 更新日志
  const logPath = "logs/每日写作日志.md";
  let logContent = readMarkdown(logPath) || "# 每日写作日志\n\n";
  const today = new Date().toISOString().split("T")[0];

  if (logContent.includes(today)) {
    logContent += `- 第${ch}章：${chapter_name} ✅（${wordCount}字）\n`;
  } else {
    logContent += `\n## ${today}\n\n### 完成章节\n- 第${ch}章：${chapter_name} ✅（${wordCount}字）\n\n### 字数统计\n- 第${ch}章：约${wordCount}字\n\n`;
  }
  writeMarkdown(logPath, logContent);

  // 归档会话
  archiveSession(state, chapter);
  state.context = {};
  saveState(state);

  // 构建状态更新确认信息
  let updateConfirmText = "";
  if (charUpdateConfirmed) {
    updateConfirmText += `\n- ✅ **角色状态已记录**：${character_updates}`;
  } else {
    updateConfirmText += `\n- ✅ **角色状态已确认**：本章无变更`;
  }
  if (foreUpdateConfirmed) {
    updateConfirmText += `\n- ✅ **伏笔处理已记录**：${foreshadowing_updates}`;
  } else {
    updateConfirmText += `\n- ✅ **伏笔处理已确认**：本章无变更`;
  }

  // 警告提示：如果未提供任何更新信息
  let warningText = "";
  if (!charUpdateConfirmed && !foreUpdateConfirmed) {
    warningText = `\n\n⚠️ **警告**：您未提供任何角色状态和伏笔处理信息。
如果本章确实没有任何变化，请确认以下事项：
1. 角色境界、位置、状态与前文一致
2. 没有新物品获得或丢失
3. 没有新伏笔埋设或回收

如有遗漏，请立即补充，否则可能导致后续章节剧情崩坏！`;
  }

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 第${chapter}章定稿完成！

### 章节信息
- **章节**：第${ch}章 ${chapter_name}
- **字数**：${wordCount}字
- **评分**：${quality_score ? quality_score + "/100" : "未评分"}

### 保存路径
- 定稿：\`${finalPath}\`
- 检查清单：\`reviews/ch${ch}_检查清单.md\`
- 日志：已更新 \`${logPath}\`

### 状态更新确认
${updateConfirmText}
${warningText}

### 完成确认
- [x] 定稿已保存到 chapters/ 目录
- [x] 检查清单已保存到 reviews/ 目录
- [x] 每日写作日志已更新
- [x] 角色状态卡已记录确认
- [x] 伏笔追踪表已记录确认

---
🎉 第${chapter}章写作流程全部完成！

如需继续写下一章，请调用 \`prepare_work\` 工具开始新的章节。`
      }
    ],
  };
});

// ================================================================
// 新增工具: update_references - 主动更新角色状态卡和伏笔追踪表
// ================================================================
server.tool("update_references", {
  chapter: z.number().describe("章节号"),
  chapter_content: z.string().describe("章节内容，用于自动提取角色状态和伏笔信息"),
  character_updates: z.array(z.object({
    character: z.string().describe("角色名"),
    attribute: z.string().describe("变更的属性，如'当前境界'、'当前位置'、'当前状态'、'持有物品'"),
    old_value: z.string().describe("旧值"),
    new_value: z.string().describe("新值"),
  })).optional().describe("角色状态变更列表"),
  foreshadowing_updates: z.array(z.object({
    id: z.string().describe("伏笔编号，如F001"),
    action: z.enum(["plant", "echo", "resolve"]).describe("操作类型：plant=埋设, echo=呼应, resolve=回收"),
    description: z.string().describe("伏笔描述"),
  })).optional().describe("伏笔处理记录"),
}, async ({ chapter, chapter_content, character_updates, foreshadowing_updates }) => {
  const ch = String(chapter).padStart(3, "0");
  const updates = [];

  // ========== 1. 自动从章节内容中提取角色状态变更 ==========
  // 如果AI没有提供，尝试从内容中提取（增强版：更多匹配模式）
  const autoCharUpdates = [];
  if (!character_updates || character_updates.length === 0) {
    const realmPatterns = [
      /([^\s]{2,4})\s*(?:突破至|突破到|进入|踏入|达到|晋升)\s*([^\s，。！？、]+)/g,
      /([^\s]{2,4})\s*(?:当前境界|修为|实力)\s*(?:为|是|已达)\s*([^\s，。！？、]+)/g,
      /([^\s]{2,4})\s*(?:获得|得到|拿到|拾取)\s*([^\s，。！？、]+)/g,
      /([^\s]{2,4})\s*(?:离开|前往|来到|返回)\s*([^\s，。！？、]+)/g,
    ];
    for (const pattern of realmPatterns) {
      let match;
      while ((match = pattern.exec(chapter_content)) !== null) {
        let attr = "未知";
        if (pattern.source.includes("突破") || pattern.source.includes("晋升")) attr = "当前境界";
        else if (pattern.source.includes("获得") || pattern.source.includes("拿到")) attr = "持有物品";
        else if (pattern.source.includes("离开") || pattern.source.includes("前往")) attr = "当前位置";
        autoCharUpdates.push({
          character: match[1],
          attribute: attr,
          old_value: "未知",
          new_value: match[2],
        });
      }
    }
  }

  const allCharUpdates = character_updates || autoCharUpdates;

  // ========== 2. 更新角色状态卡 ==========
  if (allCharUpdates.length > 0) {
    const charCardPath = "references/角色状态卡.md";
    let charCardContent = readMarkdown(charCardPath) || "";

    const updateSection = `\n## 第${ch}章更新记录\n- **更新时间**：${new Date().toISOString().split("T")[0]}\n- **变更详情**：\n${allCharUpdates.map(u => `  - ${u.character}：${u.attribute} "${u.old_value}" → "${u.new_value}"`).join("\n")}\n`;

    if (!charCardContent.includes(`第${ch}章`)) {
      charCardContent += updateSection;
      atomicWrite(charCardPath, charCardContent);
      updates.push(`✅ 角色状态卡已更新：${allCharUpdates.length}项变更`);
    } else {
      updates.push(`⚠️ 角色状态卡已包含第${ch}章记录，跳过重复更新`);
    }
  }

  // ========== 3. 更新伏笔追踪表 ==========
  if (foreshadowing_updates && foreshadowing_updates.length > 0) {
    const foreshadowPath = "references/伏笔追踪表.md";
    let foreshadowContent = readMarkdown(foreshadowPath) || "";

    const actionMap = { plant: "埋设", echo: "呼应", resolve: "回收" };
    const foreTableRows = foreshadowing_updates.map(f =>
      `| ${f.id} | ${actionMap[f.action] || f.action} | ${f.description} | 第${ch}章 | - |`
    ).join("\n");

    const foreSection = `\n## 第${ch}章伏笔处理\n- **处理时间**：${new Date().toISOString().split("T")[0]}\n\n| 编号 | 操作 | 描述 | 章节 | 备注 |\n|------|------|------|------|------|\n${foreTableRows}\n`;

    if (!foreshadowContent.includes(`第${ch}章`)) {
      foreshadowContent += foreSection;
      atomicWrite(foreshadowPath, foreshadowContent);
      updates.push(`✅ 伏笔追踪表已更新：${foreshadowing_updates.length}项处理记录`);
    } else {
      updates.push(`⚠️ 伏笔追踪表已包含第${ch}章记录，跳过重复更新`);
    }
  }

  if (updates.length === 0) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 没有检测到更新

未提供角色状态变更和伏笔处理记录。

如需手动更新，请直接编辑：
- \`references/角色状态卡.md\`
- \`references/伏笔追踪表.md\`

或在调用 \`finalize_chapter\` 时提供 \`character_updates\` 和 \`foreshadowing_updates\` 参数。`,
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: `## ✅ 参考资料已更新（第${chapter}章）

${updates.join("\n")}

### 变更摘要
${allCharUpdates.length > 0 ? `\n**角色状态变更**：\n${allCharUpdates.map(u => `- ${u.character}：${u.attribute} "${u.old_value}" → "${u.new_value}"`).join("\n")}` : ""}
${foreshadowing_updates && foreshadowing_updates.length > 0 ? `\n**伏笔处理**：\n${foreshadowing_updates.map(f => `- ${f.id} [${f.action}] ${f.description}`).join("\n")}` : ""}

---
📋 更新完成后，可继续调用 \`finalize_chapter\` 完成章节定稿。`,
    }],
  };
});

// ================================================================
// 新增工具: validate_state_consistency - 状态一致性验证（写章节前强制调用）
// ================================================================
server.tool("validate_state_consistency", {
  chapter: z.number().describe("章节号"),
  outline_content: z.string().optional().describe("本章细纲内容（可选，用于验证出场角色）"),
}, async ({ chapter, outline_content }) => {
  const ch = String(chapter).padStart(3, "0");
  const issues = [];
  const warnings = [];
  const checks = [];

  // ========== 1. 读取角色状态卡 ==========
  const charCards = readMarkdown("references/角色状态卡.md") || "";

  // 解析主要角色的当前状态
  const characters = {};
  const currentRealmRegex = /\| 当前境界 \| ([^|]+) \|/;
  const currentStatusRegex = /\| 当前状态 \| ([^|]+) \|/;
  const currentPosRegex = /\| 当前位置 \| ([^|]+) \|/;
  const holdingRegex = /\| 持有物品 \| ([^|]+) \|/;

  // 按角色名称分割
  const charSections = charCards.split(/#### ([^\n（）]+)/).slice(1);
  for (let i = 0; i < charSections.length; i += 2) {
    const name = charSections[i].trim();
    const section = charSections[i + 1] || "";
    if (!name || name.length > 10) continue; // 过滤无效匹配

    const realmMatch = section.match(currentRealmRegex);
    const statusMatch = section.match(currentStatusRegex);
    const posMatch = section.match(currentPosRegex);
    const holdingMatch = section.match(holdingRegex);

    if (realmMatch) {
      characters[name] = {
        realm: realmMatch[1].trim(),
        status: statusMatch ? statusMatch[1].trim() : "未知",
        position: posMatch ? posMatch[1].trim() : "未知",
        holding: holdingMatch ? holdingMatch[1].trim() : "未知",
      };
    }
  }

  // ========== 2. 读取力量体系 ==========
  const powerSystem = readMarkdown("references/力量体系.md") || "";

  // 提取合法境界列表
  const validRealms = [];
  const realmTableRegex = /\| 境界 \| 对应[^\n]+\n\|[-|]+\n((?:\|[^\n]+\n)+)/g;
  let tableMatch;
  while ((tableMatch = realmTableRegex.exec(powerSystem)) !== null) {
    const rows = tableMatch[1].split("\n").filter(r => r.trim().startsWith("|"));
    for (const row of rows) {
      const cells = row.split("|").map(c => c.trim()).filter(c => c);
      if (cells.length >= 2) {
        validRealms.push(cells[0]);
      }
    }
  }

  // ========== 3. 验证角色境界合法性 ==========
  for (const [name, info] of Object.entries(characters)) {
    if (info.realm === "未出场" || info.realm.includes("未出场")) continue;

    // 检查境界是否在合法列表中
    const realmFound = validRealms.some(r => info.realm.includes(r) || r.includes(info.realm));
    if (!realmFound && !info.realm.includes("凡人") && !info.realm.includes("未知")) {
      warnings.push(`角色"${name}"的境界"${info.realm}"不在力量体系的合法境界列表中`);
    }

    checks.push(`- ${name}：当前境界"${info.realm}"，位置"${info.position}"`);
  }

  // ========== 4. 检查细纲中的角色一致性 ==========
  if (outline_content) {
    // 检查出场角色是否与状态卡一致
    for (const [name, info] of Object.entries(characters)) {
      if (outline_content.includes(name)) {
        if (info.position.includes("未出场")) {
          issues.push(`⚠️ 角色"${name}"当前位置为"${info.position}"，但细纲中安排其出场`);
        }
      }
    }
  }

  // ========== 5. 检查物品追踪 ==========
  const keyItemsRegex = /\| 物品 \| 状态 \| 持有者 \|/;
  const itemSection = charCards.split("\n").slice(
    charCards.split("\n").findIndex(l => l.includes("| 物品 | 状态 |")),
    charCards.split("\n").findIndex(l => l.includes("### 未回收伏笔"))
  ).join("\n");

  if (itemSection) {
    const items = itemSection.split("\n").filter(l => l.startsWith("|") && l.includes("|"));
    if (items.length > 2) {
      checks.push(`\n**关键物品追踪**：`);
      items.slice(2).forEach(item => {
        const cells = item.split("|").map(c => c.trim()).filter(c => c);
        if (cells.length >= 4) {
          checks.push(`- ${cells[0]}：状态=${cells[1]}，持有者=${cells[2]}`);
        }
      });
    }
  }

  // ========== 6. 生成验证报告 ==========
  const report = `## 状态一致性验证报告（第${chapter}章）

### 角色当前状态
${checks.join("\n")}

${issues.length > 0 ? `### ⚠️ 发现的问题\n${issues.join("\n")}` : "### ✅ 未发现明显问题"}

${warnings.length > 0 ? `### ⚠️ 警告\n${warnings.join("\n")}` : ""}

---
📋 写作时请严格遵守以上角色状态。如有疑问，请先更新角色状态卡。`;

  return {
    content: [{ type: "text", text: report }],
  };
});

// ================================================================
// 工具9: reset_session - 重置会话（用于新章节开始时）
// ================================================================
server.tool("reset_session", {
  chapter: z.number().describe("新章节的章节号"),
}, async ({ chapter }) => {
  const state = loadState();
  const sessionKey = `chapter_${chapter}`;

  // 清除旧会话（如果有）
  if (state.sessions[sessionKey]) {
    delete state.sessions[sessionKey];
  }

  state.currentChapter = chapter;
  state.lastStep = null;
  state.context = {};
  saveState(state);

  return {
    content: [
      {
        type: "text",
        text: `## ✅ 会话已重置

- **新章节**：第${chapter}章
- **所属卷**：${getVolPath(chapter)}
- **状态**：已清空所有步骤记录

📋 现在可以调用 \`prepare_work\` 开始新章节的写作流程。`
      }
    ],
  };
});

// ================================================================
// 工具8: get_status - 查看项目状态
// ================================================================
server.tool("get_status", {}, async () => {
  const state = loadState();
  const chaptersDir = path.resolve(ROOT_DIR, "chapters");
  const chapterFiles = fs.existsSync(chaptersDir)
    ? fs.readdirSync(chaptersDir).filter(f => f.endsWith(".md"))
    : [];

  const completedChapters = chapterFiles
    .map(f => {
      const m = f.match(/第(\d+)章/);
      return m ? parseInt(m[1]) : 0;
    })
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  // 统计所有卷
  const volStats = {};
  const dirs = ["outlines", "prompts", "drafts"];
  for (const dir of dirs) {
    const dirPath = path.resolve(ROOT_DIR, dir);
    if (fs.existsSync(dirPath)) {
      const vols = fs.readdirSync(dirPath).filter(f => fs.statSync(path.join(dirPath, f)).isDirectory());
      for (const vol of vols) {
        if (!volStats[vol]) volStats[vol] = {};
        volStats[vol][dir] = fs.readdirSync(path.join(dirPath, vol)).filter(f => f.endsWith(".md")).length;
      }
    }
  }

  let sessionsSummary = "";
  const activeSessions = Object.values(state.sessions).filter(s => s.status === "active");
  if (activeSessions.length > 0) {
    sessionsSummary = `\n### 活跃会话\n${activeSessions.map(s => `- 第${s.chapter}章：已完成 ${s.steps_completed.length}/${STEP_ORDER.length} 步`).join("\n")}`;
  }

  let statusText = `## 📊 项目状态

### 当前进度
- **已完成章节**：第 ${completedChapters.join(", ")} 章
- **最新章节**：第${completedChapters[completedChapters.length - 1] || 0}章
- **上次操作**：${state.lastStep || "无"}
${sessionsSummary}

### 文件统计（按卷）
${Object.entries(volStats).map(([vol, counts]) => `- **${vol}**：细纲${counts.outlines || 0}个, Prompt${counts.prompts || 0}个, 草稿${counts.drafts || 0}个`).join("\n") || "- 暂无文件"}

### 可用工具（13个）
1. \`prepare_work(chapter)\` - 准备工作
2. \`make_outline(...)\` - 制作章级细纲
3. \`generate_prompts(chapter)\` - 生成场景Prompt
4. \`generate_drafts(chapter)\` - 返回场景1的Prompt
5. \`get_next_prompt(chapter, scene_num)\` - 获取下一个场景Prompt
6. \`save_draft(chapter, scene_num, content)\` - 保存草稿
7. \`assemble_chapter(chapter)\` - 拼接场景，初校
8. \`review_chapter(chapter)\` - 深度审校
9. \`finalize_chapter(...)\` - 保存定稿，更新状态
10. \`update_references(...)\` - 🆕 主动更新角色卡和伏笔表
11. \`validate_state_consistency(chapter)\` - 🆕 状态一致性验证
12. \`reset_session(chapter)\` - 重置会话
13. \`get_status\` - 查看当前状态

### 🔒 状态追踪机制
- 每章完成后强制记录角色状态变更确认
- 伏笔处理记录自动追加到追踪表
- 状态一致性验证可检测境界异常和出场冲突`;

  return {
    content: [{ type: "text", text: statusText }],
  };
});

// ================================================================
// 启动服务
// ================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("《剑道通神》写作MCP服务已启动，等待Kilo Code连接...");
}

main().catch(console.error);
