---
name: show-ui-catalog
description: Component reference for the show_ui widget tool - every catalog component with its props, layout patterns, chart guidance, and example specs. Use this before authoring a show_ui spec.
---

# show_ui component catalog

The spec is a flat element tree:

```json
{"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":["<childKey>"]}}}
```

- `root` names the entry element's key in `elements`.
- `children` lists other element keys. Only Stack, Grid, and Card render children; every other component ignores them (pass `[]`).
- Widgets are display-only: no actions, no inputs, and no component types beyond this catalog. An unknown type or invalid props fails client-side validation and the widget degrades to a notice.
- Chart series and slice colors are assigned automatically, in declaration order, from a theme-adaptive palette validated for color-blind and light/dark readability. You cannot set colors; order your series by importance.

## Layout components

| Component | Props | Notes |
|---|---|---|
| `Stack` | `direction?: "row"\|"column"` (default column), `gap?: 0-48`, `align?: "start"\|"center"\|"end"\|"stretch"`, `justify?: "start"\|"center"\|"end"\|"between"`, `wrap?: boolean` | Children flow in one direction; rows wrap by default (`wrap: false` opts out). `direction: "row", justify: "between"` makes a header row with content pushed to both ends. |
| `Grid` | `columns: 1-6`, `spans?: number[]` (1-6 each) | Equal-width columns, 8px gap. `spans[i]` is the column span of the i-th child, default 1, clamped to `columns`: `columns: 3, spans: [2, 1]` gives a main-plus-sidebar layout, `spans: [3, 1, 1, 1]` a full-width header over three tiles. |
| `Card` | `title?: string`, `subtitle?: string`, `dense?: boolean` | The surface container; put content in cards for the framed dashboard look. `dense` tightens padding for cards nested inside other cards. |

## Content components

| Component | Props | Notes |
|---|---|---|
| `Text` | `content: string`, `variant?: "title"\|"body"\|"caption"` | Plain text, no markdown. |
| `Metric` | `label`, `value: string`, `unit?`, `delta?`, `trend?: "up"\|"down"\|"flat"` | A KPI tile; `value` is preformatted text ("1.2M"). `trend` colors the delta. |
| `Badge` | `label`, `tone?: "neutral"\|"success"\|"warning"\|"danger"` | Small status pill. |
| `Progress` | `label?`, `value: 0-100` | One horizontal progress bar. |
| `Table` | `columns: string[]`, `rows: string[][]` | All cells are strings; keep numbers preformatted. |

## Charts

| Component | Props | Use for |
|---|---|---|
| `BarChart` | `title?`, `items: [{label, value>=0}]`, `unit?` | Horizontal bars; best when labels are long or items many. |
| `ColumnChart` | `title?`, `items: [{label, value>=0}]` (1-12), `unit?` | Vertical bars; best for short labels such as months. |
| `LineChart` | `title?`, `points: [{label, value}]` (min 2), `unit?` | One series over an ordered axis. |
| `MultiLineChart` | `title?`, `series: [{label, values: number[] (min 2)}]` (1-8), `xLabels?: string[]`, `unit?` | Several series compared on one shared scale; a legend renders automatically. |
| `Sparkline` | `values: number[]` (min 2), `label?` | Tiny inline trend, no axes. |
| `PieChart` | `title?`, `items: [{label, value>=0}]` (1-8), `donut?: boolean`, `unit?` | Share of a whole; the legend shows values and percentages. |
| `StackedBarChart` | `title?`, `series: string[]` (1-8), `rows: [{label, values: number[]}]`, `unit?` | Composition across categories. `values[i]` aligns with `series[i]`; extra values are dropped. |
| `ScatterPlot` | `title?`, `series: [{label, points: [{x, y}]}]` (1-3), `xLabel?`, `yLabel?` | Correlation between two numeric axes. Hard cap of 3 series (palette all-pairs safety); fold extras into fewer series or use several plots. |

Chart selection: magnitude comparison takes bars or columns, change over time takes lines, share-of-whole takes pie, composition takes stacked bars, correlation takes scatter. Every multi-series chart draws its own legend; do not spend elements on hand-made legends. All charts (except Sparkline) show exact values in a hover tooltip automatically, line charts get a crosshair, and legends cross-highlight their series; do not spend elements annotating every data point.

## Examples

A KPI dashboard, one card with metrics over a column chart:

```json
{"root":"card","elements":{
  "card":{"type":"Card","props":{"title":"Q3 overview"},"children":["grid","cols"]},
  "grid":{"type":"Grid","props":{"columns":3},"children":["m1","m2","m3"]},
  "m1":{"type":"Metric","props":{"label":"Revenue","value":"4.2M","unit":"USD","delta":"+8%","trend":"up"},"children":[]},
  "m2":{"type":"Metric","props":{"label":"Orders","value":"12.4k","delta":"+3%","trend":"up"},"children":[]},
  "m3":{"type":"Metric","props":{"label":"Churn","value":"2.1%","delta":"-0.3pt","trend":"down"},"children":[]},
  "cols":{"type":"ColumnChart","props":{"title":"Monthly revenue","items":[{"label":"Jul","value":1.3},{"label":"Aug","value":1.4},{"label":"Sep","value":1.5}],"unit":"M"},"children":[]}
}}
```

A composition view, donut plus stacked bars side by side:

```json
{"root":"row","elements":{
  "row":{"type":"Stack","props":{"direction":"row","gap":12},"children":["pieCard","stackCard"]},
  "pieCard":{"type":"Card","props":{"title":"Traffic sources"},"children":["pie"]},
  "pie":{"type":"PieChart","props":{"items":[{"label":"Search","value":54},{"label":"Direct","value":28},{"label":"Referral","value":18}],"donut":true,"unit":"%"},"children":[]},
  "stackCard":{"type":"Card","props":{"title":"By region"},"children":["stack"]},
  "stack":{"type":"StackedBarChart","props":{"series":["Search","Direct","Referral"],"rows":[{"label":"EU","values":[30,12,8]},{"label":"US","values":[24,16,10]}],"unit":"k"},"children":[]}
}}
```

A non-uniform layout: `Grid` spans put a full-width header over a main-plus-sidebar split, the header is a `justify: "between"` row (title left, badge right), and the header card uses `dense`:

```json
{"root":"grid","elements":{
  "grid":{"type":"Grid","props":{"columns":3,"spans":[3,2,1]},"children":["header","main","side"]},
  "header":{"type":"Card","props":{"dense":true},"children":["headRow"]},
  "headRow":{"type":"Stack","props":{"direction":"row","justify":"between","align":"center"},"children":["headTitle","headBadge"]},
  "headTitle":{"type":"Text","props":{"content":"Deployment status","variant":"title"},"children":[]},
  "headBadge":{"type":"Badge","props":{"label":"live","tone":"success"},"children":[]},
  "main":{"type":"Card","props":{"title":"Services"},"children":["table"]},
  "table":{"type":"Table","props":{"columns":["Service","Version","State"],"rows":[["api","1.4.2","healthy"],["worker","1.4.2","healthy"],["edge","1.4.1","rolling"]]},"children":[]},
  "side":{"type":"Card","props":{"title":"Rollout","subtitle":"canary cohort"},"children":["sideStack"]},
  "sideStack":{"type":"Stack","props":{"gap":10},"children":["sm1","sp"]},
  "sm1":{"type":"Metric","props":{"label":"Uptime","value":"99.98","unit":"%"},"children":[]},
  "sp":{"type":"Progress","props":{"label":"Canary","value":35},"children":[]}
}}
```
