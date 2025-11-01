# Anthropic Agent SDK TypeScript Todo Tool Reference

The Anthropic Agent SDK includes a powerful **TodoWrite** tool that enables agents to manage structured task lists for tracking progress across complex, multi-step operations. This tool is essential for building agents that can break down complex goals into manageable tasks, maintain context across long sessions, and provide transparent progress tracking.

## Understanding the Todo Tool

The TodoWrite tool is one of the built-in tools in the Agent SDK that allows Claude to create, update, and manage structured task lists. Unlike simple text-based planning, the todo system provides persistent state management that helps agents maintain focus and track completion status across extended workflows.

### Key Capabilities

- **Structured Task Management**: Create tasks with content, status, and metadata
- **Status Tracking**: Track pending, in_progress, and completed tasks
- **Session Persistence**: Maintain todo lists across agent interactions
- **Progress Visualization**: Enable clear progress reporting and status updates
- **Workflow Coordination**: Help agents maintain focus on current tasks while planning ahead

### TodoWrite Tool Schema

The TodoWrite tool uses the following TypeScript interface:

```typescript
interface TodoWriteInput {
  /**
   * The updated todo list
   */
  todos: Array<{
    /**
     * The task description
     */
    content: string;
    /**
     * The task status
     */
    status: 'pending' | 'in_progress' | 'completed';
    /**
     * Active form of the task description
     */
    activeForm: string;
  }>;
}
```

The tool output follows this structure:

```typescript
interface TodoWriteOutput {
  todos: Array<{
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
  }>;
}
```

## Working with the Todo Tool

### Basic Usage in Agent SDK

The todo tool is included by default in Agent SDK queries and can be controlled through tool permissions:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function basicTodoExample() {
  for await (const message of query({
    prompt: 'Create a web application with authentication and user management',
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Bash'],
      permissionMode: 'default',
      maxTurns: 15
    }
  })) {
    if (message.type === 'assistant') {
      console.log('Assistant:', message.content);
    } else if (message.type === 'tool_use' && message.tool_name === 'TodoWrite') {
      console.log('Todo Update:', JSON.stringify(message.input, null, 2));
    } else if (message.type === 'result') {
      console.log('Final todos:', message.todos?.length || 0, 'tasks');
    }
  }
}
```

### Prompting for Todo List Creation

The agent can be prompted to create and maintain detailed todo lists:

```typescript
async function promptedTodoExample() {
  const result = await query({
    prompt: `
Build a React TypeScript application for task management.

MANDATORY REQUIREMENTS:
- Always maintain a detailed todo list with at least 10 tasks
- Break down complex features into smaller, specific tasks
- Update the todo list as you complete each task
- Keep one task in 'in_progress' status at a time
    `,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash'],
      permissionMode: 'acceptEdits',
      systemPrompt: 'You are a meticulous project manager and developer who always maintains comprehensive todo lists.'
    }
  });

  // Process results
  for await (const message of result) {
    if (message.type === 'tool_use' && message.tool_name === 'TodoWrite') {
      const todos = message.input.todos;
      console.log(`\n📋 Todo List Updated (${todos.length} tasks):`);
      
      todos.forEach((todo, index) => {
        const emoji = todo.status === 'completed' ? '✅' : 
                     todo.status === 'in_progress' ? '🔄' : '⏳';
        console.log(`${emoji} ${index + 1}. ${todo.content}`);
      });
    }
  }
}
```

### Monitoring Todo Progress with Hooks

Use hooks to monitor todo updates and implement custom logic:

```typescript
import { query, HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

async function todoMonitoringHook(
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'TodoWrite') {
    const todos = input.tool_response.todos || [];
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    
    console.log(`\n📊 Todo Progress: ${completed} completed, ${inProgress} in progress, ${pending} pending`);
    
    // Alert if no tasks are in progress (might indicate planning phase)
    if (inProgress === 0 && pending > 0) {
      console.log('⚠️  No tasks currently in progress - agent may be planning');
    }
    
    // Alert if too many tasks are in progress simultaneously
    if (inProgress > 1) {
      console.log('⚠️  Multiple tasks in progress - agent may lack focus');
      
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: 'Focus recommendation: Complete current tasks before starting new ones. Maintain only one task in "in_progress" status.'
        }
      };
    }
  }
  
  return { continue: true };
}

