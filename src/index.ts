import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare';
import { Agent, getAgentByName } from 'agents';
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
  async prove(prompt: string): Promise<Proof> {
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

    const submission = await conversation.submit({ type: 'input', content: prompt }, BACKGROUND_CONTEXT);

    await submission.wait(BACKGROUND_CONTEXT);
    await conversation.waitForIdle(BACKGROUND_CONTEXT);

    const page = await conversation.entries({}, 100, undefined, BACKGROUND_CONTEXT);
    const messages = page.items.flatMap((entry) => entry.model ?? []);
    const textOf = (role: string) =>
      messages
        .filter((message) => message.role === role)
        .flatMap((message): readonly { readonly type: string; readonly text?: string }[] =>
          Array.isArray(message.content) ? message.content : [],
        )
        .flatMap((block) => (block.type === 'text' && block.text !== undefined ? [block.text] : []))
        .join('\n');

    await harness.close(BACKGROUND_CONTEXT);

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

    if (url.pathname !== '/prove') return new Response('GET /prove?name=<id>', { status: 404 });

    const agent = await getAgentByName(env.PI_AGENT, url.searchParams.get('name') ?? crypto.randomUUID());

    return Response.json(await agent.prove('Greet me with your hello tool.'));
  },
};
