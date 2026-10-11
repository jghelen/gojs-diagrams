# GoJS UndoManager bench

An Angular 22 app for trying out fund-structure diagrams built with [GoJS](https://gojs.net) 4, and
for measuring how fast GoJS's undo/redo history is on diagrams of 24 to 2000 nodes.

The first half of this document is for people who use the app. The second half explains how it is
built and how to run its tests.

- [What it is for](#what-it-is-for)
- [Quick start](#quick-start)
- [User guide](#user-guide)
- [How it works](#how-it-works)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Build and hosting](#build-and-hosting)
- [Known limits](#known-limits)
- [Licence](#licence)

## What it is for

The question behind the app is: **if a diagram editor for fund structures is built on GoJS, is its
undo/redo good enough for large diagrams?** The app answers that by letting you

- load a diagram: a small sample fund structure, or 30 to 2000 generated funds,
- change it the way a user would: rename funds, restyle them by fund type, comment on them, move
  them, add and delete them, add and remove relationships, switch the layout,
- step back through every change with **Undo**, all the way to the starting state, and forward
  again with **Redo**,
- and see, for every operation, how long it took.

Every change is one undo step. After "Undo all" the app checks that the diagram is exactly what it
was at the start, and tells you so.

## Quick start

Angular 22 needs Node 24.15 or newer; `.nvmrc` pins Node 24.

```bash
nvm use
npm install
npm start
```

Then open http://localhost:4200.

## User guide

### The screen

| Area                                  | What it holds                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar                               | The **Data** dropdown on the left; on the right **Styles**, the **Actions** menu, a reload icon that resets the diagram, and a new-diagram icon |
| Bar above the canvas                  | The diagram's **name** and **description**, and the **search** box                                                                              |
| Tool strip (left edge of the canvas)  | Add node, undo, redo, zoom in, zoom out, zoom to fit, layout, lines, auto arrange                                                               |
| Overview (bottom right of the canvas) | A small picture of the whole diagram; drag its gold box to move around                                                                          |
| Canvas (left)                         | The diagram. Scroll to pan, Ctrl/Cmd + wheel (or pinch) to zoom                                                                                 |
| Timing table (below the canvas)       | One row per operation, newest first                                                                                                             |
| Side panel (right)                    | **History**, **Edits**, **Selected relationships**, **Selected nodes**                                                                          |

### Name and description

The bar above the canvas has two boxes, for the name of the diagram and a description. A loaded
diagram starts out named after its data, a new one as "Untitled diagram". Both are stored with the
diagram, and changing either is one undo step.

### Searching for a node

Type part of a name into the search box at the right of the bar above the canvas. Next to it you
see how many nodes match, whatever the case of the letters. The **<** and **>** buttons, or Enter
and Shift+Enter, step through the matches: the node you are on gets a thick gold outline, is
brought to the middle of the view and, if the diagram was zoomed out, zoomed in to full size. The
counter then reads "2 of 7". Clicking another node takes the outline away again. Searching never
changes the diagram or its undo history.

### Finding your way around

The overview in the bottom right corner of the canvas shows the whole diagram in small. The gold
box marks the part that is on screen: drag it, or click somewhere else in the overview, to move
there.

### Actions

The **Actions** menu in the top bar has four entries:

- **Export PNG** downloads a picture of the whole diagram, not just the part on screen, as
  `fund-diagram.png`. It is drawn at twice the size of the diagram so that small text stays
  sharp, and without the gold outlines and dimming of a selection.
- **Print** opens the browser's print dialog with a picture of the whole diagram.
- **Save** and **Save As** are shown but not available yet.

When the diagram has no nodes, the tool strip disables zooming, layout and auto arrange. Add node,
and undo if there is something to undo, stay available.

### Choosing what to look at

- **Data** picks the diagram. "Sample fund structure" is an umbrella fund with three families of
  sub-funds and their feeder funds (24 funds). The others are generated diagrams of 30, 100, 200,
  500, 1000 or 2000 funds. The app opens with 30.
- **Layout**, the icon under the zoom buttons in the tool strip, arranges the nodes. Click it to
  see one icon per layout (hover over an icon for its name) and click the one you want: Top to
  bottom, Bottom to top, Circle, Layered digraph, Force-directed or Grid.
- **Lines**, the icon under the layout icon in the tool strip, picks how relationships are
  drawn. Click it to see one icon per line type, named on hover. The two "Orthogonal" types
  route around nodes; "Straight" and "Curved" cannot, and say "(crosses nodes)". Routing around
  nodes is slow on large diagrams, so above 200 nodes a new diagram starts with straight lines.
- **Auto arrange**, the last icon of the tool strip, runs the current layout again, which tidies
  up after you moved nodes by hand.
- **Zoom to fit**, in the tool strip under zoom out, shows the whole diagram.
- **Reset diagram**, the reload icon in the top bar, reloads the chosen data from scratch and
  clears the history.
- **New diagram**, the icon next to it, opens an empty canvas to build a diagram from scratch:
  add nodes with the plus in the tool strip and draw relationships between them. "Empty
  diagram" in the **Data** dropdown does the same.

Switching the layout or the line type, and Auto arrange, are undo steps like any other change.

When a diagram is loaded, its nodes appear one after another, each relationship as soon as both
of its ends are there. It never takes longer than a second and a half, and until it is finished
every control and the diagram itself are disabled. The animation is skipped if your system asks
for reduced motion.

### A node

A node is a fund. It shows the fund's name, and under it the **fund type**. Every node starts as a
light gray square with a dark gray border.

| On the node        | Where          | What it does                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rainbow circle     | under the text | "Change color": opens a colour chooser for that node                                                                      |
| Speech bubble      | under the text | "Add comment": opens a box to write, change or delete a comment. A **red dot** on the bubble means the node has a comment |
| Plus in a box      | under the text | "Add Batch": opens `/batches/new?nodeId=<id>` in a new browser tab (a placeholder page for now)                           |
| Grey x             | top right      | "Delete node": asks for confirmation, then deletes the node                                                               |
| Up and down arrows | left           | No action yet                                                                                                             |
| White dot          | right          | Drag from it to another node to add a relationship                                                                        |

A thin rule separates the text from the three icons. If a name or fund type is too long for the
node, it ends in "…" and the full text appears when you hover over it.

### Selecting and editing nodes

- **Click** a node to select it. Click more nodes to add them; click a selected node to take it
  out; click empty space to clear the selection. Ctrl/Cmd+A selects everything. Press on empty
  space for a moment and drag to draw a selection box.
- A selected node has a **gold outline** in its own shape.
- The **Selected nodes** panel lets you set the title, subtitle, shape and colour. With several
  nodes selected the change applies to all of them and is a single undo step. Fields on which the
  selected nodes differ show "Mixed".
- With **exactly one** node selected, its tree (the chain up to the top and everything below it)
  is highlighted, together with the nodes it is joined to by relationships you drew yourself:
  each of those nodes gets the gold outline and the rest of the diagram is dimmed. The highlight
  goes away when you click empty space, select a second node, zoom, or do anything else.
- **Drag** a node to move it. A node cannot be dropped on top of another node.
- Click the title or subtitle of a node that is already selected, or press F2, to edit the text
  in place.

### Styling by fund type

**Styles** in the top bar opens a dialog that restyles all funds of a type at once.

1. Click one or more fund types on the left ("Select all" picks every type). Each row shows a
   small picture of how that type looks.
2. Pick a colour, a shape, or both. The **Preview** shows the resulting node.
3. Press **Apply**. Nothing in the diagram changes before that; Apply is one undo step and closes
   the dialog.

**Reset all to gray square** asks for confirmation and then turns every node back into a light
gray square. That, too, is one undo step.

### Adding and deleting nodes

- **Add node**, the plus at the top of the tool strip, puts a new fund in the nearest free spot
  to the middle of the view.
- **Delete** a node with its grey x, or select nodes and press Delete or the **Delete node**
  button. A dialog asks you to confirm.
- Deleting removes the node **and the relationship lines attached to it**. All other nodes stay
  where they are, including the ones below it, and no relationship is created or re-attached. One
  undo brings the node and its lines back.

### Relationships

There are three kinds of line. All are black and end in an arrowhead.

| Line           | Meaning                                     | Info icon |
| -------------- | ------------------------------------------- | --------- |
| Solid, thicker | Hierarchy: the fund above to the fund below | yes       |
| Solid, thin    | Another relationship between two funds      | yes       |
| Dotted         | A relationship you drew yourself            | no        |

- **Ownership:** a dark green percentage near the arrowhead says how much of the fund the line
  points at is owned by the fund it comes from, e.g. `62.50%`. Lines without known ownership show
  nothing.
- **Info:** click the small "i" in the middle of a line to see what it connects and its
  ownership. The dialog can also remove that relationship.
- **Add:** drag from the small white dot on the right of a node to another node. Dragging from
  the very edge of a node works too, but that edge is only a few pixels wide when the diagram is
  zoomed out.
- **Remove:** click lines to select them and press Delete, or use the button in **Selected
  relationships**. With nodes selected, **Remove their N relationships** removes every line that
  touches them.

### Edits panel

- **Randomize 1 node** / **Randomize all** change title, fund type, shape and colour on one node
  or on every node.
- **N × randomize all** does that N times in a row, to build up a long history quickly. N can be
  1 up to the number of nodes (fewer on big diagrams); other entries are corrected.

### History panel

- **Undo** and **Redo** are in the tool strip on the left of the canvas and step one change back
  or forward. Ctrl/Cmd+Z and Ctrl/Cmd+Y do the same.
- The coloured line underneath says where you are:
  - _Initial state: matches the startup snapshot_ (green) means undo really did restore everything.
  - _Latest state: matches the snapshot taken before undo_ (green) means redo did.
  - A red version of either would mean undo or redo lost something.
  - _Transaction 3 of 7_ means you are somewhere in between.
- Below that: number of nodes and relationships, how many changes are in the history, and how much
  memory the page uses (Chrome only).

### Reading the timing table

| Column                     | Meaning                                            |
| -------------------------- | -------------------------------------------------- |
| Operation                  | What was done, e.g. "Undo all" or "Style 12 nodes" |
| Transactions               | How many undo steps the operation covered          |
| Changes                    | How many individual changes GoJS recorded for them |
| Total / Avg / Min / Max ms | Time spent inside GoJS, in total and per step      |
| To paint ms                | Time from the click until the result was on screen |

## How it works

### Stack

- Angular 22, standalone components, zoneless, signals.
- GoJS 4.0.5 used directly, without the `gojs-angular` wrapper. The wrapper mirrors model data
  through immer, which would add its own cost to every undo and distort the measurement.
- GoJS is imported as `gojs/release/go`, which is always the production build. Plain `gojs`
  resolves to the slower debug build under `ng serve`.

### Data model

A `go.GraphLinksModel` holds everything that can be undone:

| Part                     | Fields                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Node                     | `key`, `title`, `subtitle` (the fund type), `shape`, `color`, `comment`, `loc`                         |
| Link                     | `key`, `from`, `to`, `category` (`hierarchy`, `relation` or `manual`), `ownership` (percent, optional) |
| Model-wide (`modelData`) | `layoutType`, `linkType`, `name`, `description`                                                        |

The layout and line type live in `modelData` so that switching them is undone with everything
else. Links read their routing from `modelData.linkType` through a model binding.

Generated diagrams are a single-rooted tree (1 to 4 children per node) plus 1.5 random cross
links per node, from a seeded generator, so the same size always gives the same diagram. About
seven links in ten get an ownership percentage.

### Undo and redo

GoJS calls its history the **`UndoManager`** (`model.undoManager`); there is no `HistoryManager`.

- `maxHistoryLength` is set to `-1`. The default of 999 drops the oldest transactions, which
  would make it impossible to undo back to the start.
- Every user action is exactly one transaction (`model.commit` / `diagram.commit`).
- The model's JSON is snapshotted once the initial layout is done. Whenever the history index is
  back at −1 the current JSON is compared with it. A second snapshot, taken before the first undo
  away from the newest state, verifies "Redo all" the same way.
- Display-only state is kept out of the history: the tree highlight, zoom, selection, the info
  icons and percentages, and the lengthening of lines up to a shape's outline.
- Deleting a node removes its node data and the link data of every relationship that starts or
  ends at it, in one transaction, so one undo restores both.

### Measuring

- Each operation is timed with `performance.now()` around the GoJS call, step by step, giving
  total, average, minimum and maximum.
- "To paint" waits for the next painted frame (`requestAnimationFrame` plus a macrotask), because
  GoJS redraws its canvas asynchronously.
- Operations go through a queue and run strictly one after another, each planned when its turn
  comes. A second Ctrl+Z that arrives before the first has been painted is therefore not lost.
- While an operation is being timed the app's own listeners do nothing, so they are not measured.

### Layouts

All layouts have `isOngoing` off: they run when data is loaded, when the layout is switched and on
Auto arrange, but not after each edit. Otherwise every undo would include a full re-layout.

| Layout                        | Implementation                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top to bottom / Bottom to top | `TreeLayout` over the hierarchy links only. Up to 60 nodes it is drawn like an organisation chart, with the lowest level in one indented column per parent and lines pinned to the facing sides. Bigger trees stack every node's children in two columns, which keeps them from becoming one very wide strip |
| Circle                        | `CircularLayout`                                                                                                                                                                                                                                                                                             |
| Layered digraph               | `LayeredDigraphLayout` over the hierarchy links only                                                                                                                                                                                                                                                         |
| Force-directed                | `ForceDirectedLayout`, then spread out evenly until no two nodes overlap                                                                                                                                                                                                                                     |
| Grid                          | `GridLayout`, 20 columns                                                                                                                                                                                                                                                                                     |

Nodes have a fixed size of 172 × 96 whatever their shape and text, so an edit never makes a node
grow into its neighbour. The width allowed for the title and subtitle depends on the shape (a
diamond is much narrower near its tips than a rectangle); longer text is cut off with an ellipsis.

### Lines, icons and percentages

- **Info icons and percentages are adornments**, not elements of the link. Lines often share a
  stretch of their route, and GoJS draws a part as a whole, so anything inside a link would end
  up under the lines of links drawn after it. As adornments they sit in a layer of their own,
  above all lines and below the nodes.
- **Lines meet the outline of the shape.** GoJS ends an orthogonal line on the node's bounding
  rectangle, which leaves a gap in front of a diamond, an ellipse or a capsule. The route is left
  alone (GoJS's routers rewrite it); instead the drawn line is lengthened by the size of the gap,
  using a negative `toShortLength` / `fromShortLength`, and the arrowhead is moved with it.
- **Selection and tree highlight** use a gold outline adornment in the node's own shape instead
  of GoJS's default blue rectangle.

### Things learned about GoJS along the way

- Assigning a model to a diagram copies the previous model's `UndoManager` settings onto it,
  including `isEnabled`. Enable undo **after** the assignment.
- Set the node template **before** the model. Otherwise the nodes are first built without the
  location binding, laid out, and the positions written back into the data.
- The initial layout is committed as a transaction and the history is cleared afterwards, without
  a model event.
- `Diagram.layout` assignments are recorded, so undo and redo also swap the layout object back.
- `TreeLayout` pins lines to sides by setting `fromSpot` / `toSpot` on the **links**; they have to
  be reset before another layout runs.
- A link's `toShortLength` is `NaN` until it is set, so comparisons with it need care.
- Node-avoiding routing (`Routing.AvoidsNodes`) is best effort: when it finds no path it draws a
  plain orthogonal line. It also only re-routes a line when one of its own ends moves, so after a
  drag the app re-routes the lines that now run across the moved node.
- That routing cuts through the empty corners of triangle figures, which is why no triangle is
  among the node shapes.

### Routes

| Path                       | Page                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `/`                        | The diagram                                                 |
| `/batches/new?nodeId=<id>` | Placeholder "Add batch" page, opened by a node's batch icon |

The address is built in one function, `newBatchUrl` in `src/app/new-batch/new-batch.ts`.

## Tests

The unit tests run with [Vitest](https://vitest.dev) through the Angular CLI, in a simulated
browser (jsdom). No real browser is needed.

Run everything once:

```bash
npm test -- --watch=false
```

Run in watch mode, re-running on every change:

```bash
npm test
```

Run a single file:

```bash
npm test -- --watch=false --include src/app/diagram/undo-history.spec.ts
```

### What is covered

| File                                                       | What it checks                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram/node-data.spec.ts`                                | Generated funds and relationships: counts, one parent per fund, no duplicates, ownership with two decimals, default gray square                                                                                                                                                                                                                                     |
| `diagram/sample-data.spec.ts`                              | The sample fund structure is one tree with the expected funds, fund types and ownership                                                                                                                                                                                                                                                                             |
| `diagram/datasets.spec.ts`                                 | The Data dropdown's entries and the 30-fund default                                                                                                                                                                                                                                                                                                                 |
| `diagram/link-types.spec.ts`                               | The four line types, and which of them avoid nodes                                                                                                                                                                                                                                                                                                                  |
| `diagram/layouts.spec.ts`                                  | Every layout positions all nodes without overlaps; tree direction; small versus big trees                                                                                                                                                                                                                                                                           |
| `diagram/diagram-factory.spec.ts`                          | Nodes (fixed size, icons, arrows, rule, red comment dot, gold outline), clicks on icons and selection, lines (black, solid or dotted, info icon, ownership label, meeting the outline of a shape), tree highlight, adding a node, drag rule                                                                                                                         |
| `diagram/undo-history.spec.ts`                             | Undo/redo of every kind of change back to the exact initial state, more than 999 steps, deleted nodes coming back with their relationships                                                                                                                                                                                                                          |
| `diagram/shape-tiles.spec.ts`, `diagram/benchmark.spec.ts` | Shape pictures for the Styles dialog; the timing helpers                                                                                                                                                                                                                                                                                                            |
| `perf-diagram/perf-diagram.spec.ts`                        | The page: loading and its animation (everything disabled until all nodes are shown), undo/redo and the state check, bulk-run input, multi-node edits, comments, delete confirmation, relationships, layout and line type, tree highlight, the Styles dialog, the canvas tools, the Actions menu, name and description, search, the overview, new diagram, Add Batch |
| `new-batch/new-batch.spec.ts`                              | The batch address and its placeholder page                                                                                                                                                                                                                                                                                                                          |

### What is not covered

The tests run without a real browser, so some things can only be checked by hand:

- **Colours and layout that come from CSS.** The green confirm buttons, the dark red **Delete**
  button, the dark green selection in the Styles dialog, and where the header, the tool strip
  and the overview sit on the page.
- **How the diagram looks.** Nothing compares pixels: the rainbow of the color icon, the dotted
  lines, the gold outline and the dimming are checked as settings on the diagram, not as a
  picture. Text is measured at a fixed width per character, so the exact place where a long title
  is cut off is not checked either.
- **The browser's own download and print steps.** The tests check that **Export PNG** asks for a
  sharp picture of the whole diagram and that **Print** prepares one; saving the file and the
  print dialog are replaced by stand-ins.
- **Real mouse gestures.** Dragging a node, drawing a relationship from the link handle, dragging
  the box in the overview and zooming with the mouse wheel are not acted out. The rules behind
  them are tested directly: where a node may be dropped, and where a relationship may start.
- **A real new tab.** The test for **Add Batch** checks that a new tab is asked for with the right
  address, not what a particular browser then does.
- **Speed.** No test fails when something gets slower. The tests check that a diagram with more
  than 200 nodes is loaded with straight lines, and that the loading animation ends within its
  time limit, but not how long loading, undo or redo really take.
- **Other browsers.** Nothing is run in Chrome, Safari or Firefox.
- **Features without behaviour.** The up and down arrows on a node, **Save** and **Save As** do
  nothing yet; the tests only check that they are there (and that the two menu entries are
  disabled).

### How the test environment works

- jsdom has no canvas, and GoJS needs one to draw and to measure text.
  `src/testing/canvas-stub.ts` supplies a stand-in whose drawing calls do nothing and which
  measures text at a fixed width per character. `src/testing/setup.ts` installs it before any
  spec file is loaded (see `setupFiles` in `angular.json`).
- GoJS normally works once per animation frame. Tests call `diagram.maybeUpdate()` instead, which
  does the same work at once; the helpers in `src/testing/diagram-harness.ts` wrap that as
  `settle()`.
- Because text is not really measured, the tests do not check how text looks, and they do not
  check pixels. They check the model, positions, sizes, styles and what the page reports.

## Project structure

| File                                             | Purpose                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/app/perf-diagram/perf-diagram.ts`           | The page: operations, timing, history state, dialogs                         |
| `src/app/perf-diagram/perf-diagram.html`, `.css` | Its template and styles                                                      |
| `src/app/diagram/diagram-factory.ts`             | Node and link templates, icons, click handling, tree highlight, adding nodes |
| `src/app/diagram/layouts.ts`                     | The six layouts                                                              |
| `src/app/diagram/link-types.ts`                  | The four line types                                                          |
| `src/app/diagram/node-data.ts`                   | Data types and the generator for random diagrams                             |
| `src/app/diagram/sample-data.ts`                 | The sample fund structure                                                    |
| `src/app/diagram/datasets.ts`                    | The list behind the **Data** dropdown                                        |
| `src/app/diagram/shape-tiles.ts`                 | The shape pictures used in the Styles dialog                                 |
| `src/app/diagram/benchmark.ts`                   | Timing helpers                                                               |
| `src/app/new-batch/new-batch.ts`                 | The placeholder "Add batch" page and its address                             |
| `src/app/app.routes.ts`                          | Routes                                                                       |
| `src/testing/`                                   | Test setup, the canvas stand-in and the diagram test helpers                 |
| `src/**/*.spec.ts`                               | Unit tests, next to the file they test                                       |

## Build and hosting

```bash
npm run build
```

The result is a static site in `dist/gojs-undo-perf/browser`. Any static host can serve it. The
build includes a `_redirects` file so that `/batches/new` also works on hosts that use it, such as
Netlify; on other hosts, configure a fallback to `index.html`.

Read the [licence](#licence) section before publishing a build on the public internet.

## Known limits

- **Large diagrams and node-avoiding lines.** Routing every line around the nodes takes about a
  second at 200 nodes, about seven seconds at 500 and minutes beyond that. A diagram with more
  than 200 nodes is therefore loaded with straight lines, which takes a fraction of a second.
  You can switch back in the tool strip, at the cost of that wait.
- **Lines across nodes.** With the orthogonal line types this is rare but not impossible; GoJS
  falls back to a plain line when it finds no way around.
- **The children of a deleted node** stay in the diagram without a parent; nothing re-attaches
  them.
- **Operations block the page while they run.** A bulk edit is capped so that it stays in the
  range of seconds.
- **The up and down arrows** on a node do nothing yet, and neither do **Save** and **Save As**.
- **Export and print** draw a very large diagram smaller, so that no side exceeds 10,000 pixels.
- **"Add Batch" in embedded browsers.** The icon opens a new tab the standard way. Some embedded
  browser panes load such links in the same tab instead.
- **JS heap** is only shown in browsers that expose `performance.memory` (Chrome and relatives).

## Licence

GoJS is commercial software from Northwoods Software. This project uses it **without a licence
key**: the diagram shows an evaluation watermark, and that mode is only allowed for evaluation or
for non-commercial use. Use by or for an organisation needs an evaluation agreement or a purchased
licence; see https://gojs.net/latest/license.html. The GoJS library itself is not part of this
repository; it is installed from npm.
