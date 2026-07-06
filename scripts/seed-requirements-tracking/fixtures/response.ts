/**
 * Response-builder sections (bid phase). Section 3 gets a saved markdown body
 * with `<!-- trace: <reqId> | <svcId>.v1 -->` markers and one visible
 * [MISSING: …] placeholder — the export blocker demo.
 *
 * Requirement/service ids are captured at runtime, so allocations use fixture
 * keys and the body is a factory.
 */

export interface ResponseSectionFixture {
  key: string;
  title: string;
  instructions: string;
  /** extraction fixtureKeys resolved to captured REQ ids */
  allocatedKeys: string[];
  /** optional saved body; receives resolver functions for captured ids */
  buildBody?: (
    reqIdOf: (fixtureKey: string) => string,
    svcIdOf: (serviceKey: string) => string,
  ) => string;
}

export const RESPONSE_SECTIONS: ResponseSectionFixture[] = [
  {
    key: 'fachlich',
    title: 'Kapitel 1 — Fachliche Lösung',
    instructions:
      'Fachliche Anforderungen (Benutzerkonto, Verbrauchsübersicht, Berichte, Zählerstände) entlang der freigegebenen Verdicts beantworten. Nur Aussagen mit Katalog-Beleg; Lücken als [MISSING: …] stehen lassen.',
    allocatedKeys: ['login', 'doubleoptin', 'consumption-view', 'export-pdf', 'meter-reading'],
  },
  {
    key: 'betrieb-sicherheit',
    title: 'Kapitel 2 — Betrieb, Sicherheit & SLA',
    instructions:
      'On-Premises-Datenhaltung, Authentifizierung, Verschlüsselung und SLA-Zusagen aus dem Betriebs-Paket darstellen. NEEDS_INPUT-Anforderungen (Revisionssicherheit) erst nach interner Klärung zusagen.',
    allocatedKeys: ['onprem', '2fa', 'tls', 'audit-log', 'availability', 'response-time'],
  },
  {
    key: 'referenzen-schulung',
    title: 'Kapitel 3 — Referenzen & Schulung',
    instructions:
      'Schulungs- und Supportzusagen aus Schulungspaket und Betriebs-Paket belegen; Referenzprojekt Stadtwerke Beispielstadt einbinden. Referenzkunden-Freigabe über den Vertrieb einholen.',
    allocatedKeys: ['training', 'documentation', 'hotline'],
    buildBody: (reqIdOf, svcIdOf) => `## Schulung und Wissenstransfer

<!-- trace: ${reqIdOf('training')} | ${svcIdOf('schulungspaket')}.v1 -->
NovaSys führt vor Inbetriebnahme zwei Schulungstage in den Räumen der Stadtwerke Musterstadt durch (Administrations- und Anwenderschulung). Die deutschsprachigen Schulungsunterlagen sind auf die projektspezifische Konfiguration zugeschnitten, verbleiben beim Auftraggeber und dürfen intern weiterverwendet werden.

## Dokumentation

<!-- trace: ${reqIdOf('documentation')} | ${svcIdOf('kundenportal-modul')}.v1 -->
Zum Lieferumfang gehört eine vollständige Anwender- und Betriebsdokumentation in deutscher Sprache (Installationsanleitung, Administrationshandbuch, Benutzerleitfaden), die bei jeder wesentlichen Änderung fortgeschrieben und elektronisch übergeben wird.

## Support und Hotline

<!-- trace: ${reqIdOf('hotline')} | ${svcIdOf('betrieb-sla')}.v1 -->
Störungsmeldungen nimmt NovaSys werktags von 8 bis 17 Uhr über eine deutschsprachige telefonische Hotline entgegen; außerhalb dieser Zeiten steht das Ticketsystem bereit, Bearbeitung am folgenden Arbeitstag.

## Referenz

[MISSING: Referenzkunde für Kapitel 3 — Vertrieb]
`,
  },
];
