import React from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Divider,
  Paper,
  Stack,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';

const WebHooksTab = ({
  selectedProject,
  copySuccess,
  onCopyWebhookUrl
}) => {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: '20px', display: 'block' }}>
        POST data/files to this project from external systems. In the base version the endpoint is open, adding header authentication is recommended.
      </Typography>

      {/* Webhook JSON Format Documentation */}
      <Accordion defaultExpanded={false} sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>
            Webhook JSON Format
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Dedicated Webhook Endpoint (Recommended)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                POST any JSON payload directly - it will be automatically wrapped as a Webhook event:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                <Box sx={{ color: 'text.secondary', mb: 0.5 }}>POST /api/events/{selectedProject}/webhook</Box>
                {`{
  "command": "remove",
  "itemName": "myfile.abc",
  "priority": "high"
}`}
              </Paper>
              <Alert severity="info" sx={{ mt: 1, py: 0.5, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                Match fields using <code>payload.command:remove</code> or <code>payload.priority:high</code>
              </Alert>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                General Event Endpoint
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                POST a structured event with explicit group and name:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                <Box sx={{ color: 'text.secondary', mb: 0.5 }}>POST /api/events/{selectedProject}</Box>
                {`{
  "name": "Custom Event",
  "group": "Webhook",
  "source": "external-system",
  "payload": {
    "command": "remove",
    "itemName": "myfile.abc"
  }
}`}
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Prompt Context Injection
              </Typography>
              <Typography variant="body2" color="text.secondary">
                When a Webhook event triggers a rule, the full JSON payload is prepended to your action prompt:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem', mt: 1 }}>
                {`The agent received this information via webhook:
{
  "command": "remove",
  "itemName": "myfile.abc"
}

---

[Your prompt template content here]`}
              </Paper>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Webhook File Upload Format Documentation */}
      <Accordion defaultExpanded={false} sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>
            Webhook File Upload Format
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Multipart Form Data with Files
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Upload files along with JSON metadata using <code>multipart/form-data</code>:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                <Box sx={{ color: 'text.secondary', mb: 0.5 }}>POST /api/events/{selectedProject}/webhook</Box>
                <Box sx={{ color: 'text.secondary', mb: 0.5 }}>Content-Type: multipart/form-data</Box>
                {`
--boundary
Content-Disposition: form-data; name="description"

{"command": "process", "type": "images"}
--boundary
Content-Disposition: form-data; name="file"; filename="image.jpg"
Content-Type: image/jpeg

[binary file data]
--boundary--`}
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                cURL Example
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {`curl -X POST http://localhost:6060/api/events/${selectedProject}/webhook \\
  -F 'description={"command": "analyze", "priority": "high"}' \\
  -F 'file1=@/path/to/document.pdf' \\
  -F 'file2=@/path/to/image.png'`}
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                File Storage Location
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Uploaded files are saved to the project's <code>webhook/</code> directory, overwriting any existing files with the same name:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.75rem', mt: 1 }}>
                {`workspace/${selectedProject}/webhook/
├── document.pdf
├── image.png
└── ...`}
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Resulting Event Payload
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The event payload combines your JSON description with file metadata:
              </Typography>
              <Paper sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem', mt: 1 }}>
                {`{
  "command": "analyze",
  "priority": "high",
  "files": ["document.pdf", "image.png"],
  "fileCount": 2,
  "webhookDir": "webhook/"
}`}
              </Paper>
              <Alert severity="info" sx={{ mt: 1, py: 0.5, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                Match files using <code>payload.fileCount:2</code> or check for specific files in your prompt
              </Alert>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Webhook URL Display */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Webhook URL
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            fullWidth
            value={`http://localhost:6060/api/events/${selectedProject}/webhook`}
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'monospace', fontSize: '0.75rem' }
            }}
            size="small"
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
            onClick={onCopyWebhookUrl}
            sx={{ textTransform: 'none', minWidth: 80, fontSize: '0.75rem' }}
          >
            {copySuccess ? 'Copied!' : 'Copy'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default WebHooksTab;
