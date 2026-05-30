/**
 * Zimbabwe Asset Liability Management Platform — Dynamic ALM Calculation Engine
 * Based on: Dynamic Asset-Liability Management for Non-Life Insurers:
 *           A Regime-Switching Stochastic Programming Approach
 *
 * Implements:
 *  1. Technical Provisions (IFRS 17 + ZICARP) — IBNR, OCR, UPR, RA, IACF, LIC, LRC
 *  2. Solvency Capital Requirement (SCR) — Market, NL Underwriting, Operational
 *  3. Minimum Capital Requirement (MCR)
 *  4. Own Funds Tiering
 *  5. Combined Ratio & Underwriting Analysis
 *  6. Reinsurance Adequacy
 *  7. Markov Regime-Switching Model
 *  8. ALM Optimiser — Surplus Volatility Minimisation
 *  9. Stress Testing & Sensitivity Analysis
 * 10. Duration Mismatch (IFRS 17)
 *
 * All formulas reference ZICARP Technical Specifications 1-6,
 * APN 401 (ASSA), Circular 7/2023, IFRS 17, and the stochastic programming model.
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — TECHNICAL PROVISIONS (IFRS 17 / ZICARP)
// ═══════════════════════════════════════════════════════════════════

/**
 * IBNR: Incurred But Not Reported Reserve
 * Method: Percentage approach — 5% of Net Written Premium
 * Source: Circular 1 of 2014; APN 401; Consistent with back-testing
 *
 * @param {number} nwp  Net Written Premium for the class
 * @param {number} gwp  Gross Written Premium for the class
 * @param {number} pct  IBNR percentage (default 5%)
 * @returns {{gross: number, net: number}}
 */
function calcIBNR(nwp, gwp, pct = 0.05) {
  try {
    // Input validation
    if (!nwp || !gwp || nwp < 0 || gwp < 0) {
      throw new Error('Premium values must be non-negative numbers');
    }
    if (pct < 0 || pct > 1) {
      throw new Error('IBNR percentage must be between 0 and 1');
    }
    
    return {
      gross: Math.max(0, gwp * pct),
      net:   Math.max(0, nwp * pct)
    };
  } catch (error) {
    console.error('Error in calcIBNR:', error.message);
    return {
      gross: 0,
      net: 0,
      error: error.message
    };
  }
}

/**
 * Unearned Premium Reserve (UPR) — 365th Method (Precise Method)
 * Source: IFRS 17 LRC; APN 401; Statutory Instrument 95/2017
 *
 * UPR = GWP × (unexpired_days / total_policy_days)
 *
 * @param {number}   gwp           Gross Written Premium
 * @param {Date}     inceptDate    Policy inception date
 * @param {Date}     expireDate    Policy expiry date
 * @param {Date}     valuationDate Valuation date (default today)
 * @returns {{gross: number, net: number, proportionUnearned: number}}
 */
function calcUPR(gwp, nwp, inceptDate, expireDate, valuationDate) {
  try {
    // Input validation
    if (!gwp || !nwp || !inceptDate || !expireDate) {
      throw new Error('Missing required parameters for UPR calculation');
    }
    if (gwp < 0 || nwp < 0) {
      throw new Error('Premium values must be non-negative');
    }
    
    const vd    = valuationDate || new Date();
    const total = (expireDate - inceptDate) / 86400000;   // total days
    
    if (total <= 0) {
      throw new Error('Expiry date must be after inception date');
    }
    
    const elapsed = Math.max(0, Math.min(total, (vd - inceptDate) / 86400000));
    const unexpired = Math.max(0, total - elapsed);
    const prop = total > 0 ? unexpired / total : 0;
    
    return {
      gross: Math.max(0, gwp * prop),
      net:   Math.max(0, nwp * prop),
      proportionUnearned: prop
    };
  } catch (error) {
    console.error('Error in calcUPR:', error.message);
    return {
      gross: 0,
      net: 0,
      proportionUnearned: 0,
      error: error.message
    };
  }
}

/**
 * Risk Adjustment (RA) for Non-Financial Risk — VaR 99.5% Approach
 * Source: IFRS 17 para 37; ZICARP Technical Spec 4
 *
 * RA = factor × (IBNR + OCR)
 * Factors: Motor=10%, Liability=20%, Other=15%
 *
 * @param {number} ibnr       IBNR reserve
 * @param {number} ocr        Outstanding Claims Reserve
 * @param {string} classType  'motor'|'liability'|'other'
 * @returns {number}
 */
function calcRiskAdjustment(ibnr, ocr, classType) {
  try {
    // Input validation
    if (ibnr < 0 || ocr < 0) {
      throw new Error('Reserve values must be non-negative');
    }
    
    const factors = { motor: 0.10, liability: 0.20, other: 0.15 };
    const f = factors[classType?.toLowerCase()] ?? factors.other;
    return Math.max(0, f * (ibnr + ocr));
  } catch (error) {
    console.error('Error in calcRiskAdjustment:', error.message);
    return 0;
  }
}

/**
 * Liability for Incurred Claims (LIC)
 * LIC = OCR + IBNR + RA
 * Source: IFRS 17 para 40; ZICARP TS-2
 */
function calcLIC(ocr, ibnr, ra) {
  return { gross: ocr.gross + ibnr.gross + ra, net: ocr.net + ibnr.net + ra };
}

/**
 * Insurance Acquisition Cash Flows (IACF)
 * Amortised over coverage period using straight-line or UPR proportion
 * Source: IFRS 17 para 28B
 *
 * @param {number} totalIACF     Total acquisition costs (commissions + expenses)
 * @param {number} uprProportion Proportion of premium unearned
 */
function calcIACF(totalIACF, uprProportion) {
  return totalIACF * uprProportion;
}

/**
 * Loss Component — Onerous Contracts Test
 * Required when Combined Ratio > 100%
 * Source: IFRS 17 para 47–52; ZICARP TS-3
 *
 * @param {number} grossUPR
 * @param {number} combinedRatio
 * @returns {number} Loss component (0 if not onerous)
 */
function calcLossComponent(grossUPR, combinedRatio) {
  if (combinedRatio <= 1.0) return 0;
  // Excess of expected claims+expenses over premium earned
  return grossUPR * (combinedRatio - 1.0);
}

/**
 * Liability for Remaining Coverage (LRC)
 * LRC = UPR − IACF + LossComponent
 * Source: IFRS 17 para 32; Building Block Approach
 */
function calcLRC(upr, iacf, lossComponent) {
  return {
    gross: upr.gross - iacf + lossComponent,
    net:   upr.net   - iacf
  };
}

/**
 * Total Technical Provisions
 * TP = LIC + LRC
 */
function calcTechnicalProvisions(lic, lrc) {
  return {
    gross: lic.gross + lrc.gross,
    net:   lic.net   + lrc.net
  };
}

