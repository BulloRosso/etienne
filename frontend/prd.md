# Product Requirements Specification

## Chat
Screen space below the app bar is divided in a 50%/50% two column layout: First column is the chat pane, second column is the artifacts pane. There is a splitter in the 24px gap between the two columns which allows the user to resize the width of the components. The current split ratio is rememeberd in a local storage item.

### Chat Pane
The chat pane is a premium design chat which takes the full column height. 

#### Chat message area
The chat pane has a very light pale yellow background and chat bubble without avatar icons. The user input is left aligned, the model's response ir right aligned. The chat bubbles have a light dropshadow and display the current time as HH:MM in small gray font.

When the model responds the message is streamed into the chat bubble and when the stream ends the token consumption component is added before the current time line item.

The chat message area does not have a header

#### Chat input area
At the bottom there is a chat input area which contains:
* a file upload button on the left
* a multiline text input field (which is initally only 1 line high, but expands when the user types more), return key adds a new line and does NOT submit the message
* a microphone icon button for speech recognition (using chrome browser api and using the text input field for live preview)
* a paperplane icon button to submit the message

### Artifacts Pane
The artifacts pane has a tabstrip header which initally only has a "Files" tab item which is active. In the tab content there is the Files component, which displays files as reported from the API via SSE. This feature currentlyy is inside the App.jsx file and must be extracted to a separate component. The component itself has no header and takes the full vertical height.