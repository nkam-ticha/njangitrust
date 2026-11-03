// Side effects that must wait until a database transaction has committed (realtime events,
// pushes, provider calls, job scheduling): nothing is announced that could still roll back.
import { componentLogger } from './logger';

const log = componentLogger('after-commit');

export type Effect = () => void | Promise<void>;

/** Where code running inside a transaction queues its after-commit effects. */
export interface EffectSink {
  add(effect: Effect): void;
}

export class AfterCommit implements EffectSink {
  private readonly effects: Effect[] = [];

  add(effect: Effect): void {
    this.effects.push(effect);
  }

  /** Runs every effect in order. A failing effect is logged and never undoes the commit. */
  async run(): Promise<void> {
    for (const effect of this.effects.splice(0)) {
      try {
        await effect();
      } catch (error) {
        log.error({ err: error }, 'after-commit effect failed');
      }
    }
  }
}
