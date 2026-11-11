import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

const clock = defineTool({
  name: 'clock',
  label: 'Clock',
  description: 'Current time at the Cloudflare edge, in UTC and ISO 8601.',
  parameters: Type.Object({}),
  async execute() {
    const now = new Date().toISOString();

    return { content: [{ type: 'text', text: now }], details: { now } };
  },
});

const fetchPage = defineTool({
  name: 'fetch_page',
  label: 'Fetch page',
  description: 'Fetch a public https URL from the Cloudflare edge and return its status and the first 4000 characters of text.',
  parameters: Type.Object({ url: Type.String({ description: 'An https:// URL' }) }),
  async execute(_id, params) {
    if (!params.url.startsWith('https://')) {
      return { content: [{ type: 'text', text: 'Only https:// URLs are allowed.' }], isError: true };
    }

    const response = await fetch(params.url, { redirect: 'follow', headers: { 'user-agent': 'pi-ext-durable-demo' } });
    const text = (await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      content: [{ type: 'text', text: `HTTP ${response.status}\n${text.slice(0, 4000)}` }],
      details: { status: response.status, url: response.url },
    };
  },
});

const whereAmI = defineTool({
  name: 'where_am_i',
  label: 'Where am I',
  description: 'Which Cloudflare data center and country this Durable Object is serving from.',
  parameters: Type.Object({}),
  async execute() {
    const trace = await (await fetch('https://www.cloudflare.com/cdn-cgi/trace')).text();
    const fields = Object.fromEntries(trace.trim().split('\n').map((line) => line.split('=') as [string, string]));
    const summary = `colo=${fields.colo} loc=${fields.loc} http=${fields.http}`;

    return { content: [{ type: 'text', text: summary }], details: { colo: fields.colo, loc: fields.loc } };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(clock);
  pi.registerTool(fetchPage);
  pi.registerTool(whereAmI);
}
