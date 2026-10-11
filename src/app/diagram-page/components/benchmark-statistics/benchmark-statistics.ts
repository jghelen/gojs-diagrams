import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LOG_OPEN_KEY } from '../../diagram/constants';
import { readFlag, writeFlag } from '../browser';
import { DeveloperTools } from '../developer-tools';
import { LogEntry, OperationRunner } from '../operation-runner';

/**
 * The benchmark statistics below the canvas: one row per operation with its
 * timings, and behind the number of changes of a row, the dialog that lists them.
 *
 * The rows themselves are kept by the OperationRunner. The table is part of the
 * developer tools and is on screen only while those are shown.
 */
@Component({
  selector: 'app-benchmark-statistics',
  templateUrl: './benchmark-statistics.html',
  styleUrl: './benchmark-statistics.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BenchmarkStatistics {
  private readonly runner = inject(OperationRunner);
  protected readonly developerTools = inject(DeveloperTools);

  /** The table was opened or closed, so the canvas above it has a new height. */
  readonly toggled = output<void>();

  protected readonly busy = this.runner.busy;
  /** The operations carried out so far, newest first. */
  protected readonly log = this.runner.log;
  /** Whether the table is shown; closing it gives the canvas its room. */
  protected readonly logOpen = signal(readFlag(LOG_OPEN_KEY, true));
  /** The operation whose changes are listed in the changes dialog. */
  protected readonly changesShown = signal<LogEntry | null>(null);

  private readonly changesDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('changesDialog');

  /** Opens or closes the table, and remembers the choice for the next visit. */
  protected toggleLog(): void {
    this.logOpen.update((open) => !open);
    writeFlag(LOG_OPEN_KEY, this.logOpen());
    this.toggled.emit();
  }

  /** Opens the list of what an operation changed. */
  protected showChanges(entry: LogEntry): void {
    this.changesShown.set(entry);
    this.changesDialog().nativeElement.showModal();
  }

  protected closeChanges(): void {
    this.changesDialog().nativeElement.close();
  }

  protected formatMs(value: number | null): string {
    if (value === null) return '–';
    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }
}
