import { useState, useEffect, useRef } from 'react';

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

        if (hook === 'PostHook' && file === filename) {
          // Force iframe refresh by updating key
          setRefreshKey(prev => prev + 1);
        }
      }
    };

    // Listen for custom claudeHook events
    window.addEventListener('claudeHook', handleClaudeHook);

    return () => {
      window.removeEventListener('claudeHook', handleClaudeHook);
    };
  }, [filename]);

  const iframeSrc = `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`;

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
