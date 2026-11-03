import { uiFr } from './ui.fr';

// The English file must have exactly the French file's keys, with any string values.
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type UiCopyShape = Widen<typeof uiFr>;
