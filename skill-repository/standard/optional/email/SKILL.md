---
name: email
description: "Use this skill when the user wants to send or receive emails, check an inbox, email someone a report or file, or when discussing email-based communication. Provides guidance on using the email_send and email_check_inbox MCP tools, and explains how incoming emails arrive as events on the agent bus."
---

# Email Skill

Send and receive emails on behalf of the project using a dedicated email account. Emails are sent via SMTP and received via IMAP. Incoming emails are also monitored in real time by the IMAP Connector and published as events on the agent bus, enabling rule-based automation.

---

## Activation

This skill activates when the user expresses intent to work with email. Trigger phrases include:

- "send an email to ..."
- "email this report to ..."
- "check for new emails"
- "have we received any emails about ...?"
- "forward the results to ..."
- "notify them by email"
- "check my inbox"

---

## Available MCP Tools

### `email_send`

Send an email from the project's configured SMTP account.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_name` | string | yes | The project name (directory name in workspace) |
| `recipient` | string | yes | Email recipient address (must be on the SMTP whitelist) |
| `subject` | string | yes | Email subject line |
| `body` | string | yes | Plain text body — always provide this as a fallback for clients that do not render HTML |
| `html` | string | no | HTML body, sent as a rich-text alternative alongside the plain text |
| `attachments` | string[] | no | File paths relative to the project directory to attach |

**Returns:** `{ success, messageId, recipient, subject, attachmentCount }`

**Example call:**
```
email_send({
  project_name: "acme-corp",
  recipient: "alice@example.com",
  subject: "Monthly Report — March 2026",
  body: "Hi Alice,\n\nPlease find the monthly report attached.\n\nBest regards",
  attachments: ["out/report-march-2026.pdf"]
})
```

### `email_check_inbox`

Check the project's IMAP inbox for new (unseen) emails. Each retrieved email is saved to the project workspace for later reference.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_name` | string | yes | The project name |
| `subject` | string | no | Case-insensitive subject prefix filter — only emails whose subject starts with this value are returned |
| `newer_than_date` | string | no | ISO date string (e.g. `"2026-03-01"`) — only emails newer than this date are returned |

**Returns:** `{ new_mails_count, mails: [{ subject, message, sender, attachment_count, date }] }`

The `message` field is truncated to 200 characters. Full message text and attachments are saved to disk (see Email Storage below).

**Example call:**
```
email_check_inbox({
  project_name: "acme-corp",
  subject: "Invoice",
  newer_than_date: "2026-03-01"
})
```

---

## Event Bus Integration

When the **IMAP Connector** service is running, it monitors the inbox continuously via IMAP IDLE. Each incoming email is published as an event on the ZeroMQ agent bus:

```json
{
  "name": "Email Received",
  "group": "Email",
  "source": "IMAP Connector",
  "payload": {
    "From": "sender@example.com",
    "To": "bot@example.com",
    "Important": false,
    "Subject": "Project Update",
    "BodyText": "Here is the latest status...",
    "Attachments": ["status.pdf"]
  }
}
```

These events can trigger **rules** in the event-handling system. For example, a rule could automatically process invoices when an email with subject prefix "Invoice" arrives, or notify the user when an important email is received.

---

## Email Storage

Received emails (fetched via `email_check_inbox`) are saved to:

```
workspace/<project>/emails/received/<ISO_DATE>-<SENDER>-<SUBJECT>/
  message.txt        # Full plain-text body
  attachment1.pdf    # Any attachments
  attachment2.png
```

- **Sender** is sanitized (max 30 characters, special characters removed)
- **Subject** is sanitized (max 50 characters, non-alphanumeric characters removed)

When working with received emails, read the `message.txt` file for the full content — the tool return value only includes a 200-character preview.

---

## Best Practices

1. **Always provide a plain text `body`** even when sending HTML. Many email clients and corporate filters prefer or require plain text.

2. **Use `html` for rich formatting** when the content benefits from structure (tables, links, emphasis). The plain text body serves as the fallback.

3. **Recipient whitelist:** Only addresses listed in the `SMTP_WHITELIST` configuration can receive emails. If a send fails with a whitelist error, inform the user that the recipient needs to be added to the whitelist.

4. **Filter when checking inbox:** Use the `subject` and `newer_than_date` parameters to narrow results. Checking the entire inbox without filters may return a large number of emails.

5. **Attachment paths are project-relative.** For example, if the project is `acme-corp` and you want to attach `out/report.pdf`, pass `"out/report.pdf"` — not the full workspace path.

6. **Check before sending:** When the user asks to email a file, verify the file exists before calling `email_send`.

---

## Example Workflows

### Check inbox for specific emails

> **User:** "Have we received any invoices this month?"

1. Call `email_check_inbox` with `subject: "Invoice"` and `newer_than_date` set to the first day of the current month.
2. Summarize results: count, senders, subjects.
3. If the user wants details, read the `message.txt` files from the saved email directories.

### Send a report with attachments

> **User:** "Email the quarterly report to alice@example.com"

1. Verify the report file exists in the project directory.
2. Call `email_send` with the file path as an attachment.
3. Confirm success and report the message ID.

### Respond to an incoming email

> **User:** "Check for new emails and reply to the one from Bob"

1. Call `email_check_inbox` to fetch new emails.
2. Identify Bob's email from the results.
3. Read the full message from `emails/received/<dir>/message.txt`.
4. Draft a reply and call `email_send` with Bob's address as recipient, prefixing the subject with "Re: ".