/**
 * Combined Ratio
 * CR = Loss Ratio + Commission Ratio + Expense Ratio
 * Source: APN 401; ZICARP TS-5 underwriting assessment
 *
 * @param {number} netIncurredClaims
 * @param {number} netEarnedPremium
 * @param {number} netCommissions   (negative if net receipt)
 * @param {number} operatingExpenses
 * @returns {{lossRatio, commissionRatio, expenseRatio, combinedRatio}}
 */
function calcCombinedRatio(netIncurredClaims, netEarnedPremium, netCommissions, operatingExpenses) {
  const ep = netEarnedPremium || 1;
  const lr = netIncurredClaims / ep;
  const cr = netCommissions / ep;
  const er = operatingExpenses / ep;
  return {
    lossRatio:        lr,
    commissionRatio:  cr,
    expenseRatio:     er,
    combinedRatio:    lr + cr + er
  };
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — SOLVENCY CAPITAL REQUIREMENT (SCR) — ZICARP Framework
// ═══════════════════════════════════════════════════════════════════

/**
 * Equity Risk Capital Charge
 * ZICARP TS-6 Market Risk Module
 * Shock factor: 32% for Zimbabwe quoted equities
 *
 * Capital Charge = max(0, NAV_before - NAV_after_shock)
 * Symmetric adjustment applied for listed equities based on
 * current vs 36-month average All Share Index ratio.
 *
 * @param {number} listedEquities     Value of listed equities
 * @param {number} unlistedEquities   Value of unlisted equities
 * @param {number} symAdjFactor       Symmetric adjustment (default 0)
 * @returns {number}
 */
function calcEquityRisk(listedEquities, unlistedEquities = 0, symAdjFactor = 0) {
  const shockListed   = 0.32 + symAdjFactor;   // base shock 32%
  const shockUnlisted = 0.45;                   // unlisted: 45%
  const shockForeign  = 0.32;                   // foreign: 32%
  const chargeListed    = listedEquities   * shockListed;
  const chargeUnlisted  = unlistedEquities * shockUnlisted;
  // Diversification within equity: corr = 0.75
  const undivCharge = Math.sqrt(
    chargeListed**2 + chargeUnlisted**2 + 2*0.75*chargeListed*chargeUnlisted
  );
  return undivCharge;
}

/**
 * Property Risk Capital Charge
 * ZICARP TS-6; shock = 25% of property NAV
 * Property held for own use: inadmissible under ZICARP
 *
 * @param {number} investmentProperty   Investment property value
 * @param {number} ownUseProperty       Property held for own use (default 0)
 * @returns {number}
 */
function calcPropertyRisk(investmentProperty, ownUseProperty = 0) {
  const shock = 0.25;
  return (investmentProperty + ownUseProperty) * shock;
}

/**
 * Counterparty Default Risk Capital Charge
 * ZICARP TS-6 — Two category approach
 *
 * Category 1: Reinsurance + derivatives (rated counterparties)
 *   Charge = exposure × LGD × PD_factor
 * Category 2: Insurance debtors (delay-based)
 *   0-30 days: 15% of receivable
 *   31-60 days: 15% of receivable
 *   >60 days: more aggressive factor
 *
 * @param {Array<{exposure, lgd, pd}>} cat1Exposures
 * @param {Array<{amount, daysDelay}>} cat2Receivables
 * @returns {{cat1, cat2, total}}
 */
function calcCounterpartyDefaultRisk(cat1Exposures = [], cat2Receivables = []) {
  // Category 1
  let cat1 = 0;
  for (const { exposure, lgd, pd } of cat1Exposures) {
    cat1 += exposure * (lgd ?? 1) * (pd ?? 0.1);
  }

  // Category 2 — receivables
  let cat2 = 0;
  for (const { amount, daysDelay } of cat2Receivables) {
    if (daysDelay <= 30)      cat2 += amount * 0.15;
    else if (daysDelay <= 60) cat2 += amount * 0.15;
    else if (daysDelay <= 90) cat2 += amount * 0.40;
    else                       cat2 += amount * 0.90;
  }

  // Correlation factor: 0.75 between cat1 and cat2
  const total = Math.sqrt(cat1**2 + cat2**2 + 2*0.75*cat1*cat2);
  return { cat1, cat2, total };
}

/**
 * Concentration Risk Capital Charge
 * ZICARP TS-6 — Herfindahl-based approach
 *
 * For each exposure i:
 *   Xi = max(0, exposure_i/total_assets - CT_i)
 *   g_i = normalised excess concentration
 *   Conc_i = g_i × LGD_factor × total_assets
 *
 * @param {Array<{value, ct, lgdFactor}>} exposures
 * @param {number} totalAssets
 * @returns {number}
 */
function calcConcentrationRisk(exposures, totalAssets) {
  let totalCharge = 0;
  for (const { value, ct, lgdFactor } of exposures) {
    const riskAdjExposure = value * (lgdFactor ?? 1);
    const xi = Math.max(0, riskAdjExposure / totalAssets - ct);
    if (xi > 0) {
      // g = sqrt(xi) — normalised excess (simplified ZICARP formula)
      const g = Math.sqrt(xi);
      totalCharge += g * 0.73 * totalAssets;  // 0.73 = LGD factor for unrated
    }
  }
  return totalCharge;
}

/**
 * Market Risk Diversified Capital Charge
 * ZICARP correlation matrix:
 *         Equity  Prop  CParty  Curr  Conc
 * Equity    1     0.75   0.75   0.5   0.5
 * Prop     0.75    1     0.5    0.5   0.5
 * CParty   0.75   0.5    1      0.5   0.5
 * Curr      0.5   0.5    0.5    1     0.5
 * Conc      0.5   0.5    0.5    0.5   1
 *
 * BSCR_mkt = sqrt(sum_i sum_j ρ_ij × C_i × C_j)
 *
 * @param {number} equityCharge
 * @param {number} propertyCharge
 * @param {number} counterpartyCharge
 * @param {number} currencyCharge
 * @param {number} concentrationCharge
 * @returns {{undiversified, diversified}}
 */
function calcMarketRisk(equityCharge, propertyCharge, counterpartyCharge,
                        currencyCharge = 0, concentrationCharge = 0) {
  const charges = [equityCharge, propertyCharge, counterpartyCharge,
                   currencyCharge, concentrationCharge];
  const corr = [
    [1,    0.75, 0.75, 0.5, 0.5],
    [0.75, 1,    0.5,  0.5, 0.5],
    [0.75, 0.5,  1,    0.5, 0.5],
    [0.5,  0.5,  0.5,  1,   0.5],
    [0.5,  0.5,  0.5,  0.5, 1  ]
  ];
  let diversified = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      diversified += corr[i][j] * charges[i] * charges[j];
    }
  }
  const undiversified = charges.reduce((a, b) => a + b, 0);
  return { undiversified, diversified: Math.sqrt(diversified) };
}

