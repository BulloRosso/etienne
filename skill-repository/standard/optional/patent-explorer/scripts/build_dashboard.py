#!/usr/bin/env python3
"""
Patent Explorer — Dashboard Builder

Reads analysis_results.json and generates a single self-contained HTML file
with a React + MUI dashboard.

Usage:
    python build_dashboard.py --input analysis_results.json --output patent_dashboard.html
"""

import argparse
import json
import sys

def build_dashboard(data_json: str) -> str:
    """Generate the full HTML dashboard with embedded data."""

    # Escape for embedding in JS
    escaped_data = data_json.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Patent Technology Landscape — Explorer</title>

<!-- React & ReactDOM -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<!-- Babel for JSX -->
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<!-- MUI -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" />
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
<script src="https://unpkg.com/@mui/material@5/umd/material-ui.production.min.js" crossorigin></script>

<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'Roboto', sans-serif; background: #fafafa; }
  #root { min-height: 100vh; }
</style>
</head>
<body>
<div id="root"></div>

<script>
// Embedded analysis data
const DATA = """ + data_json + """;
</script>

<script type="text/babel">
const {
  AppBar, Toolbar, Typography, Tabs, Tab, Box, Card, CardContent, Chip, Grid,
  List, ListItemButton, ListItemText, ListItemIcon, Checkbox, Paper, Divider,
  Select, MenuItem, FormControl, InputLabel, LinearProgress, Container,
  ThemeProvider, createTheme, CssBaseline, IconButton, Tooltip, Badge
} = MaterialUI;

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

// Cluster color palette
const CLUSTER_COLORS = ['#1976d2', '#dc004e', '#9c27b0', '#ff9800', '#4caf50', '#00bcd4', '#795548'];

// ─── Word Cloud SVG ──────────────────────────────────────────────────
function WordCloud({ keywords, width = 700, height = 380 }) {
  const words = React.useMemo(() => {
    if (!keywords || keywords.length === 0) return [];
    const maxFreq = Math.max(...keywords.map(k => k.frequency));
    const minFreq = Math.min(...keywords.map(k => k.frequency));
    const range = maxFreq - minFreq || 1;

    return keywords.slice(0, 60).map((kw, i) => {
      const norm = (kw.frequency - minFreq) / range;
      const fontSize = 11 + norm * 32;
      return { text: kw.term, size: fontSize, frequency: kw.frequency, index: i };
    });
  }, [keywords]);

  // Spiral placement
  const placements = React.useMemo(() => {
    const placed = [];
    const cx = width / 2;
    const cy = height / 2;

    for (const word of words) {
      let angle = 0;
      let radius = 0;
      let x, y;
      let attempts = 0;
      const approxWidth = word.text.length * word.size * 0.55;
      const approxHeight = word.size * 1.2;

      do {
        x = cx + radius * Math.cos(angle) - approxWidth / 2;
        y = cy + radius * Math.sin(angle) + approxHeight / 3;
        angle += 0.35;
        radius += 0.6;
        attempts++;
      } while (
        attempts < 500 &&
        (x < 10 || x + approxWidth > width - 10 || y < 10 || y > height - 10 ||
          placed.some(p => {
            return Math.abs(x - p.x) < (approxWidth + p.w) * 0.5 &&
                   Math.abs(y - p.y) < (approxHeight + p.h) * 0.6;
          }))
      );

      if (attempts < 500) {
        placed.push({ ...word, x, y, w: approxWidth, h: approxHeight });
      }
    }
    return placed;
  }, [words, width, height]);

  const colors = ['#1976d2', '#1565c0', '#0d47a1', '#dc004e', '#c62828', '#9c27b0',
                  '#7b1fa2', '#4a148c', '#283593', '#1a237e', '#004d40', '#00695c'];

  return (
    <svg width={width} height={height} style={{ display: 'block', margin: '0 auto' }}>
      <rect width={width} height={height} fill="#fff" rx="8" />
      {placements.map((p, i) => (
        <text
          key={i} x={p.x} y={p.y}
          fontSize={p.size}
          fill={colors[i % colors.length]}
          fontFamily="Roboto"
          fontWeight={p.size > 25 ? 700 : 400}
          opacity={0.75 + (p.size / 43) * 0.25}
        >
          {p.text}
        </text>
      ))}
    </svg>
  );
}

