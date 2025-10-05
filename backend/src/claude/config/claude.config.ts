export class ClaudeConfig {
  readonly container: string;
  readonly hostRoot: string;
  readonly containerRoot: string;
  readonly timeoutMs: number;
  readonly anthropicKey: string;
  readonly defaultAllowedTools: string[];

  constructor() {
    this.container = process.env.CLAUDE_CONTAINER_NAME ?? 'claude-code';
    this.hostRoot = process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
    this.containerRoot = '/workspace';
    this.timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS ?? 600000);
    this.anthropicKey = process.env.ANTHROPIC_API_KEY ?? 'key' ;
    this.defaultAllowedTools = [
      'Task',
      'WebFetch',
      'WebSearch',
      'Bash(curl:*)',
      'Read(${containerCwd}/**)',
      'Bash(python3:*)',
      'Bash(pytest:*)',
      'Bash(pip:*)',
      'Write(./**/*.py)',
      'Edit(${containerCwd}/out/**)',
      'Write(${containerCwd}/out/**)',
      'MultiEdit(${containerCwd}/out/**)',
      'NotebookEdit(${containerCwd}/out/**)',
    ];
  }

  getActiveEventsHooks(projectName: string): any {
    const createHookCommand = (eventType: string) =>
      `jq -c '. + {event_type: "${eventType}", timestamp: (now | todate)}' | curl -X POST http://host.docker.internal:6060/api/interceptors/in -H 'Content-Type: application/json' -H 'X-Claude-Code-Project: ${projectName}' -H 'X-Claude-Event: ${eventType}' -d @- -s`;

    return {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('UserPromptSubmit')
              }
            ]
          }
        ],
        PreToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: createHookCommand('PreToolUse')
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: createHookCommand('PostToolUse')
              }
            ]
          }
        ],
        Notification: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('Notification')
              }
            ]
          }
        ],
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('Stop')
              }
            ]
          }
        ],
        SubagentStop: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('SubagentStop')
              }
            ]
          }
        ],
        PreCompact: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('PreCompact')
              }
            ]
          }
        ],
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: createHookCommand('SessionStart')
              }
            ]
          }
        ]
      }
    };
  }
}
