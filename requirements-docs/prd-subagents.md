# Subagents

## Frontend
I want to add a new project menu item "Subagents" with the icon import { RiRobot2Line } from "react-icons/ri"; in the frontend.

This item should only be enabled if a project is loaded.

We need a new modal dialog showing the component SubagentConfiguration.jsx which allows us to create or edit the files in workspace/<project>/.claude/agents/*

Each subagent is defined as a new file and we want to treat this name as items in a list which is displayed in the SubagentConfiguration component: We list the name and the description of the components. There is the option to delete an icon from the list and to add a new one. If we click on a list item we can edit it

### Agent Details
The agent details allow us to enter name, description, model as text fields. The tools can be picked from the ones defined in .mcp.json with a chips component.
Below the tools line there is a light themed monaco editor which allows us to provide the agent's system prompt. 

## Backend
We need a new module in the backend /subagents which has a controller and service file. It exposes its api endpoints under api/subagents

Each subagent is described in separate Markdown files with YAML frontmatter and stored in workspace/<project>/.claude/agents/<agent name>.md

This is an example for my-agent.md:
```
---
name: your-agent-name
description: Description of when this agent should be invoked
tools: tool1, tool2, tool3
model: sonnet
---

Your agent's system prompt goes here.
Define the role, capabilities, and approach to solving problems.
```

## Format specification
Configuration Fields
1. name (REQUIRED)

Type: String
Format: Lowercase letters and hyphens only
Purpose: Unique identifier for the subagent
Example: test-runner, code-reviewer, debugger

2. description (REQUIRED)

Type: Natural language string
Purpose: Describes when the subagent should be invoked
Critical for: Automatic delegation by Claude
Best practices:

Include trigger phrases like "MUST BE USED", "Use PROACTIVELY", or "Use immediately" to encourage automatic invocation
Be specific and action-oriented
Clearly define the subagent's domain and when it applies



Examples:
yamldescription: "Run test suite, diagnose failures, and fix them. Use PROACTIVELY after code changes."
description: "Expert code review specialist. MUST BE USED immediately after writing or modifying code."
description: "Debugging specialist for errors and test failures. Use proactively when encountering any issues."
3. tools (OPTIONAL)

Type: Comma-separated list of tool names
Default: If omitted, inherits ALL tools from the main thread (including MCP tools)
Purpose: Restricts which tools the subagent can access
Available built-in tools:

Read - Read file contents
Write - Create new files
Edit - Modify existing files
Bash - Execute shell commands
Grep - Search file contents
Glob - List files matching patterns
Task - Delegate to other subagents (usually excluded to prevent loops)



Examples:
yamltools: Read, Grep, Glob, Bash
tools: Read, Write, Edit, Bash
tools: Bash, Read, Write
MCP Tools Integration:

If tools field is omitted, subagent automatically inherits all MCP server tools available to the main thread
You can explicitly list MCP tools alongside built-in tools
Use /agents command to see all available tools (including MCP tools) for easy selection

4. model (OPTIONAL)

Type: String (model alias or special keyword)
Default: Uses same model as main conversation if omitted
Purpose: Specifies which Claude model to use for this subagent
Available options:

sonnet - Claude Sonnet (standard development tasks, balanced performance)
opus - Claude Opus (complex analysis, architecture, critical operations)
haiku - Claude Haiku (simple, deterministic tasks with minimal reasoning)
inherit - Explicitly use the same model as main conversation



Model Selection Guidelines:

haiku: Simple, deterministic tasks with minimal reasoning
sonnet: Standard development and engineering tasks (default recommendation)
opus: Complex analysis, architecture design, and critical operations requiring deep reasoning
inherit: Ensures consistent capabilities across conversation when main agent switches models

Example:
yamlmodel: haiku     # For fast, simple tasks
model: sonnet    # For most development work
model: opus      # For complex architecture decisions
model: inherit   # Adapt to main conversation's model
System Prompt (Body Content)
The content after the YAML frontmatter is the system prompt that defines the subagent's behavior:
Best Practices for System Prompts:

Define the role clearly

markdownYou are a senior code reviewer ensuring high standards of code quality and security.

Provide context discovery instructions

markdownWhen invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Include specific workflows

markdownReview checklist:
- Code is simple and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
- No exposed secrets or API keys

Add performance guidelines (important for context management)

markdownPerformance Notes:
- Limit initial context gathering
- Use specific grep patterns
- Focus on relevant files only

Specify output format

markdownProvide feedback organized by priority:
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (consider improving)

## Complete Example

Here's a fully-configured subagent example:
```
---
name: security-auditor
description: Security specialist for vulnerability scanning and secure coding practices. MUST BE USED when working with authentication, API keys, or user input validation.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a security expert specializing in application security and vulnerability detection.

## When Invoked

1. Scan codebase for common security issues
2. Check for exposed credentials or API keys
3. Review authentication and authorization logic
4. Validate input sanitization
5. Check for SQL injection risks

## Security Checklist

**Critical Issues**:
- API keys or secrets in code
- SQL injection vulnerabilities
- XSS vulnerabilities
- Insecure direct object references
- Missing authentication checks

**Best Practices**:
- Input validation on all user inputs
- Parameterized queries for database access
- Proper error handling (don't expose stack traces)
- Secure session management
- HTTPS enforcement

## Performance Guidelines

- Use grep to search for common security patterns
- Focus on authentication and data handling code
- Limit file reads to security-relevant modules

## Output Format

Provide findings in priority order:
1. **CRITICAL** - Must fix immediately
2. **HIGH** - Fix before deployment
3. **MEDIUM** - Should fix soon
4. **LOW** - Consider improving

Include specific file locations and remediation suggestions for each issue.
```

