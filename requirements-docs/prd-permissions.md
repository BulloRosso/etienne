# Permissions 
Permissions are granted on the environment and currently passed directly via commandline, e. g.
```
"$CLAUDE_BIN" \\
  --print "$CLAUDE_PROMPT" \\
  --output-format stream-json \\
  --verbose \\
  --include-partial-messages \\
  --permission-mode acceptEdits \\
  --allowedTools "Task" \\
  --allowedTools "WebFetch" \\
  --allowedTools "Bash(curl:*)" \\
  --allowedTools "Read(${containerCwd}/**)" \\
  --allowedTools "Bash(python3:*)" \\
  --allowedTools "Bash(pytest:*)" \\
  --allowedTools "Bash(pip:*)" \\
  --allowedTools "Write(./**/*.py)" \\
  --allowedTools "Edit(${containerCwd}/out/**)" \\
  --allowedTools "Write(${containerCwd}/out/**)" \\
  --allowedTools "MultiEdit(${containerCwd}/out/**)" \\
  --allowedTools "NotebookEdit(${containerCwd}/out/**)" 
  ```
This is done in the script-builder.ts part.

We want ot have the allowed tools editable. Therefore we introduce a new file the project folder under the path /workspace/<project>/.caude/permissions.json.

Example permissions.json:
```
{
    "allowedTools": [
        "Bash(python3:*)",
        "Write(./**/*.py)"
    ]
}
```

# Backend
The default allowed tools are the current ones as in script-builder.ts. We extract them and store them in config/claude.config.ts as new property. We need to check the permissions.json every time before building the script. If it exists the deault allowed tools are replaced with the tools listed under "allowedTools" in the JSON.

We introduce an new GET and POST API endpoint /api/permissions/<project> to read and write the fille under .claude/permissions.json. If there's no file existing the GET endpoint returns the default allowed tools of claude.config.ts

# Frontend
In the frontend we need a new 4th tab item "Permissions" which display a new component PermissionList.jsx. The component PermissionList.jsx displays an editable table where we can add, edit or remove items in the list.

The component uses GET /api/permissions/<current project> to initalize the list and issues an POST to /api/permissions/<current project> after the "Save button" is pressed. The save button is right aligned below the list.