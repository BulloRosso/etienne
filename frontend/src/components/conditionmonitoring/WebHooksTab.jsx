import React from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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
  ContentCopy as ContentCopyIcon,
  Send as SendIcon
} from '@mui/icons-material';

const WebHooksTab = ({
  selectedProject,
  eventGroups,
  getGroupStyle,
  webhookEventName,
  setWebhookEventName,
  webhookEventGroup,
  setWebhookEventGroup,
  webhookPayload,
  setWebhookPayload,
  webhookResponse,
  setWebhookResponse,
  copySuccess,
  onCopyWebhookUrl,
  onSendTestEvent
}) => {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        POST events to this project from external systems or test your rules manually
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
              <Paper sx={{ p: 1.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
              <Paper sx={{ p: 1.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
              <Paper sx={{ p: 1.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.8rem', mt: 1 }}>
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

      {/* Webhook URL Display */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Webhook URL
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            fullWidth
            value={`http://localhost:6060/api/events/${selectedProject}`}
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

      <Divider sx={{ mb: 2 }} />

      {/* Test Event Form */}
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Send Test Event
      </Typography>
      <Stack spacing={1.5}>
        <TextField
          label="Event Name"
          fullWidth
          value={webhookEventName}
          onChange={(e) => setWebhookEventName(e.target.value)}
          size="small"
          InputProps={{ sx: { fontSize: '0.85rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.85rem' } }}
        />
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '0.85rem' }}>Event Group</InputLabel>
          <Select
            value={webhookEventGroup}
            onChange={(e) => setWebhookEventGroup(e.target.value)}
            label="Event Group"
            sx={{ fontSize: '0.85rem' }}
            renderValue={(selected) => {
              const style = getGroupStyle(selected);
              const GroupIcon = style.icon;
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                  {selected}
                </Box>
              );
            }}
          >
            {eventGroups.map((group) => {
              const style = getGroupStyle(group);
              const GroupIcon = style.icon;
              return (
                <MenuItem key={group} value={group}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GroupIcon sx={{ fontSize: 16, color: style.color }} />
                    {group}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <TextField
          label="Payload (JSON)"
          fullWidth
          multiline
          rows={3}
          value={webhookPayload}
          onChange={(e) => setWebhookPayload(e.target.value)}
          placeholder='{"key": "value"}'
          size="small"
          InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          InputLabelProps={{ sx: { fontSize: '0.85rem' } }}
        />
        <Button
          variant="contained"
          size="small"
          startIcon={<SendIcon sx={{ fontSize: 16 }} />}
          onClick={onSendTestEvent}
          sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
        >
          Send Test Event
        </Button>

        {webhookResponse && (
          <Alert
            severity={webhookResponse.error ? 'error' : 'success'}
            onClose={() => setWebhookResponse(null)}
            sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}
          >
            {webhookResponse.error ? (
              <>Error: {webhookResponse.error}</>
            ) : (
              <>Success! Event ID: {webhookResponse.data?.event?.id}</>
            )}
          </Alert>
        )}
      </Stack>
    </Box>
  );
};

export default WebHooksTab;
