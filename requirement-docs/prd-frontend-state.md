# Load state in frontend
I want to introduce a localstorage variable "currentProject" which contains the name of the last loaded project.

If the user loads a project or creates a new one this replaces the content of the variable "currentProject".

## currentProject not set or null
If there is no current project:
* all tabs in ArtifactsPane.jsx except "Live changes" are hidden
* the file system explorer icon in ArtifactsPane.jsx is hidden
* the input field in ChatPane.jsx is disabled
* in the AI Core Settings Modal the checkbox for long term memory is disabled
* the project name in the app bar reads "Select/Create a Project"
* in ProjectMenu the items "Budget Settings" and "Scheduling" are disabled/greyed out

## currentProject is set and not null and the project directory exists
On startup the frontend reads the currentProject from localstorage and verifies that the project exists in the workspace.

If there is a current project which exists in the workspace:
* all tabs in ArtifactsPane.jsx all tabs are displayed
* the file system explorer icon in ArtifactsPane.jsx is displayed
* the input field in ChatPane.jsx is enabled
* in the AI Core Settings Modal the checkbox for long term memory is enabled
* the project name in the app bar displays the project name
* in ProjectMenu the items "Budget Settings" and "Scheduling" are enabled

