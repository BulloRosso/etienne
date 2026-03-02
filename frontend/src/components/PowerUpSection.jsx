import React, { useState, useRef } from 'react';
import { Box, Typography, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { GiAtom } from 'react-icons/gi';
import { DeleteOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const SLOTS_PER_SIDE = 4;
const PADDING = 24;

function truncateDescription(desc, wordCount = 10) {
  if (!desc) return '';
  const words = desc.split(/\s+/);
  if (words.length <= wordCount) return desc;
  return words.slice(0, wordCount).join(' ') + '...';
}

export default function PowerUpSection({ skills = [], repoSkills = [], onProvisionSkill, onDeleteSkill }) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuSlotIndex, setMenuSlotIndex] = useState(null);
  const [menuType, setMenuType] = useState(null);

  const activeSkills = skills.filter(s => s.isFromCurrentProject).slice(0, 8);
  const slots = [...Array(8)].map((_, i) => activeSkills[i] || null);

  const availableRepoSkills = repoSkills.filter(
    rs => !skills.some(s => s.isFromCurrentProject && s.name === rs.name)
  );

  const IMAGE_WIDTH = 360;
  const SLOT_HEIGHT = 68;
  const CONNECTOR_OVERLAP = 50;
  const SLOT_WIDTH_CSS = `calc((100% - ${IMAGE_WIDTH}px) / 2 - ${PADDING}px)`;
  const DOT_SIZE = 8;

  const EDGE_PADDING = 24;
  const INNER_SPACING = 80;
  const CONTAINER_HEIGHT = 2 * EDGE_PADDING + SLOTS_PER_SIDE * SLOT_HEIGHT + (SLOTS_PER_SIDE - 1) * INNER_SPACING;
  const IMAGE_HEIGHT = CONTAINER_HEIGHT;

  const getSlotYPositions = () => {
    return [...Array(SLOTS_PER_SIDE)].map((_, i) =>
      EDGE_PADDING + i * (SLOT_HEIGHT + INNER_SPACING)
    );
  };

  const yPositions = getSlotYPositions();

  const getLayout = (index) => ({
    side: index < SLOTS_PER_SIDE ? 'left' : 'right',
    yPos: yPositions[index % SLOTS_PER_SIDE],
  });

  // Graduated Y offsets for connector endpoints
  const DOT_OFFSETS = [72, 43, -43, -72];

  const handleSlotClick = (event, slotIndex, skill) => {
    if (skill) {
      setMenuAnchor(event.currentTarget);
      setMenuSlotIndex(slotIndex);
      setMenuType('unequip');
    } else if (availableRepoSkills.length > 0) {
      setMenuAnchor(event.currentTarget);
      setMenuSlotIndex(slotIndex);
      setMenuType('equip');
    }
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuSlotIndex(null);
    setMenuType(null);
  };

  const handleQuickProvision = (repoSkill) => {
    if (onProvisionSkill) onProvisionSkill(repoSkill);
    handleMenuClose();
  };

  const handleUnequip = (skillName) => {
    if (onDeleteSkill) onDeleteSkill(skillName);
    handleMenuClose();
  };

  const clickedSlotSkill = menuSlotIndex !== null ? slots[menuSlotIndex] : null;

  return (
    <Box sx={{
      pt: '24px',
      pb: 0,
      px: `${PADDING}px`,
      overflow: 'auto',
    }}>
      <Box
        sx={{
          position: 'relative',
          height: CONTAINER_HEIGHT,
          width: '100%',
        }}
      >
        {/* Description overlay at top center */}
        <Typography
          sx={{
            position: 'absolute',
            top: -16,
            left: 0,
            right: 0,
            py: '6px',
            textAlign: 'left',
            fontSize: '0.9rem',
            color: '#666',
            paddingLeft: '10px',
            lineHeight: 1.4,
            zIndex: 6,
          }}
        >
          {t('skills.powerUpDescription')}
        </Typography>
        {/* Center mech image */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: IMAGE_WIDTH,
            height: IMAGE_HEIGHT,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src="/power-up.png"
            alt="Power Up"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 16px rgba(218, 165, 32, 0.4))',
            }}
          />
        </Box>

        {/* Skill slot boxes + connectors */}
        {slots.map((skill, i) => {
          const layout = getLayout(i);
          const isLeft = layout.side === 'left';
          const hasSkill = !!skill;
          const slotIndexInCol = i % SLOTS_PER_SIDE;
          const slotCenterY = layout.yPos + SLOT_HEIGHT / 2;
          const dotYOffset = DOT_OFFSETS[slotIndexInCol];
          const color = hasSkill ? 'gold' : '#546e7a';

          // Connector: line from icon disc center (or slot edge) to dot overlapping the image
          // The icon disc is at ±20px from slot edge, so connector starts at the disc center
          // Dot end: CONNECTOR_OVERLAP px into the image from image edge
          // We use CSS calc for horizontal positions since layout is fluid

          const dotEndY = slotCenterY + dotYOffset;

          // Connector spans from slot edge (where icon disc sits) to dot endpoint inside the image
          // Left slot: right edge at calc((100% - IMAGE_WIDTH)/2 - PADDING), icon disc center at right edge
          // Gap from slot edge to image edge = PADDING (24px)
          // Connector total width = PADDING + CONNECTOR_OVERLAP
          const CONNECTOR_WIDTH = PADDING + CONNECTOR_OVERLAP;

          return (
            <React.Fragment key={i}>
              {/* Connector dot (endpoint overlapping into image) */}
              <Box
                sx={{
                  position: 'absolute',
                  top: dotEndY - DOT_SIZE / 2,
                  ...(isLeft
                    ? { left: `calc(50% - ${IMAGE_WIDTH / 2 - CONNECTOR_OVERLAP}px)` }
                    : { left: `calc(50% + ${IMAGE_WIDTH / 2 - CONNECTOR_OVERLAP - DOT_SIZE}px)` }
                  ),
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: '50%',
                  bgcolor: color,
                  zIndex: 3,
                  pointerEvents: 'none',
                  ...(hasSkill && {
                    boxShadow: '0 0 6px 2px rgba(218, 165, 32, 0.7)',
                    animation: 'connectorGlow 2s ease-in-out infinite',
                    '@keyframes connectorGlow': {
                      '0%, 100%': {
                        boxShadow: '0 0 4px 1px rgba(218, 165, 32, 0.4)',
                      },
                      '50%': {
                        boxShadow: '0 0 10px 4px rgba(218, 165, 32, 0.9)',
                      },
                    },
                  }),
                }}
              />

              {/* Connector line using inline SVG — from slot edge to dot inside image */}
              {(() => {
                const svgLeft = isLeft
                  ? `calc(50% - ${IMAGE_WIDTH / 2 + PADDING}px)`
                  : `calc(50% + ${IMAGE_WIDTH / 2 - CONNECTOR_OVERLAP}px)`;

                const minY = Math.min(slotCenterY, dotEndY);
                const maxY = Math.max(slotCenterY, dotEndY);
                const pad = 4;

                const posStyle = {
                  position: 'absolute',
                  top: minY - pad,
                  left: svgLeft,
                  width: CONNECTOR_WIDTH,
                  height: maxY - minY + 2 * pad,
                  pointerEvents: 'none',
                  zIndex: 3,
                };

                const vbHeight = maxY - minY + 2 * pad;
                const y1 = slotCenterY - minY + pad;
                const y2 = dotEndY - minY + pad;

                return (
                  <svg
                    style={posStyle}
                    viewBox={`0 0 ${CONNECTOR_WIDTH} ${vbHeight}`}
                    preserveAspectRatio="none"
                  >
                    <line
                      x1={isLeft ? 0 : CONNECTOR_WIDTH}
                      y1={y1}
                      x2={isLeft ? CONNECTOR_WIDTH : 0}
                      y2={y2}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                );
              })()}

              {/* Skill slot box */}
              <Box
                onClick={(e) => handleSlotClick(e, i, skill)}
                sx={{
                  position: 'absolute',
                  top: layout.yPos,
                  ...(isLeft ? { left: 0 } : { right: 0 }),
                  width: SLOT_WIDTH_CSS,
                  height: SLOT_HEIGHT,
                  border: `1.5px ${hasSkill ? 'solid' : 'dashed'} ${hasSkill ? '#4fc3f7' : '#37474f'}`,
                  borderRadius: '6px',
                  bgcolor: '#f0f7ff',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  px: 1.5,
                  py: 0.5,
                  zIndex: 4,
                  overflow: 'visible',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: 'none',
                  '&:hover': hasSkill
                    ? {
                        borderColor: '#29b6f6',
                      }
                    : {
                        borderColor: '#546e7a',
                      },
                }}
              >
                {/* Skill icon disc with radar border */}
                {hasSkill && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      ...(isLeft ? { right: -22 } : { left: -22 }),
                      transform: 'translateY(-50%)',
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'conic-gradient(from 0deg, navy 0deg, navy 270deg, rgba(218, 165, 32, 0.9) 330deg, navy 360deg)',
                        animation: 'radarSweep 2.5s linear infinite',
                        pointerEvents: 'none',
                      },
                      '@keyframes radarSweep': {
                        '0%': { transform: 'rotate(0deg)' },
                        '100%': { transform: 'rotate(360deg)' },
                      },
                    }}
                  >
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      position: 'relative',
                    }}
                  >
                    {skill.hasThumbnail ? (
                      <img
                        src={`/api/skills/${skill.project}/${skill.name}/thumbnail`}
                        alt={skill.name}
                        style={{ width: 22, height: 22, objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <GiAtom style={{ fontSize: '20px', color: 'navy' }} />
                    )}
                  </Box>
                  </Box>
                )}
                {hasSkill ? (
                  <Box sx={{ overflow: 'hidden', ...(isLeft ? { pr: 2.5 } : { pl: 2.5 }) }}>
                    <Typography
                      sx={{
                        fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
                        fontSize: '0.91rem',
                        fontWeight: 700,
                        color: 'navy',
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.25,
                      }}
                    >
                      {skill.name}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
                        fontSize: '0.75rem',
                        color: 'rgba(0, 0, 128, 0.6)',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {truncateDescription(skill.description)}
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography
                      sx={{
                        fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
                        fontSize: '0.81rem',
                        color: '#546e7a',
                        textAlign: 'center',
                        fontStyle: 'italic',
                      }}
                    >
                      + Power Up!
                    </Typography>
                  </Box>
                )}
              </Box>
            </React.Fragment>
          );
        })}
      </Box>

      {/* Info + status overlay at bottom center */}
      <Typography
        sx={{
          textAlign: 'left',
          color: '#666',
          lineHeight: 1.4,
          fontSize: '0.9rem',
          paddingLeft: '6px',
          mt: 0.5,
          mb: 0,
        }}
      >
        {t('skills.powerUpRecommendation')}
        {' — '}[{activeSkills.length}/8] {t('skills.powerUpStatus')}
      </Typography>

      {/* Context menu for slots */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 280,
              minWidth: 220,
              bgcolor: 'background.paper',
              border: '1px solid rgba(79, 195, 247, 0.2)',
            },
          },
        }}
      >
        {menuType === 'unequip' && clickedSlotSkill && (
          <Box>
            <MenuItem
              onClick={() => handleUnequip(clickedSlotSkill.name)}
              sx={{ py: 0.75, color: '#c62828' }}
            >
              <ListItemIcon sx={{ minWidth: 28, color: '#c62828' }}>
                <DeleteOutline fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={t('skills.powerUpRemove')}
                primaryTypographyProps={{
                  fontSize: '0.78rem',
                }}
              />
            </MenuItem>
          </Box>
        )}
        {menuType === 'equip' && (
          <Box>
            <Typography
              variant="overline"
              sx={{
                px: 2, py: 0.5, display: 'block',
                fontSize: '0.65rem', color: '#4fc3f7', letterSpacing: '0.1em',
              }}
            >
              {t('skills.powerUpEquip')}
            </Typography>
            {availableRepoSkills.map((rs) => (
              <MenuItem key={rs.name} onClick={() => handleQuickProvision(rs)} sx={{ py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  {rs.hasThumbnail ? (
                    <img
                      src={`/api/skills/catalog/${rs.name}/thumbnail?source=${rs.source}`}
                      alt={rs.name}
                      style={{ width: 18, height: 18, objectFit: 'contain' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <GiAtom style={{ fontSize: '16px', color: '#4fc3f7' }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={rs.name}
                  primaryTypographyProps={{
                    fontSize: '0.78rem',
                  }}
                  secondary={truncateDescription(rs.description, 6)}
                  secondaryTypographyProps={{ fontSize: '0.65rem' }}
                />
              </MenuItem>
            ))}
            {availableRepoSkills.length === 0 && (
              <MenuItem disabled>
                <ListItemText
                  primary={t('skills.powerUpNoAvailable')}
                  primaryTypographyProps={{ fontSize: '0.78rem', fontStyle: 'italic' }}
                />
              </MenuItem>
            )}
          </Box>
        )}
      </Menu>
    </Box>
  );
}
