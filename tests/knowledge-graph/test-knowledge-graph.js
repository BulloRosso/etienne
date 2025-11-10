/**
 * Knowledge Graph Test
 *
 * This test demonstrates:
 * 1. Creating a scientific article about persons in companies who invented items in the electric vehicles category
 * 2. Importing the markdown into the knowledge graph
 * 3. Finding an entity using natural language query "Who built [component a]?"
 */

const API_BASE = 'http://localhost:6060/api/knowledge-graph';

// Scientific article about electric vehicle inventors
const SCIENTIFIC_ARTICLE = `# Electric Vehicle Component Inventors

## Abstract

This article explores the key innovators and companies behind critical electric vehicle (EV) components.
We examine the relationships between inventors, their companies, and the breakthrough technologies they developed.

## Key Inventors and Their Contributions

### Dr. Sarah Chen - Battery Management Systems

Dr. Sarah Chen, working at **TechVolt Industries**, invented the **Advanced Battery Management System (BMS-X1)**.
This revolutionary component monitors and optimizes battery performance in real-time, extending EV range by 30%.

Contact: sarah.chen@techvolt.com | +1-555-0101

### Michael Rodriguez - Electric Motor Controller

Michael Rodriguez, Chief Engineer at **PowerDrive Motors**, developed the **Quantum Motor Controller (QMC-500)**.
This highly efficient controller reduces energy loss during power conversion, improving overall vehicle efficiency.

Contact: m.rodriguez@powerdrive.com | +1-555-0202

### Dr. Yuki Tanaka - Regenerative Braking System

Dr. Yuki Tanaka of **GreenTech Solutions** invented the **Ultra-Efficient Regenerative Brake System (UERBS)**.
This system recovers up to 85% of kinetic energy during braking, significantly extending vehicle range.

Contact: yuki.tanaka@greentech.jp | +81-3-5555-0303

### Emily Watson - Fast Charging Port

Emily Watson, working at **ChargeTech Inc.**, created the **Universal Fast Charging Port (UFCP-2000)**.
This standardized port enables 80% battery charge in just 15 minutes across all EV models.

Contact: e.watson@chargetech.com | +1-555-0404

## Company Profiles

### TechVolt Industries
- **Industry**: Battery Technology
- **Location**: Palo Alto, California
- **Founded**: 2015
- **Specialization**: Advanced power management systems

### PowerDrive Motors
- **Industry**: Electric Motors
- **Location**: Detroit, Michigan
- **Founded**: 2012
- **Specialization**: High-efficiency motor controllers

### GreenTech Solutions
- **Industry**: Energy Recovery
- **Location**: Tokyo, Japan
- **Founded**: 2010
- **Specialization**: Regenerative systems

### ChargeTech Inc.
- **Industry**: Charging Infrastructure
- **Location**: Berlin, Germany
- **Founded**: 2018
- **Specialization**: Fast charging technology

## Conclusion

The electric vehicle revolution is driven by brilliant innovators across the globe.
These inventors and their companies continue to push the boundaries of what's possible in sustainable transportation.
`;

/**
 * Create entities and relationships from the article
 */
