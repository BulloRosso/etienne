---
name: draft-quotes
description: Automates RFQ intake via web form and email, calculates pricing from product definitions, and drafts HTML quote emails for sales review
---
# Draft Quotes

This skill automates the request-for-quote (RFQ) intake and quote preparation process. It sets up a public web form for customers to submit quote requests, monitors for incoming RFQ emails, calculates pricing from product/pricing definitions, and drafts formatted HTML quote emails for a sales reviewer.

## Dependencies

This skill requires:
- The **public-website** skill (for the RFQ web form and API endpoints)
- Product and pricing definitions in the `products-and-pricing/` directory
- Optionally, product information PDFs in the `info-pdfs/` directory

## When to Use This Skill

Use this skill when:
- The user asks to set up a quoting system or RFQ process
- The user wants to automate quote generation from product/pricing data
- The user mentions "create a quote", "draft a quote", "set up quoting", "process quote request", or "quote for \<filename\>"
- The user asks to create a web form for quote requests
- The user wants incoming emails about quotes to be processed automatically

## Automatic Initialization on First Message

**IMPORTANT**: On every conversation turn, before handling the user's request, you MUST check whether the Draft Quotes rules have been initialized for this project. Call `GET /api/rules/{project}` and look for rules named "DraftQuotes: RFQ File Created" and "DraftQuotes: RFQ Email Received". If either of these rules is missing, run the full Initialization steps below **silently before responding to the user's actual request**. This ensures RFQs submitted via the web form or email are processed automatically from the very first interaction, without requiring the user to explicitly ask for setup.

If both rules already exist, skip initialization and proceed directly to handling the user's request.

## Initialization Steps

Perform the following setup steps in order. Replace `{project}` with the actual project name throughout.

### Step 1: Verify Prerequisites

1. Check that the `products-and-pricing/` directory exists in the project root and contains at least one file defining products and their pricing. If missing, inform the user and stop initialization -- this directory is required.
2. Create the `request-for-quote/` directory if it does not exist:

```bash
mkdir -p request-for-quote
```

3. Create the `info-pdfs/` directory if it does not exist:

```bash
mkdir -p info-pdfs
```

### Step 2: Generate pricing-calculation.py

Read all files in `products-and-pricing/` to understand the product catalog, pricing rules, quantity breaks, delivery/shipping rules, VAT/tax rates, and production lead times. Then generate `pricing-calculation.py` in the project root targeting **Python 3.12**.

The file must expose these functions:

```python
def get_products() -> list[dict]:
    """Return the full product catalog as a list of dicts.
    Each dict: { 'sku': str, 'name': str, 'category': str, 'unit_price': float,
                 'variants': list[dict] | None, 'description': str }"""

def compute_line_item(sku: str, quantity: int, variant: str | None = None) -> dict:
    """Calculate a single line item.
    Returns: { 'sku', 'name', 'variant', 'quantity', 'unit_price', 'line_total', 'notes' }
    Raises ValueError for unknown SKU or variant."""

def compute_order(line_items: list[dict]) -> dict:
    """Compute full order from line-item requests.
    Each input dict: { 'sku': str, 'quantity': int, 'variant': str | None }
    Returns: {
        'line_items': [...],
        'subtotal': float,
        'delivery': float,
        'vat': float,
        'total': float,
        'currency': str,
        'estimated_production_weeks': int,
        'warnings': list[str]
    }"""

def get_production_weeks(sku: str, variant: str | None = None) -> int:
    """Return production lead time in weeks for a product."""
```

**Rules to encode from the pricing data:**
- Use exact prices from the product definitions.
- Apply delivery/shipping rules as defined (e.g., free delivery when subtotal exceeds a threshold; otherwise add a flat delivery charge). If no delivery rules are defined, default to: free delivery when subtotal > 500 USD, otherwise 100 USD delivery.
- Apply VAT as defined in the pricing data. If not defined, default to 19%.
- Raise `ValueError` for unknown products or variants.

Include a `if __name__ == "__main__":` demo block that exercises each function.

After generating the file, verify it loads:

```bash
python3 -c "import importlib.util; spec = importlib.util.spec_from_file_location('pc', 'pricing-calculation.py'); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); print(f'Loaded {len(mod.get_products())} products')"
```

**IMPORTANT**: The function implementations MUST be derived from the actual data in `products-and-pricing/`. Do NOT invent sample prices. Parse the files, extract SKUs, prices, discount tiers, and lead times, and embed them as data structures within the generated Python file.

