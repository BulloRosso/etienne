import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';

export default function ScrapbookEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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
