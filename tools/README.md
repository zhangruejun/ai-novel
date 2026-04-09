# 小说写作自动化控制工具

通过代码强制执行7步写作流程，每步验证通过才能进入下一步。

## 使用方法

```bash
# 启动写作流程（写第6章）
python tools/novel_writer.py write --chapter 6

# 仅做准备工作
python tools/novel_writer.py prepare --chapter 6

# 仅做细纲
python tools/novel_writer.py outline --chapter 6

# 检查当前状态
python tools/novel_writer.py status
```

## 流程控制

工具会按顺序执行以下步骤，每步完成后验证输出：

1. **prepare** - 读取角色卡、伏笔表、前3章
2. **outline** - 生成章级细纲（2-4场景）
3. **prompt** - 为每个场景生成Prompt文件
4. **draft** - 调用AI生成每个场景的草稿
5. **assemble** - 拼接所有场景，润色过渡
6. **review** - 一致性检查，去AI痕迹
7. **finalize** - 保存定稿，更新状态卡、伏笔表、日志

任何一步验证失败，流程中止，需要修复后重试。

## 配置文件

`tools/config.json` - 项目配置
`tools/state.json` - 流程状态追踪
