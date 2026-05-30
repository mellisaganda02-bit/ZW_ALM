# Zimbabwe Asset Liability Management Platform
## Complete Package

**Platform:** Dynamic Asset–Liability Management for Zimbabwe Non-Life Insurers:
A Regime-Switching Stochastic Programming Approach for the Zimbabwe Insurance Sector

**Framework:** ZICARP Compliant · IFRS 17 Aligned · APN 401 Standards

---

## Package Contents

| File | Size | Description |
|------|------|-------------|
| `ZWALM_System.html` | ~112 KB | Complete standalone dashboard application |
| `alm_engine.js` | ~52 KB | Standalone calculation engine (Node.js + Browser) |
| `README.md` | This file | Usage guide & documentation |

---

## Quick Start

### Option 1 — Demo (Zimbabwe Insurance Sector Data)
1. Open `ZWALM_System.html` in Chrome, Edge, or Firefox
2. Click **"📊 Load Zimbabwe Demo Data"**
3. All 12 sections populate instantly with real calculated results

### Option 2 — Upload Your Own Data
1. Open `ZWALM_System.html`
2. Drag & drop XLSX files onto the import area
3. Accepted formats (auto-detected):

| File Type | Required Columns |
|-----------|-----------------|
| Premium Data | Class, GWP, NWP, RI, Gross UPR, Net UPR |
| Claims Paid | D.O.L, Reported, DATE PAID, Type, ZWL, USD |
| Outstanding Claims | Occur Date, Currency, ClaimAmountInc, GrossInc, NetInc |
| ZICARP QRT | Balance Sheet, Own Funds, SCR, MCR sheets |

4. Fill in the **Manual ZICARP Inputs** panel for any missing asset values
5. Click **"▶ Run ALM Engine"**

### Option 3 — Use the Engine in Your Code
```javascript
// Browser
<script src="alm_engine.js"></script>
const result = ZWALMEngine.runALMEngine(companyData);

// Node.js
const ZWALM = require('./alm_engine.js');
const scr = ZWALM.calcSCR(ZWALM.calcBSCR(mktRisk, nlRisk), opRisk);
```

---

## Application Sections (12 total)

| Section | Description |
|---------|-------------|
| **Import Data** | File upload, manual inputs, engine status dashboard |
| **Overview** | KPI cards, GWP donut, combined ratio chart, capital stack, BS reconciliation |
| **Solvency & SCR** | Full SCR build-up, SCR decomposition pie, own funds tiering, admissible assets |
| **Tech Provisions** | IBNR, OCR, UPR, RA, LIC, LRC, onerous contracts — all classes |
| **Stress Testing** | ZICARP ±25% scenarios, ALM regime shocks, property sensitivity curve |
| **Premiums** | GWP vs NWP, RI cession, retention ratios, combined ratio components |
| **Claims** | Monthly trend, type breakdown, settlement lag, outstanding claims |
| **Investments** | Asset allocation, duration mismatch, LCR, admissibility table |
| **Reinsurance** | Recovery ratios, retention analysis, efficiency signals, treaty table |
| **Underwriting** | Onerous contract test (IFRS 17), loss components, premium adequacy |
| **Regime Model** | Markov 3-state framework, transition matrix, forward probabilities |
| **ALM Optimiser** | Interactive sliders → live SCR/LCR/return/vol + efficient frontier + Monte Carlo |

---

## Calculation Engine Reference

All 27 functions, mapped to dissertation and regulatory sources:

### Technical Provisions (IFRS 17 + ZICARP)
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcIBNR(nwp, gwp, pct)` | IBNR = pct × GWP | Circular 1/2014; APN 401 |
| `calcUPR(gwp, nwp, incept, expire, vd)` | UPR = GWP × (unexpired/total days) | IFRS 17 LRC; 365th method |
| `calcRiskAdjustment(ibnr, ocr, class)` | RA = factor × (IBNR + OCR) | IFRS 17 §37; ZICARP TS-4 |
| `calcLossComponent(upr, cr)` | LossComp = UPR × (CR − 1) if CR > 1 | IFRS 17 §47–52 |
| `calcCombinedRatio(claims, ep, comm, exp)` | CR = Loss + Commission + Expense ratios | APN 401 §6; ZICARP TS-5 |
| `calcLIC(ocr, ibnr, ra)` | LIC = OCR + IBNR + RA | IFRS 17 §40; ZICARP TS-2 |
| `calcLRC(upr, iacf, lossComp)` | LRC = UPR − IACF + LossComp | IFRS 17 §32 |
| `calcTechnicalProvisions(lic, lrc)` | TP = LIC + LRC | IFRS 17 |

### SCR — Market Risk (ZICARP TS-6)
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcEquityRisk(listed, unlisted, symAdj)` | Shock 32% listed, 45% unlisted; ρ=0.75 | ZICARP TS-6 §Equity Risk |
| `calcPropertyRisk(property)` | Shock = 25% of property NAV | ZICARP TS-6 §Property Risk |
| `calcCounterpartyDefaultRisk(cat1, cat2)` | Cat1: PD×LGD×Exposure; Cat2: delay-based | ZICARP TS-6 §Counterparty |
| `calcConcentrationRisk(exposures, totalA)` | Herfindahl approach; Xi = max(0, raeᵢ/A − CTᵢ) | ZICARP TS-6 §Concentration |
| `calcMarketRisk(eq, prop, cp, curr, conc)` | 5×5 ZICARP correlation matrix | ZICARP TS-6 Table 6.3 |

