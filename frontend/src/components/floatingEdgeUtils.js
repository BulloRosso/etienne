import { Position } from '@xyflow/react';

// Returns the point where the straight line from the node's center toward
// `target` exits the node's rectangular border, plus the side it exits on.
// Adapted from the official ReactFlow "simple floating edges" example,
// updated for the v12 internal-node shape (positionAbsolute + measured).
function getNodeCenter(node) {
  const pos = node.internals?.positionAbsolute || node.position;
  const width = node.measured?.width ?? node.width ?? 0;
  const height = node.measured?.height ?? node.height ?? 0;
  return {
    x: pos.x + width / 2,
    y: pos.y + height / 2,
    width,
    height,
  };
}

function getBorderPoint(node, towards) {
  const c = getNodeCenter(node);
  const w = c.width / 2;
  const h = c.height / 2;

  const dx = towards.x - c.x;
  const dy = towards.y - c.y;

  // Degenerate (centers coincide) — fall back to the bottom edge.
  if (dx === 0 && dy === 0) {
    return { x: c.x, y: c.y + h, position: Position.Bottom };
  }

  // Scale the direction vector so it just touches the rectangle border.
  // The limiting axis is whichever hits its half-extent first.
  const scaleX = dx !== 0 ? w / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? h / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  const x = c.x + dx * scale;
  const y = c.y + dy * scale;

  let position;
  if (scaleX < scaleY) {
    position = dx > 0 ? Position.Right : Position.Left;
  } else {
    position = dy > 0 ? Position.Bottom : Position.Top;
  }

  return { x, y, position };
}

// Computes start/end coordinates for an edge that is aimed at both node
// centers but visually clipped to each node's border.
export function getFloatingEdgeParams(sourceNode, targetNode) {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);

  const source = getBorderPoint(sourceNode, targetCenter);
  const target = getBorderPoint(targetNode, sourceCenter);

  return {
    sx: source.x,
    sy: source.y,
    tx: target.x,
    ty: target.y,
    sourcePos: source.position,
    targetPos: target.position,
  };
}
