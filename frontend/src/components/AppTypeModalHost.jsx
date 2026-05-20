import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import useAppTypeModalStore from '../stores/useAppTypeModalStore';
import McpAppRenderer from './McpAppRenderer';

export default function AppTypeModalHost() {
  const { open, payload, project, title, closeModal } = useAppTypeModalStore();

  if (!open || !payload) return null;

  const dialogProps = payload.dialog || {};
  const mcpGroup = payload.mcpGroup;
  const resourceUri = payload.resourceUri;
  const toolName = payload.toolName || 'render';

  return (
    <Dialog
      open={open}
      onClose={closeModal}
      maxWidth={dialogProps.maxWidth || 'lg'}
      fullWidth={dialogProps.fullWidth !== false}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {title || 'Application'}
        <IconButton
          onClick={closeModal}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {mcpGroup && resourceUri ? (
          <McpAppRenderer
            mcpGroup={mcpGroup}
            toolName={toolName}
            resourceUri={resourceUri}
            toolInput={{ project_name: project }}
            hostContext={{ project }}
          />
        ) : (
          <Box sx={{ p: 2, color: 'text.secondary' }}>
            Modal payload is missing mcpGroup or resourceUri.
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
