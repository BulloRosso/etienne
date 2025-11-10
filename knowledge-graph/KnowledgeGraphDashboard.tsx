import React, { useState, useEffect } from 'react';
import SPARQLWorksViewer from './SPARQLWorksViewer';
import ZazukoGraphExplorer from './ZazukoGraphExplorer';

interface KnowledgeGraphDashboardProps {
  apiBaseUrl?: string;
  className?: string;
}

type VisualizationMode = 'sparqlworks' | 'zazuko' | 'custom';

const KnowledgeGraphDashboard: React.FC<KnowledgeGraphDashboardProps> = ({
  apiBaseUrl = 'http://localhost:3000/api',
  className = ''
}) => {
  const [mode, setMode] = useState<VisualizationMode>('sparqlworks');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Fehler beim Laden der Statistiken:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeHybridSearch = async (query: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/search/hybrid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          topK: 10,
          includeVectorSearch: true,
          includeKnowledgeGraph: true
        })
      });
      const results = await response.json();
      setSearchResults(results);
    } catch (error) {
      console.error('Fehler bei der Suche:', error);
    }
  };

  const VisualizationModeSelector = () => (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">Visualisierungsmodus wählen:</h3>
      <div className="flex gap-2">
        <button
          onClick={() => setMode('sparqlworks')}
          className={`px-4 py-2 rounded transition-colors ${
            mode === 'sparqlworks'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          SPARQLWorks (Empfohlen)
        </button>
        <button
          onClick={() => setMode('zazuko')}
          className={`px-4 py-2 rounded transition-colors ${
            mode === 'zazuko'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Zazuko Graph Explorer
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-4 py-2 rounded transition-colors ${
            mode === 'custom'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Custom D3.js
        </button>
      </div>
    </div>
  );

  const StatsPanel = () => (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">Knowledge Graph Statistiken</h3>
      {loading ? (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-2xl font-bold text-blue-600">
              {stats.vectorStore?.totalDocuments || 0}
            </div>
            <div className="text-sm text-blue-600">Dokumente</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-2xl font-bold text-green-600">
              {stats.knowledgeGraph?.totalQuads || 0}
            </div>
            <div className="text-sm text-green-600">RDF Tripel</div>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <div className="text-2xl font-bold text-purple-600">
              {(stats.knowledgeGraph?.entitiesByType?.Person || 0) + 
               (stats.knowledgeGraph?.entitiesByType?.Firma || 0) + 
               (stats.knowledgeGraph?.entitiesByType?.Produkt || 0)}
            </div>
            <div className="text-sm text-purple-600">Entitäten</div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-lg font-bold text-orange-600">
              {Object.values(stats.knowledgeGraph?.entitiesByType || {}).filter(count => count > 0).length}
            </div>
            <div className="text-sm text-orange-600">Entitätstypen</div>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">Keine Statistiken verfügbar</p>
      )}
    </div>
  );

  const SearchPanel = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;

      setSearching(true);
      await executeHybridSearch(searchQuery);
      setSearching(false);
    };

    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Hybride Suche (Vector + Knowledge Graph)</h3>
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="z.B. 'Wer arbeitet an KI-Projekten?'"
              className="flex-1 p-3 border border-gray-300 rounded-lg"
              disabled={searching}
            />
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
            >
              {searching ? 'Suche...' : 'Suchen'}
            </button>
          </div>
        </form>

        {searchResults && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Suchergebnisse:</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {searchResults.combinedResults?.slice(0, 5).map((result, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded border-l-4 border-blue-400">
                  <div className="font-medium">{result.source === 'vector' ? '📄' : '🔗'} 
                    {result.content?.substring(0, 100) || result.name || result.id}...
                  </div>
                  <div className="text-sm text-gray-600">
                    Score: {result.combinedScore?.toFixed(3)} | Quelle: {result.source}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const CustomD3Visualization = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Custom D3.js Visualisierung</h3>
      <div className="flex items-center justify-center h-96 bg-gray-50 border-2 border-dashed border-gray-300 rounded">
        <div className="text-center">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            Custom D3.js Visualisierung
          </h4>
          <p className="text-gray-500 mb-4">
            Hier könnte eine maßgeschneiderte D3.js-Visualisierung implementiert werden.
          </p>
          <p className="text-sm text-gray-400">
            Für eine schnelle Lösung empfehlen wir SPARQLWorks oder Zazuko Graph Explorer.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`knowledge-graph-dashboard ${className}`}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Knowledge Graph Visualisierung
          </h1>
          <p className="text-gray-600">
            Erkunden Sie Ihren Knowledge Graph mit verschiedenen Open-Source-Tools
          </p>
        </div>

        {/* Statistiken */}
        <StatsPanel />

        {/* Suche */}
        <SearchPanel />

        {/* Visualisierung Mode Selector */}
        <VisualizationModeSelector />

        {/* Hauptvisualisierung */}
        <div className="bg-white rounded-lg shadow">
          {mode === 'sparqlworks' && (
            <SPARQLWorksViewer 
              apiBaseUrl={apiBaseUrl}
              height={700}
              className="rounded-lg"
            />
          )}
          
          {mode === 'zazuko' && (
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Zazuko Graph Explorer</h3>
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-yellow-800">
                  <strong>Installation erforderlich:</strong> Führen Sie <code>npm install @zazuko/graph-explorer</code> aus.
                </p>
              </div>
              <ZazukoGraphExplorer 
                apiBaseUrl={apiBaseUrl}
                width={1000}
                height={600}
              />
            </div>
          )}

          {mode === 'custom' && <CustomD3Visualization />}
        </div>

        {/* Tool-Vergleich */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Tool-Vergleich</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded p-4">
              <h4 className="font-semibold text-green-600 mb-2">✅ SPARQLWorks (Empfohlen)</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Keine Installation nötig</li>
                <li>• Sofort einsatzbereit</li>
                <li>• Force-directed Graph</li>
                <li>• SPARQL CONSTRUCT Support</li>
                <li>• Modern und aktiv entwickelt</li>
              </ul>
            </div>
            <div className="border border-gray-200 rounded p-4">
              <h4 className="font-semibold text-blue-600 mb-2">💡 Zazuko Graph Explorer</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Professionelle Lösung</li>
                <li>• Speziell für RDF</li>
                <li>• Navigierbare Graphen</li>
                <li>• Requires npm installation</li>
                <li>• Gut dokumentiert</li>
              </ul>
            </div>
            <div className="border border-gray-200 rounded p-4">
              <h4 className="font-semibold text-purple-600 mb-2">🎨 Custom D3.js</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Vollständig anpassbar</li>
                <li>• Höchste Flexibilität</li>
                <li>• Mehr Entwicklungsaufwand</li>
                <li>• Spezifische Anforderungen</li>
                <li>• Wartungsintensiv</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Links und Ressourcen */}
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Zusätzliche Ressourcen</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Open-Source Tools:</h4>
              <ul className="space-y-1 text-sm">
                <li>• <a href="https://github.com/danielhmills/sparqlworks" className="text-blue-500 hover:underline">SPARQLWorks GitHub</a></li>
                <li>• <a href="https://github.com/zazuko/graph-explorer" className="text-blue-500 hover:underline">Zazuko Graph Explorer</a></li>
                <li>• <a href="https://sparnatural.eu/" className="text-blue-500 hover:underline">Sparnatural Query Builder</a></li>
                <li>• <a href="https://github.com/MadsHolten/sparql-visualizer" className="text-blue-500 hover:underline">SPARQL Visualizer</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Dokumentation:</h4>
              <ul className="space-y-1 text-sm">
                <li>• <a href="https://www.w3.org/TR/sparql11-overview/" className="text-blue-500 hover:underline">SPARQL 1.1 Spezifikation</a></li>
                <li>• <a href="https://d3js.org/" className="text-blue-500 hover:underline">D3.js Dokumentation</a></li>
                <li>• Knowledge Graph Best Practices</li>
                <li>• RDF/OWL Grundlagen</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphDashboard;
