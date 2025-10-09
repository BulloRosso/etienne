# Aborting and limiting the agentic cycle

After we passed the users message to Claude Code with the -p parameter it begins working. Depending on the task this can take seconds up to 20 minutes. The user must have the chance to terminate a running request and we must generally limit the loop cycles upfront.

## Limiting the agentic cycles
In the frontend we need to add a new input box for numbers with the label "Maximum agentic loops" with a default value of 5. 0 in this box means "unlimited cycles". 

This setting is directly passed as a new parameter "maxTurns" together with the user message. In the backend when calling Claude code we pass the additional command line paramter "--max-turns <value>".

## Aborting a running command
We the backend API request must return the processId of the linux command which we store on the frontend.

Additionally we need a new endpoint /api/claude/abort/<processId> which terminates the process. Example for process control using SIGINT/SIGTERM via bash inside the Docker container:
```
// Kill the Claude process via SIGTERM or SIGINT
const claudeProcess = spawn('claude', ['-p', '--output-format', 'stream-json', prompt]);

// Allow user to abort
process.on('SIGINT', () => {
  claudeProcess.kill('SIGTERM');
  process.exit(130);
});
```

### How to initiate the termination of the process in the frontend
Currently the "Send message" is grayed out during the execution of the process. Instead of greying out the icon we replace it with import { BsStopCircle } from "react-icons/bs"; in dark red color. To indicate the running process we need a CSS animation which slowly rotates this icon to catch attention. 

When the user clicks the icon an request to /api/claude/abort/<processId> is sent. If the API call is finished, then the regular send icon is shown again and the user message is NOT cleared, so the user can edit it and send it again.