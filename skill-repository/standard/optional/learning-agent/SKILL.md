---
name: learning-agent
description: "Background learning skill that automatically extracts business entities and relationships from every user message, building a domain-specific ontology. Creates a .knowledge file for visual browsing. On first use, onboards by discovering the business model. Then silently maintains the ontology. Always active — never needs explicit invocation."
---

# Learning Agent

You have a secondary, always-on responsibility: **extract and maintain a business ontology** from every conversation. You do this silently alongside your normal work — the user should rarely notice unless you need to ask a clarifying question.

---

## 1. Project Name

Derive the project name from your working directory. The project name is the folder name directly under `/workspace/`.

```bash
basename "$(pwd)"
```

Store this in a variable `PROJECT` for all API calls below.

---

## 2. Auto-Initialization

On your **first message in a session**, silently check the ontology state:

```bash
curl -s "http://localhost:6060/api/public/ontology/context/${PROJECT}" \
  | jq -r '.context'
```

- If the response is essentially empty (only the header `## Current Ontology State` with no entity sections), enter **Onboarding Mode**.
- If entities exist, enter **Continuous Learning Mode**.
- Also check if a `.knowledge` file exists in the project root. If not, you will create one after onboarding.

---

## 3. Onboarding Mode

When the ontology is empty, pause your normal workflow and guide the user:

> "I notice this project doesn't have a business model set up yet. I can learn from our conversations to build one automatically, but I need a starting point.
>
> Could you describe your business domain? For example:
> - List the main things you work with (e.g., Customers, Orders, Products, Vendors, Warehouses)
> - Or just describe what your business does in a few sentences
>
> I need at least 5 entity types and some relationships between them to get started."

### Processing the user's response

From the user's description, extract:

1. **Entity types** (at least 5) — these become the categories in the ontology (e.g., `Customer`, `Order`, `Product`)
2. **Relationships** between types — how entities connect (e.g., Customer `placesOrder` Order, Order `contains` Product)
3. **Key properties** for each type — what data fields each type typically has (e.g., Customer has `name`, `email`)

### Confirming with the user

Present the derived model clearly:

> "Here's what I've identified:
>
> **Entity Types:** Customer, Order, Product, Vendor, Warehouse
>
> **Relationships:**
> - Customer → placesOrder → Order
> - Order → contains → Product
> - Vendor → supplies → Product
> - Warehouse → stores → Product
>
> **Properties:**
> - Customer: name, email, phone
> - Order: status, total, date
> - Product: name, price, sku
>
> Should I set this up, or would you like to adjust anything?"

### Bootstrapping

Once confirmed, call the bulk-create endpoint:

```bash
curl -s -X POST "http://localhost:6060/api/public/ontology/bootstrap/${PROJECT}" \
  -H "Content-Type: application/json" \
  -d '{
    "entities": [
      { "id": "type-def-customer", "type": "Customer", "properties": { "description": "A customer who places orders", "typicalProperties": "name,email,phone" } },
      { "id": "type-def-order", "type": "Order", "properties": { "description": "A purchase order", "typicalProperties": "status,total,date" } }
    ],
    "relationships": [
      { "subject": "type-def-customer", "predicate": "placesOrder", "object": "type-def-order" }
    ]
  }'
```

### Creating the `.knowledge` file

After bootstrapping, create a `.knowledge` file in the project root. Name it after the root concept the user described (lowercase, hyphenated):

```json
{
  "name": "Supply Chain",
  "slug": "supply-chain",
  "description": "Supply chain management ontology",
  "createdAt": "2026-03-25T10:00:00.000Z",
  "updatedAt": "2026-03-25T10:00:00.000Z"
}
```

Write this file using the standard file write tool. The `.knowledge` extension triggers a visual previewer in the UI where the user can browse entities, drill into relationships, and see a guide for how to interact with the ontology.

Confirm to the user:

> "Your business model is set up with N entity types and M relationships. I've created `supply-chain.knowledge` — you can open it to browse your ontology visually. From now on, I'll learn from every message automatically."

---

## 4. Continuous Learning Mode

After onboarding (or when the ontology already has content), silently analyze **every user message** for ontology-relevant information. Do not announce routine extractions.

### What to extract

For each message, determine if it contains:

| Signal | Action | Example |
|--------|--------|---------|
| New entity instance | CREATE | "We just signed a deal with Acme Corp" → new Vendor |
| Updated property | UPDATE | "The Johnson order shipped yesterday" → update Order status |
| Removed entity | DELETE (confirm first) | "We dropped Vendor X" → ask before deleting |
| New relationship | CREATE relationship | "Acme Corp will supply Widget Pro" → new `supplies` relationship |
| New entity type | CREATE (confirm first) | "We need to track delivery routes" → new DeliveryRoute type |

### CREATE an entity

```bash
curl -s -X POST "http://localhost:6060/api/public/ontology/entities/${PROJECT}" \
  -H "Content-Type: application/json" \
  -d '{ "id": "vendor-acme-corp", "type": "Vendor", "properties": { "name": "Acme Corp", "status": "active" } }'
```

### UPDATE an entity

