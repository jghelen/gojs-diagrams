# Test cases: Undo

Everything that has to hold for **Undo** in the fund-structure editor, as cases a person can run by
hand. This file is about undo only. Redo appears where it is the way to check that an undo was
complete (section 9).

- [How to read this file](#how-to-read-this-file)
- [1. When Undo is available](#1-when-undo-is-available)
- [2. Undo of changes to nodes](#2-undo-of-changes-to-nodes)
- [3. Undo of added, deleted and moved nodes](#3-undo-of-added-deleted-and-moved-nodes)
- [4. Undo of changes to relationships](#4-undo-of-changes-to-relationships)
- [5. Undo of changes to the diagram as a whole](#5-undo-of-changes-to-the-diagram-as-a-whole)
- [6. One action, one step](#6-one-action-one-step)
- [7. Undo all the way back](#7-undo-all-the-way-back)
- [8. What is not an undo step](#8-what-is-not-an-undo-step)
- [9. Undo and redo together](#9-undo-and-redo-together)
- [10. The page follows an undo](#10-the-page-follows-an-undo)
- [11. Opening data, reset and new diagram](#11-opening-data-reset-and-new-diagram)
- [12. Undo after something went wrong](#12-undo-after-something-went-wrong)
- [13. Large diagrams](#13-large-diagrams)
- [Known limits](#known-limits)

## How to read this file

**Starting point of every case**, unless the case says otherwise:

1. Open the app and press **Reset diagram** (the reload icon in the top bar) with **30 generated
   funds** chosen.
2. Switch the **developer tools** on (the `</>` icon at the right end of the top bar). They show
   what several cases check:
   - the **state line** at the top of the History panel, for example "Initial state: matches the
     startup snapshot";
   - the numbers **Transactions in history** and **History index** below it;
   - the **benchmark statistics** below the canvas, one row per operation.

**Undo** is the curved arrow pointing left in the tool strip at the left edge of the canvas.
Ctrl+Z (Cmd+Z on a Mac) does the same.

**"Back to the start"** in an expected result means all of: the state line reads "Initial state:
matches the startup snapshot" on green, History index is −1, and the Undo button is disabled.

The column **Automated** names the unit test that checks the same thing, by file. "Manual only"
means no automated test covers it. Files are under `src/app/`:

| Short name | File                                                     |
| ---------- | -------------------------------------------------------- |
| history    | `diagram/history.service.spec.ts`                        |
| undo       | `diagram/undo-history.spec.ts`                           |
| factory    | `diagram/diagram-factory.spec.ts`                        |
| actions    | `diagram-page/diagram-actions.spec.ts`                   |
| page       | `diagram-page/diagram-page.spec.ts`                      |
| runner     | `diagram-page/operation-runner/operation-runner.spec.ts` |

## 1. When Undo is available

| ID      | Case                                   | Steps                                                                           | Expected result                                                                                                                          | Automated        |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| UNDO-01 | Nothing to undo in a fresh diagram     | Look at the tool strip and the History panel.                                   | Undo is disabled. Transactions in history is 0, History index is −1. The state line reads "Initial state: matches the startup snapshot". | page, history    |
| UNDO-02 | Undo becomes available after a change  | Click a node. In the side panel, change its **Title** and press Enter.          | Undo is enabled. Transactions in history is 1, History index is 0.                                                                       | page             |
| UNDO-03 | Undo is disabled again at the start    | After UNDO-02, press **Undo**.                                                  | The old title is back. Undo is disabled. Back to the start.                                                                              | page, history    |
| UNDO-04 | Undo at the start does nothing         | In a fresh diagram press Ctrl/Cmd+Z several times.                              | Nothing changes, no error, no row is added to the statistics.                                                                            | history, actions |
| UNDO-05 | Undo is disabled while a diagram loads | Choose **200 generated funds** and watch the tool strip while the nodes appear. | Undo, like every other control, is disabled until all nodes are shown.                                                                   | page             |
| UNDO-06 | Undo by keyboard                       | Change a node's colour. Click on empty canvas. Press Ctrl+Z (Cmd+Z on a Mac).   | The colour is back, exactly as with the button. The statistics get a row "Undo".                                                         | history, page    |
| UNDO-07 | Undo is listed in the statistics       | Change a node's colour, press **Undo**.                                         | A row "Undo" with 1 transaction, the number of changes it took back, and its timings.                                                    | actions, page    |

## 2. Undo of changes to nodes

In each case: do the change, check that it took effect, press **Undo** once.

| ID      | Case                            | Steps                                                                                                                  | Expected result                                                                                             | Automated     |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-10 | Title                           | Click a node, change **Title** in the side panel, press Enter. Undo.                                                   | The node shows its old name. Back to the start.                                                             | undo, page    |
| UNDO-11 | Legal entity type               | Click a node, change **Legal entity type** in the side panel. Undo.                                                    | The old value is back in the side panel (and on the node, if the field is shown, see UNDO-17).              | undo          |
| UNDO-12 | Colour from the side panel      | Click a node, click a colour swatch in the side panel. Undo.                                                           | The node has its old colour.                                                                                | undo, page    |
| UNDO-13 | Colour from the node's own icon | Click the rainbow circle on a node, pick a colour in the dialog. Undo.                                                 | The node has its old colour.                                                                                | page          |
| UNDO-14 | Shape                           | Click a node, open **Shape** in the tool strip, pick Diamond. Undo.                                                    | The node is a rectangle again, with its lines meeting its outline. The Shape tool shows the rectangle.      | page          |
| UNDO-15 | Comment added                   | Click the speech bubble on a node, type a comment, **Save**. Undo.                                                     | The comment is gone, and so is the red dot on the bubble.                                                   | undo, page    |
| UNDO-16 | Comment deleted                 | Give a node a comment. Open it again, **Delete comment**. Undo.                                                        | The comment and the red dot are back.                                                                       | page          |
| UNDO-17 | Legal entity field shown        | **Styles** → choose "Legal entity type" → **Apply** (nothing else ticked). Undo.                                       | Every node shows its name only again; the line with the legal entity type is gone.                          | page, actions |
| UNDO-18 | Styles by legal entity type     | **Styles** → choose the field → tick two values → pick a colour and a shape → **Apply**. Undo.                         | All nodes of those values have their old colour and shape, and the field is hidden again, in this one step. | page, actions |
| UNDO-19 | Reset all styles                | Apply a style (UNDO-18). **Styles** → **Reset all to gray square** → **Reset**. Undo.                                  | The styled nodes have their colour and shape back, and the field is shown again.                            | page, actions |
| UNDO-20 | Several nodes at once           | Click three nodes one after another (each click adds to the selection). Change **Title** in the side panel. Undo once. | All three have their old names after this single Undo.                                                      | page, actions |
| UNDO-21 | Shape of a highlighted tree     | Click one node, so that its tree is highlighted. **Shape** → Ellipse. Undo once.                                       | Every node of the tree is a rectangle again after one Undo.                                                 | page          |
| UNDO-22 | Randomize 1 node                | **Randomize 1 node** in the Edits panel. Undo.                                                                         | The node has its old title, legal entity type, shape and colour. Back to the start.                         | undo, page    |

## 3. Undo of added, deleted and moved nodes

| ID      | Case                                       | Steps                                                                      | Expected result                                                                                                                   | Automated     |
| ------- | ------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-30 | Added node                                 | **Add node** (the plus in the tool strip). Undo.                           | The new node is gone. The header reads **LE: 30** again. Back to the start.                                                       | undo, page    |
| UNDO-31 | Deleted node                               | Click the × at the top right of a node, **Delete**. Undo.                  | The node is back in the same place with the same name, colour, shape and comment.                                                 | undo, page    |
| UNDO-32 | Deleted node gets its relationships back   | Delete a node that has several lines (for instance key 5). Undo.           | Every line that was removed with the node is back, with its percentage and its info icon. The number of **Links** is what it was. | undo, page    |
| UNDO-33 | Several deleted nodes                      | Select three nodes, press the Delete key, confirm. Undo once.              | All three nodes and all their lines are back after this single Undo.                                                              | page, actions |
| UNDO-34 | Nodes deleted together with selected lines | Select two nodes and one line elsewhere, press Delete, confirm. Undo once. | The two nodes, their lines and the separately selected line are all back.                                                         | page, actions |
| UNDO-35 | Moved node                                 | Drag a node somewhere else. Undo.                                          | The node is back in exactly its old place, and its lines run as before. Back to the start.                                        | history, page |
| UNDO-36 | Moved nodes, several drags                 | Drag node A, then node B, then node A again. Undo three times.             | Each Undo takes back one drag, the last first. Back to the start after the third.                                                 | history       |
| UNDO-37 | Add, then delete the same node             | **Add node**. Delete that node. Undo twice.                                | First Undo: the node is back. Second Undo: it is gone again and LE is 30. Back to the start.                                      | page          |

## 4. Undo of changes to relationships

| ID      | Case                                | Steps                                                                                                   | Expected result                                                                                                        | Automated     |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-40 | Removed with the Delete key         | Click a line, press Delete. Undo.                                                                       | The line is back with its percentage and info icon.                                                                    | undo, page    |
| UNDO-41 | Removed from the side panel         | Click two lines, **Remove 2 selected** in the side panel. Undo once.                                    | Both lines are back after this single Undo.                                                                            | page, actions |
| UNDO-42 | Removed from the relationship card  | Click the "i" on a line, **Remove relationship** on the card. Undo.                                     | The line is back. The card stays closed.                                                                               | page          |
| UNDO-43 | All relationships of selected nodes | Click a node, **Remove their N relationships** in the side panel. Undo once.                            | All N lines are back.                                                                                                  | page, actions |
| UNDO-44 | Hand-drawn relationship             | Drag from the edge of a node to another node that it is not yet joined to; a dotted line appears. Undo. | The dotted line is gone. Back to the start.                                                                            | undo, page    |
| UNDO-45 | Expand all                          | **Expand all** in the tool strip. Undo.                                                                 | The cards are gone, the "i" icons are back, and every node is back in its old, closer place. Collapse all is disabled. | page, factory |
| UNDO-46 | Collapse all                        | **Expand all**, then **Collapse all**. Undo once.                                                       | The cards are shown again with the nodes further apart.                                                                | page, factory |

## 5. Undo of changes to the diagram as a whole

| ID      | Case                      | Steps                                                                | Expected result                                                                                                                                              | Automated     |
| ------- | ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| UNDO-50 | Layout                    | **Layout** → Grid. Undo.                                             | Every node is back in its place of the Top to bottom layout. The Layout tool shows Top to bottom again. The view shows the whole diagram. Back to the start. | undo, page    |
| UNDO-51 | Every layout in turn      | Switch to each of the six layouts one after another. Undo six times. | Each Undo brings back the layout before. Back to the start after the sixth.                                                                                  | undo          |
| UNDO-52 | Circle and Force-directed | **Layout** → Circle. Undo. **Layout** → Force-directed. Undo.        | Back to the start both times: these layouts place nodes at uneven positions, which must come back exactly.                                                   | undo          |
| UNDO-53 | Auto arrange              | Drag two nodes away. **Auto arrange**. Undo once.                    | The two nodes are back where they were dragged to (not at the start: the drags are older steps).                                                             | page, actions |
| UNDO-54 | Line type                 | **Lines** → Straight. Undo.                                          | The lines are right-angled and go around the nodes again. The Lines tool shows "Orthogonal, rounded".                                                        | undo, page    |
| UNDO-55 | Name                      | Type a new name in the name box above the canvas, press Enter. Undo. | The name box shows the old name.                                                                                                                             | page, actions |
| UNDO-56 | Description               | Type a description, press Enter. Undo.                               | The description box is empty again.                                                                                                                          | page          |
| UNDO-57 | Name of a new diagram     | **New diagram**. Type a name, press Enter. Undo.                     | The name box is empty again and marked as required (red, "Diagram name (required)").                                                                         | page          |
| UNDO-58 | Randomize all             | **Randomize all**. Note the layout it switched to. Undo once.        | Every node has its old title, type, shape, colour and place, and the layout is Top to bottom again, all from this single Undo. Back to the start.            | page, actions |
| UNDO-59 | Bulk edit                 | Enter 5 in the box and press **× randomize all**. Undo five times.   | Each Undo takes back one run: the fields of every node and the small move of every node. Back to the start after the fifth.                                  | page, actions |

## 6. One action, one step

| ID      | Case                                      | Steps                                                                                              | Expected result                                                                                           | Automated        |
| ------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| UNDO-60 | Each action adds exactly one step         | Do five different actions (title, colour, add node, layout, name). Watch Transactions in history.  | It counts 1, 2, 3, 4, 5. Five presses of Undo lead back to the start, taking the actions back last first. | history, undo    |
| UNDO-61 | An action that changes nothing adds none  | Click a node and pick the colour it already has. Switch to the layout that is already in use.      | Transactions in history does not change. Undo does not become enabled in a fresh diagram.                 | page, actions    |
| UNDO-62 | The same value typed again                | Click a node, retype its title exactly as it is, press Enter.                                      | No step is added.                                                                                         | page             |
| UNDO-63 | A dialog that is cancelled                | Open the colour dialog, the comment dialog and the delete confirmation of a node, **Cancel** each. | No step is added.                                                                                         | page             |
| UNDO-64 | The styles dialog before Apply            | **Styles** → choose the field, tick values, pick colour and shape, then **Close**.                 | Nothing in the diagram changed, no step is added.                                                         | page             |
| UNDO-65 | A relationship that cannot be drawn       | Drag from the edge of a node to a node it is already joined to.                                    | No line appears and no step is added.                                                                     | factory          |
| UNDO-66 | Undo takes back steps, not single changes | **Randomize all** (hundreds of changes in the statistics). Undo once.                              | One Undo takes all of them back. The "Undo" row shows 1 transaction and the same number of changes.       | history, actions |

## 7. Undo all the way back

| ID      | Case                        | Steps                                                                                                                                    | Expected result                                                                                                                   | Automated     |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-70 | A long mixed session        | Do at least fifteen actions of every kind in sections 2 to 5, in any order. Press Undo until it is disabled.                             | Back to the start. The diagram looks exactly as after Reset diagram.                                                              | undo, page    |
| UNDO-71 | The state line on the way   | During UNDO-70, look at the state line after each Undo.                                                                                  | It reads "Transaction N of M", N going down by one each time, and "Initial state: matches the startup snapshot" at the end.       | history       |
| UNDO-72 | More than 999 steps         | Choose **Sample fund structure**. Enter 24 and press **× randomize all**, 42 times (1008 steps). Hold Ctrl/Cmd+Z until Undo is disabled. | Transactions in history reaches 1008 (GoJS alone would keep 999). Undo goes all the way: back to the start.                       | history, undo |
| UNDO-73 | Never "differs"             | In every case of this file that ends at the start, read the state line.                                                                  | It is green. A red "Initial state: differs from the startup snapshot" is a failure of that case, whatever the diagram looks like. | history       |
| UNDO-74 | Positions come back exactly | **Layout** → Circle, drag three nodes, **Layout** → Force-directed, **Randomize all**. Undo until disabled.                              | Back to the start: the check compares every node's place to the last digit.                                                       | undo          |

## 8. What is not an undo step

None of these may add a step, enable Undo in a fresh diagram, or be taken back by Undo.

| ID      | Case                           | Steps                                                                                        | Expected result                                                                                           | Automated     |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-80 | Selecting                      | Click nodes and lines, select all with Ctrl/Cmd+A, clear the selection.                      | Transactions in history stays 0. Undo stays disabled.                                                     | page          |
| UNDO-81 | Tree highlight                 | Click one node (its tree is highlighted, the rest dimmed), then click empty canvas.          | No step.                                                                                                  | page, factory |
| UNDO-82 | Hovering over a line           | Move the mouse over several lines (they turn gold). Then change a node's colour and undo it. | Hovering added no step. The Undo takes back the colour only; no line stays gold or thick.                 | factory       |
| UNDO-83 | Searching                      | Type in the search box, step through the results with < and >, clear the box.                | No step.                                                                                                  | page          |
| UNDO-84 | Zooming and scrolling          | Zoom in, zoom out, zoom to fit, scroll, drag the box in the overview.                        | No step.                                                                                                  | page          |
| UNDO-85 | Relationship card              | Click the "i" of a line to open its card, close it with ×.                                   | No step.                                                                                                  | page          |
| UNDO-86 | The loading animation          | Choose other data and wait until all nodes are shown.                                        | Transactions in history is 0. The first Undo after the first action leaves the diagram usable (UNDO-112). | page, factory |
| UNDO-87 | Developer tools and statistics | Switch the developer tools off and on. Close and open the benchmark statistics.              | No step.                                                                                                  | page          |
| UNDO-88 | Export and print               | **Actions** → Export PNG. **Actions** → Print (cancel the print dialog).                     | No step.                                                                                                  | page          |
| UNDO-89 | Opening the side panel         | Click a node so that the side panel appears, click empty canvas so that it goes.             | No step.                                                                                                  | page          |

## 9. Undo and redo together

| ID      | Case                                 | Steps                                                              | Expected result                                                                                                             | Automated     |
| ------- | ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-90 | Undo, then Redo                      | Change a node's title. Undo. Redo.                                 | The new title is back. The state line reads "Latest state: matches the snapshot taken before undo" on green.                | history, page |
| UNDO-91 | Undo everything, redo everything     | Do six actions of different kinds. Undo six times. Redo six times. | After the undos: back to the start. After the redos: "Latest state: matches the snapshot taken before undo".                | page, actions |
| UNDO-92 | Undone steps stay until a new change | Do three actions. Undo twice.                                      | Transactions in history is still 3, History index is 0. Redo is enabled.                                                    | history       |
| UNDO-93 | A new change drops what was undone   | Do three actions. Undo twice. Do one new action.                   | Transactions in history is 2. Redo is disabled: the two undone steps are gone for good. Undo twice leads back to the start. | history, undo |
| UNDO-94 | Undo and redo of a layout            | **Randomize all**. Undo. Redo. Repeat Undo and Redo five times.    | The state line is green every time, alternating between the two sentences. No node ends up in another place.                | undo, actions |
| UNDO-95 | Many undos asked for at once         | Do four actions. Press Ctrl/Cmd+Z four times as fast as possible.  | All four are taken back, in order, none lost. Back to the start.                                                            | page, runner  |

## 10. The page follows an undo

| ID       | Case                                   | Steps                                                                                                    | Expected result                                                                                                      | Automated     |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-100 | Tool strip: layout and lines           | Change the layout and the line type. Undo twice.                                                         | The Layout and Lines tools show the icon and hover text of what is in use after each Undo.                           | page          |
| UNDO-101 | Name and description boxes             | Change name and description. Undo twice.                                                                 | Both boxes show the old texts.                                                                                       | page          |
| UNDO-102 | Number of legal entities               | **Add node** twice. Delete one node. Undo three times.                                                   | The header reads LE: 31, 32, 31 and then 32, 31, 30 again as the steps are taken back.                               | page          |
| UNDO-103 | Side panel of the selected node        | Click a node, change its title. Undo while it is still selected.                                         | The Title box in the side panel shows the old title.                                                                 | page          |
| UNDO-104 | Selection after a deleted node is back | Delete a node. Undo. Click the node.                                                                     | It can be selected, moved and edited like any other.                                                                 | undo          |
| UNDO-105 | Styles and Actions                     | **New diagram**. **Add node**. Undo.                                                                     | With the node: Styles and Actions are enabled. After the Undo, in the empty diagram: both are disabled again.        | page          |
| UNDO-106 | Expand all and Collapse all            | Choose **Sample fund structure**. Press Ctrl/Cmd+A, then **Remove 26 selected** in the side panel. Undo. | Without relationships both tools are disabled. After the Undo all 26 lines are back and Expand all is enabled again. | page          |
| UNDO-107 | An open relationship card              | Change a colour. Open the card of a line. Undo.                                                          | The card closes.                                                                                                     | page          |
| UNDO-108 | A tree highlight                       | Change a colour. Click one node so that its tree is highlighted. Undo.                                   | The highlight ends: nothing is dimmed.                                                                               | page          |
| UNDO-109 | A search result                        | Rename a node to "Zebra". Search for "Zebra" (1 found). Undo.                                            | The count reads "No nodes found" for "Zebra".                                                                        | page          |
| UNDO-110 | The styles dialog after an undo        | Apply a colour and a shape to one value in **Styles**. Undo. Open **Styles** again and choose the field. | The row of that value shows the old colour and shape, and the count of its nodes is unchanged.                       | page          |
| UNDO-111 | Lines after an undone move             | Drag a node across the diagram. Undo.                                                                    | Its lines run to it again, attach to the middle of its top or bottom side, and cross no node.                        | factory       |
| UNDO-112 | The first action after loading         | Reset diagram. Do one action. Undo.                                                                      | The diagram stays usable: nodes can be clicked, dragged and edited, and the overview works.                          | page, factory |
| UNDO-113 | Closing the tab                        | Do one action and try to close the tab (the browser asks). Stay. Undo. Try to close the tab again.       | After the Undo the browser lets the tab go without asking.                                                           | page          |

## 11. Opening data, reset and new diagram

| ID       | Case                           | Steps                                                                               | Expected result                                                                                               | Automated     |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| UNDO-120 | Reset clears the history       | Do three actions. **Reset diagram**.                                                | Undo is disabled, Transactions in history is 0, the statistics are empty. The three actions cannot be undone. | page, history |
| UNDO-121 | Other data clears the history  | Do three actions. Choose **100 generated funds**.                                   | Undo is disabled. Ctrl/Cmd+Z does not bring anything of the old diagram back.                                 | page, history |
| UNDO-122 | New diagram clears the history | Do three actions. **New diagram**.                                                  | Undo is disabled in the empty diagram.                                                                        | page          |
| UNDO-123 | A diagram built from scratch   | **New diagram**. **Add node** twice. Draw a line between the two. Undo three times. | The line, then the second node, then the first node go. The diagram is empty and back to its start.           | page          |
| UNDO-124 | Opening is not a step          | Choose other data and look at the History panel once it is shown.                   | Transactions in history is 0, although loading arranged every node. Undo is disabled.                         | page, undo    |
| UNDO-125 | A cleaned name is not a step   | Open a diagram whose stored name has special characters (when a database exists).   | The name is shown cleaned, with a note below. Undo is disabled: the cleaning cannot be undone.                | page          |

## 12. Undo after something went wrong

These cannot be brought about by hand in a normal session; they are checked by the automated tests
and listed here so that the picture is complete.

| ID       | Case                               | What happens                                                     | Expected result                                                                                                        | Automated             |
| -------- | ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- |
| UNDO-130 | An action fails halfway            | An error interrupts an action after it changed part of the data. | What it had changed is taken back, no step is added, a notice says the action was undone. The state line is unchanged. | history, runner, page |
| UNDO-131 | Undo still works afterwards        | After UNDO-130 another action is done, then Undo and Redo.       | All three work. Undo leads back to the start, Redo to the latest state.                                                | page                  |
| UNDO-132 | An error outside any action        | An error leaves a change half made, with no action running.      | The half-made change is taken back and the notice shown. Undo and Redo work.                                           | history, page         |
| UNDO-133 | A drag in progress is left alone   | An unrelated error is reported while a node is being dragged.    | The drag goes on and becomes one undo step when the node is dropped.                                                   | history, page         |
| UNDO-134 | A diagram that could not be opened | Opening data fails.                                              | An empty diagram is opened with a notice. Its history is empty; Undo is disabled.                                      | page                  |

## 13. Large diagrams

| ID       | Case                              | Steps                                                                                         | Expected result                                                                                                               | Automated   |
| -------- | --------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| UNDO-140 | Undo on 2000 funds                | Choose **2000 generated funds**. **Randomize all**. Undo.                                     | Back to the start. The "Undo" row shows the time it took; the page responds again within a few seconds.                       | Manual only |
| UNDO-141 | Undo of a layout on 1000 funds    | Choose **1000 generated funds**. **Layout** → Grid. Undo.                                     | Back to the start, with the lines around the nodes again. No notice, no frozen page.                                          | Manual only |
| UNDO-142 | Undo of a line type on 1000 funds | Choose **1000 generated funds**. **Lines** → Straight, then → Orthogonal, square. Undo twice. | Back to the start. After each Undo the lines are as that line type draws them; with the orthogonal types none crosses a node. | page        |
| UNDO-143 | A long history on a big diagram   | Choose **200 generated funds**. Enter 50, press **× randomize all**. Hold Ctrl/Cmd+Z.         | Every step is taken back in turn. Back to the start. The page never stays unresponsive for longer than a single step takes.   | Manual only |
| UNDO-144 | Memory                            | During UNDO-143, watch **JS heap** in the History panel (Chrome).                             | It grows with the history and does not jump at an Undo. This is for information; there is no limit to pass.                   | Manual only |

## Known limits

Not failures when seen while running these cases:

- **Undo all and Redo all have no button.** The steps are taken one at a time, or by holding
  Ctrl/Cmd+Z.
- **Places of neighbouring lines after an undone move.** The lines of the moved node find their
  places on its side again; the lines of the nodes it is joined to keep theirs until they are next
  routed, so two of them may briefly share a place on a side.
- **Percentages** are placed anew after an undo. They are never part of a step, and may stand in
  another free place beside the same line than before.
- **Hand-placed positions and Expand all.** Expand all arranges the nodes anew. Its Undo brings the
  hand-placed positions back.
