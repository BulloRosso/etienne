import { useState, useEffect, useRef } from 'react';
import { authSSEUrl, apiAxios } from '../services/api';

/**
 * LiveHTMLPreview Component
 *
 * Displays an HTML file from /workspace in an iframe and refreshes
 * when receiving claudeHook: PostHook events.
 *
 * Also exposes an HTML→filesystem bridge: the iframe can postMessage
 * { type: 'workspace:write', path, content, encoding?, requestId? } to
 * its parent window and this component will write the file via the
 * authenticated content-management API. Path resolution:
 *   - "/foo/bar.json"  → relative to the project root
 *   - "./bar.json" or "bar.json" → relative to the previewed HTML's folder
 *
 * Props:
 * - filename: string - The HTML file to display (path inside the project)
 * - projectName: string - The project name
 * - className: string (optional) - Additional CSS classes
 */
export default function LiveHTMLPreview({ filename, projectName, className = '' }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef(null);

  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;
        if (hook === 'PostHook' && file) {
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');
          if (normalizedFile === normalizedFilename || normalizedFile.endsWith('/' + normalizedFilename)) {
            setRefreshKey(prev => prev + 1);
          }
        }
      }
    };
    window.addEventListener('claudeHook', handleClaudeHook);
    return () => window.removeEventListener('claudeHook', handleClaudeHook);
  }, [filename]);

  useEffect(() => {
    const handleMessage = async (event) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.type !== 'workspace:write') return;

      const respond = (payload) => {
        try {
          iframe.contentWindow?.postMessage(
            { type: 'workspace:write:result', requestId: msg.requestId, ...payload },
            '*'
          );
        } catch { /* iframe gone */ }
      };

      try {
        const resolved = resolveBridgePath(filename, msg.path);
        if (!resolved) throw new Error('Invalid path: ' + msg.path);

        const encoding = msg.encoding === 'base64' ? 'base64' : 'utf-8';
        if (typeof msg.content !== 'string') throw new Error('content must be a string');

        const url = `/api/workspace/${encodeURIComponent(projectName)}/files/bridge-write/${resolved}`;
        const res = await apiAxios.put(url, { content: msg.content, encoding });
        respond({ ok: true, result: res.data });
      } catch (err) {
        respond({ ok: false, error: err?.response?.data?.message || err?.message || String(err) });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [filename, projectName]);

  const iframeSrc = authSSEUrl(`/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`);

  return (
    <div style={{ width: '100%', height: '100%' }} className={className}>
      <iframe
        ref={iframeRef}
        key={refreshKey}
        src={iframeSrc}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title={`Preview of ${filename}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

/**
 * Resolve a bridge path against the previewed HTML file.
 * - "/foo/bar.json"     → "foo/bar.json"  (project-root anchored)
 * - "./bar.json"        → "<htmlDir>/bar.json"
 * - "bar.json"          → "<htmlDir>/bar.json"
 * Rejects anything that escapes the project root with "..".
 */
function resolveBridgePath(htmlPath, requestedPath) {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) return null;
  const norm = requestedPath.replace(/\\/g, '/');

  let parts;
  if (norm.startsWith('/')) {
    parts = norm.slice(1).split('/');
  } else {
    const htmlDir = htmlPath.replace(/\\/g, '/').split('/').slice(0, -1);
    const rel = norm.startsWith('./') ? norm.slice(2) : norm;
    parts = [...htmlDir, ...rel.split('/')];
  }

  const stack = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  if (stack.length === 0) return null;
  return stack.map(encodeURIComponent).join('/');
}