```bash
curl -s -X PUT "http://localhost:6060/api/public/ontology/entities/${PROJECT}/order-johnson-2024" \
  -H "Content-Type: application/json" \
  -d '{ "type": "Order", "properties": { "status": "shipped", "shippedDate": "2026-03-24" } }'
```

### DELETE an entity

**Always confirm with the user before deleting.** Then:

```bash
curl -s -X DELETE "http://localhost:6060/api/public/ontology/entities/${PROJECT}/vendor-old-supplier"
```

### CREATE a relationship

```bash
curl -s -X POST "http://localhost:6060/api/public/ontology/relationships/${PROJECT}" \
  -H "Content-Type: application/json" \
  -d '{ "subject": "vendor-acme-corp", "predicate": "supplies", "object": "product-widget-pro" }'
```

### Update the `.knowledge` file

After making ontology changes, update the `updatedAt` timestamp in the `.knowledge` file. This triggers a refresh in the visual previewer.

---

## 5. Extraction Rules

### ID generation
- Lowercase, hyphen-separated
- Prefixed with type slug: `customer-jane-smith`, `order-2024-001`, `product-widget-pro`
- Use distinguishing context when names could collide: `customer-john-smith-acme` vs `customer-john-smith-globex`

### Deduplication
Before creating, always check if a similar entity already exists:

```bash
curl -s "http://localhost:6060/api/public/ontology/context/${PROJECT}"
```

If an entity with the same or very similar ID exists, UPDATE it instead of creating a duplicate.

### Confidence threshold
- **Do extract**: Concrete, factual mentions ("We signed Acme Corp", "Order #123 shipped")
- **Do NOT extract**: Hypotheticals ("we might need a warehouse"), questions ("do we have a vendor for X?"), past/deleted entities mentioned in passing
- When in doubt, skip the extraction — false positives are worse than missed extractions

### When to surface to the user
Most extractions should be silent. Only speak up when:
- A **new entity type** is discovered (ask permission to create it)
- A **deletion** is implied (always confirm)
- There is **ambiguity** ("John" — which John? A new one or existing?)
- The ontology is getting **large** and might benefit from review

---

## 6. Automatic Document Learning

When this skill is active, the system **automatically monitors** for new or modified Office documents in the project workspace:

- **Supported formats**: Word (.docx, .doc), Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt), OpenDocument (.odt, .ods, .odp)
- **Trigger**: Any file create or modify event detected by the file watcher
- **Processing**: Runs as an async background task — no user interaction needed
- **Extraction**: The document text is extracted and analyzed by the LLM to find new entities, property updates, and relationships
- **Notification**: When new knowledge is acquired from a document, a green success toast appears in the `.knowledge` file preview

This happens fully automatically. You do **not** need to process Office documents yourself — the backend `OntologyLearningService` handles this. However, you should:
- Mention to the user during onboarding that uploading documents will also feed the ontology
- If the user mentions a document they uploaded, check the ontology context to see if entities were already extracted

---

## 7. API Reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/public/ontology/context/{project}` | Ontology snapshot (markdown) |
| `GET` | `/api/public/ontology/types/{project}` | List all entity types |
| `GET` | `/api/public/ontology/entities/{project}` | Entities with graph links |
| `POST` | `/api/public/ontology/entities/{project}` | Create entity `{id, type, properties}` |
| `PUT` | `/api/public/ontology/entities/{project}/{id}` | Update entity `{type, properties}` |
| `DELETE` | `/api/public/ontology/entities/{project}/{id}` | Delete entity |
| `POST` | `/api/public/ontology/bootstrap/{project}` | Bulk create `{entities[], relationships[]}` |
| `GET` | `/api/public/ontology/relations/{project}/{id}` | Entity relationships (grouped) |
| `POST` | `/api/public/ontology/relationships/{project}` | Create relationship `{subject, predicate, object}` |

All endpoints are on `http://localhost:6060`. No authentication required — these are public endpoints for agent skill use.

---

## 8. Example Scenarios

### Scenario 1: New entity from casual mention

> **User:** "I just had a call with Sarah from TechVentures — they want to partner with us on the new API product."

**Extract silently:**
1. CREATE entity: `{ id: "company-techventures", type: "Company", properties: { name: "TechVentures", contact: "Sarah" } }`
2. CREATE relationship: `{ subject: "company-techventures", predicate: "partnersOn", object: "product-api" }`

No need to inform the user.

### Scenario 2: Update from status change

> **User:** "Good news — the GlobalCorp deal closed. Mark it as won."

**Extract silently:**
1. UPDATE entity: `PUT /ontology-entities/{project}/deal-globalcorp` with `{ properties: { status: "won", closedDate: "2026-03-25" } }`

### Scenario 3: New type needs confirmation

> **User:** "We should start tracking our marketing campaigns."

**Surface to user:**

> "I notice you're mentioning a new type of thing — Marketing Campaigns. Should I add this as a new entity type in your knowledge base? I'd track properties like name, status, budget, and start date."

### Scenario 4: Deletion needs confirmation

> **User:** "We're no longer working with OldVendor Inc."

**Surface to user:**

> "Should I remove OldVendor Inc from your knowledge base? This will delete the entity and its relationships."
