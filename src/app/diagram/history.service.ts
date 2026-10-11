import { Injectable } from '@angular/core';
import * as go from 'gojs/release/go';

/**
 * Where the diagram stands in its history, and whether it is exactly what it
 * was when it was last there. This is what `describeState()` returns, and what
 * the page shows as the coloured line at the top of its History panel.
 */
export interface StateCheck {
  /**
   * The sentence shown to the user. One of:
   *
   * - "Waiting for the initial layout": just loaded, nothing saved yet
   * - "Initial state: matches the startup snapshot": everything is undone, and
   *   the diagram is exactly as it was loaded
   * - "Initial state: differs from the startup snapshot": everything is undone,
   *   but something was not put back
   * - "Transaction 2 of 4": somewhere in between
   * - "Latest state": at the newest state, which was never left by an undo
   * - "Latest state: matches the snapshot taken before undo": everything is
   *   redone, and the diagram is exactly as it was before the first undo
   * - "Latest state: differs from the snapshot taken before undo": everything
   *   is redone, but something is not as it was
   */
  label: string;
  /**
   * The outcome of the comparison, for colouring the label: true = matches
   * (green), false = differs (red), null = there was nothing to compare with
   * (neutral).
   */
  ok: boolean | null;
}

/**
 * Everything the app does with the undo history of the diagram.
 *
 * GoJS keeps that history in an object called the UndoManager, which belongs to
 * the model (the diagram's data). This service is the only place that talks to
 * it. The ideas behind it:
 *
 * - **Transaction.** A group of changes that belong together. Everything changed
 *   between "start" and "commit" becomes one transaction, and one transaction is
 *   one undo step. `record()` makes one.
 *
 * - **History.** The list of committed transactions, oldest first. It is not
 *   only a list of what happened: each transaction remembers the old and the
 *   new value of everything it changed, which is how it can be undone and
 *   redone.
 *
 * - **Position.** How far into the history the diagram currently is. It is the
 *   index of the last transaction that is applied:
 *
 *       history:   [ T0, T1, T2, T3 ]
 *       position:   -1 = nothing applied, the state the diagram was loaded in
 *                    3 = everything applied, the newest state
 *
 *   `undo()` takes back the transaction at the position and moves the position
 *   down by one. `redo()` applies the next transaction and moves it up by one.
 *
 * - **A new change after an undo.** With the position at 1, T2 and T3 can be
 *   redone. Recording a new transaction then throws T2 and T3 away and puts the
 *   new one in their place. That is how undo works in any editor.
 *
 * On top of what GoJS offers, the service checks that undo and redo really
 * restore the diagram. It saves the diagram's data as text at two moments, the
 * state it was loaded in and the newest state, and compares the diagram with
 * those again when undo or redo arrives back there (see `describeState()`).
 *
 * One instance belongs to one diagram, so the service is provided by the
 * component that owns the diagram, not application-wide.
 */
@Injectable()
export class HistoryService {
  private diagram!: go.Diagram;
  /** The diagram's data as text, as it was when loaded. Undoing everything must lead back to it. */
  private initialState: string | null = null;
  /** The same for the newest state. Redoing everything must lead back to it. */
  private latestState: string | null = null;

  // ----- Setting up -----

  /**
   * Tells the service which diagram it works for.
   *
   * `onChange` is called whenever the history may look different: after a
   * transaction was committed by GoJS itself (dragging a node, editing a text in
   * place, drawing a relationship), after an undo or a redo, and when GoJS has
   * cleared the history after loading. The page uses it to refresh its numbers.
   */
  connect(diagram: go.Diagram, onChange: () => void = () => undefined): void {
    this.diagram = diagram;
    diagram.addModelChangedListener((event) => {
      // Single changes inside a transaction are not interesting, only its end.
      if (!event.isTransactionFinished) return;
      // A real new transaction (it has content) means the newest state is a
      // different one now, so what was saved as the newest state is out of date.
      if (event.propertyName === 'CommittedTransaction' && event.object) this.latestState = null;
      onChange();
    });
    // After loading, GoJS lays the diagram out in a transaction of its own and
    // then empties the history without saying so through the model. "Modified"
    // is the event that does fire at that moment.
    diagram.addDiagramListener('Modified', onChange);
  }

  /**
   * Ctrl/Cmd+Z and Ctrl/Cmd+Y normally make GoJS undo and redo on its own. This
   * sends the two shortcuts to the given functions instead, so that the page can
   * do exactly the same for a shortcut as for its Undo and Redo buttons.
   */
  sendShortcutsTo(undo: () => void, redo: () => void): void {
    this.diagram.commandHandler.undo = undo;
    this.diagram.commandHandler.redo = redo;
  }

  /**
   * Shows new data in the diagram, with an empty history of unlimited length.
   * Call `markInitialState()` once the diagram has been laid out.
   */
  load(model: go.Model): void {
    this.diagram.model = model;
    // These two settings must come after the line above: giving a diagram a new
    // model overwrites them with the settings of the model it replaces.
    model.undoManager.isEnabled = true;
    // GoJS keeps 999 transactions by default and drops the oldest beyond that.
    // Then it would be impossible to undo all the way back to the start.
    model.undoManager.maxHistoryLength = -1;
    this.initialState = null;
    this.latestState = null;
  }

  /**
   * Saves the current state as the one that "undo everything" has to lead back
   * to. The page calls this after the first layout, because the layout gives
   * every node its position, and those positions are part of the state.
   */
  markInitialState(): void {
    this.initialState = this.diagram.model.toJson();
  }

  // ----- Recording a change -----

