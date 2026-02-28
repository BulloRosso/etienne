import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton
} from '@mui/material';
import { PlayArrow, Upload, Close, Description, Search } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import GraphViewer from './GraphViewer';
import VectorStoreItems from './VectorStoreItems';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const SAMPLE_SPARQL = `PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?person ?name ?company ?companyName WHERE {
  ?person rdf:type kg:Person .
  ?person kg:name ?name .
  ?person kg:worksAt ?company .
  ?company kg:name ?companyName .
}
LIMIT 10`;

const SAMPLE_MARKDOWN = `# Sample Document

This is a sample markdown document that will be processed by the knowledge graph.

## People
Dr. Jane Smith is a researcher at Tech Corp.

## Companies
Tech Corp is a technology company specializing in AI research.`;

const SAMPLE_SCHEMA = `@prefix ex: <http://example.org/ontology#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Ontology Definition
ex:BusinessOntology a owl:Ontology ;
    rdfs:label "Business Entity Ontology" ;
    rdfs:comment "Ontology for describing companies, employees, technologies, and products" .

# Entity Classes
ex:Company a owl:Class ;
    rdfs:label "Company" ;
    rdfs:comment "An organization or business entity" .

ex:Employee a owl:Class ;
    rdfs:label "Employee" ;
    rdfs:comment "A person who works for a company" .

ex:Technology a owl:Class ;
    rdfs:label "Technology" ;
    rdfs:comment "A technological solution, framework, or tool" .

ex:Product a owl:Class ;
    rdfs:label "Product" ;
    rdfs:comment "A product or service offered by a company" .

# Properties/Relations
ex:isEmployeeOf a owl:ObjectProperty ;
    rdfs:label "is employee of" ;
    rdfs:comment "Indicates that an employee works for a specific company" ;
    rdfs:domain ex:Employee ;
    rdfs:range ex:Company .

ex:isManufacturedBy a owl:ObjectProperty ;
    rdfs:label "is manufactured by" ;
    rdfs:comment "Indicates that a product is manufactured or created by a company" ;
    rdfs:domain ex:Product ;
    rdfs:range ex:Company .

ex:isOf a owl:ObjectProperty ;
    rdfs:label "is of" ;
    rdfs:comment "Indicates that a product or service is of a specific technology type" ;
    rdfs:domain ex:Product ;
    rdfs:range ex:Technology .

# Additional useful properties
ex:name a owl:DatatypeProperty ;
    rdfs:label "name" ;
    rdfs:comment "The name of an entity" ;
    rdfs:domain owl:Thing ;
    rdfs:range xsd:string .

ex:description a owl:DatatypeProperty ;
    rdfs:label "description" ;
    rdfs:comment "A description of an entity" ;
    rdfs:domain owl:Thing ;
    rdfs:range xsd:string .

ex:foundedYear a owl:DatatypeProperty ;
    rdfs:label "founded year" ;
    rdfs:comment "The year a company was founded" ;
    rdfs:domain ex:Company ;
    rdfs:range xsd:gYear .

ex:position a owl:DatatypeProperty ;
    rdfs:label "position" ;
    rdfs:comment "Job title or position of an employee" ;
    rdfs:domain ex:Employee ;
    rdfs:range xsd:string .`;

