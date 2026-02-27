import React from 'react';
import Scrapbook from './Scrapbook';

/**
 * ScrapbookViewer - File previewer wrapper for .scbk files.
 * Extracts graphName from filename pattern: scrapbook.<graphName>.scbk
 * Renders the Scrapbook component directly (no Dialog wrapper).
 */
export default function ScrapbookViewer({ filename, projectName }) {
  const graphName = extractGraphName(filename);

  return (
    <Scrapbook
      projectName={projectName}
      graphName={graphName}
      embedded={true}
    />
  );
}

function extractGraphName(filename) {
  if (!filename) return 'default';
  const basename = filename.split(/[/\\]/).pop();
  const match = basename.match(/^scrapbook\.(.+)\.scbk$/);
  return match ? match[1] : 'default';
}
