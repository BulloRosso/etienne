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
import { useTranslation } from 'react-i18next';

const WebHooksTab = ({
  selectedProject,
  copySuccess,
  onCopyWebhookUrl
}) => {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: '20px', display: 'block' }}>
        {t('webHooksTab.description')}
      </Typography>

      {/* Webhook JSON Format Documentation */}
      <Accordion defaultExpanded={false} sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>
            {t('webHooksTab.jsonFormatTitle')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                {t('webHooksTab.dedicatedEndpoint')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('webHooksTab.dedicatedEndpointDesc')}
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
                <span dangerouslySetInnerHTML={{ __html: t('webHooksTab.matchFieldsAlert') }} />
              </Alert>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                {t('webHooksTab.generalEndpoint')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('webHooksTab.generalEndpointDesc')}
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
                {t('webHooksTab.promptContextInjection')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('webHooksTab.promptContextDesc')}
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
            {t('webHooksTab.fileUploadTitle')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                {t('webHooksTab.multipartFormData')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                <span dangerouslySetInnerHTML={{ __html: t('webHooksTab.multipartFormDataDesc') }} />
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
                {t('webHooksTab.curlExample')}
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
                {t('webHooksTab.fileStorageLocation')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <span dangerouslySetInnerHTML={{ __html: t('webHooksTab.fileStorageDesc') }} />
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
                {t('webHooksTab.resultingPayload')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('webHooksTab.resultingPayloadDesc')}
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
                <span dangerouslySetInnerHTML={{ __html: t('webHooksTab.matchFilesAlert') }} />
              </Alert>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Webhook URL Display */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {t('webHooksTab.webhookUrl')}
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
            {copySuccess ? t('common.copied') : t('common.copy')}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default WebHooksTab;
