# pi-ext-durable

A normal pi extension running inside a Cloudflare Durable Object, on pi-durable and the Agents SDK.

`extensions/hello.ts` is the stock example from `@earendil-works/pi-coding-agent@1.2.0`. `npm install` downloads it unchanged with `scripts/fetch-extension.mjs`; it is not committed. A `PiAgent` (an Agents SDK `Agent`) loads it, gives its tool to a pi-durable `Harness` stored in the Durable Object's SQLite, and runs one turn. The model calls `hello`, the extension's `execute()` runs, and the result goes back to the model.

```sh
npm install
npm run check    # typecheck + one test in workerd
npm run dev      # then: curl 'localhost:8787/prove?name=demo'
```

```json
{
  "loadedTools": ["hello"],
  "unsupported": [],
  "toolResult": "Hello, durable pi!",
  "answer": "The extension said: Hello, durable pi!",
  "entries": 5
}
```

The model is pi-ai's scripted `faux` provider, so the proof needs no API key. To use a real model, give `createModels()` a real provider.

## How it works

- `src/bridge.ts` gives the extension a pi `ExtensionAPI` object. `registerTool` turns each pi tool into a pi-durable `ToolRegistration`. Lifecycle handlers from `on()` are kept and can be fired with `emit()`. Calls with no meaning in a headless agent, such as `registerCommand`, are recorded in `unsupported`.
- `src/pi-coding-agent-shim.ts` answers the extension's `import ... from "@earendil-works/pi-coding-agent"`. Wrangler and Vitest alias the package to it.
- `src/index.ts` is the Agent. It opens the Harness on `this.ctx.storage`, installs the extension, submits one input, and returns what happened.

## Why a shim

The real `@earendil-works/pi-coding-agent` is a Node CLI. Bundled into a Worker it is about 7 MB and fails at startup in `dist/config.js` (`fileURLToPath(undefined)`). Extensions only need `defineTool` and the `ExtensionAPI` type from it, so the shim provides those.

## What is and is not covered

Covered:

- `pi.registerTool`, including `execute(toolCallId, params, signal, onUpdate, ctx)`, `content`, `details`, and `isError`.
- `pi.on(...)` handlers are stored and can be fired.
- A headless `ctx` with `cwd`, `hasUI: false`, and a `ui` that does nothing.

Not covered yet:

- Streaming `onUpdate`, abort `signal`, and `ctx.sessionManager`.
- Commands, shortcuts, flags, renderers, providers, and MCP servers registered by extensions.
- Extensions that need Node APIs such as `child_process` or a real filesystem. These need a container, for example a Cloudflare Sandbox, with the tool call forwarded to it.

## Versions

pi-durable, pi-ai and chord 1.2.0, agents 0.28.1, wrangler 4.150.0. In 1.2.0, a pi-durable tool result uses `output`, not `content`.

## machine/

`machine/` is a second, tiny pi extension. Its `machine_report` tool uses Node (`child_process`, `os`), so it only works on a real machine. coil loads it into a thread computer with the source `https://github.com/acoyfellow/pi-ext-durable#main:machine`.
