import { Injectable, inject, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { afterNextPaint, timeSteps } from '../diagram/benchmark';
import { ChangeDetails, describeChanges } from '../diagram/change-details';
import { FAILURE_NOTICE, MAX_LOG_ENTRIES } from '../diagram/constants';
import { HistoryService } from '../diagram/history.service';

/**
 * Something the user asked for, cut into the steps whose time is measured: one
 * step is one transaction that is recorded, undone or redone.
 */
export interface Operation {
  /** Shown in the benchmark statistics. */
  name: string;
  /** Whether there is another step to do. */
  hasNext: () => boolean;
  step: () => void;
  /** Lets the page show its disabled buttons before a long operation blocks it. */
  showBusyFirst?: boolean;
}

/** One row of the benchmark statistics: an operation that was carried out, and how long it took. */
export interface LogEntry {
  id: number;
  op: string;
  steps: number;
  changes: number;
  /** What those changes were, for the dialog behind the number. */
  details: ChangeDetails;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  /** From the start of the operation until the result was painted; null if the tab was hidden. */
  paintMs: number | null;
}

/** Wraps a condition so that it is true for at most one step. */
export function once(condition: () => boolean): () => boolean {
  let used = false;
  return () => {
    if (used) return false;
    used = true;
    return condition();
  };
}

/**
 * Carries out operations one at a time, measures them, and keeps the list of
 * what was measured: the benchmark statistics.
 *
 * It also holds the two things the whole page looks at while an operation runs
 * or after it failed: `busy`, which disables every control, and `failure`, the
 * notice shown when an operation could not be completed.
 */
@Injectable()
export class OperationRunner {
  private readonly history = inject(HistoryService);

  /** True while an operation runs, and from loading a diagram until it is fully shown. */
  readonly busy = signal(true);
  /** The operations carried out so far, newest first. */
  readonly log = signal<LogEntry[]>([]);
  /** What to tell the user after an operation failed; null when the last one went well. */
  readonly failure = signal<string | null>(null);

  private diagram!: go.Diagram;
  private beforeEach: () => void = () => undefined;
  private afterEach: () => void = () => undefined;
  private measuring = false;
  private nextLogId = 1;
  private queue: Promise<void> = Promise.resolve();

  /**
   * Says which diagram the operations work on, and what the page wants done
   * around each of them: `beforeEach` puts display-only things away (a
   * highlight, an open card), `afterEach` refreshes what the page shows.
   */
  connect(diagram: go.Diagram, hooks: { beforeEach: () => void; afterEach: () => void }): void {
    this.diagram = diagram;
    this.beforeEach = hooks.beforeEach;
    this.afterEach = hooks.afterEach;
  }

  /** True while the clock is running, so that nothing else adds its own work to the measurement. */
  get isMeasuring(): boolean {
    return this.measuring;
  }

  /**
   * Queues an operation. Operations run strictly one after another, and each is
   * planned only when its turn comes, so one requested while another is still
   * waiting for its frame is neither lost nor based on an outdated history.
   */
  run(plan: () => Operation): Promise<void> {
    const run = this.queue.then(() => this.runOperation(plan));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Empties the benchmark statistics. */
  clearLog(): void {
    this.log.set([]);
  }

  /** After an operation failed: undoes what it had done so far, so that work can go on, and says so. */
  recoverFrom(error: unknown): void {
    console.error('The action failed and was undone.', error);
    this.measuring = false;
    this.diagram.currentTool.doCancel();
    this.history.rollBackUnfinished();
    this.failure.set(FAILURE_NOTICE);
  }

  private async runOperation(plan: () => Operation): Promise<void> {
    // Busy at this point means a diagram is still loading.
    if (this.busy()) return;
    // A drag is in the middle of its own transaction; let it finish first.
    if (!this.history.rollBackUnfinished()) return;
    this.failure.set(null);
    this.beforeEach();
    const { name, hasNext, step, showBusyFirst } = plan();
    this.busy.set(true);
    try {
      // Long runs block the main thread, so let the disabled buttons paint first.
      if (showBusyFirst) await afterNextPaint();

      this.measuring = true;
      const positionBefore = this.history.position;
      const start = performance.now();
      const result = timeSteps(hasNext, step);
      this.measuring = false;
      const paintedAt = await afterNextPaint();

      if (result.steps > 0) {
        // The transactions this operation recorded, undid or redid.
        const involved = this.history.transactionsBetween(positionBefore, this.history.position);
        const entry: LogEntry = {
          id: this.nextLogId++,
          op: name,
          steps: result.steps,
          changes: involved.reduce((sum, transaction) => sum + transaction.changes.count, 0),
          details: describeChanges(involved),
          totalMs: result.totalMs,
          avgMs: result.totalMs / result.steps,
          minMs: result.minMs,
          maxMs: result.maxMs,
          paintMs: paintedAt === null ? null : paintedAt - start,
        };
        this.log.update((entries) => [entry, ...entries].slice(0, MAX_LOG_ENTRIES));
      }
    } catch (error) {
      this.recoverFrom(error);
    } finally {
      this.measuring = false;
      this.afterEach();
      this.busy.set(false);
    }
  }
}
