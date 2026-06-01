# Cheat sheet

The user can take notes in a file <workspace>/cheatsheets/<username>.cheatsheet.json.


The cheat sheet is organized in groups which contains items which have a title and a short content (which can be markdown). There's a option to export it as A4 letter PDF file. 

# Adding content from chat

There's an additional context menu item "Add to cheat sheet" in the chat bubble of the chat message pane which opens a modal "AddCheatSheetItem.jsx" which displays the result of a LLM call:

llm-call(<chat bubble content>,<user cheat sheet content>) -> new cheatSheetItem(group,title,content)

The LLM should recognize the group and extract the title and content from the provided bubble content. The user can edit title and content before submitting the form. Also the user can add a new group or select an existing one.

There's a right aligned clos icon in modal.

# Cheat sheet viewer

There's a previewer for te .cheatsheet.json extension which lists the items of a group and allows the user to add, delete and reorder the items. There's also the "Save as PDF" button which creates and downloads a PDF file.

# Menu item in navigation

The minimalistic Sidebar displays a new menu item "Cheat Sheet" above the wiki item with the icon import { RiSketching } from "react-icons/ri";

The menu item opens the previewer by emitting a previewer event.

The menu item is only displayed if the <username>.cheatsheet.json file exists


