# EuroBatt GmbH — Product Feature & Configuration Guide

**Document Version:** 2.8
**Effective Date:** 2026-01-15
**Classification:** Internal Only

---

## How to Use This Document

This document defines every configurable feature for EuroBatt battery cells. The ProductConfigurator agent uses it as the single source of truth when mapping customer requirements to a concrete product configuration.

Each feature entry specifies: which products it applies to, available options, valid ranges, dependencies, and whether the option is standard (no surcharge) or custom/premium.

---

## Feature Catalog

### F-001: Capacity Tier

**Applies to:** All products with a high-density option (BC-NMC-2170, BC-NMC-18650, BC-LFP-32700, BC-LFP-PRIS-100, BC-NMC-POUCH-50)

| Option          | Tier     | Description |
|-----------------|----------|-------------|
| Standard        | standard | Nominal capacity as listed in BatteryCellRange.md |
| High-Density    | premium  | Extended capacity option (+4–10% over standard, per product spec) |

**Constraints:**
- High-density option reduces cycle life by approximately 10–15%.
- High-density is not available on BC-NMC-2170-HP or BC-NMC-POUCH-20.
- Cannot combine High-Density with Extended Cycle Life (F-005).

**Surcharge:** Premium tier → 15% surcharge on base unit price.

---

### F-002: Discharge Rate Configuration

**Applies to:** All products

| Product           | Standard Rate | Max Configurable Rate | Notes |
|-------------------|---------------|-----------------------|-------|
| BC-NMC-2170       | 2.0C          | 2.5C                  | 2.5C available as high-power option |
| BC-NMC-2170-HP    | 5.0C          | 5.0C                  | Already at maximum |
| BC-NMC-18650      | 2.0C          | 2.0C                  | No higher option available |
| BC-LFP-32700      | 3.0C          | 3.0C                  | No higher option available |
| BC-LFP-PRIS-100   | 1.0C          | 1.5C                  | 1.5C with enhanced cooling tabs |
| BC-NMC-POUCH-50   | 2.0C          | 3.0C                  | Requires reinforced tab welding |
| BC-NMC-POUCH-20   | 3.0C          | 5.0C                  | Designed for high-power applications |

**Constraints:**
- Increasing discharge rate above standard reduces cycle life by approximately 20%.
- Above-standard discharge rates require enhanced thermal management on the customer's side (noted in quote).

**Surcharge:**
- At standard rate: no surcharge.
- Above standard rate: custom tier → 15% surcharge on base unit price.

---

### F-003: Operating Temperature Range

**Applies to:** All products

| Option                 | Range            | Tier     |
|------------------------|------------------|----------|
| Standard               | −20°C to +55/60°C (per product) | standard |
| Extended Cold           | −30°C to +55/60°C | premium  |
| Extended Hot            | −20°C to +70°C   | premium  |
| Full Extended           | −30°C to +70°C   | premium  |

**Constraints:**
- Extended Cold requires low-temperature electrolyte formulation. Available for all chemistries.
- Extended Hot requires ceramic-coated separator. Not available for BC-NMC-18650 (form factor too small for ceramic separator).
- Full Extended combines both modifications. Same availability restriction as Extended Hot.
- Extended temperature ranges reduce cycle life by approximately 5–10%.

**Surcharge:** Each extension (cold or hot) → 15% surcharge on base unit price. Full Extended → 25% surcharge.

---

### F-004: Certification Package

**Applies to:** All products

| Package           | Included Certifications                     | Tier     |
|-------------------|----------------------------------------------|----------|
| EU Standard       | CE, IEC 62619, UN 38.3                       | standard |
| EU + UL           | CE, IEC 62619, UN 38.3, UL 1642             | premium  |
| EU + Asia         | CE, IEC 62619, UN 38.3, KC, PSE             | premium  |
| Global Full       | CE, IEC 62619, UN 38.3, UL 1642, KC, PSE, BIS | premium |
| Custom            | Any subset of available certifications       | premium  |

**Constraints:**
- UL certifications add 4–6 weeks to lead time.
- KC and PSE certifications add 6–8 weeks to lead time.
- BIS certification adds 8–12 weeks to lead time.
- IEC 62660 (automotive-specific) is available as an add-on to any package. Adds 4 weeks.

**Surcharge:**
- EU Standard: included in base price.
- EU + UL: +€0.08/unit (cylindrical), +€0.40/unit (prismatic), +€0.20/unit (pouch).
- EU + Asia: +€0.10/unit (cylindrical), +€0.50/unit (prismatic), +€0.25/unit (pouch).
- Global Full: +€0.18/unit (cylindrical), +€0.85/unit (prismatic), +€0.45/unit (pouch).
- IEC 62660 add-on: +€0.05/unit (all form factors).

---

### F-005: Extended Cycle Life

**Applies to:** All products

| Option           | Cycle Life Improvement | Tier     |
|------------------|------------------------|----------|
| Standard         | As listed in product spec | standard |
| Enhanced (+25%)  | +25% over standard     | premium  |
| Maximum (+50%)   | +50% over standard     | premium  |

**Constraints:**
- Cannot combine with High-Density capacity (F-001).
- Cannot combine with above-standard discharge rate (F-002).
- Enhanced cycle life is achieved through optimized formation protocol and electrolyte additives.
- Maximum cycle life additionally uses silicon-reduced anode (lower energy density, −3%).

**Surcharge:**
- Enhanced: 10% surcharge on base unit price.
- Maximum: 20% surcharge on base unit price.

---

### F-006: Cell Packaging & Grouping

**Applies to:** All products