async function importArticleToKnowledgeGraph() {
  console.log('📄 Importing scientific article into knowledge graph...\n');

  // Create persons
  const persons = [
    {
      id: 'person-sarah-chen',
      type: 'Person',
      properties: {
        name: 'Dr. Sarah Chen',
        email: 'sarah.chen@techvolt.com',
        phone: '+1-555-0101'
      }
    },
    {
      id: 'person-michael-rodriguez',
      type: 'Person',
      properties: {
        name: 'Michael Rodriguez',
        email: 'm.rodriguez@powerdrive.com',
        phone: '+1-555-0202'
      }
    },
    {
      id: 'person-yuki-tanaka',
      type: 'Person',
      properties: {
        name: 'Dr. Yuki Tanaka',
        email: 'yuki.tanaka@greentech.jp',
        phone: '+81-3-5555-0303'
      }
    },
    {
      id: 'person-emily-watson',
      type: 'Person',
      properties: {
        name: 'Emily Watson',
        email: 'e.watson@chargetech.com',
        phone: '+1-555-0404'
      }
    }
  ];

  // Create companies
  const companies = [
    {
      id: 'firma-techvolt',
      type: 'Firma',
      properties: {
        name: 'TechVolt Industries',
        industry: 'Battery Technology',
        location: 'Palo Alto, California'
      }
    },
    {
      id: 'firma-powerdrive',
      type: 'Firma',
      properties: {
        name: 'PowerDrive Motors',
        industry: 'Electric Motors',
        location: 'Detroit, Michigan'
      }
    },
    {
      id: 'firma-greentech',
      type: 'Firma',
      properties: {
        name: 'GreenTech Solutions',
        industry: 'Energy Recovery',
        location: 'Tokyo, Japan'
      }
    },
    {
      id: 'firma-chargetech',
      type: 'Firma',
      properties: {
        name: 'ChargeTech Inc.',
        industry: 'Charging Infrastructure',
        location: 'Berlin, Germany'
      }
    }
  ];

  // Create products (EV components)
  const products = [
    {
      id: 'produkt-bms-x1',
      type: 'Produkt',
      properties: {
        name: 'Advanced Battery Management System (BMS-X1)',
        description: 'Monitors and optimizes battery performance in real-time',
        category: 'Electric Vehicles'
      }
    },
    {
      id: 'produkt-qmc-500',
      type: 'Produkt',
      properties: {
        name: 'Quantum Motor Controller (QMC-500)',
        description: 'Highly efficient motor controller reducing energy loss',
        category: 'Electric Vehicles'
      }
    },
    {
      id: 'produkt-uerbs',
      type: 'Produkt',
      properties: {
        name: 'Ultra-Efficient Regenerative Brake System (UERBS)',
        description: 'Recovers up to 85% of kinetic energy during braking',
        category: 'Electric Vehicles'
      }
    },
    {
      id: 'produkt-ufcp-2000',
      type: 'Produkt',
      properties: {
        name: 'Universal Fast Charging Port (UFCP-2000)',
        description: 'Enables 80% battery charge in 15 minutes',
        category: 'Electric Vehicles'
      }
    }
  ];

  // Create all entities
  console.log('✅ Creating persons...');
  for (const person of persons) {
    await fetch(`${API_BASE}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(person)
    });
    console.log(`   - ${person.properties.name}`);
  }

  console.log('\n✅ Creating companies...');
  for (const company of companies) {
    await fetch(`${API_BASE}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company)
    });
    console.log(`   - ${company.properties.name}`);
  }

  console.log('\n✅ Creating products...');
  for (const product of products) {
    await fetch(`${API_BASE}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    console.log(`   - ${product.properties.name}`);
  }

  // Create relationships
  const relationships = [
    // Employment relationships
    { subject: 'person-sarah-chen', predicate: 'istAngestelltBei', object: 'firma-techvolt' },
    { subject: 'person-michael-rodriguez', predicate: 'istAngestelltBei', object: 'firma-powerdrive' },
    { subject: 'person-yuki-tanaka', predicate: 'istAngestelltBei', object: 'firma-greentech' },
    { subject: 'person-emily-watson', predicate: 'istAngestelltBei', object: 'firma-chargetech' },

    // Invention relationships
    { subject: 'person-sarah-chen', predicate: 'hatErfunden', object: 'produkt-bms-x1' },
    { subject: 'person-michael-rodriguez', predicate: 'hatErfunden', object: 'produkt-qmc-500' },
    { subject: 'person-yuki-tanaka', predicate: 'hatErfunden', object: 'produkt-uerbs' },
    { subject: 'person-emily-watson', predicate: 'hatErfunden', object: 'produkt-ufcp-2000' },

    // Manufacturing relationships
    { subject: 'firma-techvolt', predicate: 'stelltHer', object: 'produkt-bms-x1' },
    { subject: 'firma-powerdrive', predicate: 'stelltHer', object: 'produkt-qmc-500' },
    { subject: 'firma-greentech', predicate: 'stelltHer', object: 'produkt-uerbs' },
    { subject: 'firma-chargetech', predicate: 'stelltHer', object: 'produkt-ufcp-2000' }
  ];

  console.log('\n✅ Creating relationships...');
  for (const rel of relationships) {
    await fetch(`${API_BASE}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rel)
    });
    console.log(`   - ${rel.subject} → ${rel.predicate} → ${rel.object}`);
  }

  // Create document with embeddings (for vector search)
  console.log('\n✅ Creating document with embeddings...');
  await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'doc-ev-article',
      content: SCIENTIFIC_ARTICLE,
      metadata: {
        title: 'Electric Vehicle Component Inventors',
        type: 'scientific-article',
        category: 'electric-vehicles'
      }
    })
  });

  console.log('\n✨ Import complete!\n');
}

