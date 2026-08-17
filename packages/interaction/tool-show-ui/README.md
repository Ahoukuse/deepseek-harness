# @deepseek-ai/dsh-tool-show-ui

English | [中文](README.zh.md)

Model-facing `show_ui` tool: register a catalog-constrained widget spec (json-render flat tree) and reference it into the reply as `![title](dsh-ui://<id>)` for inline rendering. Pure presentation — `execute` validates shallowly (size cap, flat-tree shape) and returns the call id as the reference id; the web client's `dsh-client-ui-embeds` plugin resolves the persisted arguments and renders through its zod-validated component catalog, which is the real vocabulary and security boundary. The component enumeration in this package's guidance text and the client catalog MUST evolve together.

## Tool

`show_ui` accepts:

- `spec` — required flat element tree `{"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":[...]}}}`, size-capped by `maxSpecChars` (default 262144 characters).
- `title` — optional short title.

The tool returns canonical `{ uiId, chars }`; its Native renderer instructs the model to place `![<title>](dsh-ui://<uiId>)` on its own line. v1 declares no widget actions: widgets are display-only.

## Model Experience

### Tool schema

#### What the model sees

The generated [`show_ui` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-show-ui) plus a system-prompt section enumerating the widget catalog (Stack, Grid, Card, Text, Metric, Badge, Progress, Table, BarChart) and the reference-placement rule.

#### Token effect

Fixed schema and guidance cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

### Tool-call history and result

#### What the model sees

The full spec remains in the call arguments; the result step sees a one-line receipt carrying the exact reference line to write.

#### Token effect

The spec is data-dependent retained tokens in the call arguments; the receipt is fixed-size.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix.

## Known Limitations and Deferred Work

- **Host validation is shallow by design** — component types and props are validated client-side against the catalog; a catalog-invalid spec degrades to a quiet note in the reply and the raw arguments stay inspectable in the tool row.
- **The guidance text duplicates the client catalog** — the host cannot import the browser catalog, so the two enumerations must be updated together.
- **No actions and no streaming** — widgets are display-only and render once the call settles; json-render's action bindings and JSONL patch streaming are deliberate deferrals.
