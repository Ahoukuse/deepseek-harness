# @deepseek-ai/dsh-tool-show-svg

English | [中文](README.zh.md)

Model-facing `show_svg` tool: display a model-authored SVG graphic inline in the conversation. Pure presentation — `execute` validates and returns a receipt; the graphic reaches the user through the `svg` render intent (`SvgResultView`), which carries the unsanitized markup from the call arguments. Each UI owns its sanitizer (the web client inlines through DOMPurify in `SvgBlock`); validation here is a well-formedness and budget gate, not a security boundary.

## Tool

`show_svg` accepts:

- `svg` — required complete SVG markup, from `<svg>` to `</svg>`, with a `viewBox`. Size-capped by the `maxSvgChars` config (default 512000 characters); DOCTYPE/ENTITY declarations are rejected.
- `title` — optional short title shown as the card header.

The tool returns canonical `{ displayed: true, chars: <n> }`, and its Native renderer confirms the display in one sentence. The completed call presents the `card: 'svg'` result view; a failed call keeps the generic card.

## Role

This is a pure presenter over the tool registry: it owns the model-facing schema, argument validation, prompt guidance, and the `svg` render-intent projection, and performs no I/O. The rendering surface is the web client's `SvgBlock` (`dsh-client-ui-primitives`), dispatched by `dsh-client-ui-tool`'s keyed toolview.

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`show_svg` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-show-svg), plus a system-prompt section explaining that scripts, event handlers, style elements, and foreignObject are stripped before display.

#### Token effect

Fixed schema and guidance cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

### Tool-call history and result

#### What the model sees

The full markup remains in the assistant tool-call arguments. The result step sees the one-line receipt (`Displayed the SVG graphic (<title>, <n> characters) to the user.`); the graphic itself is never echoed back.

#### Token effect

The markup is data-dependent retained tokens in the call arguments — a large graphic is a large argument payload. The result adds a fixed-size receipt.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Validation is shallow by design** — the host checks size, the `<svg>` root, and the DTD ban, never full XML well-formedness; a malformed interior fails at the UI sanitizer, where the card degrades to an invalid-state note.
- **The graphic persists at full size in the session log** — the markup rides the call arguments; there is no spill route for oversized graphics beyond the hard `maxSvgChars` failure.
- **No animation surface** — the web sanitizer strips `animate`/`set` along with scripts, so a graphic renders statically even though SMIL markup validates here.
