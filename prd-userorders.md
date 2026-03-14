# User Orders

We need to provide the user insights about the status of all his tasks in all of the projects of the workspace.

## Definition

A **user order** is a task defined by the user in a session within a project inside the workspace. Example: "Research the Siemens AG latest products. Then write a report in Word Format and Create a Excel Table with the products and prices for the German Market".

A user order is defined by a JSON object with these properties:

* orderId (UUIDv4): primary key
* sessionId (str): the chat sessionId where the order was created
* projectName (str): the project name where the chat session lives
* timestamp (iso UTC str): creation date and time
* lastActivity (iso UTC str): timestamp of the last status change
* type (enum): "Research", "Scheduled Activity", "Monitoring"
* title (str): title for the order (max 60 characters)
* description (str): description of the order (max 2096 characters)
* status (enum): "in-progress", "complete-success", "complete-failure", "canceled-by-user", "canceled-by-agent", "requires-human-input", "blocked-by", "paused"
* statusHistory (str): an array of elements <timestamp> + statusMessage which reflects the status changes

## Storage

All user orders are stored in the workspace/.etienne/user-orders.json file. They are managed by a new MCP server endpoint user-orders in the backend. Thee MCP server endpoint offers these tools:

* add_user_order(sessionId, orderTitle, orderDescription) --> orderId
  Creates a new order with the status "in-progress"

* update_user_order(orderId, statusNew, statusMessage) --> success
  Update the existing order

* get_user_order(orderId) --> user order object

### Extension of the mcp-server-registry.json file

We need to add a new optional property "isStandard": true|false where this new user-orders MCP is the first item to have "isStandard": true

### Extension of the create new project API component in the frontend

We need to include all "isStandard" items like with the skills. The user can see them, but not remove them.

## API Endpoint

We need a new backend/src/user-orders service which exposes two REST API endpoints:

1. GET user-orders/active
   returns all user orders with status other than "complete-..." or "canceled-..." sorted descending by lastActivity

2. GET user-orders/history
   returns all user order with the status "complete-.." or "canceled-..." sorted descending by lastActivity

3. POST user-orders/<orderId>
   Updates the status of the order with a status change description

Use the same api path pattern as with the existing services.

## Frontend component

We need a new frontend component "UserOrders.jsx" which displays a horizontal carousel/slider of active user orders. There's a arrow on the left and right to scroll through the items. There is paging with each page symbolized by a clickable dot. An active user order is symbolized by a paper element with left aligned order type icon (white icon color in a #666 disc), a bold title and a small description below. It has a right aligned vertical elipsis context menu button with the menu item cancel. Cancel brings up a modal dialog where the user must enter a description for the cancelation.

If the status of the user order is "requires-human-input" there is a centered small action button "Your input is required" which first loads the project and the loads the chat of the user order. The user then can continue and give his input in the chat message.

## New Standard Skill

We need a new standard skill user-orders which describes what a user order is and instructs the agent to use the new MCP tools.

A new user-order is not a single modification task, but something higher level like creating a list of new files or conduction some complex research steps.

