/**
 * Static HTML assets the seed pre-renders so reviewers see the full
 * onboarding experience on first load without having to play through
 * the curriculum:
 *
 *   - QUIZZES: one MUI-React quiz per main topic (only section 1
 *     pre-rendered; the rest are generated on-demand by the agent's
 *     quiz-generator skill).
 *   - SCENARIOS: one branching day-in-the-life HTML scenario
 *     (5.1 flicker-on-B-sample).
 *   - COLLEAGUE_INTROS: five colleague-intro cards.
 *
 * Each asset is a complete, self-contained HTML page. Loaded via
 * the existing LiveHTMLPreview viewer (registers .html → html viewer
 * in viewerRegistry.jsx); no new infrastructure.
 *
 * All MUI / React via CDN — no bundle, no install step. The default
 * MUI light theme + blue accent is used to match the ProgressViewer.
 */

const HEAD = (title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://unpkg.com/@mui/material@5/umd/material-ui.production.min.js"
        crossorigin></script>
<style>
  html, body { margin: 0; padding: 0; min-height: 100vh; background: #f5f7fb; font-family: 'Roboto', system-ui, sans-serif; }
  #root { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
</style>
</head>
<body>
<div id="root"></div>
`;

// ─── Quizzes ────────────────────────────────────────────────────────────

export const QUIZ_TOPIC_1 = HEAD('Quiz — Topic 1: Deine Rolle bei Lumitec') +
`<script type="text/babel">
const { useState } = React;
const { Box, Card, CardContent, Typography, Button, RadioGroup, FormControlLabel, Radio, LinearProgress, Chip, Stack, Alert } = MaterialUI;

const QUESTIONS = [
  {
    q: "Welche Verantwortung gehört in den ersten 90 Tagen NICHT zu deinem Aufgabenbereich?",
    a: ["Anforderungs-Tracing in Polarion", "Test-Spezifikation für dein Modul", "OEM-Kommunikation auf kommerzieller Ebene", "Defect-Triage in JIRA"],
    correct: 2,
    explain: "OEM-Kommunikation läuft über Lars als Projektleiter. Du beantwortest technische Detailfragen, aber keine kommerziellen oder Liefertermin-Themen."
  },
  {
    q: "Wer entscheidet bei einem Konflikt zwischen einem Kundenwunsch und unserer internen ASIL-Klassifikation?",
    a: ["Du selbst, weil du das Modul kennst", "Team-Lead + Functional Safety Manager (Anke + Erik)", "Der Lieferant des Treiber-ICs", "OEM-A direkt im wöchentlichen Status-Call"],
    correct: 1,
    explain: "ASIL-Klassifikation ist Sache des Functional Safety Managers. Eine Eskalation läuft IMMER über Anke und Erik — nie direkt mit dem Kunden, nie selbst."
  },
  {
    q: "Wo liegen die DBC-Dateien für die CAN-Kommunikation pro Kundenprogramm?",
    a: ["Im Git-Repository headlight-ecu/autosar-config/", "Unter \\\\fileserver\\\\headlight\\\\dbc\\\\<oem>\\\\", "Im Teamcenter, eingecheckt als Engineering-Item", "Auf der DaVinci-Konfigurations-Webseite"],
    correct: 1,
    explain: "Die DBC pro Programm liegt unter \\\\fileserver\\\\headlight\\\\dbc\\\\<oem>\\\\. Häufiger Anfänger-Fehler: die DBC eines anderen Programms verwenden — Signale werden dann still falsch interpretiert."
  },
  {
    q: "In welchem Lebenszyklus-Stand befindet sich das OEM-A-Programm im 2026-Q2?",
    a: ["A-Muster", "B-Muster", "C-Muster / Vorserie", "SOP + 90 Tage"],
    correct: 1,
    explain: "OEM-A ist im B-Muster. Hardware ist in Vorserien-Konfiguration, Software in Verifizierungs-Phase. Änderungen sind teuer und brauchen einen formalen ECR-Prozess."
  },
  {
    q: "Was bedeutet 'Lebenszyklus-Stand' für deine Entscheidungsfreiheit?",
    a: ["Je weiter fortgeschritten, desto mehr Freiheit", "Je weiter fortgeschritten, desto weniger Freiheit", "Hängt vom OEM-Programm ab, nicht von der Phase", "Spielt für Junior-Engineers keine Rolle"],
    correct: 1,
    explain: "Je weiter fortgeschritten die Phase (A-Muster → B-Muster → SOP), desto weniger Freiheit. Bei SOP +90 Tagen verifizierst und protokollierst du; du designst nicht mehr neu."
  },
  {
    q: "An wen wendest du dich bei einer Frage zur thermischen Auslegung eines Treiber-ICs?",
    a: ["Anke Brenner (Team-Lead)", "Janet Voss (AUTOSAR-Lead)", "Sven Klatt (Thermo-Engineer)", "Mira Kaspar (Supplier-Quality)"],
    correct: 2,
    explain: "Sven Klatt ist der Thermo-Engineer im Team. Junction-Temperatur, Derating-Modell, Heatsink-Auslegung — das ist sein Bereich."
  },
  {
    q: "Welches der drei OEM-Programme liefert dir die produktivste Lerngrundlage für Troubleshooting?",
    a: ["OEM-A (B-Muster)", "OEM-B premium (RFQ)", "OEM-C commercial-van (SOP +90 Tage)", "Alle drei gleichermaßen"],
    correct: 2,
    explain: "OEM-C ist post-SOP — kontinuierlich kommen Felddefekte rein. Plus: zwei regulatorische Regime (GB 4599 + ECE R149) trainieren die 'welche Norm?'-Reflex schneller."
  }
];

function App() {
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const q = QUESTIONS[idx];

  const onAnswer = () => {
    if (sel === null) return;
    setRevealed(true);
    if (sel === q.correct) setScore(s => s + 1);
  };

  const onNext = () => {
    if (idx + 1 >= QUESTIONS.length) { setDone(true); return; }
    setIdx(idx + 1); setSel(null); setRevealed(false);
  };

  if (done) {
    const pct = Math.round((score / QUESTIONS.length) * 100);
    const tone = pct >= 85 ? 'success' : pct >= 60 ? 'info' : 'warning';
    return (
      <Card sx={{ maxWidth: 560, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="overline" sx={{ color: '#1565c0' }}>Quiz fertig</Typography>
          <Typography variant="h4" sx={{ mt: 1, mb: 2 }}>Topic 1 — Deine Rolle</Typography>
          <Alert severity={tone} sx={{ mb: 3 }}>
            <strong>{score} / {QUESTIONS.length}</strong> richtig ({pct} %).{' '}
            {pct >= 85 ? 'Stark — du kannst Topic 1 als done markieren.' :
             pct >= 60 ? 'Solide. Geh die Wiki-Seite 1.x nochmal durch, dann nochmal versuchen.' :
                         'Noch unter 60 %. Lies 1.1 bis 1.4 nochmal in Ruhe — dann Wiederholung.'}
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Das Ergebnis wird in deinem progress.json gespeichert. Du kannst den Quiz beliebig oft wiederholen.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 640, width: '100%', borderRadius: 3, boxShadow: 6 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="overline" sx={{ color: '#1565c0', letterSpacing: 1 }}>
            Quiz · Topic 1 · Frage {idx + 1} von {QUESTIONS.length}
          </Typography>
          <Chip label={\`\${score} richtig\`} size="small" sx={{ bgcolor: '#E3F2FD', color: '#1565c0' }} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={((idx + (revealed ? 1 : 0)) / QUESTIONS.length) * 100}
          sx={{ mb: 3, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: '#1565c0' } }}
        />
        <Typography variant="h6" sx={{ mb: 3, lineHeight: 1.45 }}>{q.q}</Typography>
        <RadioGroup value={sel} onChange={(e) => !revealed && setSel(parseInt(e.target.value))}>
          {q.a.map((opt, i) => (
            <FormControlLabel
              key={i}
              value={i}
              disabled={revealed}
              control={<Radio />}
              label={opt}
              sx={{
                bgcolor: revealed
                  ? (i === q.correct ? '#E8F5E9' : (i === sel ? '#FFEBEE' : 'transparent'))
                  : 'transparent',
                borderRadius: 1,
                px: 1,
                mb: 0.5,
                ml: 0,
              }}
            />
          ))}
        </RadioGroup>
        {revealed && (
          <Alert severity={sel === q.correct ? 'success' : 'info'} sx={{ mt: 2 }}>
            {q.explain}
          </Alert>
        )}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          {!revealed
            ? <Button variant="contained" disabled={sel === null} onClick={onAnswer} sx={{ bgcolor: '#1565c0' }}>Antworten</Button>
            : <Button variant="contained" onClick={onNext} sx={{ bgcolor: '#1565c0' }}>{idx + 1 >= QUESTIONS.length ? 'Ergebnis ansehen' : 'Nächste Frage'}</Button>
          }
        </Box>
      </CardContent>
    </Card>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
</script>
</body></html>
`;

// ─── Day-in-the-life scenario: 5.1 flicker-on-B-sample ──────────────────

export const SCENARIO_5_1 = HEAD('Szenario 5.1 — Flicker auf einem B-Muster') +
`<script type="text/babel">
const { useState } = React;
const { Box, Card, CardContent, Typography, Button, Chip, Stack, Alert, Divider } = MaterialUI;

const NODES = {
  start: {
    title: "OEM-A meldet sporadisches Flackern",
    body: "Ein OEM-A-Engineer schreibt: 'Sporadisches Flackern in einem der ADB-Segmente bei Temperatur >65 °C. Drei Fahrzeuge betroffen, drei nicht.' Es ist Dienstag, 14:30. Du sitzt am Schreibtisch. Was ist dein erster Schritt?",
    choices: [
      { label: "OEM-A nach Video / Logs fragen", next: "ask_repro" },
      { label: "Sofort den HiL-Rig buchen und Übertemperatur-Hypothese testen", next: "jump_to_hil" },
      { label: "Sven (Thermo) und Janet (SW) sofort in einen Termin einladen", next: "early_meeting" }
    ]
  },
  ask_repro: {
    title: "Du fragst OEM-A nach Beobachtungs-Material",
    body: "OEM-A schickt am nächsten Morgen ein 4-Sekunden-Video aus dem Fahrzeug. Auf dem Video sieht man: das Flackern ist NICHT zufällig — es korreliert mit dem Kamera-Shutter des Dashcam-Setups, das OEM-A für den Test nutzt. Du erkennst sofort: das ist ein PWM-Kamera-Beat, kein thermisches Phänomen. Was tust du?",
    choices: [
      { label: "Hypothese formulieren und mit Janet (AUTOSAR) prüfen", next: "good_path" },
      { label: "Sven sofort einladen für eine Thermo-Analyse", next: "wasted_time" }
    ]
  },
  good_path: {
    title: "✓ Du bist auf der richtigen Spur",
    body: "Du formulierst die Hypothese: 'PWM-Frequenz des Treiber-IC liegt im Beat-Bereich der OEM-A-Dashcam.' Janet bestätigt: die SWC steuert die PWM mit 200 Hz; die Dashcam läuft mit 60 fps. 200 Hz ≢ ganzzahliges Vielfaches von 60 → klassischer Beat. Lösung: PWM-Frequenz auf 240 Hz erhöhen (Pre-Compiled-Konfiguration, in 1 Tag deploybar als SW-Update). Du dokumentierst in JIRA + Polarion, verlinkst das OEM-A-Video. Anke schreibt OEM-A: 'Wir haben den Effekt reproduziert und einen Fix.' Drei Werktage von der ersten Meldung bis zur Lösung — gut.",
    end: true,
    badge: "first-good-investigation"
  },
  jump_to_hil: {
    title: "Du buchst den HiL-Rig",
    body: "Der nächste freie HiL-Slot ist in 8 Tagen (B-Muster-Phase, Rig voll). Du wartest. In den 8 Tagen schreibt OEM-A zweimal nach: 'Habt ihr schon Erkenntnisse?'. Anke fragt: 'Hast du das Video angefordert?'. Du nicht. Erste Erkenntnis: du hättest mit einer Beobachtungs-Anfrage zuerst starten sollen.",
    choices: [
      { label: "Zurück und das Video anfordern", next: "ask_repro" }
    ]
  },
  wasted_time: {
    title: "Verschenkte Zeit",
    body: "Sven schaut sich die Daten an und sagt nach 30 Sekunden: 'Das ist kein Thermo-Problem — wenn die Temperatur in 65-70 °C kratzt, würden wir ein Derating sehen, kein Flackern. Schau auf die PWM-Frequenz.' Du hättest dir den Termin sparen können, wenn du die Hypothese erst selbst sauber formuliert hättest.",
    choices: [
      { label: "Hypothese formulieren und mit Janet prüfen", next: "good_path" }
    ]
  },
  early_meeting: {
    title: "Drei Senior-Engineers, keine Daten",
    body: "Du buchst einen Termin mit Sven und Janet für den nächsten Morgen. Im Termin: drei Personen sitzen vor leeren Bildschirmen. 'Was sind die Symptome?', fragt Sven. 'Sporadisches Flackern, Temperatur >65 °C, drei Fahrzeuge.' 'Hast du das Video?' 'Nein.' 'Hast du die Polarion-Anforderung verifiziert?' 'Noch nicht.' Sven: 'Komm wieder mit Daten.' Du verlässt den Termin mit dem Gefühl, dass das nicht gut lief — und einer klaren TODO-Liste.",
    choices: [
      { label: "Zurück und das Video anfordern", next: "ask_repro" }
    ]
  }
};

function App() {
  const [path, setPath] = useState(['start']);
  const node = NODES[path[path.length - 1]];

  const goto = (next) => setPath([...path, next]);
  const back = () => setPath(path.slice(0, -1));
  const restart = () => setPath(['start']);

  return (
    <Card sx={{ maxWidth: 700, width: '100%', borderRadius: 3, boxShadow: 6 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="overline" sx={{ color: '#1565c0', letterSpacing: 1 }}>
          Day-in-the-life · 5.1 · Flicker auf B-Muster (OEM-A)
        </Typography>
        <Typography variant="h5" sx={{ mt: 1, mb: 2 }}>{node.title}</Typography>
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>{node.body}</Typography>

        {node.end && (
          <Alert severity="success" icon={<span>🏆</span>} sx={{ mb: 3 }}>
            <strong>Badge erhalten: {node.badge}</strong>
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack spacing={1.5}>
          {(node.choices || []).map((c, i) => (
            <Button
              key={i}
              variant="outlined"
              fullWidth
              onClick={() => goto(c.next)}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', borderColor: '#1565c0', color: '#1565c0', '&:hover': { bgcolor: '#E3F2FD', borderColor: '#1565c0' } }}
            >
              {c.label}
            </Button>
          ))}
          {node.end && (
            <Button variant="contained" onClick={restart} sx={{ bgcolor: '#1565c0' }}>
              Szenario erneut spielen
            </Button>
          )}
        </Stack>

        {path.length > 1 && !node.end && (
          <Button size="small" onClick={back} sx={{ mt: 2, color: '#1565c0' }}>← Vorherige Entscheidung</Button>
        )}
      </CardContent>
    </Card>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body></html>
`;

// ─── Colleague intro cards (5 of them) ──────────────────────────────────

function colleagueCard(opts: {
  name: string;
  role: string;
  tenure: string;
  back: string;
  askMeAbout: string[];
  funFact: string;
  initials: string;
  bg: string;
}): string {
  return HEAD(`Kollege — ${opts.name}`) +
`<script type="text/babel">
const { Box, Card, CardContent, Typography, Avatar, Chip, Stack, Divider } = MaterialUI;

function App() {
  return (
    <Card sx={{ maxWidth: 480, width: '100%', borderRadius: 3, boxShadow: 6 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Avatar sx={{ bgcolor: '${opts.bg}', width: 64, height: 64, fontSize: 22 }}>
            ${opts.initials}
          </Avatar>
          <Box>
            <Typography variant="overline" sx={{ color: '#1565c0', letterSpacing: 1 }}>
              Kolleg:in · ${opts.role}
            </Typography>
            <Typography variant="h5">${opts.name}</Typography>
            <Typography variant="caption" color="text.secondary">${opts.tenure}</Typography>
          </Box>
        </Stack>
        <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6 }}>
          ${opts.back}
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="overline" sx={{ color: '#1565c0' }}>Frag mich, wenn…</Typography>
        <Stack spacing={1} sx={{ mt: 1, mb: 2 }}>
          ${opts.askMeAbout.map((s) => `<Typography variant="body2" sx={{ pl: 1, borderLeft: '3px solid #1565c0' }}>${s}</Typography>`).join('\n          ')}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="caption" color="text.secondary">
          <strong>Fun fact:</strong> ${opts.funFact}
        </Typography>
      </CardContent>
    </Card>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body></html>
`;
}

export const COLLEAGUE_INTROS: Record<string, string> = {
  'anke-brenner.html': colleagueCard({
    name: 'Anke Brenner',
    role: 'Team-Lead, LED-Modul-Team',
    tenure: '12 Jahre Lumitec, davor Bosch',
    initials: 'AB',
    bg: '#1565c0',
    back: 'Verantwortet 7 Engineers im LED-Modul-Team. Jede technische Eskalation aus dem OEM-A-Programm landet bei ihr; sie reviewt deine Test-Specs und sitzt bei jedem Phasen-Freigabe-Termin.',
    askMeAbout: [
      'du nicht weißt, ob ein Anforderungs-Konflikt eine Eskalation verdient.',
      'eine technische Antwort an OEM-A heraus muss und du nicht sicher bist, wer sie absegnet.',
      'du nach einem schwierigen Tag eine ehrliche Einschätzung brauchst.',
    ],
    funFact: 'Anke macht seit 4 Jahren Krav Maga und ist im Team-Standup berüchtigt für ihre "Was hindert dich?"-Frage in der dritten Minute.',
  }),
  'tariq-maleki.html': colleagueCard({
    name: 'Tariq Maleki',
    role: 'Optik-Spezialist',
    tenure: '8 Jahre, davor 6 Jahre Linsen-Lieferant',
    initials: 'TM',
    bg: '#7b1fa2',
    back: 'Promovierter Physiker. Macht die LucidShape-Simulationen und entscheidet die Geometrie der Freiformflächen. Beschützt seine LucidShape-Lizenz-Slots wie ein Drachen seinen Schatz.',
    askMeAbout: [
      'du Photometrie-Fragen hast oder ein Modul-Layout die ECE-R148-Grenzwerte zu kratzen droht.',
      'du nicht weißt, ob ein Glare-Wert wirklich kritisch ist oder Mess-Rauschen.',
      'eine Linsen-Geometrie aus LucidShape "irgendwie komisch" aussieht.',
    ],
    funFact: 'Tariq spricht Persisch und Schwäbisch — und behauptet, das eine sei leichter zu lernen als das andere. Sagt aber nie welches.',
  }),
  'sven-klatt.html': colleagueCard({
    name: 'Sven Klatt',
    role: 'Thermo-Engineer',
    tenure: '6 Jahre, davor Power-Elektronik (Siemens)',
    initials: 'SK',
    bg: '#d32f2f',
    back: 'Verantwortet die thermische Auslegung der LED-Arrays und das Derating-Modell. Aktuell auch rotierender HiL-Rig-Verantwortlicher — Sven entscheidet, wer wann am Rig sitzt.',
    askMeAbout: [
      'ein Sub-System bei Hochtemperatur-Belastung auffällig wird.',
      'du den thermischen Pfad eines neuen Treiber-ICs verstehen musst.',
      'du den HiL-Rig dringend brauchst, aber kein Slot frei ist.',
    ],
    funFact: 'Sven hat einen 1965er Porsche 911 in seiner Garage seit 11 Jahren — angefangen zu restaurieren, nie fertig geworden, "vielleicht 2027".',
  }),
  'janet-voss.html': colleagueCard({
    name: 'Janet Voss',
    role: 'AUTOSAR-Software-Lead',
    tenure: '10 Jahre, zertifizierte AUTOSAR-Architektin',
    initials: 'JV',
    bg: '#388e3c',
    back: 'Verantwortet den BSW-Layer und die DaVinci-Konfiguration unseres Headlight-ECU. Hält die kanonische arxml-Datei. Strikt, aber wenn man pünktlich pull-requested, sehr hilfsbereit.',
    askMeAbout: [
      'dein Modul ein neues Signal über CAN/CAN-FD benötigt.',
      'du wissen willst, welche Runnables in welchem Task laufen.',
      'eine RTE-Generierung "irgendwie kaputt" ist nach deinem letzten Pull.',
    ],
    funFact: 'Janet liest jeden Monat ein Buch über Computerlinguistik aus, "weil AUTOSAR-Konfigurations-Schemas sich wie eine kontextfreie Grammatik verhalten und das findet sie schön".',
  }),
  'lars-petersen.html': colleagueCard({
    name: 'Lars Petersen',
    role: 'Projektleiter OEM-A & OEM-C',
    tenure: '14 Jahre Lumitec, davor Continental',
    initials: 'LP',
    bg: '#f57c00',
    back: 'Trägt die OEM-A- und die OEM-C-Plattform gleichzeitig. Du sprichst nicht direkt mit OEM-A; Lars tut das in der wöchentlichen Status-Call. Bündelt deine technischen Detail-Fragen und gibt die OEM-Antworten zurück.',
    askMeAbout: [
      'du eine Frage hast, die nur OEM-A oder OEM-C beantworten kann.',
      'du nicht weißt, ob ein Punkt im nächsten Status-Call gehört oder besser per E-Mail.',
      'du eine ECR-Diskussion vorbereitest — Lars kennt den Verhandlungsstil der OEM-Kontakte.',
    ],
    funFact: 'Lars hält jede Status-Call-Folie kürzer als 6 Zeilen Text — "wenn ich es nicht in 6 Zeilen sagen kann, ist es nicht klar genug gedacht". Andere haben es mit 20 Zeilen probiert; ging schief.',
  }),
};