/**
 * Non-Life Underwriting Risk — Premium & Reserve Risk
 * ZICARP TS-6 — Factor-based approach
 *
 * PremiumRiskCharge = σ_prem × V_prem
 * where V_prem = max(Net Earned Premium, Net Written Premium previous year)
 * Standard deviation σ_prem calibrated per line of business
 *
 * ClaimsRiskCharge  = σ_res × V_res
 * where V_res = Net Best Estimate Claims Reserve
 *
 * @param {Array<{lob, nep, reserve, sigmaPrem, sigmaRes}>} lines
 * @returns {{premRisk, claimsRisk, catRisk, undiversified, diversified}}
 */
function calcNLUnderwritingRisk(lines) {
  // LOB-specific standard deviations (ZICARP defaults)
  const sigmaPrem = {
    farming: 0.17, engineering: 0.17, liability: 0.15,
    motor: 0.10, accident: 0.14, fire: 0.10, other: 0.15
  };
  const sigmaRes  = {
    farming: 0.08, engineering: 0.11, liability: 0.09,
    motor: 0.09,   accident: 0.10,   fire: 0.10, other: 0.11
  };

  let premVar = 0, resVar = 0, premResCovar = 0;

  for (const line of lines) {
    const lob   = line.lob?.toLowerCase() ?? 'other';
    const sp    = line.sigmaPrem ?? sigmaPrem[lob] ?? 0.15;
    const sr    = line.sigmaRes  ?? sigmaRes[lob]  ?? 0.10;
    const vPrem = line.nep   * sp;
    const vRes  = line.reserve * sr;
    premVar     += vPrem ** 2;
    resVar      += vRes  ** 2;
    premResCovar += 0.5 * vPrem * vRes;  // corr = 0.5
  }

  const premRisk   = Math.sqrt(premVar);
  const claimsRisk = Math.sqrt(resVar);
  const catRisk    = premRisk * 0.15;    // catastrophe = 15% of premium risk (simplified)

  // Diversification matrix: Premium/Reserve corr = 0.25; with Cat corr = 0
  const diversified = Math.sqrt(
    premRisk**2 + claimsRisk**2 + catRisk**2
    + 2*0.25*premRisk*claimsRisk
  );
  return {
    premRisk, claimsRisk, catRisk,
    undiversified: premRisk + claimsRisk + catRisk,
    diversified
  };
}

/**
 * Operational Risk Capital Charge
 * ZICARP TS-6 — Earnings-based approach
 *
 * OpRisk = max(0.03 × BSCR, factor × earned_premiums)
 * Factor = 3% of earned premiums (simplified)
 *
 * @param {number} bscr
 * @param {number} earnedPremiums
 * @returns {number}
 */
function calcOperationalRisk(bscr, earnedPremiums) {
  const epsBasedCharge  = 0.03 * earnedPremiums;
  const bscrBasedCharge = 0.03 * bscr;
  return Math.max(bscrBasedCharge, epsBasedCharge);
}

/**
 * Basic Solvency Capital Requirement (BSCR)
 * BSCR = sqrt(C_mkt^2 + C_nl^2 + 2 × ρ_mkt_nl × C_mkt × C_nl)
 * Correlation between Market and NL Underwriting = 0.25
 *
 * @param {number} marketRisk
 * @param {number} nlUnderwriting
 * @returns {number}
 */
function calcBSCR(marketRisk, nlUnderwriting) {
  const corr = 0.25;
  return Math.sqrt(
    marketRisk**2 + nlUnderwriting**2 + 2*corr*marketRisk*nlUnderwriting
  );
}

/**
 * Solvency Capital Requirement (SCR)
 * SCR = BSCR + OpRisk
 * Source: ZICARP TS-6 Section 4
 */
function calcSCR(bscr, opRisk) {
  return bscr + opRisk;
}

/**
 * Minimum Capital Requirement (MCR)
 * MCR = max(AMCR, 0.25 × SCR, MCR_floor)
 *
 * MCR_component (per line) = max(a × TP_net, b × NEP_net)
 *   a = 20% (Farming/Liability/Accident), 14% (Engineering/Fire), 13% (Motor)
 *   b = 17% (Farming/Accident), 14% (Engineering/Fire), 11% (Motor), 14% (Liability)
 *
 * @param {number} scr         Calculated SCR
 * @param {number} amcr        Absolute Minimum Capital Requirement (ZICARP mandated)
 * @param {Array}  lines       [{lob, netTP, nep}]
 * @returns {{mcrComponents, mcr, mcrCover, scrCover}}
 */
function calcMCR(scr, amcr, lines, ownFunds) {
  const aFactors = { farming:0.20, engineering:0.14, liability:0.20, motor:0.13, accident:0.20, fire:0.14 };
  const bFactors = { farming:0.17, engineering:0.13, liability:0.14, motor:0.11, accident:0.17, fire:0.13 };

  let mcrLinear = 0;
  const mcrComponents = [];
  for (const line of lines) {
    const lob = line.lob?.toLowerCase() ?? 'other';
    const a   = aFactors[lob] ?? 0.18;
    const b   = bFactors[lob] ?? 0.15;
    const component = Math.max(a * (line.netTP ?? 0), b * (line.nep ?? 0));
    mcrComponents.push({ lob, component });
    mcrLinear += component;
  }

  const mcrFloor = 0.25 * scr;
  const mcr      = Math.max(amcr, mcrFloor, mcrLinear);

  return {
    mcrComponents,
    mcrLinear,
    mcr,
    mcrCover: ownFunds / mcr,
    scrCover: ownFunds / scr
  };
}

/**
 * Own Funds Tiering Assessment
 * Tier 1: Ordinary share capital + retained earnings + reconciliation reserve
 * Tier 2/3: Subordinated instruments (none currently)
 * Source: ZICARP TS-1; IPEC Circular 7/2023
 *
 * @param {object} components {shareCapital, retainedEarnings, reconReserve, other}
 * @returns {{tier1, tier2, tier3, totalBOF, eligible}}
 */
function calcOwnFunds(components) {
  const tier1 = (components.shareCapital  ?? 0)
              + (components.retainedEarnings ?? 0)
              + (components.reconReserve  ?? 0)
              + (components.other ?? 0);
  const tier2 = components.tier2 ?? 0;
  const tier3 = components.tier3 ?? 0;

  // Tiering limits: Tier 1 ≥ 50% of SCR; Tier 3 ≤ 15% of SCR
  const totalBOF = tier1 + tier2 + tier3;
  return { tier1, tier2, tier3, totalBOF, eligible: tier1 };
}

