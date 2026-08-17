# @deepseek-ai/dsh-client-ui-embeds

[English](README.md) | 中文

正文嵌入渲染方：浏览器半在键控 slot `conversation.chat.embed`（由 `ui-conversation` 声明）下注册 `dsh-svg` 与 `dsh-ui` 两个 scheme，回复中独占一行的 `![标题](dsh-svg://<id>)` 或 `![标题](dsh-ui://<id>)` 就地渲染为被引用的内容。解析经标准会话工具包读取会话快照，按 callId 匹配已落定的工具调用——有 `card:'svg'` 渲染意图时用意图，否则回退到持久化的 `show_svg`/`show_ui` 参数（Code Mode 嵌套分发不携带渲染意图视图，参数是所有路径上唯一都在的通道）。解析不到的 id 降级为普通 markdown，保留 alt 文本。

`dsh-svg` 经 `SvgBlock` 渲染（DOMPurify 消毒边界归 `ui-primitives`）。`dsh-ui` 经 json-render 目录渲染（`@json-render/core` + `@json-render/react`，zod 校验 props，不声明任何 action），v1 词表面向仪表盘/数据可视化：Stack、Grid、Card、Text、Metric、Badge、Progress、Table、BarChart。目录不合法的 spec 由错误边界兜住，降级为低调提示。宿主侧注册方是 `dsh-tool-show-svg` 与 `dsh-tool-show-ui`；它们的指引枚举同一份目录，必须同步演进。

## 模型体验

无。嵌入渲染属于浏览器侧 UI 接线；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **解析是按引用的线性扫描**——引用稀少且节点窗口有上限；嵌入变密集时再加 id 索引。
- **组件 action 与流式渲染暂缓**——目录不声明 action，spec 落定后一次渲染；json-render 的 action 绑定与补丁流式是第三步的事项。
- **组件文案未本地化**——边界提示是内联中文，与 block 原子组件的 label-prop 姿态一致；嵌入表面长出设置后再本地化。
