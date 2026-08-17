# @deepseek-ai/dsh-client-ui-embeds

English | [中文](README.zh.md)

Prose-embed renderers: the browser half registers the `dsh-svg` and `dsh-ui` schemes under the keyed `conversation.chat.embed` slot (declared by `ui-conversation`), so a reply line `![title](dsh-svg://<id>)` or `![title](dsh-ui://<id>)` renders as the referenced content in place. Resolution reads the conversation snapshot through the standard session kit and matches settled tool calls by call id — the `card:'svg'` render intent when present, else the persisted `show_svg`/`show_ui` arguments (nested Code-Mode dispatches carry no render-intent views, so arguments are the one channel present on every path). An unresolved id degrades to ordinary markdown, which keeps the alt text.

`dsh-svg` renders through `SvgBlock` (`ui-primitives` owns the DOMPurify sanitization boundary). `dsh-ui` renders through a json-render catalog (`@json-render/core` + `@json-render/react`, zod-validated props, NO actions declared) whose v1 vocabulary is dashboard/data-viz: Stack, Grid, Card, Text, Metric, Badge, Progress, Table, BarChart. A catalog-invalid spec is contained by an error boundary and degrades to a quiet note. The host-side registrars are `dsh-tool-show-svg` and `dsh-tool-show-ui`; their guidance enumerates this same catalog and MUST evolve with it.

## Model Experience

None. Embed rendering is browser-side UI wiring; nothing here enters a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Resolution is a linear scan per reference** — references are rare and the node window is capped; add an id index if embeds become dense.
- **Widget actions and streaming are deferred** — the catalog declares no actions and specs render once settled; json-render's action bindings and patch streaming are the step-3 items.
- **Widget copy is not localized** — the boundary note is inline Chinese, matching the label-prop posture of the block primitives; localize when the embed surfaces grow settings.
