# Using Alternative Models

Inside a project's workspace i want to have setup file like workspace/<project name>/.etienne/ai-model.json i want to store content like this:
```
{
    "isActive": true,
    "model": "kimi-k2-instruct",
    "baseUrl": "https://api.moonshot.ai/anthropic",
    "token": "ad..ereh"
}
```
This setup allows us to use other models than Sonnet/Haiku with Claude Code. 

## Frontend
In the component Chatpane.jsx i want to modify the existing AI Core Settings modal:
* Rename the second toggle button option form "Openai GPT-4" to "Other AI model"
* If "Other AI model" is selected we show 3 text input fields below:
  - "Model Name"
  - "API Base URL"
  - "Token/API Key"
  Please use the material design inputs which show the placeholder as small caption if a value is in the text field.
  Below the text fields there a small info section with icon and pale yellow background: "Model must be compatible with Anthropic messages API."

These three fields will be read if a ai-model.json exists for the project when the dialog is opened an written if the dialog is closed with the "Save" button.

If the and ai-model.json exists and the user switches the toggle button back to the first option and saves, then "isActive" in the file is set to false.

## Backend
In the backend service in backend/src/claude we must pass these variables if an ai-model.json exists for the project AND the property in this file "isActive" is true.

Example
```
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    envvars={
        "ANTHROPIC_BASE_URL": "https://api.moonshot.ai/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "your-api-key",
        "ANTHROPIC_MODEL": "kimi-k2-instruct"
    }
)
```