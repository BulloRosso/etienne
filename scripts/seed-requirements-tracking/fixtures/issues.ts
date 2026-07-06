/**
 * 12 mock Jira issues (PORTAL-201..PORTAL-310) for rt_seed_tracker, plus the
 * manual requirement↔issue links created in step 11 — BEFORE the drift
 * decisions, so approving the export change-order auto-stales PORTAL-231's
 * link and drafts the stale notice.
 *
 * PORTAL-310 stays UNLINKED on purpose: it is the shadow-scope demo (XML-XSD
 * validation requested verbally, no contractual basis).
 */

export interface TrackerIssueFixture {
  key: string;
  issueType: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: 'todo' | 'in_progress' | 'done';
  epicKey?: string;
  labels: string[];
  assignee?: string;
  comments: Array<{ author: string; date: string; body: string }>;
  updatedAt: string;
}

export const TRACKER_ISSUES: TrackerIssueFixture[] = [
  {
    key: 'PORTAL-201',
    issueType: 'Epic',
    summary: 'Kundenselfservice-Portal Stadtwerke Musterstadt',
    description: 'Sammel-Epic für die Umsetzung des Kundenportals (Vergabe T-2026-014).',
    status: 'In Arbeit',
    statusCategory: 'in_progress',
    labels: [],
    assignee: 'sara',
    comments: [],
    updatedAt: '2026-06-20T08:00:00Z',
  },
  {
    key: 'PORTAL-205',
    issueType: 'Story',
    summary: 'Zählerstandserfassung mit Plausibilitätsprüfung',
    description:
      'Erfassung von Zählerständen im Portal inkl. Plausibilitätsprüfung gegen den letzten bekannten Zählerstand und Übergabe an das Abrechnungssystem.',
    status: 'Fertig',
    statusCategory: 'done',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 't.brandt',
    comments: [
      {
        author: 't.brandt',
        date: '2026-05-28T15:40:00Z',
        body: 'In der Testumgebung abgenommen; Pilotkunden ab KW25.',
      },
    ],
    updatedAt: '2026-05-28T15:40:00Z',
  },
  {
    key: 'PORTAL-210',
    issueType: 'Story',
    summary: 'Login und Registrierung mit Double-Opt-In',
    description:
      'Benutzerkonto: Anmeldung mit E-Mail-Adresse und Passwort, Registrierung mit Vertragskontonummer + PLZ, Double-Opt-In per E-Mail.',
    status: 'Fertig',
    statusCategory: 'done',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 'm.iqbal',
    comments: [],
    updatedAt: '2026-05-12T11:05:00Z',
  },
  {
    key: 'PORTAL-214',
    issueType: 'Story',
    summary: 'Verbrauchsübersicht: 24-Monats-Grafik',
    description:
      'Grafische Darstellung des Energie- und Wasserverbrauchs der letzten 24 Monate mit Vorjahresvergleich.',
    status: 'In Arbeit',
    statusCategory: 'in_progress',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 'm.iqbal',
    comments: [],
    updatedAt: '2026-06-15T09:30:00Z',
  },
  {
    key: 'PORTAL-220',
    issueType: 'Story',
    summary: 'Zwei-Faktor-Authentifizierung Administrationsbereich',
    description:
      'Zugang für Stadtwerke-Mitarbeitende zum Adminbereich mit 2FA (TOTP) absichern.',
    status: 'In Arbeit',
    statusCategory: 'in_progress',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 'd.roth',
    comments: [],
    updatedAt: '2026-06-18T13:20:00Z',
  },
  {
    key: 'PORTAL-225',
    issueType: 'Task',
    summary: 'TLS-Konfiguration Portal ↔ Abrechnungssystem',
    description: 'TLS 1.2+ für alle Strecken erzwingen; Cipher-Suites nach BSI-Empfehlung.',
    status: 'Fertig',
    statusCategory: 'done',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 'd.roth',
    comments: [],
    updatedAt: '2026-05-20T10:10:00Z',
  },
  {
    key: 'PORTAL-231',
    issueType: 'Story',
    summary: 'Berichtsexport PDF',
    description:
      'Verbrauchs- und Abrechnungsberichte für frei wählbare Zeiträume als PDF bereitstellen.',
    status: 'Fertig',
    statusCategory: 'done',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 't.brandt',
    comments: [
      {
        author: 't.brandt',
        date: '2026-05-30T16:00:00Z',
        body: 'PDF-Export produktiv in der Testumgebung; Layout durch Fr. Kern freigegeben.',
      },
    ],
    updatedAt: '2026-05-30T16:00:00Z',
  },
  {
    key: 'PORTAL-240',
    issueType: 'Story',
    summary: 'Failover Sekundärverbindung Abrechnungssystem',
    description:
      'Automatische Umschaltung auf die Sekundärverbindung binnen 30 Sekunden inkl. Administrator-Benachrichtigung.',
    status: 'Offen',
    statusCategory: 'todo',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 'd.roth',
    comments: [],
    updatedAt: '2026-06-10T08:45:00Z',
  },
  {
    key: 'PORTAL-252',
    issueType: 'Task',
    summary: 'Lasttest 500 gleichzeitige Nutzer',
    description:
      'Lasttestszenarien gemäß Jour Fixe KW23 anpassen: 2-Sekunden-Antwortzeit bei bis zu 500 gleichzeitigen Nutzern nachweisen.',
    status: 'In Arbeit',
    statusCategory: 'in_progress',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 't.brandt',
    comments: [],
    updatedAt: '2026-06-22T14:00:00Z',
  },
  {
    key: 'PORTAL-260',
    issueType: 'Task',
    summary: 'CI/CD-Pipeline für Portal-Releases',
    description: 'Interne Build- und Deployment-Pipeline; kein Kundenbezug.',
    status: 'Fertig',
    statusCategory: 'done',
    epicKey: 'PORTAL-201',
    labels: ['internal'],
    assignee: 'm.iqbal',
    comments: [],
    updatedAt: '2026-05-05T09:00:00Z',
  },
  {
    key: 'PORTAL-271',
    issueType: 'Task',
    summary: 'Internes Entwickler-Wiki aufsetzen',
    description: 'Team-internes Wiki für Architekturentscheidungen; kein Kundenbezug.',
    status: 'Offen',
    statusCategory: 'todo',
    labels: ['internal'],
    assignee: 'm.iqbal',
    comments: [],
    updatedAt: '2026-06-01T07:30:00Z',
  },
  {
    // The shadow-scope demo: work in progress without contractual basis.
    key: 'PORTAL-310',
    issueType: 'Task',
    summary: 'XML-Export gegen Kunden-XSD validieren',
    description:
      'Den neuen XML-Export vor Übergabe gegen das XSD-Schema der Stadtwerke validieren und Fehlerreport erzeugen.',
    status: 'In Arbeit',
    statusCategory: 'in_progress',
    epicKey: 'PORTAL-201',
    labels: [],
    assignee: 't.brandt',
    comments: [
      {
        author: 't.brandt',
        date: '2026-06-24T10:15:00Z',
        body: 'Wurde von Herrn Weber im Workshop am 12.06. mündlich gewünscht.',
      },
    ],
    updatedAt: '2026-06-24T10:15:00Z',
  },
];

/**
 * Manual links created in step 11 — before any drift decision.
 * PORTAL-231 → export-pdf is the stale-link demo: the change-order approval
 * in step 12 stales it automatically.
 */
export const MANUAL_LINKS: Array<{
  fixtureKey: string;
  issueKey: string;
  relationship: 'implements' | 'partially_implements' | 'tests' | 'documents' | 'related';
}> = [
  { fixtureKey: 'export-pdf', issueKey: 'PORTAL-231', relationship: 'implements' },
  { fixtureKey: 'meter-reading', issueKey: 'PORTAL-205', relationship: 'implements' },
  { fixtureKey: 'login', issueKey: 'PORTAL-210', relationship: 'implements' },
  { fixtureKey: '2fa', issueKey: 'PORTAL-220', relationship: 'implements' },
  { fixtureKey: 'response-time', issueKey: 'PORTAL-252', relationship: 'tests' },
];
