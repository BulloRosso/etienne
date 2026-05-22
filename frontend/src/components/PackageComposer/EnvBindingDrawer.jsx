import React, { useMemo, useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Stack,
  Alert,
  Divider,
  Chip,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import usePackageDraftStore from '../../stores/usePackageDraftStore';

/**
 * Right-side drawer for binding placeholder values on a single MCP server.
 *
 * Surface invariants:
 *   - We never edit secrets in this drawer for the zip-export path. The
 *     bound values become `envBindings` on the manifest entry, and the
 *     resolver decides on each resolve whether the placeholder is satisfied.
 *   - Inputs use the placeholder's inner key (e.g. ${env:GH_TOKEN} → GH_TOKEN).
 */
export default function EnvBindingDrawer({ open, serverName, onClose }) {
  const lockfile = usePackageDraftStore((s) => s.lockfile);
  const manifest = usePackageDraftStore((s) => s.manifest);
  const bindMcpEnv = usePackageDraftStore((s) => s.bindMcpEnv);
  const requestResolve = usePackageDraftStore((s) => s.requestResolve);

  const lockItem = useMemo(
    () =>
      lockfile?.items?.find((i) => i.kind === 'mcp-server' && i.name === serverName) || null,
    [lockfile, serverName],
  );
  const manifestEntry = useMemo(
    () => manifest.mcpServers.find((s) => s.name === serverName) || null,
    [manifest, serverName],
  );

  // Distinct list of inner keys derived from the resolver's placeholder list.
  const placeholders = useMemo(() => {
    if (!lockItem?.unboundPlaceholders) return [];
    const innerKeys = new Set();
    for (const token of lockItem.unboundPlaceholders) {
      const inner = token.slice(2, -1);
      const colonIdx = inner.indexOf(':');
      innerKeys.add(colonIdx >= 0 ? inner.slice(colonIdx + 1) : inner);
    }
    return [...innerKeys];
  }, [lockItem]);

  // Local edit buffer — committed to the store on Save so a half-typed value
  // doesn't trigger a resolve roundtrip on every keystroke.
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (open) {
      setDraft({ ...(manifestEntry?.envBindings || {}) });
    }
  }, [open, manifestEntry]);

  if (!serverName) return null;

  const handleSave = () => {
    for (const [key, value] of Object.entries(draft)) {
      if (value !== (manifestEntry?.envBindings?.[key] ?? '')) {
        bindMcpEnv(serverName, key, value);
      }
    }
    requestResolve();
    onClose();
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 380 } }}>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flex: 1, fontSize: '1rem' }}>
            Bind placeholders
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <Chip
          size="small"
          label={serverName}
          sx={{ alignSelf: 'flex-start', mb: 2, bgcolor: '#e3f2fd' }}
        />
        <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
          Placeholder values you enter here are written to the manifest's
          envBindings. For zip exports, values are saved verbatim — for live
          deploys, the materializer writes them into .mcp.json as-is.
        </Alert>

        {placeholders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No unbound placeholders.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {placeholders.map((key) => (
              <TextField
                key={key}
                size="small"
                label={key}
                value={draft[key] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            ))}
          </Stack>
        )}

        <Box sx={{ flex: 1 }} />
        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save bindings
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