// ─── Tab 1: Overview ──────────────────────────────────────────────────
function OverviewTab() {
  const { clusters, keywords } = DATA;
  const sorted = [...clusters].sort((a, b) => b.item_count - a.item_count);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Technology Clusters
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {sorted.map((c, i) => (
          <Grid item xs={12} sm={6} md={4} key={c.id}>
            <Card elevation={2} sx={{ height: '100%', borderTop: `4px solid ${CLUSTER_COLORS[i % CLUSTER_COLORS.length]}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                    {c.label}
                  </Typography>
                  <Chip label={`${c.item_count} items`} size="small" color="primary" />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                  {(c.top_terms || []).map(t => (
                    <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontSize: '0.72rem' }} />
                  ))}
                </Box>
                {/* Mini type bar */}
                {c.type_counts && (
                  <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: '#eee' }}>
                    {Object.entries(c.type_counts).map(([type, count]) => {
                      const pct = (count / c.item_count) * 100;
                      const color = type === 'patent' ? '#1976d2' : type === 'article' ? '#dc004e' : '#ff9800';
                      return <Box key={type} sx={{ width: `${pct}%`, bgcolor: color }} title={`${type}: ${count}`} />;
                    })}
                  </Box>
                )}
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {Object.entries(c.type_counts || {}).map(([type, count]) => (
                    <Typography key={type} variant="caption" color="text.secondary">
                      {type}: {count}
                    </Typography>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Keyword Cloud
      </Typography>
      <Paper elevation={1} sx={{ p: 2, overflow: 'hidden' }}>
        <WordCloud keywords={keywords} width={Math.min(900, window.innerWidth - 80)} height={400} />
      </Paper>
    </Box>
  );
}

// ─── Tab 2: Explore (3-column drill-down) ─────────────────────────────
function ExploreTab() {
  const { clusters, items, links } = DATA;
  const [selectedTech, setSelectedTech] = React.useState([]);
  const [selectedCompanies, setSelectedCompanies] = React.useState([]);
  const [detailType, setDetailType] = React.useState('Patents');

  // Companies in selected clusters
  const companiesInScope = React.useMemo(() => {
    if (selectedTech.length === 0) return [];
    const ids = new Set(selectedTech.flatMap(cid => {
      const cl = clusters.find(c => c.id === cid);
      return cl ? cl.items : [];
    }));
    const cos = new Set();
    items.forEach(it => { if (ids.has(it.id) && it.company) cos.add(it.company); });
    return [...cos].sort();
  }, [selectedTech, clusters, items]);

  // Items in third column
  const detailItems = React.useMemo(() => {
    if (selectedCompanies.length === 0) return [];
    const coSet = new Set(selectedCompanies.map(c => c.toLowerCase()));
    const techIds = new Set(selectedTech.flatMap(cid => {
      const cl = clusters.find(c => c.id === cid);
      return cl ? cl.items : [];
    }));

    if (detailType === 'Patents') {
      return items.filter(it => it.type === 'patent' && techIds.has(it.id) && coSet.has((it.company || '').toLowerCase()));
    } else if (detailType === 'Journal Articles') {
      // Direct articles + linked articles
      const directArticles = items.filter(it => it.type === 'article' && techIds.has(it.id) && coSet.has((it.company || '').toLowerCase()));
      const patentIds = items.filter(it => it.type === 'patent' && techIds.has(it.id) && coSet.has((it.company || '').toLowerCase())).map(it => it.id);
      const linkedArticleIds = new Set(links.filter(l => patentIds.includes(l.patent_id)).map(l => l.article_id));
      const linkedArticles = items.filter(it => it.type === 'article' && linkedArticleIds.has(it.id));
      const merged = [...directArticles];
      linkedArticles.forEach(la => { if (!merged.find(m => m.id === la.id)) merged.push(la); });
      return merged;
    } else if (detailType === 'Persons') {
      return items.filter(it => techIds.has(it.id) && coSet.has((it.company || '').toLowerCase()) && it.person)
                  .map(it => ({ ...it, title: it.person, snippet: `${it.type} — ${it.title}` }));
    }
    return [];
  }, [selectedCompanies, selectedTech, detailType, clusters, items, links]);

  const toggleTech = (cid) => {
    setSelectedTech(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
    setSelectedCompanies([]);
  };

  const toggleCompany = (co) => {
    setSelectedCompanies(prev => prev.includes(co) ? prev.filter(x => x !== co) : [...prev, co]);
  };

  return (
    <Box sx={{ p: 3, display: 'flex', gap: 2, minHeight: 500 }}>
      {/* Column 1: Technologies */}
      <Paper elevation={2} sx={{ width: 260, flexShrink: 0, overflow: 'auto' }}>
        <Box sx={{ p: 1.5, bgcolor: 'primary.main', color: '#fff' }}>
          <Typography variant="subtitle2">Technologies</Typography>
        </Box>
        <List dense>
          {clusters.sort((a, b) => b.item_count - a.item_count).map(c => (
            <ListItemButton key={c.id} onClick={() => toggleTech(c.id)} selected={selectedTech.includes(c.id)}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Checkbox edge="start" checked={selectedTech.includes(c.id)} size="small" />
              </ListItemIcon>
              <ListItemText
                primary={c.label}
                secondary={`${c.item_count} items`}
                primaryTypographyProps={{ fontSize: '0.85rem' }}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Column 2: Companies */}
      {selectedTech.length > 0 && (
        <>
          <Divider orientation="vertical" flexItem />
          <Paper elevation={2} sx={{ width: 240, flexShrink: 0, overflow: 'auto' }}>
            <Box sx={{ p: 1.5, bgcolor: 'secondary.main', color: '#fff' }}>
              <Typography variant="subtitle2">Companies</Typography>
            </Box>
            {companiesInScope.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">No companies found in selected clusters.</Typography>
              </Box>
            ) : (
              <List dense>
                {companiesInScope.map(co => (
                  <ListItemButton key={co} onClick={() => toggleCompany(co)} selected={selectedCompanies.includes(co)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={selectedCompanies.includes(co)} size="small" />
                    </ListItemIcon>
                    <ListItemText primary={co} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </>
      )}

      {/* Column 3: Detail items */}
      {selectedCompanies.length > 0 && (
        <>
          <Divider orientation="vertical" flexItem />
          <Paper elevation={2} sx={{ flex: 1, overflow: 'auto' }}>
            <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>View</InputLabel>
                <Select value={detailType} label="View" onChange={e => setDetailType(e.target.value)}>
                  <MenuItem value="Patents">Patents</MenuItem>
                  <MenuItem value="Journal Articles">Journal Articles</MenuItem>
                  <MenuItem value="Persons">Persons</MenuItem>
                </Select>
              </FormControl>
            </Box>
            {detailItems.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">No {detailType.toLowerCase()} found for this selection.</Typography>
              </Box>
            ) : (
              <List dense>
                {detailItems.map(it => (
                  <ListItemButton key={it.id} sx={{ alignItems: 'flex-start' }}>
                    <ListItemText
                      primary={<Typography variant="subtitle2">{it.title}</Typography>}
                      secondary={
                        <React.Fragment>
                          <Typography variant="caption" color="primary" component="span">{it.id}</Typography>
                          {it.snippet && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.78rem' }}>
                              {it.snippet.substring(0, 180)}…
                            </Typography>
                          )}
                        </React.Fragment>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </>
      )}

      {selectedTech.length === 0 && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.secondary">← Select one or more technologies to begin exploring</Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── Tab 3: Notably Different Items ───────────────────────────────────
function OutliersTab() {
  const { outliers, clusters } = DATA;

  if (!outliers || outliers.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">No outliers detected — the dataset may be too small or too homogeneous.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>Notably Different Items</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These items stand out within their assigned cluster — they are the most distinct based on cosine distance from the cluster centroid.
      </Typography>
      <Grid container spacing={2}>
        {outliers.map((o, i) => {
          const cluster = clusters.find(c => c.id === o.cluster_id);
          const colorIdx = clusters.indexOf(cluster);
          const color = CLUSTER_COLORS[colorIdx >= 0 ? colorIdx % CLUSTER_COLORS.length : 0];
          const pct = Math.min(o.distance * 100, 100);

          return (
            <Grid item xs={12} md={6} lg={4} key={o.id}>
              <Card elevation={3} sx={{ borderLeft: `5px solid ${color}`, height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', mb: 0.5 }}>
                    {o.title || o.id}
                  </Typography>
                  <Typography variant="caption" color="primary">{o.id}</Typography>

                  <Box sx={{ mt: 1.5, mb: 1 }}>
                    <Chip
                      label={cluster ? cluster.label : `Cluster ${o.cluster_id}`}
                      size="small"
                      sx={{ bgcolor: color, color: '#fff', fontWeight: 500 }}
                    />
                  </Box>

                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Distance score</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: color } }}
                      />
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{o.distance.toFixed(3)}</Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" sx={{ mb: 1.5, fontStyle: 'italic', color: 'text.secondary' }}>
                    {o.reason}
                  </Typography>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(o.distinctive_terms || []).map(t => (
                      <Chip key={t} label={t} size="small" variant="outlined" color="secondary" sx={{ fontSize: '0.72rem' }} />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

// ─── App ──────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = React.useState(0);

  const totalItems = DATA.items ? DATA.items.length : 0;
  const totalClusters = DATA.clusters ? DATA.clusters.length : 0;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: 0.5 }}>
            Patent Technology Landscape
          </Typography>
          <Chip label={`${totalItems} documents`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', mr: 1 }} />
          <Chip label={`${totalClusters} clusters`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }} />
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="inherit" indicatorColor="secondary"
              sx={{ bgcolor: 'primary.dark', px: 2 }}>
          <Tab label="Overview" />
          <Tab label="Explore" />
          <Tab label="Notably Different" />
        </Tabs>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 0 }}>
        {tab === 0 && <OverviewTab />}
        {tab === 1 && <ExploreTab />}
        {tab === 2 && <OutliersTab />}
      </Container>

      <Box sx={{ textAlign: 'center', py: 2, color: 'text.disabled', fontSize: '0.75rem' }}>
        Patent Explorer Dashboard — Generated by Claude
      </Box>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>"""

    return html


def main():
    parser = argparse.ArgumentParser(description="Patent Explorer — Dashboard Builder")
    parser.add_argument("--input", required=True, help="Path to analysis_results.json")
    parser.add_argument("--output", default="patent_dashboard.html", help="Output HTML path")
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    data_json = json.dumps(data)
    html = build_dashboard(data_json)

    with open(args.output, "w") as f:
        f.write(html)

    print(f"✓ Dashboard written to {args.output}")
    print(f"  {len(html):,} bytes")


if __name__ == "__main__":
    main()