const SAMPLE_EXTRACTION_PROMPT = `You are an expert information extraction system. Your task is to identify entities and relationships from text and structure them for storage in an RDF knowledge graph.

## Entity Types to Extract:
1. **Company**: Organizations, businesses, corporations, startups
2. **Employee**: People who work for companies (including founders, CEOs, developers, etc.)
3. **Technology**: Programming languages, frameworks, tools, platforms, software technologies
4. **Product**: Products, services, applications, software solutions created by companies

## Relationships to Identify:
1. **isEmployeeOf**: Person works for/at a company
2. **isManufacturedBy**: Product is created/developed/manufactured by a company
3. **isOf**: Product uses or is built with a specific technology

## Instructions:
1. Read the input text carefully
2. Identify all entities that fit the categories above
3. Determine relationships between entities
4. Output your findings in JSON format

## Output Format:
\`\`\`json
{
  "entities": [
    {
      "id": "unique_identifier",
      "type": "Company|Employee|Technology|Product",
      "name": "entity name",
      "description": "brief description (optional)"
    }
  ],
  "relationships": [
    {
      "subject": "entity_id_1",
      "predicate": "isEmployeeOf|isManufacturedBy|isOf",
      "object": "entity_id_2"
    }
  ]
}
\`\`\`

## Example:
Input: "John Smith works as a software engineer at Microsoft. He is developing a new cloud platform called Azure Functions using Node.js and Python."

Output:
\`\`\`json
{
  "entities": [
    {
      "id": "john_smith",
      "type": "Employee",
      "name": "John Smith",
      "description": "Software engineer"
    },
    {
      "id": "microsoft",
      "type": "Company",
      "name": "Microsoft"
    },
    {
      "id": "azure_functions",
      "type": "Product",
      "name": "Azure Functions",
      "description": "Cloud platform"
    },
    {
      "id": "nodejs",
      "type": "Technology",
      "name": "Node.js"
    },
    {
      "id": "python",
      "type": "Technology",
      "name": "Python"
    }
  ],
  "relationships": [
    {
      "subject": "john_smith",
      "predicate": "isEmployeeOf",
      "object": "microsoft"
    },
    {
      "subject": "azure_functions",
      "predicate": "isManufacturedBy",
      "object": "microsoft"
    },
    {
      "subject": "azure_functions",
      "predicate": "isOf",
      "object": "nodejs"
    },
    {
      "subject": "azure_functions",
      "predicate": "isOf",
      "object": "python"
    }
  ]
}
\`\`\`

## Guidelines:
- Create descriptive but concise IDs using lowercase and underscores
- Be consistent with entity naming
- Only extract relationships that are explicitly mentioned or strongly implied
- If uncertain about a relationship, don't include it
- Focus on the most important entities and relationships
- Ensure all relationship subjects and objects reference valid entity IDs

Now, please extract entities and relationships from the following text:

[INPUT_TEXT_PLACEHOLDER]`;

