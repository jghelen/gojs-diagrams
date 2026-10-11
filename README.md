# GoJS UndoManager bench

Angular 22 app that measures GoJS 4 undo/redo (`UndoManager`) on a diagram of 200 to 2000 nodes
with a parent-child hierarchy and extra cross-reference links.

## Run

Angular 22 needs Node 24.15 or newer; `.nvmrc` pins Node 24.

```bash
nvm use
npm install
npm start
```

Then open http://localhost:4200.

## What it does

- Every node has `title`, `subtitle`, `shape` and `color`. Edits, drags, layout switches and
  line-type switches are each one undoable transaction.
- **Undo all** goes back to the initial state and compares the model JSON with a snapshot taken at
  startup; **Redo all** is checked the same way against a snapshot taken before undoing.
- The log shows, per operation, the synchronous time and the time until the result was painted.

## Notes

- GoJS has no `HistoryManager`; the class is `UndoManager` (`model.undoManager`).
- GoJS is used without a licence key, which is only allowed for evaluation or non-commercial use
  and shows a watermark.
- Imports use `gojs/release/go` so that `ng serve` measures the production build of GoJS.
