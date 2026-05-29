/**
 * Welcome / orientation page shown automatically when the project opens.
 *
 * Written to <project>/documentation.md by the seed runner and registered
 * in `.etienne/user-interface.json` previewDocuments. The long-form
 * mission (`wiki/_meta/mission.md`) stays the source of truth for *how*
 * the agent thinks; this page is the *what the user sees first*.
 *
 * No hard wraps: each paragraph + list item is one line so the markdown
 * renderer reflows to the available pane width. Tables and the code
 * fence are kept untouched because their structure is line-significant.
 */

export const DOCUMENTATION_MD = `# Willkommen — Lumitec LED Headlight Onboarding

> Welcome to your onboarding project. This page is the orientation screen — open it once and decide where to go.

## Was ist das hier? / What is this?

Dieses Projekt ist ein **Onboarding-Werkzeug für neue Mitarbeitende** im Bereich **LED-Modul-Entwicklung** der **Lumitec Automotive GmbH** (stilisierter deutscher Tier-1-Zulieferer, Standort Reutlingen, Geschäftsbereich Beleuchtung).

This project is an onboarding tool for new engineers joining the LED Module team at the fictional Lumitec Automotive GmbH. The agent runs in two distinct modes depending on your role:

| Wenn du Rolle … bist | Was der Agent für dich tut |
|---|---|
| **\`user\`** (Expert) | Kuratiert das Wiki, schlägt Curriculum-Änderungen vor, reviewt offene Fragen der Trainees. Du sagst, was Wahrheit ist. |
| **\`guest\`** (Neu-Mitarbeitende:r) | Führt dich durch ein personalisiertes Curriculum, zeichnet Q/A auf, erstellt Quizzes + Anwendungs-Simulatoren, schlägt das nächste Thema vor. |

## Schnellstart als Lernende:r

Wenn du als \`guest\` eingeloggt bist:

1. **Klicke links auf „Show my progress"** — du siehst deinen aktuellen Stand mit blauer Fortschrittsleiste, Streak und Badges.
2. **„What's next?"** — der Agent schlägt das nächste sinnvolle Thema vor (in-progress vor noch-nicht-angefangen).
3. **„Explain something to me as if I'm new"** — du gibst ein Thema, der Agent erklärt es adaptiert an deine Baseline (Sprache, Vorerfahrung).
4. **„Practice in an application simulator"** — du übst Klick-für-Klick-Sequenzen in einem Mini-SAP/CRM/ERP-Mock; der Agent coacht dich in Echtzeit.

## Schnellstart als Expert:in

Wenn du als \`user\` eingeloggt bist:

1. **„Curate today's additions to the wiki"** — der Agent listet neue Dokumente aus \`documents/\` und \`inbox/\` und schlägt Wiki-Erweiterungen vor.
2. **„Show wiki coverage vs. the curriculum"** — Lücken im Wiki gegenüber dem Curriculum-ToC, mit Stub-Hinweisen.
3. **„Review trainees' open questions"** — Q/A-Einträge mit Status „unconfirmed" oder Wiki-Widersprüchen.
4. **„Author a new application simulator"** — du beschreibst eine App + drei Klick-Sequenzen, der Agent baut die HTML-Mini-App.

## Curriculum-Struktur

Fünf Hauptkapitel (siehe \`wiki/topics/\`):

1. **Deine Rolle bei Lumitec** — Verantwortung, Kolleg:innen, Kundenprogramme, wo Dinge liegen.
2. **Was Lumitec macht** — Produkte, Systemarchitektur, Markt, Fertigung.
3. **Standards und Prozesse** — ISO 26262 (Baseline ASIL B), AUTOSAR Classic, ASPICE Level 2, PPAP/IATF, Photometrie.
4. **Werkzeuge** — CANoe, DaVinci, LucidShape, Saber/PLECS, HiL-Rig, JIRA + Polarion.
5. **Day-in-the-life-Szenarien** — Flicker auf B-Muster, GB-4599-Glare-Failure, später ECR von OEM-B premium.

## Wo Dinge liegen / Layout

\`\`\`
.
├── documentation.md               ← du bist hier
├── wiki/_meta/mission.md          (kanonische Mission — Quelle der Wahrheit)
├── wiki/topics/*.md               (Curriculum-Inhalte, ~22 Seiten)
├── documents/*.md                 (RAG-indizierte interne Handbücher, OEM-Glossare)
├── inbox/*.docx                   (eingehende Word-Dokumente vom Expert)
├── progress/<user>.progress.json  (dein persönlicher Lernpfad)
├── out/quizzes/*.quiz.html        (auto-generierte End-of-Module-Quizzes)
├── out/scenarios/*.scenario.html  (verzweigte Day-in-the-life-Szenarien)
├── out/intros/*.html              (Kollegen-Visitenkarten)
├── out/simulators/*.simulator.html (Klick-Trainer für SAP / CRM / ERP)
└── .claude/skills/                (Mission, Wiki, Quiz, Simulator, …)
\`\`\`

## Hinweise zur Demo

- **Diese Demo ist fiktiv.** Lumitec gibt es nicht, OEM-A/B/C sind stilisiert, alle Materialnummern + Produktionsdaten sind Beispieldaten. Keine echte Lieferanten-IP, keine echten Kundenkontrakte.
- **Der vorbelegte Trainee** heißt einfach „guest" und hat einen EE-Hintergrund mit zwei Jahren Halbleiter-/Treiber-IC-Erfahrung. Section 1 ist als „done" markiert, 2.2 in-progress, 3.1 angefangen — damit du den UI-Zustand siehst, ohne erst alles durchklicken zu müssen.
- **Sprache**: das Haus arbeitet auf Deutsch, OEM-Verträge sind englisch. Der Agent passt sich an die in \`progress/guest.progress.json\` hinterlegte Baseline an.

## Weiter

Schließe diesen Tab, oder lasse ihn als Referenz offen — der Sidebar hat alle Aktionen, die du brauchst.
`;
