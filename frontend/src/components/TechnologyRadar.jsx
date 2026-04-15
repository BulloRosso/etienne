import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Box, Paper, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Link, Slider, Chip
} from '@mui/material';

const SEGMENT_COLORS = [
  '#DCEEFB', '#B6D7F4', '#90C2ED', '#C5E1F5',
  '#A3D1F0', '#D0E8FA', '#BDD9F2', '#E3F2FD',
];

const EXAMPLE_DATA = {
  clusters: [
    {
      title: 'Solid-State Batteries', size: 564,
      keywords: [
        { title: 'sulfide electrolyte', refs: [
          { url: 'https://patents.google.com/patent/US20230112A1', count: 12 },
          { url: 'https://patents.google.com/patent/US20230415B2', count: 8 },
          { url: 'https://patents.google.com/patent/EP3891023A1', count: 5 },
        ]},
        { title: 'lithium metal anode', refs: [
          { url: 'https://patents.google.com/patent/US20220198C1', count: 9 },
          { url: 'https://patents.google.com/patent/JP2023045678A', count: 7 },
        ]},
        { title: 'oxide ceramic separator', refs: [
          { url: 'https://patents.google.com/patent/US20240033D1', count: 6 },
          { url: 'https://patents.google.com/patent/CN115842310A', count: 4 },
        ]},
        { title: 'polymer composite', refs: [
          { url: 'https://patents.google.com/patent/US20230556E2', count: 5 },
        ]},
        { title: 'interface resistance', refs: [
          { url: 'https://patents.google.com/patent/WO2023112233A1', count: 3 },
          { url: 'https://patents.google.com/patent/US20230789F1', count: 2 },
        ]},
        { title: 'garnet-type LLZO', refs: [
          { url: 'https://patents.google.com/patent/US20240501A1', count: 8 },
          { url: 'https://patents.google.com/patent/EP4201234A1', count: 4 },
        ]},
        { title: 'thin-film deposition', refs: [
          { url: 'https://patents.google.com/patent/US20240502B1', count: 6 },
        ]},
        { title: 'dendrite suppression', refs: [
          { url: 'https://patents.google.com/patent/US20240503C1', count: 4 },
          { url: 'https://patents.google.com/patent/JP2024501234A', count: 3 },
        ]},
        { title: 'cold sintering', refs: [
          { url: 'https://patents.google.com/patent/US20240504D1', count: 3 },
        ]},
        { title: 'stack pressure control', refs: [
          { url: 'https://patents.google.com/patent/WO2024501234A1', count: 2 },
        ]},
      ]
    },
    {
      title: 'Cathode Materials', size: 478,
      keywords: [
        { title: 'NMC 811', refs: [
          { url: 'https://patents.google.com/patent/US20230201G1', count: 15 },
          { url: 'https://patents.google.com/patent/EP3902145B1', count: 10 },
        ]},
        { title: 'lithium iron phosphate', refs: [
          { url: 'https://patents.google.com/patent/US20220312H2', count: 11 },
          { url: 'https://patents.google.com/patent/CN116023987A', count: 8 },
        ]},
        { title: 'cobalt-free cathode', refs: [
          { url: 'https://patents.google.com/patent/US20240088I1', count: 7 },
        ]},
        { title: 'single crystal morphology', refs: [
          { url: 'https://patents.google.com/patent/US20230445J2', count: 6 },
          { url: 'https://patents.google.com/patent/JP2024011234A', count: 3 },
        ]},
        { title: 'surface coating', refs: [
          { url: 'https://patents.google.com/patent/US20230667K1', count: 4 },
        ]},
        { title: 'high-voltage spinel', refs: [
          { url: 'https://patents.google.com/patent/WO2024055678A1', count: 3 },
        ]},
        { title: 'manganese-rich layered', refs: [
          { url: 'https://patents.google.com/patent/US20240505E1', count: 9 },
          { url: 'https://patents.google.com/patent/CN116505234A', count: 5 },
        ]},
        { title: 'olivine nanoparticles', refs: [
          { url: 'https://patents.google.com/patent/US20240506F1', count: 5 },
        ]},
        { title: 'gradient concentration', refs: [
          { url: 'https://patents.google.com/patent/US20240507G1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4205678A1', count: 3 },
        ]},
        { title: 'doped spinel oxide', refs: [
          { url: 'https://patents.google.com/patent/US20240508H1', count: 3 },
        ]},
        { title: 'sulfur cathode', refs: [
          { url: 'https://patents.google.com/patent/JP2024505678A', count: 2 },
        ]},
      ]
    },
    {
      title: 'Anode Technologies', size: 392,
      keywords: [
        { title: 'silicon-carbon composite', refs: [
          { url: 'https://patents.google.com/patent/US20230102L1', count: 14 },
          { url: 'https://patents.google.com/patent/EP3945201A1', count: 9 },
          { url: 'https://patents.google.com/patent/CN116234567A', count: 6 },
        ]},
        { title: 'graphite intercalation', refs: [
          { url: 'https://patents.google.com/patent/US20220455M2', count: 8 },
        ]},
        { title: 'lithium titanate', refs: [
          { url: 'https://patents.google.com/patent/US20240201N1', count: 5 },
          { url: 'https://patents.google.com/patent/JP2023078901A', count: 4 },
        ]},
        { title: 'pre-lithiation', refs: [
          { url: 'https://patents.google.com/patent/US20230334O2', count: 6 },
        ]},
        { title: 'nano-structured anode', refs: [
          { url: 'https://patents.google.com/patent/WO2023198765A1', count: 3 },
        ]},
        { title: 'hard carbon microspheres', refs: [
          { url: 'https://patents.google.com/patent/US20240509I1', count: 7 },
          { url: 'https://patents.google.com/patent/CN116509876A', count: 4 },
        ]},
        { title: 'tin alloy anode', refs: [
          { url: 'https://patents.google.com/patent/US20240510J1', count: 5 },
        ]},
        { title: 'SEI engineering', refs: [
          { url: 'https://patents.google.com/patent/US20240511K1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4209876A1', count: 3 },
        ]},
        { title: 'dry anode processing', refs: [
          { url: 'https://patents.google.com/patent/US20240512L1', count: 3 },
        ]},
        { title: 'copper foil thinning', refs: [
          { url: 'https://patents.google.com/patent/WO2024509876A1', count: 2 },
        ]},
      ]
    },
    {
      title: 'Electrolyte Systems', size: 310,
      keywords: [
        { title: 'gel polymer electrolyte', refs: [
          { url: 'https://patents.google.com/patent/US20230078P1', count: 10 },
          { url: 'https://patents.google.com/patent/EP3978342A1', count: 7 },
        ]},
        { title: 'ionic liquid additive', refs: [
          { url: 'https://patents.google.com/patent/US20240156Q2', count: 8 },
        ]},
        { title: 'fluorinated solvent', refs: [
          { url: 'https://patents.google.com/patent/US20230289R1', count: 6 },
          { url: 'https://patents.google.com/patent/CN115678901A', count: 4 },
        ]},
        { title: 'SEI stabilizer', refs: [
          { url: 'https://patents.google.com/patent/US20230412S2', count: 5 },
        ]},
        { title: 'wide temperature range', refs: [
          { url: 'https://patents.google.com/patent/JP2024034567A', count: 3 },
        ]},
        { title: 'concentrated salt solution', refs: [
          { url: 'https://patents.google.com/patent/US20240513M1', count: 7 },
          { url: 'https://patents.google.com/patent/CN116513456A', count: 4 },
        ]},
        { title: 'single-ion conductor', refs: [
          { url: 'https://patents.google.com/patent/US20240514N1', count: 5 },
        ]},
        { title: 'flame retardant additive', refs: [
          { url: 'https://patents.google.com/patent/US20240515O1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4213456A1', count: 2 },
        ]},
        { title: 'dual-salt formulation', refs: [
          { url: 'https://patents.google.com/patent/US20240516P1', count: 3 },
        ]},
        { title: 'polymer-in-salt', refs: [
          { url: 'https://patents.google.com/patent/WO2024513456A1', count: 2 },
        ]},
      ]
    },
    {
      title: 'Cell Manufacturing', size: 445,
      keywords: [
        { title: 'dry electrode coating', refs: [
          { url: 'https://patents.google.com/patent/US20230045T1', count: 13 },
          { url: 'https://patents.google.com/patent/EP4012456A1', count: 9 },
        ]},
        { title: 'laser tab welding', refs: [
          { url: 'https://patents.google.com/patent/US20240178U2', count: 7 },
          { url: 'https://patents.google.com/patent/CN116345678A', count: 5 },
        ]},
        { title: 'pouch cell assembly', refs: [
          { url: 'https://patents.google.com/patent/US20230301V1', count: 8 },
        ]},
        { title: 'formation cycling', refs: [
          { url: 'https://patents.google.com/patent/US20230523W2', count: 6 },
        ]},
        { title: 'electrode calendering', refs: [
          { url: 'https://patents.google.com/patent/WO2024012345A1', count: 4 },
        ]},
        { title: 'quality inline inspection', refs: [
          { url: 'https://patents.google.com/patent/US20240067X1', count: 3 },
        ]},
        { title: 'notching and stacking', refs: [
          { url: 'https://patents.google.com/patent/US20240517Q1', count: 8 },
          { url: 'https://patents.google.com/patent/CN116517890A', count: 5 },
        ]},
        { title: 'electrolyte filling', refs: [
          { url: 'https://patents.google.com/patent/US20240518R1', count: 6 },
        ]},
        { title: 'ultrasonic bonding', refs: [
          { url: 'https://patents.google.com/patent/US20240519S1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4217890A1', count: 3 },
        ]},
        { title: 'vision-guided assembly', refs: [
          { url: 'https://patents.google.com/patent/US20240520T1', count: 3 },
        ]},
        { title: 'continuous lamination', refs: [
          { url: 'https://patents.google.com/patent/WO2024517890A1', count: 2 },
        ]},
      ]
    },
    {
      title: 'Battery Management', size: 287,
      keywords: [
        { title: 'state of health estimation', refs: [
          { url: 'https://patents.google.com/patent/US20230134Y1', count: 11 },
          { url: 'https://patents.google.com/patent/EP4056789A1', count: 7 },
        ]},
        { title: 'cell balancing circuit', refs: [
          { url: 'https://patents.google.com/patent/US20220267Z2', count: 9 },
        ]},
        { title: 'thermal runaway detection', refs: [
          { url: 'https://patents.google.com/patent/US20240089AA', count: 6 },
          { url: 'https://patents.google.com/patent/CN116456789A', count: 4 },
        ]},
        { title: 'fast charge protocol', refs: [
          { url: 'https://patents.google.com/patent/US20230356BB', count: 5 },
        ]},
        { title: 'impedance spectroscopy', refs: [
          { url: 'https://patents.google.com/patent/JP2023112345A', count: 3 },
        ]},
        { title: 'cloud-based diagnostics', refs: [
          { url: 'https://patents.google.com/patent/US20240521U1', count: 7 },
          { url: 'https://patents.google.com/patent/CN116521234A', count: 3 },
        ]},
        { title: 'predictive degradation', refs: [
          { url: 'https://patents.google.com/patent/US20240522V1', count: 5 },
        ]},
        { title: 'multi-cell monitoring', refs: [
          { url: 'https://patents.google.com/patent/US20240523W1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4221234A1', count: 2 },
        ]},
        { title: 'wireless BMS', refs: [
          { url: 'https://patents.google.com/patent/US20240524X1', count: 3 },
        ]},
        { title: 'digital twin modeling', refs: [
          { url: 'https://patents.google.com/patent/WO2024521234A1', count: 2 },
        ]},
      ]
    },
    {
      title: 'Thermal Management', size: 253,
      keywords: [
        { title: 'immersion cooling', refs: [
          { url: 'https://patents.google.com/patent/US20230211CC', count: 10 },
          { url: 'https://patents.google.com/patent/EP4089012A1', count: 6 },
        ]},
        { title: 'phase change material', refs: [
          { url: 'https://patents.google.com/patent/US20240145DD', count: 8 },
        ]},
        { title: 'cold plate design', refs: [
          { url: 'https://patents.google.com/patent/US20230378EE', count: 5 },
          { url: 'https://patents.google.com/patent/CN116567890A', count: 3 },
        ]},
        { title: 'heat pipe integration', refs: [
          { url: 'https://patents.google.com/patent/US20230490FF', count: 4 },
        ]},
        { title: 'thermoelectric module', refs: [
          { url: 'https://patents.google.com/patent/US20240525Y1', count: 6 },
          { url: 'https://patents.google.com/patent/CN116525678A', count: 3 },
        ]},
        { title: 'aerogel insulation', refs: [
          { url: 'https://patents.google.com/patent/US20240526Z1', count: 5 },
        ]},
        { title: 'microchannel cooling', refs: [
          { url: 'https://patents.google.com/patent/US20240527AA1', count: 4 },
          { url: 'https://patents.google.com/patent/EP4225678A1', count: 2 },
        ]},
        { title: 'thermal interface paste', refs: [
          { url: 'https://patents.google.com/patent/US20240528BB1', count: 3 },
        ]},
      ]
    },
    {
      title: 'Recycling & Second Life', size: 198,
      keywords: [
        { title: 'hydrometallurgical recovery', refs: [
          { url: 'https://patents.google.com/patent/US20230056GG', count: 9 },
          { url: 'https://patents.google.com/patent/EP4123456A1', count: 6 },
          { url: 'https://patents.google.com/patent/WO2024067890A1', count: 4 },
        ]},
        { title: 'direct cathode regeneration', refs: [
          { url: 'https://patents.google.com/patent/US20240189HH', count: 7 },
        ]},
        { title: 'black mass processing', refs: [
          { url: 'https://patents.google.com/patent/US20230312II', count: 5 },
        ]},
        { title: 'second-life grading', refs: [
          { url: 'https://patents.google.com/patent/US20230445JJ', count: 4 },
          { url: 'https://patents.google.com/patent/CN116678901A', count: 2 },
        ]},
        { title: 'automated disassembly', refs: [
          { url: 'https://patents.google.com/patent/JP2024056789A', count: 3 },
        ]},
        { title: 'pyrometallurgical smelting', refs: [
          { url: 'https://patents.google.com/patent/US20240529CC1', count: 6 },
          { url: 'https://patents.google.com/patent/CN116529012A', count: 3 },
        ]},
        { title: 'solvent extraction', refs: [
          { url: 'https://patents.google.com/patent/US20240530DD1', count: 4 },
        ]},
        { title: 'battery passport tracking', refs: [
          { url: 'https://patents.google.com/patent/US20240531EE1', count: 3 },
          { url: 'https://patents.google.com/patent/EP4229012A1', count: 2 },
        ]},
        { title: 'electrode delamination', refs: [
          { url: 'https://patents.google.com/patent/US20240532FF1', count: 2 },
        ]},
        { title: 'closed-loop recycling', refs: [
          { url: 'https://patents.google.com/patent/WO2024529012A1', count: 2 },
        ]},
      ]
    },
  ]
};

