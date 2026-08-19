# show_svg / show_ui 插件交接文档

写给未来接手的自己。这份文档覆盖我们在这个仓库上加的两个"模型展示内容"插件的全部现状:架构、文件清单、关键决策、坑、以及没做完的事。读完应该能直接继续开发,不需要重新考古对话历史。

这是我们自己的插件工作,不是上游项目开发:仓库自身的文档/i18n 门禁只做到了"大体不碍事"的程度,细节见文末"已知欠账"。

## 一句话架构

模型调工具注册内容(内容随调用参数持久化进会话日志)→ 工具返回 `callId` 作引用 id,回执指示模型在最终回复里写独占一行的 `![标题](dsh-svg://<id>)` 或 `![标题](dsh-ui://<id>)` → 客户端把定稿正文按引用行切段,经 scheme 键控的 slot 分发给注册的渲染方 → 渲染方按 callId 在会话快照的工具节点里找回内容并渲染。

降级链全部免费:流式期间引用行经 MarkdownText 的"非 http 图片保留 alt"规则显示为标题文字,定稿后变成内容;id 解析不到同样保留 alt;模型忘记写引用行时,内容仍在折叠的工具行里。

## 文件清单(全部属于我们)

宿主侧(两个薄工具包,互相独立,可单独启停):

| 文件 | 职责 |
|---|---|
| `packages/interaction/tool-show-svg/src/index.ts` | `show_svg(svg, title?)`:校验(非空、大小上限默认 512K、`<svg>` 根、禁 DOCTYPE/ENTITY,注意 DTD 检查必须在根检查之前)、返回 `{svgId, chars}`、回执带精确引用行、系统提示词 order 115 |
| `packages/interaction/tool-show-ui/src/index.ts` | `show_ui(spec, title?)`:浅校验(大小上限默认 256K、root/elements 扁平树形状)、返回 `{uiId, chars}`;系统提示词 order 116 和工具描述都只做功能路由("先加载 show-ui-catalog skill") |
| `packages/interaction/tool-show-ui/skills/show-ui-catalog/SKILL.md` | 面向模型的组件目录参考(2026-08-17 起,原 `CATALOG_GUIDE` 拆出),按需经 skill tool 加载;**必须与客户端 catalog.tsx 同步改**;通过 `~/.dsh/skills/show-ui-catalog` junction 进入用户 skill 根被发现(新机器要重建 junction) |

客户端(一个真正的 `dsh.client` 插件 + 散在既有包里的 svg 遗留件):

