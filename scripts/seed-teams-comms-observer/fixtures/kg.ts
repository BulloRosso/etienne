/**
 * Knowledge-graph seed: observed hive-mind patterns as first-class graph
 * citizens.
 *
 * Wire-level types are restricted by the KG service to
 * Person | Company | Product | Document — domain types ride in
 * properties.domainType (same convention as the desalination seed):
 *
 *   Person            → Person
 *   Channel           → Document + domainType: Channel
 *   PatternOccurrence → Document + domainType: PatternOccurrence
 *   Decision          → Document + domainType: Decision
 *   AgreementNorm     → Document + domainType: AgreementNorm
 *   MetricSnapshot    → Document + domainType: MetricSnapshot
 *
 * Relationships: exhibits (Person→PO, initiator role), involvedIn
 * (Person→PO, participant/affected), occursIn (PO→Channel), wouldPrevent
 * (AgreementNorm→PO), undermines (PO→AgreementNorm), decidedIn
 * (Decision→Channel), recordedAs (PO→Decision). Message evidence lives in
 * properties.evidenceUrl on each occurrence.
 */

export interface EntityDraft {
  id: string;
  type: 'Person' | 'Company' | 'Product' | 'Document';
  properties: Record<string, string>;
}

export interface RelationshipDraft {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, string>;
}

import { shiftWorkdays } from './transcripts';

function isoDay(base: Date, offset: number): string {
  return shiftWorkdays(base, offset).toISOString().slice(0, 10);
}

export function kgEntities(base: Date): EntityDraft[] {
  const person = (id: string, label: string, role: string): EntityDraft => ({
    id,
    type: 'Person',
    properties: { domainType: 'Person', label, role, team: 'Hive Alpha' },
  });
  const channel = (id: string, label: string, slug: string): EntityDraft => ({
    id,
    type: 'Document',
    properties: { domainType: 'Channel', label, slug },
  });
  const po = (
    id: string,
    patternType: string,
    label: string,
    day: number,
    severity: string,
    summary: string,
  ): EntityDraft => ({
    id,
    type: 'Document',
    properties: {
      domainType: 'PatternOccurrence',
      patternType,
      label,
      date: isoDay(base, day),
      severity,
      summary,
      evidenceUrl: 'data/teams — see the daily transcript of ' + isoDay(base, day),
    },
  });

  return [
    person('person-anna-meier', 'Anna Meier', 'Product Manager'),
    person('person-jonas-weber', 'Jonas Weber', 'Senior Developer'),
    person('person-priya-nair', 'Priya Nair', 'Developer'),
    person('person-tomas-eriksen', 'Tomas Eriksen', 'Software Architect'),

    channel('channel-hive-alpha-general', 'Hive Alpha › General', 'hive-alpha--general'),
    channel('channel-hive-alpha-dev', 'Hive Alpha › Dev', 'hive-alpha--dev'),

    po('po-ping-storm-anna', 'ping-storm', 'Ping-storm: 7 messages in 4 min (demo prep)', -4, '3',
      'Seven fragmented asks between 09:02 and 09:06 plus a re-ping at 09:20; two people context-switched immediately.'),
    po('po-after-hours-anna-priya', 'after-hours-activity', 'After-hours exchange 22:10–22:36', -3, '3',
      'Deploy request and execution at 22:10–22:36 with near-instant replies — response pressure extends into the evening.'),
    po('po-unanswered-blocker-priya', 'unanswered-blocker', 'Blocker unanswered for 26 h (token refresh)', -3, '5',
      'Explicit blocker question at 10:05 answered the next day at 12:15; roughly one lost working day.'),
    po('po-undocumented-decision-auth', 'undocumented-decision', 'Auth-flow v2 decided in-thread, never recorded', -2, '4',
      'Decision "v2: client credentials + on-behalf-of" concluded mid-thread; no wiki/ticket/doc artifact exists.'),
    po('po-jargon-ac', 'jargon-mismatch', '"AC" ambiguity: anti-corruption layer vs acceptance criteria', -2, '2',
      'Same abbreviation, two meanings, second recurrence; ten minutes of confusion in the gateway-split thread.'),
    po('po-cascade-tomas', 'interruption-cascade', '@mention cascade across 3 people before 09:30', -1, '3',
      'Sequential @mentions (Jonas → Priya → Anna) each answered within minutes — three context switches in 15 minutes.'),

    {
      id: 'decision-release-cut',
      type: 'Document',
      properties: {
        domainType: 'Decision', label: 'Release branch cut for pilot',
        date: isoDay(base, -5), documented: 'true',
        artifact: 'release notes + CI tag',
      },
    },
    {
      id: 'decision-auth-v2',
      type: 'Document',
      properties: {
        domainType: 'Decision', label: 'Service-to-service auth moves to v2 (client credentials + OBO)',
        date: isoDay(base, -2), documented: 'false',
        artifact: '(none — exists only in the chat thread)',
      },
    },

    {
      id: 'norm-response-4h',
      type: 'Document',
      properties: {
        domainType: 'AgreementNorm', label: '4 h messenger response norm (core time)',
        status: 'proposed', targetMetric: 'medianReplyLatencyMin<=240, no re-pings',
      },
    },
    {
      id: 'norm-deep-work-block',
      type: 'Document',
      properties: {
        domainType: 'AgreementNorm', label: 'Morning deep-work block 09:00–11:30',
        status: 'proposed', targetMetric: 'burstIndexPct<25 in the block',
      },
    },
    {
      id: 'norm-office-hours',
      type: 'Document',
      properties: {
        domainType: 'AgreementNorm', label: 'Office hours 13:00–14:00 for synchronous questions',
        status: 'proposed', targetMetric: 'cascadeDepth<=1 outside office hours',
      },
    },
    {
      id: 'norm-meeting-free-day',
      type: 'Document',
      properties: {
        domainType: 'AgreementNorm', label: 'Meeting-free Wednesday',
        status: 'proposed', targetMetric: 'per MIT Sloan 2022: autonomy/engagement up, stress down',
      },
    },
    {
      id: 'norm-decision-log',
      type: 'Document',
      properties: {
        domainType: 'AgreementNorm', label: 'Decision log rule — not decided until written down',
        status: 'proposed', targetMetric: 'undocumented decisions = 0',
      },
    },

    {
      id: `metrics-baseline-${isoDay(base, -1)}`,
      type: 'Document',
      properties: {
        domainType: 'MetricSnapshot', label: `Baseline metrics up to ${isoDay(base, -1)}`,
        period: `${isoDay(base, -5)}..${isoDay(base, -1)}`,
        source: 'reports/data/hive-metrics.json',
      },
    },
  ];
}

