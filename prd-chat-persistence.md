# Initial chat message & chat history persistence

In the project directory under workspace/<project>/data/assistant.json there is an initial greeting.
Example:
{
    "assistant": {
        "greeting": "Hello, I am your assistant for hydraulic lifters"
    }
}

In the project directory under workspace/<project>/data/chat.history.json there is the persisted chat history.
Example:
{
    "messages": [
        { "timestamp": <UTC ISO timestamp>,
          "isAgent": true,
          "message": "Hello User!",
          "costs": <cost object>
        },
        {
            "timestamp": <UTC ISO timestamp>,
            "isUser": false,
            "message": "How are you?",
            "costs": <cost object>
        }
    ]
}

Both files are maintained by the backend service and are used to maintain greeting and chat history on a per project basis.

## Initial message

### Backend
The backend provides an GET /api/assistant/<project> endpoint which looks for a assistant.json in the project directory and returns the complete file.

### Frontend
The frontend displays the greeting message in the API response as first message from the assistant in the chat pane.

## Chat history persistence
### Backend
Every time the user enters a question and the AI generates an answer in the backend there is a new module chat.persistence.ts which is used to update the chat.history.json file in the project directory.

The backend provides a GET /api/chat/history/<project> which returns the complete file to the frontend.

### Frontend
After switching to an existing project the frontend tries to get the chat history and restores the messages in the chat pane. Then the chat pane scrolls down automatically.


