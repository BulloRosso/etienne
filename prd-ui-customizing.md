# User Interface Customization

The user interface should be customizable with an optional workspace/<project name>/.etienne/user-interface.json settings file.

The first action if a project is loaded in the frontend should be to check wheter there is a user-interface.json and to apply the settings.

## File format of user-interface.json
```
{
    "appBar": {
        "title": "App bar title",
        "fontColor": <"black" | "white>,
        "backgroundColor": <HTML rgb value>
    },
    "welcomePage": {

       "message": "How can I help today?",
       "backgroundColor: <HTML rbg value>,
        "quickActions": [
            {
            "title": "Create a report",
            "icon": <optional icon>,
            "prompt": <markdown for a prompt>,
            "sortOrder": <int number>
            },
            ...
        ]
    }
}
```

## Frontend

### CustomUI.jsx component
We need a component to edit the options in user-interface.json. The componen has a "Save" button which writes the file and loads it (if existing) from the workspace project directory.

The elements of this component should be rendered as "small" because we use it inline with other UI components.

Currently we do not support the quickAction.icon property - so there's no UI element for that. It is reserved for later implementation.

### New Project Modal dialog
The existing modal dialog "Create New Project" should be extended with a checkbox "Customize UI" which is unchecked by default.

If the "Customize UI" checkbox is checked a dropdown combo labeled "copy from" appears which lists all the projects in the workspace which have a user-interface.json file + a "Copy" action button. 

If there is no project with a user-interface.json file do display the CustomUI.jsx component instead of the combo box and the button.

#### Customization options
The customization options are described in the JSON above. In the project menu please add a new item "Customize UI" which opens the CustomUI component.

### Welcome Page
The welcome page is displayed if the user has entered either a welcomeMessage or at least one quickActions item.

It displays a vertically centered input box with a large centered heading "Good <time of the day>, User" and a placeholder message <welcomeMessage>. It has the same options as the chat input pane (+ for attaching files for upload, voice input and send message button). We use the same endpoint like chat input pane and after the user pressed the send message button we switch to the current default page (Chat pane and Preview Pane).

### Changed behaviour of new Chat Icon Button
The new chat session icon button in the chat pane header should open the welcome page IF an user-interface.json extists for the project AND a welcomePage property contains values (either quick actions or a welcome.message).

## Backend
Any new API methods needed for this feature should be appended to the content-management endpoint.