export function kgRelationships(base: Date): RelationshipDraft[] {
  void base;
  return [
    // occurrence → channel
    { subject: 'po-ping-storm-anna', predicate: 'occursIn', object: 'channel-hive-alpha-general' },
    { subject: 'po-after-hours-anna-priya', predicate: 'occursIn', object: 'channel-hive-alpha-general' },
    { subject: 'po-unanswered-blocker-priya', predicate: 'occursIn', object: 'channel-hive-alpha-dev' },
    { subject: 'po-undocumented-decision-auth', predicate: 'occursIn', object: 'channel-hive-alpha-dev' },
    { subject: 'po-jargon-ac', predicate: 'occursIn', object: 'channel-hive-alpha-dev' },
    { subject: 'po-cascade-tomas', predicate: 'occursIn', object: 'channel-hive-alpha-dev' },

    // person → occurrence (exhibits = initiates; involvedIn = participant/affected)
    { subject: 'person-anna-meier', predicate: 'exhibits', object: 'po-ping-storm-anna' },
    { subject: 'person-anna-meier', predicate: 'exhibits', object: 'po-after-hours-anna-priya' },
    { subject: 'person-priya-nair', predicate: 'involvedIn', object: 'po-after-hours-anna-priya' },
    { subject: 'person-priya-nair', predicate: 'involvedIn', object: 'po-unanswered-blocker-priya', properties: { role: 'blocked' } },
    { subject: 'person-jonas-weber', predicate: 'involvedIn', object: 'po-unanswered-blocker-priya', properties: { role: 'late-responder' } },
    { subject: 'person-tomas-eriksen', predicate: 'exhibits', object: 'po-undocumented-decision-auth' },
    { subject: 'person-tomas-eriksen', predicate: 'exhibits', object: 'po-jargon-ac' },
    { subject: 'person-tomas-eriksen', predicate: 'exhibits', object: 'po-cascade-tomas' },
    { subject: 'person-jonas-weber', predicate: 'involvedIn', object: 'po-cascade-tomas' },
    { subject: 'person-priya-nair', predicate: 'involvedIn', object: 'po-cascade-tomas' },
    { subject: 'person-anna-meier', predicate: 'involvedIn', object: 'po-cascade-tomas' },

    // decisions
    { subject: 'decision-release-cut', predicate: 'decidedIn', object: 'channel-hive-alpha-general' },
    { subject: 'decision-auth-v2', predicate: 'decidedIn', object: 'channel-hive-alpha-dev' },
    { subject: 'po-undocumented-decision-auth', predicate: 'recordedAs', object: 'decision-auth-v2' },

    // remedy mapping: which norm would have prevented which occurrence
    { subject: 'norm-deep-work-block', predicate: 'wouldPrevent', object: 'po-ping-storm-anna' },
    { subject: 'norm-response-4h', predicate: 'wouldPrevent', object: 'po-ping-storm-anna', properties: { note: 'removes the instant-reply expectation the storm rides on' } },
    { subject: 'norm-response-4h', predicate: 'wouldPrevent', object: 'po-after-hours-anna-priya' },
    { subject: 'norm-response-4h', predicate: 'wouldPrevent', object: 'po-unanswered-blocker-priya', properties: { note: 'a 4h ceiling + escalation path surfaces blockers same-day' } },
    { subject: 'norm-decision-log', predicate: 'wouldPrevent', object: 'po-undocumented-decision-auth' },
    { subject: 'norm-decision-log', predicate: 'wouldPrevent', object: 'po-jargon-ac', properties: { note: 'written decisions force term definitions' } },
    { subject: 'norm-office-hours', predicate: 'wouldPrevent', object: 'po-cascade-tomas' },

    // what the occurrences undermine
    { subject: 'po-after-hours-anna-priya', predicate: 'undermines', object: 'norm-response-4h' },
    { subject: 'po-cascade-tomas', predicate: 'undermines', object: 'norm-deep-work-block' },
  ];
}