### Step 3: Create the RFQ Web Form

Use the **public-website** skill to create a web form for customers to submit quote requests. Follow the public-website skill's architecture (React 18 + MUI via CDN, Python API endpoints).

1. Create the directory structure:

```bash
mkdir -p web/css web/js web/images
mkdir -p api
```

2. Create `web/index.html` -- a React 18 + MUI form page. Include "Music Parts GmbH" in the AppBar. The form must contain:
   - Company name (required)
   - Contact person name (required)
   - Email address (required)
   - Phone number (optional)
   - A line-items table where each row has:
     - Product/SKU (dropdown or autocomplete populated from the `/web/{project}/api/products` endpoint)
     - Variant (dropdown, populated based on selected product, if applicable)
     - Quantity (number input)
     - Special requirements (text, optional)
     - Add/remove row buttons
   - Requested delivery date (date picker, optional)
   - Additional notes (textarea, optional)
   - Submit button

   On submit, POST to `/web/{project}/api/submit-rfq`. Show a success confirmation with the RFQ reference number.

3. Create `api/products.py` -- returns the product catalog for the form dropdowns:

```python
import importlib.util
import os

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def get(request=None):
    spec = importlib.util.spec_from_file_location(
        "pc", os.path.join(DATA_DIR, "pricing-calculation.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {"products": mod.get_products()}
```

4. Create `api/submit-rfq.py` -- validates and writes the RFQ as a JSON file to `request-for-quote/`:

```python
import json
import os
from datetime import datetime

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def post(request):
    data = request.get_json(silent=True) or {}

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    company = (data.get("company_name") or "unknown").replace(" ", "-").lower()[:30]
    filename = f"rfq-{timestamp}-{company}.json"

    rfq_dir = os.path.join(DATA_DIR, "request-for-quote")
    os.makedirs(rfq_dir, exist_ok=True)

    rfq = {
        "source": "web_form",
        "received_at": datetime.now().isoformat(),
        "company_name": data.get("company_name"),
        "contact_person": data.get("contact_person"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "line_items": data.get("line_items", []),
        "requested_delivery_date": data.get("requested_delivery_date"),
        "notes": data.get("notes")
    }

    filepath = os.path.join(rfq_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(rfq, f, indent=2, ensure_ascii=False)

    return {"success": True, "message": "Quote request received", "reference": filename}
```

### Step 4: Create Prompts via API

Create two prompts that will be used as rule actions. Replace `{project}` with the actual project name.

**Prompt 1 -- Process RFQ from File:**

```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8

{
  "title": "DraftQuotes: Process RFQ File",
  "content": "A new RFQ file was created in the request-for-quote directory. You must process it and draft a quote email.\n\nSteps:\n1. Extract the file path from the 'File:' line above.\n2. Read the JSON file from that path. Expected fields: source, company_name, contact_person, email, phone, line_items (array of {sku, quantity, variant}), requested_delivery_date, notes.\n3. If no line items can be identified, stop and report: 'Could not identify any products in <filename>. No quote drafted.'\n4. For each line item, search the info-pdfs/ directory for PDFs matching the product name or SKU (case-insensitive filename match). If found, convert to text using markitdown and extract relevant specifications.\n5. Run the pricing calculation:\n   python3 -c \"\nimport json, importlib.util, sys\nspec = importlib.util.spec_from_file_location('pc', '/workspace/{project}/pricing-calculation.py')\nmod = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(mod)\nline_items = json.loads(sys.argv[1])\nresult = mod.compute_order(line_items)\nprint(json.dumps(result, indent=2))\n   \" '<LINE_ITEMS_JSON>'\n   Replace <LINE_ITEMS_JSON> with the JSON-encoded line_items array.\n6. Check delivery feasibility: for each line item, call get_production_weeks(sku, variant). Add weeks to today's date. If the customer provided a requested_delivery_date and estimated completion exceeds it, flag a MISMATCH warning.\n7. Build both a plain text and an HTML version of the quote email:\n   - Greeting addressing the contact person by name\n   - Thank them for their interest\n   - An HTML pricing table with columns: Product | SKU | Variant | Qty | Unit Price | Line Total\n   - Subtotal, Delivery, VAT, and Total rows\n   - Delivery section with production lead times per product\n   - If delivery date MISMATCH: include a highlighted warning box for the reviewer\n   - List any matched PDFs from info-pdfs/ as supporting documents\n   - Professional closing signed as Music Parts GmbH\n   - Include the customer's email address prominently so the reviewer can forward after review\n8. Send the draft via the email_send MCP tool:\n   - project_name: {project}\n   - recipient: ralph.navasardyan@e-ntegration.de\n   - subject: DRAFT QUOTE: <company_name> - <rfq_filename>\n   - body: plain text version of the quote\n   - html: HTML version of the quote with styled pricing table\n   - attachments: any relevant PDFs from info-pdfs/\n9. If email sending fails, save the HTML draft as draft-<timestamp>.html in request-for-quote/ and report the path.\n10. Confirm the quote draft was sent for review."
}
```

