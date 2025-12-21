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

function ScrapbookInner({ projectName, onClose }) {
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

  // Load canvas settings from backend
  const loadCanvasSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/canvas`);
      if (response.ok) {
        const settings = await response.json();
        if (settings) {
          // Restore expanded nodes
          if (settings.nodes) {
            const expanded = new Set();
            const positions = {};
            settings.nodes.forEach(n => {
              if (n.expanded) expanded.add(n.id);
              positions[n.id] = n.position;
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
  }, [projectName]);

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
          const response = await fetch(`/api/workspace/${projectName}/scrapbook/canvas`);
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
                position: position,
                expanded: expandedNodes.has(nodeId),
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

        await fetch(`/api/workspace/${projectName}/scrapbook/canvas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
      } catch (error) {
        console.error('Failed to save canvas settings:', error);
      }
    }, 500); // Debounce 500ms
  }, [projectName, expandedNodes, reactFlowInstance, autoLayoutMode, stickyNotes, customProperties, columnConfig, canvasSettingsLoaded, savedPositions]);

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/tree`);
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
  }, [projectName]);

  // Fetch all nodes as flat list with group info
  const fetchAllNodes = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes-with-groups`);
      if (response.ok) {
        const data = await response.json();
        setAllNodes(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    }
  }, [projectName]);

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

  // Save immediately on unmount (flush pending saves)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
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
          `/api/workspace/${projectName}/scrapbook/canvas`,
          new Blob([JSON.stringify(settings)], { type: 'application/json' })
        );
      }
    };
  }, [projectName, expandedNodes, reactFlowInstance, autoLayoutMode, stickyNotes, customProperties, columnConfig, savedPositions]);

  // Handle edge (connection) deletion - orphan the child node
  const handleEdgeDelete = useCallback(async (childId) => {
    // childId is passed directly from ScrapbookEdge component
    if (!childId) return;

    try {
      // Update parent to null (orphan the node)
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${childId}/parent`, {
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
  }, [projectName, fetchTree, fetchAllNodes]);

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
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${childId}/parent`, {
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
  }, [projectName, allNodes, fetchTree, fetchAllNodes]);

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
      // Auto-layout mode:
      // - Categories connected bottom of root to top of category
      // - Categories rendered left to right, centered under parent
      // - Subcategories connected bottom of parent to left of subcategory
      // - Subcategories rendered top to bottom with 50px X indent
      const NODE_WIDTH = 260;
      const CATEGORY_SPACING = 280; // Horizontal spacing between categories
      const VERTICAL_SPACING = 120; // Vertical spacing between levels
      const SUBCATEGORY_INDENT = 50; // X indent for subcategories
      const ROOT_Y = 50;

      // Add root node
      const rootNode = tree;
      const categories = rootNode.children || [];

      // Calculate positions for categories (left to right)
      // First category starts at x=100, each subsequent category is CATEGORY_SPACING apart
      const firstCategoryX = 100;
      const lastCategoryX = firstCategoryX + (categories.length - 1) * CATEGORY_SPACING;

      // Root node X is centered between first and last category
      // Account for node width: center of root should align with center of category span
      // Apply -3px offset for visual alignment
      const ROOT_X = (firstCategoryX + lastCategoryX) / 2 - 3;

      const rootExpanded = expandedNodes.has(rootNode.id);
      flowNodes.push(createFlowNode(rootNode, ROOT_X, ROOT_Y, rootExpanded));

      // Process categories left to right (double spacing from root)
      const categoryY = ROOT_Y + VERTICAL_SPACING * 2;

      // Only process categories if root is expanded
      if (rootExpanded) {
        categories.forEach((category, catIndex) => {
          // Position categories from left to right
          const catX = firstCategoryX + catIndex * CATEGORY_SPACING;
          const catExpanded = expandedNodes.has(category.id);

          flowNodes.push(createFlowNode(category, catX, categoryY, catExpanded));
          // Connect root bottom to category top
          flowEdges.push({
            id: `${rootNode.id}-${category.id}`,
            source: rootNode.id,
            target: category.id,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            type: 'scrapbookEdge',
            data: { onDelete: handleEdgeDelete },
          });

          // Process subcategories only if category is expanded
          if (catExpanded) {
            const subcategories = category.children || [];
            let subY = categoryY + VERTICAL_SPACING;

            subcategories.forEach((sub, subIndex) => {
              const subX = catX + SUBCATEGORY_INDENT; // Indent from parent
              const subExpanded = expandedNodes.has(sub.id);
              flowNodes.push(createFlowNode(sub, subX, subY, subExpanded));
              // Connect category bottom to subcategory left
              flowEdges.push({
                id: `${category.id}-${sub.id}`,
                source: category.id,
                target: sub.id,
                sourceHandle: 'bottom',
                targetHandle: 'left',
                type: 'scrapbookEdge',
                data: { onDelete: handleEdgeDelete },
              });

              // Process deeper levels recursively with same indent pattern
              const processDeeper = (node, parentX, parentY, depth) => {
                if (!expandedNodes.has(node.id)) return; // Only process if parent is expanded
                const children = node.children || [];
                let childY = parentY + VERTICAL_SPACING;
                children.forEach((child) => {
                  const childX = parentX + SUBCATEGORY_INDENT; // Further indent
                  const childExpanded = expandedNodes.has(child.id);
                  flowNodes.push(createFlowNode(child, childX, childY, childExpanded));
                  // Connect parent bottom to child left
                  flowEdges.push({
                    id: `${node.id}-${child.id}`,
                    source: node.id,
                    target: child.id,
                    sourceHandle: 'bottom',
                    targetHandle: 'left',
                    type: 'scrapbookEdge',
                    data: { onDelete: handleEdgeDelete },
                  });
                  processDeeper(child, childX, childY, depth + 1);
                  childY += VERTICAL_SPACING;
                });
              };

              processDeeper(sub, subX, subY, 3);
              subY += VERTICAL_SPACING * (1 + countVisibleDescendants(sub));
            });
          }
        });
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
        // depth 1 = categories (parent is root) - connect bottom-to-top
        // depth 2+ = subcategories - connect bottom-to-left
        if (parentId) {
          const isCategory = depth === 1;
          flowEdges.push({
            id: `${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            sourceHandle: 'bottom',
            targetHandle: isCategory ? 'top' : 'left',
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
            sourceHandle: 'bottom',
            targetHandle: 'left',
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
      await fetch(`/api/workspace/${projectName}/scrapbook/example-data`, {
        method: 'POST',
      });
      await fetchTree();
      await fetchAllNodes();
    } catch (error) {
      console.error('Failed to initialize example data:', error);
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

    // Calculate positions deterministically using the same algorithm as auto-layout mode
    // This avoids race conditions by computing positions directly rather than waiting for React Flow
    const NODE_WIDTH = 260;
    const CATEGORY_SPACING = 280;
    const VERTICAL_SPACING = 120;
    const SUBCATEGORY_INDENT = 50;
    const ROOT_Y = 50;

    const newPositions = {};
    const rootNode = tree;
    const categories = rootNode.children || [];

    // Calculate root position (centered above categories)
    const firstCategoryX = 100;
    const lastCategoryX = firstCategoryX + (categories.length - 1) * CATEGORY_SPACING;
    const ROOT_X = (firstCategoryX + lastCategoryX) / 2 - 3;

    newPositions[rootNode.id] = { x: ROOT_X, y: ROOT_Y };

    // Process categories left to right
    const categoryY = ROOT_Y + VERTICAL_SPACING * 2;

    categories.forEach((category, catIndex) => {
      const catX = firstCategoryX + catIndex * CATEGORY_SPACING;
      newPositions[category.id] = { x: catX, y: categoryY };

      // Process subcategories recursively
      const processChildren = (node, parentX, parentY) => {
        const children = node.children || [];
        let childY = parentY + VERTICAL_SPACING;

        children.forEach((child) => {
          const childX = parentX + SUBCATEGORY_INDENT;
          newPositions[child.id] = { x: childX, y: childY };

          // Count visible descendants to calculate next sibling's Y position
          const descendantCount = countAllDescendants(child);
          processChildren(child, childX, childY);
          childY += VERTICAL_SPACING * (1 + descendantCount);
        });
      };

      processChildren(category, catX, categoryY);
    });

    // Helper to count all descendants (not just visible ones, since we expand all)
    function countAllDescendants(node) {
      if (!node.children || node.children.length === 0) return 0;
      return node.children.reduce((sum, child) => sum + 1 + countAllDescendants(child), 0);
    }

    // Update saved positions with the calculated layout
    setSavedPositions(newPositions);
    setSavedViewport(null);
    // Keep autoLayoutMode false - we're using saved positions now
    setAutoLayoutMode(false);

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
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/describe/${encodeURIComponent(selectedNode.label)}`);
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
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${nodeToDelete.id}`, {
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
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}`, {
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
  }, [projectName, fetchTree, fetchAllNodes, selectedNode]);

  // Keyboard shortcut for DEL key to delete selected node
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedNode && tabValue === 0) {
        // Don't delete if we're in an input field or dialog
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (editDialogOpen || deleteConfirmOpen) return;

        e.preventDefault();
        deleteNodeDirect(selectedNode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, tabValue, editDialogOpen, deleteConfirmOpen, deleteNodeDirect]);


  const handleNodeSaved = async () => {
    setEditDialogOpen(false);
    await fetchTree();
    await fetchAllNodes();
    // Update selectedNode if it was the one being edited
    if (editNode && selectedNode && editNode.id === selectedNode.id) {
      // Fetch fresh data for the selected node
      try {
        const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${selectedNode.id}`);
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
        const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${selectedNode.id}`);
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
          <Tab label="Mindmap" />
          <Tab label="Topics for selected Element" disabled={!selectedNode} />
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
            <ListItemText>Use example data</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setCreateFromTextOpen(true); setOptionsAnchor(null); }}>
            <ListItemIcon><TextFields fontSize="small" /></ListItemIcon>
            <ListItemText>Create from text</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAutoLayout} disabled={!tree}>
            <ListItemIcon><AccountTree fontSize="small" /></ListItemIcon>
            <ListItemText>Auto-layout</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAddStickyNote}>
            <ListItemIcon><NoteAdd fontSize="small" /></ListItemIcon>
            <ListItemText>Add sticky note</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportAgenticView} disabled={!selectedNode}>
            <ListItemIcon><Download fontSize="small" /></ListItemIcon>
            <ListItemText>Export Agentic View</ListItemText>
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

                  // Handle regular nodes - update savedPositions
                  setSavedPositions(prev => {
                    const updated = { ...prev };
                    currentNodes.forEach(n => {
                      if (!n.id.startsWith('sticky-') && movedNodeIds.has(n.id)) {
                        updated[n.id] = { x: n.position.x, y: n.position.y };
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
                      Color Legend
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: 'rgba(0, 100, 255, 0.1)', border: '2px solid rgb(0, 100, 255)' }} />
                        <Typography variant="caption">High priority & attention</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#ffb74d', border: '2px solid #e65100' }} />
                        <Typography variant="caption">Alternative option (grouped)</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#fffde7', border: '2px solid gold' }} />
                        <Typography variant="caption">Selected / Active</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#fafafa', border: '2px solid #9e9e9e' }} />
                        <Typography variant="caption">Low attention (&lt;30%)</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 16, height: 16, borderRadius: 1, backgroundColor: '#ffffff', border: '2px solid #000000' }} />
                        <Typography variant="caption">Default</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Panel>
              </ReactFlow>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
                <Typography variant="h6" color="text.secondary">
                  No scrapbook data yet
                </Typography>
                <Button variant="contained" onClick={handleInitializeExample}>
                  Load Example Data
                </Button>
              </Box>
            )}
          </Box>
        )}

        {tabValue === 1 && selectedNode && (
          <ScrapbookTopics
            projectName={projectName}
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
                  const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${selectedNode.id}`);
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
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleAddSubcategory}>
          <ListItemText>Add Subcategory</ListItemText>
        </MenuItem>
        {editNode?.type !== 'ProjectTheme' && (
          <MenuItem onClick={handleDelete}>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Edit Dialog */}
      <ScrapbookNodeEdit
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditNode(null); setEditParentNode(null); }}
        projectName={projectName}
        node={editNode}
        parentNode={editParentNode}
        onSaved={handleNodeSaved}
        onNodeUpdated={handleNodeUpdated}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{nodeToDelete?.label}"?
            {nodeToDelete?.children?.length > 0 && (
              <Typography color="error" sx={{ mt: 1 }}>
                This will also delete all {nodeToDelete.children.length} child nodes.
              </Typography>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create from Text Dialog */}
      <CreateFromTextDialog
        open={createFromTextOpen}
        onClose={() => setCreateFromTextOpen(false)}
        projectName={projectName}
        onCreated={async () => {
          await fetchTree();
          await fetchAllNodes();
        }}
      />
    </Box>
  );
}
