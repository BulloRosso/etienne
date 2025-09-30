import React, { useRef, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import ChatPane from './components/ChatPane';
import ArtifactsPane from './components/ArtifactsPane';
import SplitLayout from './components/SplitLayout';
import ProjectMenu from './components/ProjectMenu';

export default function App() {
  const [project, setProject] = useState('demo1');
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [sessionId, setSessionId] = useState('');

  const esRef = useRef(null);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const formatTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const handleSendMessage = async (messageText) => {
    // Add user message
    setMessages(prev => [...prev, {
      role: 'user',
      text: messageText,
      timestamp: formatTime()
    }]);

    setStreaming(true);
    currentMessageRef.current = { role: 'assistant', text: '', timestamp: formatTime() };
    currentUsageRef.current = null;

    // Ensure project file exists
    await fetch(`/api/claude/addFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_dir: project, file_name: 'CLAUDE.md', file_content: `# ${project}\n` })
    });

    // Stream prompt
    const url = new URL(`/api/claude/streamPrompt`, window.location.origin);
    url.searchParams.set('project_dir', project);
    url.searchParams.set('prompt', messageText);

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.addEventListener('session', (e) => {
      const { session_id } = JSON.parse(e.data);
      setSessionId(session_id);
    });

    es.addEventListener('stdout', (e) => {
      const { chunk } = JSON.parse(e.data);
      currentMessageRef.current.text += chunk;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = { ...currentMessageRef.current };
        } else {
          newMessages.push({ ...currentMessageRef.current });
        }
        return newMessages;
      });
    });

    es.addEventListener('usage', (e) => {
      const usage = JSON.parse(e.data);
      currentUsageRef.current = usage;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = {
            ...currentMessageRef.current,
            usage
          };
        }
        return newMessages;
      });
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

    const stop = () => {
      es.close();
      setStreaming(false);
      // Finalize message
      if (currentMessageRef.current.text) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...currentMessageRef.current,
              usage: currentUsageRef.current
            };
          }
          return newMessages;
        });
      }
    };

    es.addEventListener('completed', stop);
    es.addEventListener('error', stop);
  };

  const handleProjectChange = (newProject) => {
    setProject(newProject);
    setMessages([]);
    setFiles([]);
    setSessionId('');
    esRef.current?.close();
    setStreaming(false);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ zIndex: 10 }}>
        <Toolbar>
          <Typography variant="h6">Assistant Tester: Multi Project Separation</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="subtitle1" sx={{ mr: 2, opacity: 0.8 }}>
            [{project}]
          </Typography>
          {sessionId && (
            <Typography variant="caption" sx={{ mr: 2, opacity: 0.7 }}>
              Session: {sessionId}
            </Typography>
          )}
          <ProjectMenu currentProject={project} onProjectChange={handleProjectChange} />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <SplitLayout
          left={<ChatPane messages={messages} onSendMessage={handleSendMessage} streaming={streaming} />}
          right={<ArtifactsPane files={files} />}
        />
      </Box>
    </Box>
  );
}