/**
 * Admissible Assets — ZICARP Inadmissibility Rules
 * Inadmissible: goodwill, deferred tax assets, intangibles,
 *               own-use non-investment property, furniture, IT systems,
 *               motor vehicles (operational assets)
 *
 * @param {object} assets   Full asset schedule
 * @returns {{admissible, inadmissible, inadmissibleItems}}
 */
function calcAdmissibleAssets(assets) {
  const inadmissibleKeys = [
    'goodwill','deferredTaxAssets','intangibles','itSystems',
    'furniture','motorVehicles','otherOperatingAssets'
  ];
  let inadmissible = 0;
  const inadmissibleItems = {};
  for (const key of inadmissibleKeys) {
    if (assets[key]) {
      inadmissible += assets[key];
      inadmissibleItems[key] = assets[key];
    }
  }
  const total = Object.values(assets).reduce((a, b) => a + b, 0);
  return { admissible: total - inadmissible, inadmissible, inadmissibleItems, total };
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — REINSURANCE ADEQUACY ASSESSMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Reinsurance Efficiency Ratios
 * Source: ZICARP TS-5; AFR Section 7
 *
 * RecoveryRatio  = Claims Recoveries / RI Premiums  (want > 20% ideally)
 * RetentionRatio = NWP / GWP                        (should be risk-appropriate)
 * NetToGross     = Net Claims / Gross Claims
 *
 * @param {object} ri  {gwp, nwp, riPremium, grossClaims, netClaims, recoveries}
 * @returns {{retentionRatio, recoveryRatio, netToGross, efficiency}}
 */
function calcReinsuranceAdequacy(ri) {
  const retentionRatio = ri.nwp / (ri.gwp || 1);
  const recoveryRatio  = ri.recoveries / (ri.riPremium || 1);
  const netToGross     = ri.netClaims / (ri.grossClaims || 1);

  let efficiency;
  if (recoveryRatio < 0.05)       efficiency = 'underutilised';
  else if (recoveryRatio < 0.20)  efficiency = 'moderate';
  else                             efficiency = 'adequate';

  return { retentionRatio, recoveryRatio, netToGross, efficiency };
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — MARKOV REGIME-SWITCHING MODEL
// ═══════════════════════════════════════════════════════════════════

/**
 * Markov Chain State Probabilities
 * P(t+1) = P(t) × Π   where Π is the transition matrix
 *
 * Stationary distribution: π = π × Π
 * Source: Hamilton (1989); Dissertation Chapter 3 Research Design
 *
 * @param {Array<Array<number>>} transitionMatrix  3×3 row-stochastic matrix
 * @param {Array<number>}        currentState       Current regime probabilities
 * @param {number}               steps              Number of steps ahead
 * @returns {Array<number>} State probabilities after 'steps' transitions
 */
function markovNextState(transitionMatrix, currentState, steps = 1) {
  let state = [...currentState];
  for (let s = 0; s < steps; s++) {
    const next = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        next[j] += state[i] * transitionMatrix[i][j];
      }
    }
    state = next;
  }
  return state;
}

/**
 * Stationary Distribution of Markov Chain (long-run regime probs)
 * Solved by power iteration: π = lim_{n→∞} π₀ × Π^n
 *
 * @param {Array<Array<number>>} transitionMatrix
 * @param {number} iterations  (default 1000)
 * @returns {Array<number>} Stationary probabilities [π₁, π₂, π₃]
 */
function markovStationary(transitionMatrix, iterations = 1000) {
  let state = [1/3, 1/3, 1/3];   // uniform start
  for (let i = 0; i < iterations; i++) {
    state = markovNextState(transitionMatrix, state, 1);
  }
  return state;
}

/**
 * Regime-Dependent Expected Asset Return
 * E[R|regime] = Σ_i w_i × μ_i(regime)
 *
 * @param {object} allocation  {property, equity, bond, money_market, gold, other}
 * @param {number} regime      0=stable, 1=volatile, 2=crisis
 * @returns {number} Expected portfolio return
 */
function regimeExpectedReturn(allocation, regime) {
  const returns = {
    property:     [0.124, 0.068, -0.152],
    equity:       [0.186, 0.094, -0.284],
    bond:         [0.095, 0.121,  0.086],
    money_market: [0.082, 0.116,  0.148],
    gold:         [0.061, 0.143,  0.227],
    other:        [0.030, 0.030,  0.020]
  };
  let ret = 0;
  let totalAlloc = 0;
  for (const [asset, pct] of Object.entries(allocation)) {
    const r = returns[asset]?.[regime] ?? returns.other[regime];
    ret += pct * r;
    totalAlloc += pct;
  }
  return totalAlloc > 0 ? ret / totalAlloc : 0;
}

/**
 * Regime-Dependent Return Volatility (standard deviation)
 * Source: Dissertation Section 7.2 — Simulation Modelling
 *
 * @param {object} allocation
 * @param {number} regime
 * @returns {number} Portfolio volatility
 */
function regimeReturnVolatility(allocation, regime) {
  const vols = {
    property:     [0.08,  0.12,  0.25],
    equity:       [0.15,  0.22,  0.40],
    bond:         [0.04,  0.06,  0.09],
    money_market: [0.02,  0.03,  0.05],
    gold:         [0.10,  0.14,  0.18],
    other:        [0.03,  0.05,  0.08]
  };
  // Simplified variance: assumes moderate correlation = 0.5
  let portfolioVar = 0;
  for (const [assetA, pctA] of Object.entries(allocation)) {
    for (const [assetB, pctB] of Object.entries(allocation)) {
      const sigA = vols[assetA]?.[regime] ?? 0.05;
      const sigB = vols[assetB]?.[regime] ?? 0.05;
      const corr = assetA === assetB ? 1.0 : 0.50;
      portfolioVar += pctA * pctB * sigA * sigB * corr;
    }
  }
  return Math.sqrt(portfolioVar);
}

/**
 * Unconditional Expected Return (integrating over all regimes)
 * E[R] = Σ_r π_r × E[R|r]
 *
 * @param {object}         allocation    Asset weights
 * @param {Array<number>}  regimeProbs   [π_stable, π_volatile, π_crisis]
 * @returns {number}
 */
