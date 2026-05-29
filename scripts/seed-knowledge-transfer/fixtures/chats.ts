/**
 * Three sample chat sessions seeded into chat/<sessionId>.jsonl and the
 * chat.sessions.json index. They demonstrate the three signature modes
 * of the onboarding agent:
 *
 *   1. guest-day-one — first contact: baseline interview, progress
 *      tour, start of section 1.1.
 *   2. guest-asilb-deep-dive — the new hire asks for an English deep
 *      dive on ASIL B; agent translates from the German wiki on the fly.
 *   3. anke-curates-driver-ic — Team-lead Anke (role 'user') curates a
 *      new wiki section about the latest driver-IC generation.
 *
 * All timestamps and content stylised — these are not real logs.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  user: string;
  created_at: string;
  last_message_at: string;
  messages: ChatMessage[];
}

export const SESSIONS: ChatSession[] = [
  {
    id: 'guest-day-one-2026-05-26',
    title: 'Erster Tag — Onboarding',
    user: 'guest',
    created_at: '2026-05-26T08:42:00Z',
    last_message_at: '2026-05-26T09:31:00Z',
    messages: [
      {
        role: 'user',
        content: 'Hi — first day here. Anke pointed me at this tool.',
        timestamp: '2026-05-26T08:42:00Z',
      },
      {
        role: 'assistant',
        content:
          "Willkommen bei Lumitec! Ich begleite dich durch dein Onboarding-Curriculum für die LED-Modul-Entwicklung. " +
          "Bevor wir loslegen, drei kurze Fragen — die stelle ich dir genau einmal, dann speichere ich die Antworten als Baseline " +
          "in `progress/guest.progress.json` und passe alle weiteren Erklärungen daran an:\n\n" +
          "1. **Sprache** — willst du Erklärungen lieber auf Deutsch oder Englisch?\n" +
          "2. **Vorerfahrung** — was hast du vor Lumitec gemacht? (Eine Zeile reicht.)\n" +
          "3. **Lernstil** — wie nimmst du am liebsten Neues auf: hands-on (sofort am HiL ausprobieren), read-first (Wiki und Norm-Auszüge lesen, dann anwenden), oder visuell (Diagramme + Architektur-Schaubilder zuerst)?",
        timestamp: '2026-05-26T08:43:00Z',
      },
      {
        role: 'user',
        content:
          'English for deep dives, German is fine for surface stuff. Did 2 years at a semiconductor company on LED driver ICs before this (mostly Allegro and TI parts). Hands-on, definitely — I learn by breaking things.',
        timestamp: '2026-05-26T08:45:00Z',
      },
      {
        role: 'assistant',
        content:
          "Gespeichert. Baseline notiert: `language: en` (mit deutschem Beimaterial), Driver-IC-Hintergrund (interessant — du wirst dich bei Topic 2.1 wahrscheinlich wiedererkennen, wir nutzen Allegro Gen-3 in einer Vorgänger-Plattform), `learning_style: hands-on`.\n\n" +
          "Curriculum-Tour: Es gibt fünf Hauptthemen (Rolle, Produkt, Standards, Werkzeuge, Szenarien). Du musst nicht in der Reihenfolge gehen — wenn dich etwas mehr interessiert, geh dort hin.\n\n" +
          "<preview:progress/guest.progress.json>\n\n" +
          "Hier siehst du den Stand. Wo willst du anfangen — bei Topic 1 (deine Rolle), oder springst du auf Topic 3 (Standards: ISO 26262, AUTOSAR), wo du als Junior typischerweise die meiste Zeit brauchst?",
        timestamp: '2026-05-26T08:46:00Z',
      },
      {
        role: 'user',
        content: "Let's start with Topic 1 — I have no idea who my colleagues are yet.",
        timestamp: '2026-05-26T08:48:00Z',
      },
      {
        role: 'assistant',
        content:
          "Good call. Topic 1 has four leaves: 1.1 Verantwortung, 1.2 Kolleg:innen, 1.3 Kundenprogramme, 1.4 Werkzeug-Lage. Logical order is 1.1 → 1.2 — your responsibility frames who you talk to.\n\n" +
          "Let's start with **1.1 Deine Verantwortung**. Three minute read, then a quick check question.\n\n" +
          "<preview:wiki/topics/1-1-deine-verantwortung.md>\n\n" +
          "Read through, then ask me anything specific that's unclear.",
        timestamp: '2026-05-26T08:49:00Z',
      },
    ],
  },
  {
    id: 'guest-asilb-deep-dive-2026-05-29',
    title: 'ASIL B deep dive (EN)',
    user: 'guest',
    created_at: '2026-05-29T10:24:00Z',
    last_message_at: '2026-05-29T10:46:00Z',
    messages: [
      {
        role: 'user',
        content: 'OK going to 3.1 ISO 26262 now. Can you explain ASIL B in English? The wiki page is German and I want to make sure I understand the nuances.',
        timestamp: '2026-05-29T10:24:00Z',
      },
      {
        role: 'assistant',
        content:
          "Of course — switching to English. ASIL = Automotive Safety Integrity Level (ISO 26262). Four levels: A < B < C < D, plus QM (quality-managed, no ASIL). Classified per hazard from three factors:\n\n" +
          "- **S** (Severity) S0–S3 — possible injury severity\n" +
          "- **E** (Exposure) E0–E4 — how often the situation arises\n" +
          "- **C** (Controllability) C0–C3 — how well the driver can control the situation\n\n" +
          "Lumitec's matrix-LED baseline classifies most hazards as **ASIL B**. Example:\n\n" +
          "- Hazard: a matrix segment switches on when it should be off → glare to oncoming traffic.\n" +
          "- S2 (possible non-fatal injury at night), E4 (frequent night-driving), C2 (oncoming traffic can react but it's hard).\n" +
          "- Table lookup → ASIL B.\n\n" +
          "<preview:documents/iso-26262-asilb-our-baseline.md>\n\n" +
          "Hardware metric targets for ASIL B:\n" +
          "- SPFM ≥ 90 % (Single-Point Failure Metric)\n" +
          "- LFM ≥ 60 % (Latent Failure Metric)\n" +
          "- PMHF ≤ 100 FIT (Probabilistic Metric for random HW Failures)\n\n" +
          "Quick check before we go further — which of these is true at Lumitec for matrix-LED, in your understanding?\n\n" +
          "(a) ASIL B applies because we cannot exceed SPFM ≥ 90 %.\n" +
          "(b) ASIL B was chosen because the camera pipeline is in our scope.\n" +
          "(c) ASIL B follows from (S2, E4, C2); ASIL C would need C3.",
        timestamp: '2026-05-29T10:26:00Z',
      },
      {
        role: 'user',
        content: '(c) — because controllability is C2, not C3.',
        timestamp: '2026-05-29T10:30:00Z',
      },
      {
        role: 'assistant',
        content:
          "Correct. (c) is right. The hardware metrics (a) are *consequences* of being at ASIL B, not the *cause*. (b) is the opposite — when the camera pipeline IS in scope (which it isn't for OEM-A), controllability becomes C3 and you push to ASIL C.\n\n" +
          "Recorded this exchange under node 3.1 of your progress file, plus your earlier follow-up question about *why* we don't go C anyway. You're at **2 Q/A entries** on this topic — get to 3 and you can take the section 3 quiz.\n\n" +
          "Want to keep going on 3.1 (Safety Goals + the FRT 250 ms connection) or switch to 3.2 (AUTOSAR Classic)?",
        timestamp: '2026-05-29T10:32:00Z',
      },
    ],
  },
  {
    id: 'anke-curates-driver-ic-gen5-2026-05-28',
    title: 'Curating: driver-IC Gen-5 evaluation (Anke)',
    user: 'anke',
    created_at: '2026-05-28T16:10:00Z',
    last_message_at: '2026-05-28T16:38:00Z',
    messages: [
      {
        role: 'user',
        content: 'We need to update the driver-IC history doc — the Gen-5 evaluation for OEM-B premium μAFS is now scoped. Two candidates: NXP PCA9959B-Q1 and ST. Can you draft an update to documents/driver-ic-selection-history-2022-2026.md and propose what changes in the wiki?',
        timestamp: '2026-05-28T16:10:00Z',
      },
      {
        role: 'assistant',
        content:
          "Klar. Ich schlage zwei Änderungen vor — beide warten auf deine Bestätigung, bevor sie geschrieben werden:\n\n" +
          "**Vorschlag 1 — `documents/driver-ic-selection-history-2022-2026.md`**\n" +
          "Der bestehende 2026-Eintrag ist heute kurz und kommt zum Schluss: 'Entscheidung steht aus'. Ich würde den Eintrag erweitern um:\n\n" +
          "- Anforderungs-Profil μAFS (Stromdichte, SPI-Takt, ASIL-B-Diagnostik-Coverage).\n" +
          "- Kandidat NXP PCA9959B-Q1: Stärken (Roadmap-Kontinuität zur Gen-4-Familie), Schwächen (Lieferzeit 2027 noch unsicher).\n" +
          "- Kandidat ST (Vor-Entwicklungs-IC): Stärken (höhere Integration), Schwächen (kein Production-PPAP, hohes Programm-Risiko).\n" +
          "- Status: **Entscheidung offen**, Erwartung Q3/2026.\n\n" +
          "**Vorschlag 2 — Wiki**\n" +
          "Die Seite `wiki/topics/2-1-produkte.md` erwähnt μAFS nur in der Tabelle. Ich würde eine Stub-Seite `wiki/topics/2-1-1-μafs-vorentwicklung.md` anlegen, die auf die aktualisierten RAG-Doc zurückzeigt — sodass ein Trainee, der über μAFS stolpert, direkt auf den Stand kommt.\n\n" +
          "Ich schreibe nichts, bevor du grünes Licht gibst. Soll ich Vorschlag 1 ausformulieren, dann zeigst du mir den Diff?",
        timestamp: '2026-05-28T16:14:00Z',
      },
      {
        role: 'user',
        content: 'Ja, mach Vorschlag 1, aber: bei ST nicht "hohes Programm-Risiko" schreiben — Strategic-Sourcing macht da gerade die Bewertung und ich will keine Vorab-Festlegung. Schreib "noch nicht in Lumitec-Programmen erprobt".',
        timestamp: '2026-05-28T16:18:00Z',
      },
      {
        role: 'assistant',
        content:
          "Verstanden — keine Vorab-Festlegung gegen ST. Ich nehme den Wording-Hinweis auf: 'noch nicht in Lumitec-Programmen erprobt' statt 'hohes Programm-Risiko'.\n\n" +
          "Hier der Vorschlag für den neuen 2026-Eintrag (Diff, nicht persistent):\n\n" +
          "```markdown\n" +
          "### 2026 — μAFS-Vorentwicklung\n" +
          "Für OEM-B premium μAFS wird **Gen-5** entwickelt.\n\n" +
          "Anforderungsprofil:\n" +
          "- Stromdichte ~30 % höher als Gen-4 (μAFS mit >1.000 Pixel)\n" +
          "- SPI-Takt ≥ 12 MHz (Gen-4-Niveau, kein Headroom-Anspruch hier)\n" +
          "- ASIL-B-Diagnostik-Coverage ≥ 90 % (Lumitec-Baseline)\n\n" +
          "**Kandidaten:**\n" +
          "- **NXP PCA9959B-Q1**: Roadmap-Kontinuität zur Gen-4-Familie (PCA9956B), bekannter Lieferanten-Workflow. Lieferzeit-Risiko für 2027 SOP-Zeitraum noch in Klärung mit Strategic-Sourcing.\n" +
          "- **STMicroelectronics (μAFS-spezifischer IC, Vor-Entwicklung)**: höhere Integration, noch nicht in Lumitec-Programmen erprobt.\n\n" +
          "Status: **Entscheidung offen**, Erwartung Q3/2026.\n" +
          "```\n\n" +
          "Soll ich das schreiben (`documents/driver-ic-selection-history-2022-2026.md`) und die Wiki-Stub-Seite gleich mit anlegen? Stub schreibe ich nur, wenn du sie auch willst — du hattest sie noch nicht bestätigt.",
        timestamp: '2026-05-28T16:25:00Z',
      },
      {
        role: 'user',
        content: 'Ja, schreib beides. Stub macht Sinn — μAFS taucht in den nächsten 6 Monaten häufiger im Chat auf.',
        timestamp: '2026-05-28T16:30:00Z',
      },
      {
        role: 'assistant',
        content:
          "Geschrieben:\n\n" +
          "1. `documents/driver-ic-selection-history-2022-2026.md` — 2026-Eintrag erweitert, Wording wie besprochen. RAG-Re-Index läuft automatisch über die `rag-auto-index-on-upload`-Regel.\n" +
          "2. `wiki/topics/2-1-1-μafs-vorentwicklung.md` — Stub mit Verweis auf den aktualisierten RAG-Doc, Status `stub`, Reviewer-Hinweis (du).\n\n" +
          "Beide Änderungen sind im Provenance-Eintrag dieser Chat-Session verlinkt — falls Strategic-Sourcing später nachfragt, wo der Wording-Hinweis herkam.\n\n" +
          "Sonst noch etwas?",
        timestamp: '2026-05-28T16:38:00Z',
      },
    ],
  },
];
