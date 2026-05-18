import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Paper,
  Snackbar,
  Alert,
  Tooltip,
} from '@mui/material';
import { MoreVert, DataObject, AccountTree, NoteAdd, Download, TextFields } from '@mui/icons-material';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  SelectionMode,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ScrapbookNode from './ScrapbookNode';
import StickyNoteNode from './StickyNoteNode';
import ScrapbookEdge from './ScrapbookEdge';
import ScrapbookTopics from './ScrapbookTopics';
import ScrapbookNodeEdit from './ScrapbookNodeEdit';
import CreateFromTextDialog from './CreateFromTextDialog';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

const nodeTypes = {
  scrapbookNode: ScrapbookNode,
  stickyNote: StickyNoteNode,
};

const edgeTypes = {
  scrapbookEdge: ScrapbookEdge,
};

// Wrapper component to provide ReactFlow context
export default function Scrapbook(props) {
  return (
    <ReactFlowProvider>
      <ScrapbookInner {...props} />
    </ReactFlowProvider>
  );
}

function ScrapbookInner({ projectName, graphName = 'default', onClose, embedded = false }) {
  const { t } = useTranslation(["scrapbook","common"]);
  const [tabValue, setTabValue] = useState(0);
  const [tree, setTree] = useState(null);
  const [allNodes, setAllNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState(null);
  const [editParentNode, setEditParentNode] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState(null);
  const [createFromTextOpen, setCreateFromTextOpen] = useState(false);
  const [errorSnackbar, setErrorSnackbar] = useState({ open: false, message: '' });
  const intentionalUnselectRef = useRef(false);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [autoLayoutMode, setAutoLayoutMode] = useState(false);
  const [stickyNotes, setStickyNotes] = useState([]);
  const [editingStickyId, setEditingStickyId] = useState(null);
  const [customProperties, setCustomProperties] = useState([]);
  const [columnConfig, setColumnConfig] = useState([]);

  // Canvas persistence state
  const [savedPositions, setSavedPositions] = useState({});
  const [savedViewport, setSavedViewport] = useState(null);
  const [canvasSettingsLoaded, setCanvasSettingsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);
  const reactFlowInstance = useReactFlow();

  // Mirror of the state the unmount flush needs. The flush effect must have
  // empty deps (so its cleanup fires ONLY on real unmount, not on every
  // savedPositions/expandedNodes change — which would beacon stale default
  // positions over the restored layout). It reads the latest values from
  // this ref instead of closing over them.
  const flushStateRef = useRef({});

  // Load canvas settings from backend
  const loadCanvasSettings = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/canvas`);
      if (response.ok) {
        const settings = await response.json();
        if (settings) {
          // Restore expanded nodes
          if (settings.nodes) {
            const expanded = new Set();
            const positions = {};
            settings.nodes.forEach(n => {
              if (n.expanded) expanded.add(n.id);
              // Include childConnectorPosition if present, along with x/y coordinates
              positions[n.id] = {
                ...n.position,
                ...(n.childConnectorPosition && { childConnectorPosition: n.childConnectorPosition })
              };
            });
            setExpandedNodes(expanded);
            setSavedPositions(positions);
          }
          // Restore viewport
          if (settings.viewport && settings.zoom) {
            setSavedViewport({ ...settings.viewport, zoom: settings.zoom });
          }
          // Note: autoLayoutMode is not restored - it's always a one-shot operation
          // that starts as false and only temporarily becomes true during auto-layout
          // Restore sticky notes
          if (settings.stickyNotes) {
            setStickyNotes(settings.stickyNotes);
          }
          // Restore custom properties and column config
          if (settings.customProperties) {
            setCustomProperties(settings.customProperties);
          }
          if (settings.columnConfig) {
            setColumnConfig(settings.columnConfig);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load canvas settings:', error);
    } finally {
      setCanvasSettingsLoaded(true);
    }
  }, [projectName, graphName]);

  // Save canvas settings to backend (debounced)
  const saveCanvasSettings = useCallback(() => {
    // Don't save until canvas settings have been loaded to prevent overwriting stored data
    if (!canvasSettingsLoaded) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Always fetch existing settings first to preserve positions of hidden nodes
        // and customProperties/columnConfig when not loaded into state
        let existingSettings = null;
        try {
          const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/canvas`);
          if (response.ok) {
            existingSettings = await response.json();
          }
        } catch (e) {
          // Ignore fetch error
        }

        // Try to get ReactFlow data if available
        let currentNodes = [];
        let viewport = { zoom: 1, x: 0, y: 0 };
        try {
          currentNodes = reactFlowInstance?.getNodes() || [];
          const rfViewport = reactFlowInstance?.getViewport();
          if (rfViewport) {
            viewport = rfViewport;
          }
        } catch (e) {
          // ReactFlow not mounted (e.g., on Topics tab), use defaults
        }

        // Build node settings from visible nodes (positions)
        // and merge with existing settings for hidden nodes
        const nodeSettings = {};

        // First, preserve existing positions for all nodes (including hidden ones)
        if (existingSettings?.nodes) {
          existingSettings.nodes.forEach(n => {
            if (n.position) {
              nodeSettings[n.id] = {
                id: n.id,
                position: n.position,
                expanded: expandedNodes.has(n.id),
                ...(savedPositions[n.id]?.childConnectorPosition && { childConnectorPosition: savedPositions[n.id].childConnectorPosition }),
              };
            }
          });
        }

        // Second, merge in savedPositions state (positions captured when collapsing nodes)
        // This ensures positions captured at collapse time are persisted to backend
        Object.entries(savedPositions).forEach(([nodeId, position]) => {
          if (position && !nodeId.startsWith('sticky-')) {
            // Only update if we don't have a visible node with this ID
            // (visible nodes have more up-to-date positions)
            const isVisibleNode = currentNodes.some(n => n.id === nodeId);
            if (!isVisibleNode) {
              nodeSettings[nodeId] = {
                id: nodeId,
                position: { x: position.x, y: position.y },
                expanded: expandedNodes.has(nodeId),
                ...(position.childConnectorPosition && { childConnectorPosition: position.childConnectorPosition }),
              };
            }
          }
        });

        // Then, update with current visible nodes (their positions may have changed)
        currentNodes.forEach(n => {
          if (!n.id.startsWith('sticky-')) {
            nodeSettings[n.id] = {
              id: n.id,
              position: n.position,
              expanded: expandedNodes.has(n.id),
              ...(savedPositions[n.id]?.childConnectorPosition && { childConnectorPosition: savedPositions[n.id].childConnectorPosition }),
            };
          }
        });

        // Ensure all expanded nodes are tracked (even if not visible)
        expandedNodes.forEach(nodeId => {
          if (!nodeSettings[nodeId]) {
            nodeSettings[nodeId] = {
              id: nodeId,
              position: null, // No position for hidden nodes
              expanded: true,
              ...(savedPositions[nodeId]?.childConnectorPosition && { childConnectorPosition: savedPositions[nodeId].childConnectorPosition }),
            };
          }
        });

        // Extract sticky note positions and sizes from current nodes
        const stickyNoteData = currentNodes
          .filter(n => n.type === 'stickyNote')
          .map(n => ({
            id: n.id,
            content: n.data.content,
            color: n.data.color || 'gray',
            textAlign: n.data.textAlign || 'top',
            position: n.position,
            width: n.width || n.style?.width || 200,
            height: n.height || n.style?.height || 150,
          }));

        const settings = {
          nodes: currentNodes.length > 0
            ? Object.values(nodeSettings).filter(n => !n.id.startsWith('sticky-'))
            : (existingSettings?.nodes || Object.values(nodeSettings).filter(n => !n.id.startsWith('sticky-'))),
          zoom: currentNodes.length > 0 ? viewport.zoom : (existingSettings?.zoom || 1),
          viewport: currentNodes.length > 0 ? { x: viewport.x, y: viewport.y } : (existingSettings?.viewport || { x: 0, y: 0 }),
          autoLayoutMode: autoLayoutMode,
          stickyNotes: currentNodes.length > 0 ? stickyNoteData : (existingSettings?.stickyNotes || []),
          // Use current state if it has values, otherwise preserve existing settings
          customProperties: customProperties.length > 0 ? customProperties : (existingSettings?.customProperties || []),
          columnConfig: columnConfig.length > 0 ? columnConfig : (existingSettings?.columnConfig || []),
        };

        await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/canvas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
      } catch (error) {
        console.error('Failed to save canvas settings:', error);
      }
    }, 500); // Debounce 500ms
  }, [projectName, graphName, expandedNodes, reactFlowInstance, autoLayoutMode, stickyNotes, customProperties, columnConfig, canvasSettingsLoaded, savedPositions]);

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/tree`);
      if (response.ok) {
        const data = await response.json();
        setTree(data);
      } else {
        setTree(null);
      }
    } catch (error) {
      console.error('Failed to fetch scrapbook tree:', error);
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [projectName, graphName]);

  // Fetch all nodes as flat list with group info
  const fetchAllNodes = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes-with-groups`);
      if (response.ok) {
        const data = await response.json();
        setAllNodes(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    }
  }, [projectName, graphName]);

  // Load canvas settings first, then fetch tree data
  useEffect(() => {
    if (projectName) {
      loadCanvasSettings();
    }
  }, [projectName, loadCanvasSettings]);

  useEffect(() => {
    if (projectName && canvasSettingsLoaded) {
      fetchTree();
      fetchAllNodes();
    }
  }, [projectName, canvasSettingsLoaded, fetchTree, fetchAllNodes]);

  // Keep the latest state available to the unmount flush without making it a
  // dependency of the flush effect.
  flushStateRef.current = {
    projectName,
    graphName,
    expandedNodes,
    reactFlowInstance,
    autoLayoutMode,
    customProperties,
    columnConfig,
    savedPositions,
    canvasSettingsLoaded,
  };

  // Save immediately on unmount (flush pending saves). Empty deps: the cleanup
  // must run ONLY when the component truly unmounts (dialog closed), never on
  // intermediate dependency changes — otherwise it beacons the pre-restore
  // default layout over the good saved positions.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const {
        projectName,
        graphName,
        expandedNodes,
        reactFlowInstance,
        autoLayoutMode,
        customProperties,
        columnConfig,
        savedPositions,
        canvasSettingsLoaded,
      } = flushStateRef.current;

      // Never flush before settings finished loading — at that point the
      // canvas still holds default positions and would clobber stored data.
      if (!canvasSettingsLoaded) {
        return;
      }

      // Flush save on unmount - save current state immediately
      if (reactFlowInstance && projectName) {
        const currentNodes = reactFlowInstance.getNodes();
        const viewport = reactFlowInstance.getViewport();

        const nodeSettings = {};

        // First, include savedPositions (positions captured when collapsing nodes)
        Object.entries(savedPositions).forEach(([nodeId, position]) => {
          if (position && !nodeId.startsWith('sticky-')) {
            nodeSettings[nodeId] = {
              id: nodeId,
              position: position,
              expanded: expandedNodes.has(nodeId),
            };
          }
        });

        // Then override with current visible nodes (more up-to-date positions)
        currentNodes.forEach(n => {
          if (!n.id.startsWith('sticky-')) {
            nodeSettings[n.id] = {
              id: n.id,
              position: n.position,
              expanded: expandedNodes.has(n.id),
            };
          }
        });

        expandedNodes.forEach(nodeId => {
          if (!nodeSettings[nodeId]) {
            nodeSettings[nodeId] = {
              id: nodeId,
              position: null,
              expanded: true,
            };
          }
        });

        // Extract sticky note data
        const stickyNoteData = currentNodes
          .filter(n => n.type === 'stickyNote')
          .map(n => ({
            id: n.id,
            content: n.data.content,
            color: n.data.color || 'gray',
            textAlign: n.data.textAlign || 'top',
            position: n.position,
            width: n.width || n.style?.width || 200,
            height: n.height || n.style?.height || 150,
          }));

        const settings = {
          nodes: Object.values(nodeSettings).filter(n => !n.id.startsWith('sticky-')),
          zoom: viewport.zoom,
          viewport: { x: viewport.x, y: viewport.y },
          autoLayoutMode: autoLayoutMode,
          stickyNotes: stickyNoteData,
          customProperties: customProperties,
          columnConfig: columnConfig,
        };

        // Use sendBeacon for reliable save on unmount
        navigator.sendBeacon(
          `/api/workspace/${projectName}/scrapbook/${graphName}/canvas`,
          new Blob([JSON.stringify(settings)], { type: 'application/json' })
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle edge (connection) deletion - orphan the child node
  const handleEdgeDelete = useCallback(async (childId) => {
    // childId is passed directly from ScrapbookEdge component
    if (!childId) return;

    try {
      // Update parent to null (orphan the node)
      await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${childId}/parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: null }),
      });

      // Refresh tree and nodes
      await fetchTree();
      await fetchAllNodes();
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  }, [projectName, graphName, fetchTree, fetchAllNodes]);

  // Handle new connection between nodes
  const handleConnect = useCallback(async (connection) => {
    // connection.source is the new parent, connection.target is the child
    const newParentId = connection.source;
    const childId = connection.target;

    // Don't allow connecting to itself
    if (newParentId === childId) return;

    // Find the child node to check if it already has a parent
    const childNode = allNodes.find(n => n.id === childId);
    if (!childNode) return;

    // Don't allow connecting root node as a child
    if (childNode.type === 'ProjectTheme') {
      console.warn('Cannot connect root node as a child');
      return;
    }

    // Check if it already has a parent (would create multiple parents)
    if (childNode.parentId && childNode.parentId !== newParentId) {
      // The node already has a parent - this will replace it
      console.log(`Replacing parent of ${childId} from ${childNode.parentId} to ${newParentId}`);
    }

    try {
      await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${childId}/parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: newParentId }),
      });

      // Refresh tree and nodes
      await fetchTree();
      await fetchAllNodes();
    } catch (error) {
      console.error('Failed to create connection:', error);
    }
  }, [projectName, graphName, allNodes, fetchTree, fetchAllNodes]);

  // Convert tree to React Flow nodes and edges
  useEffect(() => {
    if (!tree) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const flowNodes = [];
    const flowEdges = [];

    if (autoLayoutMode) {
      // Radial-tree auto-layout:
      // - Root sits at the canvas center.
      // - Each level is placed on a ring at an increasing radius.
      // - Every subtree is given an angular sector sized in proportion to how
      //   many visible leaves it contains, so siblings (and their descendants)
      //   fan out without overlapping. A node is drawn at the mid-angle of its
      //   own sector; its children subdivide that same sector on the next ring.
      const RING_RADIUS = 320;   // distance added per level
      const ROOT_CENTER_X = 0;
      const ROOT_CENTER_Y = 0;

      const rootNode = tree;
      const rootExpanded = expandedNodes.has(rootNode.id);

      flowNodes.push(createFlowNode(rootNode, ROOT_CENTER_X, ROOT_CENTER_Y, rootExpanded));

      // Angular "weight" of a subtree = number of leaf slots it needs. A leaf
      // (or collapsed/childless node) counts as 1 so every node gets room.
      const angularWeight = (node) => {
        const children =
          expandedNodes.has(node.id) && node.children ? node.children : [];
        if (children.length === 0) return 1;
        return children.reduce((sum, c) => sum + angularWeight(c), 0);
      };

      // Place `node`'s children on the ring at `depth`, spread across the
      // [startAngle, endAngle] sector this node owns. Recurses so each child
      // subdivides its slice of the parent's sector on the next ring out.
      const placeChildren = (node, depth, startAngle, endAngle) => {
        if (!expandedNodes.has(node.id)) return;
        const children = node.children || [];
        if (children.length === 0) return;

        const radius = RING_RADIUS * depth;
        const totalWeight = children.reduce((sum, c) => sum + angularWeight(c), 0);

        let cursor = startAngle;
        children.forEach((child) => {
          const slice = ((endAngle - startAngle) * angularWeight(child)) / totalWeight;
          const childStart = cursor;
          const childEnd = cursor + slice;
          const midAngle = (childStart + childEnd) / 2;

          const x = ROOT_CENTER_X + radius * Math.cos(midAngle);
          const y = ROOT_CENTER_Y + radius * Math.sin(midAngle);

          const childExpanded = expandedNodes.has(child.id);
          flowNodes.push(createFlowNode(child, x, y, childExpanded));
          flowEdges.push({
            id: `${node.id}-${child.id}`,
            source: node.id,
            target: child.id,
            sourceHandle: 'center',
            targetHandle: 'center',
            type: 'scrapbookEdge',
            data: { onDelete: handleEdgeDelete },
          });

          placeChildren(child, depth + 1, childStart, childEnd);
          cursor = childEnd;
        });
      };

      // Distribute the root's whole subtree around a full 360° circle. Start
      // at -90° (12 o'clock) so the first branch points straight up.
      if (rootExpanded) {
        const start = -Math.PI / 2;
        placeChildren(rootNode, 1, start, start + 2 * Math.PI);
      }
    } else {
      // Standard layout mode - use saved positions exclusively
      // This ensures visual consistency: positions only change when user drags nodes
      // or explicitly triggers auto-layout
      const processNode = (node, depth, parentId) => {
        const nodeId = node.id;
        const isExpanded = expandedNodes.has(nodeId);
        const hasChildren = node.children && node.children.length > 0;

        // Only render nodes that have saved positions
        // New nodes without positions will get positions when auto-layout is triggered
        const savedPos = savedPositions[nodeId];
        if (!savedPos) {
          // If no saved position exists, calculate a default position
          // This handles new nodes that haven't been positioned yet
          const defaultX = depth * 300;
          const defaultY = flowNodes.length * 120;
          flowNodes.push(createFlowNode(node, defaultX, defaultY, isExpanded));
        } else {
          flowNodes.push(createFlowNode(node, savedPos.x, savedPos.y, isExpanded));
        }

        // Add edge from parent with appropriate handles based on depth
        // depth 0 = root (no parent)
        // depth 1 = categories (parent is root) - default: top
        // depth 2+ = subcategories - default: left
        // Use saved connector position if available
        if (parentId) {
          flowEdges.push({
            id: `${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            sourceHandle: 'center',
            targetHandle: 'center',
            type: 'scrapbookEdge',
            data: { onDelete: handleEdgeDelete },
          });
        }

        // Process children if expanded
        if (isExpanded && hasChildren) {
          node.children.forEach((child) => {
            processNode(child, depth + 1, nodeId);
          });
        }
      };

      processNode(tree, 0, null);
    }

    // Add orphan nodes (nodes without a parent that are not the root)
    // These are nodes that had their connection removed
    // Also need to render their children (which still have parentId pointing to the orphan)
    const treeNodeIds = new Set(flowNodes.map(n => n.id));
    const orphanRoots = allNodes.filter(node =>
      !node.parentId &&
      node.type !== 'ProjectTheme' &&
      !treeNodeIds.has(node.id)
    );

    // Build a map of parent -> children from allNodes
    const childrenByParent = new Map();
    allNodes.forEach(node => {
      if (node.parentId) {
        if (!childrenByParent.has(node.parentId)) {
          childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node);
      }
    });

    // Recursively render orphan subtrees
    const renderOrphanSubtree = (node, baseX, baseY, depth) => {
      const savedPos = savedPositions[node.id];
      const x = savedPos?.x ?? baseX;
      const y = savedPos?.y ?? baseY;
      const isExpanded = expandedNodes.has(node.id);
      const children = childrenByParent.get(node.id) || [];

      // Create a node object with children info for proper rendering
      const nodeWithChildren = {
        ...node,
        children: children,
      };

      flowNodes.push(createFlowNode(nodeWithChildren, x, y, isExpanded));

      // Add edges and render children if expanded
      if (isExpanded && children.length > 0) {
        let childY = y + 120;
        children.forEach((child) => {
          const childX = x + 50;
          flowEdges.push({
            id: `${node.id}-${child.id}`,
            source: node.id,
            target: child.id,
            sourceHandle: 'center',
            targetHandle: 'center',
            type: 'scrapbookEdge',
            data: { onDelete: handleEdgeDelete },
          });
          renderOrphanSubtree(child, childX, childY, depth + 1);
          childY += 120;
        });
      }
    };

    orphanRoots.forEach((orphan, index) => {
      const defaultX = 800 + (index % 3) * 300;
      const defaultY = 100 + Math.floor(index / 3) * 200;
      renderOrphanSubtree(orphan, defaultX, defaultY, 0);
    });

    // Preserve sticky notes when updating scrapbook nodes
    setNodes(prevNodes => {
      const existingStickyNodes = prevNodes.filter(n => n.id.startsWith('sticky-'));
      return [...flowNodes, ...existingStickyNodes];
    });
    setEdges(flowEdges);
  }, [tree, expandedNodes, selectedNode, autoLayoutMode, savedPositions, handleEdgeDelete, allNodes]);

  // Effect for creating/removing sticky notes (only when stickyNotes array changes)
  useEffect(() => {
    setNodes(prevNodes => {
      // Remove old sticky notes
      const nonStickyNodes = prevNodes.filter(n => !n.id.startsWith('sticky-'));
      const existingStickyIds = new Set(prevNodes.filter(n => n.id.startsWith('sticky-')).map(n => n.id));
      const newStickyIds = new Set(stickyNotes.map(n => n.id));

      // Check if sticky notes have actually changed (added/removed)
      const stickyNotesChanged = existingStickyIds.size !== newStickyIds.size ||
        [...existingStickyIds].some(id => !newStickyIds.has(id));

      if (!stickyNotesChanged && existingStickyIds.size > 0) {
        // Only update data for existing sticky notes - preserve all callbacks
        return prevNodes.map(node => {
          if (!node.id.startsWith('sticky-')) return node;
          const note = stickyNotes.find(n => n.id === node.id);
          if (!note) return node;
          return {
            ...node,
            position: note.position || node.position,
            dragHandle: '.sticky-drag-handle', // Ensure dragHandle is preserved
            style: {
              ...node.style,
              width: note.width || 200,
              height: note.height || 150,
            },
            data: {
              ...node.data,
              content: note.content || '',
              color: note.color || 'gray',
              textAlign: note.textAlign || 'top',
              // Re-create callbacks to ensure they work with latest state
              onStopEdit: () => setEditingStickyId(null),
              onContentChange: (newContent) => {
                setStickyNotes(prev => prev.map(n =>
                  n.id === note.id ? { ...n, content: newContent } : n
                ));
                setTimeout(saveCanvasSettings, 100);
              },
              onColorChange: (newColor) => {
                setStickyNotes(prev => prev.map(n =>
                  n.id === note.id ? { ...n, color: newColor } : n
                ));
                setTimeout(saveCanvasSettings, 100);
              },
              onTextAlignChange: (newAlign) => {
                setStickyNotes(prev => prev.map(n =>
                  n.id === note.id ? { ...n, textAlign: newAlign } : n
                ));
                setTimeout(saveCanvasSettings, 100);
              },
              onDelete: () => {
                setStickyNotes(prev => prev.filter(n => n.id !== note.id));
                setEditingStickyId(null);
                setTimeout(saveCanvasSettings, 100);
              },
            },
          };
        });
      }

      // Add current sticky notes (full rebuild only when notes added/removed)
      const stickyFlowNodes = stickyNotes.map(note => ({
        id: note.id,
        type: 'stickyNote',
        position: note.position || { x: 50, y: 50 },
        dragHandle: '.sticky-drag-handle',
        style: {
          width: note.width || 200,
          height: note.height || 150,
          zIndex: -1, // Lower z-index than regular nodes
        },
        data: {
          content: note.content || '',
          color: note.color || 'gray',
          textAlign: note.textAlign || 'top',
          isEditing: false, // Will be updated by the separate isEditing effect
          onStopEdit: () => setEditingStickyId(null),
          onContentChange: (newContent) => {
            setStickyNotes(prev => prev.map(n =>
              n.id === note.id ? { ...n, content: newContent } : n
            ));
            setTimeout(saveCanvasSettings, 100);
          },
          onColorChange: (newColor) => {
            setStickyNotes(prev => prev.map(n =>
              n.id === note.id ? { ...n, color: newColor } : n
            ));
            setTimeout(saveCanvasSettings, 100);
          },
          onTextAlignChange: (newAlign) => {
            setStickyNotes(prev => prev.map(n =>
              n.id === note.id ? { ...n, textAlign: newAlign } : n
            ));
            setTimeout(saveCanvasSettings, 100);
          },
          onDelete: () => {
            setStickyNotes(prev => prev.filter(n => n.id !== note.id));
            setEditingStickyId(null);
            setTimeout(saveCanvasSettings, 100);
          },
        },
      }));

      return [...nonStickyNodes, ...stickyFlowNodes];
    });
  }, [stickyNotes, saveCanvasSettings]);

  // Separate effect for updating isEditing state (doesn't recreate nodes)
  useEffect(() => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (!node.id.startsWith('sticky-')) return node;
      const shouldBeEditing = editingStickyId === node.id;
      if (node.data.isEditing === shouldBeEditing) return node;
      return {
        ...node,
        data: {
          ...node.data,
          isEditing: shouldBeEditing,
        },
      };
    }));
  }, [editingStickyId]);

  // Helper to count all descendants
  function countDescendants(node) {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  }

  // Helper to count visible (expanded) descendants
  function countVisibleDescendants(node) {
    if (!node.children || node.children.length === 0) return 0;
    if (!expandedNodes.has(node.id)) return 0;
    return node.children.reduce((sum, child) => sum + 1 + countVisibleDescendants(child), 0);
  }

  // Helper to create a flow node with proper styling
  function createFlowNode(node, x, y, isExpanded) {
    const nodeId = node.id;
    const hasChildren = node.children && node.children.length > 0;

    // Position is now passed in directly - no need to look up saved positions here
    const finalX = x;
    const finalY = y;

    // Determine border style based on depth and type
    let borderWidth = 0;
    let borderRadius = 6;
    if (node.type === 'ProjectTheme') {
      borderWidth = 3;
    } else if (node.type === 'Category') {
      borderWidth = 2;
    } else if (node.type === 'Subcategory') {
      borderWidth = 1;
    }

    // Check if node is part of a group (from allNodes which has group info)
    const nodeWithGroupInfo = allNodes.find(n => n.id === nodeId);
    const isInGroup = !!nodeWithGroupInfo?.groupId;

    // Determine color based on attention weight (heatmap style)
    // If in a group, use orange shades instead of blue
    // Attention weight: 0.0 to 1.0, mapped to 10% steps
    let borderColor = '#000000';
    let backgroundColor = '#ffffff';
    const isActive = selectedNode?.id === nodeId;

    if (isActive) {
      borderColor = 'gold';
      backgroundColor = '#fffde7';
    } else {
      const attention = Math.max(0, Math.min(1, node.attentionWeight || 0));
      const priority = node.priority || 0;

      // Special case: low priority (<=1) AND low attention (<=1%) = black/white styling
      if (priority <= 1 && attention <= 0.01) {
        borderColor = '#000000';
        backgroundColor = '#ffffff';
      } else if (isInGroup) {
        // ORANGE SHADES for grouped nodes (alternative options)
        // Round attention to nearest 10% step (0.0, 0.1, 0.2, ... 1.0)
        const step = Math.round(attention * 10) / 10; // 0.0 to 1.0 in 0.1 increments

        // Dark orange RGB: (230, 81, 0) for 100% attention - #e65100
        // Light orange RGB: (255, 224, 178) for 1% attention - #ffe0b2
        const darkOrangeR = 230, darkOrangeG = 81, darkOrangeB = 0;
        const lightOrangeR = 255, lightOrangeG = 224, lightOrangeB = 178;

        // Border/font color: interpolate from light orange (low attention) to dark orange (high attention)
        const borderR = Math.round(lightOrangeR + (darkOrangeR - lightOrangeR) * step);
        const borderG = Math.round(lightOrangeG + (darkOrangeG - lightOrangeG) * step);
        const borderB = Math.round(lightOrangeB + (darkOrangeB - lightOrangeB) * step);
        borderColor = `rgb(${borderR}, ${borderG}, ${borderB})`;

        // Background color: very light orange (low attention) to light solid orange (high attention)
        // Low attention: almost white with hint of orange (255, 248, 241) - seashell-ish
        // High attention: light solid orange (255, 183, 77) - #ffb74d
        const bgLowR = 255, bgLowG = 248, bgLowB = 241;
        const bgHighR = 255, bgHighG = 183, bgHighB = 77;

        const bgR = Math.round(bgLowR + (bgHighR - bgLowR) * step);
        const bgG = Math.round(bgLowG + (bgHighG - bgLowG) * step);
        const bgB = Math.round(bgLowB + (bgHighB - bgLowB) * step);
        backgroundColor = `rgb(${bgR}, ${bgG}, ${bgB})`;
      } else {
        // BLUE SHADES for non-grouped nodes
        // Attention-based heatmap coloring
        // Round attention to nearest 10% step (0.0, 0.1, 0.2, ... 1.0)
        const step = Math.round(attention * 10) / 10; // 0.0 to 1.0 in 0.1 increments

        // Navy RGB: (0, 0, 128) for 100% attention
        // Light blue RGB: (173, 216, 230) for 1% attention
        // Interpolate based on attention step
        const navyR = 0, navyG = 0, navyB = 128;
        const lightBlueR = 173, lightBlueG = 216, lightBlueB = 230;

        // Border/font color: interpolate from light blue (low attention) to navy (high attention)
        const borderR = Math.round(lightBlueR + (navyR - lightBlueR) * step);
        const borderG = Math.round(lightBlueG + (navyG - lightBlueG) * step);
        const borderB = Math.round(lightBlueB + (navyB - lightBlueB) * step);
        borderColor = `rgb(${borderR}, ${borderG}, ${borderB})`;

        // Background color: very light blue (low attention) to solid blue (high attention)
        // Low attention: almost white with hint of blue (240, 248, 255) - aliceblue
        // High attention: light solid blue (135, 206, 250) - lightskyblue
        const bgLowR = 245, bgLowG = 250, bgLowB = 255;
        const bgHighR = 135, bgHighG = 206, bgHighB = 250;

        const bgR = Math.round(bgLowR + (bgHighR - bgLowR) * step);
        const bgG = Math.round(bgLowG + (bgHighG - bgLowG) * step);
        const bgB = Math.round(bgLowB + (bgHighB - bgLowB) * step);
        backgroundColor = `rgb(${bgR}, ${bgG}, ${bgB})`;
      }
    }

    return {
      id: nodeId,
      type: 'scrapbookNode',
      position: { x: finalX, y: finalY },
      data: {
        ...node,
        projectName,
        graphName,
        isExpanded,
        hasChildren,
        borderWidth,
        borderColor,
        backgroundColor,
        borderRadius,
        isActive,
        onToggleExpand: () => {
          const isCurrentlyExpanded = expandedNodes.has(nodeId);

          // If collapsing, save positions of all visible child nodes before they disappear
          if (isCurrentlyExpanded && reactFlowInstance) {
            const currentNodes = reactFlowInstance.getNodes();
            const childIds = new Set();

            // Collect all descendant IDs recursively
            const collectDescendantIds = (n) => {
              if (n.children) {
                n.children.forEach(child => {
                  childIds.add(child.id);
                  collectDescendantIds(child);
                });
              }
            };
            collectDescendantIds(node);

            // Save positions of all descendants that are currently visible
            // Use callback form and then trigger expand change after positions are saved
            if (childIds.size > 0) {
              setSavedPositions(prev => {
                const updated = { ...prev };
                currentNodes.forEach(n => {
                  if (childIds.has(n.id)) {
                    updated[n.id] = { x: n.position.x, y: n.position.y };
                  }
                });
                return updated;
              });
            }
          }

          // Use setTimeout to ensure savedPositions state is updated before expandedNodes changes
          // This prevents the race condition where the tree re-renders before positions are saved
          setTimeout(() => {
            setExpandedNodes(prev => {
              const next = new Set(prev);
              if (next.has(nodeId)) {
                next.delete(nodeId);
              } else {
                next.add(nodeId);
              }
              return next;
            });
            // Save canvas settings after expand/collapse
            setTimeout(saveCanvasSettings, 100);
          }, 0);
        },
        onNodeClick: () => {
          // Toggle selection: if already selected, unselect; otherwise select
          if (selectedNode?.id === node.id) {
            intentionalUnselectRef.current = true;
            setSelectedNode(null);
            // Reset flag after a short delay
            setTimeout(() => { intentionalUnselectRef.current = false; }, 100);
          } else {
            setSelectedNode(node);
          }
        },
        onContextMenu: (event) => {
          event.preventDefault();
          setEditNode(node);
          setAnchorEl(event.currentTarget);
        },
      },
    };
  }

  // Expand all nodes for auto-layout
  const expandAllNodes = (node, expanded = new Set()) => {
    if (!node) return expanded;
    expanded.add(node.id);
    if (node.children) {
      node.children.forEach(child => expandAllNodes(child, expanded));
    }
    return expanded;
  };

  // Initialize example data
  const handleInitializeExample = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/example-data`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Failed to create sample data (${response.status})`;
        setErrorSnackbar({ open: true, message: errorMessage });
        console.error('Failed to initialize example data:', errorMessage);
        return;
      }
      await fetchTree();
      await fetchAllNodes();
    } catch (error) {
      console.error('Failed to initialize example data:', error);
      setErrorSnackbar({ open: true, message: error.message || 'Failed to create sample data' });
    } finally {
      setLoading(false);
    }
  };

  // Auto-layout handler - one-shot layout that calculates positions deterministically
  // and saves them immediately without relying on React Flow state
  const handleAutoLayout = () => {
    if (!tree) return;

    // Expand all nodes first
    const allExpanded = expandAllNodes(tree);
    setExpandedNodes(allExpanded);
    setOptionsAnchor(null);

    // Radial-tree layout computed deterministically (same algorithm as the
    // autoLayoutMode render branch). Computing positions directly here and
    // writing them into savedPositions avoids race conditions with React Flow.
    const RING_RADIUS = 320;   // distance added per level
    const ROOT_CENTER_X = 0;
    const ROOT_CENTER_Y = 0;

    const newPositions = {};
    const rootNode = tree;

    newPositions[rootNode.id] = { x: ROOT_CENTER_X, y: ROOT_CENTER_Y };

    // Angular "weight" of a subtree = number of leaf slots it needs. Every
    // node counts at least 1 so it always gets room. All nodes are expanded
    // here (expandAllNodes above), so the full hierarchy is laid out.
    const angularWeight = (node) => {
      const children = node.children || [];
      if (children.length === 0) return 1;
      return children.reduce((sum, c) => sum + angularWeight(c), 0);
    };

    // Place node's children on the ring at `depth`, each child taking a slice
    // of [startAngle, endAngle] proportional to its weight, then recursing so
    // grandchildren fan out within their parent's slice on the next ring.
    const placeChildren = (node, depth, startAngle, endAngle) => {
      const children = node.children || [];
      if (children.length === 0) return;

      const radius = RING_RADIUS * depth;
      const totalWeight = children.reduce((sum, c) => sum + angularWeight(c), 0);

      let cursor = startAngle;
      children.forEach((child) => {
        const slice = ((endAngle - startAngle) * angularWeight(child)) / totalWeight;
        const childStart = cursor;
        const childEnd = cursor + slice;
        const midAngle = (childStart + childEnd) / 2;

        newPositions[child.id] = {
          x: ROOT_CENTER_X + radius * Math.cos(midAngle),
          y: ROOT_CENTER_Y + radius * Math.sin(midAngle),
        };

        placeChildren(child, depth + 1, childStart, childEnd);
        cursor = childEnd;
      });
    };

    // Spread the whole tree around a full 360° circle, first branch at
    // 12 o'clock (-90°) going clockwise.
    const start = -Math.PI / 2;
    placeChildren(rootNode, 1, start, start + 2 * Math.PI);

    // Update saved positions with the calculated layout
    setSavedPositions(newPositions);
    setSavedViewport(null);
    // Keep autoLayoutMode false - we're using saved positions now
    setAutoLayoutMode(false);

    // The radial layout is centered on (0,0) with negative coordinates, so
    // re-frame the canvas once React Flow has applied the new positions.
    setTimeout(() => {
      reactFlowInstance?.fitView({ padding: 0.2, duration: 400 });
    }, 150);

    // Save to backend after state updates
    setTimeout(saveCanvasSettings, 100);
  };

  // Add sticky note handler
  const handleAddStickyNote = () => {
    const newNoteId = `sticky-${Date.now()}`;
    const newNote = {
      id: newNoteId,
      content: '',
      position: { x: 20, y: 20 },
      width: 200,
      height: 150,
    };

    setStickyNotes(prev => [...prev, newNote]);
    setEditingStickyId(newNoteId); // Automatically enter edit mode
    setOptionsAnchor(null);
    setTimeout(saveCanvasSettings, 100);
  };

  // Export agentic view handler
  const handleExportAgenticView = async () => {
    if (!selectedNode) return;
    setOptionsAnchor(null);

    try {
      const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/describe/${encodeURIComponent(selectedNode.label)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch agentic view');
      }
      const data = await response.json();
      const markdown = data.markdown;

      // Create filename from node label (sanitize for filesystem)
      const sanitizedLabel = selectedNode.label.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedLabel}_agent_view.md`;

      // Create blob and trigger download
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export agentic view:', error);
    }
  };

  // Handle context menu actions
  const handleMenuClose = () => {
    setAnchorEl(null);
    setEditNode(null);
  };

  const handleEdit = () => {
    setEditParentNode(null); // Editing existing node, no parent
    setEditDialogOpen(true);
    setAnchorEl(null); // Close menu but keep editNode
  };

  // The root (ProjectTheme) node always links to the wiki's well-known entry
  // page (wiki/index.md). Any other node links to its mapped topic page.
  const resolveWikiFilePath = (node) => {
    if (!node) return null;
    if (node.type === 'ProjectTheme') return 'wiki/index.md';
    const slug = node.wikiSlug?.trim();
    return slug ? `wiki/topics/${slug}.md` : null;
  };

  const handleOpenWikiPage = () => {
    const filePath = resolveWikiFilePath(editNode);
    if (filePath) {
      claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
        action: 'markdown-preview',
        filePath,
        projectName,
      });
    }
    handleMenuClose();
  };

  const handleAddSubcategory = () => {
    setEditParentNode(editNode); // Current node becomes the parent
    setEditNode(null); // No node to edit (creating new)
    setEditDialogOpen(true);
    setAnchorEl(null); // Close menu
  };

  const handleDelete = () => {
    setNodeToDelete(editNode);
    setDeleteConfirmOpen(true);
    setAnchorEl(null); // Close menu but keep editNode for confirmation
  };

  const confirmDelete = async () => {
    if (!nodeToDelete) return;

    try {
      await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${nodeToDelete.id}`, {
        method: 'DELETE',
      });
      await fetchTree();
      await fetchAllNodes();
      if (selectedNode?.id === nodeToDelete.id) {
        setSelectedNode(null);
      }
    } catch (error) {
      console.error('Failed to delete node:', error);
    } finally {
      setDeleteConfirmOpen(false);
      setNodeToDelete(null);
    }
  };

  // Direct delete without confirmation (for keyboard shortcut)
  const deleteNodeDirect = useCallback(async (node) => {
    if (!node || node.type === 'ProjectTheme') return;

    try {
      await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}`, {
        method: 'DELETE',
      });
      await fetchTree();
      await fetchAllNodes();
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
      }
    } catch (error) {
      console.error('Failed to delete node:', error);
    }
  }, [projectName, graphName, fetchTree, fetchAllNodes, selectedNode]);

  // Keyboard shortcuts for DEL key to delete selected node and Space to cycle connector position
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if we're in an input field or dialog
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (editDialogOpen || deleteConfirmOpen) return;

      // Delete key handling
      if (e.key === 'Delete' && selectedNode && tabValue === 0) {
        e.preventDefault();
        deleteNodeDirect(selectedNode);
      }

      // Spacebar to cycle child connector position
      if (e.key === ' ' && selectedNode && selectedNode.type !== 'ProjectTheme' && tabValue === 0) {
        e.preventDefault();

        // Determine default based on node type (Category=Top, Subcategory=Left)
        const isCategory = selectedNode.type === 'Category';
        const defaultPos = isCategory ? 'Top' : 'Left';

        // Cycle clockwise: current -> next in [Left, Top, Right, Bottom]
        const positions = ['Left', 'Top', 'Right', 'Bottom'];
        const currentPos = savedPositions[selectedNode.id]?.childConnectorPosition || defaultPos;
        const currentIndex = positions.indexOf(currentPos);
        const nextPos = positions[(currentIndex + 1) % 4];

        setSavedPositions(prev => ({
          ...prev,
          [selectedNode.id]: {
            ...prev[selectedNode.id],
            childConnectorPosition: nextPos
          }
        }));

        // Save canvas settings after updating connector position
        setTimeout(saveCanvasSettings, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, tabValue, editDialogOpen, deleteConfirmOpen, deleteNodeDirect, savedPositions, saveCanvasSettings]);


  const handleNodeSaved = async () => {
    setEditDialogOpen(false);
    await fetchTree();
    await fetchAllNodes();
    // Update selectedNode if it was the one being edited
    if (editNode && selectedNode && editNode.id === selectedNode.id) {
      // Fetch fresh data for the selected node
      try {
        const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${selectedNode.id}`);
        if (response.ok) {
          const updatedNode = await response.json();
          setSelectedNode(updatedNode);
        }
      } catch (error) {
        console.error('Failed to refresh selected node:', error);
      }
    }
  };

  // Refresh node data without closing the dialog (used after image upload)
  const handleNodeUpdated = async () => {
    await fetchTree();
    await fetchAllNodes();
    // Update selectedNode if it was the one being edited
    if (editNode && selectedNode && editNode.id === selectedNode.id) {
      try {
        const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${selectedNode.id}`);
        if (response.ok) {
          const updatedNode = await response.json();
          setSelectedNode(updatedNode);
        }
      } catch (error) {
        console.error('Failed to refresh selected node:', error);
      }
    }
  };

  // Options menu
  const [optionsAnchor, setOptionsAnchor] = useState(null);

  if (loading && !tree) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ flex: 1 }}>
          <Tab label={t('scrapbook:tabMindmap')} />
          <Tab label={t('scrapbook:tabTopics')} disabled={!selectedNode} />
        </Tabs>
        <IconButton onClick={(e) => setOptionsAnchor(e.currentTarget)} size="small">
          <MoreVert />
        </IconButton>
        <Menu
          anchorEl={optionsAnchor}
          open={Boolean(optionsAnchor)}
          onClose={() => setOptionsAnchor(null)}
        >
          <MenuItem onClick={() => { handleInitializeExample(); setOptionsAnchor(null); }}>
            <ListItemIcon><DataObject fontSize="small" /></ListItemIcon>
            <ListItemText>{t('scrapbook:menuUseExampleData')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setCreateFromTextOpen(true); setOptionsAnchor(null); }}>
            <ListItemIcon><TextFields fontSize="small" /></ListItemIcon>
            <ListItemText>{t('scrapbook:menuCreateFromText')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAutoLayout} disabled={!tree}>
            <ListItemIcon><AccountTree fontSize="small" /></ListItemIcon>
            <ListItemText>{t('scrapbook:menuAutoLayout')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAddStickyNote}>
            <ListItemIcon><NoteAdd fontSize="small" /></ListItemIcon>
            <ListItemText>{t('scrapbook:menuAddStickyNote')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportAgenticView} disabled={!selectedNode}>
            <ListItemIcon><Download fontSize="small" /></ListItemIcon>
            <ListItemText>{t('scrapbook:menuExportAgenticView')}</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {tabValue === 0 && (
          <Box sx={{ height: '100%' }}>
            {tree ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={(changes) => {
                  onNodesChange(changes);
                  // Check if any sticky note was resized and update stickyNotes state
                  const resizeChanges = changes.filter(c => c.type === 'dimensions' && c.id?.startsWith('sticky-'));
                  if (resizeChanges.length > 0) {
                    setStickyNotes(prev => prev.map(note => {
                      const change = resizeChanges.find(c => c.id === note.id);
                      if (change && change.dimensions) {
                        return {
                          ...note,
                          width: change.dimensions.width,
                          height: change.dimensions.height,
                        };
                      }
                      return note;
                    }));
                    setTimeout(saveCanvasSettings, 100);
                  }
                }}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                snapToGrid={true}
                snapGrid={[12, 12]}
                onNodeClick={(_event, node) => {
                  if (node.type === 'stickyNote') {
                    // Handle sticky note clicks to enter edit mode
                    if (!editingStickyId) {
                      setEditingStickyId(node.id);
                    }
                    // If clicking on a different sticky note, switch to that one
                    else if (editingStickyId !== node.id) {
                      setEditingStickyId(node.id);
                    }
                  } else {
                    // Clicking on a non-sticky node exits sticky edit mode
                    if (editingStickyId) {
                      setEditingStickyId(null);
                    }
                  }
                }}
                fitView={!savedViewport}
                defaultViewport={savedViewport || undefined}
                minZoom={0.1}
                maxZoom={2}
                onNodeDragStop={(_event, draggedNode, draggedNodes) => {
                  // Get current positions from ReactFlow instance for accurate final positions
                  const currentNodes = reactFlowInstance?.getNodes() || [];

                  // Determine which nodes were dragged:
                  // - If multiple nodes selected (lasso), use all selected nodes
                  // - If single node dragged, use that node
                  const movedNodeIds = new Set(
                    draggedNodes && draggedNodes.length > 0
                      ? draggedNodes.map(n => n.id)
                      : [draggedNode.id]
                  );

                  // Handle regular nodes - update savedPositions (preserve existing properties like childConnectorPosition)
                  setSavedPositions(prev => {
                    const updated = { ...prev };
                    currentNodes.forEach(n => {
                      if (!n.id.startsWith('sticky-') && movedNodeIds.has(n.id)) {
                        updated[n.id] = { ...prev[n.id], x: n.position.x, y: n.position.y };
                      }
                    });
                    return updated;
                  });

                  // Handle sticky notes - update their positions in stickyNotes state
                  const movedStickyNodes = currentNodes.filter(n => n.id.startsWith('sticky-') && movedNodeIds.has(n.id));
                  if (movedStickyNodes.length > 0) {
                    setStickyNotes(prev => prev.map(note => {
                      const movedNote = movedStickyNodes.find(n => n.id === note.id);
                      if (movedNote) {
                        return { ...note, position: movedNote.position };
                      }
                      return note;
                    }));
                  }

                  saveCanvasSettings();
                }}
                onMoveEnd={saveCanvasSettings}
                onPaneClick={() => {
                  // Exit sticky note edit mode when clicking on canvas background
                  if (editingStickyId) {
                    setEditingStickyId(null);
                  }
                }}
                selectionOnDrag={!editingStickyId}
                selectionMode={SelectionMode.Partial}
                panOnDrag={[1, 2]}
                selectionKeyCode={editingStickyId ? false : null}
                onSelectionChange={({ nodes: selectedNodes }) => {
                  // Skip if we're intentionally unselecting
                  if (intentionalUnselectRef.current) return;

                  // When React Flow selection changes, sync with our selectedNode state
                  // Only update if a scrapbook node is selected (not sticky notes)
                  const scrapbookNodes = selectedNodes.filter(n => n.type === 'scrapbookNode');
                  if (scrapbookNodes.length === 1) {
                    // Find the full node data from allNodes
                    const nodeData = allNodes.find(n => n.id === scrapbookNodes[0].id);
                    if (nodeData && selectedNode?.id !== nodeData.id) {
                      setSelectedNode(nodeData);
                    }
                  }
                  // Don't clear selectedNode when selection is empty - keep the last selected node
                }}
              >
                <Controls />
                <Background variant="dots" gap={12} size={1} />
                <Panel position="bottom-right">
                  <Paper sx={{ p: 1.5, backgroundColor: 'rgba(255,255,255,0.95)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                      {t('scrapbook:legendTitle')}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: 'rgba(0, 100, 255, 0.1)', border: '2px solid rgb(0, 100, 255)' }} />
                        <Typography variant="caption">{t('scrapbook:legendHighPriority')}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#ffb74d', border: '2px solid #e65100' }} />
                        <Typography variant="caption">{t('scrapbook:legendAlternativeOption')}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#fffde7', border: '2px solid gold' }} />
                        <Typography variant="caption">{t('scrapbook:legendSelectedActive')}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#fafafa', border: '2px solid #9e9e9e' }} />
                        <Typography variant="caption">{t('scrapbook:legendLowAttention')}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#ffffff', border: '2px solid #000000' }} />
                        <Typography variant="caption">{t('scrapbook:legendDefault')}</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Panel>
              </ReactFlow>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
                <Typography variant="h6" color="text.secondary">
                  {t('scrapbook:emptyTitle')}
                </Typography>
                <Button variant="contained" onClick={handleInitializeExample}>
                  {t('scrapbook:emptyLoadExample')}
                </Button>
              </Box>
            )}
          </Box>
        )}

        {tabValue === 1 && selectedNode && (
          <ScrapbookTopics
            projectName={projectName}
            graphName={graphName}
            parentNode={selectedNode}
            customProperties={customProperties}
            columnConfig={columnConfig}
            onSettingsChange={(settings) => {
              setCustomProperties(settings.customProperties || []);
              setColumnConfig(settings.columnConfig || []);
              // Trigger save
              setTimeout(saveCanvasSettings, 100);
            }}
            onNodeUpdated={async () => {
              await fetchTree();
              await fetchAllNodes();
              // Refresh the selected node to get updated data
              if (selectedNode) {
                try {
                  const response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${selectedNode.id}`);
                  if (response.ok) {
                    const updatedNode = await response.json();
                    setSelectedNode(updatedNode);
                  }
                } catch (error) {
                  console.error('Failed to refresh selected node:', error);
                }
              }
            }}
            onBack={() => setTabValue(0)}
          />
        )}
      </Box>

      {/* Context Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={handleEdit}>
          <ListItemText>{t('scrapbook:contextEdit')}</ListItemText>
        </MenuItem>
        {resolveWikiFilePath(editNode) ? (
          <MenuItem onClick={handleOpenWikiPage}>
            <ListItemText>
              {editNode?.type === 'ProjectTheme'
                ? t('scrapbook:contextOpenWikiIndex', 'Open wiki')
                : t('scrapbook:contextOpenWikiPage', 'Open wiki page')}
            </ListItemText>
          </MenuItem>
        ) : (
          <Tooltip
            title={t(
              'scrapbook:contextOpenWikiPageDisabled',
              'No wiki page linked. Set a wiki slug in Edit.',
            )}
            placement="right"
          >
            <span>
              <MenuItem disabled>
                <ListItemText>
                  {t('scrapbook:contextOpenWikiPage', 'Open wiki page')}
                </ListItemText>
              </MenuItem>
            </span>
          </Tooltip>
        )}
        <MenuItem onClick={handleAddSubcategory}>
          <ListItemText>{t('scrapbook:contextAddSubcategory')}</ListItemText>
        </MenuItem>
        {editNode?.type !== 'ProjectTheme' && (
          <MenuItem onClick={handleDelete}>
            <ListItemText>{t('scrapbook:contextDelete')}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Edit Dialog */}
      <ScrapbookNodeEdit
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditNode(null); setEditParentNode(null); }}
        projectName={projectName}
        graphName={graphName}
        node={editNode}
        parentNode={editParentNode}
        allNodes={allNodes}
        onSaved={handleNodeSaved}
        onNodeUpdated={handleNodeUpdated}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>{t('scrapbook:deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('scrapbook:deleteMessage', { label: nodeToDelete?.label })}
            {nodeToDelete?.children?.length > 0 && (
              <Typography color="error" sx={{ mt: 1 }}>
                {t('scrapbook:deleteChildWarning', { count: nodeToDelete.children.length })}
              </Typography>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create from Text Dialog */}
      <CreateFromTextDialog
        open={createFromTextOpen}
        onClose={() => setCreateFromTextOpen(false)}
        projectName={projectName}
        graphName={graphName}
        onCreated={async () => {
          await fetchTree();
          await fetchAllNodes();
        }}
      />

      {/* Error Snackbar */}
      <Snackbar
        open={errorSnackbar.open}
        autoHideDuration={6000}
        onClose={() => setErrorSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setErrorSnackbar({ open: false, message: '' })}
          severity="error"
          sx={{ width: '100%' }}
        >
          {errorSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
