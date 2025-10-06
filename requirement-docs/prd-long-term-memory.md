# Long term memory

We need a minimal implementation of agentic long term memory in the backend in a separate module /memories.service.ts. This service exposes the API endpoints GET/POST/DELETE /api/memories, and POST /api/memories/search. Please find the details in the section "Memory Management" in this document. 

The minimal implementation means we do not use a database, instead we are storing memories in the current project's directory
inside the workspace in a file .etienne/memories.json.

## Frontend
In the Settings modal dialog in ProjectMenu.jsx we need a new checkbox "Long Term Memory" which is unchecked by default. The state is stored in local storage.

If the long term memory is enabled whenever the user submits a message to the API backend we pass a parameter "memoryEnabled" : true along with the user message, aimodel and so on.

### Indicator Icon
In the ArtifactsPane.jsx we display an import { BiMemoryCard } from "react-icons/bi"; 24px to the left of the file system icon in green color if the long term memory is enabled. The icon has a tooltip "Agent Memory Enabled".

### Memoriy Viewer
If the indicator icon is clicked a drawer opens from the left side of the screen titled "Project Long Term Memory" + a close icon button, with a component MemoryPanel.jsx below taking all the available vertical height.

MemoryPanel.jsx lists the project's memories ordered from newest to oldest using the API endpoints. Use a import { TbTimelineEvent } from "react-icons/tb"; icon for each memory item.

## Backend
Extend the API endpoint which receives the input from the frontend with the optional parameter "memoryEnabled". If memoryEnabled is passed AND true then invoke the memories.service by calling the REST endpoints using Axios library. It is important to not call the service here directly via importing the typscript service.

.env contains a variable MEMORY_MANAGEMENT_URL=http://localhost:6060/api/memories which is the base for the Axios REST requests.
.env contains a variable MEMORY_DECAY_DAYS=6 which indicates how long memories are valid. If the parameter is missing or 0, then this means the memories have no decay.

### Memory Extraction prompts
The prompts for memory extraction are ALWAYS performed with the gpt-5-mini model which uses env.OPENAI_API_KEY together with the OpenAI response API (Important: DO NOT USE the OpenAI chat completions API).

### Storage
In the section memory management there is a in-memory storage which we must replace with a file based implementation: the file is stored under /workspace/<project>/.etienne/memories.json. 

### Decay & Retrieval
When we retrieve memories and there is a MEMORY_DECAY_DAYS setting > 0 then we will filter the memories using memory.created_at in conjuction with memory.updated_at: memories with no updated_at and older than today()-MEMORY_DECAY_DAYS will not be returned. memories with a valid updated_at field and older than today()-MEMORY_DECAY_DAYS will also not be returned.

Decay models a simple way to forget which is required to not overload the AI model with a flood of memories over time.

## Memory Management

### 1. Add Memories (POST `/api/memories/`)

Extracts and stores memories from conversation messages.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hi, I'm Alex. I'm a vegetarian and allergic to nuts."
    },
    {
      "role": "assistant",
      "content": "Hello Alex! I'll remember your dietary preferences."
    }
  ],
  "user_id": "alex",
  "metadata": {
    "session_id": "session_123",
    "source": "chat"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "mem_1",
      "memory": "Name is Alex",
      "event": "ADD"
    },
    {
      "id": "mem_2",
      "memory": "Is vegetarian",
      "event": "ADD"
    },
    {
      "id": "mem_3",
      "memory": "Allergic to nuts",
      "event": "ADD"
    }
  ],
  "message": "Added 3 memories successfully"
}
```

### 2. Search Memories (POST `/api/memories/search/`)

Searches for relevant memories based on a query.

**Request Body:**
```json
{
  "query": "What are my food preferences?",
  "user_id": "alex",
  "limit": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "mem_2",
      "memory": "Is vegetarian",
      "user_id": "alex",
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-15T10:30:00",
      "metadata": {"session_id": "session_123"}
    },
    {
      "id": "mem_3",
      "memory": "Allergic to nuts",
      "user_id": "alex",
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-15T10:30:00",
      "metadata": {"session_id": "session_123"}
    }
  ]
}
```

### 3. Get All Memories (GET `/api/memories/{user_id}/`)

Retrieves all memories for a specific user.

**Request:**
```
GET /api/memories/alex/?limit=100
```

**Response:** Same format as search endpoint.

### 4. Delete Memory (DELETE `/api/memories/{memory_id}/`)

Deletes a specific memory by ID.

**Request:**
```
DELETE /api/memories/mem_1/?user_id=alex
```

### 5. Delete All Memories (DELETE `/api/memories/`)

Deletes all memories for a user.

**Request:**
```
DELETE /api/memories/?user_id=alex
```

---

## Production-Ready Memory Extraction Prompt

Use this prompt with your LLM to extract memories from conversations:

```
You are a Personal Information Organizer, specialized in accurately storing facts, user memories, and preferences.

