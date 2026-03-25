import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
  Snackbar,
  Alert,
  CircularProgress,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Paper,
  Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  DeleteOutline as DeleteOutlineIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  Sensors as SensorIcon,
  PrecisionManufacturing as CompressorIcon,
  LinearScale as PipelineIcon,
  Warning as AlertIcon,
  Build as WorkOrderIcon,
  Person as PersonIcon,
  Business as CompanyIcon,
  Inventory as ProductIcon,
  Category as DefaultEntityIcon,
  AutoStories as GuideIcon,
  Dashboard as DashboardIcon,
  AccountTree as RelationsIcon,
  Edit as EditIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as IoIcons from 'react-icons/io5';
import * as BiIcons from 'react-icons/bi';
import * as AiIcons from 'react-icons/ai';
import * as GiIcons from 'react-icons/gi';
import * as FiIcons from 'react-icons/fi';
import * as TbIcons from 'react-icons/tb';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { apiAxios } from '../services/api';

// ── React-icons picker helpers ──

const allReactIcons = {
  ...Object.fromEntries(Object.entries(FaIcons).filter(([k]) => k.startsWith('Fa'))),
  ...Object.fromEntries(Object.entries(MdIcons).filter(([k]) => k.startsWith('Md'))),
  ...Object.fromEntries(Object.entries(IoIcons).filter(([k]) => k.startsWith('Io'))),
  ...Object.fromEntries(Object.entries(BiIcons).filter(([k]) => k.startsWith('Bi'))),
  ...Object.fromEntries(Object.entries(AiIcons).filter(([k]) => k.startsWith('Ai'))),
  ...Object.fromEntries(Object.entries(GiIcons).filter(([k]) => k.startsWith('Gi'))),
  ...Object.fromEntries(Object.entries(FiIcons).filter(([k]) => k.startsWith('Fi'))),
  ...Object.fromEntries(Object.entries(TbIcons).filter(([k]) => k.startsWith('Tb'))),
};

const reactIconNames = Object.keys(allReactIcons);

const POPULAR_ICONS = [
  'FaHome', 'FaBook', 'FaUser', 'FaCog', 'FaHeart', 'FaStar', 'FaFolder', 'FaFile',
  'FaImage', 'FaCamera', 'FaMusic', 'FaVideo', 'FaCar', 'FaPlane', 'FaTree', 'FaLeaf',
  'FaBed', 'FaCouch', 'FaTv', 'FaUtensils', 'FaCoffee', 'FaGift', 'FaShoppingCart', 'FaCreditCard',
  'FaTruck', 'FaBox', 'FaWarehouse', 'FaIndustry', 'FaTools', 'FaLaptop', 'FaMicrochip', 'FaMemory',
  'MdHome', 'MdWork', 'MdSchool', 'MdFavorite', 'MdInventory', 'MdLocalShipping', 'MdFactory',
  'BiHome', 'BiBook', 'BiPackage', 'IoHome', 'IoBook', 'IoBuild',
];

// ── Icon & Color helpers (shared with OntologyCoreEditor) ──

const entityTypeIcons = {
  Sensor: SensorIcon,
  Compressor: CompressorIcon,
  Pipeline: PipelineIcon,
  Alert: AlertIcon,
  WorkOrder: WorkOrderIcon,
  Person: PersonIcon,
  Company: CompanyIcon,
  Product: ProductIcon,
};

const entityTypeColors = {
  Sensor: '#059669',
  Compressor: '#7c3aed',
  Pipeline: '#0ea5e9',
  Alert: '#f59e0b',
  WorkOrder: '#dc2626',
  Person: '#3b82f6',
  Company: '#8b5cf6',
  Product: '#14b8a6',
};

function getEntityIcon(type) {
  return entityTypeIcons[type] || DefaultEntityIcon;
}