Save the returned `prompt.id` as `promptId1`.

**Prompt 2 -- Process RFQ from Email:**

```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8

{
  "title": "DraftQuotes: Process RFQ Email",
  "content": "An email was received that appears to be a quote request. You must extract the RFQ details, process pricing, and draft a quote email.\n\nSteps:\n1. Parse the email content from the headers above (From, Subject, Body, Attachments).\n2. Extract quote request details:\n   - Company name and contact person from the From field, email signature, or body\n   - Reply email address from the From field\n   - Products/SKUs and quantities from the email body\n   - Any delivery date requests or special requirements\n3. If no products can be identified from the email, draft a polite clarification reply and send it to ralph.navasardyan@e-ntegration.de with subject 'DRAFT REPLY: <sender> - Need more details' for the reviewer to forward. Stop here.\n4. Save the extracted RFQ as a JSON record:\n   python3 -c \"\nimport json, os\nfrom datetime import datetime\nrfq = {\n    'source': 'email',\n    'received_at': datetime.now().isoformat(),\n    'company_name': '<extracted_company>',\n    'contact_person': '<extracted_name>',\n    'email': '<sender_email>',\n    'line_items': [{'sku': '<sku>', 'quantity': <qty>, 'variant': None}],\n    'requested_delivery_date': '<date_or_null>',\n    'notes': '<additional_context>',\n    'original_subject': '<email_subject>'\n}\nts = datetime.now().strftime('%Y-%m-%d_%H%M%S')\ncompany = (rfq['company_name'] or 'unknown').replace(' ', '-').lower()[:30]\nfpath = f'/workspace/{project}/request-for-quote/email-{ts}-{company}.json'\nos.makedirs(os.path.dirname(fpath), exist_ok=True)\nwith open(fpath, 'w') as f:\n    json.dump(rfq, f, indent=2, ensure_ascii=False)\nprint(f'Saved: {fpath}')\n   \"\n5. Search info-pdfs/ for matching product PDFs, convert to text using markitdown if found.\n6. Run the pricing calculation (same as file-based prompt).\n7. Check delivery feasibility (same as file-based prompt).\n8. Build both plain text and HTML versions of the quote email draft (same format as file-based prompt). Include a reference to the original email subject.\n9. Send the draft via email_send MCP tool:\n   - project_name: {project}\n   - recipient: ralph.navasardyan@e-ntegration.de\n   - subject: DRAFT QUOTE: <company_name> - Email from <sender>\n   - body: plain text version\n   - html: HTML version with styled pricing table\n   - attachments: any relevant PDFs from info-pdfs/\n10. If email sending fails, save as draft-<timestamp>.html in request-for-quote/ and report the path.\n11. Confirm the quote draft was sent for review."
}
```

Save the returned `prompt.id` as `promptId2`.

### Step 5: Create Rules via API

Create two rules referencing the prompt IDs from Step 4. Replace `{project}` with the actual project name and `<promptIdN>` with the actual prompt IDs.

**Rule 1 -- File Created in request-for-quote/:**

```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8

{
  "name": "DraftQuotes: RFQ File Created",
  "enabled": true,
  "condition": {
    "type": "simple",
    "event": {
      "group": "Filesystem",
      "name": "File Created",
      "payload.path": "*/request-for-quote/*"
    }
  },
  "action": {
    "type": "prompt",
    "promptId": "<promptId1>"
  }
}
```

**Rule 2 -- Email Received about quotes:**

```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8

{
  "name": "DraftQuotes: RFQ Email Received",
  "enabled": true,
  "condition": {
    "type": "email-semantic",
    "criteria": "Email requests a quote, asks for pricing, inquires about product prices, or contains phrases like quote, RFQ, request for quote, pricing inquiry, or price request"
  },
  "action": {
    "type": "prompt",
    "promptId": "<promptId2>"
  }
}
```

### Step 6: Process Existing RFQ Files

