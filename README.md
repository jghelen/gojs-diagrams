# Fund structure diagrams

An Angular 22 app for trying out fund-structure diagrams built with [GoJS](https://gojs.net) 4, and
for measuring how fast GoJS's undo/redo history is on diagrams of 24 to 2000 nodes.

The first half of this document is for people who use the app. The second half explains how it is
built and how to run its tests.

The business requirements, rule by rule, are in
[BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md). How undo and redo work, step by step and with
diagrams, is in [UNDO_HISTORY.md](UNDO_HISTORY.md). The database, which is the first step towards a backend, is in
[DATABASE.md](DATABASE.md). Test cases to run by hand are in
[test-cases/](test-cases/): [undo.md](test-cases/undo.md), [styles.md](test-cases/styles.md) and
[diagram-info-bar.md](test-cases/diagram-info-bar.md) (name, description and search).

- [What it is for](#what-it-is-for)
- [Quick start](#quick-start)
- [User guide](#user-guide)
- [How it works](#how-it-works)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Database](#database)
- [Backend](#backend)
- [Build and hosting](#build-and-hosting)
- [Known limits](#known-limits)
- [Licence](#licence)

## What it is for

The question behind the app is: **if a diagram editor for fund structures is built on GoJS, is its
undo/redo good enough for large diagrams?** The app answers that by letting you

- open a diagram from the database: the sample diagrams there are a small fund structure and
  generated ones of 30 to 2000 funds,
- change it the way a user would: rename funds, restyle them by legal entity type, comment on them, move
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

The app starts with the [list of diagrams](#the-list-of-diagrams). Every diagram comes from the
database: the app has no data of its own. So the [database](#database) has to exist and the
[backend](#backend) has to run as well, or the list says that it could not be read. Without them
only **New diagram** works, which opens an empty canvas.

## User guide

### The screen

| Area                                  | What it holds                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar                               | The link **All diagrams** to the [list of diagrams](#the-list-of-diagrams), followed by **LE:** and the number of legal entities (nodes) in the diagram; on the right **Styles**, the **Actions** menu, a reload icon that resets the diagram, a new-diagram icon, and the **developer tools** switch (`</>`) |
| Bar above the canvas                  | The diagram's **name** and **description**, and the **search** box                                                                                                                                                                                                                                            |
| Tool strip (left edge of the canvas)  | Add node, undo, redo, zoom in, zoom out, zoom to fit, layout, lines, shape, auto arrange, expand all, collapse all                                                                                                                                                                                            |
| Overview (bottom right of the canvas) | A small picture of the whole diagram; drag its gold box to move around                                                                                                                                                                                                                                        |
| Canvas (left)                         | The diagram. Scroll to pan, Ctrl/Cmd + wheel (or pinch) to zoom                                                                                                                                                                                                                                               |
| Footer                                | In small print: the versions of Angular and GoJS the app is built with                                                                                                                                                                                                                                        |
| Side panel (right)                    | Hidden until you click a node or a line; then **Selected nodes** and **Selected relationships**. With the developer tools it is always shown and starts with **History** and **Edits**                                                                                                                        |
| Timing table (below the canvas)       | With the developer tools only: one row per operation, newest first                                                                                                                                                                                                                                            |

### Developer tools

The app started as a test of how fast undo and redo are, and the tools for that are still there:
the timing table below the canvas, and the **History** and **Edits** panels at the top of the
side panel. They are not needed to edit a diagram, so they are hidden at first.

The `</>` icon at the right end of the top bar shows them, and hides them again. The browser
remembers the choice. Operations are timed and counted while the tools are hidden too, so the
table is complete when you open it.

The sections [Edits panel](#edits-panel), [History panel](#history-panel) and
[Reading the timing table](#reading-the-timing-table) below describe what they show.

### Name and description

The bar above the canvas has two boxes, for the name of the diagram and a description. A loaded
diagram starts out named after its data. A new diagram has no name: the box is empty, marked in
red and says "Diagram name (required)" until you type one. Both are stored with the diagram, and
changing either is one undo step.

A name may have **letters, digits and spaces only**; letters of any alphabet count. A special
character that you type or paste into the name box does not appear, and a note below the boxes
says why. The description has no such rule.

A diagram that is opened with a name that breaks the rule (one stored in a database earlier, say)
is shown with the special characters removed, and a note below the boxes says that the name was
not valid and which name it was. The note stays until you dismiss it, give the diagram a name, or
open other data. Opening does not count as a change, so there is nothing to undo.

### The list of diagrams

The app starts with this page; **All diagrams** in the top bar of the editor leads back to it.
It is a table of all diagrams of the database:

| Column     | What it shows                                                       |
| ---------- | ------------------------------------------------------------------- |
| Title      | The name of the diagram. Click it to open the diagram               |
| Created at | When the diagram was made, as `12 Oct 2026, 17:23` in your own time |
| Updated at | When it was last changed                                            |

- The diagram changed last is at the top.
- The table shows **20 diagrams per page**. **Previous** and **Next** below it change the page,
  and between them stands where you are: "Page 2 of 3 · diagrams 21 to 40 of 45". The backend
  cuts the list into pages; the app only ever receives the page it shows.
- **Search by title**: the box below the heading "Title" narrows the list to the diagrams that
  have the typed text anywhere in their title, whatever the capitals. The list follows a moment
  after you stop typing, or at once on Enter, and starts at the first page of what was found.
  Empty the box to see every diagram again. The searching is done by the backend, over all
  diagrams, not only over the page on screen.
- The page and the search are part of the address (`/diagrams?search=fund&page=2`), so Back, a
  reload and a bookmark keep them, and so does coming back from a diagram you opened.
- **New diagram** in the top bar opens the editor with an empty canvas.
- When the backend is not running, the page says that the list could not be read and offers
  **Try again**.

### Opening a diagram of the database

A click on a title opens that diagram in the editor, in the same tab, at the address
`/diagrams/<id>`.

- The canvas is empty and the controls are disabled until the diagram has arrived.
- The diagram comes with its own name, description, layout type, line type, expanded cards and
  field under the names. Its nodes stand where they were stored; if some have no place yet, the
  layout arranges all of them.
- Relationships are drawn between all its funds that have one. Artificial links of the diagram are
  drawn as hand-drawn lines.
- **Reset diagram** reads the diagram from the database again and drops your changes, also the
  layout and line type you chose.
- **New diagram** empties the canvas for a diagram of your own, at the address `/diagrams/new`;
  Back returns to the diagram you came from.
- If the diagram does not exist, or the backend cannot be reached, the canvas stays empty and a
  note above it says which of the two it is.
- Nothing is saved yet. Leaving a changed diagram for the list asks first: "Leave this diagram?
  The changes you made will be lost."

### Closing the tab

Nothing is saved anywhere yet, so a diagram you changed is lost when its tab is closed or
reloaded. The browser therefore asks first ("Leave site? Changes you made may not be saved") while
the diagram has changes. It does not ask for a diagram as it was opened, or after you undid every
change. The wording and look of that question are the browser's; a page cannot show a dialog of
its own at that moment.

### Searching for a node

Type part of a name into the search box at the right of the bar above the canvas. The box is
disabled while the diagram has no nodes. Next to it you
see how many nodes match, whatever the case of the letters. The **<** and **>** buttons, or Enter
and Shift+Enter, step through the matches: the node you are on gets a thick gold outline, is
brought to the middle of the view and, if the diagram was zoomed out, zoomed in to full size. The
counter then reads "2 of 7". Clicking another node takes the outline away again. Searching never
changes the diagram or its undo history. Resetting the diagram, loading other data or starting a
new diagram empties the search box.

### Finding your way around

The overview in the bottom right corner of the canvas shows the whole diagram in small. The gold
box marks the part that is on screen: drag it, or click somewhere else in the overview, to move
there.

### Actions

The **Actions** menu in the top bar has four entries. It is disabled while the diagram has no
nodes, because there is nothing to export or print then.

- **Export PNG** downloads a picture of the whole diagram, not just the part on screen. The file
  is named after the diagram, for example `Sample fund structure.png`; characters a file name
  cannot hold, such as `/ : ? "`, and other symbols are replaced by a dash, and a name with
  nothing usable in it becomes `diagram.png`. The picture is drawn at twice the size of the diagram so that small text stays
  sharp, and without the gold outlines and dimming of a selection.
- **Print** opens the browser's print dialog with a picture of the whole diagram, on one sheet.
  The sheet shows the picture only: not the address of the page, the date and time, or a page
  number, which browsers otherwise print in the margin.
- **Save** and **Save As** are shown but not available yet.

When the diagram has no nodes, the tool strip disables zooming, layout and auto arrange. Add node,
and undo if there is something to undo, stay available.

### Choosing what to look at

- **The diagram** is chosen in the [list of diagrams](#the-list-of-diagrams): the editor shows
  what is in the database and has no data of its own. The sample diagrams of the database are
  "Sample fund structure", a fund of funds with what it holds, four levels deep (24 funds), and
  generated diagrams of 30, 100, 200, 500, 1000 and 2000 funds. All of them are built like real
  holdings of investment funds, with invented names: see
  [What the data means](#what-the-data-means).
- **Layout**, the icon under the zoom buttons in the tool strip, arranges the nodes. Click it to
  see one icon per layout (hover over an icon for its name) and click the one you want: Top to
  bottom, Bottom to top, Circle, Layered digraph, Force-directed or Grid.
- **Lines**, the icon under the layout icon in the tool strip, picks how relationships are
  drawn. Click it to see one icon per line type, named on hover. "Straight" and "Curved" lines
  cross whatever lies between their ends, and say "(crosses nodes)". The two "Orthogonal" types
  are routed around the nodes, on diagrams of every size.
- **Auto arrange**, the last icon of the tool strip, runs the current layout again, which tidies
  up after you moved nodes by hand.
- **Zoom to fit**, in the tool strip under zoom out, shows the whole diagram.
- **Reset diagram**, the reload icon in the top bar, reads the diagram from the database again
  and clears the history.
- **New diagram**, the icon next to it, opens an empty canvas to build a diagram from scratch:
  add nodes with the plus in the tool strip and draw relationships between them. Until the
  diagram has a node, **Styles** and **Actions** are disabled, and the name box asks for a name.
  A new diagram cannot be saved yet.

Switching the layout or the line type, and Auto arrange, are undo steps like any other change.

When a diagram is loaded, its nodes appear one after another, each relationship as soon as both
of its ends are there. It never takes longer than a second and a half, and only half a second
on a diagram of more than 200 nodes, so that big diagrams still open quickly. Until it is finished
every control and the diagram itself are disabled. The animation is skipped if your system asks
for reduced motion.

### What the data means

Every diagram shows which fund invests in which. A line runs **from the fund that invests to the
fund it invests in**, and the percentage at its arrowhead is the part of that fund the investor
owns. The data follows the way funds are really built on one another:

- A **fund of funds** is at the top. It invests through **feeder funds** and further funds of
  funds, and directly in strategy funds.
- A **feeder fund** invests in exactly one fund, its master, usually of the same house, and holds
  a large part of it.
- A **strategy fund** (private equity, venture capital, hedge fund, private credit, real estate,
  infrastructure) invests in sub-funds and co-investment vehicles of its own strategy.
- Every fund but the top one has one **main investor**, which holds the largest stake in it.
  Other funds may hold smaller stakes as **co-investments**: about one for every two funds.
- All stakes in a fund add up to at most 100%. What is missing belongs to investors that are not
  in the diagram.
- Money flows one way only: no fund invests, directly or through others, in a fund that invests
  in it.
- For about one line in five the percentage is not known and is left out.

The names of the houses and funds are invented, and so are the percentages; no real fund is shown.

### A node

A node is a fund. It shows the fund's name. Under the name it can show the value of a legal
entity field, such as the fund's **legal entity type**; that line is not there at first and is
switched on in the [styles dialog](#styling-by-legal-entity-field). Every node starts as a light
gray square with a dark gray border.

| On the node        | Where          | What it does                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rainbow circle     | under the text | "Change color": opens a colour chooser for that node                                                                      |
| Speech bubble      | under the text | "Add comment": opens a box to write, change or delete a comment. A **red dot** on the bubble means the node has a comment |
| Plus in a box      | under the text | "Add Batch": opens `/batches/new?nodeId=<id>` in a new browser tab (a placeholder page for now)                           |
| Grey x             | top right      | "Delete node": asks for confirmation, then deletes the node                                                               |
| Up and down arrows | left           | No action yet                                                                                                             |

A thin rule separates the text from the three icons. If a name or legal entity type is too long for the
node, it ends in "…" and the full text appears when you hover over it.

### Selecting and editing nodes

- **Click** a node to select it. Click more nodes to add them; click a selected node to take it
  out; click empty space to clear the selection. Ctrl/Cmd+A selects everything. Press on empty
  space for a moment and drag to draw a selection box.
- A selected node has a **gold outline** in its own shape.
- The side panel on the right is hidden while nothing is selected. It appears when you click a
  node or a line, over the right edge of the canvas, so the diagram does not move when it comes;
  the overview steps aside for it. It goes away when you click empty space.
- The **Selected nodes** panel lets you set the title, legal entity type and colour. With several nodes
  selected the change applies to all of them and is a single undo step. Fields on which the
  selected nodes differ show "Mixed".
- **Shape**, the icon under Lines in the tool strip, sets the shape of the selected nodes. Click
  it to see one picture per shape, named on hover (Square, Rounded, Ellipse, Diamond, Capsule,
  Rounded top), and click the one you want. The icon shows the shape the selection has now; it is
  disabled while no node is selected. While the tree of a single selected node is highlighted,
  the shape is given to every highlighted node, not only the selected one.
- Every tool in the strip shows its name beside it as soon as the mouse is over it.
- With **exactly one** node selected, everything that belongs to it is highlighted: its tree (the
  chain up to the top and everything below it), every relationship line of the node itself with
  the fund at its other end, and every line that joins two of the highlighted funds. Each of
  those nodes gets the gold outline and the rest of the diagram is dimmed. The highlight goes
  away when you click empty space, select a second node, zoom, or do anything else.
- **Drag** a node to move it. A node cannot be dropped on top of another node.
- The title and legal entity type cannot be edited on the node itself; change them in the **Selected
  nodes** panel. A press on a node, also on its text, selects it or moves it.

### Styling by legal entity field

**Styles** in the top bar opens the dialog **Styles by legal entity field**, which gives all
nodes with the same value of a field the same look. The button is disabled while the diagram has
no nodes.

1. Pick the field in the dropdown at the top left. For now there is one, **Legal entity type**.
   Its values are then listed below: Feeder fund, Fund of funds, Private equity and so on, each
   with the number of nodes and a small picture of how they look now.
2. Optionally click one or more values ("Select all" picks every one) and pick a colour, a
   shape, or both. The **Preview** shows the resulting node.
3. Press **Apply**. Nothing in the diagram changes before that; Apply is one undo step and closes
   the dialog.

Apply does one or both of two things:

- **It shows the chosen field on every node**, as a line under the name. Nodes show no such line
  until a field is applied. Choosing the field and pressing Apply, with nothing else picked, is
  enough for this.
- **It gives the nodes of the ticked values the picked colour and shape.**

To take the line off the nodes again, use **Reset all** (below). The dialog opens on the field
the nodes currently show. "Select a field" is only what the dropdown says while nothing is chosen;
it is not offered in the opened list.

Colour and shape are picked for values of the field, so their buttons are disabled until at least
one value is ticked, and what was picked is forgotten when the last value is unticked.

**Reset all to gray square** asks for confirmation and then turns every node back into a light
gray square. It also unselects the legal entity field, so the nodes show their name only again.
That, too, is one undo step.

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

| Line   | Meaning                                                                                                                                                                                                                    | Info icon |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Solid  | A relationship from the data: a main holding (the fund above is the largest investor in the fund below) or a co-investment (a smaller stake another fund holds). Which of the two it is says the card behind its info icon | yes       |
| Dotted | A relationship you drew yourself                                                                                                                                                                                           | no        |

All lines are equally thick.

- **Where a line meets its node:** always on the top or the bottom side, in the middle. A line
  leaves the bottom of the fund that invests and arrives at the top of the fund it invests in;
  in the Bottom to top layout it is the other way round, and two funds that stand side by side
  are joined over their tops. Where several lines meet the same side of a node, they stand next
  to each other around the middle, 6 units apart, so that each can be seen and clicked right up
  to the node.
- **Straight where possible:** a line to a fund that stands right below its investor is one
  straight line. The Top to bottom and Bottom to top layouts put an only child, and the first of
  several leaves, right under its parent for that reason.
- **Lines side by side:** where several right-angled lines would run along the same stretch,
  they are drawn next to each other, 6 units apart: as near as they can be while each can still
  be followed and clicked. Where more lines pass through a gap than fit at that distance, they
  move closer together, and a line is never pushed onto a node to make room.
- **Following a line:** move the mouse over a line and it turns gold and thicker, so that one
  line can be followed among the others.
- **Ownership:** a dark green percentage near the arrowhead says how much of the fund the line
  points at is owned by the fund it comes from, e.g. `62.50%`. Lines without known ownership show
  nothing.
  No percentage covers another, whichever nodes their lines end at, and none lies on a node,
  where the node would hide it. Where the place next to the arrowhead is taken, the percentage
  goes to the other side of the line, or further back along the line, round its bends.
- **Info:** click the small "i" in the middle of a line. A card opens on the canvas beside the
  icon, with the kind of relationship, the two funds it connects and the ownership, and a button
  to remove that relationship. It is not a dialog: the diagram stays usable. The card goes away
  on a second click on the icon, on its x, on Escape, on a click on empty canvas, and whenever
  you select a node or do something else. It follows its icon when you scroll or zoom.
- **Expand all** and **Collapse all** are disabled while no relationship has a card to show: on a
  diagram of a single node, while none of the nodes is joined to another, and while the only
  relationships are ones you drew yourself.
- **Expand all**, near the bottom of the tool strip, shows a small card on every relationship at
  once: its kind, the two funds and the ownership. To make room, the diagram is arranged anew
  with the nodes further apart, so every card stands between the nodes and covers neither a
  node nor another card. A card stands on its line where the info icon was; the icons are hidden
  meanwhile. Where that place is taken, the card moves along its line or right beside it. Click
  a line to select it and its card is marked in gold. **Collapse all** hides the cards and
  arranges the nodes close together again. Both are undo steps, because they move the nodes, and
  both discard positions you gave nodes by hand, as Auto arrange does.
- **Add:** drag from the edge of a node to another node. Two funds that already have a
  relationship, in either direction, cannot get a second one this way. The edge does not have to be hit
  exactly: a drag that starts within a few pixels of it, inside or just outside the node, draws a
  relationship, however far the diagram is zoomed out. A drag from the middle of the node moves
  the node.
- **Remove:** click lines to select them and press Delete, or use the button in **Selected
  relationships**. With nodes selected, **Remove their N relationships** removes every line that
  touches them.

### Edits panel

Shown with the [developer tools](#developer-tools).

- **Randomize 1 node** changes title, legal entity type, shape and colour of one node.
- **Randomize all** does that for every node and, in the same undo step, switches to another
  layout picked at random. Every node gets a new place and every line a new route, so this is
  the biggest single change there is to undo. On a diagram of 500 nodes or more the layout is
  picked among Top to bottom, Bottom to top and Grid only; the other three take many seconds
  there.
- **N × randomize all** changes the four fields of every node N times in a row, to build up a
  long history quickly, and moves each node a little every time (at most 15 units from where it
  stood), with its lines. It keeps the layout: N layouts in a row would take far too long. N can
  be 1 up to the number of nodes (fewer on big diagrams); other entries are corrected.

### History panel

The panel is shown with the [developer tools](#developer-tools); Undo and Redo are always there.

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

The table sits below the canvas under the heading **Benchmark statistics**, which also counts the
operations recorded so far. Click the heading to close the table and give the canvas its room (on
a low window the tool strip continues in a second column to stay inside the canvas), and click it
again to open it.
Operations are recorded while it is closed, and the browser remembers whether you left it open.

The number in the **Changes** column is usually bigger than you would expect: randomizing one node
shows 11 to 17 changes, not 4. Four are changes to the data (title, legal entity type, shape, colour). The
rest are changes to the drawing that follow from them: the two texts, the fill, the text colour,
the room the texts get inside the new shape, and the places of the x and the arrows. GoJS records those as well, so that an undo restores the picture exactly; values that
happen to stay the same are not recorded, which is why the number varies. **Click the number** to
see the list: what changed, on which fund or relationship, with the value before and after. A
summary counts the changes per property; of a big operation the first 200 are listed one by one.

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

The package `gojs-extensions` (from the makers of GoJS, same version) supplies the router that
draws overlapping lines side by side. It imports GoJS as `gojs`, while the app imports
`gojs/release/go` to get the fast build also under `npm start`. Both must end up as the very same
file, because two copies of GoJS do not recognise each other's objects. Three settings see to
that: `conditions` and the dev server's `prebundle.exclude` in `angular.json`, and the alias in
`vitest-base.config.mts` for the tests. If you ever see "is not an instance of Point" in the
console, one of them has stopped working.

### Data model

A `go.GraphLinksModel` holds everything that can be undone:

| Part                     | Fields                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Node                     | `key`, `title`, `legalEntityType`, `shape`, `color`, `comment`, `loc` (where its top left corner is)   |
| Link                     | `key`, `from`, `to`, `category` (`hierarchy`, `relation` or `manual`), `ownership` (percent, optional) |
| Model-wide (`modelData`) | `layoutType`, `linkType`, `name`, `description`                                                        |

The layout and line type live in `modelData` so that switching them is undone with everything
else. Links read their routing from `modelData.linkType` through a model binding.

The app has no data of its own; a diagram arrives from the backend in this shape
(`src/app/api/diagrams-api.ts`). The generated diagrams that the tests work on, and that the
sample of the database was made from (`src/testing/generated-funds.ts`), are a single-rooted tree
(1 to 4 children per node) plus half a co-investment per fund, from a seeded generator, so the
same size always gives the same diagram. Most links get an ownership percentage.

### Undo and redo

GoJS calls its history the **`UndoManager`** (`model.undoManager`); there is no `HistoryManager`.
Everything the app does with it is in one place, the **`HistoryService`**
(`src/app/diagram/history.service.ts`). The page and the drawing code never touch the
`UndoManager` themselves. The service file starts with an explanation of the ideas (transaction,
history, position), and every method says what it is for. [UNDO_HISTORY.md](UNDO_HISTORY.md) walks
through it step by step, with diagrams.

| The service's method                               | What it does                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `connect(diagram, onChange)`                       | Says which diagram the history belongs to, and whom to tell when the history changes                   |
| `load(model)`                                      | Shows new data with an empty history of unlimited length                                               |
| `markInitialState()`                               | Saves the state that "undo everything" must lead back to                                               |
| `record(name, change)`                             | Makes a change as one transaction, which is one undo step                                              |
| `undo()`, `redo()`, `canUndo`, `canRedo`           | One step back or forward, and whether there is one                                                     |
| `rememberLatestState()`                            | Saves the newest state before the first undo away from it, so that "redo everything" can be checked    |
| `length`, `position`, `recordedChanges`            | How many transactions there are, which one the diagram is at (-1 = as loaded), how many single changes |
| `transactionsBetween(a, b)`                        | The transactions an action recorded, undid or redid, given the position before and after it            |
| `describeState()`                                  | "Initial state: matches …", "Transaction 2 of 7", "Latest state: matches …"                            |
| `hasUnfinishedTransaction`, `rollBackUnfinished()` | Notices and ends a transaction that an error left open, so the diagram is not stuck                    |
| `sendShortcutsTo(undo, redo)`                      | Makes Ctrl/Cmd+Z and Ctrl/Cmd+Y do what the page's buttons do                                          |
| `withoutUndo(diagram, change)` (a function)        | Makes a change that is deliberately not recorded                                                       |

How the app uses it:

- The history is unlimited (`maxHistoryLength = -1`). The default of 999 drops the oldest
  transactions, which would make it impossible to undo back to the start.
- Every user action is exactly one `record(...)`, and so one undo step.
- The state is saved as text once the initial layout is done. Whenever the position is back at -1
  the current state is compared with it. A second copy, saved before the first undo away from the
  newest state, verifies "Redo all" the same way.
- Display-only changes are kept out of the history with `withoutUndo`: the loading animation,
  switching the diagram off and on around it, and the lengthening of lines up to a shape's
  outline. The tree highlight, zoom, selection, info icons and percentages are not recorded
  either.
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
| Grid                          | `GridLayout`, always 20 nodes to a row, whatever the width of the window                                                                                                                                                                                                                                     |

Nodes have a fixed size of 172 × 96 whatever their shape and text, so an edit never makes a node
grow into its neighbour. The width allowed for the title and subtitle depends on the shape (a
diamond is much narrower near its tips than a rectangle); longer text is cut off with an ellipsis.

### Lines, icons and percentages

- **Info icons and percentages are adornments**, not elements of the link. Lines often share a
  stretch of their route, and GoJS draws a part as a whole, so anything inside a link would end
  up under the lines of links drawn after it. As adornments they sit in a layer of their own,
  above all lines and below the nodes.
- **Percentages are placed all together.** Whenever a line changes, every percentage of the
  diagram is given its place again, a moment later and before anything is painted. The lines take
  their turn in the order of their keys; each percentage takes the first of its places that is
  free of other percentages and of nodes. The places start beside the arrowhead and go back
  along the route of the line. Taking them in a fixed order makes the result the same every time.
- **Where a line attaches is the line's own business.** `RelationshipLink.computeSpot` answers
  with the top or bottom side and a place on it (`line-ends.ts`), from where the two nodes stand
  right now. Nothing is stored on the link or the node, so a moved node, an undo or another
  layout needs no bookkeeping. The layouts are told not to set any sides.
- **Lines meet the outline of the shape.** A line that attaches beside the middle of a diamond's
  top ends on the bounding rectangle, a little above the outline. The route is left alone
  (GoJS's routers rewrite it); instead the drawn line is lengthened by the size of the gap,
  using a negative `toShortLength` / `fromShortLength`, and the arrowhead is moved with it.
- **Two routers.** Below 1000 nodes GoJS routes the lines around the nodes itself
  (`Routing.AvoidsNodes`) and an extension lays lines that share a stretch side by side; a guard
  around it takes back any move that would put a line on a node. From 1000 nodes on GoJS's
  routing takes minutes, so there the app's own router does both jobs
  (`lane-router.ts`). It does not search: nodes stand in rows, between two rows there is a gap
  that is free from one side of the diagram to the other (a lane), and between two neighbouring
  nodes of a row there is a gap from lane to lane (a corridor). A line goes from lane to lane
  through corridors. Routing all 3,000 lines of the 2000-fund diagram that way takes about a
  third of a second.
- **Selection and tree highlight** use a gold outline adornment in the node's own shape instead
  of GoJS's default blue rectangle.

### Things learned about GoJS along the way

- GoJS's router for lines around nodes maps out the whole area the diagram covers. A layout that
  spreads the nodes over hundreds of thousands of units makes that map too big to allocate
  ("Array buffer allocation failed"). The force-directed layout did that when two nodes started
  on almost the same spot, because it enlarged the whole layout to part them; that enlargement is
  now capped and such pairs are pushed apart one by one instead.
- While another model is being loaded, new links can for a moment be routed with the settings of
  the old one. GoJS's router is therefore told directly never to run on a big diagram.
- A `GridLayout` without a `wrappingWidth` wraps at the width of the window and arranges the
  nodes anew whenever that width changes, by a zoom for instance, outside of any transaction.
  Nodes then move without an undo step. Setting `wrappingWidth: Infinity` stops that.
- Bind the data to a node's `position`, not its `location`. GoJS keeps the top left corner; the
  middle is worked out from it, and a number that goes from corner to middle and back can come
  out different in its sixteenth digit. A redo then left the data different from what it had
  been before the undo, and the state check said "differs".
- Assigning a model to a diagram copies the previous model's `UndoManager` settings onto it,
  including `isEnabled`. Enable undo **after** the assignment.
- Set the node template **before** the model. Otherwise the nodes are first built without the
  location binding, laid out, and the positions written back into the data.
- The initial layout is committed as a transaction and the history is cleared afterwards, without
  a model event.
- `Diagram.layout` assignments are recorded, so undo and redo also swap the layout object back.
- `TreeLayout` pins lines to sides by setting `fromSpot` / `toSpot` on the **links** unless
  `setsPortSpot` and `setsChildPortSpot` are switched off.
- `Link.computeSpot` can be overridden to decide the side per route; GoJS routes around nodes
  only after that, in a later pass, so a route cannot be checked inside `computePoints`.
- A link's `toShortLength` is `NaN` until it is set, so comparisons with it need care.
- Node-avoiding routing (`Routing.AvoidsNodes`) is best effort: when it finds no path it draws a
  plain orthogonal line. It also only re-routes a line when one of its own ends moves, so after a
  drag the app re-routes the lines that now run across the moved node.
- That routing cuts through the empty corners of triangle figures, which is why no triangle is
  among the node shapes.

### Routes

| Path                               | Page                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                                | Leads to the list of diagrams, as does every address the app does not know                             |
| `/diagrams?page=<n>&search=<text>` | The list of the diagrams of the database; without `page` the first page, without `search` all diagrams |
| `/diagrams/<id>`                   | The editor, with that diagram of the database                                                          |
| `/diagrams/new`                    | The editor, with an empty canvas for a new diagram                                                     |
| `/batches/new?nodeId=<id>`         | Placeholder "Add batch" page, opened by a node's batch icon                                            |

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

### Automatic checks

The workflow in `.github/workflows/ci.yml` checks the code on GitHub at two moments:

1. when a pull request into `main` is opened, and again each time commits are added to it;
2. when something lands on `main`: a merged pull request, or a direct push.

Pull requests into other branches, and pushes to other branches, are not checked. Each run does
these things, and fails if any of them does:

| Check      | Command                     | What it catches                                                                              |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Formatting | `npm run format:check`      | Files that are not formatted the way Prettier would format them                              |
| Lint       | `npm run lint`              | Likely mistakes and Angular bad practice, in code and templates (ESLint with angular-eslint) |
| Build      | `npm run build`             | Anything that does not compile, and a bundle over its size budget                            |
| Unit tests | `npm test -- --watch=false` | Behaviour that changed                                                                       |

After these the run checks the [backend](#backend): its types and tests
(`npm --prefix backend run verify`), and its tests on a PostgreSQL server that GitHub starts for
the run (`npm --prefix backend run test:db`).

**Making GitHub refuse a merge until the checks have passed.** The workflow only reports; the
"Merge pull request" button is governed by a setting of the repository, which has to be switched
on once:

1. On GitHub: **Settings → Branches → Add branch protection rule** (or "Add classic branch
   protection rule").
2. Branch name pattern: `main`.
3. Tick **Require status checks to pass before merging**, and in the search box below it pick
   `Format, lint, build, test`.
4. Tick **Do not allow bypassing the above settings**. Without it the rule does not apply to the
   owner of the repository, who would still see an enabled button.
5. **Create**.

From then on the button is disabled while the checks run and after they failed, and becomes
available when they pass. The price: nothing can be pushed straight to `main` any more, because a
direct push has not passed the check. Every change goes through a pull request.

The same from a terminal, with the GitHub CLI logged in as the owner:

```bash
gh api --method PUT repos/jghelen/gojs-diagrams/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "checks": [{ "context": "Format, lint, build, test" }] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

A workflow cannot do this by itself. Turning a failing pull request into a draft, which GitHub
does not merge, was tried here and failed: the label was set, but the step that makes the draft
ended with an error, so the pull request stayed mergeable.

Run them locally, the same way, before pushing. This includes the backend's types and tests, so
its packages have to be installed (`npm install --prefix backend`); the tests on a database are
run separately, see [Backend](#its-tests):

```bash
npm run verify
```

`npm run format` fixes the formatting.

### What is covered

| File                                                                                                                                                                                          | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram/node-data.spec.ts`                                                                                                                                                                   | Generated funds and relationships: counts, one parent per fund, no duplicates, ownership with two decimals, default gray square                                                                                                                                                                                                                                                                                                                                           |
| `src/testing/sample-data.spec.ts`, `src/testing/datasets.spec.ts`                                                                                                                             | The data the tests work on: the sample fund structure and the generated diagrams, which are also the sample diagrams of the database                                                                                                                                                                                                                                                                                                                                      |
| `diagram/link-types.spec.ts`                                                                                                                                                                  | The four line types, which of them avoid nodes, and that GoJS only does so on diagrams of fewer than 1000 nodes                                                                                                                                                                                                                                                                                                                                                           |
| `diagram/layouts.spec.ts`                                                                                                                                                                     | Every layout positions all nodes without overlaps; tree direction; small versus big trees                                                                                                                                                                                                                                                                                                                                                                                 |
| `diagram/diagram-factory.spec.ts`                                                                                                                                                             | Nodes (fixed size, icons, arrows, rule, red comment dot, gold outline), clicks on icons and selection, lines (black, solid or dotted, info icon, ownership label (never on another percentage or on a node, in every layout and line type), meeting the outline of a shape), tree highlight, adding a node, drag rule                                                                                                                                                     |
| `diagram/undo-history.spec.ts`                                                                                                                                                                | Undo/redo of every kind of change back to the exact initial state, more than 999 steps, deleted nodes coming back with their relationships                                                                                                                                                                                                                                                                                                                                |
| `diagram/history.service.spec.ts`                                                                                                                                                             | The history service: recording, undo and redo, positions, the state check, unfinished transactions, changes that are not recorded                                                                                                                                                                                                                                                                                                                                         |
| `diagram/constants.spec.ts`                                                                                                                                                                   | The constants: no duplicates, defaults among the choices, a picture for every shape                                                                                                                                                                                                                                                                                                                                                                                       |
| `diagram/shape-tiles.spec.ts`, `diagram/benchmark.spec.ts`                                                                                                                                    | Shape pictures for the Styles dialog; the timing helpers                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `diagram/line-ends.spec.ts`, `diagram/lane-router.spec.ts`                                                                                                                                    | Which sides a line attaches to and where on them; routes through lanes and corridors that never cross a node, lines of a gap side by side                                                                                                                                                                                                                                                                                                                                 |
| `diagram/diagram-name.spec.ts`                                                                                                                                                                | Which characters a diagram name keeps, in any alphabet; a name that arrives invalid is cleaned and reported                                                                                                                                                                                                                                                                                                                                                               |
| `diagram/file-name.spec.ts`, `diagram/change-details.spec.ts`                                                                                                                                 | The name of the exported file; the description of what an operation changed                                                                                                                                                                                                                                                                                                                                                                                               |
| `diagram-page/diagram-page.spec.ts`                                                                                                                                                           | The page: loading and its animation (everything disabled until all nodes are shown), undo/redo and the state check, bulk-run input, multi-node edits, comments, delete confirmation, relationships, layout and line type, tree highlight, the Styles dialog, the canvas tools, the Actions menu, name and description (required for a new diagram), search, the overview, new diagram, what is disabled on a diagram without nodes, the developer tools switch, Add Batch |
| `diagram-page/operation-runner/operation-runner.spec.ts`, `diagram-page/diagram-actions.spec.ts`, `diagram-page/diagram-state/diagram-state.spec.ts`                                          | The operation runner (order, timing log, recovery); every action as one undo step, zooming; the settings and history numbers the page shows                                                                                                                                                                                                                                                                                                                               |
| `diagram-page/selection-state/`, `node-search/`, `link-info-card/` (each with its `.spec.ts`), `diagram-page/fund-styles.spec.ts`, `export-to-png/diagram-picture.spec.ts`, `browser.spec.ts` | Selection and highlight; the search; the relationship card; the styles dialog state; export and print pictures; the browser helpers                                                                                                                                                                                                                                                                                                                                       |
| `new-batch/new-batch.spec.ts`                                                                                                                                                                 | The batch address and its placeholder page                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `diagram-list/diagram-list.spec.ts`                                                                                                                                                           | The list: what a row shows, the links of the titles, the pages and their Previous and Next, a page that does not exist, an empty list, a backend that does not answer; the search by title: from the address, a moment after typing, at once on Enter, kept from page to page, nothing found                                                                                                                                                                              |
| `diagram-page/stored-diagram.spec.ts`                                                                                                                                                         | A diagram of the database in the editor: waiting for it, nodes left where they were stored or arranged when they have no place, its settings, a diagram that does not come, Reset, picking other data, Back and Forward, the question before leaving                                                                                                                                                                                                                      |
| `api/diagrams-api.spec.ts`, `app.routes.spec.ts`                                                                                                                                              | What is asked of the backend and how its diagram becomes the editor's nodes and lines; which page each address shows                                                                                                                                                                                                                                                                                                                                                      |

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
- **Real mouse gestures.** Dragging a node, drawing a relationship from the edge of a node, dragging
  the box in the overview and zooming with the mouse wheel are not acted out. The rules behind
  them are tested directly: where a node may be dropped, and where a relationship may start.
- **A real new tab.** The test for **Add Batch** checks that a new tab is asked for with the right
  address, not what a particular browser then does.
- **Speed.** No test fails when something gets slower. The tests check that the lines of 2000 funds
  are routed within a generous limit and that the loading animation ends within its time limit,
  but not how long loading, undo or redo really take.
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

| File                                                                                       | Purpose                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/diagram-page/diagram-page.ts`, `.html`, `.css`                                    | The page: creates the diagram, loads data, keeps everything around it up to date, and puts the parts below on screen               |
| `src/app/diagram-page/components/page-header/page-header.*`                                | The top bar: the link to all diagrams, the number of legal entities, Styles, Actions, reset and new diagram                        |
| `src/app/diagram-page/components/page-footer/page-footer.*`                                | The line at the bottom of the page with the versions of Angular and GoJS                                                           |
| `src/app/diagram-page/components/diagram-info-bar/diagram-info-bar.*`                      | Name, description and search, above the canvas                                                                                     |
| `src/app/diagram-page/components/tool-strip/tool-strip.*`                                  | The tools on the left edge of the canvas, with their columns of icons                                                              |
| `src/app/diagram-page/components/relationship-card/relationship-card.*`                    | The card that an info icon opens                                                                                                   |
| `src/app/diagram-page/components/benchmark-statistics/benchmark-statistics.*`              | The table of timings below the canvas, and the dialog that lists the changes of an operation                                       |
| `src/app/diagram-page/components/side-panel/side-panel.*`                                  | History numbers, random edits, selected relationships and selected nodes                                                           |
| `src/app/diagram-page/components/node-dialogs/node-dialogs.*`                              | The color, comment and delete-confirmation dialogs of a node                                                                       |
| `src/app/diagram-page/components/style-dialog/styles-dialog.*`                             | The dialog "Styles by legal entity field" and its reset confirmation                                                               |
| `src/app/diagram-page/operation-runner/operation-runner.ts`                                | Runs operations one at a time, times them, keeps the benchmark statistics, recovers when one fails                                 |
| `src/app/diagram-page/diagram-actions.ts`                                                  | Every change to the diagram (edit, add, delete, layout, lines, cards) and undo/redo, each as one operation; zooming                |
| `src/app/diagram-page/diagram-state/diagram-state.ts`                                      | What is shown about the diagram as a whole: layout, line type, name, description, history numbers                                  |
| `src/app/diagram-page/selection-state/selection-state.ts`                                  | What is selected, and the highlight that goes with it                                                                              |
| `src/app/diagram-page/node-search/node-search.ts`                                          | The search for nodes by name                                                                                                       |
| `src/app/diagram-page/link-info-card/link-info-card.ts`                                    | Which relationship's card is open, and where it stands                                                                             |
| `src/app/diagram-page/fund-styles.ts`                                                      | What is ticked and picked in the styles dialog                                                                                     |
| `src/app/diagram-page/export-to-png/diagram-picture.ts`, `src/app/diagram-page/browser.ts` | Export and print pictures; small browser helpers                                                                                   |
| `src/app/diagram/diagram-factory.ts`                                                       | Node and link templates, icons, click handling, tree highlight, adding nodes                                                       |
| `src/app/diagram/history.service.ts`                                                       | Everything to do with the undo history (GoJS UndoManager)                                                                          |
| `src/app/diagram/constants.ts`                                                             | The fixed values of the product in one place: shapes, colours, legal entity types, defaults, size limits, animation timings, texts |
| `src/app/diagram/diagram-name.ts`                                                          | The rule for the name of a diagram: which characters it may have, and the check of a name that arrives with a diagram              |
| `src/app/diagram/change-details.ts`, `file-name.ts`                                        | The description of what an operation changed; the name of an exported file                                                         |
| `src/app/diagram/layouts.ts`                                                               | The six layouts                                                                                                                    |
| `src/app/diagram/link-types.ts`                                                            | The four line types                                                                                                                |
| `src/app/diagram/node-data.ts`                                                             | Data types of nodes and lines, and the invented names used by the random edits                                                     |
| `src/testing/datasets.ts`, `generated-funds.ts`, `sample-data.ts`, `stored-diagrams.ts`    | Test data only: the diagrams the tests open, and how they stand in for the database there                                          |
| `src/app/diagram/shape-tiles.ts`                                                           | The shape pictures used in the Styles dialog                                                                                       |
| `src/app/diagram/benchmark.ts`                                                             | Timing helpers                                                                                                                     |
| `src/app/diagram-list/diagram-list.*`                                                      | The list of the diagrams of the database, a page at a time                                                                         |
| `src/app/api/diagrams-api.ts`                                                              | The app's access to the backend: a page of the list, one diagram                                                                   |
| `src/app/app.routes.ts`                                                                    | The addresses of the app; the editor's two addresses are one route                                                                 |
| `proxy.conf.json`                                                                          | Lets the dev server pass `/api` on to the backend                                                                                  |
| `src/app/new-batch/new-batch.ts`                                                           | The placeholder "Add batch" page and its address                                                                                   |
| `src/app/app.routes.ts`                                                                    | Routes                                                                                                                             |
| `src/styles.css`                                                                           | Global styles: the base look of buttons and inputs, and what the parts of the page share (dialogs, hints, colour swatches)         |
| `src/testing/`                                                                             | Test setup, the canvas stand-in and the diagram test helpers                                                                       |
| `src/**/*.spec.ts`                                                                         | Unit tests, next to the file they test                                                                                             |

### How the page is put together

The page is cut into parts, one component each, so that no file has to be read from top to bottom
to find one thing. The parts do not talk to each other. Each of them asks Angular for the services
it needs (`inject(DiagramActions)` and so on), and the page provides one set of those services per
diagram. A click in the tool strip therefore goes straight to `DiagramActions`; the side panel sees
the result because it reads the same `DiagramState`.

Only three things go through the page itself, because they need the diagram or another part:
loading data (from the header), opening the delete confirmation (from the side panel), and telling
GoJS that the canvas changed size (when the statistics are opened or closed).

## Database

The data is meant to live in PostgreSQL 14 or newer. The tables exist and the
[backend](#backend) reads from them, and the app shows them: as a
[list](#the-list-of-diagrams) and, one at a time, in the editor. Nothing is written yet. What they are and why is
told in [DATABASE.md](DATABASE.md). In short:

- Every node is a **legal entity**, stored once. It can be placed in several diagrams or in none.
- A **relationship** between two legal entities does not depend on the diagram: every diagram that
  has both of them draws it, with the same kind and percentage.
- A diagram can have **artificial links** of its own: dashed lines drawn between two of its nodes,
  which exist in that diagram only and are not relationships.
- A legal entity can have **user-defined fields** (text, number, date or yes/no); each entity has
  a given field or does not.
- A diagram keeps its own settings, and for each of its nodes the position, colour, shape and
  comment.

### Creating it

With a PostgreSQL server running, one script creates the database `fund_diagrams` with its tables
and the editor's eight test diagrams. It asks for the password of the `postgres` user once. The PostgreSQL 14 on
this machine listens on port 5433:

```bash
PGPORT=5433 backend/db/setup.sh --with-sample
```

### Connecting from DataGrip

1. Open the **Database** tool window, press **+** → **Data Source** → **PostgreSQL**.
2. Fill in:

   | Field    | Value                                                 |
   | -------- | ----------------------------------------------------- |
   | Host     | `localhost`                                           |
   | Port     | `5433` on this machine (PostgreSQL's usual is `5432`) |
   | User     | `postgres`                                            |
   | Password | the password chosen when PostgreSQL was installed     |
   | Database | `fund_diagrams`                                       |

3. Click **Download missing driver files** if DataGrip offers it, then **Test Connection**, then
   **OK**.

The tables are under `fund_diagrams` → `public` → `tables`. If none show, tick `public` in the data
source's **Schemas** tab. More, including what to do when the connection is refused, is in
[DATABASE.md](DATABASE.md#connecting-from-datagrip).

The password of `postgres` cannot be looked up: PostgreSQL does not keep it in a readable form.
Where it may have been saved, how to set a new one, and how to do without it, is in
[DATABASE.md](DATABASE.md#if-you-do-not-know-the-password).

## Backend

A small server in `backend/`: Node.js 24 with [Express](https://expressjs.com) and the PostgreSQL
driver `pg`, written in TypeScript. Node runs the `.ts` files as they are, so there is no build
step. It has two addresses so far, both for reading.

### Starting it

The [database](#creating-it) has to exist. Then, once:

```bash
cd backend
npm install
cp .env.example .env
```

and write the password of the database into `backend/.env`, on the line `PGPASSWORD=`. On this
machine also set `PGPORT=5433`. The file is not committed. Then:

```bash
npm start
```

`npm run dev` does the same and restarts when a file changes. The server listens on
<http://localhost:3000>; another port can be set with `PORT` in `.env`.

The app reaches it under `/api` of its own address: while developing, the dev server (`npm start`
in the project folder) passes every address that starts with `/api` on to
`http://localhost:3000`, as said in `proxy.conf.json`. Change the port there too if you change
it in `.env`.

### Listing the diagrams

`GET /api/diagrams?page={n}&search={text}` gives one page of the list of diagrams, 20 to a page,
the one changed last first. Both parts are optional: without `page` it gives the first page, and
without `search` every diagram.

```bash
curl "http://localhost:3000/api/diagrams?search=generated&page=1"
```

```json
{
  "items": [
    {
      "id": 2,
      "name": "30 generated funds LE 30",
      "createdAt": "2026-09-21T17:46:13.573Z",
      "updatedAt": "2026-10-12T12:46:13.573Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 6,
  "totalPages": 1
}
```

The cutting into pages is done by the database (`limit` and `offset`), so a page costs the same
however long the list is. A page after the last has no `items` and still the totals.

With `search`, the list is of the diagrams that have the text anywhere in their name; `total` and
`totalPages` count those. Capitals make no difference, in any alphabet. The text is taken as it
is: `%` and `_` stand for themselves. Spaces around it are ignored, and a text of spaces only is
no search.

| Answer | When                                                   | Body                                                                 |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `200`  | Always, for a page that is a whole number above zero   | The page, as above                                                   |
| `400`  | `page` is something else (`abc`, `0`, `-1`, `1.5`)     | `{ "error": "The page is a whole number above zero." }`              |
| `400`  | `search` is longer than 200 characters, or given twice | `{ "error": "The search is one text of at most 200 characters." }`   |
| `500`  | The database could not be reached or failed            | `{ "error": "The request could not be answered. Try again later." }` |

### Reading a diagram

`GET /api/diagrams/{id}` gives one diagram with its settings, nodes and lines:

```bash
curl http://localhost:3000/api/diagrams/1
```

```json
{
  "id": 1,
  "version": 1,
  "settings": {
    "name": "Sample fund structure",
    "description": "",
    "layoutType": "top-bottom",
    "linkType": "avoid",
    "cardsExpanded": false,
    "subtitleField": null,
    "subtitleUserDefinedFieldId": null
  },
  "nodes": [
    {
      "key": 1,
      "title": "Meridian Global FoF",
      "legalEntityType": "Fund of funds",
      "shape": "Rectangle",
      "color": "#f3f4f6",
      "comment": "Annual audit is due on 31 March.",
      "loc": "700.5 0",
      "fields": [
        {
          "id": 1,
          "name": "Jurisdiction",
          "dataType": "text",
          "isOptional": false,
          "value": "Luxembourg"
        }
      ]
    }
  ],
  "links": [
    { "key": 1, "from": 1, "to": 2, "category": "hierarchy", "ownership": 64 },
    { "key": 31, "from": 24, "to": 1, "category": "manual" }
  ]
}
```

The names are the ones the app uses, so `nodes`, `links` and `settings` fit its `createModel()`
as they are.

- **`nodes`**: `key` is the id of the legal entity. `title` and `legalEntityType` are the same in
  every diagram; `shape`, `color`, `comment` and `loc` belong to this diagram. `loc` is left out
  for a node that has no position yet. `fields` are the user-defined fields the entity has; a
  field it has but with no value comes with `"value": null`, a field it does not have is not
  listed.
- **`links`**: every relationship between two legal entities that are both in the diagram
  (`category` `hierarchy` or `relation`, with `ownership` when the percentage is known), and the
  diagram's own artificial links (`category` `manual`, to be drawn dashed). Nothing in the
  database says per diagram which relationships to show. No two lines have the same `key`.
- **`version`** goes up with every save; it will let a save notice that somebody else saved first.

| Answer | When                                                              | Body                                                                                                                |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `200`  | The diagram exists                                                | The diagram, as above                                                                                               |
| `400`  | The id is not a whole number above zero (`abc`, `0`, `-1`, `1.5`) | `{ "error": "The id of a diagram is a whole number above zero." }`                                                  |
| `404`  | There is no diagram with this id                                  | `{ "error": "There is no diagram with the id 7." }`                                                                 |
| `500`  | The database could not be reached or failed                       | `{ "error": "The request could not be answered. Try again later." }`; the cause is written to the server's log only |

### Its files

| File                                    | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `backend/src/server.ts`                 | Starts the server                                                    |
| `backend/src/app.ts`                    | The addresses and their answers, including the errors                |
| `backend/src/database.ts`               | The connections to PostgreSQL, from the settings in `.env`           |
| `backend/src/diagrams/list-diagrams.ts` | Reads one page of the list of diagrams                               |
| `backend/src/diagrams/read-diagram.ts`  | The four queries that read one diagram, in one read-only transaction |
| `backend/src/diagrams/to-diagram.ts`    | Turns the rows into the diagram that is handed out                   |
| `backend/src/diagrams/diagram.ts`       | What a diagram looks like in an answer                               |
| `backend/db/`                           | The tables, see [Database](#database)                                |

### Its tests

```bash
cd backend
npm run verify
```

checks the types and runs the tests that need no database: the answers of the address, with
something standing in for the database, and the turning of rows into a diagram.

```bash
npm run test:db
```

runs the tests that read from a real PostgreSQL server, with the settings of `.env`. They create a
database of their own (`fund_diagrams_test_…`) with the tables and the sample diagrams, read
diagrams from it, and drop it again; `fund_diagrams` is not touched.

## Build and hosting

```bash
npm run build
```

The result is a static site in `dist/gojs-diagrams/browser`. Any static host can serve it. For the
list of diagrams and the diagrams of the database, the host also has to pass the addresses that
start with `/api` on to the [backend](#backend). Without that the app has nothing to show: the
list says that it could not be read, and only a new, empty diagram can be opened. The
build includes a `_redirects` file so that `/batches/new` and `/diagrams` also work on hosts that use it, such as
Netlify; on other hosts, configure a fallback to `index.html`.

Read the [licence](#licence) section before publishing a build on the public internet.

## Known limits

- **When an action fails.** If an error interrupts an action halfway, the app takes back what the
  action had changed so far, closes the open transaction and shows a notice above the diagram:
  "That action could not be completed and was undone." Work can go on at once, and undo, redo and
  Reset diagram keep working. Without this GoJS would stay inside the unfinished transaction and
  the diagram would be stuck until the page is reloaded. The error itself is written to the
  browser console.
- **Waiting on mid-sized diagrams.** Below 1000 nodes GoJS routes the lines around the nodes,
  which takes about a second at 200 nodes and several seconds at 500, when the diagram is loaded,
  rearranged or its line type switched; the page does not respond meanwhile. From 1000 nodes on
  the app's own router does it in a fraction of a second. The number is `AVOID_NODES_BELOW` in
  `src/app/diagram/constants.ts`.
- **Crossing the 1000-node mark by hand.** Which router is used is decided when a diagram is
  loaded and when the line type is switched. If you add or delete nodes across the limit, the
  existing lines keep the routing they had until you switch the line type again.
- **Lines across nodes.** Below 1000 nodes this is rare but not impossible: GoJS falls back to a
  plain line when it finds no way around, for about one line in a hundred in some layouts. From
  1000 nodes on a line crosses a node only if its own node is shut in by other nodes above and
  below, which the layouts never produce; it takes dragging nodes onto each other.
- **Force-directed on big diagrams.** The app's router for big diagrams needs nodes that stand
  in rows. In the Force-directed layout they do not, so on a diagram of 1000 nodes or more in that
  layout most orthogonal lines run across nodes; straight lines suit it better. Such a diagram
  never opens in that layout by itself.
- **When a diagram cannot be opened.** If an error stops a diagram while it is being arranged,
  GoJS arranges nothing in that diagram any more. The app then throws the diagram away, opens an
  empty one in the default layout and says so above the canvas; you can open other data at once.
- **Slow layouts on big diagrams.** The Circle and Layered digraph layouts take many seconds from
  1000 nodes on (Layered digraph about half a minute at 2000). That time is spent inside GoJS's
  layout, not on the lines. A diagram of 500 nodes or more is therefore never opened in one of
  them, or in Force-directed: it opens Top to bottom instead. You can still pick them by hand.
- **Places after an undo.** When a move is undone, the lines of the moved node find their places
  again, but the lines of its neighbours keep theirs until they are next routed.
- **The children of a deleted node** stay in the diagram without a parent; nothing re-attaches
  them.
- **Operations block the page while they run.** A bulk edit is capped so that it stays in the
  range of seconds.
- **Percentages in tight spots.** Where every place beside a line lies on a node, its percentage
  goes on a node rather than on another percentage. That is rare.
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
