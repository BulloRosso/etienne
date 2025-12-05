import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { History as HistoryIcon } from '@mui/icons-material';

const EventLogTab = ({ eventLog, loadingEventLog, getGroupStyle }) => {
  if (loadingEventLog) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (eventLog.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5, opacity: 0.5 }} />
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No events logged yet
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Events that trigger rules will appear here
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell><strong>Timestamp</strong></TableCell>
            <TableCell><strong>Event Name</strong></TableCell>
            <TableCell><strong>Group</strong></TableCell>
            <TableCell><strong>Source</strong></TableCell>
            <TableCell><strong>Triggered Rules</strong></TableCell>
            <TableCell><strong>Payload</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {eventLog.map((entry, idx) => (
            <TableRow key={idx} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {new Date(entry.event.timestamp).toLocaleString()}
              </TableCell>
              <TableCell>{entry.event.name}</TableCell>
              <TableCell>
                {(() => {
                  const style = getGroupStyle(entry.event.group);
                  const GroupIcon = style.icon;
                  return (
                    <Chip
                      icon={<GroupIcon sx={{ fontSize: 14, color: `${style.color} !important` }} />}
                      label={entry.event.group}
                      size="small"
                      sx={{
                        bgcolor: style.bgColor,
                        color: style.color,
                        fontWeight: 500,
                        '& .MuiChip-icon': { ml: 0.5 }
                      }}
                    />
                  );
                })()}
              </TableCell>
              <TableCell>
                <Chip label={entry.event.source} size="small" variant="outlined" />
              </TableCell>
              <TableCell>
                <Chip
                  label={entry.triggeredRules.length}
                  size="small"
                  color={entry.triggeredRules.length > 0 ? 'success' : 'default'}
                />
              </TableCell>
              <TableCell>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    maxWidth: 300,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {JSON.stringify(entry.event.payload)}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default EventLogTab;