Your task is to extract relevant pieces of information from conversations and organize them into distinct, manageable facts. This allows for easy retrieval and personalization in future interactions.

**Types of Information to Extract:**

1. **Personal Identity**: Name, age, location, occupation, education
2. **Preferences**: Likes, dislikes, favorites (food, music, activities, etc.)
3. **Biographical Facts**: Family, relationships, life events
4. **Goals & Aspirations**: Future plans, ambitions, targets
5. **Habits & Routines**: Daily activities, schedules, rituals
6. **Skills & Expertise**: Professional skills, hobbies, talents
7. **Health Information**: Dietary restrictions, allergies, fitness goals
8. **Opinions & Values**: Beliefs, perspectives, principles
9. **Experiences**: Past events, memories, stories
10. **Context**: Work context, project details, ongoing tasks

**Extraction Guidelines:**

1. Extract ONLY from user and assistant messages (ignore system messages)
2. Make facts concise and self-contained (5-15 words ideal)
3. Start directly with the fact (e.g., "Prefers dark mode" not "The user prefers dark mode")
4. Avoid redundancy - each fact should be distinct
5. Include temporal information when relevant (e.g., "Started learning Python in 2023")
6. Preserve specificity (e.g., "Drinks oat milk latte" not just "Drinks coffee")
7. Detect input language and record facts in the same language
8. If no relevant information found, return empty list
9. Focus on facts that would be useful for future personalization

**Output Format:**

Return ONLY a valid JSON object with this structure:

{
    "facts": [
        "fact 1 here",
        "fact 2 here",
        "fact 3 here"
    ]
}

**Conversation to Analyze:**

{conversation}

**Important:** Return ONLY the JSON object, no additional text or explanation.
```

---

## Memory Update Prompt (For Self-Improving Memory)

Use this when comparing new facts with existing memories:

```
You are a smart memory manager which controls the memory of a system.

You can perform four operations:
1. **ADD**: Add new information to memory
2. **UPDATE**: Modify existing memory with new information
3. **DELETE**: Remove outdated or contradictory information
4. **NONE**: No change needed (information already exists)

**Task:**
Compare newly retrieved facts with existing memories and determine the appropriate action for each memory item.

**Decision Logic:**

1. **ADD**: When new fact contains novel information not present in existing memory
   - Example: Old memory has "Works as engineer", new fact "Started learning Spanish" → ADD

2. **UPDATE**: When new fact refines, corrects, or provides more specific information about existing memory
   - Example: Old memory "Lives in California" + new fact "Lives in San Francisco" → UPDATE

3. **DELETE**: When new fact contradicts or invalidates existing memory
   - Example: Old memory "Loves pizza" + new fact "Became vegan, no longer eats pizza" → DELETE

4. **NONE**: When information is already captured in existing memory
   - Example: Old memory "Name is John" + new fact "Name is John" → NONE

**Input:**

Existing Memories:
{existing_memories}