function preprocessClusters(clusters) {
  return clusters.map(cluster => ({
    ...cluster,
    keywords: cluster.keywords.map(kw => ({
      ...kw,
      importance: kw.refs.reduce((sum, r) => sum + r.count, 0),
    })),
  }));
}

function extractPatentTitle(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

const TechnologyRadar = ({ data = EXAMPLE_DATA }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 700 });
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [activeSegment, setActiveSegment] = useState(null);
  const [density, setDensity] = useState(100);
  const [hiddenSegments, setHiddenSegments] = useState(new Set());

  const allProcessed = useMemo(
    () => data ? preprocessClusters(data.clusters) : [],
    [data]
  );

  const visibleIndices = useMemo(
    () => allProcessed.map((_, i) => i).filter(i => !hiddenSegments.has(i)),
    [allProcessed, hiddenSegments]
  );

  const processed = useMemo(
    () => visibleIndices.map(i => allProcessed[i]),
    [allProcessed, visibleIndices]
  );

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // D3 rendering
  useEffect(() => {
    if (!processed.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorScale = d3.scaleOrdinal(SEGMENT_COLORS);
    const margin = 10;
    const marginTop = 20;
    const maxRadius = 280;
    const radius = Math.min((dimensions.width / 2) - margin, maxRadius);
    if (radius < 60) return;

    const svgHeight = marginTop + radius * 2 + 20;
    const cx = dimensions.width / 2;
    const cy = marginTop + radius;

    svg
      .attr('width', dimensions.width)
      .attr('height', svgHeight)
      .attr('viewBox', `0 0 ${dimensions.width} ${svgHeight}`);

    const g = svg.append('g');

    // Pie layout
    const pie = d3.pie().value(d => d.size).sort(null).padAngle(0.02);
    const arcs = pie(processed);
    const arcGen = d3.arc().innerRadius(0).outerRadius(radius);

    // Draw segments
    g.selectAll('.segment')
      .data(arcs)
      .enter()
      .append('path')
      .attr('class', 'segment')
      .attr('d', arcGen)
      .attr('transform', `translate(${cx},${cy})`)
      .attr('fill', (_, i) => colorScale(i))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .style('opacity', (d, i) => activeSegment === null || activeSegment === i ? 1 : 0.4)
      .on('click', (event, d) => {
        event.stopPropagation();
        const i = arcs.indexOf(d);
        setActiveSegment(prev => prev === i ? null : i);
        setSelectedKeyword(null);
      });

    // Click background to deselect
    svg.on('click', () => {
      setSelectedKeyword(null);
      setActiveSegment(null);
    });

    // Cluster title labels (horizontal)
    arcs.forEach((d, i) => {
      const midAngle = (d.startAngle + d.endAngle) / 2;
      const labelR = radius + 22;
      const lx = cx + labelR * Math.cos(midAngle - Math.PI / 2);
      const ly = cy + labelR * Math.sin(midAngle - Math.PI / 2);

      // Anchor based on which side of the circle the label is on
      const normalizedAngle = midAngle % (2 * Math.PI);
      const textAnchor = normalizedAngle < 0.1 || normalizedAngle > Math.PI * 2 - 0.1
        ? 'middle'
        : normalizedAngle < Math.PI
          ? 'start'
          : 'end';

      g.append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('text-anchor', textAnchor)
        .attr('dominant-baseline', 'central')
        .style('font-size', '11px')
        .style('font-weight', '700')
        .style('fill', '#1e3a5f')
        .style('cursor', 'pointer')
        .text(d.data.title)
        .on('mouseover', function () {
          d3.select(this).style('text-decoration', 'underline');
        })
        .on('mouseout', function () {
          d3.select(this).style('text-decoration', 'none');
        })
        .on('click', (event) => {
          event.stopPropagation();
          const originalIndex = visibleIndices[i];
          setHiddenSegments(prev => {
            const next = new Set(prev);
            next.add(originalIndex);
            return next;
          });
          setActiveSegment(null);
          setSelectedKeyword(null);
        });
    });

    // Keyword placement with overlap resolution
    const fontColorInterp = d3.interpolateRgb('#1a1a1a', '#8a8a8a');
    const allImportances = processed.flatMap(c => c.keywords.map(k => k.importance));
    const impExtent = d3.extent(allImportances);
    const fontSizeScale = d3.scaleLinear().domain(impExtent).range([10, 16]);
    const charWidthFactor = 0.58; // approximate character width relative to font size

    // Phase 1: compute initial positions for all keywords across all segments
    const placements = [];

    arcs.forEach((d, segIndex) => {
      const cluster = d.data;
      const sorted = [...cluster.keywords].sort((a, b) => b.importance - a.importance);
      const visibleCount = Math.max(1, Math.ceil(sorted.length * density / 100));
      const kws = sorted.slice(0, visibleCount);
      const count = kws.length;
      if (!count) return;

      const minR = Math.max(radius * 0.15, 50);
      const maxR = radius * 0.82;
      const angularSpan = d.endAngle - d.startAngle;

      kws.forEach((kw, rank) => {
        const radialPos = count === 1
          ? (minR + maxR) / 2
          : minR + (rank / (count - 1)) * (maxR - minR);

        const angle = d.startAngle + ((rank + 1) / (count + 1)) * angularSpan;
        const x = cx + radialPos * Math.cos(angle - Math.PI / 2);
        const y = cy + radialPos * Math.sin(angle - Math.PI / 2);
        const fontSize = fontSizeScale(kw.importance);
        const halfW = (kw.title.length * fontSize * charWidthFactor) / 2;
        const halfH = fontSize * 0.6 + 5;

        placements.push({
          kw, x, y, fontSize, halfW, halfH,
          clusterTitle: cluster.title, segIndex,
          // segment bounds for constraining
          segStart: d.startAngle, segEnd: d.endAngle, minR, maxR,
        });
      });
    });

    // Phase 2: iterative relaxation to resolve overlaps
    const padding = 3;

    function rectsOverlap(a, b) {
      return Math.abs(a.x - b.x) < (a.halfW + b.halfW + padding)
        && Math.abs(a.y - b.y) < (a.halfH + b.halfH + padding);
    }

    for (let iter = 0; iter < 50; iter++) {
      let moved = false;
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const a = placements[i];
          const b = placements[j];
          if (!rectsOverlap(a, b)) continue;

          // Compute overlap amounts
          const overlapX = (a.halfW + b.halfW + padding) - Math.abs(a.x - b.x);
          const overlapY = (a.halfH + b.halfH + padding) - Math.abs(a.y - b.y);

          // Push apart along the axis with smaller overlap
          if (overlapX < overlapY) {
            const pushX = overlapX / 2 + 0.5;
            const signX = a.x <= b.x ? -1 : 1;
            a.x += signX * pushX;
            b.x -= signX * pushX;
          } else {
            const pushY = overlapY / 2 + 0.5;
            const signY = a.y <= b.y ? -1 : 1;
            a.y += signY * pushY;
            b.y -= signY * pushY;
          }
          moved = true;
        }
      }

      // Constrain: keep labels inside the disc and within their segment's angular range
      for (const p of placements) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Keep within disc radius
        if (dist > p.maxR) {
          const scale = p.maxR / dist;
          p.x = cx + dx * scale;
          p.y = cy + dy * scale;
        }
        // Keep minimum distance from center
        if (dist < p.minR) {
          const scale = p.minR / Math.max(dist, 1);
          p.x = cx + dx * scale;
          p.y = cy + dy * scale;
        }
      }

      if (!moved) break;
    }

    // Phase 3: render keywords at resolved positions
    placements.forEach((p) => {
      const visible = activeSegment === null || activeSegment === p.segIndex;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(dist / p.maxR, 1);

      g.append('text')
        .attr('x', p.x)
        .attr('y', p.y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', `${p.fontSize}px`)
        .style('font-weight', p.kw.importance >= impExtent[1] * 0.6 ? '600' : '400')
        .style('fill', fontColorInterp(t))
        .style('cursor', visible ? 'pointer' : 'default')
        .style('user-select', 'none')
        .style('opacity', visible ? 1 : 0)
        .style('pointer-events', visible ? 'auto' : 'none')
        .text(p.kw.title)
        .on('mouseover', function () {
          d3.select(this).style('text-decoration', 'underline');
        })
        .on('mouseout', function () {
          d3.select(this).style('text-decoration', 'none');
        })
        .on('click', (event) => {
          event.stopPropagation();
          setSelectedKeyword({ ...p.kw, clusterTitle: p.clusterTitle });
        });
    });
  }, [processed, dimensions.width, activeSegment, density, visibleIndices]);

  const sortedRefs = useMemo(() => {
    if (!selectedKeyword) return [];
    return [...selectedKeyword.refs].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [selectedKeyword]);

  return (
    <Box ref={containerRef} sx={{ width: '100%' }}>
      {hiddenSegments.size > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {[...hiddenSegments].sort((a, b) => a - b).map(idx => (
            <Chip
              key={idx}
              label={allProcessed[idx].title}
              size="small"
              onClick={() => {
                setHiddenSegments(prev => {
                  const next = new Set(prev);
                  next.delete(idx);
                  return next;
                });
              }}
              onDelete={() => {
                setHiddenSegments(prev => {
                  const next = new Set(prev);
                  next.delete(idx);
                  return next;
                });
              }}
            />
          ))}
        </Box>
      )}
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Density
            </Typography>
            <Slider
              size="small"
              value={density}
              onChange={(_, v) => setDensity(v)}
              min={10}
              max={100}
              step={5}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v}%`}
              sx={{ maxWidth: 140 }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Click a segment to focus
          </Typography>
        </Box>
      </Paper>

      {selectedKeyword && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            {selectedKeyword.title}
            <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: '0.85rem' }}>
              ({selectedKeyword.clusterTitle}) — {selectedKeyword.importance} total references
            </Typography>
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Patent / Item</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="right">Count</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Link</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRefs.map((ref, index) => (
                  <TableRow
                    key={ref.url}
                    sx={{ backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.03)' }}
                  >
                    <TableCell>{extractPatentTitle(ref.url)}</TableCell>
                    <TableCell align="right">{ref.count}</TableCell>
                    <TableCell>
                      <Link href={ref.url} target="_blank" rel="noopener noreferrer" underline="hover">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export { EXAMPLE_DATA };
export default TechnologyRadar;
