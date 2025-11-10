# Knowledge Graph + Vector Search Service

Ein vollständiger NestJS-Service, der hnswsqlite für Vektorsuche mit Quadstore für Knowledge Graphs kombiniert. Diese Lösung arbeitet vollständig mit lokalen Daten im Filesystem ohne externe Datenbanken.

## 🚀 Features

- **Hybride Suche**: Kombiniert Vektorsuche mit Knowledge Graph-Abfragen
- **Vector Embeddings**: Speichert Markdown-Inhalte als OpenAI-Embeddings
- **Knowledge Graph**: RDF-basierte Entitäten und Beziehungen
- **SPARQL-Übersetzung**: KI-gestützte Übersetzung von natürlicher Sprache zu SPARQL
- **Lokale Persistierung**: Alle Daten werden lokal gespeichert (SQLite + LevelDB)
- **REST API**: Vollständige API mit Swagger-Dokumentation

## 🏗️ Architektur

```
┌─────────────────┐    ┌─────────────────┐
│   Markdown      │    │   User Query    │
│   Content       │    │   (Natural)     │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   OpenAI        │    │   OpenAI        │
│   Embeddings    │    │   SPARQL        │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   hnswsqlite    │    │   Quadstore     │
│   (Vector DB)   │    │   (RDF Store)   │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
         ┌─────────────────┐
         │   Hybrid        │
         │   Search        │
         │   Results       │
         └─────────────────┘
```

## 📦 Installation

1. **Klonen und Abhängigkeiten installieren:**
```bash
git clone <repository>
cd knowledge-graph-vector-search
npm install
```

2. **Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
# Fügen Sie Ihren OpenAI API Key hinzu
```

3. **Anwendung starten:**
```bash
# Entwicklung
npm run start:dev

# Produktion
npm run build
npm run start:prod
```

## 🔧 Konfiguration

### Umgebungsvariablen

- `OPENAI_API_KEY`: Ihr OpenAI API-Schlüssel für Embeddings und SPARQL-Übersetzung
- `NODE_ENV`: Umgebung (development/production)
- `PORT`: Server-Port (Standard: 3000)

### Datenspeicherung

- **Vector Database**: `./data/vectors.db` (SQLite)
- **Knowledge Graph**: `./data/knowledge-graph/` (LevelDB)

## 📚 API-Dokumentation

Die vollständige API-Dokumentation ist unter `http://localhost:3000/api` verfügbar (Swagger UI).

### Hauptendpunkte

#### Dokumente
- `POST /api/documents` - Erstellt ein neues Dokument mit Embedding
- `GET /api/documents/:id` - Holt ein Dokument

#### Entitäten
- `POST /api/entities` - Erstellt eine neue Entität
- `GET /api/entities/:id` - Holt eine Entität
- `GET /api/entities?type=Person` - Holt Entitäten nach Typ
- `DELETE /api/entities/:id` - Löscht eine Entität

#### Beziehungen
- `POST /api/relationships` - Erstellt eine neue Beziehung
- `GET /api/entities/:id/relationships` - Holt Beziehungen einer Entität

#### Suche
- `POST /api/search/hybrid` - Hybride Suche (Vector + Knowledge Graph)
- `POST /api/search/vector` - Reine Vektorsuche
- `POST /api/search/sparql` - SPARQL-Abfrage
- `POST /api/translate/sparql` - Übersetzt natürliche Sprache zu SPARQL

## 🎯 Verwendung

### 1. Entitäten erstellen

```javascript
// Person erstellen
POST /api/entities
{
  "id": "person-001",
  "type": "Person",
  "properties": {
    "name": "Max Mustermann",
    "email": "max@example.com",
    "phone": "+49123456789"
  }
}

// Firma erstellen
POST /api/entities
{
  "id": "firma-001",
  "type": "Firma",
  "properties": {
    "name": "Acme GmbH",
    "industry": "Software",
    "location": "Berlin"
  }
}
```

### 2. Beziehungen erstellen

```javascript
// "Max ist angestellt bei Acme"
POST /api/relationships
{
  "subject": "person-001",
  "predicate": "istAngestelltBei",
  "object": "firma-001",
  "properties": {
    "since": "2023-01-01",
    "position": "Entwickler"
  }
}
```

### 3. Dokumente mit Embeddings erstellen

