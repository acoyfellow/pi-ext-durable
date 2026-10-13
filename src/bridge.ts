import type { JsonValue } from '@earendil-works/chord';
import type { Static, TSchema } from '@earendil-works/pi-ai';
import { defineExtension, defineTool, type Extension, type ToolRegistration } from '@earendil-works/pi-durable';

type PiContent = { readonly type: string; readonly text?: string };

export type PiToolResult = {
  readonly content: readonly PiContent[];
  readonly details?: unknown;
  readonly isError?: boolean;
};

export type PiTool<TParams extends TSchema = TSchema> = {
  readonly name: string;
  readonly label?: string;
  readonly description: string;
  readonly parameters: TParams;
  execute(
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate: ((partial: PiToolResult) => void) | undefined,
    ctx: PiContext,
  ): Promise<PiToolResult>;
};

export type PiContext = {
  readonly cwd: string;
  readonly hasUI: false;
  readonly mode: 'headless';
  readonly signal: AbortSignal | undefined;
  readonly ui: typeof HEADLESS_UI;
};

type Handler = (event: unknown, ctx: PiContext) => unknown;

export type PiExtensionFactory = (pi: PiApi) => void | Promise<void>;

export type Unsupported = { readonly method: string; readonly name: string };

const HEADLESS_UI = {
  notify: () => undefined,
  setStatus: () => undefined,
  setWidget: () => undefined,
  confirm: async () => false,
  select: async () => undefined,
  input: async () => undefined,
  custom: async () => undefined,
};

const headlessContext = (cwd: string, signal: AbortSignal | undefined): PiContext => ({
  cwd,
  hasUI: false,
  mode: 'headless',
  signal,
  ui: HEADLESS_UI,
});

const toJson = (value: unknown): JsonValue =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

const textBlocks = (content: readonly PiContent[]) =>
  content.flatMap((block) =>
    block.type === 'text' && block.text !== undefined
      ? [{ type: 'text' as const, text: block.text }]
      : [],
  );

const fromPiTool = <TParams extends TSchema>(tool: PiTool<TParams>, cwd: string): ToolRegistration =>
  defineTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    replay: 'unsafe',
    execute: async (args, api) => {
      const result = await tool.execute(api.callId, args, undefined, undefined, headlessContext(cwd, undefined));

      return {
        output: textBlocks(result.content),
        details: toJson(result.details),
        ...(result.isError === true ? { isError: true } : {}),
      };
    },
  });

export type PiApi = ReturnType<typeof createPiApi>['api'];

type Registered = { readonly name: string; readonly description: string; readonly tool: ToolRegistration };

const createPiApi = (cwd: string) => {
  const tools: Registered[] = [];
  const handlers = new Map<string, Handler[]>();
  const unsupported: Unsupported[] = [];
  const ignore = (method: string) => (name: string) => {
    unsupported.push({ method, name });
  };

  const api = {
    registerTool: <TParams extends TSchema>(tool: PiTool<TParams>) => {
      tools.push({ name: tool.name, description: tool.description, tool: fromPiTool(tool, cwd) });
    },
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);

      return () => handlers.set(event, (handlers.get(event) ?? []).filter((each) => each !== handler));
    },
    registerCommand: ignore('registerCommand'),
    registerShortcut: ignore('registerShortcut'),
    registerFlag: ignore('registerFlag'),
    registerMessageRenderer: ignore('registerMessageRenderer'),
    registerToolRenderer: () => ignore('registerToolRenderer')('*'),
    getFlag: () => undefined,
    sendMessage: () => ignore('sendMessage')('*'),
    appendEntry: (customType: string) => ignore('appendEntry')(customType),
    getActiveTools: () => tools.map((tool) => tool.name),
    getAllTools: () => tools.map((tool) => ({ name: tool.name, description: tool.description })),
    setActiveTools: () => undefined,
  };

  return { api, tools, handlers, unsupported };
};

export type LoadedPiExtension = {
  readonly extension: Extension;
  readonly tools: readonly string[];
  readonly unsupported: readonly Unsupported[];
  readonly emit: (event: string, payload?: unknown) => Promise<void>;
};

export const loadPiExtension = async (
  name: string,
  factory: PiExtensionFactory,
  cwd = '/',
): Promise<LoadedPiExtension> => {
  const { api, tools, handlers, unsupported } = createPiApi(cwd);

  await factory(api);

  return {
    extension: defineExtension({ name, tools: tools.map((each) => each.tool) }),
    tools: tools.map((each) => each.name),
    unsupported,
    emit: async (event, payload = {}) => {
      for (const handler of handlers.get(event) ?? []) await handler(payload, headlessContext(cwd, undefined));
    },
  };
};
