import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  Stack,
  Chip,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Close,
  CloudDownload,
  Upload,
  ContentCopy,
  CheckCircleOutline,
} from '@mui/icons-material';

/**
 * Shown after a successful Build. Tells the user what they got and how to
 * apply it on another instance — the artifact is portable, but only useful
 * if you know what to do with it.
 */
export default function BuildSuccessDialog({
  open,
  filename,
  manifest,
  lockfile,
  warnings = [],
  onClose,
  onImportElsewhere, // optional: lets the parent surface the Import button
}) {
  const [copied, setCopied] = useState(false);

  const counts = lockfile
    ? {
        skills: lockfile.items.filter((i) => i.kind === 'skill').length,
        subagents: lockfile.items.filter((i) => i.kind === 'subagent').length,
        mcp: lockfile.items.filter((i) => i.kind === 'mcp-server').length,
        appType: lockfile.items.find((i) => i.kind === 'application-type')?.name,
      }
    : { skills: 0, subagents: 0, mcp: 0, appType: null };

  const handleCopyCommand = async () => {
    const cmd =
      `curl -X POST -F "file=@${filename}" ` +
      `${window.location.origin.replace(/\/$/, '')}/api/packages/import`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircleOutline color="success" />
        <Box sx={{ flex: 1 }}>
          Package built
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {filename}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          What's in the zip
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2, gap: 0.5 }}>
          {counts.appType && (
            <Chip size="small" label={`App type: ${counts.appType}`} color="primary" />
          )}
          <Chip size="small" label={`${counts.skills} skill${counts.skills === 1 ? '' : 's'}`} />
          <Chip
            size="small"
            label={`${counts.subagents} subagent${counts.subagents === 1 ? '' : 's'}`}
          />
          <Chip size="small" label={`${counts.mcp} MCP server${counts.mcp === 1 ? '' : 's'}`} />
        </Stack>

        {warnings.length > 0 && (
          <>
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
              Build warnings:
            </Typography>
            <ul style={{ marginTop: 0, paddingLeft: 18 }}>
              {warnings.map((w, idx) => (
                <li key={idx}>
                  <Typography variant="caption">{w}</Typography>
                </li>
              ))}
            </ul>
          </>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Apply on another instance
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The zip carries a manifest, lockfile, and the full materialized project tree.
          On a different machine running this app, choose one of:
        </Typography>

        <Box component="ol" sx={{ pl: 2.5, m: 0, fontSize: '0.85rem' }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Import via UI</strong> — open the package composer there and use
            <em> Import package… </em> (briefcase menu) to upload this zip.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Import via curl</strong> — useful for headless servers:
            <Box
              sx={{
                mt: 0.5,
                p: 1,
                bgcolor: '#f5f5f5',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                position: 'relative',
                pr: 4,
              }}
            >
              {`curl -X POST -F "file=@${filename}" `}
              <em>BASE_URL</em>
              {`/api/packages/import`}
              <Tooltip title={copied ? 'Copied!' : 'Copy command'}>
                <IconButton
                  size="small"
                  onClick={handleCopyCommand}
                  sx={{ position: 'absolute', top: 4, right: 4 }}
                >
                  <ContentCopy sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </li>
          <li>
            <strong>Manual extract</strong> — unzip into <code>WORKSPACE_ROOT/{manifest?.name || '<name>'}/</code> on
            the target machine. The MCP session cache may need to be reset.
          </li>
        </Box>
      </DialogContent>

      <DialogActions>
        {onImportElsewhere && (
          <Button startIcon={<Upload />} onClick={onImportElsewhere}>
            Import another zip here
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={<CloudDownload />}
          onClick={onClose}
          autoFocus
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
