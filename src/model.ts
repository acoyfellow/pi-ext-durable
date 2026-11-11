import { createProvider } from '@earendil-works/pi-ai/models';
import type { Provider } from '@earendil-works/pi-ai/models';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { CLOUDFLARE_WORKERS_AI_MODELS } from '@earendil-works/pi-ai/providers/cloudflare-workers-ai.models';

export const PROVIDER_ID = 'workers-ai-binding';
export const MODEL_ID = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';

const BINDING_BASE_URL = 'https://workers-ai.binding/v1';

const baseModel = CLOUDFLARE_WORKERS_AI_MODELS['@cf/deepseek-ai/deepseek-v4-flash-0731'];

const bindingModel = {
  ...baseModel,
  id: MODEL_ID,
  name: 'DeepSeek V4.1 Flash 1017',
  provider: PROVIDER_ID,
  baseUrl: BINDING_BASE_URL,
  cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
};

const bindingFetch =
  (ai: Ai): typeof fetch =>
  async (input, init) => {
    const request = new Request(input, init);
    const body = (await request.json()) as Record<string, unknown>;
    const { model, ...inputs } = body;
    const response = (await ai.run(String(model) as keyof AiModels, inputs as never, {
      returnRawResponse: true,
    } as never)) as unknown as Response;

    return response;
  };

export const workersAiBindingProvider = (ai: Ai): Provider => {
  const api = openAICompletionsApi();
  const fetchViaBinding = bindingFetch(ai);

  return createProvider({
    id: PROVIDER_ID,
    name: 'Workers AI (binding)',
    auth: { apiKey: { name: 'Workers AI binding', resolve: async () => ({ auth: { apiKey: 'binding' } }) } },
    models: [bindingModel],
    api: {
      stream: (model, context, options) => api.stream(model, context, { ...options, fetch: fetchViaBinding }),
      streamSimple: (model, context, options) => api.streamSimple(model, context, { ...options, fetch: fetchViaBinding }),
    },
  });
};
