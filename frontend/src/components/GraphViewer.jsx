import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import { ZoomIn, ZoomOut, CenterFocusStrong } from '@mui/icons-material';

const GraphViewer = ({ data, width = '100%', height = 600, onNodeClick, onEdgeClick, tripleCount }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const [simulation, setSimulation] = useState(null);
  const [transform, setTransform] = useState(d3.zoomIdentity);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Physics parameters - fixed values
  const chargeStrength = -300;
  const linkDistance = 100;
  const showLabels = true;
  const showTooltips = true;

  // Handle responsive width
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [height]);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    // Process data into nodes and links
    const { nodes, links } = processGraphData(data);

    if (nodes.length === 0) return;

    // Set up SVG
    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('viewBox', [0, 0, dimensions.width, dimensions.height]);

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setTransform(event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Create container group
    const g = svg.append('g');

    // Define arrow markers for edges
    svg.append('defs').selectAll('marker')
      .data(['end'])
      .enter().append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999');

    // Create force simulation
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3.forceCollide().radius(30));

    setSimulation(sim);

    // Create links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.value || 1))
      .attr('marker-end', 'url(#arrowhead)');

    // Create link labels
    const linkLabel = g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(links)
      .enter().append('text')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .style('pointer-events', 'none')
      .style('display', showLabels ? 'block' : 'none')
      .text(d => d.label || '');

    // Create nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circles to nodes
    node.append('circle')
      .attr('r', d => d.size || 10)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onNodeClick) onNodeClick(d);
      })
      .on('mouseover', function(event, d) {
        if (!showTooltips) return;
        d3.select(this)
          .attr('r', (d.size || 10) * 1.5)
          .attr('stroke-width', 3);

        showTooltip(event, d);
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .attr('r', d.size || 10)
          .attr('stroke-width', 2);

        hideTooltip();
      });

    // Add labels to nodes
    node.append('text')
      .attr('dx', 15)
      .attr('dy', 5)
      .attr('font-size', '12px')
      .attr('fill', '#333')
      .style('pointer-events', 'none')
      .style('display', showLabels ? 'block' : 'none')
      .text(d => truncateLabel(d.label || d.id, 20));

    // Tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'graph-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10000);

    function showTooltip(event, d) {
      tooltip.transition()
        .duration(200)
        .style('opacity', 0.9);

      let content = `<strong>${d.label || d.id}</strong><br/>`;
      content += `Type: ${d.type || 'Unknown'}<br/>`;
      if (d.properties) {
        Object.entries(d.properties).forEach(([key, value]) => {
          content += `${key}: ${value}<br/>`;
        });
      }

      tooltip.html(content)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');
    }

    function hideTooltip() {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    }

    // Update positions on each tick
    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      tooltip.remove();
      sim.stop();
    };
  }, [data, dimensions, onNodeClick]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      zoomBehaviorRef.current.scaleBy,
      1.3
    );
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      zoomBehaviorRef.current.scaleBy,
      0.7
    );
  };

  const handleResetView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      zoomBehaviorRef.current.transform,
      d3.zoomIdentity
    );
  };

  return (
    <Box ref={containerRef} sx={{ width: '100%' }}>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        {tripleCount !== undefined && (
          <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            Graph visualization: {tripleCount} triples
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={handleZoomIn}>
              <ZoomIn />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={handleZoomOut}>
              <ZoomOut />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleResetView}>
              <CenterFocusStrong />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      <Paper sx={{ p: 0, overflow: 'hidden', width: '100%' }}>
        <svg ref={svgRef} style={{ border: '1px solid #ddd', display: 'block', width: '100%' }} />
      </Paper>
    </Box>
  );
};

// Helper function to process RDF data into nodes and links
function processGraphData(data) {
  const nodesMap = new Map();
  const links = [];

  // If data is in RDF triple format
  if (Array.isArray(data)) {
    data.forEach((triple, index) => {
      // Handle different triple formats
      const subject = triple.subject?.value || triple.subject || triple.s;
      const predicate = triple.predicate?.value || triple.predicate || triple.p;
      const object = triple.object?.value || triple.object || triple.o;

      if (!subject || !predicate || !object) return;

      // Add subject node
      if (!nodesMap.has(subject)) {
        nodesMap.set(subject, {
          id: subject,
          label: extractLabel(subject),
          type: extractType(subject),
          size: 10
        });
      }

      // Determine if object is a URI (entity/relationship) or a literal (property)
      const isObjectUri = typeof object === 'string' &&
        (object.startsWith('http://') || object.startsWith('https://') ||
         object.startsWith('urn:'));

      if (isObjectUri) {
        // Add object node for URI objects
        if (!nodesMap.has(object)) {
          nodesMap.set(object, {
            id: object,
            label: extractLabel(object),
            type: extractType(object),
            size: 10
          });
        }

        // Add link between entities
        links.push({
          source: subject,
          target: object,
          label: extractLabel(predicate),
          predicate: predicate,
          value: 1
        });
      } else {
        // For literals (property values), store as properties on the subject node
        // These will appear in tooltips but not as separate nodes
        const node = nodesMap.get(subject);
        if (!node.properties) node.properties = {};
        node.properties[extractLabel(predicate)] = object;
      }
    });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: links
  };
}

// Extract readable label from URI
function extractLabel(uri) {
  if (!uri) return 'Unknown';
  if (typeof uri !== 'string') return String(uri);

  // Remove namespace and get last part
  const parts = uri.split(/[/#]/);
  const label = parts[parts.length - 1] || parts[parts.length - 2] || uri;

  // Decode URI components
  try {
    return decodeURIComponent(label);
  } catch (e) {
    return label;
  }
}

// Extract type from URI
function extractType(uri) {
  if (!uri || typeof uri !== 'string') return 'Unknown';

  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes('person')) return 'Person';
  if (lowerUri.includes('company') || lowerUri.includes('firma')) return 'Company';
  if (lowerUri.includes('product') || lowerUri.includes('produkt')) return 'Product';
  if (lowerUri.includes('document')) return 'Document';

  return 'Unknown';
}

// Get color based on node type
function getNodeColor(type) {
  const colors = {
    'Person': '#4A90E2',
    'Company': '#50C878',
    'Product': '#F5A623',
    'Document': '#9B59B6',
    'Unknown': '#95A5A6'
  };
  return colors[type] || colors['Unknown'];
}

// Truncate long labels
function truncateLabel(label, maxLength) {
  if (!label) return '';
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 3) + '...';
}

export default GraphViewer;