### SCR — Underwriting + Operational
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcNLUnderwritingRisk(lines)` | σ_prem×V_prem + σ_res×V_res + cat; ρ(P,R)=0.25 | ZICARP TS-6 §NL UW Risk |
| `calcOperationalRisk(bscr, nep)` | max(3%×BSCR, 3%×NEP) | ZICARP TS-6 §Operational |
| `calcBSCR(mkt, nl)` | sqrt(C_mkt² + C_nl² + 2×0.25×C_mkt×C_nl) | ZICARP TS-6 §4 |
| `calcSCR(bscr, opRisk)` | SCR = BSCR + OpRisk | ZICARP TS-6 §4 |

### MCR, Own Funds, Admissibility
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcMCR(scr, amcr, lines, of)` | max(AMCR, 25%×SCR, Σmax(a×TP, b×NEP)) | ZICARP TS-1 |
| `calcOwnFunds(components)` | Tier 1 = ShareCap + RetainedEarnings + ReconRes | ZICARP TS-1; Circ. 7/2023 |
| `calcAdmissibleAssets(assets)` | Deduct: goodwill, intangibles, IT, furniture, vehicles | ZICARP TS-1 |

### Regime Model (Hamilton 1989)
| Function | Calculation | Source |
|----------|-------------|--------|
| `markovNextState(PI, state, steps)` | π(t+n) = π(t) × Πⁿ | Hamilton (1989) |
| `markovStationary(PI, iterations)` | π* = lim π₀×Πⁿ (power iteration) | Hamilton (1989) |
| `regimeExpectedReturn(alloc, regime)` | E[R\|r] = Σᵢ wᵢ × μᵢ(r) | Dissertation §7.2 |
| `regimeReturnVolatility(alloc, regime)` | σ²_portfolio = Σᵢ Σⱼ wᵢwⱼσᵢσⱼρᵢⱼ | Dissertation §7.2 |
| `unconditionalExpectedReturn(alloc, probs)` | E[R] = Σᵣ πᵣ × E[R\|r] | Hardy (2021) |

