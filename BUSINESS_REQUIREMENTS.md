# Fund structure diagram: business requirements

This document describes, in business terms, what the diagram editor does and the rules it follows.
It reflects the application as it is built today. For installation, technical design and tests see
the [README](README.md).

- [1. Purpose](#1-purpose)
- [2. Terms](#2-terms)
- [3. Screen overview](#3-screen-overview)
- [4. Diagrams](#4-diagrams)
- [5. Nodes (funds)](#5-nodes-funds)
- [6. Relationships](#6-relationships)
- [7. Selecting and highlighting](#7-selecting-and-highlighting)
- [8. Styling by legal entity field](#8-styling-by-legal-entity-field)
- [9. Layout and lines](#9-layout-and-lines)
- [10. Finding your way around](#10-finding-your-way-around)
- [11. Undo and redo](#11-undo-and-redo)
- [12. Export and print](#12-export-and-print)
- [13. Confirmations and buttons](#13-confirmations-and-buttons)
- [14. Performance measurement](#14-performance-measurement)
- [15. Not available yet](#15-not-available-yet)

## 1. Purpose

Users need to see and edit the structure of a group of funds: which fund sits under which, which
funds are related in other ways, and how much one fund owns of another.

The application is a working prototype of such an editor. It also answers a technical question for
the business: **does undo/redo stay fast and reliable on large structures** (up to 2000 funds)?

## 2. Terms

| Term                | Meaning                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Diagram             | One fund structure: its funds, their relationships, a name and a description                                     |
| Node                | One fund, drawn as a shape with the fund's name and, when shown, its legal entity type                           |
| Legal entity type   | The kind of fund (for example "Feeder fund"); it can be shown under the name of the node                         |
| Relationship        | A line with an arrow from one fund to another                                                                    |
| Hierarchy           | The main holding: the line from a fund to a fund in which it is the largest investor; together these form a tree |
| Manual relationship | A relationship the user drew by hand in the diagram                                                              |
| Ownership           | The percentage of the target fund that the source fund owns                                                      |
| Tree of a node      | The chain from the node up to the top fund, plus every fund below the node                                       |
| Undo step           | One user action that can be taken back with a single Undo                                                        |

## 3. Screen overview

| Area                          | Content                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Header, left                  | **Data** dropdown: which diagram to open                                                                                           |
| Header, right                 | **Styles**, **Actions** menu, **Reset diagram** (reload icon), **New diagram**, **Developer tools** switch                         |
| Bar above the canvas          | Diagram **name**, **description**, and **search**                                                                                  |
| Left navigation on the canvas | Add node, Undo, Redo, Zoom in, Zoom out, Zoom to fit, Layout, Lines, Shape, Auto arrange, Expand all, Collapse all (in that order) |
| Canvas                        | The diagram                                                                                                                        |
| Overview, bottom right        | A small picture of the whole diagram for moving around                                                                             |
| Side panel, right             | Selected relationships, selected nodes; with the developer tools also History and bulk edits                                       |
| Below the canvas              | With the developer tools only: timing table (see [14](#14-performance-measurement))                                                |

Every icon without a text label shows its name when the user hovers over it.

## 4. Diagrams

### 4.1 Opening a diagram

- **BR-4.1** The application opens with the diagram of 30 generated funds.
- **BR-4.2** The **Data** dropdown offers: a sample fund structure (24 funds: a fund of funds and
  what it holds, four levels deep), generated diagrams of 30, 100, 200, 500, 1000 and 2000 funds,
  and an empty diagram.
- **BR-4.2a** Every dataset reads like real holdings of investment funds. A line runs from the
  fund that invests to the fund it invests in; its percentage is the part of that fund the
  investor owns. Names and percentages are invented; no real fund is shown.
- **BR-4.2b** The rules the data follows:
  1. one fund of funds is at the top, and no fund invests in it;
  2. every other fund has exactly one main investor, which holds the largest known stake in it;
  3. other funds may hold smaller stakes in it (co-investments), about one for every two funds;
  4. all stakes in a fund add up to at most 100%;
  5. a feeder fund invests in exactly one fund;
  6. the sub-funds of a strategy fund have the same strategy;
  7. there is no circular ownership;
  8. percentages have two decimals, and for some lines there is no data.
- **BR-4.3** Every fund in a newly opened diagram is a very light gray square with a dark gray
  border.
- **BR-4.4** A diagram opens laid out top to bottom, with lines that go around the nodes, whatever
  its size. Opening other data keeps the layout and the line type that were chosen, except for a
  layout that would be slow on the new data (BR-9.2b).

### 4.2 Loading animation

- **BR-4.5** When a diagram is opened, its nodes are drawn one after another. A relationship is
  drawn as soon as both funds it connects are on screen.
- **BR-4.6** The animation takes at most 1.5 seconds. On a diagram of more than 200 funds it takes
  half a second, so that large diagrams still open quickly.
- **BR-4.7** Until the whole diagram is drawn, every action is disabled: the header, the left
  navigation, name, description and search, the side panel, the overview and the diagram itself.
- **BR-4.8** The animation is skipped for users whose system is set to reduce motion.

### 4.3 Name and description

- **BR-4.9** A diagram has a name and a description, edited in the bar above the canvas.
- **BR-4.10** An opened diagram is named after its data. The description starts empty.
- **BR-4.10a** A new diagram has no name; the user has to give it one. Until then the name box is
  empty, marked in red, and says "Diagram name (required)".
- **BR-4.11** Changing the name or the description is one undo step each.

### 4.4 Reset and new diagram

- **BR-4.12** **Reset diagram** reloads the chosen data as it was at the start. All changes and
  the undo history are discarded. The chosen layout and line type are kept.
- **BR-4.13** **New diagram** opens an empty canvas so a structure can be built from scratch with
  Add node and hand-drawn relationships.
- **BR-4.14** While the diagram is empty, the actions that need content (the three zooms, Layout,
  Lines, Auto arrange) are disabled. Add node stays available.
- **BR-4.15** While the diagram has no nodes, the **Styles** button and the **Actions** menu
  (Export PNG, Print) are disabled too: there is nothing to style, export or print. Both become
  available with the first node, and are disabled again when the last node is deleted or its
  adding is undone. Reset diagram and New diagram stay available.

## 5. Nodes (funds)

### 5.1 What a node shows

- **BR-5.1** A node shows the fund's **name** (title). Below it, it can show the value of a legal
  entity field (subtitle), such as its legal entity type. A newly opened diagram shows no
  subtitle; it appears once a field is applied in the styles dialog (see BR-8.0a).
- **BR-5.2** All nodes have the same size, whatever their shape.
- **BR-5.3** A name or legal entity type that does not fit is cut off with "…". Hovering over it shows the
  full text. Text never runs outside the node.
- **BR-5.3a** Name and legal entity type are centred in the node, also when they are cut off. A long name
  is cut where the line ends, in the middle of a word if need be.
- **BR-5.4** Text is dark on a light fill and light on a dark fill, so it stays readable in every
  colour.

### 5.2 Controls on a node

| Control            | Position                    | Hover text   | What happens                                                      |
| ------------------ | --------------------------- | ------------ | ----------------------------------------------------------------- |
| Rainbow circle     | Below the text              | Change color | Opens the colour chooser for this node                            |
| Speech bubble      | Below the text              | Add comment  | Opens the comment dialog for this node                            |
| Plus in a box      | Below the text              | Add Batch    | Opens the "new batch" page for this node in a **new browser tab** |
| Gray x             | Top right, inside the shape | Delete node  | Asks for confirmation, then deletes the node                      |
| Up and down arrows | Left, one above the other   | none         | No action yet                                                     |

- **BR-5.5** A thin horizontal line separates the text from the three icons below it.
- **BR-5.6** All controls stay inside the shape for every shape, including diamond and ellipse.

### 5.3 Colour

- **BR-5.7** The colour chooser offers nine preset colours and a free choice of any colour.
- **BR-5.8** Choosing a colour is one undo step.

### 5.4 Comments

- **BR-5.9** A node can carry one comment.
- **BR-5.10** A **red dot** on the speech bubble shows that the node has a comment. Without a
  comment there is no dot.
- **BR-5.11** **Save** is disabled while the text box is empty or holds only spaces.
- **BR-5.12** An existing comment can be removed with **Delete comment**.
- **BR-5.13** Saving or deleting a comment is one undo step.

### 5.5 Add Batch

- **BR-5.14** Add Batch opens the address `/batches/new?nodeId=<id of the fund>` in a new tab. The
  diagram stays open and unchanged in the original tab. The target page is a placeholder for now.

### 5.6 Adding a node

- **BR-5.15** **Add node** (plus icon, first item of the left navigation) adds one new fund as a
  light gray square.
- **BR-5.16** The new node is placed in the free spot nearest to the middle of the visible area.
  It never lands on top of another node.
- **BR-5.17** A new node has no relationships.

### 5.7 Editing nodes

- **BR-5.18** With one or more nodes selected, the side panel edits title, legal entity type and colour.
  The change applies to all selected nodes at once and is one undo step.
- **BR-5.18a** The shape of the selected nodes is set from the **Shape** item of the left
  navigation, not from the side panel. It opens a column of shape pictures, each named on hover;
  picking one changes all selected nodes as one undo step. The item shows the shape the selection
  has now and is disabled while no node is selected.
- **BR-5.18b** While the tree of a single selected node is highlighted, the Shape item changes
  every highlighted node, including the nodes joined by a hand-drawn relationship, as one undo
  step. Its hover text then says how many nodes that is.
- **BR-5.19** Where the selected nodes differ on a field, the panel shows "Mixed".
- **BR-5.20** Title and legal entity type cannot be edited directly on the node. They are changed in the
  side panel only. A press on the text of a node selects or moves the node.

### 5.8 Moving nodes

- **BR-5.21** A node is moved by dragging it.
- **BR-5.21a** A node can be dragged from anywhere on it except a thin rim along its edge, at
  every zoom level. A drag that starts on that rim, or just outside the node, draws a
  relationship instead (see BR-6.11).
- **BR-5.22** Nodes must never overlap: a node cannot be dropped on another node.
- **BR-5.23** After a move, lines that would now cross the moved node are routed around it.

### 5.9 Deleting nodes

- **BR-5.24** A node is deleted with its gray x, or by selecting one or more nodes and pressing
  the Delete key or the **Delete node** button.
- **BR-5.25** A confirmation dialog always comes first. It names the node (or the number of nodes)
  and says how many relationships go with it. **Cancel** changes nothing.
- **BR-5.26** Deleting removes the node **and the relationship lines attached to it**.
- **BR-5.27** All other nodes stay in the diagram and stay where they are, including the funds
  below the deleted one. No relationship is created or re-attached.
- **BR-5.28** Deleting is one undo step: one Undo brings back the node and its lines.

## 6. Relationships

### 6.1 Kinds of relationship

| Kind                               | Drawn as         | Info icon | Where it comes from |
| ---------------------------------- | ---------------- | --------- | ------------------- |
| Main holding (hierarchy)           | Solid black      | Yes       | The loaded data     |
| Co-investment (other relationship) | Solid black      | Yes       | The loaded data     |
| Manual relationship                | **Dotted** black | No        | Drawn by the user   |

- **BR-6.1** All lines are black, equally thick, and end in an arrowhead at the target fund. Main
  holdings and co-investments look the same; the relationship card says which one a line is.
- **BR-6.2** A line starts and ends exactly on the outline of the shape, for every shape. There is
  no gap between line and node.
- **BR-6.2a** A line attaches to the **top or the bottom side** of a node, in the middle, never to
  the left or right side. It leaves the bottom of the fund that invests and arrives at the top of
  the fund it invests in. Where that fund stands above the investor (Bottom to top layout, or
  after a node was moved), it leaves the top and arrives at the bottom. Two funds that stand side
  by side are joined over their tops.
- **BR-6.2b** A parent's line therefore arrives at the top, in the middle, of its child.
- **BR-6.2c** Where several lines attach to the same side of a node, they stand next to each
  other around the middle of the side, 6 units apart, in the order of where they lead, so that
  each can be seen and clicked right up to the node. On a side with more lines than fit, they
  move closer together and stay clear of the corners of the node.
- **BR-6.2d** A line is straight wherever possible. A fund that stands right below its investor
  is joined to it by one straight line, which takes the very middle of both sides. In the Top to
  bottom and Bottom to top layouts an only child, and the first of several leaves, stands right
  under (or over) its parent.
- **BR-6.2e** The ends of lines follow the nodes: when a node is moved to the other side of
  another, the lines between them change sides, and the other lines on those sides close up.
- **BR-6.3** With the two orthogonal line types, lines go around nodes and do not run across
  them, on diagrams of every size: their runs lie in the gaps above and below the nodes.
- **BR-6.3a** Layouts leave 60 units of free space between nodes, so that several lines and their
  percentages can pass between two nodes.
- **BR-6.3b** While the mouse is on a line, that line is drawn in gold and thicker, so that it
  can be followed among the others. Lines cross each other plainly, without a hop at the crossing.
- **BR-6.3c** Right-angled lines that would run along the same stretch are drawn side by side,
  not on top of each other, 6 units apart: as near to each other as they can be while each can
  still be told from the others and clicked. Where more lines pass through a gap than fit at
  that distance, they move closer together. A line is never moved onto a node to make room.

### 6.2 Ownership

- **BR-6.4** A relationship may carry an ownership percentage: how much of the fund the arrow
  points at is owned by the fund the line comes from.
- **BR-6.5** It is shown in **dark green**, with **two decimals** (for example `62.50%`), at the
  arrow end of the line.
- **BR-6.6** The percentage has no background of its own; it stands directly on the canvas.
  It is placed beside the line and clear of the node, so the whole figure
  can always be read.
- **BR-6.7** Where no ownership is known, nothing is shown.
- **BR-6.7a** Percentages never cover one another, whether their relationships end at the same
  fund or at different funds: each is moved to a free place beside its line.
- **BR-6.7b** A percentage does not lie on a fund, where the fund would hide it. Where the place
  next to the arrowhead is taken or lies on a fund, the percentage goes to the other side of the
  line or further back along the line, following its bends. On diagrams of 500 funds or more,
  where lines cross funds, a few percentages may find no such place; they still never cover each
  other.
- **BR-6.7c** The same diagram always shows its percentages in the same places.

### 6.3 Relationship details

- **BR-6.8** Every relationship from the data has a small "i" icon in the middle of the line. It
  is drawn on top of the line.
- **BR-6.9** Clicking it shows a card on the canvas, beside the icon, with the kind of
  relationship, the two funds it connects, and the ownership ("No data" where unknown). It is
  not a modal dialog: the rest of the screen stays usable.
- **BR-6.9a** The card always stays inside the canvas, and follows its icon when the diagram is
  scrolled or zoomed. Clicking the icon of another relationship moves the card there.
- **BR-6.9b** The card goes away on a second click on the same icon, on its x, on Escape, on a
  click on empty canvas, when a node is selected, when any action is carried out, and when other
  data is loaded.
- **BR-6.10** The relationship can be removed from that card.

### 6.3a All relationship cards at once

- **BR-6.10a** **Expand all** (left navigation, near the bottom) shows a card on every
  relationship that has an info icon: the kind of relationship, the two funds and the ownership.
  **Collapse all** hides them again.
- **BR-6.10b** A card stands on its line, in the place of the info icon. While the cards are
  shown, the info icons are not.
- **BR-6.10c** Cards stand **between** the nodes. No card covers a node, and no card covers
  another card. To make that possible, expanding arranges the diagram anew with the nodes
  further apart; collapsing arranges it close together again.
- **BR-6.10d** Where the place of the icon is taken, the card is moved along its line, or right
  beside it, to the nearest free place.
- **BR-6.10e** Expand all and Collapse all are one undo step each. Undoing an expansion brings
  back the old positions of the nodes and hides the cards.
- **BR-6.10f** When a line is selected by a click, its card is marked in gold.
- **BR-6.10g** Expand all and Collapse all are disabled while no relationship has a card to show:
  on a diagram of a single node, while none of the nodes is joined to another, and while the only
  relationships are hand-drawn ones, which have no card. Their hover text then says so.
- **BR-6.10g** The cards grow and shrink with the zoom, like the nodes. They stay shown while the
  diagram is edited, and when the layout is switched or arranged again. Opening other data
  starts collapsed.

### 6.4 Drawing a relationship

- **BR-6.11** The user draws a relationship by dragging from the edge of a node to another node.
  There is no separate icon for this on the node.
- **BR-6.11a** The edge does not have to be hit exactly. A drag that starts within a few pixels
  of it on screen, inside or just outside the node, draws a relationship at any zoom level; a drag
  from the middle of the node moves the node.
- **BR-6.12** A hand-drawn relationship is dotted, has no info icon and no ownership.
- **BR-6.13** A relationship cannot be drawn between two funds that already have one, whichever
  way it points and whether it came from the data or was drawn by hand. Once that relationship is
  removed, a new one can be drawn.
- **BR-6.14** Drawing a relationship is one undo step.

### 6.5 Removing relationships

- **BR-6.15** Selected lines are removed with the Delete key or the button in the side panel,
  without a confirmation.
- **BR-6.16** With nodes selected, the side panel can remove all relationships that touch them.
  The nodes themselves stay.
- **BR-6.17** Removing relationships is one undo step.

## 7. Selecting and highlighting

- **BR-7.1** A click selects a node. Clicking further nodes adds them to the selection; clicking a
  selected node takes it out. No extra key is needed.
- **BR-7.2** Clicking empty canvas clears the selection.
- **BR-7.3** A selected node is marked by a **gold outline** in its own shape. There is no blue
  selection rectangle. The outline fits the node closely for every shape, with no gap between
  outline and node.
- **BR-7.4** Clicking one of the icons on a node performs that icon's action and does not change
  the selection.
- **BR-7.5** When **exactly one** node is selected, everything that belongs to it is highlighted
  and the rest of the diagram is dimmed. Every highlighted node gets the gold outline.
- **BR-7.6** What belongs to the selected node:
  1. its tree: the funds above it up to the top and all funds below it, with the lines between
     them;
  2. every relationship line of the node itself, of any kind (hierarchy, other relationship,
     drawn by hand), with the fund at its other end;
  3. every line that joins two highlighted funds, also when that line is not part of the tree.
- **BR-7.7** The highlight ends when the user clicks empty canvas, selects a second node, or does
  anything else (zoom, auto arrange, undo, an edit).
- **BR-7.8** Highlighting is display only. It is never an undo step.

## 8. Styling by legal entity field

The **Styles** button (palette icon) opens the dialog **Styles by legal entity field**, which
gives all nodes with the same value of a field the same look. The button is disabled while the
diagram has no nodes (BR-4.15).

- **BR-8.0** A dropdown at the top left of the dialog, above **Select all**, chooses the legal
  entity field the nodes are grouped by. For now it offers one field, **Legal entity type**.
  Until a field is chosen, no values are listed and nothing can be applied.
- **BR-8.0a** Applying the dialog with a field chosen shows that field's value on every node, as
  a subtitle under the name. The user can apply the field alone, without ticking a value or
  picking a colour or shape; apply a colour or shape alone, when the field is shown already; or
  do both at once. Either way it is one undo step.
- **BR-8.0b** While no field is chosen the dropdown reads "Select a field". That text is not
  offered in the opened list, which holds the fields only. The field is unselected again with
  **Reset all** (BR-8.8). The dialog opens on the field the nodes currently show.
- **BR-8.0c** Colour and shape can be picked only while at least one value of the field is
  ticked; until then their controls are disabled. When the last value is unticked, the colour and
  shape that were picked are forgotten.
- **BR-8.1** Once **Legal entity type** is chosen, the dialog lists every legal entity type
  present in the diagram (Feeder fund, Fund of funds, Private equity and so on) with the number
  of nodes of that type.
- **BR-8.2** Each row starts with a small picture of that type's shape and colour. The picture
  follows the choices made in the dialog, before they are applied.
- **BR-8.3** One or several legal entity types can be selected by clicking their rows. A **Select all**
  checkbox selects or unselects all of them. Selected rows are marked in dark green.
- **BR-8.4** Shapes are offered as pictures with their name: Square, Rounded, Ellipse, Diamond,
  Capsule, Rounded top. Colours are offered as swatches.
- **BR-8.5** A **preview** shows a complete node as it will look, including its icons, arrows,
  line and x.
- **BR-8.6** **Nothing in the diagram changes until Apply is pressed.** Apply is disabled while
  there is nothing to apply: no other field than the one shown, and no colour or shape for a
  ticked value.
- **BR-8.7** Apply changes every node of the ticked values, shows the chosen field on the nodes,
  closes the dialog, and is one undo step.
- **BR-8.8** **Reset all to gray square** asks for confirmation. When confirmed, every node goes
  back to the default light gray square **and the legal entity field is unselected**: the nodes
  show their name only, and the dropdown is back on "Select a field". This is one undo step and
  can be redone after an undo.

## 9. Layout and lines

### 9.1 Layout

- **BR-9.1** The Layout item of the left navigation opens a column of icons, one per layout, each
  named on hover: **Top to bottom**, **Bottom to top**, **Circle**, Layered digraph,
  Force-directed, Grid.
- **BR-9.2** In every layout, nodes do not overlap.
- **BR-9.2b** A diagram of 500 funds or more opens in a layout that is quick at that size (Top to
  bottom, Bottom to top or Grid). If one of the other three was in use from a smaller diagram, it
  opens Top to bottom. The user can still choose any layout by hand.
- **BR-9.2c** The Force-directed layout keeps the diagram compact: it never spreads the funds over
  an area many times larger than they need.
- **BR-9.2a** The Grid layout always puts 20 nodes in a row. Zooming or resizing the window never
  moves a node.
- **BR-9.3** Switching the layout rearranges the whole diagram and is one undo step.
- **BR-9.4** **Auto arrange** (last item of the left navigation) applies the current layout again.
  It tidies the diagram after nodes were moved or added by hand, and is one undo step.

### 9.2 Line type

- **BR-9.5** The Lines item, below Layout, opens a column of icons, one per line type, each named
  on hover: Orthogonal rounded, Orthogonal square, Straight, Curved.
- **BR-9.6** Straight and curved lines cannot go around nodes; their names say "(crosses
  nodes)". The two orthogonal types route lines around nodes on diagrams of every size.
- **BR-9.6b** Going around nodes on a diagram of 500 funds or more needs funds that stand in rows,
  as in every layout but Force-directed. In that layout lines of such a diagram may cross funds.
- **BR-9.6a** Switching the line type must never freeze the screen, whatever the size of the
  diagram. On a diagram of 500 funds or more the lines are therefore routed by a faster method
  than on smaller ones; the result looks the same.
- **BR-9.7** Switching the line type is one undo step.
- **BR-9.8** Only one of the columns (Layout, Lines, Shape) is open at a time. A column opens
  beside the navigation and always stays inside the canvas.
- **BR-9.9** Every item of the left navigation, and every icon in its columns, shows its name
  beside it as soon as the mouse is over it.

## 10. Finding your way around

### 10.1 Zoom

- **BR-10.1** **Zoom in** and **Zoom out** change the size step by step. **Zoom to fit** shows the
  whole diagram.

### 10.2 Overview

- **BR-10.2** A small picture of the whole diagram sits at the bottom right of the canvas. A box
  in it marks the part currently on screen.
- **BR-10.3** Dragging that box, or clicking elsewhere in the overview, moves the view there.

### 10.3 Search

- **BR-10.3a** The search box is disabled while the diagram has no nodes, and says "No nodes to
  search".
- **BR-10.4** The search box finds nodes whose name contains the typed text, ignoring upper and
  lower case.
- **BR-10.5** The number of matching nodes is shown next to the box; "No nodes found" when there
  is none.
- **BR-10.6** **<** and **>** (or Shift+Enter and Enter) step through the matches. The match in
  focus gets a thick gold outline, is brought to the middle of the view and zoomed to a readable
  size. The counter shows the position, for example "2 of 7".
- **BR-10.7** Clicking any other node removes the focus from the search match.
- **BR-10.8** Clearing the search box removes the outline and the count.
- **BR-10.9** Searching is display only and is never an undo step.
- **BR-10.10** Reset diagram, opening other data and New diagram empty the search box and remove
  the count and the outline.

## 11. Undo and redo

- **BR-11.1** Every change to the diagram is one undo step: editing, colouring, commenting,
  styling, adding, moving and deleting nodes, drawing and removing relationships, changing the
  layout or line type, auto arrange, name and description.
- **BR-11.2** **Undo** and **Redo** (left navigation, or Ctrl/Cmd+Z and Ctrl/Cmd+Y) step one
  change back or forward. Each is disabled when there is nothing to undo or redo.
- **BR-11.3** The history is unlimited: the user can undo all the way back to the state in which
  the diagram was opened, and redo all the way forward again.
- **BR-11.4** After undoing everything, the diagram must be **exactly** as it was opened. The
  application checks this and reports it in the History panel ("Initial state: matches the startup
  snapshot"). The same check is made after redoing everything.
- **BR-11.4a** That check compares everything down to the last digit, including where every node
  stands. A node is put back to exactly the place it had, not to one that merely looks the same.
- **BR-11.5** Things that only change what is shown are not undo steps: selection, highlight,
  search, zoom, scrolling, the loading animation.
- **BR-11.5a** Undoing the first action after a diagram was opened must leave the diagram fully
  usable. (The loading animation switches the diagram off and on; that switch is not part of any
  undo step.)
- **BR-11.6** Making a new change after an undo discards the steps that were undone, as in any
  editor.
- **BR-11.7** Opening other data, Reset diagram and New diagram start with an empty history.

## 12. Export and print

The **Actions** menu in the header offers Save, Save As, Export PNG and Print. It is disabled
while the diagram has no nodes (BR-4.15).

- **BR-12.1** **Export PNG** downloads a picture of the **whole** diagram, not only the visible
  part.
- **BR-12.2** The picture is sharp: it is drawn at twice the diagram's size so that small text
  remains readable.
- **BR-12.3** The picture shows the diagram as it is, without selection outlines or dimming.
- **BR-12.3a** The downloaded file is named after the diagram, with the ending `.png`. Characters
  that a file name cannot contain (such as `/ \ : * ? " < > |`) and other special characters are
  replaced by a dash, so that the download always works. Letters of any alphabet, digits, spaces
  and `. _ - ( )` are kept. If nothing usable is left, the file is called `diagram.png`.
- **BR-12.4** **Print** opens the browser's print dialog with a picture of the whole diagram.
- **BR-12.5** **Save** and **Save As** are listed but disabled.

## 13. Confirmations and buttons

- **BR-13.1** Actions that destroy data ask for confirmation first: deleting nodes, and resetting
  all styles.
- **BR-13.2** Confirming buttons (Save, Apply, Reset) are **green**.
- **BR-13.3** The **Delete** button in the delete confirmation is **dark red**.
- **BR-13.4** A button is disabled whenever its action cannot be carried out (for example Save
  without text, Apply without a choice, Undo without history).
- **BR-13.5** If an action fails because of an unexpected error, the user must be able to carry
  on without reloading the page. The changes the failed action had made so far are taken back, a
  notice above the diagram says that the action could not be completed and was undone, and all
  further actions, undo, redo and Reset diagram keep working.
- **BR-13.6** If data cannot be opened because of an unexpected error, the page must not stay
  locked. An empty diagram is opened instead, in the default layout and line type, a notice above
  the canvas says that the diagram could not be opened, and the user can open other data at once.

## 14. Performance measurement

This part serves the evaluation of the technology rather than the end user. Together it is
called the **developer tools**.

- **BR-14.0** The developer tools are hidden when the application is first opened: the timing
  table below the canvas, and the History and Edits panels of the side panel. The page then shows
  the editor only.
- **BR-14.0a** A switch at the right end of the header (icon `</>`) shows and hides them. It is
  marked while they are shown, and the browser remembers the choice for the next visit.
- **BR-14.0b** Operations are timed and recorded while the developer tools are hidden; showing
  them lists everything done so far.
- **BR-14.0c** Undo, Redo and every editing function work the same whether the developer tools
  are shown or not.

- **BR-14.1** The side panel can change one node or all nodes at random, and repeat "change all"
  a chosen number of times to build a long history quickly.
- **BR-14.1a** **Randomize all** also switches the diagram to another layout, picked at random,
  as part of the same undo step, so that one undo has to put back every field, every place and
  every line. On a diagram of 500 funds or more it picks among the layouts that are quick there
  (Top to bottom, Bottom to top, Grid).
- **BR-14.1b** Each run of the repeated edit also moves every node a little, with its lines, but
  never further than 15 units from where the node stood, however many runs there are. It does not
  change the layout.
- **BR-14.1c** Randomize 1 node changes the four fields of one node and moves nothing.
- **BR-14.2** The number of repeats must be a whole number from 1 up to the number of nodes (less
  on very large diagrams, to keep the run within seconds). Invalid entries are corrected; they
  must never freeze the screen.
- **BR-14.3** Every operation is listed in the timing table with the number of undo steps and
  changes it covered and the time it took, in total and per step, and the time until the result
  was on screen.
- **BR-14.4** The History panel shows the number of nodes and relationships, the length of the
  history and the current position in it.
- **BR-14.5** The timing table sits under the heading **Benchmark statistics**, which shows the
  number of recorded operations. Clicking the heading closes the table, so that the canvas gets
  its room and the left navigation no longer reaches over the table; clicking it again opens it.
- **BR-14.6** Operations are recorded while the table is closed. The browser remembers whether
  the table was left open or closed.
- **BR-14.7** The left navigation always stays inside the canvas. Where the canvas is too low
  for one column of icons, they continue in a second column; they never cover the statistics.
- **BR-14.8** The number of changes of an operation can be clicked. A dialog then lists what
  changed: the fund or relationship, the property, and the value before and after. Changes to
  the data (what the action did) are told apart from changes to the drawing (what the screen
  adjusted as a result). A summary counts the changes per property; of a large operation the
  first 200 are listed one by one.
- **BR-14.9** Values in that dialog are shown in full, including the complete data of an added
  or removed fund or relationship.

## 15. Not available yet

| Item                             | Status                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| Save, Save As                    | Listed in the Actions menu, disabled. Diagrams are not stored anywhere |
| Up and down arrows on a node     | Shown, without an action. The intended behaviour is to be defined      |
| Add Batch target page            | A placeholder page that shows the fund's id                            |
| Undo all / Redo all in one click | Not offered on screen; the user steps with Undo and Redo               |
| Real fund data                   | The diagrams are a fixed sample and generated test data                |
