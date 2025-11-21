import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Link,
  Divider
} from '@mui/material';
import { Email, Security, Settings, Info } from '@mui/icons-material';

export default function EmailConfiguration() {
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      

      <Alert severity="info" sx={{ mb: 3 }}>
        Email functionality is configured globally and applies to all projects in the workspace.
      </Alert>

      {/* Step 1: Connect MCP Server */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Settings sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Step 1: Connect MCP Demo Server
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The email tools (email_send and email_check_inbox) are provided by the MCP Demo Server running on the backend.
        </Typography>

        <Box sx={{ pl: 2, borderLeft: 3, borderColor: 'primary.main', bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
            <strong>Server Name:</strong> internetretrieval
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
            <strong>Transport:</strong> http
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
            <strong>URL:</strong> http://host.docker.internal:6060/mcp
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            <strong>Auth Token:</strong> test123
          </Typography>
        </Box>

        <Alert severity="success" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Configure this server in your project's <strong>MCP Server Configuration</strong> to enable email tools.
          </Typography>
        </Alert>
      </Paper>

      {/* Step 2: Configure SMTP/IMAP */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Email sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Step 2: Configure SMTP and IMAP
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Add the following configuration to your <code>backend/.env</code> file:
        </Typography>

        <Box sx={{ bgcolor: 'grey.900', color: 'grey.100', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
          <Typography component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`# SMTP Configuration (for sending emails)
# Format: host|port|secure|user|password
# Port 587 uses STARTTLS (secure=false)
SMTP_CONNECTION=mail.example.com|587|false|user@example.com|password

# IMAP Configuration (for receiving emails)
# Format: host|port|secure|user|password
# Port 993 uses direct SSL/TLS (secure=true)
IMAP_CONNECTION=mail.example.com|993|true|user@example.com|password`}
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Note:</strong> The backend uses the <code>emailjs</code> library for SMTP and <code>imap</code> + <code>mailparser</code> for IMAP.
          </Typography>
        </Alert>
      </Paper>

      {/* Step 3: Configure Whitelist */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Security sx={{ mr: 1, color: 'warning.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Step 3: Configure Recipient Whitelist
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          To prevent AI agents from sending emails to unauthorized recipients, configure a whitelist in <code>backend/.env</code>:
        </Typography>

        <Box sx={{ bgcolor: 'grey.900', color: 'grey.100', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
          <Typography component="pre" sx={{ m: 0 }}>
{`# SMTP Whitelist - comma-separated list of allowed recipients
# AI agents can ONLY send emails to these addresses
SMTP_WHITELIST=user1@example.com,user2@example.com,bot@example.com`}
          </Typography>
        </Box>

        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Security:</strong> Without a whitelist, AI agents can send emails to ANY recipient. Always configure this in production!
          </Typography>
        </Alert>
      </Paper>

      {/* Available Tools */}
      <Paper elevation={2} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Info sx={{ mr: 1, color: 'info.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Available Email Tools
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            email_send
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Send an email for the project using SMTP. Supports attachments from the project directory.
          </Typography>
          <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
            <Typography component="pre" sx={{ m: 0 }}>
{`Parameters:
  project_name: string    (required)
  recipient: string       (required, must be in whitelist)
  subject: string         (required)
  body: string           (required)
  attachments: string[]  (optional, relative paths from project dir)`}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            email_check_inbox
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Check email account for new emails and extract to workspace/&lt;project&gt;/emails/received
          </Typography>
          <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
            <Typography component="pre" sx={{ m: 0 }}>
{`Parameters:
  project_name: string       (required)
  subject: string           (optional, filter by subject)
  newer_than_date: string   (optional, ISO date string)`}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Footer */}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Email configuration requires backend restart to take effect.
        </Typography>
      </Box>
    </Box>
  );
}