After creating the rules, scan the `request-for-quote/` directory for any JSON files already present. For each file found, process it by following the Quote Preparation Workflow below. This ensures RFQs submitted before initialization are handled immediately.

### Step 7: Confirm Setup

After all prompts, rules, web form, and pricing module are created, briefly inform the user that the draft quotes system has been initialized:
- The web form URL: `/web/{project}/`
- Incoming emails about quotes will be processed automatically
- Quote drafts will be sent to ralph.navasardyan@e-ntegration.de for review

Then proceed to handle the user's original request.

---

## Quote Preparation Workflow

This workflow runs automatically when triggered by a rule, but can also be invoked manually when the user asks to process a specific RFQ or to "create a quote for \<filename\>".

### Step 1: Parse the Request

- **From file trigger**: Read the JSON file path from the event context (`File:` line). Load and parse the JSON.
- **From email trigger**: Parse the email headers and body from the event context. Extract company, contact, products/quantities, delivery date, and notes.
- **Manual invocation**: Read the specified file from `request-for-quote/`.

Required fields:

| Field | Required |
|---|---|
| Contact email | Yes |
| Contact name | Yes |
| Company name | No |
| Products + quantities | Yes |
| Requested delivery date | No |

If no products can be identified, stop and report: `"Could not identify any products in <filename>. No quote drafted."`

### Step 2: Search Product Documentation

For each requested product/SKU, search `info-pdfs/` for matching documents:

1. List all PDF files in `info-pdfs/`.
2. Match filenames case-insensitively against product names or SKUs.
3. For matched PDFs, convert to text using markitdown:

```bash
python3 -c "
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert('/workspace/{project}/info-pdfs/<filename>.pdf')
print(result.text_content)
"
```

4. Extract relevant product specifications to include in the quote.

If `info-pdfs/` is missing or empty, skip this step and continue.

### Step 3: Compute Pricing

Execute the pricing module:

```bash
python3 -c "
import json, importlib.util, sys
spec = importlib.util.spec_from_file_location('pc', '/workspace/{project}/pricing-calculation.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
line_items = json.loads(sys.argv[1])
result = mod.compute_order(line_items)
print(json.dumps(result, indent=2))
" '[{"sku":"<SKU>","quantity":<QTY>,"variant":"<VARIANT_OR_NULL>"}]'
```

The result includes `line_items`, `subtotal`, `delivery`, `vat`, `total`, `currency`, `estimated_production_weeks`, and `warnings`.

### Step 4: Check Delivery Feasibility

1. For each line item, call `get_production_weeks(sku, variant)`.
2. Add production weeks to today's date to get estimated completion.
3. If the customer provided a `requested_delivery_date`, compare. If `estimated_completion > requested_delivery`, flag a MISMATCH.

If no requested delivery date was provided, skip this check.

### Step 5: Build the Quote Email Draft

Build both a **plain text** body and an **HTML** body.

**HTML version** -- a professional email with:

1. **Greeting** -- Address customer by name.
2. **Introduction** -- Thank them for their request.
3. **Pricing Table** -- A styled HTML table:

```html
<table style="border-collapse: collapse; width: 100%;">
  <thead>
    <tr style="background-color: #1976d2; color: white;">
      <th style="padding: 8px; text-align: left;">Product</th>
      <th style="padding: 8px; text-align: left;">SKU</th>
      <th style="padding: 8px; text-align: left;">Variant</th>
      <th style="padding: 8px; text-align: right;">Qty</th>
      <th style="padding: 8px; text-align: right;">Unit Price</th>
      <th style="padding: 8px; text-align: right;">Total</th>
    </tr>
  </thead>
  <tbody>
    <!-- line items -->
    <tr style="border-top: 2px solid #1976d2;">
      <td colspan="5" style="padding: 8px; text-align: right;"><strong>Subtotal</strong></td>
      <td style="padding: 8px; text-align: right;">$XX.XX</td>
    </tr>
    <tr>
      <td colspan="5" style="padding: 8px; text-align: right;">Delivery</td>
      <td style="padding: 8px; text-align: right;">$XX.XX</td>
    </tr>
    <tr>
      <td colspan="5" style="padding: 8px; text-align: right;">VAT</td>
      <td style="padding: 8px; text-align: right;">$XX.XX</td>
    </tr>
    <tr style="background-color: #f5f5f5;">
      <td colspan="5" style="padding: 8px; text-align: right;"><strong>Total</strong></td>
      <td style="padding: 8px; text-align: right;"><strong>$XX.XX</strong></td>
    </tr>
  </tbody>
</table>
```

