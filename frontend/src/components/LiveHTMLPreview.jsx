import { useState, useEffect, useRef } from 'react';
import { authSSEUrl } from '../services/api';

/**
 * LiveHTMLPreview Component
 *
 * Displays an HTML file from /workspace in an iframe and refreshes
 * when receiving claudeHook: PostHook events
 *
 * Props:
 * - filename: string - The HTML file to display
 * - projectName: string - The project name
 * - className: string (optional) - Additional CSS classes
 */
export default function LiveHTMLPreview({ filename, projectName, className = '' }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef(null);

  useEffect(() => {
    const handleClaudeHook = (event) => {
      // Check if this is a PostHook event for our file
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;

        console.log('[LiveHTMLPreview] Received claudeHook:', { hook, file, currentFilename: filename });

        if (hook === 'PostHook' && file) {
          // Handle both absolute and relative paths
          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');

          console.log('[LiveHTMLPreview] Normalized paths:', { normalizedFile, normalizedFilename });

          // Check if paths match (exact match or file ends with filename)
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);

          console.log('[LiveHTMLPreview] Match check:', { exactMatch, endsWithMatch });

          if (exactMatch || endsWithMatch) {
            console.log('[LiveHTMLPreview] ✓ Match found! Refreshing iframe for', filename);
            // Force iframe refresh by updating key
            setRefreshKey(prev => prev + 1);
          } else {
            console.log('[LiveHTMLPreview] ✗ No match for', filename);
          }
        }
      }
    };

    // Listen for custom claudeHook events
    window.addEventListener('claudeHook', handleClaudeHook);

    return () => {
      window.removeEventListener('claudeHook', handleClaudeHook);
    };
  }, [filename]);

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
