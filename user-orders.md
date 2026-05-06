# User Orders

User Orders give you a bird's-eye view of everything the agent is working on across all your projects. Think of them as task tickets that the agent creates and updates automatically as it works through complex requests.

<div align="center">
<img src="/docs/images/user-orders.jpg" style="marginTop: 24px" alt="user orders" width="800">
</div> 

## What is a User Order?

When you ask the agent for something substantial — like "Research Siemens AG's latest products, write a report, and create a pricing Excel table" — the agent creates a **User Order** to track that work. Each order has:

* A **title** and **description** so you know what it's about
* A **type**: Research, Scheduled Activity, or Monitoring
* A **status** that updates as the agent works: in-progress, completed, requires your input, paused, etc.
* A **history** of status changes so you can see how the work progressed

User Orders are not created for simple tasks like answering a quick question. They are reserved for multi-step work that takes time and involves real deliverables.

## How You See Them

Active orders appear as a **horizontal carousel** in the file preview pane on the right side of the screen. Each order shows its type icon, title, and a short description. You can scroll through them with arrow buttons and page dots.

## What You Can Do

* **Cancel an order**: Click the context menu (three dots) on any order card and select "Cancel". You'll be asked to provide a reason.
* **Respond to input requests**: When the agent needs your input, the order card highlights with an "Your input is required" button. Clicking it takes you directly to the chat session where the agent is waiting for your response.

## How It Works Behind the Scenes

User Orders are powered by a **standard MCP tool** called `user-orders` which is automatically included in every new project. The agent uses three tools to manage orders:

1. **add_user_order** — creates a new order when starting complex work
2. **update_user_order** — updates the status as work progresses
3. **get_user_order** — retrieves order details

All orders are stored centrally in the workspace and accessible across all projects. The agent is guided by a built-in skill that teaches it when and how to create orders, ensuring consistent tracking of meaningful work.