async function monitoredTodoAgent() {
  for await (const message of query({
    prompt: 'Build a full-stack blog application with authentication, CRUD operations, and deployment',
    options: {
      hooks: {
        PostToolUse: [{ hooks: [todoMonitoringHook] }]
      },
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash', 'WebSearch'],
      maxTurns: 25
    }
  })) {
    // Process messages
    if (message.type === 'result') {
      console.log('\n✅ Project completed!');
      console.log(`Duration: ${message.duration_ms}ms`);
      console.log(`Total cost: $${message.total_cost_usd}`);
    }
  }
}
```

### Todo-Driven Development Workflow

Implement a development workflow that leverages todo lists for project management:

```typescript
interface ProjectTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  category: 'setup' | 'frontend' | 'backend' | 'testing' | 'deployment';
  estimatedTime?: string;
  dependencies?: string[];
}

async function todoProjectManager(projectDescription: string) {
  const projectPrompt = `
${projectDescription}

PROJECT MANAGEMENT REQUIREMENTS:
1. Create a comprehensive todo list with 15-25 tasks
2. Categorize tasks (setup, frontend, backend, testing, deployment)
3. Break down large features into specific, actionable tasks
4. Maintain only ONE task as 'in_progress' at any time
5. Complete tasks fully before moving to the next
6. Update todo list in real-time as you work

TASK COMPLETION RULES:
- Mark tasks 'completed' ONLY when fully finished
- Keep tasks 'in_progress' if encountering errors or blockers
- Create new tasks for unexpected requirements or fixes
- Remove tasks that become irrelevant

Example good task breakdown:
❌ Bad: "Build user authentication"
✅ Good: "Set up JWT middleware for authentication"
✅ Good: "Create user registration endpoint with validation"
✅ Good: "Build login form component with error handling"
  `;

  console.log('🚀 Starting todo-driven project development...\n');

  for await (const message of query({
    prompt: projectPrompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash', 'WebSearch'],
      permissionMode: 'acceptEdits',
      systemPrompt: `
You are an expert project manager and full-stack developer. You excel at:
- Breaking complex projects into specific, actionable tasks
- Maintaining organized todo lists with clear status tracking
- Working methodically through tasks one at a time
- Providing clear progress updates and status reports

Always use the TodoWrite tool to maintain your task list and update it as you work.
      `,
      maxTurns: 30
    }
  })) {
    if (message.type === 'tool_use' && message.tool_name === 'TodoWrite') {
      displayTodoProgress(message.input.todos);
    }
  }
}

