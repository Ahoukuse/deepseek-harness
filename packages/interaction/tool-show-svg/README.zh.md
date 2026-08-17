# @deepseek-ai/dsh-tool-show-svg

[English](README.md) | 中文

面向模型的 `show_svg` 工具：在对话中内联展示模型创作的 SVG 图形。纯展示——`execute` 只做校验并返回回执；图形经 `svg` render intent（`SvgResultView`）到达用户，view 携带来自调用参数的未消毒标记。消毒器由各 UI 自有（web 客户端在 `SvgBlock` 中经 DOMPurify 内联）；本包的校验是良构性与预算闸门，不是安全边界。

## 工具

`show_svg` 接受：

- `svg`——必填的完整 SVG 标记，从 `<svg>` 到 `</svg>`，需带 `viewBox`。大小受 `maxSvgChars` 配置约束（默认 512000 字符）；拒绝 DOCTYPE/ENTITY 声明。
- `title`——可选的短标题，作为卡片头部展示。

工具返回规范值 `{ displayed: true, chars: <n> }`，其 Native 渲染器用一句话确认展示。完成的调用呈现 `card: 'svg'` result view；失败的调用保持通用卡片。

## 角色

这是工具注册表之上的纯展示方：拥有面向模型的 schema、参数校验、提示词指引与 `svg` render intent 投影，不做任何 I/O。渲染表面是 web 客户端的 `SvgBlock`（`dsh-client-ui-primitives`），由 `dsh-client-ui-tool` 的 keyed toolview 分发。

## 模型体验

### 工具 schema

#### 模型看到什么

模型看到生成的 [`show_svg` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-show-svg)，外加一段系统提示词，说明脚本、事件处理器、style 元素与 foreignObject 会在展示前被剥除。

#### Token 影响

工具可见的每次请求承担固定的 schema 与指引成本。

#### KV Cache 影响

定义与可见性不变时前缀稳定。插件生命周期或作用域限制可能使该 schema 的复用失效。

### 工具调用历史与结果

#### 模型看到什么

完整标记保留在 assistant 工具调用参数中。结果步看到一行回执（`Displayed the SVG graphic (<title>, <n> characters) to the user.`）；图形本身绝不回显。

#### Token 影响

标记是调用参数中数据相关的保留 token——大图形意味着大参数载荷。结果只增加固定大小的回执。

#### KV Cache 影响

只追加；新可见内容跟在可复用请求前缀之后，不使既有 KV-cache 条目失效。

## 已知限制与暂缓事项

- **校验有意保持浅层**——宿主只检查大小、`<svg>` 根与 DTD 禁令，从不做完整 XML 良构性检查；内部畸形在 UI 消毒器处失败，卡片降级为无效状态提示。
- **图形以全尺寸持久化在会话日志中**——标记随调用参数存储；除 `maxSvgChars` 硬失败外，超大图形没有 spill 通道。
- **没有动画表面**——web 消毒器随脚本一并剥除 `animate`/`set`，因此即使 SMIL 标记通过这里的校验，图形也是静态渲染。
