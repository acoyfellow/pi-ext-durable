import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Context } from '@earendil-works/chord';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, Harness, watchEvents } from '@earendil-works/pi-durable';
import type { AgentEvent, Conversation, Cursor } from '@earendil-works/pi-durable';
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare';
import { Agent, getAgentByName } from 'agents';
import type { Connection, WSMessage } from 'agents';
import hello from '../extensions/hello';
import { loadPiExtension } from './bridge';

type Env = { readonly PI_AGENT: DurableObjectNamespace<PiAgent> };

export type Proof = {
  readonly loadedTools: readonly string[];
  readonly unsupported: readonly { readonly method: string; readonly name: string }[];
  readonly toolResult: string;
  readonly answer: string;
  readonly entries: number;
};

interface Session {
  readonly harness: Harness;
  readonly conversation: Conversation;
  readonly context: Context;
  readonly stream: { stop(): Promise<unknown> };
}

const scriptedModel = () => {
  const faux = fauxProvider({ models: [{ id: 'scripted' }] });

  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('hello', { name: 'durable pi' }), { stopReason: 'toolUse' }),
    (context) => {
      const result = context.messages.findLast((message) => message.role === 'toolResult');
      const said = result?.content.find((block) => block.type === 'text');

      return fauxAssistantMessage(fauxText(`The extension said: ${said?.type === 'text' ? said.text : '?'}`));
    },
  ]);

  return faux;
};

export class PiAgent extends Agent<Env> {
  private session: Session | undefined;
  private readonly sockets = new Map<Connection, { cursor: Cursor | undefined }>();

  private async openSession(): Promise<Session> {
    if (this.session) return this.session;

    const loaded = await loadPiExtension('hello', hello);
    const faux = scriptedModel();
    const models = createModels();

    models.setProvider(faux.provider);

    const registry = createRegistry();

    registry.install(loaded.extension);

    const harness = await Harness.open(
      await openDurableObjectSqliteStorage(this.ctx.storage),
      { models, registry },
      BACKGROUND_CONTEXT,
    );
    const conversation = await harness.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: faux.provider.id, modelId: 'scripted' } },
    });

    harness.resume();

    const stream = await watchEvents(harness, conversation.id, BACKGROUND_CONTEXT);
    stream.start(async (events: readonly AgentEvent[]) => {
      if (events.length === 0) return;

      for (const [connection, state] of this.sockets) {
        if (connection.readyState !== 1) continue;

        connection.send(JSON.stringify({ type: 'agent', events, cursor: state.cursor ?? null }));
      }
    });

    this.session = { harness, conversation, context: BACKGROUND_CONTEXT, stream };
    return this.session;
  }

  private async replay(connection: Connection, state: { cursor: Cursor | undefined }): Promise<void> {
    const { conversation, context } = await this.openSession();

    const page = await conversation.entries({}, 100, state.cursor, context);

    connection.send(JSON.stringify({ type: 'history', entries: page.items, cursor: page.next ?? null }));
    state.cursor = page.next ?? state.cursor;
  }

  async onConnect(connection: Connection): Promise<void> {
    const state: { cursor: Cursor | undefined } = { cursor: undefined };
    this.sockets.set(connection, state);
    await this.replay(connection, state);
  }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    const data = JSON.parse(message as string) as { type?: string; content?: string };

    if (data.type === 'input') {
      const { conversation, context } = await this.openSession();
      const submission = await conversation.submit({ type: 'input', content: data.content ?? '' }, context);
      await submission.wait(context);
      const state = this.sockets.get(connection);
      if (state) await this.replay(connection, state);
    } else if (data.type === 'abort') {
      const { conversation, context } = await this.openSession();
      await conversation.abort(context, {});
    }
  }

  async onClose(connection: Connection): Promise<void> {
    this.sockets.delete(connection);
  }

  async prove(prompt: string): Promise<Proof> {
    const loaded = await loadPiExtension('hello', hello);
    const { conversation, harness, context } = await this.openSession();

    const submission = await conversation.submit({ type: 'input', content: prompt }, context);

    await submission.wait(context);
    await conversation.waitForIdle(context);

    const page = await conversation.entries({}, 100, undefined, context);
    const messages = page.items.flatMap((entry) => entry.model ?? []);
    const textOf = (role: string) =>
      messages
        .filter((message) => message.role === role)
        .flatMap((message): readonly { readonly type: string; readonly text?: string }[] =>
          Array.isArray(message.content) ? message.content : [],
        )
        .flatMap((block) => (block.type === 'text' && block.text !== undefined ? [block.text] : []))
        .join('\n');

    await harness.close(context);

    return {
      loadedTools: loaded.tools,
      unsupported: loaded.unsupported,
      toolResult: textOf('toolResult'),
      answer: textOf('assistant'),
      entries: page.items.length,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/turn' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const agent = await getAgentByName(env.PI_AGENT, url.searchParams.get('name') ?? crypto.randomUUID());
      return agent.fetch(request);
    }

    if (url.pathname !== '/prove') return new Response('GET /prove?name=<id> or WS /turn?name=<id>', { status: 404 });

    const agent = await getAgentByName(env.PI_AGENT, url.searchParams.get('name') ?? crypto.randomUUID());

    return Response.json(await agent.prove('Greet me with your hello tool.'));
  },
};