function displayTodoProgress(todos: any[]) {
  const categories = {
    setup: '🔧',
    frontend: '🎨', 
    backend: '⚙️',
    testing: '🧪',
    deployment: '🚀'
  };

  console.log('\n📋 PROJECT TODO LIST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const statusCounts = { pending: 0, in_progress: 0, completed: 0 };
  
  todos.forEach((todo, index) => {
    const emoji = todo.status === 'completed' ? '✅' : 
                 todo.status === 'in_progress' ? '🔄' : '⏳';
    
    statusCounts[todo.status]++;
    
    console.log(`${emoji} ${index + 1}. ${todo.content}`);
  });

  const total = todos.length;
  const progress = Math.round((statusCounts.completed / total) * 100);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Progress: ${progress}% (${statusCounts.completed}/${total} completed)`);
  console.log(`🔄 In Progress: ${statusCounts.in_progress} | ⏳ Pending: ${statusCounts.pending}\n`);
}
```

### Custom Todo Management with Persistence

For applications requiring persistent todo management across sessions:

```typescript
import fs from 'fs/promises';
import path from 'path';

class PersistentTodoManager {
  private todoFilePath: string;

  constructor(sessionId: string) {
    this.todoFilePath = path.join(process.cwd(), `.todos-${sessionId}.json`);
  }

  async saveTodos(todos: any[]) {
    await fs.writeFile(this.todoFilePath, JSON.stringify(todos, null, 2));
  }

  async loadTodos(): Promise<any[]> {
    try {
      const data = await fs.readFile(this.todoFilePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async getProgress() {
    const todos = await this.loadTodos();
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    
    return {
      total,
      completed,
      inProgress,
      pending: total - completed - inProgress,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }
}

async function persistentTodoSession(sessionId: string, prompt: string) {
  const todoManager = new PersistentTodoManager(sessionId);
  const existingTodos = await todoManager.loadTodos();
  
  const initialPrompt = existingTodos.length > 0 
    ? `${prompt}\n\nCONTINUE FROM EXISTING TODOS:\n${JSON.stringify(existingTodos, null, 2)}`
    : prompt;

  for await (const message of query({
    prompt: initialPrompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash'],
      resume: sessionId, // Resume existing session if available
      hooks: {
        PostToolUse: [{ 
          hooks: [async (input, toolUseID, options) => {
            if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'TodoWrite') {
              await todoManager.saveTodos(input.tool_response.todos);
              const progress = await todoManager.getProgress();
              console.log(`💾 Todos saved - Progress: ${progress.progress}%`);
            }
            return { continue: true };
          }]
        }]
      }
    }
  })) {
    if (message.type === 'result') {
      const finalProgress = await todoManager.getProgress();
      console.log(`\n🎉 Session complete! Final progress: ${finalProgress.progress}%`);
    }
  }
}
```

### Todo Analytics and Reporting

Implement analytics to track todo effectiveness and agent performance:

```typescript
interface TodoAnalytics {
  sessionId: string;
  totalTasks: number;
  completedTasks: number;
  averageTaskDuration: number;
  tasksPerCategory: Record<string, number>;
  completionRate: number;
  focusScore: number; // Measure of how well agent maintains single task focus
}

class TodoAnalyzer {
  private todoHistory: Array<{ timestamp: Date; todos: any[] }> = [];

  recordTodoUpdate(todos: any[]) {
    this.todoHistory.push({
      timestamp: new Date(),
      todos: JSON.parse(JSON.stringify(todos)) // Deep clone
    });
  }

  generateAnalytics(): TodoAnalytics {
    if (this.todoHistory.length === 0) {
      return this.getEmptyAnalytics();
    }

    const latestTodos = this.todoHistory[this.todoHistory.length - 1].todos;
    const totalTasks = latestTodos.length;
    const completedTasks = latestTodos.filter(t => t.status === 'completed').length;
    
    // Calculate focus score based on how often multiple tasks were in progress
    const focusViolations = this.todoHistory.filter(entry => {
      const inProgress = entry.todos.filter(t => t.status === 'in_progress');
      return inProgress.length > 1;
    }).length;
    
    const focusScore = Math.max(0, 100 - (focusViolations / this.todoHistory.length) * 100);

    return {
      sessionId: 'current',
      totalTasks,
      completedTasks,
      averageTaskDuration: this.calculateAverageTaskDuration(),
      tasksPerCategory: this.categorizeCompletedTasks(latestTodos),
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      focusScore: Math.round(focusScore)
    };
  }

  private calculateAverageTaskDuration(): number {
    // Simplified calculation - in practice, would track individual task timings
    if (this.todoHistory.length < 2) return 0;
    
    const sessionDuration = this.todoHistory[this.todoHistory.length - 1].timestamp.getTime() - 
                           this.todoHistory[0].timestamp.getTime();
    const completedTasks = this.todoHistory[this.todoHistory.length - 1].todos
      .filter(t => t.status === 'completed').length;
    
    return completedTasks > 0 ? sessionDuration / completedTasks : 0;
  }

  private categorizeCompletedTasks(todos: any[]): Record<string, number> {
    const categories: Record<string, number> = {};
    
    todos.filter(t => t.status === 'completed').forEach(todo => {
      const content = todo.content.toLowerCase();
      let category = 'other';
      
      if (content.includes('setup') || content.includes('install') || content.includes('init')) {
        category = 'setup';
      } else if (content.includes('test') || content.includes('spec')) {
        category = 'testing';
      } else if (content.includes('frontend') || content.includes('ui') || content.includes('component')) {
        category = 'frontend';
      } else if (content.includes('backend') || content.includes('api') || content.includes('server')) {
        category = 'backend';
      } else if (content.includes('deploy') || content.includes('build')) {
        category = 'deployment';
      }
      
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  }

  private getEmptyAnalytics(): TodoAnalytics {
    return {
      sessionId: 'current',
      totalTasks: 0,
      completedTasks: 0,
      averageTaskDuration: 0,
      tasksPerCategory: {},
      completionRate: 0,
      focusScore: 100
    };
  }

  printReport() {
    const analytics = this.generateAnalytics();
    
    console.log('\n📊 TODO ANALYTICS REPORT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📈 Completion Rate: ${analytics.completionRate.toFixed(1)}%`);
    console.log(`🎯 Focus Score: ${analytics.focusScore}%`);
    console.log(`📋 Tasks: ${analytics.completedTasks}/${analytics.totalTasks} completed`);
    console.log(`⏱️  Avg Task Duration: ${(analytics.averageTaskDuration / 1000 / 60).toFixed(1)} minutes`);
    
    if (Object.keys(analytics.tasksPerCategory).length > 0) {
      console.log('\n📂 Tasks by Category:');
      Object.entries(analytics.tasksPerCategory).forEach(([category, count]) => {
        console.log(`   ${category}: ${count} tasks`);
      });
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

async function analyticsEnabledTodoAgent(prompt: string) {
  const analyzer = new TodoAnalyzer();
  
  for await (const message of query({
    prompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash'],
      hooks: {
        PostToolUse: [{ 
          hooks: [async (input, toolUseID, options) => {
            if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'TodoWrite') {
              analyzer.recordTodoUpdate(input.tool_response.todos);
            }
            return { continue: true };
          }]
        }]
      },
      maxTurns: 20
    }
  })) {
    if (message.type === 'result') {
      analyzer.printReport();
    }
  }
}
```

## Best Practices for Todo Tool Usage

### 1. Effective Task Breakdown

```typescript
// ❌ Poor task breakdown
const poorTodos = [
  { content: "Build the app", status: "pending" },
  { content: "Add features", status: "pending" },
  { content: "Test everything", status: "pending" }
];

