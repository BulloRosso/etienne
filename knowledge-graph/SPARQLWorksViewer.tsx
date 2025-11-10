import React, { useEffect, useRef, useState } from 'react';

interface SPARQLWorksViewerProps {
  apiBaseUrl?: string;
  width?: number;
  height?: number;
  className?: string;
  defaultQuery?: string;
}

const SPARQLWorksViewer: React.FC<SPARQLWorksViewerProps> = ({
  apiBaseUrl = 'http://localhost:3000/api',
  width = 1200,
  height = 800,
  className = '',
  defaultQuery = ''
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sparqlEndpoint, setSparqlEndpoint] = useState(`${apiBaseUrl}/search/sparql`);
  const [query, setQuery] = useState(defaultQuery || `
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

CONSTRUCT {
  ?subject ?predicate ?object .
  ?subject rdfs:label ?subjectLabel .
  ?object rdfs:label ?objectLabel .
} WHERE {
  ?subject ?predicate ?object .
  OPTIONAL { ?subject kg:name ?subjectLabel }
  OPTIONAL { ?object kg:name ?objectLabel }
}
LIMIT 100
  `.trim());

  const [isEmbedded, setIsEmbedded] = useState(false);
  const [sparqlWorksUrl, setSparqlWorksUrl] = useState('');

  useEffect(() => {
    // SPARQLWorks URL mit Parametern erstellen
    const baseUrl = 'https://sparqlworks.org/'; // Oder lokale Installation
    const encodedQuery = encodeURIComponent(query);
    const encodedEndpoint = encodeURIComponent(sparqlEndpoint);
    
    const url = `${baseUrl}?endpoint=${encodedEndpoint}&query=${encodedQuery}&mode=advanced`;
    setSparqlWorksUrl(url);
  }, [sparqlEndpoint, query]);

  const openInNewTab = () => {
    window.open(sparqlWorksUrl, '_blank');
  };

  const toggleEmbedded = () => {
    setIsEmbedded(!isEmbedded);
  };

  // Beispiel-Queries für verschiedene Visualisierungen
  const exampleQueries = {
    'Alle Entitäten und Beziehungen': `
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

CONSTRUCT {
  ?subject ?predicate ?object .
  ?subject rdfs:label ?subjectLabel .
  ?object rdfs:label ?objectLabel .
  ?subject rdf:type ?subjectType .
  ?object rdf:type ?objectType .
} WHERE {
  ?subject ?predicate ?object .
  OPTIONAL { ?subject kg:name ?subjectLabel }
  OPTIONAL { ?object kg:name ?objectLabel }
  OPTIONAL { ?subject rdf:type ?subjectType }
  OPTIONAL { ?object rdf:type ?objectType }
  FILTER(STRSTARTS(STR(?predicate), "http://example.org/kg/"))
}
LIMIT 200
    `.trim(),

    'Personen und ihre Firmen': `
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

CONSTRUCT {
  ?person kg:istAngestelltBei ?firma .
  ?person rdfs:label ?personName .
  ?firma rdfs:label ?firmaName .
  ?person rdf:type kg:Person .
  ?firma rdf:type kg:Firma .
} WHERE {
  ?person rdf:type kg:Person .
  ?person kg:istAngestelltBei ?firma .
  ?person kg:name ?personName .
  ?firma kg:name ?firmaName .
}
    `.trim(),

    'Firmen und ihre Produkte': `
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

CONSTRUCT {
  ?firma kg:stelltHer ?produkt .
  ?firma rdfs:label ?firmaName .
  ?produkt rdfs:label ?produktName .
  ?firma rdf:type kg:Firma .
  ?produkt rdf:type kg:Produkt .
} WHERE {
  ?firma rdf:type kg:Firma .
  ?firma kg:stelltHer ?produkt .
  ?firma kg:name ?firmaName .
  ?produkt kg:name ?produktName .
}
    `.trim(),

    'Vollständiges Netzwerk': `
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

CONSTRUCT {
  ?s ?p ?o .
  ?s rdf:type ?sType .
  ?o rdf:type ?oType .
} WHERE {
  ?s ?p ?o .
  ?s rdf:type ?sType .
  ?o rdf:type ?oType .
  FILTER(?sType IN (kg:Person, kg:Firma, kg:Produkt))
  FILTER(?oType IN (kg:Person, kg:Firma, kg:Produkt))
}
    `.trim()
  };

  const handleQuerySelect = (selectedQuery: string) => {
    setQuery(selectedQuery);
  };

  const customSparqlEndpointHandler = async (customQuery: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/search/sparql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: customQuery
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error executing SPARQL query:', error);
      throw error;
    }
  };

  return (
    <div className={`sparql-works-viewer ${className}`}>
      {/* Header mit Kontrollelementen */}
      <div className="bg-gray-100 p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            Knowledge Graph Visualisierung
          </h2>
          <div className="flex gap-2">
            <button
              onClick={toggleEmbedded}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {isEmbedded ? 'Externe Ansicht' : 'Eingebettete Ansicht'}
            </button>
            <button
              onClick={openInNewTab}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              In neuem Tab öffnen
            </button>
          </div>
        </div>

        {/* SPARQL Endpoint Konfiguration */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SPARQL Endpoint:
          </label>
          <input
            type="text"
            value={sparqlEndpoint}
            onChange={(e) => setSparqlEndpoint(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
            placeholder="http://localhost:3000/api/search/sparql"
          />
        </div>

        {/* Query-Auswahl */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vordefinierte Queries:
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {Object.keys(exampleQueries).map((queryName) => (
              <button
                key={queryName}
                onClick={() => handleQuerySelect(exampleQueries[queryName as keyof typeof exampleQueries])}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors"
              >
                {queryName}
              </button>
            ))}
          </div>
        </div>

        {/* Query Editor */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SPARQL CONSTRUCT Query:
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded font-mono text-sm"
            rows={8}
            placeholder="PREFIX kg: <http://example.org/kg/>..."
          />
        </div>

        {/* Info-Box */}
        <div className="bg-blue-50 p-3 rounded">
          <p className="text-sm text-blue-700">
            <strong>Tipp:</strong> Diese Komponente nutzt SPARQLWorks für die Visualisierung. 
            CONSTRUCT-Queries werden als interaktive Graphen dargestellt. 
            Sie können die Query oben bearbeiten und dann die Visualisierung aktualisieren.
          </p>
        </div>
      </div>

      {/* Visualisierung */}
      <div 
        className="relative"
        style={{ width: '100%', height: `${height}px` }}
      >
        {isEmbedded ? (
          <iframe
            ref={iframeRef}
            src={sparqlWorksUrl}
            width="100%"
            height="100%"
            className="border-0"
            title="SPARQLWorks Knowledge Graph Visualization"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 border-2 border-dashed border-gray-300">
            <div className="text-center">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Knowledge Graph Visualisierung
              </h3>
              <p className="text-gray-500 mb-4">
                Klicken Sie auf "Eingebettete Ansicht" oder "In neuem Tab öffnen", um die interaktive Visualisierung zu starten.
              </p>
              <div className="space-y-2">
                <button
                  onClick={toggleEmbedded}
                  className="block mx-auto px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Visualisierung starten
                </button>
                <p className="text-xs text-gray-400">
                  Powered by SPARQLWorks
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer mit Zusatzinformationen */}
      <div className="bg-gray-50 p-3 border-t text-sm text-gray-600">
        <div className="flex justify-between items-center">
          <span>
            SPARQLWorks Visualisierung - Endpoint: <code className="bg-gray-200 px-1 rounded">{sparqlEndpoint}</code>
          </span>
          <a 
            href="https://github.com/danielhmills/sparqlworks" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600"
          >
            SPARQLWorks GitHub →
          </a>
        </div>
      </div>
    </div>
  );
};

export default SPARQLWorksViewer;
