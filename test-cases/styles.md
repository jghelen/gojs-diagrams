# Test cases: Styles button

Everything that has to hold for the **Styles** button in the top bar and the dialog it opens,
**Styles by legal entity field**, as cases a person can run by hand.

- [How to read this file](#how-to-read-this-file)
- [1. The Styles button](#1-the-styles-button)
- [2. Opening and closing the dialog](#2-opening-and-closing-the-dialog)
- [3. Choosing the legal entity field](#3-choosing-the-legal-entity-field)
- [4. The list of values](#4-the-list-of-values)
- [5. Ticking values](#5-ticking-values)
- [6. Colour](#6-colour)
- [7. Shape](#7-shape)
- [8. Preview](#8-preview)
- [9. The Apply button](#9-the-apply-button)
- [10. What Apply does to the diagram](#10-what-apply-does-to-the-diagram)
- [11. Reset all to gray square](#11-reset-all-to-gray-square)
- [12. Undo and redo](#12-undo-and-redo)
- [13. Styles and the rest of the app](#13-styles-and-the-rest-of-the-app)
- [Known limits](#known-limits)

## How to read this file

**"Open" a diagram** means: click **All diagrams** in the top bar and click the title of the
diagram in the list. The diagrams named here are the sample diagrams of the database
(`backend/db/setup.sh --with-sample`); the backend has to be running.

**Starting point of every case**, unless the case says otherwise:

1. Open the app, which starts with the list of diagrams, and click **30 generated funds LE 30**
   there. Every node is then a light gray rectangle that shows its name only.
2. Switch the **developer tools** on (the `</>` icon at the right end of the top bar). Some cases
   read the **benchmark statistics** below the canvas and the **History** panel on the right.

**"Open Styles"** means: press the **Styles** button (palette icon) in the top bar.
**"Choose the field"** means: pick **Legal entity type** in the dropdown at the top left of the
dialog. A **value** is one row of the list that then appears, such as "Feeder fund".

The column **Automated** names the unit test that checks the same thing, by file. "Manual only"
means no automated test covers it. Files are under `src/app/`:

| Short name | File                                   |
| ---------- | -------------------------------------- |
| page       | `diagram-page/diagram-page.spec.ts`    |
| styles     | `diagram-page/fund-styles.spec.ts`     |
| actions    | `diagram-page/diagram-actions.spec.ts` |
| tiles      | `diagram/shape-tiles.spec.ts`          |
| factory    | `diagram/diagram-factory.spec.ts`      |

## 1. The Styles button

| ID       | Case                             | Steps                                                                        | Expected result                                                                      | Automated   |
| -------- | -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| STYLE-01 | Where it is                      | Look at the right end of the top bar.                                        | **Styles**, with a palette icon, is the first of the controls there, before Actions. | page        |
| STYLE-02 | Hover text                       | Hold the mouse over the button.                                              | "Set color and shape per legal entity field".                                        | page        |
| STYLE-03 | Disabled on an empty diagram     | Press **New diagram**.                                                       | The button is disabled. Its hover text reads "Styles: add a node first".             | page        |
| STYLE-04 | Enabled with the first node      | After STYLE-03 press **Add node**.                                           | The button is enabled.                                                               | page        |
| STYLE-05 | Disabled again without nodes     | After STYLE-04 press **Undo**. Then **Add node** again and delete it.        | Disabled after the Undo, and disabled again after the node is deleted.               | page        |
| STYLE-06 | Disabled while a diagram loads   | Open **200 generated funds LE 200** and watch the button while nodes appear. | Disabled until all nodes are shown, then enabled.                                    | page        |
| STYLE-07 | Disabled while an operation runs | Enter 30 and press **× randomize all**; watch the button.                    | Disabled while the bulk edit runs, enabled afterwards.                               | Manual only |

## 2. Opening and closing the dialog

| ID       | Case                           | Steps                                                                        | Expected result                                                                                                                            | Automated    |
| -------- | ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| STYLE-10 | Title                          | Open Styles.                                                                 | A dialog titled **Styles by legal entity field**. The page behind it is dimmed and cannot be clicked.                                      | page         |
| STYLE-11 | What it shows at first         | Open Styles in a fresh diagram.                                              | Left: a dropdown reading "Select a field", and no list. Right: a hint, **Color**, **Shape**, **Preview**. Bottom: Reset all, Close, Apply. | page         |
| STYLE-12 | Close                          | Open Styles, choose the field, tick a value, pick a colour. Press **Close**. | The dialog closes. Nothing in the diagram changed. Transactions in history is 0.                                                           | page         |
| STYLE-13 | Escape                         | Open Styles, make choices as in STYLE-12, press the Escape key.              | Same as Close: nothing changed.                                                                                                            | Manual only  |
| STYLE-14 | Choices are forgotten on Close | After STYLE-12 open Styles again.                                            | The dropdown reads "Select a field" again, nothing is ticked, no colour or shape is marked.                                                | styles       |
| STYLE-15 | Opens on the field in use      | Open Styles, choose the field, **Apply**. Open Styles again.                 | The dropdown already reads **Legal entity type** and the values are listed. Nothing is ticked.                                             | page, styles |
| STYLE-16 | Opening is not a change        | Open and close the dialog several times.                                     | Transactions in history stays 0. Undo stays disabled.                                                                                      | page         |

## 3. Choosing the legal entity field

| ID       | Case                                | Steps                                                                 | Expected result                                                                                                                                            | Automated    |
| -------- | ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| STYLE-20 | The dropdown is above Select all    | Open Styles, choose the field.                                        | The dropdown is at the top left, **Select all** right below it, the list of values below that.                                                             | page         |
| STYLE-21 | One field for now                   | Open Styles and open the dropdown.                                    | The list offers exactly one entry, **Legal entity type**.                                                                                                  | page         |
| STYLE-22 | "Select a field" is not offered     | Open the dropdown and read its list.                                  | "Select a field" is shown in the closed dropdown only. It is not an entry of the opened list and cannot be picked.                                         | page         |
| STYLE-23 | No list before a field is chosen    | Open Styles in a fresh diagram.                                       | No values and no **Select all** are shown.                                                                                                                 | page, styles |
| STYLE-24 | Hint before a field is chosen       | Read the hint at the top right.                                       | "Select a legal entity field on the left to see its values. Its value is then shown on every node, under the name, once you press Apply."                  | Manual only  |
| STYLE-25 | Choosing the field lists its values | Choose the field.                                                     | **Select all** and one row per legal entity type of the diagram appear.                                                                                    | page, styles |
| STYLE-26 | Hint once a field is chosen         | Choose the field, tick nothing.                                       | "Press Apply to show this field on every node. Color and shape are for values of the field: click one or more values on the left to be able to pick them." | Manual only  |
| STYLE-27 | Colour and shape need a field       | Open Styles in a fresh diagram and try to click a colour and a shape. | All colour swatches, the custom colour and all shapes are disabled.                                                                                        | page, styles |

## 4. The list of values

| ID       | Case                             | Steps                                                                                                  | Expected result                                                                                                                      | Automated    |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| STYLE-30 | Every type of the diagram, once  | Choose the field. Compare the list with the legal entity types of the nodes.                           | Every type that at least one node has is listed exactly once. A type no node has is not listed.                                      | page, styles |
| STYLE-31 | Alphabetical order               | Read the list from top to bottom.                                                                      | The values are in alphabetical order.                                                                                                | styles       |
| STYLE-32 | Number of nodes                  | Read the number at the right of each row and add them up.                                              | Each number is the count of nodes of that type. The sum is 30, the **LE** number in the top bar.                                     | page, styles |
| STYLE-33 | Picture of the current look      | Look at the small picture at the left of each row in a fresh diagram.                                  | A light gray rectangle in every row.                                                                                                 | styles       |
| STYLE-34 | Picture after a style            | Apply a yellow diamond to "Feeder fund". Open Styles again.                                            | The row of "Feeder fund" shows a yellow diamond; the other rows still show gray rectangles.                                          | styles       |
| STYLE-35 | Mixed looks                      | Close the dialog. Click one node of a type with several nodes and give it another colour. Open Styles. | The picture of that type has a dashed outline, which says that its nodes do not all look the same.                                   | styles       |
| STYLE-36 | The list stays inside the dialog | Choose the field in a diagram with many types, or make the window low.                                 | The list scrolls inside the dialog when it does not fit; the dialog does not grow beyond the window, and its buttons stay reachable. | Manual only  |
| STYLE-37 | Other data, other list           | Open **Sample fund structure LE 24** and open Styles, choose the field.                                | The list holds the types of that diagram with their own counts, 24 in sum.                                                           | page         |

## 5. Ticking values

| ID       | Case                                 | Steps                                                                   | Expected result                                                                                              | Automated    |
| -------- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| STYLE-40 | Tick one                             | Choose the field. Click one row.                                        | The row is marked in dark green. The hint reads "N nodes in 1 value. Nothing changes until you press Apply." | page, styles |
| STYLE-41 | Tick several                         | Click two more rows.                                                    | All three are marked. The hint counts the nodes of all three and says "3 values".                            | page, styles |
| STYLE-42 | Untick                               | Click a marked row again.                                               | It is no longer marked, and the hint counts without it.                                                      | styles       |
| STYLE-43 | Select all                           | Tick the **Select all** checkbox.                                       | Every row is marked. The hint reads "30 nodes in N values".                                                  | page, styles |
| STYLE-44 | Unselect all                         | Untick **Select all**.                                                  | No row is marked.                                                                                            | page, styles |
| STYLE-45 | Select all follows the rows          | Tick rows one by one until all are ticked, then untick one.             | The checkbox is ticked when all rows are, shows a dash while only some are, and is empty when none is.       | page         |
| STYLE-46 | Singular in the hint                 | Tick the row "Feeder fund", which has exactly one node in this diagram. | "1 node in 1 value."                                                                                         | Manual only  |
| STYLE-47 | Ticking enables colour and shape     | Tick one row.                                                           | The colour swatches, the custom colour and the shapes become enabled.                                        | page, styles |
| STYLE-48 | Unticking the last one disables them | Tick one row, pick a colour and a shape, untick the row.                | Colour and shape are disabled again, and neither is marked any more: what was picked is forgotten.           | page, styles |
| STYLE-49 | Ticking again starts clean           | After STYLE-48 tick a row again.                                        | No colour and no shape is marked; Apply is disabled until one is picked (when the field is shown already).   | styles       |

## 6. Colour

| ID       | Case                             | Steps                                                             | Expected result                                                                                                             | Automated       |
| -------- | -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------- |
| STYLE-50 | The swatches                     | Choose the field, tick a row, look at **Color**.                  | Nine swatches (light gray, yellow, green, blue, red, violet, orange, teal, dark blue) and a custom colour box.              | Manual only     |
| STYLE-51 | Pick a swatch                    | Click the yellow swatch.                                          | It gets a dark green outline. The preview and the picture in the ticked row turn yellow. The diagram does not.              | page, styles    |
| STYLE-52 | Pick another                     | Click the blue swatch.                                            | Blue is marked instead of yellow; only one colour is picked at a time.                                                      | styles          |
| STYLE-53 | Take the choice back             | Click the marked swatch again.                                    | No swatch is marked. Preview and row picture show the current colour of the nodes again.                                    | page, styles    |
| STYLE-54 | Custom colour                    | Click the custom colour box, choose any colour, close the picker. | The preview and the ticked row take that colour. No swatch is marked.                                                       | Manual only     |
| STYLE-55 | Dark colour, light text          | Pick the dark blue swatch.                                        | In the preview the name and the line under it are white, so that they can be read. The same holds on the nodes after Apply. | styles, factory |
| STYLE-56 | Only ticked rows show the colour | Tick one row, pick a colour.                                      | The picture of the ticked row changes; the pictures of the other rows do not.                                               | styles          |
| STYLE-57 | Colour alone                     | Tick a row, pick a colour, pick no shape, **Apply**.              | The nodes of that value get the colour and keep their shape.                                                                | actions         |

## 7. Shape

| ID       | Case                      | Steps                                                   | Expected result                                                                                                               | Automated     |
| -------- | ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| STYLE-60 | The shapes                | Choose the field, tick a row, look at **Shape**.        | Six tiles, each with a picture and a name: Square, Rounded, Ellipse, Diamond, Capsule, Rounded top.                           | tiles, page   |
| STYLE-61 | Pick a shape              | Click **Diamond**.                                      | The tile is marked in dark green. The preview and the picture in the ticked row become diamonds. The diagram does not change. | page, styles  |
| STYLE-62 | Pick another              | Click **Ellipse**.                                      | Ellipse is marked instead of Diamond.                                                                                         | styles        |
| STYLE-63 | Take the choice back      | Click the marked tile again.                            | No tile is marked. Preview and row picture show the current shape of the nodes again.                                         | page, styles  |
| STYLE-64 | Shape alone               | Tick a row, pick a shape, pick no colour, **Apply**.    | The nodes of that value get the shape and keep their colour.                                                                  | actions       |
| STYLE-65 | Every shape               | Apply each of the six shapes in turn to the same value. | Every time the nodes take the shape, keep their size, keep their text inside, and their lines meet their outline.             | factory       |
| STYLE-66 | Colour and shape together | Tick a row, pick a colour and a shape, **Apply**.       | The nodes of that value get both.                                                                                             | page, actions |

## 8. Preview

| ID       | Case                              | Steps                                                                                                   | Expected result                                                                                                                                           | Automated    |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| STYLE-70 | A whole node                      | Open Styles and look at **Preview**.                                                                    | A node as in the diagram: "Fund name" in bold, a thin rule, the three icons (colour, comment, batch), the two arrows at the left, the x at the top right. | Manual only  |
| STYLE-71 | No second line without a field    | Look at the preview before choosing a field.                                                            | Only "Fund name"; no line under it.                                                                                                                       | page, styles |
| STYLE-72 | The field as second line          | Choose the field, tick nothing.                                                                         | Under "Fund name" stands "Legal entity type".                                                                                                             | page, styles |
| STYLE-73 | One value ticked                  | Tick "Feeder fund".                                                                                     | Under "Fund name" stands "Feeder fund".                                                                                                                   | page, styles |
| STYLE-74 | Several values ticked             | Tick a second row.                                                                                      | Under "Fund name" stands "2 legal entity types".                                                                                                          | page, styles |
| STYLE-75 | Shows what is not picked as it is | Give "Feeder fund" a yellow diamond and apply. Open Styles, tick "Feeder fund", pick only a new colour. | The preview is a diamond in the new colour: the shape is the one the ticked nodes have now.                                                               | styles       |
| STYLE-76 | Icons follow the shape            | Pick **Diamond**, then **Ellipse**.                                                                     | The arrows and the x sit on the outline of the shape, as on a node in the diagram (further in for a diamond).                                             | styles       |
| STYLE-77 | Follows every click               | Change colour and shape several times.                                                                  | The preview changes at once each time, before Apply.                                                                                                      | page         |

## 9. The Apply button

| ID       | Case                                        | Steps                                                                                   | Expected result                                                                                   | Automated     |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| STYLE-80 | Disabled with nothing chosen                | Open Styles in a fresh diagram.                                                         | **Apply** is disabled (gray).                                                                     | page, styles  |
| STYLE-81 | Enabled by the field alone                  | Choose the field; tick nothing, pick nothing.                                           | **Apply** is enabled: showing the field on the nodes is something to apply.                       | page, styles  |
| STYLE-82 | Disabled when the field is shown already    | Apply the field (STYLE-81). Open Styles again.                                          | **Apply** is disabled: the field is shown already and no style is picked.                         | page, styles  |
| STYLE-83 | Ticking alone is not enough                 | In STYLE-82 tick a row, pick nothing.                                                   | **Apply** stays disabled.                                                                         | styles        |
| STYLE-84 | Enabled by a style for a ticked value       | In STYLE-83 pick a colour or a shape.                                                   | **Apply** is enabled.                                                                             | page, styles  |
| STYLE-85 | Disabled again when the style is taken back | In STYLE-84 click the marked colour or shape again.                                     | **Apply** is disabled again.                                                                      | styles        |
| STYLE-86 | Apply closes the dialog                     | Make a choice and press **Apply**.                                                      | The dialog closes and the diagram shows the result.                                               | page          |
| STYLE-87 | Field and style at once                     | In a fresh diagram: choose the field, tick a row, pick a colour and a shape, **Apply**. | The field is shown on every node and the nodes of the ticked value are styled, by this one press. | page, actions |

## 10. What Apply does to the diagram

| ID       | Case                               | Steps                                                                                                    | Expected result                                                                                       | Automated     |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| STYLE-90 | Nothing before Apply               | Choose the field, tick rows, pick a colour and a shape. Look at the diagram behind the dialog.           | No node has changed.                                                                                  | page          |
| STYLE-91 | The field on every node            | Choose the field, **Apply**.                                                                             | Every node shows its legal entity type under its name, also the nodes of values that were not ticked. | page, factory |
| STYLE-92 | Only the ticked values are styled  | Tick two rows, pick a colour and a shape, **Apply**.                                                     | Exactly the nodes of those two types have the new colour and shape. All others look as before.        | page, actions |
| STYLE-93 | All nodes of a value               | After STYLE-92 count the styled nodes of one type.                                                       | As many as the number in that row of the dialog.                                                      | actions       |
| STYLE-94 | Lines follow the shape             | Give a type the **Diamond** shape.                                                                       | The lines of those nodes end on the outline of the diamond, with no gap.                              | factory       |
| STYLE-95 | Size stays                         | Apply each shape to all nodes (Select all).                                                              | Every node keeps its size and place. A name too long for the shape is cut with "…".                   | factory       |
| STYLE-96 | Listed in the statistics           | Apply a style to a type with N nodes, in a diagram that shows the field already.                         | A row "Style N nodes" with 1 transaction.                                                             | actions       |
| STYLE-97 | Statistics for the field alone     | In a fresh diagram choose the field and **Apply**.                                                       | A row "Show legal entity type on nodes" with 1 transaction.                                           | actions       |
| STYLE-98 | A style the nodes already have     | Give a type a yellow diamond. Open Styles, tick the same type, pick yellow and Diamond again, **Apply**. | The dialog closes, nothing changes, and no row and no undo step is added.                             | actions       |
| STYLE-99 | Only nodes that differ are changed | Give one node of a type the colour yellow by hand. Apply yellow to the whole type.                       | The row in the statistics reads "Style N−1 nodes": the node that was yellow already is not counted.   | actions       |

## 11. Reset all to gray square

| ID        | Case                              | Steps                                                                                                      | Expected result                                                                                                                                                | Automated     |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| STYLE-100 | It asks first                     | Open Styles, press **Reset all to gray square**.                                                           | A second dialog, "Reset all styles?", which says that every node goes back to a light gray square, that the field is unselected, and that Undo brings it back. | page          |
| STYLE-101 | Cancel                            | Press **Cancel** in that dialog.                                                                           | It closes. The styles dialog is still open with its choices. Nothing in the diagram changed.                                                                   | page          |
| STYLE-102 | Reset                             | Style two types and show the field. Open Styles, **Reset all**, **Reset**.                                 | Both dialogs close. Every node is a light gray rectangle and shows its name only.                                                                              | page, actions |
| STYLE-103 | Every node, not only styled types | Colour single nodes by hand and with **Randomize all**. Then Reset all.                                    | Every node of the diagram is a light gray rectangle, however it got its look.                                                                                  | actions       |
| STYLE-104 | The field is unselected           | After STYLE-102 open Styles.                                                                               | The dropdown reads "Select a field" and no values are listed.                                                                                                  | page          |
| STYLE-105 | Reset with only the field shown   | In a fresh diagram apply the field only. Open Styles, Reset all, Reset.                                    | The nodes show their name only again.                                                                                                                          | page, actions |
| STYLE-106 | Reset of a choice not yet applied | In a fresh diagram open Styles, choose the field, tick rows, pick a colour. Reset all, Reset. Open Styles. | The dropdown reads "Select a field". Nothing in the diagram changed, and no undo step was added.                                                               | page          |
| STYLE-107 | Listed in the statistics          | After STYLE-102 read the statistics.                                                                       | A row "Reset styles" with 1 transaction.                                                                                                                       | actions       |
| STYLE-108 | Nothing to reset                  | In a fresh diagram open Styles, Reset all, Reset.                                                          | Both dialogs close. No row and no undo step is added.                                                                                                          | actions       |

## 12. Undo and redo

The cases for undo as a whole are in [undo.md](undo.md); these are the ones about styles.

| ID        | Case                     | Steps                                                                            | Expected result                                                                                     | Automated     |
| --------- | ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| STYLE-110 | Apply is one step        | Apply a colour and a shape to three types at once. Read Transactions in history. | It went up by 1, however many nodes changed.                                                        | page, actions |
| STYLE-111 | Undo of a style          | After STYLE-110 press **Undo**.                                                  | All those nodes have their old colour and shape.                                                    | page, actions |
| STYLE-112 | Undo of the field        | In a fresh diagram apply the field only. Undo.                                   | The nodes show their name only. The state line reads "Initial state: matches the startup snapshot". | page          |
| STYLE-113 | Undo of field and style  | In a fresh diagram apply the field together with a style (STYLE-87). Undo once.  | The style and the field are both gone after this single Undo.                                       | page, actions |
| STYLE-114 | Redo                     | After STYLE-113 press **Redo**.                                                  | The field is shown and the nodes are styled again.                                                  | page          |
| STYLE-115 | Undo of Reset all        | Style nodes, Reset all. Undo.                                                    | The nodes have their styles back and show the field again.                                          | page, actions |
| STYLE-116 | Redo of Reset all        | After STYLE-115 press **Redo**.                                                  | Every node is a gray rectangle with its name only again.                                            | page          |
| STYLE-117 | The dialog after an undo | Apply the field. Undo. Open Styles.                                              | The dropdown reads "Select a field": the dialog opens on what the nodes show now.                   | page          |
| STYLE-118 | The dialog after a redo  | After STYLE-117 close the dialog, Redo, open Styles.                             | The dropdown reads **Legal entity type** and the values are listed.                                 | page          |

## 13. Styles and the rest of the app

| ID        | Case                           | Steps                                                                                                                                               | Expected result                                                                                                             | Automated   |
| --------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| STYLE-120 | Other data starts unstyled     | Style nodes and show the field. Open **100 generated funds LE 100**.                                                                                | Every node is a gray rectangle with its name only. Styles opens on "Select a field".                                        | page        |
| STYLE-121 | Reset diagram starts unstyled  | Style nodes and show the field. Press **Reset diagram**.                                                                                            | Same as STYLE-120 for the same data.                                                                                        | page        |
| STYLE-122 | A style is not a rule          | Give "Private equity" a colour. Press **Add node** (new nodes are Private equity).                                                                  | The new node is a light gray rectangle: a style is given to the nodes that exist when Apply is pressed.                     | Manual only |
| STYLE-123 | A new node shows the field     | With the field shown, press **Add node**.                                                                                                           | The new node shows its legal entity type under its name like the others.                                                    | factory     |
| STYLE-124 | A type changed by hand         | Click a node, change **Legal entity type** in the side panel to a new text. Open Styles, choose the field.                                          | The new text is a row of its own with 1 node, and the row of the old type counts one less.                                  | styles      |
| STYLE-125 | A type that is gone            | Change the type of the only node of a value to another value. Open Styles.                                                                          | The value that no node has any more is not listed.                                                                          | styles      |
| STYLE-126 | Deleted nodes                  | Delete two nodes of one type. Open Styles, choose the field.                                                                                        | The count of that type is two less.                                                                                         | styles      |
| STYLE-127 | The Shape tool and Styles      | Give a type the Diamond shape with Styles. Click two of its nodes (with two selected, no tree is highlighted); look at **Shape** in the tool strip. | The Shape tool shows the diamond. Changing the shape there changes the two selected nodes only, not the rest of their type. | page        |
| STYLE-128 | Styles in the exported picture | Style nodes, show the field. **Actions** → Export PNG.                                                                                              | The picture shows the colours, the shapes and the legal entity types as on screen.                                          | Manual only |
| STYLE-129 | Styles on a big diagram        | Open **2000 generated funds LE 2000**. Open Styles, choose the field, Select all, pick a colour and a shape, **Apply**.                             | All 2000 nodes take the style. The dialog closes at once; the page responds again within a few seconds.                     | Manual only |
| STYLE-130 | Closing the tab                | Apply a style and try to close the browser tab.                                                                                                     | The browser asks whether to leave, because the diagram has a change.                                                        | page        |

## Known limits

Not failures when seen while running these cases:

- **One field.** The dropdown offers "Legal entity type" only.
- **The field cannot be unselected in the dropdown.** Once a field is shown on the nodes, the way
  to take it off again is **Reset all**, which also resets colours and shapes, or **Undo**.
- **A style is not kept as a rule.** Nodes added later, or nodes whose type is changed later, do
  not take the style of their type by themselves.
- **Custom colours** are applied when the browser's colour picker is closed, not while a colour is
  being dragged in it.