function unconditionalExpectedReturn(allocation, regimeProbs) {
  return regimeProbs.reduce(
    (sum, prob, regime) => sum + prob * regimeExpectedReturn(allocation, regime), 0
  );
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — ALM OPTIMISER (Surplus Volatility Minimisation)
// ═══════════════════════════════════════════════════════════════════

/**
 * Surplus = Assets − Liabilities
 * Surplus Volatility = Var(A) + Var(L) − 2×Cov(A,L)
 * Source: Dissertation Objective Function; Di Francesco & Simonella (2023)
 *
 * @param {number} assets         Total admissible assets
 * @param {number} assetVolatility  Standard deviation of asset returns
 * @param {number} liabilities     Technical provisions
 * @param {number} liabVolatility   Standard deviation of claims inflation
 * @param {number} correlation      Asset-liability correlation
 * @returns {{surplus, surplusVol, surplusVaR}}
 */
function calcSurplusMetrics(assets, assetVolatility, liabilities, liabVolatility, correlation = 0.2) {
  const surplus     = assets - liabilities;
  const varA        = (assets      * assetVolatility) ** 2;
  const varL        = (liabilities * liabVolatility)  ** 2;
  const covAL       = 2 * correlation * assets * assetVolatility * liabilities * liabVolatility;
  const surplusVar  = varA + varL - covAL;
  const surplusVol  = Math.sqrt(Math.max(0, surplusVar));
  // VaR at 99.5% (z = 2.576)
  const surplusVaR  = surplus - 2.576 * surplusVol;
  return { surplus, surplusVol, surplusVaR };
}

/**
 * Duration Mismatch (Macaulay Duration Gap)
 * DurationGap = D_A − (L/A) × D_L
 * Source: IFRS 17 discount rate sensitivity; Dissertation Section 6
 *
 * @param {number} durationAssets     Weighted avg asset duration (years)
 * @param {number} durationLiabilities Weighted avg liability duration (years)
 * @param {number} assets
 * @param {number} liabilities
 * @returns {{durationGap, interestRateSensitivity}}
 */
function calcDurationGap(durationAssets, durationLiabilities, assets, liabilities) {
  const leverage       = liabilities / assets;
  const durationGap    = durationAssets - leverage * durationLiabilities;
  // Change in surplus per 1% rise in interest rates
  const interestRateSensitivity = -durationGap * assets * 0.01;
  return { durationGap, interestRateSensitivity };
}

/**
 * Liquidity Coverage Ratio
 * LCR = Liquid Assets / Short-Term Obligations (≤90 days)
 * Target: LCR ≥ 1.0 (100%)
 * Source: ZICARP liquidity requirements
 *
 * @param {object} assets      Asset schedule with liquidity tags
 * @param {number} stLiabs     Short-term liabilities (<90 days)
 * @returns {{lcr, liquidAssets, shortfallOrSurplus}}
 */
function calcLiquidityCoverage(assets, stLiabs) {
  // Liquidity haircuts by asset type
  const haircuts = {
    cash: 1.00, money_market: 0.95, gold: 0.85,
    equity: 0.80, bond: 0.90, property: 0.05,
    receivables: 0.50
  };
  let liquidAssets = 0;
  for (const [type, value] of Object.entries(assets)) {
    liquidAssets += value * (haircuts[type] ?? 0.50);
  }
  const lcr = liquidAssets / (stLiabs || 1);
  return {
    lcr,
    liquidAssets,
    shortfallOrSurplus: liquidAssets - stLiabs
  };
}

/**
 * Efficient Frontier Point
 * For a given target return, finds the minimum-volatility allocation
 * Uses simplified mean-variance with regime-weighted parameters
 *
 * @param {number}         targetReturn   Desired annualised portfolio return
 * @param {Array<number>}  regimeProbs    Current regime probabilities
 * @returns {{allocation, expectedReturn, volatility, sharpeRatio}}
 */
function efficientFrontierPoint(targetReturn, regimeProbs) {
  // Grid search over property weight (10% to 85%)
  let best = null;
  for (let prop = 10; prop <= 85; prop += 5) {
    for (let eq = 0; eq <= Math.min(30, 95-prop); eq += 5) {
      for (let bond = 0; bond <= Math.min(30, 90-prop-eq); bond += 5) {
        const mm   = Math.max(5, 100 - prop - eq - bond - 5);
        const gold = 100 - prop - eq - bond - Math.max(5, mm);
        if (gold < 0 || gold > 15) continue;

        const alloc = {
          property: prop/100, equity: eq/100,
          bond: bond/100, money_market: mm/100, gold: gold/100
        };
        const ret  = unconditionalExpectedReturn(alloc, regimeProbs);
        if (Math.abs(ret - targetReturn) > 0.01) continue;

        // Weighted volatility across regimes
        const vol = regimeProbs.reduce(
          (v, p, r) => v + p * regimeReturnVolatility(alloc, r), 0
        );
        if (!best || vol < best.volatility) {
          best = { allocation: alloc, expectedReturn: ret, volatility: vol,
                   sharpeRatio: (ret - 0.08) / (vol || 0.001) };
        }
      }
    }
  }
  return best;
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — STRESS TESTING & SCENARIO ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Standard ZICARP Sensitivity Scenarios (AFR Section 5)
 *
 * Scenario 1: Own Funds shocked down by x%
 * Scenario 2: Own Funds shocked up by x%
 *
 * @param {number} scr
 * @param {number} mcr
 * @param {number} ownFunds
 * @param {number} shockPct  e.g. 0.25 for ±25%
 * @returns {{baseline, scenario1, scenario2}}
 */
function calcZICARPStressScenarios(scr, mcr, ownFunds, shockPct = 0.25) {
  const scenarios = {};
  for (const [name, factor] of [['baseline', 1], ['scenario1', 1-shockPct], ['scenario2', 1+shockPct]]) {
    const of = ownFunds * factor;
    scenarios[name] = {
      ownFunds:  of,
      scrCover:  of / scr,
      mcrCover:  of / mcr,
      solvent:   of >= scr,
      meetsMin:  of >= mcr
    };
  }
  return scenarios;
}

/**
 * ALM Regime-Based Stress Scenarios
 * Source: Dissertation Section 7.2 Experimental Evaluation
 *
 * @param {number} totalAssets
 * @param {number} totalLiabilities
 * @param {number} scr
 * @param {number} ownFunds
 * @returns {Array<object>}
 */
function calcALMStressScenarios(totalAssets, totalLiabilities, scr, ownFunds) {
  const propVal = totalAssets * 0.732;  // current property proportion
  const scenarios = [
    {
      name: 'Property values –30%',
      assetShock: -propVal * 0.30,
      liabShock:  totalLiabilities * 0.005,
      description: 'Real estate market collapse'
    },
    {
      name: 'Property values –15%',
      assetShock: -propVal * 0.15,
      liabShock:  totalLiabilities * 0.003,
      description: 'Moderate property correction'
    },
    {
      name: 'Inflation shock +50%',
      assetShock: -totalAssets * 0.003,
      liabShock:  totalLiabilities * 0.10,
      description: 'Claims cost inflation surge'
    },
    {
      name: 'FX devaluation –40%',
      assetShock: -totalAssets * 0.011,
      liabShock:  totalLiabilities * 0.04,
      description: 'ZWG/USD shock'
    },
    {
      name: 'Catastrophic claims +200%',
      assetShock: 0,
      liabShock:  totalLiabilities * 0.05,
      description: 'Catastrophic event (agri/motor)'
    },
    {
      name: 'Combined crisis (Regime 3)',
      assetShock: -totalAssets * 0.24,
      liabShock:  totalLiabilities * 0.08,
      description: 'Full crisis regime realisation'
    }
  ];

  return scenarios.map(s => {
    const newAssets = totalAssets + s.assetShock;
    const newLiabs  = totalLiabilities + s.liabShock;
    const newOF     = Math.max(0, newAssets - newLiabs);
    return {
      ...s,
      newAssets,
      newLiabilities: newLiabs,
      newOwnFunds: newOF,
      scrCover: +(newOF / scr).toFixed(3),
      solvent:   newOF >= scr,
      capitalDeficit: Math.max(0, scr - newOF)
    };
  });
}

/**
 * Property Value Sensitivity to SCR Cover
 * Sweeps property value change from -50% to +30%
 *
 * @param {number} baseAssets
 * @param {number} liabilities
 * @param {number} scr
 * @param {number} propProportion  Current property as fraction of total assets
 * @returns {Array<{shock, newAssets, ownFunds, scrCover}>}
 */
function propertySensitivityAnalysis(baseAssets, liabilities, scr, propProportion = 0.732) {
  const shocks = [-0.50,-0.45,-0.40,-0.35,-0.30,-0.25,-0.20,-0.15,-0.10,-0.05,0,0.05,0.10,0.15,0.20,0.30];
  return shocks.map(shock => {
    const propVal  = baseAssets * propProportion;
    const newAssets = baseAssets + propVal * shock;
    const ownFunds  = Math.max(0, newAssets - liabilities);
    return {
      shock:    shock * 100,
      newAssets,
      ownFunds,
      scrCover: +(ownFunds / scr).toFixed(3)
    };
  });
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 7 — STOCHASTIC SURPLUS PROJECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Monte Carlo Surplus Projection
 * Simulates N paths of surplus over T years using regime-switching model
 * Source: Dissertation Section 7.2; Hamilton (1989); Di Francesco & Simonella (2023)
 *
 * @param {number}         initialSurplus
 * @param {object}         allocation          Asset weights
 * @param {number}         liabilities         Current TP
 * @param {Array<Array>}   transitionMatrix     3×3
 * @param {Array<number>}  initialRegimeProbs
 * @param {number}         T                   Projection horizon (years)
 * @param {number}         N                   Number of simulations
 * @returns {{mean, p5, p25, p75, p95, paths}}
 */
function monteCarloSurplus(initialSurplus, allocation, liabilities,
                           transitionMatrix, initialRegimeProbs,
                           T = 5, N = 1000) {
  // Liability growth assumptions per regime
  const liabGrowth = [0.05, 0.10, 0.20];  // stable, volatile, crisis

  const allPaths = [];

  for (let sim = 0; sim < N; sim++) {
    let surplus = initialSurplus;
    let liabs   = liabilities;
    let regimeProbs = [...initialRegimeProbs];
    const path = [surplus];

    for (let t = 0; t < T; t++) {
      // Sample regime from current probabilities
      const rand = Math.random();
      let regime = 0, cumProb = 0;
      for (let r = 0; r < 3; r++) {
        cumProb += regimeProbs[r];
        if (rand <= cumProb) { regime = r; break; }
      }

      // Asset return in this regime
      const mu  = regimeExpectedReturn(allocation, regime);
      const sig = regimeReturnVolatility(allocation, regime);
      // Box-Muller normal sample
      const z   = Math.sqrt(-2*Math.log(Math.random())) * Math.cos(2*Math.PI*Math.random());
      const assetReturn = mu + sig * z;

      // Liability growth
      const lGrowth = liabGrowth[regime] * (0.5 + Math.random());
      liabs  = liabs * (1 + lGrowth);
      surplus = surplus * (1 + assetReturn) - liabs * lGrowth;

      path.push(+(surplus / 1e6).toFixed(2));   // store in millions

      // Evolve regime probabilities
      regimeProbs = markovNextState(transitionMatrix, regimeProbs, 1);
    }
    allPaths.push(path);
  }

  // Compute statistics at each time step
  const stats = [];
  for (let t = 0; t <= T; t++) {
    const values = allPaths.map(p => p[t]).sort((a,b) => a-b);
    const mean = values.reduce((s,v) => s+v, 0) / N;
    stats.push({
      t,
      mean: +mean.toFixed(2),
      p5:   +values[Math.floor(0.05*N)].toFixed(2),
      p25:  +values[Math.floor(0.25*N)].toFixed(2),
      p75:  +values[Math.floor(0.75*N)].toFixed(2),
      p95:  +values[Math.floor(0.95*N)].toFixed(2)
    });
  }

  return { stats, samplePaths: allPaths.slice(0, 10) };
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 8 — MASTER CALCULATION ENGINE
// Entry point: processes raw data and returns all computed metrics
// ═══════════════════════════════════════════════════════════════════

/**
 * runALMEngine(data) — Full calculation pipeline
 *
 * @param {object} data  Structured company data (see DATA_SCHEMA below)
 * @returns {object}     All computed actuarial, solvency and ALM metrics
 */
function runALMEngine(data) {
  try {
    // Input validation
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure provided');
    }
    
    const { premiums, claims, assets, config } = data;
    
    if (!premiums || !Array.isArray(premiums)) {
      throw new Error('Premiums array is required');
    }
    
    // Validate premium records
    for (const [index, pol] of premiums.entries()) {
      if (!pol.class && !pol.Class) {
        throw new Error(`Premium record ${index + 1} missing class information`);
      }
      if ((pol.gwp ?? pol.GWP) < 0 || (pol.nwp ?? pol.NWP) < 0) {
        throw new Error(`Premium record ${index + 1} contains negative values`);
      }
    }

  // ── 1. Premium aggregation by class ──────────────────────────────
  const classSummary = {};
  for (const pol of (premiums || [])) {
    const cls = pol.class || pol.Class || 'Other';
    if (!classSummary[cls]) {
      classSummary[cls] = { gwp:0, nwp:0, ri:0, grossUPR:0, netUPR:0, count:0 };
    }
    const s = classSummary[cls];
    s.gwp      += pol.gwp  ?? pol.GWP  ?? 0;
    s.nwp      += pol.nwp  ?? pol.NWP  ?? 0;
    s.ri       += pol.ri   ?? pol.RI   ?? 0;
    s.grossUPR += pol.grossUPR ?? pol['Gross UPR'] ?? 0;
    s.netUPR   += pol.netUPR   ?? pol['Net UPR']   ?? 0;
    s.count    += 1;
  }

  // ── 2. Claims aggregation ─────────────────────────────────────────
  const claimsSummary = { totalZWL:0, totalUSD:0, count:0, avgLagDays:0 };
  let lagSum = 0, lagCount = 0;
  for (const cl of (claims?.paid || [])) {
    claimsSummary.totalZWL += +(cl.zwl ?? cl.ZWL ?? 0);
    claimsSummary.totalUSD += +(cl.usd ?? cl.USD ?? 0);
    claimsSummary.count    += 1;
    if (cl.datePaid && cl.reported) {
      const lag = (new Date(cl.datePaid) - new Date(cl.reported)) / 86400000;
      if (lag >= 0) { lagSum += lag; lagCount++; }
    }
  }
  claimsSummary.avgLagDays = lagCount > 0 ? +(lagSum/lagCount).toFixed(1) : 0;

  const totalGWP = Object.values(classSummary).reduce((s,c)=>s+c.gwp,0);
  const totalNWP = Object.values(classSummary).reduce((s,c)=>s+c.nwp,0);
  const totalRI  = Object.values(classSummary).reduce((s,c)=>s+c.ri,0);

  // ── 3. Technical Provisions ───────────────────────────────────────
  const ibnrPct   = config?.ibnrPct  ?? 0.05;
  const provisions = {};
  for (const [cls, s] of Object.entries(classSummary)) {
    const ibnr   = calcIBNR(s.nwp, s.gwp, ibnrPct);
    const upr    = { gross: s.grossUPR, net: s.netUPR };
    const crData = config?.combinedRatios?.[cls];
    const cr     = crData?.combined ?? 1.0;
    const ocr    = config?.ocr?.[cls] ?? { gross: 0, net: 0 };
    const raType = ['motor','liability'].includes(cls.toLowerCase()) ? cls.toLowerCase() : 'other';
    const ra     = calcRiskAdjustment(ibnr.gross, ocr.gross, raType);
    const lossComp = calcLossComponent(upr.gross, cr);
    const lic    = calcLIC(ocr, ibnr, ra);
    const lrc    = calcLRC(upr, 0, lossComp);
    provisions[cls] = {
      ibnr, ocr, upr, ra, lossComponent: lossComp,
      lic, lrc,
      total: calcTechnicalProvisions(lic, lrc),
      combinedRatio: cr
    };
  }
  const totalGrossTP = Object.values(provisions).reduce((s,p)=>s+(p.total?.gross??0),0);
  const totalNetTP   = Object.values(provisions).reduce((s,p)=>s+(p.total?.net??0),0);

  // ── 4. Admissible Assets ──────────────────────────────────────────
  const assetSchedule = assets?.schedule ?? {};
  const admissibility = calcAdmissibleAssets(assetSchedule);
  const totalAdmissible = admissibility.admissible;

  // ── 5. Own Funds ──────────────────────────────────────────────────
  const ownFundsData = calcOwnFunds(assets?.ownFunds ?? {});
  const ownFunds = ownFundsData.eligible;

  // ── 6. SCR ────────────────────────────────────────────────────────
  const inv = assets?.investments ?? {};
  const eqRisk    = calcEquityRisk(inv.listedEquity ?? 0, inv.unlistedEquity ?? 0);
  const propRisk  = calcPropertyRisk(inv.property ?? 0);
  const cpRisk    = calcCounterpartyDefaultRisk(
    assets?.cat1Exposures ?? [],
    assets?.cat2Receivables ?? []
  );
  const concRisk  = calcConcentrationRisk(
    assets?.concentrationExposures ?? [],
    totalAdmissible
  );
  const mktRisk   = calcMarketRisk(eqRisk, propRisk, cpRisk.total, 0, concRisk);

  const nlLines = Object.entries(classSummary).map(([lob, s]) => ({
    lob,
    nep:     s.nwp,
    reserve: provisions[lob]?.lic?.gross ?? 0
  }));
  const nlRisk  = calcNLUnderwritingRisk(nlLines);
  const bscr    = calcBSCR(mktRisk.diversified, nlRisk.diversified);
  const opRisk  = calcOperationalRisk(bscr, totalNWP);
  const scr     = calcSCR(bscr, opRisk);

  // ── 7. MCR ────────────────────────────────────────────────────────
  const mcrLines = Object.entries(classSummary).map(([lob, s]) => ({
    lob,
    nep:   s.nwp,
    netTP: provisions[lob]?.total?.net ?? 0
  }));
  const amcr = config?.amcr ?? 38697750;
  const mcrResult = calcMCR(scr, amcr, mcrLines, ownFunds);

  // ── 8. Solvency Ratios ────────────────────────────────────────────
  const solvencyRatio  = totalAdmissible / (totalGrossTP + (admissibility.total - totalAdmissible));

  // ── 9. Reinsurance adequacy per class ────────────────────────────
  const reinsAdequacy = {};
  for (const [cls, s] of Object.entries(classSummary)) {
    reinsAdequacy[cls] = calcReinsuranceAdequacy({
      gwp: s.gwp, nwp: s.nwp, riPremium: s.ri,
      grossClaims: config?.grossClaims?.[cls] ?? 0,
      netClaims:   config?.netClaims?.[cls]   ?? 0,
      recoveries:  config?.recoveries?.[cls]  ?? 0
    });
  }

  // ── 10. Regime Model ──────────────────────────────────────────────
  const PI = config?.transitionMatrix ?? [
    [0.72, 0.22, 0.06],
    [0.18, 0.64, 0.18],
    [0.08, 0.35, 0.57]
  ];
  const currentRegimeProbs   = config?.currentRegimeProbs ?? [0.22, 0.61, 0.17];
  const stationaryProbs      = markovStationary(PI);
  const regime1YrProbs       = markovNextState(PI, currentRegimeProbs, 4); // 4 quarters

  // ── 11. ALM Metrics ───────────────────────────────────────────────
  const currentAllocation = config?.allocation ?? { property:0.73,equity:0.01,bond:0,money_market:0.01,gold:0.01,other:0.24 };
  const currentRegime = currentRegimeProbs.indexOf(Math.max(...currentRegimeProbs));
  const assetVol      = regimeReturnVolatility(currentAllocation, currentRegime);
  const expReturn     = regimeExpectedReturn(currentAllocation, currentRegime);
  const uncondReturn  = unconditionalExpectedReturn(currentAllocation, currentRegimeProbs);

  const surplusMetrics = calcSurplusMetrics(
    totalAdmissible, assetVol,
    totalGrossTP, 0.10,
    0.20
  );

  const liquidityResult = calcLiquidityCoverage(
    { cash: inv.cash??0, money_market: inv.moneyMarket??0, gold: inv.gold??0,
      equity: inv.listedEquity??0, property: inv.property??0,
      receivables: (inv.receivables??0) * 0.5 },
    config?.shortTermLiabilities ?? totalGrossTP * 0.60
  );

  const durationResult = calcDurationGap(
    config?.assetDuration  ?? 9.5,
    config?.liabDuration   ?? 0.8,
    totalAdmissible,
    totalGrossTP
  );

  // ── 12. Stress Scenarios ──────────────────────────────────────────
  const totalLiabs = totalGrossTP + (config?.nonTechLiabilities ?? 0);
  const zicarpStress = calcZICARPStressScenarios(scr, mcrResult.mcr, ownFunds);
  const almStress    = calcALMStressScenarios(totalAdmissible, totalLiabs, scr, ownFunds);
  const propSensitivity = propertySensitivityAnalysis(totalAdmissible, totalLiabs, scr);

  // ── Return compiled results ───────────────────────────────────────
  return {
    summary: {
      totalGWP, totalNWP, totalRI,
      totalAdmissible, totalGrossTP, totalNetTP, ownFunds,
      scr, bscr, opRisk, mcr: mcrResult.mcr,
      scrCover: mcrResult.scrCover, mcrCover: mcrResult.mcrCover,
      solvencyRatio
    },
    classSummary,
    provisions,
    admissibility,
    ownFundsData,
    scrComponents: { equity: eqRisk, property: propRisk, counterparty: cpRisk.total,
                     concentration: concRisk, market: mktRisk, nlUnderwriting: nlRisk,
                     operational: opRisk, bscr, scr },
    mcrResult,
    reinsAdequacy,
    regimeModel: { PI, currentRegimeProbs, stationaryProbs, regime1YrProbs },
    almMetrics: { expReturn, uncondReturn, assetVol, surplusMetrics, liquidityResult, durationResult },
    stressTests: { zicarp: zicarpStress, alm: almStress, propertySensitivity },
    claimsSummary
  };
  } catch (error) {
    console.error('Error in runALMEngine:', error.message);
    return {
      error: error.message,
      summary: { totalGWP: 0, totalNWP: 0, totalRI: 0, scrCover: 0, mcrCover: 0 },
      classSummary: {},
      provisions: {},
      admissibility: { admissible: 0, inadmissible: 0 },
      ownFundsData: { eligible: 0 },
      scrComponents: { scr: 0 },
      mcrResult: { mcr: 0, scrCover: 0, mcrCover: 0 },
      reinsAdequacy: {},
      regimeModel: { currentRegimeProbs: [0, 0, 0] },
      almMetrics: {},
      stressTests: {},
      claimsSummary: {}
    };
  }
}


// ═══════════════════════════════════════════════════════════════════
// SECTION 9 — DATA SCHEMA DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════

/**
 * DATA_SCHEMA — Expected input format for runALMEngine()
 *
 * The system accepts data from the XLSX upload (premium, claims, ZICARP)
 * or manual entry. Minimum required: premiums array.
 *
 * {
 *   premiums: [                          ← from "Premium Data" sheet
 *     { class, gwp, nwp, ri, grossUPR, netUPR, incept, expire },
 *     ...
 *   ],
 *   claims: {
 *     paid: [                            ← from "Claims Paid" sheet
 *       { dol, reported, datePaid, type, zwl, usd, reinsurance, riZwl }
 *     ],
 *     outstanding: [                     ← from "Outstanding Claims" sheet
 *       { occurDate, currency, claimAmount, grossInc, netInc }
 *     ]
 *   },
 *   assets: {
 *     schedule: {                        ← from Balance Sheet / ZICARP QRT
 *       investmentProperty, listedEquity, unlistedEquity,
 *       gold, moneyMarket, cash, bonds, receivables,
 *       goodwill, deferredTaxAssets, intangibles, itSystems,
 *       furniture, motorVehicles, otherOperatingAssets
 *     },
 *     investments: {                     ← same as schedule (used for SCR)
 *       property, listedEquity, gold, moneyMarket, cash, receivables
 *     },
 *     ownFunds: {                        ← from Own Funds sheet
 *       shareCapital, retainedEarnings, reconReserve
 *     },
 *     cat1Exposures: [                   ← reinsurance counterparties
 *       { name, exposure, lgd, pd }
 *     ],
 *     cat2Receivables: [                 ← insurance debtors
 *       { name, amount, daysDelay }
 *     ],
 *     concentrationExposures: [
 *       { description, value, ct, lgdFactor }
 *     ]
 *   },
 *   config: {
 *     ibnrPct:            0.05,          ← IBNR as % of premium
 *     amcr:               38697750,      ← ZICARP absolute MCR
 *     transitionMatrix:   [[...],...],   ← 3×3 Markov matrix
 *     currentRegimeProbs: [0.22,0.61,0.17],
 *     allocation: { property, equity, bond, money_market, gold, other },
 *     combinedRatios: { Agriculture:{combined:0.52}, ... },
 *     ocr: { Agriculture:{gross:X, net:Y}, ... },
 *     recoveries: { Agriculture: X, ... },
 *     shortTermLiabilities: number,
 *     nonTechLiabilities:   number,
 *     assetDuration:        9.5,
 *     liabDuration:         0.8
 *   }
 * }
 */
const DATA_SCHEMA = {}; // documentation only


// ═══════════════════════════════════════════════════════════════════
// EXPORTS (Node.js / browser compatible)
// ═══════════════════════════════════════════════════════════════════

const ZWALMEngine = {
  // Export the engine as both ZWALMEngine and a property of itself
  ZWALMEngine: null, // Will be set below
  // Technical Provisions
  calcIBNR, calcUPR, calcRiskAdjustment, calcLIC, calcIACF,
  calcLossComponent, calcLRC, calcTechnicalProvisions, calcCombinedRatio,

  // SCR
  calcEquityRisk, calcPropertyRisk, calcCounterpartyDefaultRisk,
  calcConcentrationRisk, calcMarketRisk, calcNLUnderwritingRisk,
  calcOperationalRisk, calcBSCR, calcSCR, calcMCR,

  // Own Funds & Assets
  calcOwnFunds, calcAdmissibleAssets,

  // Reinsurance
  calcReinsuranceAdequacy,

  // Regime Model
  markovNextState, markovStationary, regimeExpectedReturn,
  regimeReturnVolatility, unconditionalExpectedReturn,

  // ALM
  calcSurplusMetrics, calcDurationGap, calcLiquidityCoverage,
  efficientFrontierPoint,

  // Stress Testing
  calcZICARPStressScenarios, calcALMStressScenarios,
  propertySensitivityAnalysis,

  // Monte Carlo
  monteCarloSurplus,

  // Master engine
  runALMEngine
};

// Self-reference for consistency
ZWALMEngine.ZWALMEngine = ZWALMEngine;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZWALMEngine;
} else if (typeof window !== 'undefined') {
  window.ZWALMEngine = ZWALMEngine;
}
