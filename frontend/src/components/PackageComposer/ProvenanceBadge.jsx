import React from 'react';
import { Chip, Tooltip } from '@mui/material';

/**
 * Renders a small chip describing why a lockfile item is in the manifest.
 *
 *   - { kind: 'user' }                            → no badge (user-selected)
 *   - { kind: 'application-type', name: 'foo' }  → "via app type: foo"
 *   - { kind: 'skill', name: 'foo' }             → "via skill: foo"
 */
export default function ProvenanceBadge({ provenance }) {
  if (!provenance || provenance.requestedBy?.kind === 'user') return null;
  const requester = provenance.requestedBy;
  const label =
    requester.kind === 'application-type'
      ? `via app type: ${requester.name}`
      : requester.kind === 'skill'
      ? `via skill: ${requester.name}`
      : `via ${requester.kind}`;
  return (
    <Tooltip title={provenance.reason || ''} arrow>
      <Chip
        size="small"
        label={label}
        sx={{ fontSize: '0.65rem', height: 18, ml: 0.5, bgcolor: '#ede7f6', color: '#4527a0' }}
      />
    </Tooltip>
  );
}
