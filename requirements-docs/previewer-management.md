# Previewer Management

In the frontend in the filesystem viewer we have a context menu item "Open preview" which opens a new tab in the preview pane. The tab contains a previewer component which is mapped via the files extension. There are single component extensions like *.docx or *.pdf and multi component extensions like *.requirements.json - we must make sure that the multi component extensions are evaluated before single component extensions.

Previewer allow the users to interact with the content (mostly read only, but the markdown viewer also allows direct editing). 

The backend has a content-management service which provides the preview data.

Previewers are managed globally and not on a per workspace project basis.

**Service function viewers**
There's a second class of previewers: ServicePreviewers which do not depend on file extensions but on active services as seen by backend/src/process-manager. These usually have icons e. g. in the minimalistic sidebar. The menu items then trigger a javascript event which does not contain a filename but a service name. We should extend the current JSON schema for the file previewer event with a serviceName + serviceFunction, e. g. "imap" + "/inbox" as function.

## Objective: Modular and well documented plugin system

The current file previewer handling is historical grown and should be refactored to a clean, understandable and modular approach.

To get an overview compile a list of the existing previewers first.

## PreviewersManager Component

We need a component which displays all the installed and available previewers together with the count of the assigned.

The layout has two columns:
* List of the previewers (alphatetically ordered)
* Previewer settings

By default the first item in the list is selected and the settings are shown.

In the settings we can see the assigned file extensions and manage them. The extensions are stored in the env of the backend.

## FilePreviewHandler

The file preview handler is a central component which routes requests to open tabs (e. g. sent by the file system explorer) to the preview pane. It must be aware of the current settings.