function getEntityColor(type) {
  if (entityTypeColors[type]) return entityTypeColors[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

// ── Palettes ──

const darkPalette = {
  bg: '#0d1117',
  panel: '#161b22',
  surface: '#1c2128',
  border: '#30363d',
  text: '#e6edf3',
  textMuted: '#8b949e',
  textDim: '#6e7681',
  accent: '#58a6ff',
  accentSoft: '#58a6ff22',
  danger: '#f85149',
  dangerSoft: '#f8514922',
  success: '#3fb950',
};

const lightPalette = {
  bg: '#ffffff',
  panel: '#f6f8fa',
  surface: '#ffffff',
  border: '#d0d7de',
  text: '#1f2328',
  textMuted: '#656d76',
  textDim: '#8c959f',
  accent: '#0969da',
  accentSoft: '#0969da15',
  danger: '#cf222e',
  dangerSoft: '#cf222e15',
  success: '#1a7f37',
};

// ── Dashboard Tab ──

function DashboardTab({ typeNodes, projectName, onSelectInstance, C, searchQuery, typeIcons, onIconClick }) {
  const [expanded, setExpanded] = useState(new Set());
  const [hoveredInstance, setHoveredInstance] = useState(null);
  const [toast, setToast] = useState(null);
  const [deletedEntity, setDeletedEntity] = useState(null);

  const toggleExpand = (type) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const lowerQuery = searchQuery.toLowerCase();

  const filteredTypeNodes = useMemo(() => {
    if (!lowerQuery) return typeNodes;
    return typeNodes
      .map(tn => {
        const matchingInstances = tn.instances.filter(inst => {
          if (inst.id.toLowerCase().includes(lowerQuery)) return true;
          return Object.values(inst.properties || {}).some(v =>
            String(v).toLowerCase().includes(lowerQuery)
          );
        });
        return matchingInstances.length > 0
          ? { ...tn, instances: matchingInstances, count: matchingInstances.length }
          : null;
      })
      .filter(Boolean);
  }, [typeNodes, lowerQuery]);

  const handleDelete = async (e, entityId) => {
    e.stopPropagation();
    try {
      await apiAxios.delete(
        `/api/decision-support/ontology-entities/${projectName}/${encodeURIComponent(entityId)}`
      );
      setDeletedEntity(entityId);
      setToast({ severity: 'success', message: `Deleted "${entityId}"` });
    } catch (err) {
      setToast({ severity: 'error', message: `Failed to delete: ${err.message}` });
    }
  };

  if (filteredTypeNodes.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <DefaultEntityIcon sx={{ fontSize: 48, color: C.textDim, mb: 1 }} />
        <Typography sx={{ color: C.textMuted, fontSize: 14 }}>
          {searchQuery ? 'No entities match your search.' : 'No entities in this ontology yet.'}
        </Typography>
        <Typography sx={{ color: C.textDim, fontSize: 12, mt: 0.5 }}>
          {searchQuery ? 'Try a different search term.' : 'Use the chat to describe your business domain.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {filteredTypeNodes.map(tn => {
          const Icon = getEntityIcon(tn.type);
          const color = getEntityColor(tn.type);
          const isExpanded = expanded.has(tn.type) || !!searchQuery;
          const visibleInstances = isExpanded ? tn.instances : tn.instances.slice(0, 3);

          return (
            <Box
              key={tn.type}
              sx={{
                minWidth: 0,
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${color}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {/* Type header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2, py: 1.5,
                  background: color + '0a',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {(() => {
                    const customIconName = typeIcons?.[tn.type];
                    const CustomIcon = customIconName ? allReactIcons[customIconName] : null;
                    return (
                      <Tooltip title="Change icon" placement="top">
                        <Box
                          onClick={(e) => { e.stopPropagation(); onIconClick?.(tn.type); }}
                          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', '&:hover': { opacity: 0.7 } }}
                        >
                          {CustomIcon
                            ? <CustomIcon size={20} color={color} />
                            : <Icon sx={{ fontSize: 20, color }} />}
                        </Box>
                      </Tooltip>
                    );
                  })()}
                  <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                    {tn.type}
                  </Typography>
                  <Chip
                    label={tn.count}
                    size="small"
                    sx={{
                      height: 20, fontSize: 11, fontWeight: 700,
                      background: color + '22', color, border: `1px solid ${color}44`,
                    }}
                  />
                </Box>
                {!searchQuery && tn.instances.length > 3 && (
                  <IconButton size="small" onClick={() => toggleExpand(tn.type)} sx={{ color: C.textMuted }}>
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                )}
              </Box>

              {/* Instances */}
              <Box>
                {visibleInstances.map(inst => {
                  if (inst.id === deletedEntity) return null;
                  const isHovered = hoveredInstance === inst.id;
                  const META_KEYS = ['createdAt', 'type', 'updatedAt', 'name'];
                  const propEntries = Object.entries(inst.properties || {})
                    .filter(([k]) => !META_KEYS.includes(k))
                    .slice(0, 3);
                  const createdAt = inst.properties?.createdAt;
                  const formattedDate = createdAt
                    ? new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : null;
                  return (
                    <Box
                      key={inst.id}
                      onMouseEnter={() => setHoveredInstance(inst.id)}
                      onMouseLeave={() => setHoveredInstance(null)}
                      onClick={() => onSelectInstance(inst.id, tn.type)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: 2, py: 1,
                        cursor: 'pointer',
                        borderTop: `1px solid ${C.border}44`,
                        transition: 'background 0.15s',
                        '&:hover': { background: C.accentSoft },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          <Typography sx={{
                            color: C.text, fontSize: 14, fontWeight: 600, fontFamily: 'Roboto, sans-serif',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {inst.properties?.name || (() => {
                              const prefix = tn.type.toLowerCase() + '-';
                              const raw = inst.id.startsWith(prefix) ? inst.id.slice(prefix.length) : inst.id;
                              const label = raw.replace(/-/g, ' ');
                              return label.charAt(0).toUpperCase() + label.slice(1);
                            })()}
                          </Typography>
                          {formattedDate && (
                            <Typography sx={{ color: C.textDim, fontSize: 10, flexShrink: 0 }}>
                              {formattedDate}
                            </Typography>
                          )}
                        </Box>
                        {propEntries.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                            {propEntries.map(([k, v]) => (
                              <Chip
                                key={k}
                                label={`${k.charAt(0).toUpperCase() + k.slice(1)}: ${String(v).slice(0, 20)}`}
                                size="small"
                                sx={{
                                  height: 20, fontSize: 14,
                                  background: C.panel, color: C.textMuted,
                                  border: `1px solid ${C.border}`,
                                }}
                              />
                            ))}
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                        {isHovered && (
                          <Tooltip title="Delete this entity" placement="left">
                            <IconButton
                              size="small"
                              onClick={(e) => handleDelete(e, inst.id)}
                              sx={{ color: C.danger, p: 0.25 }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  );
                })}

                {/* Show more / less button */}
                {!searchQuery && tn.instances.length > 3 && !isExpanded && (
                  <Box
                    onClick={() => toggleExpand(tn.type)}
                    sx={{
                      px: 2, py: 0.75, cursor: 'pointer',
                      borderTop: `1px solid ${C.border}44`,
                      textAlign: 'center',
                      '&:hover': { background: C.accentSoft },
                    }}
                  >
                    <Typography sx={{ color: C.accent, fontSize: 11, fontWeight: 600 }}>
                      Show all {tn.instances.length} →
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ fontSize: 12 }}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}

// ── Relations Tab ──

function RelationsTab({ entityId, entityType, projectName, C }) {
  const [relations, setRelations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedPredicates, setExpandedPredicates] = useState(new Set());
  const [hoveredRel, setHoveredRel] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!entityId || !projectName) return;
    setLoading(true);
    apiAxios.get(`/api/decision-support/ontology-relations/${projectName}/${encodeURIComponent(entityId)}`)
      .then(res => {
        if (res.data?.success) {
          setRelations(res.data);
          // Auto-expand all predicates
          const allPreds = new Set();
          (res.data.outgoing || []).forEach(r => allPreds.add(`out:${r.predicate}`));
          (res.data.incoming || []).forEach(r => allPreds.add(`in:${r.predicate}`));
          setExpandedPredicates(allPreds);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityId, projectName]);

  const togglePredicate = (key) => {
    setExpandedPredicates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!entityId) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <RelationsIcon sx={{ fontSize: 48, color: C.textDim, mb: 1 }} />
        <Typography sx={{ color: C.textMuted, fontSize: 14 }}>
          Select an entity on the Dashboard tab to view its relationships.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const outgoing = relations?.outgoing || [];
  const incoming = relations?.incoming || [];

  // Group by predicate
  const outGroups = {};
  outgoing.forEach(r => {
    if (!outGroups[r.predicate]) outGroups[r.predicate] = [];
    outGroups[r.predicate].push(r);
  });
  const inGroups = {};
  incoming.forEach(r => {
    if (!inGroups[r.predicate]) inGroups[r.predicate] = [];
    inGroups[r.predicate].push(r);
  });

  const hasRelations = outgoing.length > 0 || incoming.length > 0;

  const Icon = getEntityIcon(entityType);
  const color = getEntityColor(entityType);

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1.5, borderBottom: `1px solid ${C.border}` }}>
        <Icon sx={{ fontSize: 22, color }} />
        <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15, fontFamily: 'monospace' }}>
          {entityId}
        </Typography>
        <Chip label={entityType} size="small" sx={{
          height: 20, fontSize: 10, fontWeight: 600,
          background: color + '22', color, border: `1px solid ${color}44`,
        }} />
      </Box>

      {!hasRelations && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ color: C.textMuted, fontSize: 13 }}>
            No relationships found for this entity.
          </Typography>
        </Box>
      )}

      {/* Outgoing relationships */}
      {Object.entries(outGroups).map(([predicate, rels]) => {
        const key = `out:${predicate}`;
        const isOpen = expandedPredicates.has(key);
        return (
          <Box key={key} sx={{ mb: 1 }}>
            <Box
              onClick={() => togglePredicate(key)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 0.75, cursor: 'pointer', borderRadius: 1,
                background: C.panel, border: `1px solid ${C.border}`,
                '&:hover': { background: C.accentSoft },
              }}
            >
              <ArrowForwardIcon sx={{ fontSize: 14, color: C.accent }} />
              <Typography sx={{ color: C.text, fontSize: 12, fontWeight: 600, flex: 1 }}>
                {predicate}
              </Typography>
              <Chip label={rels.length} size="small" sx={{ height: 18, fontSize: 10, background: C.accentSoft, color: C.accent }} />
              {isOpen ? <ExpandLessIcon sx={{ fontSize: 16, color: C.textMuted }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: C.textMuted }} />}
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ pl: 3, pt: 0.5 }}>
                {rels.map((r, idx) => {
                  const relKey = `out:${predicate}:${r.targetId}:${idx}`;
                  const TargetIcon = getEntityIcon(r.targetType);
                  const targetColor = getEntityColor(r.targetType);
                  return (
                    <Box
                      key={relKey}
                      onMouseEnter={() => setHoveredRel(relKey)}
                      onMouseLeave={() => setHoveredRel(null)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 1.5, py: 0.75, borderRadius: 0.5,
                        '&:hover': { background: C.accentSoft },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                        <TargetIcon sx={{ fontSize: 14, color: targetColor }} />
                        <Typography sx={{
                          color: C.text, fontSize: 12, fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {r.targetId}
                        </Typography>
                        {r.targetType && (
                          <Chip label={r.targetType} size="small" sx={{
                            height: 16, fontSize: 9,
                            background: targetColor + '22', color: targetColor, border: `1px solid ${targetColor}44`,
                          }} />
                        )}
                      </Box>
                      <Box sx={{ width: 24, flexShrink: 0 }}>
                        {hoveredRel === relKey && (
                          <Tooltip title="Delete this relationship" placement="left">
                            <IconButton size="small" sx={{ color: C.danger, p: 0.25 }}>
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {/* Incoming relationships */}
      {Object.entries(inGroups).map(([predicate, rels]) => {
        const key = `in:${predicate}`;
        const isOpen = expandedPredicates.has(key);
        return (
          <Box key={key} sx={{ mb: 1 }}>
            <Box
              onClick={() => togglePredicate(key)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 0.75, cursor: 'pointer', borderRadius: 1,
                background: C.panel, border: `1px solid ${C.border}`,
                '&:hover': { background: C.accentSoft },
              }}
            >
              <ArrowBackIcon sx={{ fontSize: 14, color: C.success }} />
              <Typography sx={{ color: C.text, fontSize: 12, fontWeight: 600, flex: 1 }}>
                {predicate}
              </Typography>
              <Chip label={rels.length} size="small" sx={{ height: 18, fontSize: 10, background: C.success + '22', color: C.success }} />
              {isOpen ? <ExpandLessIcon sx={{ fontSize: 16, color: C.textMuted }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: C.textMuted }} />}
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ pl: 3, pt: 0.5 }}>
                {rels.map((r, idx) => {
                  const relKey = `in:${predicate}:${r.sourceId}:${idx}`;
                  const SourceIcon = getEntityIcon(r.sourceType);
                  const sourceColor = getEntityColor(r.sourceType);
                  return (
                    <Box
                      key={relKey}
                      onMouseEnter={() => setHoveredRel(relKey)}
                      onMouseLeave={() => setHoveredRel(null)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 1.5, py: 0.75, borderRadius: 0.5,
                        '&:hover': { background: C.accentSoft },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                        <SourceIcon sx={{ fontSize: 14, color: sourceColor }} />
                        <Typography sx={{
                          color: C.text, fontSize: 12, fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {r.sourceId}
                        </Typography>
                        {r.sourceType && (
                          <Chip label={r.sourceType} size="small" sx={{
                            height: 16, fontSize: 9,
                            background: sourceColor + '22', color: sourceColor, border: `1px solid ${sourceColor}44`,
                          }} />
                        )}
                      </Box>
                      <Box sx={{ width: 24, flexShrink: 0 }}>
                        {hoveredRel === relKey && (
                          <Tooltip title="Delete this relationship" placement="left">
                            <IconButton size="small" sx={{ color: C.danger, p: 0.25 }}>
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ fontSize: 12 }}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}

// ── Modification Guide Tab ──

function ModificationGuideTab({ C }) {
  const sections = [
    {
      title: 'How to add new things',
      icon: <InfoIcon sx={{ fontSize: 18, color: C.accent }} />,
      items: [
        { text: 'Just mention them in conversation:', example: '"We signed a new vendor called Acme Corp"' },
        { text: 'Or be explicit:', example: '"Add a new Customer named Jane Smith with email jane@example.com"' },
      ],
    },
    {
      title: 'How to update things',
      icon: <EditIcon sx={{ fontSize: 18, color: C.accent }} />,
      items: [
        { text: 'Describe the change naturally:', example: '"The Acme Corp order status changed to shipped"' },
        { text: 'Or specify directly:', example: '"Update Jane Smith\'s phone number to 555-1234"' },
      ],
    },
    {
      title: 'How to add new categories',
      icon: <DefaultEntityIcon sx={{ fontSize: 18, color: C.accent }} />,
      items: [
        { text: 'Mention a new type of thing:', example: '"We need to start tracking Warehouses as well"' },
        { text: 'Define with properties:', example: '"Add a new entity type called DeliveryRoute with properties: origin, destination, distance"' },
      ],
    },
    {
      title: 'How to define relationships',
      icon: <RelationsIcon sx={{ fontSize: 18, color: C.accent }} />,
      items: [
        { text: 'Describe connections naturally:', example: '"Acme Corp supplies Widget Pro"' },
        { text: 'Or state them:', example: '"Jane Smith works at Globex Corporation"' },
      ],
    },
    {
      title: 'How to remove things',
      icon: <DeleteOutlineIcon sx={{ fontSize: 18, color: C.danger }} />,
      items: [
        { text: 'Use the trash icon on the Dashboard or Relations tab to remove entities and relationships directly.' },
        { text: 'Or tell the assistant:', example: '"Remove vendor Acme Corp from the system"' },
      ],
    },
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 640, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ color: C.text, fontSize: 18, fontWeight: 700, mb: 0.5 }}>
          How to modify your knowledge base
        </Typography>
        <Typography sx={{ color: C.textMuted, fontSize: 13, lineHeight: 1.6 }}>
          Your assistant learns from every message — you don't need special commands.
          Just talk naturally and relevant information will be captured automatically.
        </Typography>
      </Box>

      {sections.map((section, idx) => (
        <Box
          key={idx}
          sx={{
            mb: 2,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, background: C.panel }}>
            {section.icon}
            <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
              {section.title}
            </Typography>
          </Box>
          <Box sx={{ px: 2, py: 1.5 }}>
            {section.items.map((item, i) => (
              <Box key={i} sx={{ mb: i < section.items.length - 1 ? 1.5 : 0 }}>
                <Typography sx={{ color: C.textMuted, fontSize: 12, lineHeight: 1.5 }}>
                  {item.text}
                </Typography>
                {item.example && (
                  <Box sx={{
                    mt: 0.5, px: 1.5, py: 0.75,
                    background: C.accentSoft,
                    borderRadius: 1,
                    borderLeft: `3px solid ${C.accent}`,
                  }}>
                    <Typography sx={{ color: C.text, fontSize: 12, fontStyle: 'italic', fontFamily: 'monospace' }}>
                      {item.example}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      ))}

      <Box sx={{
        mt: 3, p: 2,
        background: C.accentSoft,
        border: `1px solid ${C.accent}33`,
        borderRadius: 2,
      }}>
        <Typography sx={{ color: C.accent, fontSize: 13, fontWeight: 700, mb: 0.5 }}>
          Tips
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          <Typography component="li" sx={{ color: C.text, fontSize: 12, lineHeight: 1.8 }}>
            I learn from every message — you don't need special commands
          </Typography>
          <Typography component="li" sx={{ color: C.text, fontSize: 12, lineHeight: 1.8 }}>
            I'll ask for confirmation before making big changes
          </Typography>
          <Typography component="li" sx={{ color: C.text, fontSize: 12, lineHeight: 1.8 }}>
            You can always review everything on the Dashboard tab
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Main KnowledgeViewer ──

export default function KnowledgeViewer({ filename, projectName }) {
  const { mode: themeMode } = useThemeMode();
  const C = themeMode === 'dark' ? darkPalette : lightPalette;

  const [activeTab, setActiveTab] = useState(0);
  const [knowledgeMeta, setKnowledgeMeta] = useState(null);
  const [typeNodes, setTypeNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstance, setSelectedInstance] = useState(null); // { id, type }

  // Icon picker state
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerType, setIconPickerType] = useState(null); // entity type being edited
  const [iconSearch, setIconSearch] = useState('');

  const typeIcons = knowledgeMeta?.typeIcons || {};

  const filteredPickerIcons = useMemo(() => {
    if (!iconSearch) return POPULAR_ICONS;
    const search = iconSearch.toLowerCase();
    return reactIconNames.filter(name => name.toLowerCase().includes(search)).slice(0, 30);
  }, [iconSearch]);

  const handleIconClick = useCallback((entityType) => {
    setIconPickerType(entityType);
    setIconSearch('');
    setIconPickerOpen(true);
  }, []);

  const handleIconSelect = useCallback(async (iconName) => {
    setIconPickerOpen(false);
    if (!knowledgeMeta || !filename || !projectName) return;

    const updatedMeta = {
      ...knowledgeMeta,
      typeIcons: { ...knowledgeMeta.typeIcons, [iconPickerType]: iconName },
      updatedAt: new Date().toISOString(),
    };
    // Remove key if icon cleared
    if (!iconName) delete updatedMeta.typeIcons[iconPickerType];

    setKnowledgeMeta(updatedMeta);

    try {
      await apiAxios.put(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${filename}`,
        { content: JSON.stringify(updatedMeta, null, 2) },
      );
    } catch (err) {
      console.error('Failed to save icon to .knowledge file:', err);
    }
  }, [knowledgeMeta, iconPickerType, filename, projectName]);

  // Load .knowledge file metadata
  useEffect(() => {
    if (!filename || !projectName) return;
    apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`)
      .then(res => res.ok ? res.text() : null)
      .then(text => {
        if (text) {
          try { setKnowledgeMeta(JSON.parse(text)); } catch { setKnowledgeMeta({ name: filename.replace('.knowledge', '') }); }
        }
      })
      .catch(() => {});
  }, [filename, projectName, refreshKey]);

  // Load ontology graph data
  const loadData = useCallback(() => {
    if (!projectName) return;
    setLoading(true);
    apiAxios.get(`/api/decision-support/ontology-graph/${projectName}`)
      .then(res => {
        if (res.data?.success) {
          setTypeNodes(res.data.typeNodes || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectName]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  // Auto-refresh on claudeHook
  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.detail?.hook === 'PostHook' && event.detail?.file) {
        const normalizedFile = event.detail.file.replace(/\\/g, '/');
        const normalizedFilename = filename.replace(/\\/g, '/');
        if (normalizedFile === normalizedFilename || normalizedFile.endsWith('/' + normalizedFilename)) {
          setRefreshKey(prev => prev + 1);
        }
      }
    };
    window.addEventListener('claudeHook', handleClaudeHook);
    return () => window.removeEventListener('claudeHook', handleClaudeHook);
  }, [filename]);

  // Knowledge-acquired toast state
  const [knowledgeToast, setKnowledgeToast] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Listen for knowledge-acquired events and auto-refresh
  useEffect(() => {
    const handleKnowledgeAcquired = (event) => {
      const detail = event.detail || {};
      const message = detail.summary || `Learned from ${detail.document || 'document'}`;
      setKnowledgeToast(message);
      // Trigger fade-in
      requestAnimationFrame(() => setToastVisible(true));
      // Auto-refresh data
      setRefreshKey(prev => prev + 1);
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToastVisible(false);
        setTimeout(() => setKnowledgeToast(null), 500); // wait for fade-out
      }, 5000);
    };
    window.addEventListener('knowledgeAcquired', handleKnowledgeAcquired);
    return () => window.removeEventListener('knowledgeAcquired', handleKnowledgeAcquired);
  }, []);

  const handleSelectInstance = useCallback((id, type) => {
    setSelectedInstance({ id, type });
    setActiveTab(1); // Switch to Relations tab
  }, []);

  // Filter out type-definition instances (type-def-*) — schema metadata, not user data
  const visibleTypeNodes = useMemo(() => {
    return typeNodes
      .map(tn => {
        const instances = tn.instances.filter(inst => !inst.id.startsWith('type-def-'));
        return instances.length > 0 ? { ...tn, instances, count: instances.length } : null;
      })
      .filter(Boolean);
  }, [typeNodes]);

  const totalEntities = visibleTypeNodes.reduce((sum, tn) => sum + tn.count, 0);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, position: 'relative' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.5,
        borderBottom: `1px solid ${C.border}`,
        background: C.panel,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GuideIcon sx={{ fontSize: 22, color: C.accent }} />
          <Box>
            <Typography sx={{ color: C.text, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
              {knowledgeMeta?.name || 'Knowledge Base'}
            </Typography>
            <Typography sx={{ color: C.textMuted, fontSize: 11 }}>
              {visibleTypeNodes.length} types · {totalEntities} entities
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => setRefreshKey(p => p + 1)} sx={{ color: C.textMuted }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 36,
          borderBottom: `1px solid ${C.border}`,
          px: 1,
          '& .MuiTab-root': {
            minHeight: 36, textTransform: 'none', fontSize: 12, fontWeight: 600,
            color: C.textMuted, py: 0.5,
            '&.Mui-selected': { color: C.accent },
          },
          '& .MuiTabs-indicator': { background: C.accent, height: 2 },
        }}
      >
        <Tab icon={<DashboardIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Dashboard" />
        <Tab
          icon={<RelationsIcon sx={{ fontSize: 16 }} />}
          iconPosition="start"
          label={selectedInstance ? `Relations: ${selectedInstance.id}` : 'Relations'}
        />
        <Tab icon={<GuideIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="How to Modify" />
      </Tabs>

      {/* Search bar (Dashboard only) */}
      {activeTab === 0 && (
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search entities by name or property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: C.textMuted }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: 12, background: C.surface,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.accent + '66' },
                '&.Mui-focused fieldset': { borderColor: C.accent },
              },
              '& .MuiInputBase-input': { color: C.text, py: 0.75 },
            }}
          />
        </Box>
      )}

      {/* Tab content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {activeTab === 0 && (
              <DashboardTab
                typeNodes={visibleTypeNodes}
                projectName={projectName}
                onSelectInstance={handleSelectInstance}
                C={C}
                searchQuery={searchQuery}
                typeIcons={typeIcons}
                onIconClick={handleIconClick}
              />
            )}
            {activeTab === 1 && (
              <RelationsTab
                entityId={selectedInstance?.id}
                entityType={selectedInstance?.type}
                projectName={projectName}
                C={C}
              />
            )}
            {activeTab === 2 && (
              <ModificationGuideTab C={C} />
            )}
          </>
        )}
      </Box>

      {/* Icon Picker Dialog */}
      <Dialog
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Select icon for {iconPickerType}</DialogTitle>
        <DialogContent>
          <TextField
            placeholder="Search icons..."
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2, mt: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />
          <Grid container spacing={1}>
            {filteredPickerIcons.map((name) => {
              const IconComp = allReactIcons[name];
              if (!IconComp) return null;
              const selected = typeIcons[iconPickerType] === name;
              return (
                <Grid item key={name}>
                  <Paper
                    variant={selected ? 'elevation' : 'outlined'}
                    elevation={selected ? 3 : 0}
                    sx={{
                      width: 48, height: 48,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      backgroundColor: selected ? 'primary.light' : 'transparent',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => handleIconSelect(name)}
                  >
                    <IconComp size={24} />
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
          {filteredPickerIcons.length === 0 && (
            <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
              No icons found
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {typeIcons[iconPickerType] && (
            <Button onClick={() => handleIconSelect('')} color="error">
              Clear icon
            </Button>
          )}
          <Button onClick={() => setIconPickerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Knowledge-acquired green success toast — centered at bottom with slow fade-in */}
      {knowledgeToast && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1400,
            opacity: toastVisible ? 1 : 0,
            transition: 'opacity 2s ease-in-out',
            pointerEvents: toastVisible ? 'auto' : 'none',
          }}
        >
          <Alert
            severity="success"
            onClose={() => {
              setToastVisible(false);
              setTimeout(() => setKnowledgeToast(null), 500);
            }}
            sx={{
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              borderRadius: 2,
              minWidth: 280,
              maxWidth: 480,
              '& .MuiAlert-icon': { fontSize: 20 },
            }}
          >
            {knowledgeToast}
          </Alert>
        </Box>
      )}
    </Box>
  );
}
