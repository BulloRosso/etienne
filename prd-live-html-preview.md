# Live Preview for HTML files

I want to use a new LiveHTMLPreview.jsx component (see example below) in the content of the LiveChanges tab of ArtifactsPane.jsx.

If the changed file has an extension of .html or .htm then we want to use the new component at full avialable content width and a fixed height of 800px. The component should be vertically resizable.

## Example Code
```
import { useState, useEffect, useRef } from 'react';

/**
 * LiveHTMLPreview Component
 * 
 * Displays an HTML file from /workspace in an iframe and refreshes
 * when receiving claudeHook: PostHook events
 * 
 * Props:
 * - filename: string - The HTML file to display
 * - className: string (optional) - Additional CSS classes
 */
export default function LiveHTMLPreview({ filename, className = '' }) {
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

  const iframeSrc = `/api/workspace/file/${encodeURIComponent(filename)}`;

  return (
    <div className={`w-full h-full ${className}`}>
      <iframe
        ref={iframeRef}
        key={refreshKey}
        src={iframeSrc}
        className="w-full h-full border-0"
        title={`Preview of ${filename}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

/**
 * Example usage:
 * 
 * <LiveHTMLPreview filename="index.html" className="h-screen" />
 * 
 * To trigger a refresh from elsewhere in your app:
 * 
 * const event = new CustomEvent('claudeHook', {
 *   detail: {
 *     hook: 'PostHook',
 *     file: 'index.html'
 *   }
 * });
 * window.dispatchEvent(event);
 */
```