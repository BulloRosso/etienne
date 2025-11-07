# Mention workspace files in chat pane input

I want to add a @ functionality in the chat pane message input field. If the user types a @ character the next character triggers a autocomplete function which searches for filenames in the current project workspace files including the .attachments folder - but not the system files and directories like ./claude and ./etienne.

Example:
-------
* User input: "Look at @dr"
* Filesystem: ["workspace/<currentproject>/driver-license.md", "workspace/<currentproject>/.attachments/drivers.docx", ""workspace/<currentproject>/example.md" ]
* Autocomplete suggestions: "driver-license.md", "attachments/drivers.docx"
* After user selects an item from the autocomplete list the input looks like:
"Look at ./attachments/drivers.docx to find clues"
--------

## Frontend
The @ mention functionality should be added to components/ChatInput.jsx

The autocomplete suggestions appear in suggestion pan which contains max. 11 items above the input pane.

The suggestion box:
* has the same width as the input field
* updates with every keystroke of the user
* is formated with - file icon - file name and -relative path (right aligned)
* has a highlight function which is set per default to the first item
* the selected item which is highlighted can be moved with arrow up and arrow down keys
* use cold as the background for the highlighted item
* if the user presses RETURN key while the suggestion box is open the selected item is inserted in the input text
* pressing ESC key closes the suggestion box and contiues regular input in the message pane
* displayed items are sorted by file name ascending


## Backend
We must use the existing endpoints of the content-management endpoint. There are some methods which are used by the components/Filesystem.jsx component - but they do only return the root directory or specified directories.

Our outocomplete function would look for the filename in all directories. We might have to add a new method to the endpoint.

