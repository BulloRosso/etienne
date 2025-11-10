#!/usr/bin/env node

/**
 * Beispiel-Skript zum Testen der Knowledge Graph + Vector Search API
 * 
 * Dieses Skript demonstriert:
 * - Erstellen von Entitäten und Beziehungen
 * - Hinzufügen von Dokumenten mit Embeddings
 * - Durchführung hybrider Suchen
 * 
 * Starten Sie zuerst den Server mit: npm run start:dev
 * Dann führen Sie dieses Skript aus: node examples/test-api.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Axios Instanz mit Basis-URL
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function testAPI() {
  console.log('🚀 Starte API-Tests...\n');

  try {
    // 1. Gesundheitscheck
    console.log('1. Gesundheitscheck...');
    const health = await api.get('/health');
    console.log('✅ Server läuft:', health.data.status);
    console.log();

    // 2. Entitäten erstellen
    console.log('2. Erstelle Entitäten...');
    
    // Personen
    await api.post('/entities', {
      id: 'person-001',
      type: 'Person',
      properties: {
        name: 'Max Mustermann',
        email: 'max@acme.com',
        phone: '+49123456789'
      }
    });
    console.log('✅ Person erstellt: Max Mustermann');

    await api.post('/entities', {
      id: 'person-002',
      type: 'Person',
      properties: {
        name: 'Anna Schmidt',
        email: 'anna@acme.com',
        phone: '+49987654321'
      }
    });
    console.log('✅ Person erstellt: Anna Schmidt');

    // Firmen
    await api.post('/entities', {
      id: 'firma-001',
      type: 'Firma',
      properties: {
        name: 'Acme GmbH',
        industry: 'Software Development',
        location: 'Berlin, Deutschland'
      }
    });
    console.log('✅ Firma erstellt: Acme GmbH');

    // Produkte
    await api.post('/entities', {
      id: 'produkt-001',
      type: 'Produkt',
      properties: {
        name: 'KI-Analytics Platform',
        description: 'Eine fortschrittliche Plattform für KI-gestützte Datenanalyse',
        price: '50000 EUR'
      }
    });
    console.log('✅ Produkt erstellt: KI-Analytics Platform');
    console.log();

    // 3. Beziehungen erstellen
    console.log('3. Erstelle Beziehungen...');
    
    await api.post('/relationships', {
      subject: 'person-001',
      predicate: 'istAngestelltBei',
      object: 'firma-001',
      properties: {
        since: '2023-01-15',
        position: 'Senior Entwickler'
      }
    });
    console.log('✅ Max arbeitet bei Acme GmbH');

    await api.post('/relationships', {
      subject: 'person-002',
      predicate: 'istAngestelltBei',
      object: 'firma-001',
      properties: {
        since: '2022-08-01',
        position: 'Projektleiterin'
      }
    });
    console.log('✅ Anna arbeitet bei Acme GmbH');

    await api.post('/relationships', {
      subject: 'firma-001',
      predicate: 'stelltHer',
      object: 'produkt-001'
    });
    console.log('✅ Acme GmbH stellt KI-Analytics Platform her');

    await api.post('/relationships', {
      subject: 'person-001',
      predicate: 'arbeitetMit',
      object: 'person-002'
    });
    console.log('✅ Max und Anna arbeiten zusammen');
    console.log();

    // 4. Dokumente mit Embeddings erstellen
    console.log('4. Erstelle Dokumente mit Embeddings...');
    
    await api.post('/documents', {
      id: 'doc-001',
      content: `# Projektdokumentation: KI-Analytics Platform

Max Mustermann leitet die Entwicklung unserer revolutionären KI-Analytics Platform. Das Projekt kombiniert maschinelles Lernen mit modernen Web-Technologien, um Unternehmen tiefere Einblicke in ihre Daten zu ermöglichen.

## Technische Details
- React Frontend mit TypeScript
- Node.js Backend mit NestJS
- TensorFlow für ML-Modelle
- PostgreSQL Datenbank

## Team
Das Projekt wird von Max Mustermann geleitet, mit Unterstützung von Anna Schmidt als Projektleiterin.`,
      entityId: 'person-001',
      entityType: 'Person',
      metadata: {
        author: 'Max Mustermann',
        project: 'KI-Analytics',
        type: 'documentation'
      }
    });
    console.log('✅ Projektdokumentation erstellt');

    await api.post('/documents', {
      id: 'doc-002',
      content: `# Firmenprofil: Acme GmbH

Acme GmbH ist ein führendes Softwareentwicklungsunternehmen mit Sitz in Berlin. Wir spezialisieren uns auf innovative KI-Lösungen und arbeiten mit Kunden aus verschiedenen Branchen zusammen.

## Unsere Expertise
- Künstliche Intelligenz und Machine Learning
- Web- und Mobile-Entwicklung
- Datenanalyse und Business Intelligence
- Cloud-Computing-Lösungen

## Standort
Unser Hauptsitz befindet sich im Herzen Berlins, wo unser talentiertes Team von Entwicklern und Datenspezialisten arbeitet.`,
      entityId: 'firma-001',
      entityType: 'Firma',
      metadata: {
        type: 'company_profile'
      }
    });
    console.log('✅ Firmenprofil erstellt');
    console.log();

    // 5. Statistiken anzeigen
    console.log('5. Aktuelle Statistiken...');
    const stats = await api.get('/stats');
    console.log('📊 Vector Store Dokumente:', stats.data.vectorStore.totalDocuments);
    console.log('📊 Knowledge Graph Quads:', stats.data.knowledgeGraph.totalQuads);
    console.log('📊 Entitäten:', JSON.stringify(stats.data.knowledgeGraph.entitiesByType, null, 2));
    console.log();

    // 6. Verschiedene Suchen durchführen
    console.log('6. Führe verschiedene Suchen durch...\n');

    // 6.1 Hybride Suche
    console.log('📍 Hybride Suche: "Wer arbeitet an KI-Projekten?"');
    const hybridSearch = await api.post('/search/hybrid', {
      query: 'Wer arbeitet an KI-Projekten?',
      topK: 3,
      includeVectorSearch: true,
      includeKnowledgeGraph: true
    });
    console.log('🔍 Vector-Ergebnisse:', hybridSearch.data.vectorResults.length);
    console.log('🔍 Knowledge Graph-Ergebnisse:', hybridSearch.data.knowledgeGraphResults.length);
    console.log('🔍 Kombinierte Ergebnisse:', hybridSearch.data.combinedResults.length);
    if (hybridSearch.data.sparqlQuery) {
      console.log('🔍 Generierte SPARQL-Abfrage:', hybridSearch.data.sparqlQuery);
    }
    console.log();

    // 6.2 Vector-Suche
    console.log('📍 Vector-Suche: "Machine Learning und TensorFlow"');
    const vectorSearch = await api.post('/search/vector', {
      query: 'Machine Learning und TensorFlow',
      topK: 3
    });
    console.log('🔍 Vector-Ergebnisse:');
    vectorSearch.data.forEach((result, index) => {
      console.log(`  ${index + 1}. Similarity: ${result.similarity.toFixed(3)} - ${result.content.substring(0, 100)}...`);
    });
    console.log();

    // 6.3 SPARQL-Übersetzung testen
    console.log('📍 SPARQL-Übersetzung: "Zeige alle Mitarbeiter von Acme GmbH"');
    const sparqlTranslation = await api.post('/translate/sparql', {
      query: 'Zeige alle Mitarbeiter von Acme GmbH'
    });
    console.log('🔍 SPARQL-Abfrage:', sparqlTranslation.data.sparql);
    console.log();

    // 6.4 Direkte SPARQL-Abfrage
    console.log('📍 Direkte SPARQL-Abfrage: Alle Personen');
    const sparqlResult = await api.post('/search/sparql', {
      query: `
        PREFIX kg: <http://example.org/kg/>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        
        SELECT ?person ?name WHERE {
          ?person rdf:type kg:Person .
          ?person kg:name ?name .
        }
      `
    });
    console.log('🔍 Gefundene Personen:', sparqlResult.data.length);
    sparqlResult.data.forEach((person, index) => {
      console.log(`  ${index + 1}. ${person.name.value}`);
    });
    console.log();

    // 7. Entität mit Beziehungen abrufen
    console.log('7. Entität-Details mit Beziehungen...');
    const person = await api.get('/entities/person-001');
    console.log('👤 Person:', person.data);
    
    const relationships = await api.get('/entities/person-001/relationships');
    console.log('🔗 Beziehungen:', relationships.data.length);
    relationships.data.forEach((rel, index) => {
      console.log(`  ${index + 1}. ${rel.subject} -> ${rel.predicate} -> ${rel.object}`);
    });
    console.log();

    console.log('✅ Alle Tests erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler beim Ausführen der Tests:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Daten:', error.response.data);
    } else {
      console.error('Fehler:', error.message);
    }
    
    // Überprüfen ob Server läuft
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Stellen Sie sicher, dass der Server läuft:');
      console.error('   npm run start:dev');
    }
  }
}

// Hilfsfunktion für saubere Ausgabe
function printSection(title) {
  console.log('\n' + '='.repeat(50));
  console.log(title);
  console.log('='.repeat(50));
}

// Script nur ausführen wenn direkt aufgerufen
if (require.main === module) {
  testAPI();
}

module.exports = { testAPI };