// ✅ Good task breakdown
const goodTodos = [
  { content: "Initialize React TypeScript project with Vite", status: "pending" },
  { content: "Set up ESLint and Prettier configuration", status: "pending" },
  { content: "Create authentication context and hooks", status: "pending" },
  { content: "Build login component with form validation", status: "pending" },
  { content: "Implement JWT token storage and refresh logic", status: "pending" },
  { content: "Create protected route wrapper component", status: "pending" },
  { content: "Write unit tests for authentication logic", status: "pending" },
  { content: "Set up CI/CD pipeline for deployment", status: "pending" }
];
```

### 2. Status Management Guidelines

```typescript
const statusGuidelines = {
  pending: "Task is planned but not yet started",
  in_progress: "Currently working on this task (limit: 1 at a time)",
  completed: "Task is fully finished and tested"
};

// Best practices for status transitions
const statusTransitionRules = {
  // Only start new tasks when no others are in progress
  startTask: (todos: any[]) => {
    const inProgress = todos.filter(t => t.status === 'in_progress');
    return inProgress.length === 0;
  },
  
  // Mark completed only when fully done
  completeTask: (task: any) => {
    // Verify task is actually complete
    return task.status === 'in_progress' && 
           task.content.includes('verification_criteria_met');
  }
};
```

### 3. Integration with Other Tools

The todo tool works best when integrated with other Agent SDK tools:

```typescript
async function integratedWorkflow() {
  const workflowPrompt = `
Create a REST API with the following requirements:
- User authentication with JWT
- CRUD operations for tasks
- Input validation and error handling
- Unit and integration tests
- API documentation

WORKFLOW REQUIREMENTS:
1. Use TodoWrite to plan and track all tasks
2. Use Read/Write tools to examine and create files
3. Use Bash tool to run tests and installations
4. Update todos in real-time as you complete each step
5. Maintain one task as 'in_progress' at a time
  `;

  for await (const message of query({
    prompt: workflowPrompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash', 'WebSearch'],
      permissionMode: 'acceptEdits',
      hooks: {
        PreToolUse: [{ 
          matcher: 'Bash',
          hooks: [async (input, toolUseID, options) => {
            // Ensure todos are updated before running tests
            if (input.tool_input.command?.includes('test')) {
              console.log('🧪 Running tests - ensure todos reflect current progress');
            }
            return { continue: true };
          }]
        }]
      }
    }
  })) {
    // Process workflow messages
  }
}
```

## Troubleshooting Common Issues

### 1. Todo Tool Not Available

```typescript
// Check if TodoWrite is in allowed tools
const checkTodoTool = async () => {
  try {
    for await (const message of query({
      prompt: 'List available tools and create a simple todo',
      options: {
        allowedTools: ['TodoWrite'], // Explicitly allow TodoWrite
        maxTurns: 3
      }
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        console.log('Available tools:', message.tools);
        const hasTodo = message.tools.includes('TodoWrite');
        console.log('TodoWrite available:', hasTodo);
      }
    }
  } catch (error) {
    console.error('Error checking todo tool:', error);
  }
};
```

### 2. Agent Not Using Todo Tool

```typescript
// Force todo usage with explicit prompting
const forceTodoUsage = async (task: string) => {
  const explicitTodoPrompt = `
${task}

MANDATORY: You MUST use the TodoWrite tool to create and manage a detailed task list.
Start by creating a todo list with at least 8 specific tasks.
Update the todo list as you work through each task.
Mark tasks as 'in_progress' when starting and 'completed' when finished.
  `;

  return query({
    prompt: explicitTodoPrompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Bash'],
      systemPrompt: 'You are required to use the TodoWrite tool for all multi-step tasks. Always maintain an organized todo list.'
    }
  });
};
```

### 3. Performance Optimization

```typescript
// Optimize todo performance for large task lists
const optimizedTodoQuery = async (prompt: string) => {
  return query({
    prompt,
    options: {
      allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash'],
      maxTurns: 15, // Limit turns to prevent excessive todo updates
      hooks: {
        PreToolUse: [{ 
          matcher: 'TodoWrite',
          hooks: [async (input, toolUseID, options) => {
            // Limit todo list size to prevent token overflow
            const todos = input.tool_input.todos;
            if (todos && todos.length > 50) {
              console.log('⚠️  Todo list too large, consider breaking into subtasks');
              // Could modify input here to truncate or reorganize todos
            }
            return { continue: true };
          }]
        }]
      }
    }
  });
};
```

## Advanced Todo Patterns

### 1. Hierarchical Todo Lists

```typescript
interface HierarchicalTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  parentId?: string;
  children?: string[];
  priority: number;
}