New Facts:
{new_facts}

**Output Format:**

Return ONLY a valid JSON object:

{
    "memory": [
        {
            "id": "mem_1",
            "text": "Updated or original memory text",
            "event": "ADD|UPDATE|DELETE|NONE",
            "old_memory": "original text (only for UPDATE)"
        }
    ]
}

**Important:** Be conservative with DELETE operations. Only delete when there's clear contradiction.
```

---

## Integration Example (Python)

```python
import requests
import json

BASE_URL = "http://localhost:8000"

def add_conversation_to_memory(messages, user_id):
    """Add a conversation to memory"""
    response = requests.post(
        f"{BASE_URL}/api/memories/",
        json={
            "messages": messages,
            "user_id": user_id
        }
    )
    return response.json()

def search_memories(query, user_id, limit=5):
    """Search for relevant memories"""
    response = requests.post(
        f"{BASE_URL}/api/memories/search/",
        json={
            "query": query,
            "user_id": user_id,
            "limit": limit
        }
    )
    return response.json()

def get_all_memories(user_id):
    """Get all memories for a user"""
    response = requests.get(f"{BASE_URL}/api/memories/{user_id}/")
    return response.json()

# Example usage
messages = [
    {"role": "user", "content": "I'm working on a Python project using FastAPI"},
    {"role": "assistant", "content": "Great! I'll remember that you're working with Python and FastAPI."}
]

# Add memories
result = add_conversation_to_memory(messages, user_id="developer_123")
print("Added:", result)

# Search memories
results = search_memories("What programming language do I use?", user_id="developer_123")
print("Search results:", results)

# Get all memories
all_memories = get_all_memories(user_id="developer_123")
print("All memories:", all_memories)
```

---

## Integration Example (JavaScript/TypeScript)

```javascript
const BASE_URL = "http://localhost:8000";

async function addConversationToMemory(messages, userId) {
    const response = await fetch(`${BASE_URL}/api/memories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, user_id: userId })
    });
    return response.json();
}

async function searchMemories(query, userId, limit = 5) {
    const response = await fetch(`${BASE_URL}/api/memories/search/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: userId, limit })
    });
    return response.json();
}

// Example usage
const messages = [
    { role: "user", content: "I prefer dark mode in all my applications" },
    { role: "assistant", content: "Noted! I'll remember your preference for dark mode." }
];

const result = await addConversationToMemory(messages, "user_456");
console.log("Added:", result);

const searchResults = await searchMemories("UI preferences", "user_456");
console.log("Search results:", searchResults);
```

---

## Production Improvements

To make this production-ready, implement:

1. **Vector Database Integration**: Replace in-memory storage with Qdrant, Pinecone, or Weaviate
2. **LLM Integration**: Replace heuristic extraction with actual LLM calls (OpenAI, Anthropic, etc.)
3. **Embeddings**: Generate embeddings for semantic search
4. **Memory Deduplication**: Detect and merge similar memories
5. **Memory Updates**: Implement the UPDATE operation to refine existing memories
6. **Authentication**: Add API key authentication
7. **Rate Limiting**: Prevent abuse
8. **Persistent Storage**: Database for metadata and relationships
9. **Graph Memory**: Add graph database (Neo4j) for relationship tracking
10. **Caching**: Redis for frequently accessed memories

---

## Testing with cURL

```bash
# Add memories
curl -X POST http://localhost:8000/api/memories/ \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I am Alex and I love hiking"},
      {"role": "assistant", "content": "Nice to meet you Alex!"}
    ],
    "user_id": "alex"
  }'

# Search memories
curl -X POST http://localhost:8000/api/memories/search/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "outdoor activities",
    "user_id": "alex",
    "limit": 3
  }'

# Get all memories
curl http://localhost:8000/api/memories/alex/

# Delete a memory
curl -X DELETE "http://localhost:8000/api/memories/mem_1/?user_id=alex"
```