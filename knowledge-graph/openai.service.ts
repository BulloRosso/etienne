import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAiService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Erstellt ein Embedding für den gegebenen Text
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }

  /**
   * Übersetzt eine natürliche Sprache Anfrage in SPARQL
   */
  async translateToSparql(query: string): Promise<string> {
    const systemPrompt = `Du bist ein Experte für SPARQL-Abfragen. Übersetze natürliche Sprache in SPARQL-Abfragen.

Das Knowledge Graph Schema verwendet folgende Entitäten und Beziehungen:

PREFIXES:
PREFIX kg: <http://example.org/kg/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

ENTITÄTEN:
- kg:Person (hat Eigenschaften: kg:name, kg:email, kg:phone)
- kg:Firma (hat Eigenschaften: kg:name, kg:industry, kg:location)
- kg:Produkt (hat Eigenschaften: kg:name, kg:description, kg:price)

BEZIEHUNGEN:
- kg:istAngestelltBei (Person -> Firma)
- kg:stelltHer (Firma -> Produkt)
- kg:arbeitetMit (Person -> Person)
- kg:hatKunde (Firma -> Firma)

Gib nur die SPARQL-Abfrage zurück, ohne zusätzliche Erklärungen.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      throw new Error(`Failed to translate query to SPARQL: ${error.message}`);
    }
  }

  /**
   * Erweitert den Suchkontext basierend auf einer Benutzeranfrage
   */
  async expandSearchContext(query: string): Promise<string[]> {
    const systemPrompt = `Gegeben eine Benutzeranfrage, generiere verwandte Suchbegriffe und Synonyme, 
    die bei einer Vektorsuche hilfreich sein könnten. Gib eine Liste von 3-5 verwandten Begriffen zurück,
    getrennt durch Kommas.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
      });

      const expansions = response.choices[0].message.content.trim();
      return expansions.split(',').map(term => term.trim());
    } catch (error) {
      throw new Error(`Failed to expand search context: ${error.message}`);
    }
  }
}
