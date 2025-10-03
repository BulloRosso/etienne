# Background info system
In the UI we want to have a help system which shows toasts explaining how components work.

## Activate & Deactivate background info display
In the settings menu (which is accessible from the ChatPane header) we need a new checkbox "Show background info" which is turned off by default. the setting is remembered in the local storage.

## Data to display
Each toast has an unique infoId and all toasts are stored in a configuration /public/background-info/data.json file.
Example:
```
{
    "backgroundInfo": [
        {
            "infoId": "permissions",
            "content": "**Permissions** are important",
            "icon": "react-icons/md"
        },
        ...
    ]
}
```

## Toast design and behaviour
The toast component is a control BackgroundInfo.jsx which takes an infoId parameter as input.
The toast are pale yellow background and golden 1px border with rounded corners. They have a close icon button right aligned. 
The content regular markdown text in dark yellow font color and is rendered with marked and DOM purify. There is an optional right aligned icon in the top left corner. If there is no icon we use the info outlined icon.
Toasts must be closed by the user explicitely.

# Where to use the component
Please insert the component as first element in these controls.
* tab content area of system prompt tab
* tab content area of permissions tab
* tab content area of integrations tab
* tab content area of interceptors tab
* drawer with filesystem explorer

Create 3 or 4 descriptive sentences in the data.json configuration file.