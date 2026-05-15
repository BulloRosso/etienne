/**
 * Knowledge-graph seed: ~30 entities across 8 types, ~40 relationships.
 *
 * Maps onto the existing /api/knowledge-graph/:project routes:
 *   POST :project/entities       { id, type, properties }
 *   POST :project/relationships  { subject, predicate, object, properties? }
 *
 * The underlying KnowledgeGraphService restricts `type` to a fixed union
 * (Person | Company | Product | Document | DocumentChunk) at the TS level.
 * We piggy-back on `Document` and `Product` for our domain-specific types,
 * encoding the real domain type in `properties.domainType` so we don't
 * touch the service signature for a seed script.
 */

export interface EntityDraft {
  id: string;
  /** What the KG service accepts at the wire level. */
  type: 'Person' | 'Company' | 'Product' | 'Document';
  /** Properties flow straight onto RDF predicates (string values). */
  properties: Record<string, string>;
}

export interface RelationshipDraft {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, string>;
}

// --- entity helpers ------------------------------------------------------

const tech = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Product',
  properties: { domainType: 'Technology', label, ...extra },
});

const component = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Product',
  properties: { domainType: 'Component', label, ...extra },
});

const product = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Product',
  properties: { domainType: 'Product', label, ...extra },
});

const manufacturer = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Company',
  properties: { domainType: 'Manufacturer', label, ...extra },
});

const regulation = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Regulation', label, ...extra },
});

const parameter = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Parameter', label, ...extra },
});

const region = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Region', label, ...extra },
});

const pilot = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Pilot', label, ...extra },
});

// --- entities ------------------------------------------------------------

export const KG_ENTITIES: EntityDraft[] = [
  // Technologies (4)
  tech('reverse-osmosis', 'Reverse osmosis', { specificEnergy_kwh_per_m3: '3.0-5.0', maturity: 'commercial' }),
  tech('med', 'Multi-effect distillation', { specificEnergy_kwh_per_m3_thermal: '8-15' }),
  tech('solar-still', 'Solar still', { output_L_per_m2_day: '3-5' }),
  tech('electrodialysis', 'Electrodialysis (ED / EDR)', { feedTDS_window_mg_L: '1000-10000' }),

  // Components (8)
  component('ro-membrane', 'RO spiral-wound membrane', { activeMaterial: 'TFC polyamide' }),
  component('hp-pump', 'High-pressure pump', { pressureRange_bar: '55-70' }),
  component('erd', 'Energy recovery device', { recoveryEfficiency_pct: '92-96' }),
  component('prefilter', 'Pre-filter stack', { sdiTarget: '<3' }),
  component('uv-sterilizer', 'UV sterilizer', { wavelength_nm: '256', dose_mJ_cm2: '40' }),
  component('pv-panel', 'PV panel', { sizing_kWp_for_pilot: '7' }),
  component('battery', 'LFP battery bank', { capacity_kWh: '10', cycles_at_80_dod: '6000' }),
  component('brine-discharge', 'Brine discharge', { dilutionRatio: '~2:1 seawater:brine' }),

  // Manufacturers (4)
  manufacturer('dow', 'DOW (DuPont Water Solutions)'),
  manufacturer('grundfos', 'Grundfos'),
  manufacturer('spectra', 'Spectra Watermakers'),
  manufacturer('sun-mar', 'Sun-Mar'),

  // Products (4)
  product('filmtec-sw30-2540', 'FILMTEC SW30-2540', { rated_flow_GPD: '700', salt_rejection_pct: '99.4', test_NaCl_ppm: '32000' }),
  product('sqflex-5a-7', 'Grundfos SQFlex 5A-7', { flow_m3_h_at_8m: '5', power_W: '30-1400' }),
  product('cape-horn-extreme', 'Spectra Cape Horn Extreme', { output_L_h: '280-680', energy_kWh_m3: '~3.0' }),
  product('px-pressure-exchanger', 'ERI PX pressure exchanger', { efficiency_pct: '~96' }),

  // Regulations (3)
  regulation('who-gdwq-4', 'WHO GDWQ 4th ed. (2011 + 2022 addendum)', { jurisdiction: 'global', boron_mg_L: '2.4-provisional' }),
  regulation('eu-dwd-2020-2184', 'EU Drinking Water Directive 2020/2184', { jurisdiction: 'EU', boron_mg_L: '1.5', arsenic_ug_L: '10' }),
  regulation('fiji-dwq-2014', 'Fiji Drinking Water Quality Standards 2014', { jurisdiction: 'Fiji', basis: 'WHO GDWQ' }),

  // Parameters (5)
  parameter('tds', 'Total dissolved solids', { unit: 'mg/L', WHO_taste_excellent: '<300', WHO_taste_unacceptable: '>1200' }),
  parameter('coliform', 'Coliforms / E. coli', { unit: '/100 mL', WHO_limit: '0', EU_limit: '0' }),
  parameter('boron', 'Boron', { unit: 'mg/L', WHO_provisional: '2.4', EU_binding: '1.5' }),
  parameter('free-chlorine', 'Free chlorine residual', { unit: 'mg/L', WHO_range: '0.2-0.5' }),
  parameter('turbidity', 'Turbidity', { unit: 'NTU', WHO_target: '<1 (treated)', EU_works_output: '1' }),

  // Regions (2)
  region('pacific-polynesia', 'Pacific — Polynesia', { climate: 'tropical maritime', irradiance_kWh_m2_day: '5.5' }),
  region('caribbean-lesser-antilles', 'Caribbean — Lesser Antilles', { climate: 'tropical maritime', hurricaneSeason: 'Jun-Nov' }),

  // Pilots (2)
  pilot('tuvalu-funafuti-2018', 'Tuvalu — Funafuti RO plant (Japanese govt)', { year: '2018', lesson: 'cyclone-resilient enclosure mandatory' }),
  pilot('saint-vincent-bequia-2021', 'Saint Vincent — Bequia community RO', { year: '2021', lesson: 'avoided-cost of bottled water makes payback < 5y' }),
];

