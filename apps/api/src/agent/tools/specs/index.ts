// The whole catalogue of spec 4.6, as pure specs (no service is imported here).
import type { ToolSpec } from '../types';
import { actionSpecs } from './actions';
import { preferenceSpecs } from './preferences';
import { readingSpecs } from './reading';

export const SPECS = { ...readingSpecs, ...preferenceSpecs, ...actionSpecs };
export type ToolName = keyof typeof SPECS;

export const ALL_SPECS: readonly ToolSpec[] = Object.values(SPECS);

/** The tools of spec 4.6, by name; `reply_privately` is the runtime's own group-channel tool. */
export const RUNTIME_TOOLS = ['reply_privately'] as const;