4. **Delivery Section** -- State production lead times per product.

5. **Delivery Warning** *(if MISMATCH detected)* -- A highlighted warning box:

```html
<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; margin: 16px 0;">
  <strong>REVIEWER NOTE:</strong> Customer requested delivery by <date>.
  Estimated production completes <calculated date> — <strong>MISMATCH</strong>.
  Please confirm with customer before forwarding.
</div>
```

6. **Supporting Documents** -- List any matched PDFs from `info-pdfs/`.
7. **Customer Email** -- Display prominently so the reviewer can forward after review.
8. **Closing** -- Professional sign-off as Music Parts GmbH.

**Plain text version** -- Same content formatted as plain text with ASCII tables.

### Step 6: Send Draft to Sales Reviewer

Use the `email_send` MCP tool:

| Field | Value |
|---|---|
| **project_name** | `{project}` |
| **recipient** | `ralph.navasardyan@e-ntegration.de` |
| **subject** | `DRAFT QUOTE: <company_name> - <rfq_reference>` |
| **body** | Plain text version of the quote |
| **html** | HTML version of the quote (see Step 5) |
| **attachments** | Relevant PDFs from `info-pdfs/` (if any) |

If email sending fails, save the HTML draft as `draft-<timestamp>.html` in `request-for-quote/` and report the file path.

---

## API Reference

### Create Prompt
```
POST /api/prompts/{project}
Content-Type: application/json; charset=utf-8
Body: { title: string, content: string }
Response: { success: boolean, prompt: { id: string, title: string, content: string, createdAt: string, updatedAt: string } }
```

### List Rules (for idempotency check)
```
GET /api/rules/{project}
Response: { success: boolean, count: number, rules: EventRule[] }
```

### Create Rule
```
POST /api/rules/{project}
Content-Type: application/json; charset=utf-8
Body: { name: string, enabled: boolean, condition: EventCondition, action: RuleAction }
Response: { success: boolean, rule: { id: string, name: string, enabled: boolean, condition: EventCondition, action: RuleAction, createdAt: string, updatedAt: string } }
```

## MCP Tools Reference

### email_send
Send an email for the project using SMTP. Supports HTML body and file attachments.
- `project_name` (string, required): The project name (directory name in workspace)
- `recipient` (string, required): Email recipient address
- `subject` (string, required): Email subject
- `body` (string, required): Email body in plain text (fallback for clients that do not render HTML)
- `html` (string, optional): HTML body. When provided, sent as the rich-text version alongside the plain text body.
- `attachments` (array of strings, optional): File paths relative to project directory to attach

### email_check_inbox
Check the email inbox and extract contents to the project's `emails/received` directory.
- `project_name` (string, required): The project name
- `subject` (string, optional): Case-insensitive subject prefix filter
- `newer_than_date` (string, optional): ISO date string; only process emails newer than this date

## Example Interactions

### Example 1: First Message (Auto-initialization)

**User**: "I want to set up automated quoting for our product catalog."

**Agent** (detects rules are missing -> silently runs initialization Steps 1-7 -> then responds):

"I've set up the automated quoting system for your project:

- **Web form** for customer RFQ submissions: `/web/{project}/`
- **Email monitoring** for incoming quote requests
- **Pricing module** generated from your product catalog (12 products loaded)
- **Draft quotes** will be emailed to ralph.navasardyan@e-ntegration.de for review

Customers can submit requests through the web form or by sending an email. Each request will be automatically priced and a draft quote sent to you for approval."

### Example 2: Manual Quote Request

**User**: "Can you prepare a quote for ACME Corp? They need 500 units of SKU-A100 and 200 units of SKU-B250. Their contact is John Smith, john@acme.com."

**Agent** (rules exist, processes manually):

"I've prepared and sent a draft quote for ACME Corp:

| Product | SKU | Qty | Unit Price | Total |
|---------|-----|-----|-----------|-------|
| Widget A | SKU-A100 | 500 | $12.50 | $6,250.00 |
| Bracket B | SKU-B250 | 200 | $8.75 | $1,750.00 |
| | | | **Subtotal** | **$8,000.00** |

Estimated delivery: 4 weeks.

The draft has been sent to ralph.navasardyan@e-ntegration.de for review. Customer email (john@acme.com) is included in the draft for forwarding."

### Example 3: Web Form RFQ (Automated)

A customer submits an RFQ through the web form at `/web/{project}/`. The API endpoint writes `request-for-quote/rfq-2026-02-18_143022-acme-corp.json`. The file watcher triggers the "DraftQuotes: RFQ File Created" rule, and the agent:

