# Tool Events Display Fix

## Problem

Tool calls (including TodoWrite, MCP tools, and SDK built-in tools) were being emitted by the backend but not displayed in the frontend UI.

### Root Cause

1. ✅ **Backend was correctly emitting** `tool` events via `observer.next()` in [backend/src/claude/sdk/claude-sdk-orchestrator.service.ts:360-368](../backend/src/claude/sdk/claude-sdk-orchestrator.service.ts#L360-L368)

2. ✅ **SSE stream was correctly configured** to stream events from backend to frontend

3. ❌ **Frontend was NOT listening** for `tool` events - only had listeners for:
   - `session`
   - `stdout`
   - `usage`
   - `file_added`
   - `file_changed`
   - `guardrails_triggered`
   - `output_guardrails_triggered`
   - `completed`
   - `error`

4. ❌ **`structuredMessages` state existed but was never populated** - The UI components to display tool calls existed ([ChatPane.jsx:168-178](src/components/ChatPane.jsx#L168-L178)) but the state was empty

## Solution

Added `tool` event listener in [App.jsx:719-758](src/App.jsx#L719-L758) that:

1. **Listens for `tool` SSE events** from the backend
2. **Populates `structuredMessages` state** with tool call data
3. **Maps backend event data to frontend structure**:
   ```javascript
   {
     id: data.callId,
     type: 'tool_call',  // Required by StructuredMessage component
     toolName: data.toolName,
     args: data.input,
     status: data.status,
     result: data.result
   }
   ```
4. **Updates existing tool calls** when status changes (e.g., running → complete)
5. **Removes previous TodoWrite entries** when a new TodoWrite call arrives, ensuring only the latest todo list is displayed

## Event Flow

### Before Fix
```
Backend emits 'tool' event
    ↓
SSE stream sends event
    ↓
Frontend receives event
    ↓
❌ No listener - event ignored
    ↓
structuredMessages stays empty
    ↓
No tool calls displayed
```

### After Fix
```
Backend emits 'tool' event
    ↓
SSE stream sends event
    ↓
Frontend receives event
    ↓
✅ 'tool' listener catches event
    ↓
structuredMessages updated
    ↓
StructuredMessage component renders
    ↓
Tool calls displayed in UI
```

## Components Updated

### [App.jsx](src/App.jsx)
- **Lines 719-758**: Added `tool` event listener
- Event data structure mapped to match StructuredMessage requirements
- Existing tool calls updated, new ones added
- **Lines 741-745**: TodoWrite deduplication - removes previous TodoWrite entries when a new one arrives
- Already had `structuredMessages` state (line 18) and clearing on session change (line 744)

## Special Handling

### TodoWrite Tool
The [StructuredMessage.jsx](src/components/StructuredMessage.jsx) component has special rendering for TodoWrite:
- **Lines 171-174**: Detects `toolName === 'TodoWrite'`
- **Lines 25-104**: TodoListDisplay component with status icons
- Displays todos with:
  - ✓ Completed items (strikethrough, grayed out)
  - ⋯ In-progress items (spinning icon, highlighted)
  - ☐ Pending items (checkbox outline)
  - Active form text for in-progress items

**Deduplication**: When a new TodoWrite call arrives, all previous TodoWrite entries are removed from `structuredMessages`, ensuring only the latest todo list is displayed. This prevents multiple stacked todo lists as Claude updates progress.

### MCP Tools
MCP tools (like `mcp__internetretrieval__get_current_week_promotions`) are displayed as regular tool calls with:
- Tool icon (if mapped in TOOL_ICONS)
- Tool name
- Input arguments preview
- Status indicator

## Testing

To verify the fix works:

1. **Start a multi-step task** that uses TodoWrite:
   ```
   "Create three pages for dogs, cats, and birds"
   ```

2. **Expected UI display**:
   - Todo list appears showing all tasks
   - Active task has spinning icon
   - Completed tasks show checkmark
   - Tool calls (like MCP warehouse queries) appear above the list
   - All tool statuses update in real-time

3. **Check browser console** for:
   ```
   Tool event: {callId: "...", toolName: "TodoWrite", input: {...}, status: "running"}
   Tool event: {callId: "...", toolName: "mcp__internetretrieval__get_current_week_promotions", ...}
   ```

## Related Files

- [backend/src/claude/sdk/claude-sdk-orchestrator.service.ts](../backend/src/claude/sdk/claude-sdk-orchestrator.service.ts) - Emits tool events
- [frontend/src/App.jsx](src/App.jsx) - Listens for tool events
- [frontend/src/components/StructuredMessage.jsx](src/components/StructuredMessage.jsx) - Renders tool calls
- [frontend/src/components/ChatPane.jsx](src/components/ChatPane.jsx) - Displays structured messages

## Event Data Structure

### Backend Emits
```javascript
{
  type: 'tool',
  data: {
    toolName: 'TodoWrite',
    status: 'running',
    callId: 'toolu_xyz123',
    input: { todos: [...] }
  }
}
```

### Frontend Maps To
```javascript
{
  id: 'toolu_xyz123',
  type: 'tool_call',
  toolName: 'TodoWrite',
  args: { todos: [...] },
  status: 'running',
  result: undefined
}
```

## Status Lifecycle

Tool calls go through this lifecycle:
1. **running** - Tool is executing (spinner shown)
2. **complete** - Tool finished successfully (checkmark shown)
3. **error** - Tool failed (error icon shown)

The frontend listener handles all three states and updates the UI accordingly.
