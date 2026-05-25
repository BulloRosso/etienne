import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import ThreePaneSplit from './ThreePaneSplit';
import WorkflowList from './WorkflowList';
import WorkflowVisualizer from './WorkflowVisualizer';
import MarkdownViewer from './MarkdownViewer';
import CreateWorkflowDialog from './workflows/CreateWorkflowDialog';
import ProgressStateDialog from './workflows/ProgressStateDialog';
import DeleteWorkflowDialog from './workflows/DeleteWorkflowDialog';

/**
 * 3-column workflow modal layout:
 *   left:   workflow list (grouped: running > waiting > done) + context menu
 *   middle: tabs — "Status" (rationale/history) | "Flow" (ReactFlow graph)
 *   right:  wiki content pane (markdown of clicked wiki link)
 */
export default function WorkflowModalLayout({ projectName }) {
  const { t } = useTranslation(['workflowVisualizer']);

  const [workflows, setWorkflows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [activeTab, setActiveTab] = useState('status');
  const [wikiSlug, setWikiSlug] = useState(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [progressTarget, setProgressTarget] = useState(null); // { workflow, initialEvent? }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchWorkflows = useCallback(() => {
    if (!projectName) return Promise.resolve();
    setListLoading(true);
    setListError(null);
    return apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/workflows`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load workflows: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setWorkflows(data);
        return data;
      })
      .catch((err) => {
        setListError(err.message);
        return [];
      })
      .finally(() => setListLoading(false));
  }, [projectName]);

  useEffect(() => {
    if (!projectName) return;
    let cancelled = false;
    fetchWorkflows().then((data) => {
      if (cancelled) return;
      if (Array.isArray(data) && data.length > 0) {
        setSelectedWorkflowId((prev) => prev || data[0].id);
      }
    });
    return () => { cancelled = true; };
  }, [projectName, fetchWorkflows]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.hook === 'PostHook') fetchWorkflows();
    };
    window.addEventListener('claudeHook', handler);
    return () => window.removeEventListener('claudeHook', handler);
  }, [fetchWorkflows]);

  const handleOpenWiki = useCallback((slug) => {
    setWikiSlug(slug);
  }, []);

  const refreshAfterAction = useCallback(async () => {
    const data = await fetchWorkflows();
    setRefreshKey((k) => k + 1);
    return data;
  }, [fetchWorkflows]);

  const handleCreated = useCallback(async (created) => {
    const data = await refreshAfterAction();
    if (created?.id && data.some((w) => w.id === created.id)) {
      setSelectedWorkflowId(created.id);
    }
  }, [refreshAfterAction]);

  const handleTransitioned = useCallback(() => {
    refreshAfterAction();
  }, [refreshAfterAction]);

  const handleDeleted = useCallback(async (deletedId) => {
    const data = await refreshAfterAction();
    if (deletedId === selectedWorkflowId) {
      setSelectedWorkflowId(data?.[0]?.id || null);
    }
  }, [refreshAfterAction, selectedWorkflowId]);

  const leftPane = (
    <WorkflowList
      workflows={workflows}
      selectedWorkflowId={selectedWorkflowId}
      onSelect={setSelectedWorkflowId}
      loading={listLoading}
      error={listError}
      onCreate={() => setCreateOpen(true)}
      onProgress={(w) => setProgressTarget({ workflow: w })}
      onDelete={(w) => setDeleteTarget(w)}
    />
  );

  const middlePane = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Status" value="status" sx={{ minHeight: 36, py: 0.5 }} />
        <Tab label="Flow" value="flow" sx={{ minHeight: 36, py: 0.5 }} />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {selectedWorkflowId ? (
          <WorkflowVisualizer
            key={`${activeTab}-${selectedWorkflowId}-${refreshKey}`}
            projectName={projectName}
            selectedWorkflowId={selectedWorkflowId}
            onSelectWorkflow={setSelectedWorkflowId}
            onOpenWiki={handleOpenWiki}
            onProgressClick={(eventName) => {
              const w = workflows.find((wf) => wf.id === selectedWorkflowId);
              if (w) setProgressTarget({ workflow: w, initialEvent: eventName });
            }}
            viewMode={activeTab === 'flow' ? 'flow' : 'status'}
            hideInternalDropdown
          />
        ) : (
          <Box sx={{ p: 2 }}>
            {listLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">{t('workflowVisualizer:loading')}</Typography>
              </Box>
            ) : listError ? (
              <Alert severity="error">{listError}</Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('workflowVisualizer:noWorkflows')}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );

  const rightPane = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.paper' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}
        >
          Wiki
        </Typography>
        {wikiSlug && (
          <Typography
            variant="caption"
            sx={{ ml: 1, color: 'text.secondary' }}
            noWrap
            title={`wiki/topics/${wikiSlug}.md`}
          >
            / {wikiSlug}
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {wikiSlug ? (
          <MarkdownViewer
            key={wikiSlug}
            filename={`wiki/topics/${wikiSlug}.md`}
            projectName={projectName}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 3 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              Click a wiki link in the Status tab to view its content here.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <ThreePaneSplit
        storageKey="workflowModalSplit"
        left={leftPane}
        middle={middlePane}
        right={rightPane}
      />
      <CreateWorkflowDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectName={projectName}
        onCreated={handleCreated}
      />
      <ProgressStateDialog
        open={Boolean(progressTarget)}
        onClose={() => setProgressTarget(null)}
        projectName={projectName}
        workflow={progressTarget?.workflow}
        initialEvent={progressTarget?.initialEvent}
        onTransitioned={handleTransitioned}
      />
      <DeleteWorkflowDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        projectName={projectName}
        workflow={deleteTarget}
        onDeleted={handleDeleted}
      />
    </>
  );
}
