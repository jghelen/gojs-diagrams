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
- [8. Styling by fund type](#8-styling-by-fund-type)
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

| Term                | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| Diagram             | One fund structure: its funds, their relationships, a name and a description           |
| Node                | One fund, drawn as a shape with the fund's name and fund type                          |
| Fund type           | The kind of fund, shown as the node's subtitle (for example "Feeder fund")             |
| Relationship        | A line with an arrow from one fund to another                                          |
| Hierarchy           | The relationship from a fund to the fund directly below it; together these form a tree |
| Manual relationship | A relationship the user drew by hand in the diagram                                    |
| Ownership           | The percentage of the target fund that the source fund owns                            |
| Tree of a node      | The chain from the node up to the top fund, plus every fund below the node             |
| Undo step           | One user action that can be taken back with a single Undo                              |

## 3. Screen overview

| Area                          | Content                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Header, left                  | **Data** dropdown: which diagram to open                                                          |
| Header, right                 | **Styles**, **Actions** menu, **Reset diagram** (reload icon), **New diagram**                    |
| Bar above the canvas          | Diagram **name**, **description**, and **search**                                                 |
| Left navigation on the canvas | Add node, Undo, Redo, Zoom in, Zoom out, Zoom to fit, Layout, Lines, Auto arrange (in that order) |
| Canvas                        | The diagram                                                                                       |
| Overview, bottom right        | A small picture of the whole diagram for moving around                                            |
| Below the canvas              | Timing table (see [14](#14-performance-measurement))                                              |
| Side panel, right             | History, bulk edits, selected relationships, selected nodes                                       |

Every icon without a text label shows its name when the user hovers over it.

## 4. Diagrams

### 4.1 Opening a diagram

- **BR-4.1** The application opens with the diagram of 30 generated funds.
- **BR-4.2** The **Data** dropdown offers: a sample fund structure (24 funds: one umbrella fund,
  three fund families, their sub-funds and feeder funds), generated diagrams of 30, 100, 200, 500,
  1000 and 2000 funds, and an empty diagram.
- **BR-4.3** Every fund in a newly opened diagram is a very light gray square with a dark gray
  border.
- **BR-4.4** A diagram opens laid out top to bottom, with lines that go around the nodes. A
  diagram of 500 funds or more opens with straight lines instead, so that it opens quickly.

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
- **BR-4.10** An opened diagram is named after its data; a new diagram is named "Untitled
  diagram". The description starts empty.
- **BR-4.11** Changing the name or the description is one undo step each.

### 4.4 Reset and new diagram

- **BR-4.12** **Reset diagram** reloads the chosen data as it was at the start. All changes and
  the undo history are discarded. The chosen layout and line type are kept.
- **BR-4.13** **New diagram** opens an empty canvas so a structure can be built from scratch with
  Add node and hand-drawn relationships.
- **BR-4.14** While the diagram is empty, the actions that need content (the three zooms, Layout,
  Lines, Auto arrange) are disabled. Add node stays available.

## 5. Nodes (funds)

### 5.1 What a node shows

- **BR-5.1** A node shows the fund's **name** (title) and, below it, its **fund type** (subtitle).
- **BR-5.2** All nodes have the same size, whatever their shape.
- **BR-5.3** A name or fund type that does not fit is cut off with "…". Hovering over it shows the
  full text. Text never runs outside the node.
- **BR-5.4** Text is dark on a light fill and light on a dark fill, so it stays readable in every
  colour.

### 5.2 Controls on a node

| Control            | Position                    | Hover text                                 | What happens                                                      |
| ------------------ | --------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Rainbow circle     | Below the text              | Change color                               | Opens the colour chooser for this node                            |
| Speech bubble      | Below the text              | Add comment                                | Opens the comment dialog for this node                            |
| Plus in a box      | Below the text              | Add Batch                                  | Opens the "new batch" page for this node in a **new browser tab** |
| Gray x             | Top right, inside the shape | Delete node                                | Asks for confirmation, then deletes the node                      |
| Up and down arrows | Left, one above the other   | none                                       | No action yet                                                     |
| White dot          | Right                       | Drag to another node to add a relationship | Starting point for drawing a relationship                         |

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

- **BR-5.18** With one or more nodes selected, the side panel edits title, subtitle, shape and
  colour. The change applies to all selected nodes at once and is one undo step.
- **BR-5.19** Where the selected nodes differ on a field, the panel shows "Mixed".
- **BR-5.20** Title and subtitle can also be edited directly on a selected node.

### 5.8 Moving nodes

- **BR-5.21** A node is moved by dragging it.
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

| Kind                | Drawn as             | Info icon | Where it comes from |
| ------------------- | -------------------- | --------- | ------------------- |
| Hierarchy           | Solid black, thicker | Yes       | The loaded data     |
| Other relationship  | Solid black, thin    | Yes       | The loaded data     |
| Manual relationship | **Dotted** black     | No        | Drawn by the user   |

- **BR-6.1** All lines are black and end in an arrowhead at the target fund.
- **BR-6.2** A line starts and ends exactly on the outline of the shape, for every shape. There is
  no gap between line and node.
- **BR-6.3** On a diagram of fewer than 500 funds, with the default line types, lines go around nodes
  and do not run across them. On bigger diagrams lines may cross nodes (see BR-9.6).

### 6.2 Ownership

- **BR-6.4** A relationship may carry an ownership percentage: how much of the fund the arrow
  points at is owned by the fund the line comes from.
- **BR-6.5** It is shown in **dark green**, with **two decimals** (for example `62.50%`), at the
  arrow end of the line.
- **BR-6.6** The percentage is placed beside the line and clear of the node, so the whole figure
  can always be read.
- **BR-6.7** Where no ownership is known, nothing is shown.

### 6.3 Relationship details

- **BR-6.8** Every relationship from the data has a small "i" icon in the middle of the line. It
  is drawn on top of the line.
- **BR-6.9** Clicking it opens a dialog with the kind of relationship, the two funds it connects,
  and the ownership ("No data" where unknown).
- **BR-6.10** The relationship can be removed from that dialog.

### 6.4 Drawing a relationship

- **BR-6.11** The user draws a relationship by dragging from the white dot on the right of a node
  to another node.
- **BR-6.12** A hand-drawn relationship is dotted, has no info icon and no ownership.
- **BR-6.13** More than one relationship between the same two funds is allowed.
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
  selection rectangle.
- **BR-7.4** Clicking one of the icons on a node performs that icon's action and does not change
  the selection.
- **BR-7.5** When **exactly one** node is selected, its tree is highlighted: every node of the
  tree gets the gold outline, and the rest of the diagram is dimmed.
- **BR-7.6** Nodes joined to the selected node by a manual relationship belong to the highlight
  as well.
- **BR-7.7** The highlight ends when the user clicks empty canvas, selects a second node, or does
  anything else (zoom, auto arrange, undo, an edit).
- **BR-7.8** Highlighting is display only. It is never an undo step.

## 8. Styling by fund type

The **Styles** button (palette icon) opens a dialog that gives all funds of a type the same look.

- **BR-8.1** The dialog lists every fund type present in the diagram with the number of funds of
  that type.
- **BR-8.2** Each row starts with a small picture of that type's shape and colour. The picture
  follows the choices made in the dialog, before they are applied.
- **BR-8.3** One or several fund types can be selected by clicking their rows. A **Select all**
  checkbox selects or unselects all of them. Selected rows are marked in dark green.
- **BR-8.4** Shapes are offered as pictures with their name: Square, Rounded, Ellipse, Diamond,
  Capsule, Rounded top. Colours are offered as swatches.
- **BR-8.5** A **preview** shows a complete node as it will look, including its icons, arrows,
  line and x.
- **BR-8.6** **Nothing in the diagram changes until Apply is pressed.** Apply is disabled until at
  least one fund type and at least a colour or a shape are chosen.
- **BR-8.7** Apply changes every fund of the selected types, closes the dialog, and is one undo
  step.
- **BR-8.8** **Reset all to gray square** asks for confirmation. When confirmed, every node goes
  back to the default light gray square; the dialog then shows the defaults again. This is one
  undo step and can be redone after an undo.

## 9. Layout and lines

### 9.1 Layout

- **BR-9.1** The Layout item of the left navigation opens a column of icons, one per layout, each
  named on hover: **Top to bottom**, **Bottom to top**, **Circle**, Layered digraph,
  Force-directed, Grid.
- **BR-9.2** In every layout, nodes do not overlap.
- **BR-9.3** Switching the layout rearranges the whole diagram and is one undo step.
- **BR-9.4** **Auto arrange** (last item of the left navigation) applies the current layout again.
  It tidies the diagram after nodes were moved or added by hand, and is one undo step.

### 9.2 Line type

- **BR-9.5** The Lines item, below Layout, opens a column of icons, one per line type, each named
  on hover: Orthogonal rounded, Orthogonal square, Straight, Curved.
- **BR-9.6** Straight and curved lines cannot go around nodes; their names say "(crosses
  nodes)". The two orthogonal types route lines around nodes on diagrams of fewer than 500 funds.
- **BR-9.6a** On a diagram of 500 funds or more, the orthogonal types keep their right-angled
  look but are not routed around nodes, because that would block the screen for many seconds or
  minutes. Their names in the Lines column then say "(crosses nodes on a diagram this big)".
  Switching the line type must never freeze the screen, whatever the size of the diagram.
- **BR-9.7** Switching the line type is one undo step.
- **BR-9.8** Only one of the two columns (Layout, Lines) is open at a time.

## 10. Finding your way around

### 10.1 Zoom

- **BR-10.1** **Zoom in** and **Zoom out** change the size step by step. **Zoom to fit** shows the
  whole diagram.

### 10.2 Overview

- **BR-10.2** A small picture of the whole diagram sits at the bottom right of the canvas. A box
  in it marks the part currently on screen.
- **BR-10.3** Dragging that box, or clicking elsewhere in the overview, moves the view there.

### 10.3 Search

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
- **BR-11.5** Things that only change what is shown are not undo steps: selection, highlight,
  search, zoom, scrolling, the loading animation.
- **BR-11.6** Making a new change after an undo discards the steps that were undone, as in any
  editor.
- **BR-11.7** Opening other data, Reset diagram and New diagram start with an empty history.

## 12. Export and print

The **Actions** menu in the header offers Save, Save As, Export PNG and Print.

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

## 14. Performance measurement

This part serves the evaluation of the technology rather than the end user.

- **BR-14.1** The side panel can change one node or all nodes at random, and repeat "change all"
  a chosen number of times to build a long history quickly.
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

## 15. Not available yet

| Item                                 | Status                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Save, Save As                        | Listed in the Actions menu, disabled. Diagrams are not stored anywhere                      |
| Up and down arrows on a node         | Shown, without an action. The intended behaviour is to be defined                           |
| Add Batch target page                | A placeholder page that shows the fund's id                                                 |
| Undo all / Redo all in one click     | Not offered on screen; the user steps with Undo and Redo                                    |
| Lines around nodes from 500 funds up | Not offered: it would block the screen for too long. Orthogonal lines may cross nodes there |
| Real fund data                       | The diagrams are a fixed sample and generated test data                                     |
