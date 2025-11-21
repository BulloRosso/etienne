# EMail Connectivity

We need a new module email in backend/src/smtp-imap . It allows use to scan a imap inbox for new emails or send mails with smtp.

EMails are strongly connected to the current project in the workspace directory workspace/<project name>/ They can read documents from the project directory and attach them to emails. If we receive emails they can will write the attachments to the directory workspace/<project name>/emails/received

## Configuration in .env
We must insert one connection string for SMTP_CONNECTION and one for IMAP_CONNECTION. These Connection strings contain all the relevant parameters separated by pipe characters.

## Backend module
In the backend module we have one service for IMAP and one for SMTP. Use the most widely known npm packages to implement the functionality. We are provider agnostic.

We do not expose any API endpoints for email functionality.

## MCP Server Tool support
The model will use the email functions via these tools:

### email_send(project_name: str, recipient: str, subject: str, body: str, attachments: list[str])
Sends an email for the project using SMTP with required attributes recipien, subject and body. Optionally there can be a list of files with their relative path to the project directory which
should be indluded as attachments.

### email_check_inbox(project_name: str, subject: str, newer_than_date: isodate)
Checks the email account for new mails and extracts their contents to workspace/<project name>/emails/received:
* new directory per email named <iso date>-<sender from>-subject
* inside the directory the mail body as message.txt and all attachments
If there is the optional subject parameter provided we wil use this as a case-insensitive filter: only emails matchin the prefix will be processed

If there is the optional parameter newer_then_date is set then we must only process inbox elements newer than newer_than_date.

The function returns a response JSON like this:
```
{
   "new_mails_count": 2,
   "mails": [
    { "subject": "Hallo",
      "message": "bla bla",
      "sender": "ralph@bla.com",
      "attachment_count": 0
    }
   ]
}
```