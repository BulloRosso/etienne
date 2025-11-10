import React, { useEffect, useRef, useState } from 'react';

interface ZazukoGraphExplorerProps {
  apiBaseUrl?: string;
  width?: number;
  height?: number;
  className?: string;
}

const ZazukoGraphExplorer: React.FC<ZazukoGraphExplorerProps> = ({
  apiBaseUrl = 'http://localhost:3000/api',
  width = 1000,
  height = 600,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zazuko Graph Explorer per npm installieren:
  // npm install @zazuko/graph-explorer

  const loadGraphExplorer = async () => {
    setLoading(true);
    setError(null);

    try {
      // Dynamisch laden um Server-Side Rendering zu vermeiden
      const { GraphExplorer } = await import('@zazuko/graph-explorer');
      
      if (containerRef.current) {
        // Graph Explorer initialisieren
        const explorer = new GraphExplorer({
          container: containerRef.current,
          sparqlEndpoint: `${apiBaseUrl}/search/sparql`,
          width,
          height,
          // Weitere Konfigurationsoptionen
          showInstancesOf: [
            'http://example.org/kg/Person',
            'http://example.org/kg/Firma', 
            'http://example.org/kg/Produkt'
          ]
        });

        await explorer.render();
      }
    } catch (err) {
      setError(`Fehler beim Laden des Graph Explorers: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphExplorer();
  }, [apiBaseUrl]);

  if (loading) {
    return (
      <div className={`zazuko-graph-explorer ${className}`} style={{ width, height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Graph Explorer wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`zazuko-graph-explorer ${className}`} style={{ width, height }}>
        <div className="flex items-center justify-center h-full bg-red-50 border border-red-200 rounded">
          <div className="text-center p-4">
            <p className="text-red-600 mb-2">Fehler beim Laden:</p>
            <p className="text-red-500 text-sm">{error}</p>
            <button 
              onClick={loadGraphExplorer}
              className="mt-3 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`zazuko-graph-explorer ${className}`} style={{ width, height }}>
      <div ref={containerRef} className="w-full h-full"></div>
    </div>
  );
};

export default ZazukoGraphExplorer;
