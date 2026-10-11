# Test cases: The bar above the canvas

Everything that has to hold for the bar between the top bar and the canvas: the diagram's **name**,
its **description**, the **search** for nodes, and stepping through what the search found.

- [How to read this file](#how-to-read-this-file)
- [1. The bar as a whole](#1-the-bar-as-a-whole)
- [2. Name: what it shows](#2-name-what-it-shows)
- [3. Name: changing it](#3-name-changing-it)
- [4. Name: required](#4-name-required)
- [5. Name: special characters while typing](#5-name-special-characters-while-typing)
- [6. Name: a diagram opened with an invalid name](#6-name-a-diagram-opened-with-an-invalid-name)
- [7. Description](#7-description)
- [8. Search: finding nodes](#8-search-finding-nodes)
- [9. Search: stepping through the results](#9-search-stepping-through-the-results)
- [10. Search: leaving a result and clearing](#10-search-leaving-a-result-and-clearing)
- [11. Search follows the diagram](#11-search-follows-the-diagram)
- [12. Search and other data](#12-search-and-other-data)
- [13. Undo and redo](#13-undo-and-redo)
- [Known limits](#known-limits)

## How to read this file

**Starting point of every case**, unless the case says otherwise:

1. Open the app, choose **Sample fund structure** in the dropdown of the top bar and press
   **Reset diagram** (the reload icon). The diagram has 24 funds; four of them have "Meridian" in
   their name and two have "Credit".
2. Switch the **developer tools** on (the `</>` icon at the right end of the top bar). Some cases
   read **Transactions in history** in the History panel and the **benchmark statistics** below the
   canvas.

The bar has, from left to right: the **name box** (bold text), the **description box**, the
**search box**, the **count** beside it, and the buttons **<** (previous result) and **>** (next
result). A text typed into the name or description box is taken over when Enter is pressed or the
box is left.

The column **Automated** names the unit test that checks the same thing, by file. "Manual only"
means no automated test covers it. Files are under `src/app/`:

| Short name | File                                           |
| ---------- | ---------------------------------------------- |
| page       | `diagram-page/diagram-page.spec.ts`            |
| search     | `diagram-page/node-search/node-search.spec.ts` |
| name       | `diagram/diagram-name.spec.ts`                 |
| actions    | `diagram-page/diagram-actions.spec.ts`         |
| file       | `diagram/file-name.spec.ts`                    |
| factory    | `diagram/diagram-factory.spec.ts`              |

## 1. The bar as a whole

| ID     | Case                                         | Steps                                                                     | Expected result                                                                                                  | Automated   |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| BAR-01 | Order of its parts                           | Look at the bar.                                                          | Name, then description, then the search box with its count and the two buttons at the right.                     | page        |
| BAR-02 | Everything is disabled while a diagram loads | Choose **200 generated funds** and watch the bar while the nodes appear.  | Name, description, search and both buttons are disabled until all nodes are shown.                               | page        |
| BAR-03 | Disabled while an operation runs             | Enter 24 in the Edits panel and press **× randomize all**; watch the bar. | The boxes are disabled while it runs and enabled afterwards.                                                     | Manual only |
| BAR-04 | A narrow window                              | Make the browser window narrow.                                           | The parts of the bar wrap onto a second line instead of being cut off or overlapping.                            | Manual only |
| BAR-05 | Notes appear below the boxes                 | Type "a/b" into the name box (see section 5).                             | The note is on a line of its own below the boxes; the canvas gets that much shorter and the diagram stays whole. | page        |

## 2. Name: what it shows

| ID     | Case                                 | Steps                                                        | Expected result                                                                   | Automated |
| ------ | ------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------- |
| BAR-10 | Named after the data                 | Look at the name box after Reset diagram.                    | "Sample fund structure", in bold.                                                 | page      |
| BAR-11 | Follows the data that is opened      | Choose **30 generated funds**, then **100 generated funds**. | The box reads "30 generated funds", then "100 generated funds".                   | page      |
| BAR-12 | A new diagram has no name            | Press **New diagram**.                                       | The box is empty and shows the placeholder "Diagram name (required)" (section 4). | page      |
| BAR-13 | Hover text                           | Hold the mouse over the name box.                            | "Letters, digits and spaces only".                                                | page      |
| BAR-14 | The name does not depend on the view | Change the layout and the line type, zoom, select nodes.     | The name stays as it is.                                                          | page      |

## 3. Name: changing it

| ID     | Case                               | Steps                                                                        | Expected result                                                                                             | Automated     |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| BAR-20 | Enter takes the name over          | Replace the name with "Meridian holdings" and press Enter.                   | The box shows "Meridian holdings". Transactions in history is 1. The statistics get a row "Rename diagram". | page, actions |
| BAR-21 | Leaving the box takes it over      | Type another name and click on the canvas.                                   | Same as with Enter: one more step, one more row.                                                            | page          |
| BAR-22 | Spaces around the name are dropped | Type " Meridian holdings " and press Enter.                                  | The box shows "Meridian holdings" without the spaces at either end.                                         | page          |
| BAR-23 | Spaces inside the name stay        | Type "Meridian holdings 2026" and press Enter.                               | The spaces between the words are kept as typed.                                                             | name          |
| BAR-24 | The same name again                | Press Enter in the name box without changing anything. Retype the same name. | No step and no row is added.                                                                                | actions       |
| BAR-25 | Typing alone changes nothing       | Type half a new name and stop, without Enter and without leaving the box.    | Transactions in history is unchanged; the name is taken over only on Enter or on leaving the box.           | Manual only   |
| BAR-26 | Letters of other alphabets         | Type "Šuma Čačak Фонд München 3" and press Enter.                            | Every letter is kept, with its accents.                                                                     | name          |
| BAR-27 | Digits                             | Type "Fund 2026 Q3" and press Enter.                                         | Kept as typed.                                                                                              | name          |
| BAR-28 | A long name                        | Type a name of 200 characters and press Enter.                               | It is taken over. The box shows its beginning and scrolls with the cursor; the bar does not grow.           | Manual only   |
| BAR-29 | The exported file takes the name   | Name the diagram "Meridian holdings". **Actions** → Export PNG.              | The file is called `Meridian holdings.png`.                                                                 | page, file    |

## 4. Name: required

| ID     | Case                                      | Steps                                                                 | Expected result                                                                                             | Automated  |
| ------ | ----------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| BAR-30 | A new diagram asks for a name             | Press **New diagram**.                                                | The name box is empty, has a red border on a light red ground, and reads "Diagram name (required)" in gray. | page       |
| BAR-31 | The mark goes with a name                 | Type "My structure" and press Enter.                                  | The box looks normal again: gray border, white ground.                                                      | page       |
| BAR-32 | A name can be taken away                  | In a named diagram delete the whole name and press Enter.             | The box is empty and marked as in BAR-30. This is one undo step.                                            | page       |
| BAR-33 | Only spaces count as no name              | Type three spaces and press Enter.                                    | The box is empty and marked as required.                                                                    | page       |
| BAR-34 | A diagram can be worked on without a name | **New diagram**, do not name it. **Add node**, rename the node, undo. | Everything works; the name box stays marked until a name is given.                                          | page       |
| BAR-35 | Export without a name                     | **New diagram**, **Add node**, **Actions** → Export PNG.              | The file is called `diagram.png`.                                                                           | page, file |

## 5. Name: special characters while typing

A name may have letters, digits and spaces only.

| ID     | Case                                | Steps                                                                                  | Expected result                                                                                                  | Automated     |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| BAR-40 | A special character does not appear | Click into the name box and type "Meridian:".                                          | The colon does not appear; the box reads "Meridian".                                                             | page          |
| BAR-41 | The note says why                   | After BAR-40 look below the boxes.                                                     | A red note: "Letters, digits and spaces only".                                                                   | page          |
| BAR-42 | Every kind of special character     | Type each of `- _ . , ; : ! ? / \ ( ) [ ] { } < > " ' @ # $ % ^ & * + = ~` one by one. | None of them appears.                                                                                            | name          |
| BAR-43 | Pasted text                         | Copy `<b>Fund/2026</b> #1 (draft)` and paste it into the empty name box.               | The box reads "bFund2026b 1 draft": the special characters are gone, everything else is kept. The note is shown. | page, name    |
| BAR-44 | Emoji, tabs and line breaks         | Paste a text with an emoji and a line break.                                           | Both are removed.                                                                                                | name          |
| BAR-45 | The cursor stays in place           | In "Meridian" put the cursor after "Meri" and type "/".                                | The box still reads "Meridian" and the cursor is still after "Meri", not at the end.                             | page          |
| BAR-46 | The note goes when the name is fine | After BAR-40 type a letter.                                                            | The note disappears.                                                                                             | page          |
| BAR-47 | The note goes when the box is left  | Type "Meridian!" (the note appears) and click on the canvas.                           | The note disappears. The name taken over is "Meridian".                                                          | page          |
| BAR-48 | What is stored has none             | Type "Meridian & Sons 2026" and press Enter. **Actions** → Export PNG.                 | The name is "Meridian Sons 2026" (the two spaces around the removed "&" stay) and the file is named the same.    | page, actions |
| BAR-49 | Only special characters             | Select the whole name, type "***" and press Enter.                                     | Nothing appears; the name is empty and the box is marked as required.                                            | page, name    |

## 6. Name: a diagram opened with an invalid name

For diagrams that come from a database, where a name may have been stored before the rule existed.
Until such loading exists, these cases can only be run by the automated tests.

| ID     | Case                              | What is opened                                                   | Expected result                                                                                                                                                                                        | Automated  |
| ------ | --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| BAR-50 | The name is shown cleaned         | A diagram stored as "Meridian SICAV: structure 2026/Q3 (draft)". | The name box reads "Meridian SICAV structure 2026Q3 draft".                                                                                                                                            | page, name |
| BAR-51 | A note names the invalid name     | The same.                                                        | Below the boxes, in red: "The name of this diagram is not valid: **Meridian SICAV: structure 2026/Q3 (draft)**. Its special characters were removed. A name may have letters, digits and spaces only." | page       |
| BAR-52 | The note is below the boxes       | The same.                                                        | The note is the last thing in the bar, under the name box, not beside it.                                                                                                                              | page       |
| BAR-53 | Cleaning is not a change          | The same; look at the History panel.                             | Transactions in history is 0, Undo is disabled, the state line reads "Initial state: matches the startup snapshot".                                                                                    | page       |
| BAR-54 | The note stays while working      | Change a node, zoom, search.                                     | The note is still there.                                                                                                                                                                               | page       |
| BAR-55 | Dismiss                           | Press the × at the end of the note.                              | The note goes. The cleaned name stays.                                                                                                                                                                 | page       |
| BAR-56 | Giving a name removes the note    | Type a new name and press Enter.                                 | The note goes.                                                                                                                                                                                         | page       |
| BAR-57 | Other data removes the note       | Choose other data in the top bar.                                | The note goes. Opening the same stored diagram again shows it again.                                                                                                                                   | page       |
| BAR-58 | A name of special characters only | A diagram stored as "\*\*\*".                                    | The name box is empty and marked as required; the note shows "\*\*\*".                                                                                                                                 | name       |
| BAR-59 | A valid stored name               | A diagram stored as "Meridian holdings 2026".                    | The name is shown as it is, with no note.                                                                                                                                                              | page, name |

## 7. Description

| ID     | Case                              | Steps                                                              | Expected result                                                                                       | Automated     |
| ------ | --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------- |
| BAR-60 | Empty at first                    | Look at the description box after Reset diagram.                   | Empty, with the placeholder "Description".                                                            | page          |
| BAR-61 | Enter takes it over               | Type "Ownership as of year end" and press Enter.                   | The text stays in the box. Transactions in history is 1. The statistics get a row "Describe diagram". | page, actions |
| BAR-62 | Leaving the box takes it over     | Type another text and click on the canvas.                         | One more step.                                                                                        | page          |
| BAR-63 | Spaces around it are dropped      | Type " As of year end " and press Enter.                           | The box shows "As of year end".                                                                       | page          |
| BAR-64 | Any characters                    | Type "As of 2026/Q3 (draft): 80% done & checked!" and press Enter. | Kept exactly as typed. No note appears: the rule for names does not apply here.                       | page, actions |
| BAR-65 | The same text again               | Press Enter without changing the text.                             | No step is added.                                                                                     | actions       |
| BAR-66 | Can be emptied                    | Delete the text and press Enter.                                   | The box is empty again; one more step. The box is not marked: a description is not required.          | Manual only   |
| BAR-67 | Empty again with other data       | Give a description, then choose other data or press Reset diagram. | The description box is empty.                                                                         | page          |
| BAR-68 | Name and description are separate | Change the name, then the description.                             | Two steps. Neither box changes the other.                                                             | page          |
| BAR-69 | A long description                | Type 300 characters and press Enter.                               | Taken over; the box shows the beginning and scrolls with the cursor.                                  | Manual only   |

## 8. Search: finding nodes

| ID     | Case                               | Steps                                                             | Expected result                                                                                                                | Automated    |
| ------ | ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| BAR-70 | Nothing searched for               | Look at the search box and its buttons.                           | The box is empty with the placeholder "Search nodes". No count is shown. **<** and **>** are disabled.                         | page, search |
| BAR-71 | The count appears while typing     | Type "Meridian".                                                  | The count reads "4 found", without Enter. **<** and **>** become enabled.                                                      | page, search |
| BAR-72 | Typing alone marks nothing         | After BAR-71 look at the diagram.                                 | No node is outlined and the view has not moved.                                                                                | search       |
| BAR-73 | Any part of the name               | Type "redi".                                                      | "2 found": Meridian Credit FoF and Structured Credit, through the "redi" in "Credit". The text may stand anywhere in the name. | search       |
| BAR-74 | Upper and lower case do not matter | Type "MERIDIAN", then "meridian", then "mErIdIaN".                | "4 found" each time.                                                                                                           | page, search |
| BAR-75 | Each letter narrows the result     | Type "c", "cr", "cre", "cred" one letter at a time.               | The count changes with every letter and ends at "2 found".                                                                     | search       |
| BAR-76 | Nothing found                      | Type "zzz".                                                       | The count reads "No nodes found". **<** and **>** are disabled.                                                                | page, search |
| BAR-77 | Spaces around the text             | Type " credit ".                                                  | "2 found": spaces before and after the text are ignored.                                                                       | search       |
| BAR-78 | Only spaces                        | Type three spaces.                                                | No count, as with an empty box. **<** and **>** stay disabled.                                                                 | search       |
| BAR-79 | Only names are searched            | Show the legal entity type on the nodes (Styles). Type "Private". | "No nodes found": the search looks at the names of the nodes, not at their legal entity type or their comments.                | Manual only  |
| BAR-80 | Searching changes nothing          | Search for several texts.                                         | Transactions in history stays 0. No node is selected, moved or dimmed.                                                         | page, search |

## 9. Search: stepping through the results

| ID      | Case                             | Steps                                                                   | Expected result                                                                                                                              | Automated    |
| ------- | -------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| BAR-90  | First result with **>**          | Type "Meridian" and press **>**.                                        | The count reads "1 of 4". "Meridian Global FoF" has a thick gold outline, stands in the middle of the view, and is shown at a readable size. | page, search |
| BAR-91  | Next results                     | Press **>** three more times.                                           | "2 of 4", "3 of 4", "4 of 4": Meridian PE Feeder, Meridian Credit FoF, Meridian Real Assets, each outlined and centred in turn.              | page, search |
| BAR-92  | Only one node is outlined        | During BAR-91 look at the result before.                                | Its gold outline is gone as soon as the next result is shown.                                                                                | search       |
| BAR-93  | Round to the first               | At "4 of 4" press **>**.                                                | "1 of 4", back on the first result.                                                                                                          | search       |
| BAR-94  | Backwards                        | At "1 of 4" press **<**.                                                | "4 of 4": backwards from the first leads to the last.                                                                                        | search       |
| BAR-95  | **<** before any step            | Type "Meridian" and press **<** first.                                  | "4 of 4": it starts from the last result.                                                                                                    | search       |
| BAR-96  | Enter                            | Type "Meridian" and press Enter with the cursor in the search box.      | Same as **>**: "1 of 4". Each further Enter goes to the next result.                                                                         | page         |
| BAR-97  | Shift+Enter                      | Press Shift+Enter in the search box.                                    | Same as **<**: the previous result.                                                                                                          | Manual only  |
| BAR-98  | The outline has the node's shape | Give "Meridian Global FoF" the Diamond shape. Search "Meridian", **>**. | The gold outline is a diamond around the node, not a rectangle.                                                                              | factory      |
| BAR-99  | Zooms in, never out              | Zoom far out, step to a result. Then zoom far in, step to the next.     | From far out the view zooms in to normal size. From far in the zoom is kept; the result is only centred.                                     | search       |
| BAR-100 | One result                       | Type "Toll" and press **>** twice.                                      | "1 of 1" both times; the node stays outlined.                                                                                                | search       |
| BAR-101 | Stepping selects nothing         | Step through results and look at the side panel.                        | No node becomes selected: the side panel does not appear, and no tree is highlighted.                                                        | Manual only  |
| BAR-102 | A new search starts over         | At "3 of 4" change the text to "credit".                                | The count reads "2 found", the outline is gone; **>** then shows "1 of 2".                                                                   | search       |
| BAR-103 | Hover texts of the buttons       | Hold the mouse over **<** and **>**.                                    | "Previous result" and "Next result".                                                                                                         | page         |

## 10. Search: leaving a result and clearing

| ID      | Case                                  | Steps                                                                | Expected result                                                                                                  | Automated    |
| ------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| BAR-110 | Clicking another node lets go         | At "2 of 4" click any node.                                          | The gold search outline is gone and the count reads "4 found" again. The clicked node is selected as usual.      | page, search |
| BAR-111 | The search itself is kept             | After BAR-110 press **>**.                                           | "1 of 4": the text and its results are still there.                                                              | search       |
| BAR-112 | Clicking the result itself            | At "2 of 4" click the outlined node.                                 | It becomes selected (gold selection outline, side panel) and is no longer the search result in focus: "4 found". | page         |
| BAR-113 | Emptying the box                      | At "2 of 4" delete the text in the search box.                       | The outline and the count are gone. **<** and **>** are disabled.                                                | page, search |
| BAR-114 | The clear button of the box           | Type a text and press the small × that the browser shows in the box. | Same as BAR-113.                                                                                                 | Manual only  |
| BAR-115 | Zooming and scrolling keep the result | At "2 of 4" scroll and zoom by hand.                                 | The node keeps its outline and the count stays "2 of 4".                                                         | Manual only  |

## 11. Search follows the diagram

| ID      | Case                                | Steps                                                                                                                                                                                                     | Expected result                                                                    | Automated    |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| BAR-120 | A node renamed into the results     | Type "Meridian" (4 found). Click "Venture Access", rename it "Meridian Venture" in the side panel.                                                                                                        | The count reads "5 found".                                                         | page, search |
| BAR-121 | A node renamed out of the results   | Type "Meridian" (4 found). Rename "Meridian PE Feeder" to "PE Feeder".                                                                                                                                    | The count reads "3 found".                                                         | page, search |
| BAR-122 | The result in focus is renamed away | Step to "Meridian PE Feeder" ("2 of 4"). Click it (which lets go of the result: "4 found") and rename it "PE Feeder" in the side panel.                                                                   | The count reads "3 found", and the node has no search outline.                     | search       |
| BAR-123 | Staying on the result in focus      | Rename "Meridian Global FoF" to "Global FoF" and click on empty canvas. Type "Meridian" (3 found) and step to "2 of 3", Meridian Credit FoF. Press **Undo**, which makes the first fund a Meridian again. | Meridian Credit FoF stays in focus with its outline; the count now reads "3 of 4". | search       |
| BAR-124 | A matching node is deleted          | Type "Meridian". Delete "Meridian Real Assets".                                                                                                                                                           | The count reads "3 found".                                                         | search       |
| BAR-125 | A node is added                     | Type "Zebra" ("No nodes found"). Press **Add node**, click the new node and rename it "Zebra fund".                                                                                                       | The count reads "1 found".                                                         | search       |
| BAR-126 | Undo and redo                       | After BAR-121 press **Undo**, then **Redo**.                                                                                                                                                              | "4 found" after the Undo, "3 found" after the Redo.                                | page         |
| BAR-127 | Randomize                           | Type "Meridian". Press **Randomize all** in the Edits panel.                                                                                                                                              | The count follows the new names, whatever they are.                                | Manual only  |

## 12. Search and other data

| ID      | Case                             | Steps                                                               | Expected result                                                                                           | Automated   |
| ------- | -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| BAR-130 | Reset diagram empties the search | Search "Meridian", step to a result. Press **Reset diagram**.       | The search box is empty, no count, no outline.                                                            | page        |
| BAR-131 | Other data empties the search    | Search "Meridian". Choose **30 generated funds**.                   | The search box is empty.                                                                                  | page        |
| BAR-132 | New diagram empties the search   | Search "Meridian". Press **New diagram**.                           | The search box is empty.                                                                                  | page        |
| BAR-133 | Disabled on an empty diagram     | Press **New diagram**.                                              | The search box is disabled and reads "No nodes to search". **<** and **>** are disabled.                  | page        |
| BAR-134 | Enabled with the first node      | After BAR-133 press **Add node**.                                   | The search box is enabled and reads "Search nodes".                                                       | page        |
| BAR-135 | Disabled again without nodes     | After BAR-134 press **Undo**.                                       | Disabled again. Name and description stay enabled.                                                        | page        |
| BAR-136 | A big diagram                    | Choose **2000 generated funds**. Type a word that many funds share. | The count appears at once while typing. Stepping to a result brings it to the middle of the view at once. | Manual only |
| BAR-137 | Developer tools off              | Switch the developer tools off and repeat BAR-71 and BAR-90.        | The search works the same.                                                                                | page        |

## 13. Undo and redo

The cases for undo as a whole are in [undo.md](undo.md); these are the ones about this bar.

| ID      | Case                         | Steps                                                | Expected result                                                                                                       | Automated    |
| ------- | ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ |
| BAR-140 | Undo of a new name           | Rename the diagram. Press **Undo**.                  | The name box shows "Sample fund structure" again. The state line reads "Initial state: matches the startup snapshot". | page         |
| BAR-141 | Redo of a new name           | After BAR-140 press **Redo**.                        | The new name is back in the box.                                                                                      | page         |
| BAR-142 | Undo of a description        | Give a description. Undo.                            | The description box is empty.                                                                                         | page         |
| BAR-143 | Undo of the first name       | **New diagram**. Name it. Undo.                      | The name box is empty and marked as required again.                                                                   | page         |
| BAR-144 | Name and description in turn | Change name, description, name. Undo three times.    | Each Undo takes back one of them, the last first, and each box shows what it held before.                             | page         |
| BAR-145 | Searching is not a step      | Search, step through the results, clear the box.     | Transactions in history is unchanged. Undo does not bring a search back or take one away.                             | page, search |
| BAR-146 | Closing the tab              | Rename the diagram and try to close the browser tab. | The browser asks whether to leave, because the diagram has a change. After Undo it no longer asks.                    | page         |

## Known limits

Not failures when seen while running these cases:

- **Hyphens, underscores and dots count as special characters** in a name, so "Fund - Q3" becomes
  "Fund Q3".
- **The name is not checked for being unique**, and has no largest length.
- **Search looks at names only**: not at legal entity types, comments or relationships.
- **Search matches a piece of text as typed.** Two words are found only where they stand together
  in that order; there is no "any of these words".
- **Results come in the order of the data**, not from left to right on screen.