export default function KnowledgeGraphBrowser({ project, useGraphLayer }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [currentTab, setCurrentTab] = useState(0);
  const [similaritySearchQuery, setSimilaritySearchQuery] = useState('');
  const [similarityResults, setSimilarityResults] = useState([]);
  const [similarityLoading, setSimilarityLoading] = useState(false);
  const [naturalLanguageQuery, setNaturalLanguageQuery] = useState('');
  const [sparqlQuery, setSparqlQuery] = useState(SAMPLE_SPARQL);
  const [markdownContent, setMarkdownContent] = useState(SAMPLE_MARKDOWN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [stats, setStats] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [extractedEntities, setExtractedEntities] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [entitySchema, setEntitySchema] = useState('');
  const [extractionPrompt, setExtractionPrompt] = useState('');
  const [entitiesSubTab, setEntitiesSubTab] = useState(0);
  const [savingSchema, setSavingSchema] = useState(false);
  const [schemaSuccess, setSchemaSuccess] = useState(false);
  const graphContainerRef = useRef(null);

  useEffect(() => {
    if (project) {
      fetchStats();
      fetchEntitySchema();
      fetchExtractionPrompt();
    }
  }, [project]);

  useEffect(() => {
    if (results && graphContainerRef.current) {
      renderGraph();
    }
  }, [results]);

  const fetchStats = async () => {
    if (!project) return;

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchEntitySchema = async () => {
    if (!project) return;

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/entity-schema`);
      if (response.ok) {
        const data = await response.json();
        setEntitySchema(data.schema || '');
      }
    } catch (err) {
      console.error('Failed to fetch entity schema:', err);
    }
  };

  const fetchExtractionPrompt = async () => {
    if (!project) return;

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/extraction-prompt`);
      if (response.ok) {
        const data = await response.json();
        setExtractionPrompt(data.prompt || '');
      }
    } catch (err) {
      console.error('Failed to fetch extraction prompt:', err);
    }
  };

  const handleSaveEntitySchema = async () => {
    if (!project) return;

    setSavingSchema(true);
    setError(null);
    setSchemaSuccess(false);

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/entity-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: entitySchema })
      });

      if (!response.ok) {
        throw new Error('Failed to save entity schema');
      }

      setSchemaSuccess(true);
      setTimeout(() => setSchemaSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSchema(false);
    }
  };

  const handleSaveExtractionPrompt = async () => {
    if (!project) return;

    setSavingSchema(true);
    setError(null);
    setSchemaSuccess(false);

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/extraction-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: extractionPrompt })
      });

      if (!response.ok) {
        throw new Error('Failed to save extraction prompt');
      }

      setSchemaSuccess(true);
      setTimeout(() => setSchemaSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSchema(false);
    }
  };

  const handleUseSampleSchema = () => {
    setEntitySchema(SAMPLE_SCHEMA);
    setExtractionPrompt(SAMPLE_EXTRACTION_PROMPT);
  };

  const handleNaturalLanguageSearch = async () => {
    if (!naturalLanguageQuery.trim() || !project) return;

    setLoading(true);
    setError(null);

    try {
      // First, translate to SPARQL
      const translateResponse = await apiFetch(`/api/knowledge-graph/${project}/translate/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: naturalLanguageQuery })
      });

      if (!translateResponse.ok) {
        throw new Error('Failed to translate query');
      }

      const { query: generatedSparql } = await translateResponse.json();
      setSparqlQuery(generatedSparql);

      // Execute the SPARQL query
      const searchResponse = await apiFetch(`/api/knowledge-graph/${project}/search/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: generatedSparql })
      });

      if (!searchResponse.ok) {
        throw new Error('Failed to execute query');
      }

      const searchResults = await searchResponse.json();
      setResults(searchResults);
      setCurrentTab(1); // Switch to SPARQL tab to show the generated query
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSparqlSearch = async () => {
    if (!sparqlQuery.trim() || !project) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/search/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sparqlQuery })
      });

      if (!response.ok) {
        throw new Error('Failed to execute SPARQL query');
      }

      const searchResults = await response.json();
      setResults(searchResults);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimilaritySearch = async () => {
    if (!similaritySearchQuery.trim() || !project) return;

    setSimilarityLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/knowledge-graph/${project}/search/vector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: similaritySearchQuery,
          topK: 10
        })
      });

      if (!response.ok) {
        throw new Error('Failed to perform similarity search');
      }

      const results = await response.json();
      // Transform results to match VectorStoreItems expected format
      const transformedResults = results.map(result => ({
        id: result.id,
        content: result.content,
        metadata: {
          ...result.metadata,
          similarity: result.similarity
        }
      }));
      setSimilarityResults(transformedResults);
    } catch (err) {
      setError(err.message);
      setSimilarityResults([]);
    } finally {
      setSimilarityLoading(false);
    }
  };

  const handleUploadMarkdown = async () => {
    if (!markdownContent.trim() || !project) return;

    setLoading(true);
    setError(null);
    setUploadSuccess(false);

    try {
      // Parse markdown and upload to vector store (handles both entity extraction and storage)
      const parseResponse = await apiFetch(`/api/knowledge-graph/${project}/parse-markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: markdownContent,
          useGraphLayer: useGraphLayer
        })
      });

      if (!parseResponse.ok) {
        throw new Error('Failed to upload document');
      }

      const parseResult = await parseResponse.json();
      setUploadSuccess(true);

      // Use the actual extracted entities from the API (only if graph layer enabled)
      if (useGraphLayer) {
        setExtractedEntities(parseResult.summary || []);
      } else {
        setExtractedEntities(null);
      }

      // Refresh stats - force a complete refresh
      setTimeout(async () => {
        await fetchStats();
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetUpload = () => {
    setMarkdownContent(SAMPLE_MARKDOWN);
    setUploadSuccess(false);
    setExtractedEntities(null);
    // Refresh stats when resetting to show updated numbers
    fetchStats();
  };

  const handleNodeClick = async (node) => {
    if (!project) return;

    console.log('Node clicked:', node);

    // Extract entity ID from the node URI
    // Node ID format: http://example.org/kg/EntityType/entity-id
    const entityUri = node.id;

    // Check if this is a valid URI format
    if (!entityUri || typeof entityUri !== 'string' || !entityUri.startsWith('http://example.org/kg/')) {
      console.log('Invalid node URI format:', entityUri, 'Full node:', node);
      setError(`Cannot load document for this node type. Only Person, Company, and Product nodes are supported.`);
      return;
    }

    // Check if this is a type URI (e.g., http://example.org/kg/Person) vs entity URI (e.g., http://example.org/kg/Person/john-doe)
    const parts = entityUri.replace('http://example.org/kg/', '').split('/');

    if (parts.length === 1) {
      // This is a type node (e.g., Person, Company), not an entity instance
      setError(`This is a type node. Please click on an entity instance (e.g., a specific person or company).`);
      return;
    }

    const [entityType, entityId] = parts;

    if (!entityType || !entityId) {
      console.log('Could not parse entity parts:', parts);
      setError('Could not parse entity identifier from node.');
      return;
    }

    // Skip Document nodes - they don't have source documents
    if (entityType === 'Document') {
      setError('Document nodes do not have source documents.');
      return;
    }

    setLoadingDocument(true);
    setSelectedDocument(null);

    try {
      // Query to find documents containing this entity
      const sparqlQuery = `PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?document WHERE {
  ?document rdf:type kg:Document .
  ?document kg:contains <${entityUri}> .
}`;

      const response = await apiFetch(`/api/knowledge-graph/${project}/search/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sparqlQuery })
      });

      if (!response.ok) {
        throw new Error('Failed to find documents for entity');
      }

      const documents = await response.json();

      console.log('Documents found:', documents);

      if (!documents || documents.length === 0) {
        setError(`No documents found containing ${entityType}/${entityId}`);
        setLoadingDocument(false);
        return;
      }

      // Filter the triples to find documents that contain this entity
      // Look for triples with predicate "kg:contains" and object matching our entity
      const containsTriples = documents.filter(triple =>
        triple.predicate === 'http://example.org/kg/contains' &&
        triple.object === entityUri
      );

      console.log('Contains triples:', containsTriples);

      if (containsTriples.length === 0) {
        setError(`No documents found containing ${entityType}/${entityId}`);
        setLoadingDocument(false);
        return;
      }

      // Get the first document's URI from the subject of the triple
      const documentUri = containsTriples[0].subject;

      console.log('Document URI:', documentUri);

      if (!documentUri || typeof documentUri !== 'string') {
        throw new Error('Invalid document URI format in SPARQL results');
      }

      const docIdMatch = documentUri.match(/Document\/(.+)/);

      if (!docIdMatch) {
        throw new Error('Could not parse document URI: ' + documentUri);
      }

      const documentId = docIdMatch[1];

      // Fetch the document content from vector store
      const docResponse = await apiFetch(`/api/knowledge-graph/${project}/documents/${documentId}`);

      if (!docResponse.ok) {
        throw new Error('Failed to fetch document content');
      }

      const document = await docResponse.json();

      setSelectedDocument({
        id: documentId,
        content: document.content || document.metadata?.content || '',
        metadata: document.metadata,
        entityType,
        entityId
      });
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching document:', err);
    } finally {
      setLoadingDocument(false);
    }
  };

  const renderGraph = () => {
    if (!results || results.length === 0) return;

    // Create nodes and edges from results
    const nodes = new Map();
    const edges = [];

    results.forEach((result) => {
      const subjectId = result.subject;
      const objectId = result.object;

      // Add nodes
      if (!nodes.has(subjectId)) {
        nodes.set(subjectId, {
          id: subjectId,
          label: subjectId.replace('http://example.org/kg/', ''),
          type: 'entity'
        });
      }

      if (!nodes.has(objectId)) {
        nodes.set(objectId, {
          id: objectId,
          label: objectId.replace('http://example.org/kg/', ''),
          type: 'entity'
        });
      }

      // Add edge
      edges.push({
        from: subjectId,
        to: objectId,
        label: result.predicate.replace('http://example.org/kg/', '')
      });
    });

    setGraphData({
      nodes: Array.from(nodes.values()),
      edges
    });
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  if (!project) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {t('knowledgeGraph.noProject')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Tabs */}
      <Tabs value={currentTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={t('knowledgeGraph.tabSimilaritySearch')} />
        {useGraphLayer && <Tab label={t('knowledgeGraph.tabNaturalLanguage')} />}
        {useGraphLayer && <Tab label={t('knowledgeGraph.tabSparql')} />}
        <Tab label={t('knowledgeGraph.tabUploadData')} />
        <Tab label={t('knowledgeGraph.tabKnowledgeStatistics')} />
        {useGraphLayer && <Tab label={t('knowledgeGraph.tabEntities')} />}
      </Tabs>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Similarity Search Tab */}
        {currentTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('knowledgeGraph.similarityDescription')}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
              <TextField
                size="small"
                fullWidth
                placeholder={t('knowledgeGraph.similarityPlaceholder')}
                value={similaritySearchQuery}
                onChange={(e) => setSimilaritySearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !similarityLoading) {
                    handleSimilaritySearch();
                  }
                }}
                disabled={similarityLoading}
              />
              <IconButton
                color="primary"
                onClick={handleSimilaritySearch}
                disabled={similarityLoading || !similaritySearchQuery.trim()}
                sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                {similarityLoading ? <CircularProgress size={20} color="inherit" /> : <Search />}
              </IconButton>
            </Box>

            {/* Display similarity search results using VectorStoreItems-like component */}
            {similarityResults.length > 0 && (() => {
              const filteredResults = similarityResults.filter(doc => (doc.metadata?.similarity || 0) >= 0.2);
              return (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    {t('knowledgeGraph.similarityResultsTitle', { count: filteredResults.length })}
                  </Typography>
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('knowledgeGraph.columnDocumentId')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('knowledgeGraph.columnContentPreview')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('knowledgeGraph.columnSimilarity')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('knowledgeGraph.columnGraphLayer')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredResults
                          .sort((a, b) => (b.metadata?.similarity || 0) - (a.metadata?.similarity || 0))
                          .map((doc) => (
                          <TableRow key={doc.id} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                {doc.id}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {doc.content?.substring(0, 100) || t('common.na')}...
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${Math.round((doc.metadata?.similarity || 0) * 100)}%`}
                                size="small"
                                color={doc.metadata?.similarity > 0.8 ? 'success' : 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              {doc.metadata?.useGraphLayer !== undefined ? (
                                <Chip
                                  label={doc.metadata.useGraphLayer ? t('common.enabled') : t('common.disabled')}
                                  size="small"
                                  color={doc.metadata.useGraphLayer ? 'success' : 'default'}
                                />
                              ) : (
                                <Typography variant="body2" color="text.secondary">{t('common.na')}</Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              );
            })()}
          </Box>
        )}

        {/* Natural Language Tab */}
        {useGraphLayer && currentTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('knowledgeGraph.naturalLanguageDescription')}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
              <TextField
                size="small"
                fullWidth
                placeholder={t('knowledgeGraph.naturalLanguagePlaceholder')}
                value={naturalLanguageQuery}
                onChange={(e) => setNaturalLanguageQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !loading) {
                    handleNaturalLanguageSearch();
                  }
                }}
                disabled={loading}
              />
              <IconButton
                size="small"
                color="primary"
                onClick={handleNaturalLanguageSearch}
                disabled={loading || !naturalLanguageQuery.trim()}
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&:disabled': { bgcolor: 'action.disabledBackground' }
                }}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : <Search />}
              </IconButton>
            </Box>

            {/* Example queries */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t('knowledgeGraph.exampleQueries')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  label={t('knowledgeGraph.example1')}
                  size="small"
                  onClick={() => setNaturalLanguageQuery(t('knowledgeGraph.example1'))}
                />
                <Chip
                  label={t('knowledgeGraph.example2')}
                  size="small"
                  onClick={() => setNaturalLanguageQuery(t('knowledgeGraph.example2'))}
                />
                <Chip
                  label={t('knowledgeGraph.example3')}
                  size="small"
                  onClick={() => setNaturalLanguageQuery(t('knowledgeGraph.example3'))}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* SPARQL Tab */}
        {useGraphLayer && currentTab === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('knowledgeGraph.sparqlDescription')}
            </Typography>

            <Box sx={{ mb: 2, height: '300px', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="sparql"
                value={sparqlQuery}
                onChange={(value) => setSparqlQuery(value || '')}
                theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false
                }}
              />
            </Box>

            <Button
              variant="contained"
              onClick={handleSparqlSearch}
              disabled={loading || !sparqlQuery.trim()}
              startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
            >
              {t('knowledgeGraph.executeQuery')}
            </Button>
          </Box>
        )}

        {/* Upload Data Tab */}
        {currentTab === (useGraphLayer ? 3 : 1) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('knowledgeGraph.uploadDescription')}
            </Typography>

            {!uploadSuccess ? (
              <>
                <Box sx={{ mb: 2, flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    value={markdownContent}
                    onChange={(value) => setMarkdownContent(value || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    onClick={() => setMarkdownContent('')}
                    startIcon={<Close />}
                  >
                    {t('knowledgeGraph.clearContent')}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleUploadMarkdown}
                    disabled={loading || !markdownContent.trim()}
                    startIcon={loading ? <CircularProgress size={16} /> : <Upload />}
                  >
                    {t('knowledgeGraph.uploadToVectorStore')}
                  </Button>
                </Box>
              </>
            ) : (
              <Box>
                <Alert severity="success" sx={{ mb: 3 }}>
                  {t('knowledgeGraph.uploadSuccess')}
                </Alert>

                {extractedEntities && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      {t('knowledgeGraph.extractedEntities')}
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{t('knowledgeGraph.entityType')}</TableCell>
                            <TableCell align="right">{t('knowledgeGraph.count')}</TableCell>
                            <TableCell>{t('knowledgeGraph.examples')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {extractedEntities.map((entity, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{entity.type}</TableCell>
                              <TableCell align="right">{entity.count}</TableCell>
                              <TableCell>{entity.examples.join(', ')}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}

                <Button
                  variant="outlined"
                  onClick={handleResetUpload}
                  startIcon={<Close />}
                >
                  {t('knowledgeGraph.uploadAnother')}
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Knowledge Statistics Tab */}
        {currentTab === (useGraphLayer ? 4 : 2) && stats && (
          <Box>
            <Grid container spacing={3}>
              <Grid item xs={12} md={useGraphLayer ? 6 : 12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
                    {t('knowledgeGraph.statsVectorStore')}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="h3" color="primary">
                        {stats.vectorStore?.documentCount || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('knowledgeGraph.statsDocuments')}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h4">
                        {stats.vectorStore?.dimension || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('knowledgeGraph.statsEmbeddingDimensions')}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              {useGraphLayer && (
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
                      {t('knowledgeGraph.statsKnowledgeGraph')}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Typography variant="h3" color="primary">
                          {stats.knowledgeGraph?.totalQuads || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t('knowledgeGraph.statsRdfTriples')}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="h4">
                          {stats.knowledgeGraph?.entityCount || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t('knowledgeGraph.statsTotalEntities')}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              )}

              {useGraphLayer && stats.knowledgeGraph?.entityTypes && (
                <Grid item xs={12}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>
                      {t('knowledgeGraph.statsEntityTypes')}
                    </Typography>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>{t('knowledgeGraph.entityType')}</TableCell>
                            <TableCell align="right">{t('knowledgeGraph.count')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(stats.knowledgeGraph.entityTypes).map(([type, count]) => (
                            <TableRow key={type}>
                              <TableCell>
                                <Chip label={type} size="small" />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="h6">{count}</Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              )}

              {/* Vector Store Documents */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2 }}>
                    {t('knowledgeGraph.statsVectorStoreDocuments')}
                  </Typography>
                  <VectorStoreItems project={project} />
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Entities Tab */}
        {useGraphLayer && currentTab === 5 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('knowledgeGraph.entitiesDescription')}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={handleUseSampleSchema}
              >
                {t('knowledgeGraph.useSampleSchema')}
              </Button>
            </Box>

            {/* Sub-tabs for Schema and Extraction Prompt */}
            <Tabs value={entitiesSubTab} onChange={(e, v) => setEntitiesSubTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
              <Tab label={t('knowledgeGraph.tabEntitySchema')} />
              <Tab label={t('knowledgeGraph.tabExtractionPrompt')} />
            </Tabs>

            {/* Entity Schema Editor */}
            {entitiesSubTab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('knowledgeGraph.schemaDescription')}
                </Typography>

                <Box sx={{ mb: 2, flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, minHeight: 0 }}>
                  <Editor
                    height="100%"
                    defaultLanguage="turtle"
                    value={entitySchema}
                    onChange={(value) => setEntitySchema(value || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveEntitySchema}
                    disabled={savingSchema}
                    startIcon={savingSchema ? <CircularProgress size={16} /> : null}
                  >
                    {t('knowledgeGraph.saveSchema')}
                  </Button>
                  {schemaSuccess && (
                    <Alert severity="success" sx={{ py: 0 }}>
                      {t('knowledgeGraph.schemaSaved')}
                    </Alert>
                  )}
                </Box>
              </Box>
            )}

            {/* Extraction Prompt Editor */}
            {entitiesSubTab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('knowledgeGraph.promptDescription')}
                </Typography>

                <Box sx={{ mb: 2, flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, minHeight: 0 }}>
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    value={extractionPrompt}
                    onChange={(value) => setExtractionPrompt(value || '')}
                    theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveExtractionPrompt}
                    disabled={savingSchema}
                    startIcon={savingSchema ? <CircularProgress size={16} /> : null}
                  >
                    {t('knowledgeGraph.savePrompt')}
                  </Button>
                  {schemaSuccess && (
                    <Alert severity="success" sx={{ py: 0 }}>
                      {t('knowledgeGraph.promptSaved')}
                    </Alert>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Results Display (for tabs 1 and 2 when graph layer is enabled) */}
        {useGraphLayer && (currentTab === 1 || currentTab === 2) && results && results.length > 0 && (
          <>
            {/* Graph Visualization Container */}
            <Box sx={{ mt: 3 }}>
              <GraphViewer
                data={results}
                height={600}
                onNodeClick={handleNodeClick}
                tripleCount={results.length}
              />
            </Box>

            {/* Document or Table View */}
            {selectedDocument ? (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description />
                    <Typography variant="h6">
                      {t('knowledgeGraph.sourceDocument', { entity: `${selectedDocument.entityType}/${selectedDocument.entityId}` })}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => setSelectedDocument(null)} title={t('knowledgeGraph.closeDocumentView')}>
                    <Close />
                  </IconButton>
                </Box>
                <Paper sx={{ p: 3, bgcolor: '#f9f9f9' }}>
                  {loadingDocument ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        '& h1': { fontSize: '2rem', fontWeight: 'bold', mt: 2, mb: 1 },
                        '& h2': { fontSize: '1.5rem', fontWeight: 'bold', mt: 2, mb: 1 },
                        '& h3': { fontSize: '1.25rem', fontWeight: 'bold', mt: 2, mb: 1 },
                        '& p': { mb: 2, lineHeight: 1.6 },
                        '& code': { bgcolor: '#f0f0f0', px: 0.5, py: 0.25, borderRadius: 0.5 },
                        '& pre': { bgcolor: '#f0f0f0', p: 2, borderRadius: 1, overflow: 'auto' },
                        '& ul, & ol': { mb: 2, pl: 3 },
                        '& li': { mb: 0.5 }
                      }}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(marked.parse(selectedDocument.content))
                      }}
                    />
                  )}
                </Paper>
              </Box>
            ) : (
              <Box sx={{ mt: 3, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>{t('knowledgeGraph.columnSubject')}</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>{t('knowledgeGraph.columnPredicate')}</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>{t('knowledgeGraph.columnObject')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px', fontSize: '0.875rem' }}>
                          {result.subject?.replace('http://example.org/kg/', '') || result.subject}
                        </td>
                        <td style={{ padding: '8px', fontSize: '0.875rem' }}>
                          {result.predicate?.replace('http://example.org/kg/', '') || result.predicate}
                        </td>
                        <td style={{ padding: '8px', fontSize: '0.875rem' }}>
                          {result.object?.replace('http://example.org/kg/', '') || result.object}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </>
        )}

        {useGraphLayer && (currentTab === 1 || currentTab === 2) && results && results.length === 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            {t('knowledgeGraph.noResults')}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