### ALM Optimiser
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcSurplusMetrics(A, σA, L, σL, ρ)` | σ²(S) = Var(A)+Var(L)−2Cov(A,L); VaR₉₉.₅ | Di Francesco & Simonella (2023) |
| `calcDurationGap(dA, dL, A, L)` | Gap = D_A − (L/A)×D_L | IFRS 17 §B72–B85 |
| `calcLiquidityCoverage(assets, stLiabs)` | LCR = Σ haircut×asset / ST_Liabilities | ZICARP liquidity requirements |
| `efficientFrontierPoint(targetReturn, probs)` | Grid search minimising surplus variance | Dissertation §5 |

### Stress Testing
| Function | Calculation | Source |
|----------|-------------|--------|
| `calcZICARPStressScenarios(scr, mcr, of, pct)` | ±25% own funds; report SCR/MCR cover | ZICARP; Circular 7/2023; AFR §5 |
| `calcALMStressScenarios(A, L, scr)` | 6 regime shocks: property, inflation, FX, cat, crisis | Dissertation §7.2 |
| `propertySensitivityAnalysis(A, L, scr)` | Sweep −50% to +30% property; report SCR cover | AFR §5 |

### Monte Carlo
| Function | Calculation | Source |
|----------|-------------|--------|
| `monteCarloSurplus(surplus, alloc, liabs, PI, rp, T, N)` | N-path regime-switching surplus projection; Box-Muller | Birge & Louveaux (2011); Dissertation §7.2 |

### Master Engine
| Function | Description |
|----------|-------------|
| `runALMEngine(data)` | Full pipeline: provisions → SCR → MCR → OwnFunds → RI → Regime → ALM → Stress → MC |

---

## Data Format for runALMEngine()

```javascript
const data = {
  premiums: [
    { class: 'Agriculture', GWP: 32673035, NWP: 29868704, RI: 2804330,
      'Gross UPR': 20698786, 'Net UPR': 20435318 }
    // ... one record per class (or one per policy)
  ],
  claims: {
    paid: [
      { 'D.O.L': '2023-01-10', Reported: '2023-01-15',
        'DATE PAID': '2023-03-20', Type: 'Crop', ZWL: 24576880, USD: 59738 }
    ],
    outstanding: [
      { occurDate: '2023-07-15', Currency: 'USD',
        ClaimAmountInc: 829973, GrossInc: 92041, NetInc: 43630 }
    ]
  },
  assets: {
    schedule: {
      investmentProperty: 546622488,  // ADMISSIBLE
      listedEquity: 411529,           // ADMISSIBLE
      gold: 8378163,                  // ADMISSIBLE
      moneyMarket: 5078488,           // ADMISSIBLE
      cash: 1072276,                  // ADMISSIBLE
      receivables: 183658998,         // ADMISSIBLE
      intangibles: 2267,              // INADMISSIBLE → deducted
      itSystems: 183939,              // INADMISSIBLE → deducted
      furniture: 24863,               // INADMISSIBLE → deducted
      motorVehicles: 274343,          // INADMISSIBLE → deducted
      otherOperatingAssets: 717429    // INADMISSIBLE → deducted
    },
    ownFunds: {
      shareCapital: 6074807,
      retainedEarnings: 404806219,
      reconReserve: -5167122
    }
  },
  config: {
    ibnrPct: 0.05,             // 5% of GWP (Circular 1/2014)
    amcr: 38697750,            // ZICARP absolute floor
    transitionMatrix: [
      [0.72, 0.22, 0.06],      // Stable → {Stable, Volatile, Crisis}
      [0.18, 0.64, 0.18],      // Volatile → ...
      [0.08, 0.35, 0.57]       // Crisis → ...
    ],
    currentRegimeProbs: [0.22, 0.61, 0.17],  // Current state
    allocation: { property:0.73, equity:0.01, bond:0, money_market:0.01, gold:0.01, other:0.24 },
    combinedRatios: {
      Agriculture: 0.52, Engineering: 0.45, Liability: 3.13,
      Motor: 2.01, Accident: 0.57, Property: 1.58
    },
    ocr: {
      Agriculture: { gross: 4582369, net: 207393 },
      Engineering: { gross: 143743,  net: 136929 },
      Liability:   { gross: 6192,    net: 1238   },
      Motor:       { gross: 2380574, net: 499399 },
      Accident:    { gross: 491701,  net: 77396  },
      Property:    { gross: 0,       net: 0      }
    },
    recoveries: { Agriculture: 447241, Engineering: 0, Liability: 1678,
                  Motor: 92098, Accident: 119222, Property: 38465 },
    nonTechLiabilities: 299186684,
    shortTermLiabilities: 175000000,
    assetDuration: 9.5,      // Weighted avg (property dominates)
    liabDuration: 0.8,       // Short-tail non-life (<1yr)
    projectionYears: 5,
    simulations: 500
  }
};

const result = ALMEngine.runALMEngine(data);

// Key results:
console.log('SCR Cover:', result.summary.scrCover.toFixed(3) + '×');
console.log('MCR Cover:', result.summary.mcrCover.toFixed(3) + '×');
console.log('SCR:', result.summary.scr);
console.log('Property Risk:', result.scrComponents.property);
console.log('Duration Gap:', result.almMetrics.durationResult.durationGap, 'years');
console.log('LCR:', result.almMetrics.liquidityResult.lcr.toFixed(3) + '×');
```

---

## Technical Requirements

- **Browser:** Chrome 90+, Firefox 88+, Edge 90+
- **Internet:** Required on first load for CDN libraries (Chart.js, SheetJS XLSX)
- **Offline:** Works offline after first load (libraries cached by browser)
- **Node.js:** v14+ for `alm_engine.js` (no dependencies)

---

## References

| Author | Year | Work |
|--------|------|------|
| Hamilton, J.D. | 1989 | A new approach to the economic analysis of nonstationary time series. *Econometrica*, 57(2) |
| Birge & Louveaux | 2011 | *Introduction to Stochastic Programming*. Springer |
| Di Francesco & Simonella | 2023 | A stochastic ALM model for life insurance. *Financial Markets & Portfolio Management* |
| Maggioni & Turchetti | 2024 | *Fundamentals of the Insurance Business*. Springer |
| Consigli, Dentcheva & Micheli | 2025 | ALM under sequential stochastic dominance. arXiv |
| Hardy, M. | 2021 | *Investment Guarantees and Stochastic Modelling*. Wiley |
| IFRS Foundation | 2023 | IFRS 17 Insurance Contracts |
| IPEC | 2023 | Zimbabwe Integrated Capital and Risk Programme (ZICARP) |
| RBZ | 2023 | Monetary Policy Statement & Financial Stability Report |
| World Bank | 2023 | Zimbabwe Economic Update |
