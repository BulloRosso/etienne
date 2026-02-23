# User Notifications

The agent can be busy with working on an user's task for several minutes. During this time the user continues working in Excel, PowerPoint etc.

I want to create a new backend/src/user-notifications service which can notify the user via various channels when a request has been processed.

## Notification Channels Supported

* Desktop Notification (via Browser API)
* Telegram Message
* MS Teams Message
* EMail

The backend has an API which supports a GET api/user-notifications request returning all of the notifications channels supported and their status (available|unavailable).

The backend checks the availability by:
* EMail: Is the IMAP Connector Server started AND has the project the MCP tool "email" available?
* Telegram: Is the Telegram Bot Server started?
* MS Teams: Is the MS Teams Bot server started?

## How can the user select the notification type(s)?

There is a right aligned outlined bell icon in the chat pane's header bar (left of the session selector icon). When the user clicks the icon an menu with the supported notification channels opens. Each notification channel has a checkbox in front and the selection is remembered in the local storage. Unavailable notification types are greyed out. If any notification is activated the bell icon has green color.

## Client Side Notifications

If the desktop notification is active we have need to extend the client side API call to emit a desktop notification using the browser API when the streaming response to the user's message was finished successfully. No notification is created if the user aborts the processing.

## Server Side Notifications

We must append a call to create notification(s) after the API method for processing the user's message has finished sucessfully.

Attention: This is not necessary for the unattended path!