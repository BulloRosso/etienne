import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Divider,
  Card,
  CardContent,
  Paper,
  Stack,
  Alert
} from '@mui/material';

const ExamplesTab = () => {
  return (
    <Box>
      <Stack spacing={3}>
        {/* Simple Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="Simple" color="primary" size="small" />
              Simple Condition
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Use simple conditions for exact matching of event properties. Perfect for straightforward triggers like "when a Python file is created" or "when a specific MQTT topic receives a message".
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Example: Monitor Python file creation
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "simple",
  "event": {
    "group": "Filesystem",
    "name": "File Created",
    "payload.path": "*.py"
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              Simple conditions support wildcard matching with * in string values
            </Alert>
          </CardContent>
        </Card>

        {/* Semantic Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="Semantic" color="secondary" size="small" />
              Semantic Condition
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Use semantic conditions for AI-powered similarity matching. Great for finding related content or detecting semantically similar events even when exact wording differs.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Example: Find authentication-related code changes
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "semantic",
  "event": {
    "group": "Filesystem",
    "payload": {
      "similarity": {
        "query": "user authentication and login security",
        "threshold": 0.86
      }
    }
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              Semantic matching uses vector embeddings with a default threshold of 0.86
            </Alert>
          </CardContent>
        </Card>

        {/* Compound Condition Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="Compound" color="warning" size="small" />
              Compound Condition
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Use compound conditions to combine multiple conditions with logical operators (AND, OR, NOT). Ideal for complex scenarios requiring multiple criteria.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Example: Monitor test file changes AND config changes
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "compound",
  "operator": "AND",
  "conditions": [
    {
      "type": "simple",
      "event": { "group": "Filesystem", "name": "File Modified" }
    },
    {
      "type": "simple",
      "event": { "payload.path": "*/test/*" }
    }
  ],
  "timeWindow": 300000
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              Compound conditions support AND, OR, and NOT operators with optional time windows (in milliseconds)
            </Alert>
          </CardContent>
        </Card>

        {/* Temporal Constraint Example */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="Temporal" color="success" size="small" />
              Temporal Constraint
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Use temporal constraints to filter events by time of day or day of week. Perfect for business hours monitoring or scheduled maintenance windows.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Example: Monitor during business hours only
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {`{
  "type": "temporal",
  "time": {
    "after": "09:00",
    "before": "17:00",
    "dayOfWeek": [1, 2, 3, 4, 5]
  }
}`}
            </Paper>
            <Alert severity="info" sx={{ mt: 2 }}>
              Day of week: 0=Sunday, 1=Monday, ..., 6=Saturday. Times use 24-hour format (HH:MM)
            </Alert>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default ExamplesTab;
