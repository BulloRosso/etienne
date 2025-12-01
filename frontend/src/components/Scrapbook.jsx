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
import { MoreVert, DataObject, AccountTree, NoteAdd } from '@mui/icons-material';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ScrapbookNode from './ScrapbookNode';
import StickyNoteNode from './StickyNoteNode';
import ScrapbookTopics from './ScrapbookTopics';
import ScrapbookNodeEdit from './ScrapbookNodeEdit';

const nodeTypes = {
  scrapbookNode: ScrapbookNode,
  stickyNote: StickyNoteNode,
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

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [autoLayoutMode, setAutoLayoutMode] = useState(false);
  const [stickyNotes, setStickyNotes] = useState([]);

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
          // Restore auto-layout mode
          if (settings.autoLayoutMode !== undefined) {
            setAutoLayoutMode(settings.autoLayoutMode);
          }
          // Restore sticky notes
          if (settings.stickyNotes) {
            setStickyNotes(settings.stickyNotes);
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
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const currentNodes = reactFlowInstance.getNodes();
        const viewport = reactFlowInstance.getViewport();

        // Build node settings from visible nodes (positions)
        // and merge with expandedNodes for all nodes
        const nodeSettings = {};

        // First, add all visible nodes with their positions
        currentNodes.forEach(n => {
          nodeSettings[n.id] = {
            id: n.id,
            position: n.position,
            expanded: expandedNodes.has(n.id),
          };
        });

        // Then, ensure all expanded nodes are saved (even if not visible)
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
          nodes: Object.values(nodeSettings).filter(n => !n.id.startsWith('sticky-')),
          zoom: viewport.zoom,
          viewport: { x: viewport.x, y: viewport.y },
          autoLayoutMode: autoLayoutMode,
          stickyNotes: stickyNoteData,
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
  }, [projectName, expandedNodes, reactFlowInstance, autoLayoutMode, stickyNotes]);

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

  // Fetch all nodes as flat list
  const fetchAllNodes = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes`);
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
        currentNodes.forEach(n => {
          nodeSettings[n.id] = {
            id: n.id,
            position: n.position,
            expanded: expandedNodes.has(n.id),
          };
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
        };

        // Use sendBeacon for reliable save on unmount
        navigator.sendBeacon(
          `/api/workspace/${projectName}/scrapbook/canvas`,
          new Blob([JSON.stringify(settings)], { type: 'application/json' })
        );
      }
    };
  }, [projectName, expandedNodes, reactFlowInstance, autoLayoutMode, stickyNotes]);

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
            type: 'smoothstep',
            style: { stroke: '#000', strokeWidth: 1 },
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
                type: 'smoothstep',
                style: { stroke: '#000', strokeWidth: 1 },
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
                    type: 'smoothstep',
                    style: { stroke: '#000', strokeWidth: 1 },
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
      // Standard hierarchical layout - use saved positions if available
      const processNode = (node, depth, index, parentId, parentY) => {
        const nodeId = node.id;
        const isExpanded = expandedNodes.has(nodeId);
        const hasChildren = node.children && node.children.length > 0;

        // Calculate default position
        const x = depth * 300;
        const y = parentY !== null ? parentY + index * 120 : index * 120;

        // Use saved positions in standard layout mode
        flowNodes.push(createFlowNode(node, x, y, isExpanded, true));

        // Add edge from parent
        if (parentId) {
          flowEdges.push({
            id: `${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'smoothstep',
            style: { stroke: '#000', strokeWidth: 1 },
          });
        }

        // Process children if expanded
        if (isExpanded && hasChildren) {
          let childY = y;
          node.children.forEach((child, childIndex) => {
            processNode(child, depth + 1, childIndex, nodeId, childY);
            childY += 120;
          });
        }
      };

      processNode(tree, 0, 0, null, 0);
    }

    // Add sticky notes to flow nodes (with lower z-index)
    stickyNotes.forEach(note => {
      flowNodes.push({
        id: note.id,
        type: 'stickyNote',
        position: note.position || { x: 50, y: 50 },
        style: {
          width: note.width || 200,
          height: note.height || 150,
          zIndex: -1, // Lower z-index than regular nodes
        },
        data: {
          content: note.content || '',
          color: note.color || 'gray',
          textAlign: note.textAlign || 'top',
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
            setTimeout(saveCanvasSettings, 100);
          },
        },
      });
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [tree, expandedNodes, selectedNode, autoLayoutMode, savedPositions, stickyNotes, saveCanvasSettings]);

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
  function createFlowNode(node, x, y, isExpanded, useSavedPosition = false) {
    const nodeId = node.id;
    const hasChildren = node.children && node.children.length > 0;

    // Use saved position if available and not in auto-layout mode
    let finalX = x;
    let finalY = y;
    if (useSavedPosition && savedPositions[nodeId]) {
      finalX = savedPositions[nodeId].x;
      finalY = savedPositions[nodeId].y;
    }

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

    // Determine color based on priority and attention
    let borderColor = '#000000';
    let backgroundColor = '#ffffff';
    const isActive = selectedNode?.id === nodeId;

    if (isActive) {
      borderColor = 'gold';
      backgroundColor = '#fffde7';
    } else if (node.attentionWeight < 0.3) {
      borderColor = '#9e9e9e';
      backgroundColor = '#fafafa';
    } else if (node.priority >= 7 && node.attentionWeight >= 0.5) {
      // Blue gradient based on priority (10=dark, 1=light)
      const blueIntensity = Math.floor(255 - (node.priority - 1) * 20);
      borderColor = `rgb(0, ${blueIntensity}, 255)`;
      backgroundColor = `rgba(0, ${blueIntensity}, 255, 0.1)`;
    }

    return {
      id: nodeId,
      type: 'scrapbookNode',
      position: { x: finalX, y: finalY },
      data: {
        ...node,
        isExpanded,
        hasChildren,
        borderWidth,
        borderColor,
        backgroundColor,
        borderRadius,
        isActive,
        onToggleExpand: () => {
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
        },
        onNodeClick: () => {
          setSelectedNode(node);
          setTabValue(1); // Switch to Topics tab
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

  // Auto-layout handler
  const handleAutoLayout = () => {
    if (!tree) return;

    // Expand all nodes
    const allExpanded = expandAllNodes(tree);
    setExpandedNodes(allExpanded);
    // Clear saved positions to use auto-layout positions
    setSavedPositions({});
    setSavedViewport(null);
    setAutoLayoutMode(true);
    setOptionsAnchor(null);
    // Save after layout is applied
    setTimeout(saveCanvasSettings, 200);
  };

  // Add sticky note handler
  const handleAddStickyNote = () => {
    const viewport = reactFlowInstance.getViewport();
    // Position new note in the center of the visible area
    const centerX = (-viewport.x + 400) / viewport.zoom;
    const centerY = (-viewport.y + 300) / viewport.zoom;

    const newNote = {
      id: `sticky-${Date.now()}`,
      content: '',
      position: { x: centerX, y: centerY },
      width: 200,
      height: 150,
    };

    setStickyNotes(prev => [...prev, newNote]);
    setOptionsAnchor(null);
    setTimeout(saveCanvasSettings, 100);
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
          <Tab label="Topics" disabled={!selectedNode} />
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
          <MenuItem onClick={handleAutoLayout} disabled={!tree}>
            <ListItemIcon><AccountTree fontSize="small" /></ListItemIcon>
            <ListItemText>Auto-layout</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleAddStickyNote}>
            <ListItemIcon><NoteAdd fontSize="small" /></ListItemIcon>
            <ListItemText>Add sticky note</ListItemText>
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
                  // Check if any sticky note was resized
                  const resizeChange = changes.find(c => c.type === 'dimensions' && c.id?.startsWith('sticky-'));
                  if (resizeChange) {
                    setTimeout(saveCanvasSettings, 100);
                  }
                }}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView={!savedViewport}
                defaultViewport={savedViewport || undefined}
                minZoom={0.1}
                maxZoom={2}
                onNodeDragStop={saveCanvasSettings}
                onMoveEnd={saveCanvasSettings}
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
    </Box>
  );
}
