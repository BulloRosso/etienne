import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode } from '@xyflow/react';
import { IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { getFloatingEdgeParams } from './floatingEdgeUtils';

export default function ScrapbookEdge({
  id,
  source,
  target,
  style = {},
  markerEnd,
  selected,
  data,
}) {
  // Floating edge: resolve geometry from the live node positions/sizes rather
  // than fixed side handles, so the line is aimed at each node's center and
  // clipped to its border (auto-picks the nearest side as nodes move).
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(
    sourceNode,
    targetNode,
  );

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 12,
  });

  const onEdgeDelete = (evt) => {
    evt.stopPropagation();
    if (data?.onDelete) {
      // Pass the target (child) ID directly instead of the edge ID
      data.onDelete(target);
    }
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 1,
          stroke: selected ? 'gold' : '#000',
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <IconButton
              size="small"
              onClick={onEdgeDelete}
              sx={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                width: 24,
                height: 24,
                '&:hover': {
                  backgroundColor: '#ffebee',
                  borderColor: '#f44336',
                },
              }}
            >
              <Close sx={{ fontSize: 14, color: '#f44336' }} />
            </IconButton>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