```javascript
POST /api/documents
{
  "id": "doc-001",
  "content": "# Projektbeschreibung\n\nMax Mustermann arbeitet an einem innovativen KI-Projekt...",
  "entityId": "person-001",
  "entityType": "Person",
  "metadata": {
    "author": "Max Mustermann",
    "project": "KI-Initiative"
  }
}
```

### 4. Hybride Suche durchführen

```javascript
POST /api/search/hybrid
{
  "query": "Wer arbeitet an KI-Projekten bei Acme?",
  "topK": 5,
  "includeVectorSearch": true,
  "includeKnowledgeGraph": true
}
```

## 🎨 Schema-Design

### Entitätstypen

1. **Person**
   - `name`: String
   - `email`: String
   - `phone`: String

2. **Firma**
   - `name`: String
   - `industry`: String
   - `location`: String

3. **Produkt**
   - `name`: String
   - `description`: String
   - `price`: String

### Beziehungstypen

- `istAngestelltBei`: Person → Firma
- `stelltHer`: Firma → Produkt
- `arbeitetMit`: Person → Person
- `hatKunde`: Firma → Firma

### SPARQL-Beispiele

```sparql
# Alle Personen bei Acme GmbH finden
PREFIX kg: <http://example.org/kg/>

SELECT ?person ?name WHERE {
  ?person kg:istAngestelltBei ?firma .
  ?firma kg:name "Acme GmbH" .
  ?person kg:name ?name .
}

# Alle Produkte einer Firma
SELECT ?product ?productName WHERE {
  ?firma kg:name "Acme GmbH" .
  ?firma kg:stelltHer ?product .
  ?product kg:name ?productName .
}
```

## 🔍 Suchstrategien

### Vector Search
- **Verwendet**: OpenAI text-embedding-3-small (1536 Dimensionen)
- **Algorithmus**: HNSW (Hierarchical Navigable Small World)
- **Metrik**: Cosine-Similarity
- **Ideal für**: Semantische Ähnlichkeit, Inhaltssuche

### Knowledge Graph Search
- **Verwendet**: SPARQL-Abfragen auf RDF-Tripeln
- **Speicher**: Quadstore mit LevelDB
- **Ideal für**: Strukturierte Beziehungen, Pfad-Abfragen

### Hybrid Search
1. **Vector Search**: Findet semantisch ähnliche Inhalte
2. **KG Search**: Findet strukturell verwandte Entitäten
3. **Kombination**: Gewichtete Vereinigung der Ergebnisse

## 🧪 Beispiel-Workflow

1. **Setup**: Entitäten und Beziehungen erstellen
2. **Content**: Markdown-Dokumente mit Embeddings hinzufügen
3. **Query**: Natürliche Sprache-Anfrage stellen
4. **AI Translation**: OpenAI übersetzt zu SPARQL
5. **Dual Search**: Parallel Vector- und Graph-Suche
6. **Results**: Kombinierte und gewichtete Ergebnisse

## 🛠️ Entwicklung

### Tests ausführen
```bash
npm test
npm run test:watch
npm run test:cov
```

### Linting
```bash
npm run lint
npm run format
```

### Build
```bash
npm run build
```

## 📊 Performance

- **Vector Search**: O(log n) durch HNSW-Index
- **Graph Queries**: Abhängig von SPARQL-Komplexität
- **Concurrent**: Parallele Ausführung beider Sucharten
- **Local**: Keine Netzwerk-Latenz, reine Dateisystem-Performance

## 🚨 Fehlerbehandlung

- Umfassende Validierung mit class-validator
- Strukturierte Fehlerantworten
- Graceful Fallbacks (z.B. bei SPARQL-Fehlern)
- Logging für Debugging

## 📈 Erweiterungsmöglichkeiten

1. **Mehr Entitätstypen**: Erweitern Sie das Schema
2. **Custom Embeddings**: Alternative Embedding-Modelle
3. **Graph Algorithms**: Pfad-Analyse, Zentralitäts-Metriken
4. **Caching**: Redis-Layer für Performance
5. **Real-time**: WebSocket-Updates für Live-Suche

## 🔒 Sicherheit

- API-Validierung mit DTOs
- Umgebungsvariablen für Credentials
- Lokale Datenhaltung (keine Cloud-Abhängigkeiten)
- Input-Sanitization

## 📄 Lizenz

MIT License - siehe LICENSE Datei für Details.