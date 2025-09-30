import React, { useRef, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Container, TextField, Button, Stack, Grid, Paper, List, ListItem, ListItemText } from '@mui/material';
import ResponsePane from './components/ResponsePane.tsx';
import TokenConsumptionPane from './components/TokenConsumptionPane.tsx';

const API = ''; // use Vite proxy to backend

export default function App() {
  const [project, setProject] = useState('demo1');
  const [prompt, setPrompt] = useState('Create two files under out/: a.txt and b.txt with short content.');
  const [streaming, setStreaming] = useState(false);
  const [response, setResponse] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [usage, setUsage] = useState();
  const [files, setFiles] = useState([]);

  const esRef = useRef(null);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const run = async () => {
    setResponse(''); setFiles([]); setUsage(undefined); setStreaming(true);
    await fetch(`/api/claude/addFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_dir: project, file_name: 'CLAUDE.md', file_content: `# ${project}\n` })
    });

    const url = new URL(`/api/claude/streamPrompt`, window.location.origin);
    url.searchParams.set('project_dir', project);
    url.searchParams.set('prompt', prompt);

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.addEventListener('session', (e) => {
      const { session_id } = JSON.parse(e.data);
      setSessionId(session_id);
    });
    es.addEventListener('stdout', (e) => {
      const { chunk } = JSON.parse(e.data);
      setResponse((s) => s + chunk);
    });
    es.addEventListener('usage', (e) => {
      setUsage(JSON.parse(e.data));
    });

    const fetchFile = async (path) => {
      const q = new URL(`/api/claude/getFile`, window.location.origin);
      q.searchParams.set('project_dir', project);
      q.searchParams.set('file_name', path);
      const r = await fetch(q.toString());
      const j = await r.json();
      setFiles((arr) => {
        const next = arr.filter(x => x.path !== path).concat([{ path, content: j.content }]);
        return next;
      });
    };
    es.addEventListener('file_added', (e) => { fetchFile(JSON.parse(e.data).path); });
    es.addEventListener('file_changed', (e) => { fetchFile(JSON.parse(e.data).path); });

    const stop = () => { es.close(); setStreaming(false); };
    es.addEventListener('completed', stop);
    es.addEventListener('error', stop);
  };

  return (
    <>
      <AppBar position="static"><Toolbar><Typography variant="h6">Assistant Tester: Multi Project Separation</Typography></Toolbar></AppBar>
      <Container maxWidth={false} sx={{ mt:2, py: 2, px: 2 }}>
        <Grid container spacing={0} sx={{ gap: '10px' }}>
          <Grid item xs={12} sx={{ width: 'calc(20% - 7px)', flexBasis: 'calc(20% - 7px)', maxWidth: 'calc(20% - 7px)' }}>
            <Stack spacing={2}>
              <TextField
                label="Prompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                multiline
                rows={6}
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField label="Project" value={project} onChange={e => setProject(e.target.value)} size="small" sx={{ flex: 1 }} />
                <Button variant="contained" onClick={run} disabled={streaming}>Run</Button>
                <Button variant="outlined" onClick={() => { esRef.current?.close(); setStreaming(false); }} disabled={!streaming}>Stop</Button>
              </Stack>
            </Stack>
          </Grid>
          <Grid item xs={12} sx={{ width: 'calc(40% - 7px)', flexBasis: 'calc(40% - 7px)', maxWidth: 'calc(40% - 7px)' }}>
            <Stack spacing={0}>
              <ResponsePane streaming={streaming} text={response} sessionId={sessionId} />
              {usage && <TokenConsumptionPane usage={usage} />}
            </Stack>
          </Grid>
          <Grid item xs={12} sx={{ width: 'calc(40% - 7px)', flexBasis: 'calc(40% - 7px)', maxWidth: 'calc(40% - 7px)' }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Files</Typography>
              <List dense>
                {files.map(f => (
                  <ListItem key={f.path} alignItems="flex-start" sx={{ display: 'block' }}>
                    <ListItemText primary={f.path} secondary={
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{f.content}</pre>
                    } />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </>
  );
}
