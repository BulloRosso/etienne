import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Stack,
  Button,
} from '@mui/material';
import {
  DeleteOutline,
  VpnKey,
  FolderOutlined,
  InsertDriveFileOutlined,
} from '@mui/icons-material';
import usePackageDraftStore from '../../stores/usePackageDraftStore';
import ProvenanceBadge from './ProvenanceBadge';
import EnvBindingDrawer from './EnvBindingDrawer';
import { isFolderLike } from './ManifestPreviewTree';

/**
 * Center pane: edit the manifest's metadata + show grouped selections.
 *
 * Selections come from the lockfile (so we see transitively-added items
 * with their provenance), but only user-selected entries can be removed.
 */
export default function ManifestPane() {
  const manifest = usePackageDraftStore((s) => s.manifest);
  const lockfile = usePackageDraftStore((s) => s.lockfile);
  const setMeta = usePackageDraftStore((s) => s.setMeta);
  const setAppType = usePackageDraftStore((s) => s.setAppType);
  const setTemplate = usePackageDraftStore((s) => s.setTemplate);
  const removeItem = usePackageDraftStore((s) => s.removeItem);
  const clearExtraFiles = usePackageDraftStore((s) => s.clearExtraFiles);
  const removeExtraFile = usePackageDraftStore((s) => s.removeExtraFile);
  const requestResolve = usePackageDraftStore((s) => s.requestResolve);

  const [bindingServer, setBindingServer] = useState(null);

  // Build per-kind groups from the lockfile (falls back to manifest if no
  // resolve roundtrip has happened yet).
  const groups = buildGroups(manifest, lockfile);

  const handleRemove = (kind, name, provenance) => {
    if (provenance && provenance.requestedBy?.kind !== 'user') return;
    removeItem(kind, name);
    requestResolve();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, overflowY: 'auto' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Package details
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Package name (kebab-case)"
          value={manifest.name}
          onChange={(e) => {
            setMeta({ name: e.target.value });
            requestResolve();
          }}
          helperText="Used as the project name on deploy and as the zip filename."
        />
        <TextField
          size="small"
          label="Agent display name"
          value={manifest.agentName || ''}
          onChange={(e) => setMeta({ agentName: e.target.value })}
        />
        <TextField
          size="small"
          label="Mission brief"
          value={manifest.missionBrief || ''}
          onChange={(e) => setMeta({ missionBrief: e.target.value })}
          multiline
          minRows={2}
          maxRows={6}
        />
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      <SelectionGroup
        title="Application type"
        items={groups.appType}
        emptyHint="Required — pick one in the Catalog → App Type tab."
        renderRow={(it, idx) => (
          <Row
            key={it.name}
            primary={it.name}
            secondary={it.resolvedVersion ? `v${it.resolvedVersion}` : null}
            provenance={it.provenance}
            onRemove={() => {
              setAppType(null);
              requestResolve();
            }}
            removable
            zebra={idx % 2 === 1}
          />
        )}
      />

      <SelectionGroup
        title="Skills"
        items={groups.skills}
        emptyHint="No skills selected."
        renderRow={(it, idx) => {
          const isUser = it.provenance?.requestedBy?.kind === 'user';
          return (
            <Row
              key={`${it.kind}:${it.name}`}
              primary={it.name}
              secondary={
                <>
                  {it.source && (
                    <Chip
                      size="small"
                      label={it.source}
                      sx={{ fontSize: '0.6rem', height: 16, mr: 0.5 }}
                    />
                  )}
                  {it.resolvedVersion && `v${it.resolvedVersion}`}
                </>
              }
              provenance={it.provenance}
              onRemove={() => handleRemove('skill', it.name, it.provenance)}
              removable={isUser}
              zebra={idx % 2 === 1}
            />
          );
        }}
      />

      <SelectionGroup
        title="Subagents"
        items={groups.subagents}
        emptyHint="No subagents selected."
        renderRow={(it, idx) => {
          const isUser = it.provenance?.requestedBy?.kind === 'user';
          return (
            <Row
              key={`${it.kind}:${it.name}`}
              primary={it.name}
              secondary={it.source}
              provenance={it.provenance}
              onRemove={() => handleRemove('subagent', it.name, it.provenance)}
              removable={isUser}
              zebra={idx % 2 === 1}
            />
          );
        }}
      />

      <SelectionGroup
        title="MCP servers"
        items={groups.mcpServers}
        emptyHint="No MCP servers selected."
        renderRow={(it, idx) => (
          <Row
            key={`${it.kind}:${it.name}`}
            primary={it.name}
            secondary={
              it.unboundPlaceholders?.length > 0
                ? `Unbound: ${it.unboundPlaceholders.join(', ')}`
                : null
            }
            provenance={it.provenance}
            onRemove={() => handleRemove('mcp-server', it.name, it.provenance)}
            removable
            warn={it.unboundPlaceholders?.length > 0}
            zebra={idx % 2 === 1}
            extraAction={
              it.unboundPlaceholders?.length > 0 ? (
                <Button
                  size="small"
                  startIcon={<VpnKey sx={{ fontSize: 14 }} />}
                  onClick={() => setBindingServer(it.name)}
                  sx={{ minWidth: 0, py: 0, fontSize: '0.7rem' }}
                >
                  Bind
                </Button>
              ) : null
            }
          />
        )}
      />

      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', flex: 1 }}
          >
            Extra files (example content)
          </Typography>
          {manifest.extraFiles?.paths?.length > 0 && (
            <Typography
              component="button"
              variant="caption"
              onClick={() => clearExtraFiles()}
              sx={{
                background: 'none',
                border: 'none',
                color: 'text.secondary',
                cursor: 'pointer',
                p: 0,
                fontSize: '0.7rem',
                '&:hover': { color: 'error.main', textDecoration: 'underline' },
              }}
            >
              Clear all
            </Typography>
          )}
        </Box>
        {manifest.extraFiles?.paths?.length > 0 ? (
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              bgcolor: '#f3e5f5',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {manifest.extraFiles.paths.length} file
              {manifest.extraFiles.paths.length === 1 ? '' : 's'} from{' '}
              <strong>{manifest.extraFiles.sourceProject}</strong>
            </Typography>
            <List dense disablePadding sx={{ maxHeight: 160, overflowY: 'auto' }}>
              {manifest.extraFiles.paths.map((path, idx) => {
                const isFolder = isFolderLike(path, manifest.extraFiles.paths);
                return (
                <ListItem
                  key={path}
                  sx={{
                    py: 0.25,
                    pl: 0.5,
                    borderRadius: 1,
                    bgcolor: idx % 2 === 1 ? 'rgba(255,255,255,0.5)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.8)' },
                  }}
                >
                  {isFolder ? (
                    <FolderOutlined
                      sx={{ fontSize: 16, mr: 0.75, color: '#7b1fa2', flexShrink: 0 }}
                    />
                  ) : (
                    <InsertDriveFileOutlined
                      sx={{ fontSize: 16, mr: 0.75, color: '#6a1b9a', flexShrink: 0 }}
                    />
                  )}
                  <ListItemText
                    primary={path}
                    primaryTypographyProps={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      sx: { wordBreak: 'break-all' },
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeExtraFile(path)}
                    title={isFolder ? 'Remove this folder' : 'Remove this file'}
                    sx={{ ml: 0.5 }}
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </ListItem>
                );
              })}
            </List>
          </Box>
        ) : (
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'divider',
              bgcolor: '#fafafa',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Bundle user-uploaded example files (e.g. sample inputs in{' '}
              <code>data/</code>, reference documents in <code>docs/</code>) alongside
              the catalog-derived items.
            </Typography>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ display: 'block', mt: 0.75, lineHeight: 1.5 }}
            >
              <strong>How:</strong> open the file explorer for a project you have
              loaded, enter selection mode (the same checkbox UI used for{' '}
              <em>Copy to project</em>), tick the files you want, then return to the
              dashboard and click <strong>“Promote to package”</strong>. The composer
              will reopen with your selection attached here.
              <br />
              Configuration files under <code>.claude/</code> and <code>.etienne/</code>{' '}
              are <em>not</em> included this way — they are reconstructed automatically
              from the catalog items above.
            </Typography>
          </Box>
        )}
      </Box>

      <EnvBindingDrawer
        open={!!bindingServer}
        serverName={bindingServer}
        onClose={() => setBindingServer(null)}
      />

      <SelectionGroup
        title="Project template"
        items={groups.template}
        emptyHint="No template selected (optional)."
        renderRow={(it, idx) => (
          <Row
            key={it.name}
            primary={it.name}
            provenance={it.provenance}
            onRemove={() => {
              setTemplate(null);
              requestResolve();
            }}
            removable
            zebra={idx % 2 === 1}
          />
        )}
      />
    </Box>
  );
}