const hierarchicalTodoPrompt = `
Create a project with nested task dependencies:

HIERARCHICAL TODO STRUCTURE:
- Epic: "User Authentication System"
  - Story: "JWT Implementation"
    - Task: "Set up JWT middleware"
    - Task: "Create token validation logic"
    - Task: "Add refresh token mechanism"
  - Story: "Login Interface"
    - Task: "Design login form"
    - Task: "Add form validation"
    - Task: "Connect to authentication API"

Use TodoWrite to create this structure with clear parent-child relationships.
Work through tasks in dependency order.
`;
```

### 2. Time-Boxed Todo Management

```typescript
async function timeboxedTodoSession(prompt: string, timeboxMinutes: number) {
  const startTime = Date.now();
  const endTime = startTime + (timeboxMinutes * 60 * 1000);
  
  const timeboxPrompt = `
${prompt}

TIME-BOXED DEVELOPMENT SESSION: ${timeboxMinutes} minutes
- Create focused todo list for this time period
- Prioritize highest-value tasks first
- Mark realistic progress expectations
- Update todos frequently to track progress
  `;

  const abortController = new AbortController();
  
  // Set timeout for the session
  const timeout = setTimeout(() => {
    console.log(`⏰ Time-box expired (${timeboxMinutes} minutes)`);
    abortController.abort();
  }, timeboxMinutes * 60 * 1000);

  try {
    for await (const message of query({
      prompt: timeboxPrompt,
      options: {
        allowedTools: ['TodoWrite', 'Read', 'Write', 'Edit', 'Bash'],
        abortController,
        hooks: {
          PostToolUse: [{ 
            hooks: [async (input, toolUseID, options) => {
              if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'TodoWrite') {
                const remaining = Math.round((endTime - Date.now()) / 1000 / 60);
                console.log(`⏰ Time remaining: ${remaining} minutes`);
              }
              return { continue: true };
            }]
          }]
        }
      }
    })) {
      if (message.type === 'result') {
        clearTimeout(timeout);
        console.log(`✅ Session completed within ${timeboxMinutes} minutes`);
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('⏰ Session ended due to time limit');
    } else {
      throw error;
    }
  }
}
```

## Conclusion

The TodoWrite tool in the Anthropic Agent SDK provides a powerful foundation for building organized, trackable agent workflows. By implementing structured task management, you can create agents that:

- Break down complex goals into manageable tasks
- Maintain focus through single-task execution
- Provide transparent progress tracking
- Enable long-running project management
- Support workflow analytics and optimization

The key to effective todo tool usage is combining clear prompting, appropriate tool permissions, monitoring hooks, and integration with other Agent SDK capabilities. This creates a robust foundation for building production-ready agents that can handle complex, multi-step operations with transparency and reliability.

## Key Takeaways

1. **Always prompt explicitly** for todo list creation and maintenance
2. **Limit in-progress tasks** to one at a time for better focus
3. **Use hooks** to monitor and guide todo management behavior
4. **Integrate with other tools** for complete workflow automation
5. **Track analytics** to optimize agent performance over time
6. **Handle edge cases** like large todo lists and time constraints
7. **Implement persistence** for long-running projects across sessions

The todo tool transforms agents from simple query-response systems into project-aware assistants capable of managing complex, multi-step workflows with professional-grade organization and tracking.