/**
 * Query the knowledge graph using natural language
 */
async function queryKnowledgeGraph(naturalLanguageQuery) {
  console.log(`🔍 Querying: "${naturalLanguageQuery}"\n`);

  const response = await fetch(`${API_BASE}/search/hybrid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: naturalLanguageQuery,
      topK: 10,
      includeVectorSearch: true,
      includeKnowledgeGraph: true
    })
  });

  const results = await response.json();

  console.log('📊 Results:\n');
  console.log('Generated SPARQL Query:');
  console.log('─────────────────────────');
  console.log(results.sparqlQuery);
  console.log('─────────────────────────\n');

  if (results.knowledgeGraphResults && results.knowledgeGraphResults.length > 0) {
    console.log('Knowledge Graph Results:');
    console.log('═══════════════════════════');
    results.knowledgeGraphResults.forEach((result, idx) => {
      console.log(`${idx + 1}. Subject: ${result.subject}`);
      console.log(`   Predicate: ${result.predicate}`);
      console.log(`   Object: ${result.object}\n`);
    });
  }

  if (results.vectorResults && results.vectorResults.length > 0) {
    console.log('\nVector Search Results:');
    console.log('═══════════════════════════');
    results.vectorResults.forEach((result, idx) => {
      console.log(`${idx + 1}. ID: ${result.id}`);
      console.log(`   Similarity: ${(result.similarity * 100).toFixed(2)}%`);
      console.log(`   Content preview: ${result.content.substring(0, 100)}...\n`);
    });
  }

  return results;
}

/**
 * Get statistics
 */
async function getStats() {
  const response = await fetch(`${API_BASE}/stats`);
  const stats = await response.json();

  console.log('📈 Knowledge Graph Statistics:');
  console.log('═══════════════════════════════');
  console.log(`Vector Store Documents: ${stats.vectorStore?.documentCount || 0}`);
  console.log(`RDF Triples: ${stats.knowledgeGraph?.totalQuads || 0}`);
  console.log(`Entities: ${stats.knowledgeGraph?.entityCount || 0}`);
  console.log('═══════════════════════════════\n');
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  Knowledge Graph Integration Test       ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    // Step 1: Import the article
    await importArticleToKnowledgeGraph();

    // Wait a bit for indexing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Get statistics
    await getStats();

    // Step 3: Test queries
    console.log('🧪 Testing Natural Language Queries:\n');

    // Query 1: Who built the Battery Management System?
    await queryKnowledgeGraph('Who built the Battery Management System?');

    console.log('\n' + '─'.repeat(80) + '\n');

    // Query 2: Who invented components in the electric vehicles category?
    await queryKnowledgeGraph('Who invented components in the electric vehicles category?');

    console.log('\n' + '─'.repeat(80) + '\n');

    // Query 3: What companies manufacture EV components?
    await queryKnowledgeGraph('What companies manufacture EV components?');

    console.log('\n✅ Test completed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
runTest();