  /**
   * Makes a change to the diagram as one undo step.
   *
   * Everything `change` does to the diagram or its data is collected into one
   * transaction called `name`. If `change` fails halfway, GoJS takes back what
   * it had done so far and nothing is recorded.
   */
  record(name: string, change: () => void): void {
    // The newest state is about to become a different one.
    this.latestState = null;
    this.diagram.commit(change, name);
  }

  // ----- Moving through the history -----

  /** True when there is a transaction to take back. */
  get canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  /** True when a transaction that was taken back can be applied again. */
  get canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  /** Takes back one transaction. Does nothing when there is none. */
  undo(): void {
    this.undoManager.undo();
  }

  /** Applies again the transaction that was taken back last. Does nothing when there is none. */
  redo(): void {
    this.undoManager.redo();
  }

  /**
   * Saves the newest state, so that redoing everything can be checked against it
   * later. It only does something at the moment that matters: when the diagram
   * is at the newest state and that state has not been saved yet.
   *
   * It is separate from `undo()` on purpose. Saving takes time on a big diagram,
   * and the page measures how long an undo takes, so it calls this first, outside
   * of what it measures.
   */
  rememberLatestState(): void {
    const atNewestState = this.canUndo && !this.canRedo;
    if (atNewestState && this.latestState === null) {
      this.latestState = this.diagram.model.toJson();
    }
  }

  // ----- Reading the history -----

  /** How many transactions the history holds, applied or not. */
  get length(): number {
    return this.undoManager.history.count;
  }

  /**
   * The index of the last transaction that is applied; -1 when none is, which
   * is the state the diagram was loaded in.
   */
  get position(): number {
    return this.undoManager.historyIndex;
  }

  /**
   * How many single changes all transactions in the history hold together. GoJS
   * records a change for every value it sets, in the data and in the drawing.
   */
  get recordedChanges(): number {
    let total = 0;
    this.undoManager.history.each((transaction) => (total += transaction.changes.count));
    return total;
  }

  /**
   * The transactions that lie between two positions of the history. This answers
   * "what did that action involve": note the position before the action and the
   * position after it, and pass both.
   *
   *     recording one transaction:  position 1 -> 2   gives [T2]
   *     undoing one:                position 2 -> 1   gives [T2]
   *     undoing everything:         position 3 -> -1  gives [T0, T1, T2, T3]
   *
   * The order of the two positions does not matter.
   */
  transactionsBetween(positionA: number, positionB: number): go.Transaction[] {
    const history = this.undoManager.history;
    const first = Math.min(positionA, positionB) + 1;
    const last = Math.min(Math.max(positionA, positionB), history.count - 1);
    const found: go.Transaction[] = [];
    for (let index = Math.max(first, 0); index <= last; index++) found.push(history.elt(index));
    return found;
  }

  /**
   * Says where in the history the diagram is and, at either end of it, whether
   * the diagram is exactly what it was there before.
   *
   * - At position -1 it is compared with the state it was loaded in.
   * - At the newest state it is compared with what `rememberLatestState()` saved.
   * - In between there is nothing to compare with.
   *
   * "Differs" would mean that an undo or a redo did not restore everything.
   */
  describeState(): StateCheck {
    if (this.initialState === null) return { label: 'Waiting for the initial layout', ok: null };
    const current = (): string => this.diagram.model.toJson();

    if (this.position < 0) {
      return current() === this.initialState
        ? { label: 'Initial state: matches the startup snapshot', ok: true }
        : { label: 'Initial state: differs from the startup snapshot', ok: false };
    }
    if (this.canRedo) {
      return { label: `Transaction ${this.position + 1} of ${this.length}`, ok: null };
    }
    // At the newest state. It was only saved if an undo has led away from it before.
    if (this.latestState === null) return { label: 'Latest state', ok: null };
    return current() === this.latestState
      ? { label: 'Latest state: matches the snapshot taken before undo', ok: true }
      : { label: 'Latest state: differs from the snapshot taken before undo', ok: false };
  }

  // ----- When something went wrong -----

  /**
   * True while a transaction has been started and not yet finished. During an
   * action that is normal. Between actions it means that an error interrupted
   * one.
   */
  get hasUnfinishedTransaction(): boolean {
    return this.undoManager.transactionLevel > 0;
  }

  /**
   * Ends every transaction that an error left unfinished and takes back the
   * changes it had made so far.
   *
   * Why this is needed: while a transaction is unfinished, GoJS records no undo
   * steps (it is still waiting for this one to end), refuses to undo or redo,
   * and refuses to load other data. The diagram would stay like that until the
   * page is reloaded.
   *
   * Returns false, and changes nothing, while the user is in the middle of a
   * drag or of drawing a relationship. The unfinished transaction is
   * then the one of that gesture, and it ends by itself when the gesture does.
   */
  rollBackUnfinished(): boolean {
    if (!this.hasUnfinishedTransaction) return true;
    const gestureInProgress = this.diagram.currentTool !== this.diagram.defaultTool;
    if (gestureInProgress) return false;
    while (this.hasUnfinishedTransaction) this.undoManager.rollbackTransaction();
    return true;
  }

  /** GoJS's own object behind all of the above. It belongs to the model, so a newly loaded model has a new one. */
  private get undoManager(): go.UndoManager {
    return this.diagram.model.undoManager;
  }
}

/**
 * Makes a change to the diagram that is deliberately left out of the history.
 *
 * It is for changes that only alter how the diagram is shown and follow from
 * something else, such as letting nodes fade in after loading, or lengthening a
 * line so that it reaches the outline of a round shape. Undo should not step
 * through those, and they must not make the history look as if the user had
 * changed something.
 */
export function withoutUndo(diagram: go.Diagram, change: () => void): void {
  const before = diagram.skipsUndoManager;
  diagram.skipsUndoManager = true;
  try {
    change();
  } finally {
    diagram.skipsUndoManager = before;
  }
}
