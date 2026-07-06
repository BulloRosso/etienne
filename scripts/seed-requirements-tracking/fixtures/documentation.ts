/**
 * documentation.md (German quick tour) + .etienne/user-interface.json payload.
 */

export const DOCUMENTATION_MD = `# TenderTrace — tendertrace-stadtwerke

## Was ist das hier?

Dieses Projekt ist ein **TenderTrace-Arbeitsbereich**: das Ausschreibungs- und
Umsetzungsgedächtnis für die Vergabe **T-2026-014 "Kundenselfservice-Portal
Stadtwerke Musterstadt"** (Auftragnehmer: NovaSys GmbH). Lena hat das Angebot
verantwortet, Sara führt das Projekt seit dem Zuschlag.

Der Grundsatz des Produkts: **Agenten schlagen vor — Menschen entscheiden.**
Jede Anforderung wurde aus den Vergabeunterlagen als atomare EARS-Anforderung
mit wörtlichem Zitat extrahiert und von einem Menschen freigegeben. Am
30.04.2026 wurde die **Baseline v1.0** eingefroren; seitdem existiert jede
Änderung nur als genehmigter Diff mit Beleg (wer hat was wann gesagt).

## Stand heute (06.07.2026)

- 22 freigegebene Anforderungen, Baseline v1.0 vom 30.04.2026
- 2 genehmigte Drift-Diffs aus dem Jour Fixe KW23:
  Berichtsexport **PDF → PDF, CSV oder XML** (als **Nachtrag** akzeptiert)
  und die Lastklarstellung **500 gleichzeitige Nutzer** (in-scope)
- 1 **ungelöster Konflikt**: die Cloud-Ablage-E-Mail von Fr. Kern (18.06.)
  widerspricht der On-Premises-Vorgabe — die Karte wartet in der Drift-Inbox
- 1 offene Extraktionskarte in der Review-Queue (SEPA-Lastschrift)
- PORTAL-231 ("Berichtsexport PDF") ist als **stale** markiert: das Ticket
  setzte die alte PDF-Fassung um; der Kommentarentwurf wartet auf Freigabe
- PORTAL-310 ("XML-Export gegen Kunden-XSD validieren") hat **keine**
  vertragliche Grundlage — der Shadow-Scope-Kandidat liegt zur Entscheidung vor
- Nachtrag 01 "Exportformate" ist angelegt und bepreist

## Rundgang (empfohlene Reihenfolge)

1. **Drift-Inbox** öffnen: die ungelöste Konflikt-Karte (Cloud-Ablage vs.
   On-Premises) und die entschiedenen Karten aus KW23 ansehen.
2. Karten **entscheiden**: der Konflikt blockiert, bis ein Mensch auflöst,
   welche Anforderung gewinnt (in-scope / Nachtrag / ablehnen / klären).
3. Den **Thread** einer Anforderung öffnen (z. B. den Berichtsexport):
   Ausschreibungszitat → Baseline v1.0 → genehmigter Diff mit Beleg →
   aktuelle Fassung → verknüpfte Tickets → Abnahmestatus.
4. Im Tracker ein **Issue-Ereignis simulieren** (z. B. PORTAL-240 auf
   "Fertig") und zusehen, wie der abgeleitete Umsetzungsstatus reagiert.
5. **Abweichungsbericht** seit Baseline v1.0 erzeugen — die vollständige
   Verhandlungshistorie auf Knopfdruck.
6. **Claims** öffnen: Nachtrag 01 bündelt den Export-Change-Order mit
   Baseline-Text, geänderter Fassung, Beleg und Genehmigungspfad.

## Wie geht es weiter?

Neue Protokolle oder E-Mails als Artefakt registrieren (oder in Quick Capture
einfügen) — der Drift-Agent schlägt Karten vor, entschieden wird im UI. Der
Projekt-Agent (Chat) recherchiert über die MCP-Tools und darf ausschließlich
Vorschläge einreichen; keine Entscheidung fällt ohne Menschen.
`;

export const USER_INTERFACE_JSON = {
  previewDocuments: [
    'out/tendertrace/pages/drift-inbox.tendertrace.json',
    'out/tendertrace/pages/dashboard.tendertrace.json',
    'documentation.md',
  ],
};
