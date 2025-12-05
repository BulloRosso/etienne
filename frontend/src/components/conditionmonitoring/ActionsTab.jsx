import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Menu,
  MenuItem
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { BiMessageEdit } from 'react-icons/bi';

const ActionsTab = ({
  prompts,
  onOpenPromptDialog,
  onDeletePrompt,
  promptMenuAnchor,
  setPromptMenuAnchor,
  selectedPromptForMenu,
  setSelectedPromptForMenu
}) => {
  return (
    <Box>
      {prompts.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="body2" sx={{ marginLeft: '20px' }} color="text.secondary">
            Manage reusable action templates for your rule actions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => onOpenPromptDialog()}
            sx={{ textTransform: 'none' }}
          >
            New Action
          </Button>
        </Box>
      )}

      {prompts.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <BiMessageEdit style={{ fontSize: 48, color: '#ccc', marginBottom: 12, opacity: 0.5 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No actions defined
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Create reusable action templates to use in your rules
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => onOpenPromptDialog()}
            sx={{ textTransform: 'none' }}
          >
            Create First Action
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.paper' }}>
                  <TableCell sx={{ width: 50 }}></TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Prompt</TableCell>
                  <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {prompts.map((prompt, idx) => (
                  <TableRow
                    key={prompt.id}
                    sx={{
                      bgcolor: idx % 2 === 0 ? 'transparent' : 'grey.50',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <TableCell sx={{ textAlign: 'center' }}>
                      <BiMessageEdit style={{ fontSize: 20, color: '#757575' }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {prompt.title}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {prompt.content.substring(0, 120)}{prompt.content.length > 120 ? '...' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setPromptMenuAnchor(e.currentTarget);
                          setSelectedPromptForMenu(prompt);
                        }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Menu
            anchorEl={promptMenuAnchor}
            open={Boolean(promptMenuAnchor)}
            onClose={() => {
              setPromptMenuAnchor(null);
              setSelectedPromptForMenu(null);
            }}
          >
            <MenuItem
              onClick={() => {
                onOpenPromptDialog(selectedPromptForMenu);
                setPromptMenuAnchor(null);
                setSelectedPromptForMenu(null);
              }}
            >
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                onDeletePrompt(selectedPromptForMenu?.id);
                setPromptMenuAnchor(null);
                setSelectedPromptForMenu(null);
              }}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Delete
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  );
};

export default ActionsTab;