function buildGroups(manifest, lockfile) {
  if (lockfile?.items?.length) {
    return {
      appType: lockfile.items.filter((i) => i.kind === 'application-type'),
      skills: lockfile.items.filter((i) => i.kind === 'skill'),
      subagents: lockfile.items.filter((i) => i.kind === 'subagent'),
      mcpServers: lockfile.items.filter((i) => i.kind === 'mcp-server'),
      template: lockfile.items.filter((i) => i.kind === 'template'),
    };
  }
  // Fallback view from the manifest only (pre-resolve).
  return {
    appType: manifest.applicationType
      ? [{ name: manifest.applicationType.id, kind: 'application-type' }]
      : [],
    skills: manifest.skills.map((s) => ({ ...s, kind: 'skill' })),
    subagents: manifest.subagents.map((s) => ({ ...s, kind: 'subagent' })),
    mcpServers: manifest.mcpServers.map((s) => ({ ...s, kind: 'mcp-server' })),
    template: manifest.template ? [{ name: manifest.template.name, kind: 'template' }] : [],
  };
}

function SelectionGroup({ title, items, emptyHint, renderRow }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem', pl: 0.5 }}>
          {emptyHint}
        </Typography>
      ) : (
        <List dense disablePadding>
          {/* Pass the index so the row can apply zebra striping. */}
          {items.map((it, idx) => renderRow(it, idx))}
        </List>
      )}
    </Box>
  );
}

function Row({ primary, secondary, provenance, onRemove, removable, warn, extraAction, zebra }) {
  // Background precedence: warn > zebra > transparent. Hover wins via the
  // pseudo-class override below.
  const baseBg = warn ? '#fff8e1' : zebra ? '#f5f5f5' : 'transparent';
  return (
    <ListItem
      sx={{
        py: 0.25,
        pl: 0.5,
        borderRadius: 1,
        bgcolor: baseBg,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {primary}
            <ProvenanceBadge provenance={provenance} />
          </Box>
        }
        secondary={secondary}
        primaryTypographyProps={{ fontSize: '0.85rem' }}
        secondaryTypographyProps={{ fontSize: '0.7rem' }}
      />
      {extraAction}
      {removable && (
        <IconButton size="small" onClick={onRemove} sx={{ ml: 0.5 }}>
          <DeleteOutline fontSize="small" />
        </IconButton>
      )}
    </ListItem>
  );
}
