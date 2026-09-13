/**
 * documentation.md (German quick tour) + .etienne/user-interface.json payload
 * for the tender-analysis showcase.
 */
import { TENDER_KEY, TENDER_TITLE } from './mission';

export const DOCUMENTATION_MD = `# TenderTrace — Analyse-Cockpit (${TENDER_KEY})

## Was ist das hier?

Dieses Projekt ist ein **TenderTrace-Analyse-Arbeitsbereich** für die
Ausschreibung **${TENDER_KEY} "${TENDER_TITLE}"**: Die Nordland Handels AG
schreibt den Betrieb ihres Zentrallagers aus; wir (Hansa Logistik GmbH)
prüfen, wie gut unser Leistungskatalog die Anforderungen erfüllt.

Der Grundsatz des Produkts: **Agenten schlagen vor — Menschen entscheiden.**

## Die Ordner

| Ordner | Inhalt |
|---|---|
| \`tender/\` | die Unterlagen des Kunden: Leistungsbeschreibung (Word), Vertragsbedingungen (Word), Mengengerüst (Excel) |
| \`servicecatalog/\` | unser Leistungskatalog (\`leistungskatalog.md\`) und das Glossar Kundenbegriff → unser Begriff |
| \`analysis-template/\` | die Vorlage für die Management-Analyse |
| \`out/analysis/\` | die erzeugte Management-Analyse als Markdown und Word |

Eigene Unterlagen: einfach in \`tender/\` ablegen und im Cockpit **Erneut
einlesen** wählen — unveränderte Dateien werden übersprungen.

## Die fünf Schritte im Analyse-Cockpit

1. **Dokumente einlesen** — alle Dateien in \`tender/\` werden gelesen, jede
   Anforderung wird als atomare EARS-Anforderung mit wörtlichem Zitat
   vorgeschlagen — in *unserer* Terminologie (Glossar), und jede Zahl wird
   gegen das Mengengerüst geprüft. Ein Fortschrittsbalken zeigt, welche
   Datei gerade verarbeitet wird.
2. **Anforderungen prüfen** — jede Karte wird in der Review-Queue von einem
   Menschen freigegeben oder verworfen (Tastatur: A / R / E).
3. **Widersprüche klären** — nur Kennzahlen, die in Text *und* Excel
   vorkommen und abweichen, werden gemeldet. Im Beispiel:
   **12.400 Palettenstellplätze** (Leistungsbeschreibung) gegen **12.000**
   (Mengengerüst). Entscheidung: Ausschreibungswert, Excel-Wert oder „beim
   Kunden klären".
4. **Abgleich mit Leistungskatalog** — erst wenn keine Karte und kein
   Widerspruch mehr offen ist: klare Zuordnungen (Konfidenz ≥ 0,75, keine
   „verwandten" Treffer) und Erfüllungsbewertungen als Vorschläge für die
   Compliance-Matrix. Im Beispiel bleibt die Gefahrgutlagerung
   (Klasse 3) unerfüllt — sie ist in unserem Katalog ausgeschlossen.
5. **Management-Analyse** — nach der Vorlage, als Markdown und Word. Das
   Banner sagt, ob die Analyse **belastbar** ist oder **mit Vorbehalten**
   gilt (offene Kundenklärungen, interne Rückfragen).

## Rundgang (empfohlene Reihenfolge)

1. Cockpit öffnen → **Analyse starten** → Fortschritt beobachten.
2. **Zur Prüfung** → Karten freigeben (Bulk-Freigabe lässt Karten mit
   Unklarheiten oder Widersprüchen bewusst aus).
3. Zurück im Cockpit: den Palettenstellplatz-Widerspruch **beim Kunden
   klären**.
4. **Abgleich starten** → Bewertungs-Chips ansehen → Compliance-Matrix.
5. **Bericht öffnen** (MD/DOCX): Klärungsfragen enthalten den Widerspruch und
   den vagen Begriff „zeitnah" aus der Retourenabwicklung.

## Wie geht es weiter?

Der Projekt-Agent (Chat) erklärt jederzeit den Stand („Wo steht die
Analyse?") und den Bericht — er entscheidet nichts. Entscheidungen fallen
ausschließlich im Cockpit, in der Review-Queue und in der Compliance-Matrix.
`;

export const USER_INTERFACE_JSON = {
  appBar: {
    title: `Analyse-Cockpit — ${TENDER_KEY}`,
    fontColor: 'white',
    backgroundColor: '#2E7D32',
  },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      {
        title: 'Wo steht die Analyse?',
        prompt:
          'Erkläre mit rt_get_analysis_status, wo die Ausschreibungsanalyse gerade steht (welcher der fünf Schritte, wie viele Anforderungskarten und Widersprüche offen sind, ob der Abgleich freigeschaltet ist) und was der Mensch als Nächstes tun muss. Entscheide nichts selbst.',
        sortOrder: 1,
      },
      {
        title: 'Offene Klärungen',
        prompt:
          'Liste alle offenen Klärungsfragen an den Kunden (Unklarheiten aus den Anforderungskarten und Zahlenwidersprüche zum Mengengerüst) mit Anforderungs-ID und Quelle. Nutze rt_list_proposals und rt_get_proposal, ändere nichts.',
        sortOrder: 2,
      },
      {
        title: 'Bericht erklären',
        prompt:
          'Fasse die aktuelle Management-Analyse unter out/analysis/ in fünf Sätzen für die Geschäftsführung zusammen: Erfüllungsgrad, die drei größten Risiken, Klärungsbedarf beim Kunden, interne offene Punkte, Belastbarkeit.',
        sortOrder: 3,
      },
    ],
  },
  previewDocuments: [
    'out/tendertrace/pages/analysis.tendertrace.json',
    'documentation.md',
  ],
};