| Option               | Description                                | Tier     |
|----------------------|--------------------------------------------|----------|
| Individual cells     | Loose cells in anti-static trays           | standard |
| Matched sets         | Cells sorted by capacity and impedance (±1%) | premium |
| Pre-welded strings   | Cells connected in series (custom S-count) | premium |
| Module assembly      | Complete module with BMS connector, format: [S]s[P]p | premium |

**Constraints:**
- Matched sets add 2–3 days to production.
- Pre-welded strings: max 16S for cylindrical, max 8S for pouch. Not available for prismatic.
- Module assembly: minimum 4S2P, maximum 16S8P for cylindrical; minimum 4S1P, maximum 16S4P for prismatic and pouch.
- Module assembly requires customer to provide BMS specifications or select from our standard BMS options.

**Surcharge:**
- Individual cells: included in base price.
- Matched sets: +€0.05/unit (cylindrical), +€0.25/unit (prismatic), +€0.15/unit (pouch).
- Pre-welded strings: +€0.30 per connection point.
- Module assembly: quoted separately based on configuration. Typical range: +€2–€8 per cell equivalent.

---

### F-007: Electrolyte Formulation

**Applies to:** NMC products only (not applicable to LFP)

| Option               | Description                                | Tier     |
|----------------------|--------------------------------------------|----------|
| Standard             | Proprietary baseline EC/DMC formulation    | standard |
| High-Voltage         | Fluorinated solvent blend for 4.35V cutoff | premium  |
| Low-Temperature      | Ester-based co-solvent for cold performance | premium  |
| Flame-Retardant      | Phosphate additive for enhanced safety     | premium  |

**Constraints:**
- High-Voltage: increases energy density by ~5% but reduces cycle life by ~10%.
- Low-Temperature: required for Extended Cold temperature range (F-003). Automatically selected.
- Flame-Retardant: reduces energy density by ~3%. Required for some transportation certifications.
- Only one specialty electrolyte option can be selected (excluding Low-Temperature, which stacks).

**Surcharge:** Each specialty option → 15% surcharge on base unit price.

---

### F-008: Tab & Terminal Configuration

**Applies to:** Pouch and prismatic cells only

| Option               | Description                                | Tier     |
|----------------------|--------------------------------------------|----------|
| Standard tabs        | Aluminum (cathode) + Nickel (anode), centered | standard |
| Wide tabs            | 50% wider for reduced impedance            | premium  |
| Custom tab position  | Customer-specified tab placement (drawing required) | custom  |
| Threaded terminals   | M6 bolt terminals (prismatic only)         | premium  |

**Constraints:**
- Wide tabs: available for pouch cells only.
- Custom tab position: requires customer drawing, adds 2 weeks to engineering lead time.
- Threaded terminals: prismatic cells only, not compatible with pre-welded strings (F-006).

**Surcharge:**
- Wide tabs: +€0.15/unit.
- Custom tab position: +€0.25/unit + €2,500 one-time engineering fee.
- Threaded terminals: +€0.40/unit.

---

### F-009: Labeling & Marking

**Applies to:** All products

| Option               | Description                                | Tier     |
|----------------------|--------------------------------------------|----------|
| Standard EuroBatt    | Product ID, batch code, polarity, warnings | standard |
| Customer branding    | Customer logo and part number on cell wrap | premium  |
| Dual branding        | EuroBatt + customer branding               | premium  |
| QR/DataMatrix code   | Unique cell ID with traceability data link | premium  |

**Constraints:**
- Customer branding: customer must supply artwork in vector format (AI/EPS/SVG). Minimum order 5,000 units.
- QR/DataMatrix: requires integration with customer's traceability system or EuroBatt's standard digital product passport.
- EU Battery Regulation requires digital product passport for all EV and industrial batteries >2 kWh. QR code is mandatory for these applications.

**Surcharge:**
- Customer/Dual branding: +€0.03/unit + €800 one-time setup fee.
- QR/DataMatrix code: +€0.02/unit.

---

### F-010: EU Battery Passport

**Applies to:** All products (mandatory for certain applications)

| Option               | Description                                | Tier     |
|----------------------|--------------------------------------------|----------|
| Not required         | Consumer electronics, small devices        | standard |
| Standard passport    | Digital product passport per EU 2023/1542  | regulatory |
| Enhanced passport    | Standard + full supply chain carbon data   | premium  |

**Constraints:**
- Mandatory for: EV batteries, industrial batteries >2 kWh, light means of transport batteries.
- Not mandatory for: portable batteries <2 kWh, starting/lighting/ignition batteries (until 2028).
- Enhanced passport includes Scope 3 carbon footprint data — requires 4 weeks additional data collection.

**Surcharge:**
- Standard passport: +€0.12/unit.
- Enhanced passport: +€0.22/unit.

---

## Configuration Dependency Matrix

| Feature | Conflicts With | Requires |
|---------|---------------|----------|
| F-001 High-Density | F-005 Extended Cycle Life | — |
| F-002 Above-standard discharge | F-005 Extended Cycle Life | Customer thermal management |
| F-003 Extended Cold | — | F-007 Low-Temperature electrolyte (auto-selected) |
| F-003 Extended Hot | — | Not available on BC-NMC-18650 |
| F-005 Maximum Cycle Life | F-001 High-Density, F-002 Above-standard | — |
| F-006 Module Assembly | — | BMS specification from customer |
| F-007 High-Voltage | F-007 Flame-Retardant (mutual exclusion) | — |
| F-008 Threaded Terminals | F-006 Pre-welded strings | Prismatic cells only |
| F-009 QR Code | — | F-010 Battery Passport (recommended) |
| F-010 Mandatory Passport | — | Application must be identified |

---

*For product specifications and matching, see products/BatteryCellRange.md.*
*For country-specific regulatory requirements, see legal/eu-country-regulations.md.*
