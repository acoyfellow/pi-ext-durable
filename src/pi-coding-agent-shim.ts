import type { TSchema } from '@earendil-works/pi-ai';
import type { PiTool } from './bridge';

export type { PiApi as ExtensionAPI, PiContext as ExtensionContext } from './bridge';

export const defineTool = <TParams extends TSchema>(tool: PiTool<TParams>): PiTool<TParams> => tool;