| 文件 | 职责 |
|---|---|
| `packages/client/ui-embeds/src/client/index.ts` | 插件入口:向 `conversation.chat.embed` slot 注册 `dsh-svg`/`dsh-ui` 两个 key |
| `packages/client/ui-embeds/src/client/resolve.ts` | 按 callId 深搜工具节点树(含 subCalls);svg 走"渲染意图优先、参数回退",ui 纯参数;**参数回退是承重墙**,Code Mode 嵌套子调用没有渲染意图视图 |
| `packages/client/ui-embeds/src/client/embeds.tsx` | SvgEmbed / UiEmbed 组件;UiEmbed 带错误边界,目录不合法降级为提示 |
| `packages/client/ui-embeds/src/client/catalog.tsx` | json-render 目录 + `createRenderer` 实现;16 个组件(布局 Stack/Grid/Card,内容 Text/Metric/Badge/Progress/Table,图表 BarChart/ColumnChart/LineChart/MultiLineChart/Sparkline/PieChart/StackedBarChart/ScatterPlot);布局三件套带对齐/跨列/密度 props(Stack align/justify/wrap、Grid spans、Card subtitle/dense);`defineCatalog` 必须带 `actions: {}`,缺了 props 类型推断整个崩掉 |
| `packages/client/ui-embeds/src/client/widgets.module.css` | 组件样式,全部 `--dsw-*` token |
| `packages/client/ui-embeds/playground/` | 开发用 spec playground:左 JSON 右实时渲染,带预设/亮暗切换/坏 JSON 容错;`pnpm -C packages/client/ui-embeds playground` 起 vite(127.0.0.1:5175,显式绑 IPv4,此机上默认 localhost 只落 `[::1]`);引真 catalog + ui-theme token 表,vite 为此进了包 devDependencies;tsconfig 只含 src,不进库构建 |
| `packages/client/ui-conversation/src/client/chat/embed-refs.ts` | scheme 无关的引用行正则与切段器(`splitEmbedRefs`);owner props 类型 |
| `packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx` | 只在 `!streaming` 且有 renderEmbed 时切段;流式保持单个增量 MarkdownText,别动这个条件 |
| `packages/client/ui-conversation/src/client/chat/AssistantNodeView.tsx` | 组装 renderEmbed 回调(renderSlot + entryKey=scheme + fallback=raw 行) |
| `packages/client/ui-conversation/src/client/chat/register-node-renderers.ts` | assistant-step 注册声明了 `conversation.chat.embed` 子 slot(声明=渲染授权,没这行 renderSlot 会炸) |
| `packages/client/ui-conversation/src/client/contract/slots.ts` | SlotMap 里的 embed slot 声明 |
| `packages/client/ui-primitives/src/SvgBlock.tsx` | SVG 消毒边界(DOMPurify svg profile + 禁 foreignObject/style/a/animate/set;内联 SVG 的 `<style>` 是全文档生效的,这条禁令不能撤) |
| `packages/client/ui-tool/src/client/tool/models/svg-card-model.ts` + `toolviews/svg-row.tsx` | show_svg 的折叠回执行(降级用);也带参数回退 |
| `packages/core/tools/src/presentation.ts` | `SvgResultView`(card:'svg')渲染意图;show_ui 有意没有对应意图,纯参数通道 |

## 注册接线图(新插件照抄这份清单)

宿主工具包:三个 agent preset(`apps/cli/config/agent-presets/{code,standard,cordis}/agent.cordis.yml`)各一行 + `apps/cli/package.json` 依赖 + 根 `tsconfig.host.json` 引用 + `scripts/gen-tool-catalog.ts` 的 TOOL_PACKAGES 表(不加会让生成器直接报错,这是个完整性门)。

客户端插件:`package.json` 里 `dsh.client` 声明 + `exports["./client"]` + `packages/bundle/web-app/cordis.patch.yml` 插件行 + `packages/bundle/web-app/package.json` 依赖 + 根 `tsconfig.client.json` 引用 + `tsdown.config.ts` 用 `clientBundle` 助手。

构建三连:`npm run build:lib:host`、`npm run build:lib:client`、`npm run build:web`。第三个容易忘——ui-primitives 是平台种子模块打在外壳 bundle 里,改了它不重建外壳就是"看不到效果"(踩过)。开发期在包里 `pnpm watch` 走 HMR,不用重启宿主;增删插件本身要重启。

## 测试

```bash
pnpm exec vitest run packages/interaction/tool-show-svg packages/interaction/tool-show-ui packages/client/ui-embeds packages/client/ui-primitives/tests/svg-block.client.spec.tsx packages/client/ui-tool/tests/svg-card.client.spec.tsx
```

外加 `packages/client/ui-conversation` 全套(424 个,守护嵌入管道重构)。最后一次全绿:svg 消毒 8、svg 卡片 7、show_svg 宿主 8、show_ui 宿主 5、ui-embeds 8。

测试里的可复用件:ui-embeds 测试直接给组件喂 stub 的 `useSession`(slot 组件的会话工具包是 props,不是 context,所以能这么干);ui-conversation 的 chat-view 测试绕开 slot 系统直渲组件,所以给 AssistantNodeView 手动补了 `renderSlot`/`SessionProvider` stub。

## 关键决策的 why(改之前先读)