1. Reads the JSON file
2. Searches `info-pdfs/` for product documentation
3. Runs `pricing-calculation.py`
4. Checks delivery feasibility
5. Builds and sends the HTML quote draft to ralph.navasardyan@e-ntegration.de

### Example 4: Email RFQ (Automated)

An email arrives with subject "Request for Quote - Custom brackets" from customer@example.com. The email-semantic rule "DraftQuotes: RFQ Email Received" triggers. The agent:

1. Parses the email content (From, Subject, Body)
2. Extracts product requests and quantities
3. Saves a JSON record to `request-for-quote/`
4. Runs pricing and drafts a quote
5. Sends the draft to ralph.navasardyan@e-ntegration.de

### Example 5: Insufficient Email Details

An email arrives: "Hi, we're interested in your products. Can you send pricing?" with no specific products or quantities.

The agent recognizes insufficient detail and drafts a polite clarification response, sending it to ralph.navasardyan@e-ntegration.de with subject "DRAFT REPLY: \<sender\> - Need more details" for the reviewer to forward.

## Error Handling

- **Missing `products-and-pricing/` directory**: Initialization stops and the user is informed that product definitions are required before the quoting system can be set up.
- **Unknown SKU in RFQ**: The pricing calculation raises a `ValueError`. Log a warning, skip the item, and include a note in the draft that the item could not be priced.
- **Empty line items**: If an RFQ contains no identifiable products, report `"Could not identify any products in <filename>. No quote drafted."` For email RFQs, draft a clarification reply instead.
- **`pricing-calculation.py` fails**: Send an error notification to the reviewer email explaining which RFQ could not be processed and why.
- **markitdown not installed**: If the `markitdown` import fails, install it with `pip3 install markitdown` and retry.
- **`info-pdfs/` missing or empty**: Skip PDF lookup and continue. Note in the draft that detailed specifications can be provided upon request.
- **Missing requested delivery date**: Skip delivery feasibility check. No warning needed.
- **Email sending failure**: Save the HTML draft as `draft-<timestamp>.html` in `request-for-quote/` and report the file path to the user.

## File Layout Reference

```
workspace/{project}/
+-- products-and-pricing/          # Product definitions (user-provided)
|   +-- <product-definitions>.*
+-- pricing-calculation.py         # Generated pricing module (Setup Step 2)
+-- request-for-quote/             # Incoming RFQs (JSON files)
|   +-- rfq-<timestamp>-<company>.json
|   +-- email-<timestamp>-<company>.json
|   +-- draft-<timestamp>.html     # Fallback if email fails
+-- info-pdfs/                     # Product brochures/specs (optional)
+-- web/                           # Public website (Setup Step 3)
|   +-- index.html
|   +-- css/
|   +-- js/
|   +-- images/
+-- api/                           # API endpoints (Setup Step 3)
    +-- products.py
    +-- submit-rfq.py
```

## Notes

- The file watcher emits `payload.path` as workspace-relative paths (e.g., `projectname/request-for-quote/rfq.json`). The wildcard pattern `*/request-for-quote/*` matches this format correctly.
- The `request-for-quote/` directory MUST be at the project root, NOT under `out/`. The file watcher ignores `**/out/**` paths.
- When a rule fires for a Filesystem event, the system prepends `Event: {event name}` and `File: {path relative to project}` to the prompt content. The file path is already relative to the project root (e.g., `request-for-quote/rfq-2026-02-18.json`), so use it directly.
- When a rule fires for an Email event, the system prepends the full email content including From, To, Subject, Important, Attachments, and Body fields to the prompt content.
- The `email-semantic` condition type uses an LLM to evaluate whether an incoming email matches the natural language criteria. It does not require exact keyword matching.
- The `email_send` tool supports both plain text (`body`) and HTML (`html`) bodies. Always provide both: `body` as fallback, `html` for rich formatting.
- The `pricing-calculation.py` file should be regenerated whenever `products-and-pricing/` is updated. Inform the user of this during setup.
- Always use `charset=utf-8` in the Content-Type header when making API calls to ensure proper encoding of non-ASCII characters.
- Initialization is idempotent -- always check for existing rules before creating duplicates.
- The reviewer email (`ralph.navasardyan@e-ntegration.de`) receives all draft quotes. The final email to the customer is sent manually by the sales reviewer after approval.
- Company name "Music Parts GmbH" is used in the web form AppBar and email closing.
