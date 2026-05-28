/**
 * RAG documents for the requirements-hv seed project.
 *
 * Eighteen markdown documents covering:
 *   - Source-volume excerpts (German — the in-house translation of the
 *     English inbox into the working language; what the agent parses +
 *     normalises against).
 *   - The late-clarifications memo (German — in-house translation).
 *   - Past-offer excerpts from the firm's reuse base (German — the firm's
 *     past German technical specifications; what the agent retrieves
 *     during the *transform* step).
 *   - Type-test report excerpts (German).
 *   - Internal style guide + handover notes (German).
 *
 * All content is stylised / paraphrased — no real customer or contractor
 * specification text is shipped.
 *
 * Note on the language flow this seed demonstrates:
 *   English Word documents arrive in <project>/inbox/ (the inbox fixture).
 *   They are translated in-house into the German files below (this fixture)
 *   under <project>/documents/. The export step renders the German
 *   deliverable with English back-translations annotated side-by-side.
 */

export interface RagDocDraft {
  filename: string;
  body: string;
}

export const RAG_DOCS: RagDocDraft[] = [
  // --- Source-volume excerpts (German) -----
  {
    filename: 'source-volume-1-functional-spec-excerpt.md',
    body: `# Volume 1 — Funktionsspezifikation (Auszug)

**Kunde:** Nordseeübertragungs-Netz GmbH (NSÜN)
**Projekt:** NU-525-Lot-3 — Onshore-Stationseinheit der HGÜ-Verbindung
**Stand:** 2026-02-12

## §2 Nenngrößen

§2.1 Die Konverterstation muss für eine dauerhafte Nenn-Gleichspannung
von ±525 kV ausgelegt werden. *(siehe REQ-101)*

§2.2 Die Konverterstation muss für eine dauerhafte Nenn-Wirkleistung
von 2 GW ausgelegt werden. *(siehe REQ-102)*

§2.3 Die Konverterstation muss bidirektional übertragbar sein bei
voller Nennleistung in beide Richtungen. *(siehe REQ-103)*

## §6 Blindleistung

§6.2 Der Konverter muss an jedem Punkt innerhalb der in Annex A §3
definierten PQ-Hüllkurve betrieben werden können. *(siehe REQ-181)*

§6.3 Der Konverter muss kontinuierliche Blindleistungsunterstützung bei
voller Nennwirkleistung bereitstellen. *(siehe REQ-182)*

§6.5 Der Konverter muss einen Blindleistungsbereich von ±0,95
kapazitiv / ±0,95 induktiv bei voller Wirkleistung bereitstellen.
*(siehe REQ-184 — geändert durch Klarstellungsmemo 2026-04-18)*
`,
  },
  {
    filename: 'source-volume-2-annex-a-electrical-performance-excerpt.md',
    body: `# Volume 2 — Annex A: Elektrisches Verhalten (Auszug)

## §6 Wirkleistungsregelung

§6.1 Der Konverter muss einen Wirkleistungssollwert mit einem
stationären Regelfehler von höchstens 0,5 % der Bemessungsleistung
nachführen. *(REQ-241)*

§6.2 Bei einer Sollwertänderung von ≤ 500 MW muss der Konverter den
neuen Sollwert innerhalb von 1,0 s erreichen. *(REQ-242)*

§6.3 Die Wirkleistungs-Anstiegsrate muss zwischen 100 MW/min und
1500 MW/min konfigurierbar sein. *(REQ-243)*

## §7 Fehlerverhalten

**§7.4.3** Spannungseinbrüche / Fault-Ride-Through.

Die Tabelle in §7.4.2 gibt die zulässigen Grenzwerte für
harmonische Verzerrungen an. **Fußnote 2:** Bei einem dreiphasigen
vollständigen Spannungseinbruch am Konverter-AC-Sammelschienen-
anschluss muss der Konverter angeschlossen bleiben und seine
Vorstörungs-Wirkleistung **innerhalb von 250 ms** wieder aufnehmen.
*(REQ-247 — kritische Anforderung, die in einem Fußnotenkontext
unter einer Oberschwingungs-Tabelle verborgen ist.)*

## §8 Blindleistung & Schwingungen

§8.1 Der Konverter muss eine Blindleistungs-Sollwertänderung von
±200 MVAr innerhalb von 100 ms erreichen. *(REQ-251)*

§8.4 Der Konverter muss subsynchrone Schwingungen im Bereich 2–15 Hz
mit einem Dämpfungsmaß ≥ 0,10 dämpfen. *(REQ-252 — derzeit offen,
keine Wiederverwendungsquelle identifiziert.)*
`,
  },
  {
    filename: 'source-volume-3-annex-b-protection-control-excerpt.md',
    body: `# Volume 3 — Annex B: Schutz- und Leittechnik (Auszug)

## §2 Schutzsystem

§2.1 Das Schutzsystem muss redundante Differentialschutz-
Einrichtungen gemäß IEC 61850-9-2 enthalten. *(REQ-211)*

§2.4 Auslösesignale müssen dem Konverter innerhalb von 5 ms nach
Fehlererkennung übermittelt werden. *(REQ-212)*

## §4 Arbitrierung

§4.2 Wenn ein Schwarzstart-Signal anliegt, muss das Leitsystem die
Priorität zwischen Schutz-Auslösung und Schwarzstart-Befehlen
gemäß der Prioritätstabelle in §4.3 arbitrieren. *(REQ-219)*

## §5 Protokollierung

§5.3 Das Leitsystem muss alle Sollwertänderungen mit
millisekundengenauer Zeitstempelung und einer manipulationssicheren
Hash-Kette protokollieren. *(REQ-221)*

## §7 Kommunikation

§7.6 Bei Ausfall der Inter-Stations-Kommunikation muss der Konverter
ohne Auslösung innerhalb von 200 ms in autonomen Steuermodus
übergehen. *(REQ-238 — Abweichung beantragt: 220 ms.)*
`,
  },
  {
    filename: 'source-volume-4-annex-c-harmonics-excerpt.md',
    body: `# Volume 4 — Annex C: Oberschwingungs- und Spannungsqualitätsgrenzen (Auszug)

## §3 Grenzwerte am Verknüpfungspunkt (PCC)

§3.1 Die Konverterstation muss die in Tabelle C.1 angegebenen
Oberschwingungsstromgrenzwerte einhalten. *(REQ-301)*

§3.2 Die Konverterstation muss die in Tabelle C.2 angegebenen
Oberschwingungsspannungs-Verzerrungsgrenzwerte einhalten. *(REQ-302)*

§3.3 Die gesamte harmonische Verzerrung (THD) am Verknüpfungspunkt
darf **bei keinem Betriebspunkt 0,9 % überschreiten**.
*(REQ-303 — strenger als die in vergleichbaren Projekten erzielten
1,5 %.)*

## §4 Filterauslegung

§4.2 Die Oberschwingungsfilter müssen über den gesamten Betriebs-
temperaturbereich gemäß Annex D wirksam bleiben. *(REQ-304)*

## §5 Komponenten und Verluste

§5.1 Oberschwingungs-Filterkomponenten müssen von Lieferanten
bezogen werden, die gemäß §5 qualifiziert sind. *(REQ-305)*

§5.6 Die Filterverluste dürfen 0,15 % der Stationsbemessungsleistung
gemittelt über die Betriebshüllkurve nicht überschreiten. *(REQ-307)*

## §6 Nachweise

§6.1 Die Einhaltung der Oberschwingungs-Emissionen muss durch
Vor-Ort-Messung gemäß IEC 61000-4-7 nachgewiesen werden. *(REQ-308)*
`,
  },
  {
    filename: 'source-volume-5-annex-def-auxiliaries-excerpt.md',
    body: `# Volume 5 — Annex D-F: Hilfsbetriebe / Kühlung / Bautechnik (Auszug)

## Annex D §2.4

Die **Hilfsbetriebe der Reservelinie** müssen aus einer separaten
AC-Hilfssammelschiene versorgt werden. *(REQ-376 — Bereich
mehrdeutig: Werden die Kühlskid-Hilfsbetriebe einbezogen?)*

## Annex E §3.1

Das bauseitige HVAC-System muss für einen Umgebungstemperaturbereich
von **–25 °C bis +40 °C** ausgelegt werden. *(REQ-411 — implizit
widersprüchlich zum Klarstellungsmemo 2026-04-18, das in der
Wärmeabfuhr-Klausel –30 °C zitiert.)*

## Annex E §6.2

Das Brandschutzsystem in der Konverterhalle muss als
Inertgas-System gemäß VdS CEA 4001 ausgeführt werden. *(REQ-433 —
Abweichung beantragt: Wassernebel gemäß FM Global 5560.)*

## Annex F §1.4

Das Kühlwassersystem muss als geschlossener Kreislauf mit einer
Verfügbarkeit von ≥ 99,5 % ausgelegt werden. *(REQ-451 — offen.)*
`,
  },
  {
    filename: 'source-volume-6-grid-code-excerpt.md',
    body: `# Volume 6 — Netzanschluss-Konformität (Auszug)

## §1 Geltungsbereich

§1.1 Die Konverterstation muss alle obligatorischen Bestimmungen
der EU-Verordnung 2016/1447 (NC-HVDC) erfüllen. *(REQ-601)*

§1.2 Die Konverterstation muss die landespezifischen Überlagerungen
der BNetzA TAB-HS 2024 erfüllen. *(REQ-602)*

§1.4 Die Konformitätsnachweise müssen in der innerhalb der
technischen Spezifikation gelieferten Konformitätsmatrix mit
nachvollziehbaren IDs dargestellt werden. *(REQ-603)*

## §4 Verhältnis zu IEEE-Normen

§4.2 Soweit IEEE 1547 in Annex E zitiert wird, ist es ausschließlich
**informativ** zu behandeln; bindend ist die BNetzA TAB-HS.
*(REQ-621)*

## §5 Firmware-Typprüfung

§5.3 Alle Firmware-Versionen sicherheitskritischer Steuerungsgeräte
müssen gemäß BNetzA TAB-HS 2024 §11 typgeprüft sein. *(REQ-904 —
offen.)*
`,
  },
  {
    filename: 'source-late-clarifications-2026-04-18.md',
    body: `# Klarstellungs-Memo NSÜN — Stand 2026-04-18

**Geltend für:** NU-525-Lot-3 — Onshore-Konverterstation
**Anzahl geänderter Klauseln:** 41

Dieses Memo ergänzt die in der Ausschreibung enthaltenen Volumina 1–4.
Es wurde nach Schließung des Bieterfragen-Fensters herausgegeben.

## §4 Geänderte Klauseln (Auszug)

### §4.2 — Blindleistungsbereich (überschreibt Vol.1 §6.5)
Der Blindleistungsbereich gemäß Volume 1 §6.5 wird ersetzt durch
**±0,90 kapazitiv / ±0,95 induktiv** bei voller Nennwirkleistung.
Begründung: Netzstabilitätsanalyse Q1/2026.

→ **Betrifft REQ-184.** *Vorsicht:* Wiederverwendungsentwürfe aus
Projekten mit dem ursprünglichen Profil ±0,95/±0,95 erfüllen die
neue Anforderung nicht — Anpassung erforderlich.

### §4.7 — Umgebungstemperatur (überschreibt Annex E §3.1)
Im Zusammenhang mit der Wärmeabfuhr-Klausel ist der untere
Temperaturwert auf **–30 °C** zu korrigieren.

→ **Betrifft REQ-411.** Implizit widersprüchlich zur ursprünglichen
Annex-E-Klausel mit –25 °C. **Klärung empfohlen.**

### §4.14 — Verbleibende geänderte Klauseln
(39 weitere Änderungen, jeweils mit Querverweis auf die
ursprüngliche Klausel — zur vollständigen Liste siehe Anlage 1 des
Memos.)
`,
  },

  // --- Altangebotsauszüge (Deutsch, die Wiederverwendungsbasis) -----
  {
    filename: 'reuse-northshore-2022-mmc-control.md',
    body: `# Northshore-2022 — MMC-Regelschema (Auszug)

**Projekt:** Northshore-HGÜ-Verbindung
**Jahr:** 2022
**Art:** Geliefertes technisches Pflichtenheft

## Wirkleistungsregelung (Auszug)

Der Konverter nutzt eine vektorstromgeregelte Modular-Multilevel-Topologie
(MMC). Die Wirkleistungs-Sollwertnachführung ist als zweistufige Kaskade
ausgelegt: eine äußere Leistungsregelschleife und eine innere
Stromregelschleife, beide laufen mit 10 kHz auf dem
Konverter-Regelungsrahmen.

Sollwertänderungen bis 600 MW werden innerhalb von 1,2 s erreicht, mit
einem stationären Regelfehler von 0,3 % der Bemessungsleistung. Die
Anstiegsrate ist über die IEC-61850-MMS-Schnittstelle zwischen
80 MW/min und 1800 MW/min konfigurierbar.

## Fehlerdurchfahrt (FRT)

Die Northshore-Auslegung durchfährt einen dreiphasigen vollständigen
Spannungseinbruch am AC-Sammelschienenanschluss und nimmt die
Vorstörungs-Wirkleistung innerhalb von 220 ms wieder auf. Der Mechanismus
beruht auf dem internen Energiepuffer der MMC in Verbindung mit einer
Dämpfungsregelung, die Nach-Fehler-Schwingungen unterdrückt.

**Typgeprüft bei:** KEMA-Labs Arnhem, 2022-08-14.
**Zertifiziertes Profil:** dreiphasiger vollständiger Spannungseinbruch,
≤ 280 ms Dauer, vollständige Durchfahrt ohne Auslösung.

## Hinweis zur Wiederverwendung für NU-525-Lot-3

Dieses Schema beantwortet REQ-104, REQ-241–246, REQ-247 (FRT-250ms) und
REQ-251–254 mit Anpassung der Sollwerte und Anstiegsraten an den
Kundenbereich. Stilanwendung gemäß
[Stilhandbuch](./reuse-internal-german-style-guide.md).
`,
  },
  {
    filename: 'reuse-northshore-2022-frt-type-test.md',
    body: `# Northshore-2022 — FRT-Typprüfbericht (Auszug)

**Projekt:** Northshore-HGÜ-Verbindung
**Prüfeinrichtung:** KEMA-Labs Arnhem
**Prüfdatum:** 2022-08-14
**Bezeugt durch:** TÜV Süd

## Prüfprofil
- Dreiphasiger vollständiger Spannungseinbruch am Konverter-AC-Sammelschienenanschluss.
- Dauer 250 ms.
- Vorstörungs-Wirkleistung: 1800 MW.

## Ergebnis
- Der Konverter blieb durchgängig am Netz.
- Die Wirkleistungsabgabe erreichte innerhalb von **218 ms** nach
  Spannungswiederkehr den Sollwert mit einer Genauigkeit von 2 %.
- Keine Schutzauslösung, kein Notabschalten, keine Verschlechterung des
  geregelten Modus.

## Reserve
Reserve des Prüfprofils gegenüber REQ-247 (250-ms-Durchfahrt): **32 ms**.

## Hinweis zur Wiederverwendung
Dieser Bericht ist der zertifizierte Nachweis für die FRT-250-ms-Antwort
auf REQ-247. Der entworfene Antworttext referenziert die Prüfung mit
der ID (KEMA-NS22-FRT-014). Die Konformitätsmatrix führt den
Zertifikat-Dateinamen in das Lieferdokument fort.
`,
  },
  {
    filename: 'reuse-capeline-2023-protection.md',
    body: `# Capeline-2023 — Schutzphilosophie (Auszug)

**Projekt:** Capeline-HGÜ-Verbindung
**Jahr:** 2023
**Art:** Geliefertes technisches Pflichtenheft

## Redundanter Differentialschutz

Zwei unabhängige Differentialschutz-IEDs (intelligente elektronische
Geräte) arbeiten gemäß IEC 61850-9-2 Sampled Values. Jedes liefert ein
Auslösesignal innerhalb von 4,5 ms nach Fehlererkennung an den
Konverter-Auslösebus (einschließlich IED-Verarbeitung und SV-Übertragung).

## Kommunikationsausfall-Rückfall

Bei Ausfall der Interstationskommunikation fällt der lokale Konverter
innerhalb von **250 ms** in den autonomen Steuermodus zurück, ohne
auszulösen. Der Mechanismus ist ein Watchdog-Timer auf dem
Interstations-Heartbeat; nach drei aufeinanderfolgenden ausgefallenen
Heartbeats übernimmt die autonome Steuerung.

## Hinweis zur Wiederverwendung für NU-525-Lot-3

Capeline beantwortet REQ-211, REQ-212, REQ-219, REQ-221 direkt. Für
REQ-238 (Interstations-Rückfall innerhalb von 200 ms) ist Capelines
250 ms **zu langsam** — eine formale Abweichung wird vorgeschlagen mit
einem 220-ms-Angebot, das auf einer noch nicht typgeprüften
Steuerkarten-Variante beruht. Siehe Abweichungsbegründung zu REQ-238.
`,
  },
  {
    filename: 'reuse-reefnet-2020-harmonic-filters.md',
    body: `# Reefnet-2020 — Oberschwingungs-Filterauslegung (Auszug)

**Projekt:** Reefnet-Offshore-Anbindung
**Jahr:** 2020
**Art:** Geliefertes technisches Pflichtenheft

## Filtertopologie
Ein passives C-Typ-Filter für die 3., 5., 7. und 11. Oberschwingung,
ergänzt durch einen abgestimmten Hochpass-Zweig oberhalb der 13.
Oberschwingung.

## Leistung
Am Verknüpfungspunkt (PCC) lieferte die Auslegung eine Gesamtoberschwingungs-
verzerrung (THD) von **≤ 1,5 %** über die gesamte Betriebshüllkurve
(nachgewiesen durch Vor-Ort-Messung gemäß IEC 61000-4-7).

## Wiederverwendungshinweis — WICHTIG
Die natürliche Wiederverwendung für das Annex-C-Cluster
(REQ-301..REQ-308) ist die Reefnet-Filterauslegung. **Jedoch** verlangt
NSÜNs REQ-303 **THD ≤ 0,9 %** am PCC — deutlich strenger als
Reefnets 1,5 %.

Eine Übernahme ohne Anpassung würde den Grenzwert still verfehlen. Das
Cluster braucht eine **neu abgestimmte Filtertopologie** oder eine
formale Abweichung. Cluster-Kopf: REQ-303 → REQ-304, REQ-305, REQ-307.

Eine Neuabstimmung auf aktive Filterung (hybrid passiv + aktiver
Oberschwingungs-Kompensator) wurde in der Aurora-2024-Auslegung
evaluiert und erreicht ≤ 0,7 %. Cross-Pull aus dieser Auslegung vor
dem Entwurf von Annex C.
`,
  },
  {
    filename: 'reuse-aurora-2024-reactive-power.md',
    body: `# Aurora-2024 — Blindleistungs-Fähigkeitskurve (Auszug)

**Projekt:** Aurora-HGÜ-Bipol
**Jahr:** 2024
**Art:** Geliefertes technisches Pflichtenheft

## PQ-Hüllkurve (wie geliefert)
Bei voller Wirkleistungsabgabe operierte der Aurora-Konverter in einem
Blindleistungsbereich von **±0,95 voreilend / ±0,95 nacheilend**.

## Hinweis zur Wiederverwendung für NU-525-Lot-3
Die Aurora-Hüllkurve beantwortet REQ-181, REQ-182, REQ-183 direkt.

Für REQ-184 hat das Klarstellungsmemo vom 2026-04-18 den geforderten
voreilenden Bereich von ±0,95 auf **±0,90** geändert. Die
Aurora-Wiederverwendungsstelle **beantwortet das ursprüngliche
±0,95-Profil** und muss vor dem Commit angepasst werden.
**Override-Kante im Knowledge-Graph vorhanden; Override-Chip auf dem
Coverage-Dashboard sichtbar.**
`,
  },
  {
    filename: 'reuse-internal-german-style-guide.md',
    body: `# Hausintern — Stilhandbuch für die deutsche technische Spezifikation (Auszug)

**Zielgruppe:** Angebotsteam-Ingenieure und der entwurfsschreibende Agent
**Letzte Überarbeitung:** 2025-11

## Modalverben für Normativität
| Stärke | Deutsch | Wann |
|---|---|---|
| Pflicht | **muss** | Immer; bindende Verpflichtungen des Angebots. |
| Erlaubt | **darf** | Nur in erlaubender Formulierung. |
| Empfohlen | **sollte** | Empfehlungen; nie für bindende Verpflichtungen. |

**Niemals** das umgangssprachliche **soll** verwenden — es ist im
juristischen Deutsch zwischen "shall" und "should" mehrdeutig und hat
in mindestens einem dokumentierten Site-Acceptance-Streit zu Problemen
geführt.

## Zahlen und Einheiten
- Dezimaltrennzeichen: Komma (z. B. **1,5 MW**).
- Tausendertrennzeichen: schmales Leerzeichen oder keines
  (**1 500 MW** oder **1500 MW**).
- Einheiten im SI; °C mit Gradzeichen.
- Sollwertbereiche mit Halbgeviertstrich: **–25 °C bis +40 °C**.

## Begriffe, die nicht übersetzt werden
Normenverweise (IEC 62271-1, EU NC-HVDC), Anforderungs-IDs (REQ-247),
Anhangsverweise (Annex C §3.3), Projektnamen.

## Ton
Direkt, deklarativ, keine Marketingstimme. Das Lieferdokument ist eine
vertragliche Urkunde, kein Verkaufsdokument.

## Englische Rückübersetzung im Export

Beim Exportschritt wird jede deutsche Antwort mit einer englischen
Rückübersetzung Seite an Seite annotiert (siehe
[Pipeline — Export](../wiki/topics/pipeline-export.md)). Die
Rückübersetzung folgt diesen Regeln:

- **muss → "shall"**, **darf → "may"**, **sollte → "should"** —
  Modalverben werden eins zu eins zurückübersetzt; die strikte
  Trennung zwischen *shall / should* darf nicht verschwimmen.
- Dezimalzahlen werden in der englischen Konvention dargestellt
  (1,5 MW → 1.5 MW), das Vorzeichen ± und Einheiten bleiben.
- Normenverweise, IDs und Anhangsverweise sind bereits in der deutschen
  Fassung untranslated — sie werden 1:1 übernommen.
- Der englische Annotationsblock zitiert seine deutsche Originalstelle
  per Absatz-ID, damit der Prüfer rückwärts navigieren kann.
`,
  },

  // --- Hausinterne Übergabe-Notizen + Spezifikationen -----
  {
    filename: 'internal-handover-anke-vogt-controls.md',
    body: `# Hausinterne Übergabe — Regelung & Schutz (A. Vogt)

Das MMC-Regelschema aus Northshore-2022 ist unsere Referenzauslegung für
REQ-104 + REQ-241..268 in diesem Angebot. Zwei wichtige Hinweise, bevor
der Entwurf committet wird:

1. Northshore ist auf 1800 MW ausgelegt; dieses Angebot auf 2 GW. Die
   Wirkleistungs-Anstiegstabelle braucht proportionale Skalierung. Der
   Entwurf des Agenten macht das korrekt; trotzdem den stationären
   Regelfehler gegen die aktualisierte Stromregelschleifen-Bandbreite
   gegenprüfen.

2. REQ-247 (FRT-250ms) hat eine Reserve von 32 ms gegenüber der
   Northshore-Typprüfung. Wir liegen innerhalb der Hüllkurve, doch in
   der Konformitätsmatrix muss als Zertifikatsreferenz der Bericht
   **KEMA-NS22-FRT-014** stehen — nicht die Zusammenfassung aus §7 der
   Northshore-Spezifikation. Die Referenz im exportierten PDF prüfen.

REQ-252 (subsynchrone Dämpfung) ist **offen** — Northshore hatte diese
Anforderung nicht explizit. Entweder eine Klärung zur
Dämpfungsgrad-Messnorm oder ein frischer Entwurf aus dem analytischen
Modell. Mit B. Haag am 2026-05-21 besprochen.
`,
  },
  {
    filename: 'internal-handover-bernd-haag-harmonics.md',
    body: `# Hausinterne Übergabe — Netzqualität (B. Haag)

Das Annex-C-Cluster (REQ-301..REQ-308) ist das größte
Wiederverwendungs-Mismatch-Risiko dieses Angebots. Reefnet-2020 ist die
natürliche Wiederverwendung, lieferte aber THD ≤ 1,5 %. NSÜNs REQ-303
ist **0,9 %**. Der Agent hat die vier betroffenen Anforderungen
(REQ-303, REQ-304, REQ-305, REQ-307) mit einem
**reuse-mismatch**-Chip auf dem Coverage-Dashboard markiert.

Optionen:

- **Neu abstimmen** auf eine Hybrid-Topologie (passiv + aktiv);
  Aurora-2024 erreichte ≤ 0,7 %. Erhöht den Capex; technischer Aufwand
  ca. 2 Wochen.
- **Abweichen** mit einer kaufmännischen Alternative (Reefnet-artiges
  passives Filter bei 1,5 % THD + Messprotokoll nach Zuschlag). Hohes
  Risiko eines Nachteils im Angebot.
- **Klären**, ob der THD-Grenzwert am PCC oder an den Konverterklemmen
  gilt (die NSÜN-Klausel ist im Abschnitt zu den Normenverweisen
  mehrdeutig).

Entscheidung am Engineering-Review-Gate G2 erforderlich. Bis dahin
ist kein Commit zulässig.
`,
  },
  {
    filename: 'internal-post-mortem-bid-2024.md',
    body: `# Hausinterne Nachbetrachtung — Verlorenes Angebot, 2024-Q4

**Angebot:** Vergleichbare 525-kV-HGÜ-Konverterstation, anderer
Übertragungsnetzbetreiber.
**Ergebnis:** Angebot verloren wegen einer technischen
Nichtkonformität, die das Review-Team des Kunden fand — eine einzelne
Anforderung unter einer Oberschwingungs-Tabelle, in der eine 200-ms-FRT-
Antwort committet wurde, während die Quelle 100 ms verlangte.

## Ursache
Die Wiederverwendungsstelle stammte aus einem Projekt, das das mildere
200-ms-Profil beantwortet hatte. Der Entwurf wurde in der letzten Woche
vor Abgabe im Stapel committet. Kein Ingenieur las die konkrete Klausel;
die Coverage-Matrix zeigte *committed* und das Angebotsteam ging weiter.

## Was wir an unserem Prozess geändert haben
1. **Kein Stapel-Commit von entworfenen Zeilen.** Eine *drafted*-Zeile
   wechselt nur über die Einzelentscheidung eines Ingenieurs nach
   *committed* — auf Aktenlage.
2. **Override-Flag bei jeder späten Klarstellung.** Änderungen von
   Quellklauseln werden als separate Kante im Knowledge-Graph verfolgt;
   der Entwurf wird niemals still mit der Änderung verschmolzen.
3. **Der Agent entwirft nicht für mehrdeutige Anforderungen.** Er
   markiert sie für die Klärungs-Warteschlange. Ein erfundenes messbares
   Kriterium ist genau, wie Streitigkeiten am Site-Acceptance verloren
   werden.

## Was das Projekt requirements-hv weiterhin durchsetzen muss
Das Coverage-Dashboard macht den Unterschied *drafted vs. committed*
jederzeit sichtbar. Der Exportschritt weigert sich, eine Zeile zu
rendern, die nicht in *committed / deviation / clarify* ist. Diese
Sicherungen existieren wegen dieser Nachbetrachtung.
`,
  },
  {
    filename: 'internal-coverage-dashboard-spec.md',
    body: `# Coverage-Dashboard — hausinterne Spezifikation

## Zweck
Die einzige Sicht auf den Fortschritt des Angebots. Jede Anforderung ist
eine Zeile, jede Zeile hat einen Zustand.

## Zustände (müssen pro Zeile sichtbar sein)
- **open** — geparst + normalisiert; kein Entwurf.
- **drafted** — der Agent hat abgerufen + angepasst + im Hausstil
  verfasst; kein Ingenieur hat gelesen.
- **reviewed** — Ingenieur hat gelesen; iteriert.
- **committed** — ausdrückliche menschliche Entscheidung; gesperrt.
- **deviation** — das Angebot wird abweichen; Begründung dokumentiert.
- **clarify** — mehrdeutig; Kundenklärung angefordert.

## Chips
- **override** — geändert durch das Klarstellungsmemo.
- **reuse-mismatch** — aus einer Wiederverwendungsquelle entworfen, die
  die Anforderung nicht erfüllt.
- **clarify** — Anforderung ist mehrdeutig (getrennt vom
  *clarify*-Zustand; eine *drafted*-Zeile kann einen *clarify*-Chip
  tragen, wenn eine untergeordnete Mehrdeutigkeit noch nicht in den
  *clarify*-Zustand eskaliert wurde).
- **reuse: <quelle>** — aus welcher Altspezifikation der Entwurf gezogen
  wurde.

## Aggregierte Sichten
- Nach Zustand (Zählung).
- Nach Quellvolume.
- Nach verantwortlichem Ingenieur.
- Nach Abgabe-Gate (G1 / G2 / G3).

## Gate-Durchsetzung
Am G3 (Commit-Gate) verweigert sich der Export, wenn eine Zeile in
*open / drafted / reviewed* ist. Die Blocker werden mit ihren Inhabern
aufgelistet.
`,
  },
];