// --- relationships -------------------------------------------------------

export const KG_RELATIONSHIPS: RelationshipDraft[] = [
  // Technology → Components ----------------------------------------------
  { subject: 'reverse-osmosis', predicate: 'uses', object: 'ro-membrane' },
  { subject: 'reverse-osmosis', predicate: 'uses', object: 'hp-pump' },
  { subject: 'reverse-osmosis', predicate: 'uses', object: 'erd' },
  { subject: 'reverse-osmosis', predicate: 'requires_pretreatment_by', object: 'prefilter' },
  { subject: 'reverse-osmosis', predicate: 'optionally_uses', object: 'uv-sterilizer' },
  { subject: 'solar-still', predicate: 'powered_by', object: 'pv-panel', properties: { mode: 'implicit-thermal' } },
  { subject: 'electrodialysis', predicate: 'requires_feed_TDS_below_mg_L', object: 'tds', properties: { threshold: '10000' } },

  // Manufacturer → Product -----------------------------------------------
  { subject: 'dow', predicate: 'manufactures', object: 'filmtec-sw30-2540' },
  { subject: 'grundfos', predicate: 'manufactures', object: 'sqflex-5a-7' },
  { subject: 'spectra', predicate: 'manufactures', object: 'cape-horn-extreme' },

  // Product → Component (the role it plays in our pilot) -----------------
  { subject: 'filmtec-sw30-2540', predicate: 'is_a', object: 'ro-membrane' },
  { subject: 'sqflex-5a-7', predicate: 'used_as', object: 'hp-pump', properties: { role: 'feed-booster' } },
  { subject: 'cape-horn-extreme', predicate: 'integrates', object: 'erd', properties: { variant: 'Clark pump' } },

  // Regulation → Parameter (which std governs which param) ---------------
  { subject: 'who-gdwq-4', predicate: 'sets_value_for', object: 'tds' },
  { subject: 'who-gdwq-4', predicate: 'sets_value_for', object: 'coliform' },
  { subject: 'who-gdwq-4', predicate: 'sets_value_for', object: 'boron', properties: { value_mg_L: '2.4', basis: 'provisional' } },
  { subject: 'who-gdwq-4', predicate: 'sets_value_for', object: 'free-chlorine' },
  { subject: 'who-gdwq-4', predicate: 'sets_value_for', object: 'turbidity' },
  { subject: 'eu-dwd-2020-2184', predicate: 'sets_value_for', object: 'coliform' },
  { subject: 'eu-dwd-2020-2184', predicate: 'sets_value_for', object: 'boron', properties: { value_mg_L: '1.5', basis: 'binding' } },
  { subject: 'eu-dwd-2020-2184', predicate: 'sets_value_for', object: 'turbidity' },
  { subject: 'fiji-dwq-2014', predicate: 'incorporates_by_reference', object: 'who-gdwq-4' },

  // Parameter → Component (where in the train the parameter is targeted) -
  { subject: 'boron', predicate: 'limited_by_capability_of', object: 'ro-membrane' },
  { subject: 'tds', predicate: 'controlled_by', object: 'ro-membrane' },
  { subject: 'turbidity', predicate: 'controlled_by', object: 'prefilter' },
  { subject: 'coliform', predicate: 'controlled_by', object: 'uv-sterilizer' },
  { subject: 'coliform', predicate: 'controlled_by', object: 'free-chlorine' },

  // Component → Component (within-train dependencies) --------------------
  { subject: 'prefilter', predicate: 'feeds', object: 'hp-pump' },
  { subject: 'hp-pump', predicate: 'feeds', object: 'ro-membrane' },
  { subject: 'ro-membrane', predicate: 'produces_brine_into', object: 'brine-discharge' },
  { subject: 'erd', predicate: 'recovers_pressure_from', object: 'brine-discharge' },
  { subject: 'pv-panel', predicate: 'powers', object: 'hp-pump' },
  { subject: 'battery', predicate: 'buffers', object: 'pv-panel' },

  // Region ↔ Pilot --------------------------------------------------------
  { subject: 'tuvalu-funafuti-2018', predicate: 'deployed_in', object: 'pacific-polynesia' },
  { subject: 'saint-vincent-bequia-2021', predicate: 'deployed_in', object: 'caribbean-lesser-antilles' },

  // Pilot → Technology (what each pilot demonstrated) --------------------
  { subject: 'tuvalu-funafuti-2018', predicate: 'demonstrates', object: 'reverse-osmosis' },
  { subject: 'saint-vincent-bequia-2021', predicate: 'demonstrates', object: 'reverse-osmosis' },

  // Pilot → Lessons (regulation links) -----------------------------------
  { subject: 'tuvalu-funafuti-2018', predicate: 'validated_against', object: 'who-gdwq-4' },
  { subject: 'saint-vincent-bequia-2021', predicate: 'validated_against', object: 'eu-dwd-2020-2184' },

  // Pilot → Product (which equipment) ------------------------------------
  { subject: 'saint-vincent-bequia-2021', predicate: 'uses_product', object: 'filmtec-sw30-2540' },
];
