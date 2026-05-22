import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  IconButton,
  Divider,
  Chip,
  Stack,
} from '@mui/material';
import { Close, LockOutlined } from '@mui/icons-material';

/**
 * Explains what the package lockfile is, why it exists, and how it differs
 * from the manifest. Reached via the (i) button in the BuildPane header.
 *
 * Plain-English on purpose — the user is composing agent packages, not
 * building npm projects, so it avoids dependency-manager jargon.
 */
export default function LockfileInfoDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LockOutlined color="primary" />
        <Box sx={{ flex: 1 }}>What is a lockfile?</Box>
        <IconButton size="small" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          When you compose a package, two artifacts get produced:
        </Typography>

        <Stack spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip size="small" label="manifest" color="primary" variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                what you picked
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Your intent — the application type, the skills you ticked, the MCP servers,
              the mission brief. Human-editable. If you save the package as a profile, this
              is what gets stored.
            </Typography>
          </Box>

          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip size="small" label="lockfile" color="primary" />
              <Typography variant="caption" color="text.secondary">
                what's actually getting built
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              The full resolved set after we walk dependencies. For example, an application
              type might bundle a subagent you didn't pick directly — the lockfile records
              it with the badge <em>via app type: …</em> so you can see why it's there.
              It also records the exact version of each skill and a content hash so the
              same lockfile always produces the same project.
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Why does this matter?
        </Typography>
        <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75 } }}>
          <li>
            <Typography variant="body2" color="text.secondary">
              <strong>Reproducibility.</strong> If you Build a zip today and Import it on
              another machine next month, you get the same agent — even if the skill
              catalog on the target has moved on.
            </Typography>
          </li>
          <li>
            <Typography variant="body2" color="text.secondary">
              <strong>Transparency.</strong> Items added by dependency resolution show
              their <em>provenance</em> in the middle pane. You can see what's yours and
              what was pulled in automatically.
            </Typography>
          </li>
          <li>
            <Typography variant="body2" color="text.secondary">
              <strong>Validation.</strong> Conflicts (duplicate names, missing application
              type, unbound MCP secrets) are detected here, before you Build or Deploy.
            </Typography>
          </li>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          Both files are written into the zip as <code>package.manifest.json</code> and{' '}
          <code>package.lock.json</code>. On Import, the lockfile is preserved verbatim —
          we don't re-resolve at the destination.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
}