1. **id = callId**:会话内唯一、随日志持久化,回放免费。别换成随机数(规则:脚本环境里 Date.now/Math.random 会破坏回放)。
2. **解析走参数而非渲染意图**:Code Mode(PTC 模式)下工具经 `run_code` 嵌套执行,嵌套分发按仓库契约不携带渲染意图视图。show_svg 的 svg 意图保留是为了其他 UI 的降级渲染,但客户端解析必须有参数回退。show_ui 从一开始就纯参数。
3. **只切定稿文本**:MarkdownText 的增量解析器冻结已完成块,流式中切段会让它的缓存看见漂移的边界。流式期间引用行显示为 alt 文字是有意的过渡态。
4. **catalog 是安全边界**:v1 无 action,模型点不出副作用。宿主校验有意浅(它无法 import 浏览器目录);面向模型的目录参考在 `skills/show-ui-catalog/SKILL.md`,与 catalog.tsx 是手动同步的双胞胎(提示词与工具描述不再枚举组件,只路由到该 skill,按需加载省每请求 token)。
5. **一个客户端插件、两个宿主包**:部署可以只装 svg 不装 ui;ui-embeds 里没被工具喂数据的那半是无害死代码。

## 第三条通道:mermaid 围栏(2026-08-17 加)

拓扑图不走 show 工具:模型在定稿回复里写 ```mermaid 围栏,`render.tsx` 的定稿分支(紧挨 ```math 先例)把它换成 `MermaidBlock`(`packages/client/ui-primitives/src/markdown/MermaidBlock.tsx`)。要点:mermaid@11 按 shiki 懒加载模式动态 import(独立 chunk,gzip ~141K);`securityLevel: 'strict'`,输出不过 SvgBlock(它的 scoped `<style>` 是承重的,strict 模式自带消毒);全部 29 个图型家族 `useMaxWidth: false`(默认的 `width="100%"` 在 fit-content 包裹层里会塌缩成小图,踩过);首帧量宽自动适配缩放(只缩不放),悬停缩放芯片 50%–400%,芯片点击回 100%。加载中/语法错误都回落成普通代码块,零成本。测试在 `tests/mermaid.client.spec.tsx`(mock mermaid,5 条);流式期间保持普通代码块的条件别动,理由同嵌入管道。三通道分工:拓扑 → mermaid,自由图形 → show_svg,数据组件 → show_ui,lite preset 的 persona 已写明。

## 第三步(暂缓,做的时候从这里起步)

- **action 白名单**:json-render 已装的 0.19.0 支持 `catalog.actions` + `defineRegistry`/`JSONUIProvider` 的 `handlers`。第一个 action 建议是"往输入框插文本":handler 侧要拿 composer 的写入面,查 `conversation.composer` chain slot 或 ui-conversation 的 service。加 action 时 UiEmbed 需要从 `createRenderer` 换成 `JSONUIProvider` + `Renderer` 以传 handlers。
- **流式渐进渲染**:核心库有 `createSpecStreamCompiler`/`applySpecStreamPatch`;难点不在渲染在传输,要接工具参数的流式通道,工程量大,确认需求再做。
- **加组件**:catalog.tsx 加 zod 定义 + 实现 + CSS,`skills/show-ui-catalog/SKILL.md` 同步,ui-embeds 测试加一条渲染断言。半小时的事,LineChart/Sparkline 那两个 commit 就是模板。图表类组件的系列颜色走 widgets.module.css 的 `--dsh-cat-*` 色板(dataviz 六检校验过,槽位顺序即安全机制,散点上限 3 系列是全对校验的边界)。

## 已知欠账(自用无碍,合上游前要清)

- ~~`docs/config-catalog.zh.md` 缺 ui-embeds 一行~~ 已补(提交时被 pre-commit 拦下,顺手清了,i18n 记录已 `--write` 重录)。
- `check:all` 全量门(knip、lint、覆盖率、doc-sync)从未整跑;跑过且绿的:cordis-config、package-invariants、constraints、readme 两个门、md-links。
- json-render 是 Vercel Labs 实验项目,锁在 0.19.0;升级前先跑 ui-embeds 测试,`defineCatalog`/`createRenderer` 的类型面变过就按本文档"文件清单"逐个对。
- ui-goal 式的 README.i18n.yaml 配对四个新包都记录过,但 catalog 类生成文档的 zh 同步是手工的,重跑 `gen-tool-catalog` 后记得 zh 侧照抄新段落再 `verify-translation-pairing --write`。
