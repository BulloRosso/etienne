import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Radio,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import { AddCircleOutline, CheckCircle } from '@mui/icons-material';
import { apiAxios } from '../../services/api';
import { listApplicationTypes } from '../../services/applicationTypes';
import usePackageDraftStore from '../../stores/usePackageDraftStore';

/**
 * Five-tab catalog browser. Each tab fetches its catalog lazily on first
 * activation. Items are added/removed via the package draft store; the
 * store debounces the resolve POST.
 */
export default function CatalogPane() {
  const manifest = usePackageDraftStore((s) => s.manifest);
  const setAppType = usePackageDraftStore((s) => s.setAppType);
  const setTemplate = usePackageDraftStore((s) => s.setTemplate);
  const addItem = usePackageDraftStore((s) => s.addItem);
  const removeItem = usePackageDraftStore((s) => s.removeItem);
  const requestResolve = usePackageDraftStore((s) => s.requestResolve);

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');

  // catalog state, lazy-loaded
  const [appTypes, setAppTypes] = useState({ loaded: false, items: [] });
  const [skills, setSkills] = useState({ loaded: false, items: [] });
  const [subagents, setSubagents] = useState({ loaded: false, items: [] });
  const [mcpServers, setMcpServers] = useState({ loaded: false, items: [] });
  const [templates, setTemplates] = useState({ loaded: false, items: [] });

  useEffect(() => {
    // Always preload app types — they're single-select and required.
    if (!appTypes.loaded) {
      listApplicationTypes('en')
        .then((items) => setAppTypes({ loaded: true, items: items || [] }))
        .catch(() => setAppTypes({ loaded: true, items: [] }));
    }
  }, [appTypes.loaded]);

  useEffect(() => {
    if (tab === 1 && !skills.loaded) {
      apiAxios
        .get('/api/skills/repository/list?includeOptional=true')
        .then((res) => setSkills({ loaded: true, items: res.data.skills || [] }))
        .catch(() => setSkills({ loaded: true, items: [] }));
    }
    if (tab === 2 && !subagents.loaded) {
      apiAxios
        .get('/api/subagents/repository/list?includeOptional=true')
        .then((res) =>
          setSubagents({ loaded: true, items: res.data.subagents || res.data.items || [] }),
        )
        .catch(() => setSubagents({ loaded: true, items: [] }));
    }
    if (tab === 3 && !mcpServers.loaded) {
      apiAxios
        .get('/api/mcp-registry')
        .then((res) => setMcpServers({ loaded: true, items: res.data.servers || [] }))
        .catch(() => setMcpServers({ loaded: true, items: [] }));
    }
    if (tab === 4 && !templates.loaded) {
      apiAxios
        .get('/api/projects/templates')
        .then((res) => setTemplates({ loaded: true, items: res.data.templates || [] }))
        .catch(() => setTemplates({ loaded: true, items: [] }));
    }
  }, [tab, skills.loaded, subagents.loaded, mcpServers.loaded, templates.loaded]);

  const filter = (items, keyName = 'name', keyLabel = 'name') =>
    items.filter((it) => {
      const haystack = `${it[keyName] || ''} ${it[keyLabel] || ''} ${it.description || ''}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

  const selectedAppType = manifest.applicationType?.id;
  const selectedTemplate = manifest.template?.name;
  const selectedSkillNames = useMemo(
    () => new Set(manifest.skills.map((s) => s.name)),
    [manifest.skills],
  );
  const selectedSubagentNames = useMemo(
    () => new Set(manifest.subagents.map((s) => s.name)),
    [manifest.subagents],
  );
  const selectedMcpNames = useMemo(
    () => new Set(manifest.mcpServers.map((s) => s.name)),
    [manifest.mcpServers],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
      >
        <Tab label="App Type" sx={{ minHeight: 36 }} />
        <Tab label="Skills" sx={{ minHeight: 36 }} />
        <Tab label="Subagents" sx={{ minHeight: 36 }} />
        <Tab label="MCP" sx={{ minHeight: 36 }} />
        <Tab label="Templates" sx={{ minHeight: 36 }} />
      </Tabs>
      <Box sx={{ px: 1.5, py: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
        {tab === 0 && (
          <AppTypeList
            catalog={appTypes}
            selectedId={selectedAppType}
            onSelect={(id) => {
              setAppType(id);
              requestResolve();
            }}
            filter={(items) => filter(items, 'id', 'label')}
          />
        )}
        {tab === 1 && (
          <ItemList
            catalog={skills}
            isSelected={(it) => selectedSkillNames.has(it.name)}
            onAdd={(it) => {
              addItem('skill', it.name, it.source || 'standard');
              requestResolve();
            }}
            onRemove={(it) => {
              removeItem('skill', it.name);
              requestResolve();
            }}
            filter={filter}
            renderMeta={(it) => (
              <Chip
                size="small"
                label={it.source || 'standard'}
                sx={{ fontSize: '0.6rem', height: 16, mr: 0.5 }}
              />
            )}
          />
        )}
        {tab === 2 && (
          <ItemList
            catalog={subagents}
            isSelected={(it) => selectedSubagentNames.has(it.name)}
            onAdd={(it) => {
              addItem('subagent', it.name, it.source || 'standard');
              requestResolve();
            }}
            onRemove={(it) => {
              removeItem('subagent', it.name);
              requestResolve();
            }}
            filter={filter}
            renderMeta={(it) => (
              <Chip
                size="small"
                label={it.source || 'standard'}
                sx={{ fontSize: '0.6rem', height: 16, mr: 0.5 }}
              />
            )}
          />
        )}
        {tab === 3 && (
          <ItemList
            catalog={mcpServers}
            isSelected={(it) => selectedMcpNames.has(it.name)}
            onAdd={(it) => {
              const config = {
                type: it.transport,
                url: it.url,
                ...(it.headers && { headers: it.headers }),
                ...(it.env && { env: it.env }),
                ...(it.command && { command: it.command, args: it.args }),
              };
              addItem('mcp-server', it.name, undefined, { config });
              requestResolve();
            }}
            onRemove={(it) => {
              removeItem('mcp-server', it.name);
              requestResolve();
            }}
            filter={filter}
            renderMeta={(it) => (
              <Chip
                size="small"
                label={it.metadata?.lifecycle || it.transport || 'mcp'}
                sx={{ fontSize: '0.6rem', height: 16, mr: 0.5 }}
              />
            )}
          />
        )}
        {tab === 4 && (
          <TemplateList
            catalog={templates}
            selectedName={selectedTemplate}
            onSelect={(name) => {
              setTemplate(name);
              requestResolve();
            }}
            filter={(items) => items.filter((n) => n.toLowerCase().includes(query.toLowerCase()))}
          />
        )}
      </Box>
    </Box>
  );
}

function AppTypeList({ catalog, selectedId, onSelect, filter }) {
  if (!catalog.loaded) return <Loader />;
  const items = filter(catalog.items);
  if (items.length === 0) return <Empty label="No application types found." />;
  return (
    <List dense disablePadding>
      {items.map((it) => (
        <ListItem
          key={it.id}
          button
          onClick={() => onSelect(selectedId === it.id ? null : it.id)}
          sx={{
            borderRadius: 1,
            mb: 0.5,
            bgcolor: selectedId === it.id ? '#e3f2fd' : 'transparent',
          }}
        >
          <Radio checked={selectedId === it.id} size="small" sx={{ p: 0.5, mr: 0.5 }} />
          <ListItemText
            primary={it.label || it.id}
            secondary={it.id}
            primaryTypographyProps={{ fontSize: '0.85rem' }}
            secondaryTypographyProps={{ fontSize: '0.7rem' }}
          />
        </ListItem>
      ))}
    </List>
  );
}

function ItemList({ catalog, isSelected, onAdd, onRemove, filter, renderMeta }) {
  if (!catalog.loaded) return <Loader />;
  const items = filter(catalog.items);
  if (items.length === 0) return <Empty label="No items found." />;
  return (
    <List dense disablePadding>
      {items.map((it) => {
        const selected = isSelected(it);
        return (
          <ListItem
            key={`${it.name}-${it.source || ''}`}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              bgcolor: selected ? '#e8f5e9' : 'transparent',
            }}
          >
            <ListItemText
              primary={it.name}
              secondary={it.description}
              primaryTypographyProps={{ fontSize: '0.85rem' }}
              secondaryTypographyProps={{ fontSize: '0.7rem', noWrap: true }}
            />
            <ListItemSecondaryAction>
              {renderMeta && renderMeta(it)}
              <IconButton
                size="small"
                onClick={() => (selected ? onRemove(it) : onAdd(it))}
                color={selected ? 'success' : 'primary'}
              >
                {selected ? <CheckCircle fontSize="small" /> : <AddCircleOutline fontSize="small" />}
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        );
      })}
    </List>
  );
}

function TemplateList({ catalog, selectedName, onSelect, filter }) {
  if (!catalog.loaded) return <Loader />;
  const items = filter(catalog.items);
  if (items.length === 0) return <Empty label="No templates available." />;
  return (
    <List dense disablePadding>
      {items.map((name) => (
        <ListItem
          key={name}
          button
          onClick={() => onSelect(selectedName === name ? null : name)}
          sx={{
            borderRadius: 1,
            mb: 0.5,
            bgcolor: selectedName === name ? '#e3f2fd' : 'transparent',
          }}
        >
          <Radio checked={selectedName === name} size="small" sx={{ p: 0.5, mr: 0.5 }} />
          <ListItemText primary={name} primaryTypographyProps={{ fontSize: '0.85rem' }} />
        </ListItem>
      ))}
    </List>
  );
}

function Loader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress size={20} />
    </Box>
  );
}

function Empty({ label }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>
      {label}
    </Typography>
  );
}
