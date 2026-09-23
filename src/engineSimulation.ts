/**
 * High-precision Client-Side Simulation of the AirpulsePipelineEngine.
 * Mirrors the exact econometric and statistical algorithms of engine.py:
 * - DGCA Volume Weights: DEL-BLR (0.40), BLR-DEL (0.35), DEL-BOM (0.25)
 * - Base Reference: P0 = 4500.0 INR
 * - Granular Decomposition: 78% Base Fare / 22% Taxes & Fees
 * - Rolling Z-Score Outlier Filter (|Z| > 2.5) & Luxury Cap (INR 28,000)
 * - AI Synthetic Shadow Price Matrix
 */

export interface FlightRecord {
  id: string;
  timestamp: string;
  sector: "DEL-BLR" | "BLR-DEL" | "DEL-BOM";
  origin: string;
  destination: string;
  horizon: "T+1" | "T+7" | "T+15" | "T+30" | "T+45";
  days_ahead: number;
  travel_date: string;
  airline: string;
  flight_number: string;
  raw_price: number;
  base_fare_inr: number;
  taxes_fees_udf_inr: number;
  total_fare_inr: number;
  is_synthetic: boolean;
  capture_method: "playwright_shadow_dom" | "calibrated_market_feed" | "econometric_shadow_matrix";
  z_score?: number;
  is_rejected?: boolean;
  rejection_reason?: string;
}

export interface SectorMetric {
  sector: "DEL-BLR" | "BLR-DEL" | "DEL-BOM";
  dgca_weight: number;
  current_mean_fare_inr: number;
  base_reference_price_inr: number;
  sector_price_relative: number;
  weighted_contribution: number;
  records_count: number;
}

export interface PipelineSummary {
  index_name: string;
  problem_statement: string;
  calculation_timestamp: string;
  base_reference_p0: number;
  apix_index_value: number;
  weighted_mean_fare_inr: number;
  inflation_deflation_delta_pct: number;
  total_valid_records: number;
  sectors_monitored_count: number;
  imputed_records_count: number;
  rejected_records_count: number;
  sector_breakdown: Record<string, SectorMetric>;
  lead_time_elasticity_curve: Record<string, Record<string, number>>;
  decomposition_summary: {
    base_fare_share_pct: number;
    taxes_fees_udf_share_pct: number;
    mean_base_fare_inr: number;
    mean_taxes_fees_udf_inr: number;
  };
}

export interface HistoricalRun {
  runIndex: number;
  runLabel: string;
  timestamp: string;
  displayTime: string;
  apixIndex: number;
  weightedMeanFare: number;
  inflationDeltaPct: number;
  upperVolatilityBound: number;
  lowerVolatilityBound: number;
  validRecordsCount: number;
  anomalyCleansedCount: number;
  runOverRunDelta: number;
  sectorBreakdown?: Record<string, {
    meanFare: number;
    priceRelativeIndex: number;
    recordsCount: number;
  }>;
}

export const BASE_REFERENCE_PRICE_P0 = 4500.0;
export const DECOMPOSITION_BASE_RATIO = 0.78;
export const DECOMPOSITION_TAX_RATIO = 0.22;
export const OUTLIER_ZSCORE_THRESHOLD = 2.5;
export const LUXURY_FARE_CAP_INR = 28000.0;

export const DGCA_SECTOR_WEIGHTS: Record<string, number> = {
  "DEL-BLR": 0.40,
  "BLR-DEL": 0.35,
  "DEL-BOM": 0.25
};

export const BOOKING_HORIZONS: Record<string, number> = {
  "T+1": 1,
  "T+7": 7,
  "T+15": 15,
  "T+30": 30,
  "T+45": 45
};

export const SYNTHETIC_SHADOW_MATRIX: Record<string, Record<string, number>> = {
  "DEL-BLR": { "T+1": 8900.0, "T+7": 6400.0, "T+15": 5200.0, "T+30": 4650.0, "T+45": 4350.0 },
  "BLR-DEL": { "T+1": 8750.0, "T+7": 6250.0, "T+15": 5100.0, "T+30": 4550.0, "T+45": 4250.0 },
  "DEL-BOM": { "T+1": 7950.0, "T+7": 5800.0, "T+15": 4850.0, "T+30": 4300.0, "T+45": 4100.0 }
};

const AIRLINES = ["IndiGo", "Air India", "Vistara", "Akasa Air", "SpiceJet"];

/**
 * Generates calibrated market samples and runs the full cleaning, decomposition,
 * imputation, and Laspeyres calculation pipeline.
 */
export function runAirpulseSimulation(scenarioMultiplier: number = 1.0): {
  summary: PipelineSummary;
  records: FlightRecord[];
  rejectedRecords: FlightRecord[];
} {
  const now = new Date();
  const timestamp = now.toISOString();
  const allRawRecords: FlightRecord[] = [];
  let recordId = 1;

  // 1. Extraction Loop across sectors and horizons
  for (const [sector, weight] of Object.entries(DGCA_SECTOR_WEIGHTS)) {
    const [origin, destination] = sector.split("-") as ["DEL" | "BLR" | "BOM", "DEL" | "BLR" | "BOM"];
    for (const [horizon, daysAhead] of Object.entries(BOOKING_HORIZONS)) {
      const travelDateObj = new Date(now.getTime() + daysAhead * 86400000);
      const travelDate = travelDateObj.toISOString().split("T")[0];
      const baseline = SYNTHETIC_SHADOW_MATRIX[sector][horizon] * scenarioMultiplier;
      const numFlights = Math.floor(8 + Math.random() * 6); // 8-13 flights per cell

      for (let i = 0; i < numFlights; i++) {
        const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
        const flightNum = `${airline.slice(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
        
        // Random price variation around curve (standard deviation ~ 7%)
        const variance = (Math.random() - 0.5) * 2 * (baseline * 0.07);
        let rawPrice = Math.max(2500, Math.round(baseline + variance));

        // Inoculate 6% luxury anomalies
        const isLuxuryAnomaly = Math.random() < 0.06;
        if (isLuxuryAnomaly) {
          rawPrice = Math.round(rawPrice * (2.8 + Math.random() * 1.0));
        }

        allRawRecords.push({
          id: `REC-${recordId++}`,
          timestamp,
          sector: sector as any,
          origin,
          destination,
          horizon: horizon as any,
          days_ahead: daysAhead,
          travel_date: travelDate,
          airline,
          flight_number: flightNum,
          raw_price: rawPrice,
          base_fare_inr: Math.round(rawPrice * DECOMPOSITION_BASE_RATIO * 100) / 100,
          taxes_fees_udf_inr: Math.round(rawPrice * DECOMPOSITION_TAX_RATIO * 100) / 100,
          total_fare_inr: rawPrice,
          is_synthetic: false,
          capture_method: "playwright_shadow_dom"
        });
      }
    }
  }

  // 2. Data Cleaning, Rolling Z-Score & Luxury Cap
  const validRecords: FlightRecord[] = [];
  const rejectedRecords: FlightRecord[] = [];

  // Group by sector and horizon
  const groups: Record<string, FlightRecord[]> = {};
  for (const r of allRawRecords) {
    if (r.raw_price > LUXURY_FARE_CAP_INR) {
      rejectedRecords.push({
        ...r,
        is_rejected: true,
        rejection_reason: `Luxury / Business Class Anomaly (> Cap ₹${LUXURY_FARE_CAP_INR.toLocaleString()})`
      });
      continue;
    }
    const key = `${r.sector}_${r.horizon}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  for (const group of Object.values(groups)) {
    if (group.length < 3) {
      validRecords.push(...group);
      continue;
    }

    const prices = group.map(g => g.raw_price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (prices.length - 1);
    const std = Math.sqrt(variance);

    for (const item of group) {
      if (std < 1e-5) {
        validRecords.push(item);
        continue;
      }
      const z = (item.raw_price - mean) / std;
      const roundedZ = Math.round(z * 100) / 100;
      if (Math.abs(z) <= OUTLIER_ZSCORE_THRESHOLD) {
        validRecords.push({ ...item, z_score: roundedZ });
      } else {
        rejectedRecords.push({
          ...item,
          z_score: roundedZ,
          is_rejected: true,
          rejection_reason: `Statistical Outlier (|Z|=${Math.abs(roundedZ)} > ${OUTLIER_ZSCORE_THRESHOLD})`
        });
      }
    }
  }

  // 3. AI Synthetic Shadow Price Imputation check
  let imputedCount = 0;
  const existingKeys = new Set(validRecords.map(r => `${r.sector}_${r.horizon}`));

  for (const [sector, weight] of Object.entries(DGCA_SECTOR_WEIGHTS)) {
    for (const [horizon, daysAhead] of Object.entries(BOOKING_HORIZONS)) {
      const key = `${sector}_${horizon}`;
      if (!existingKeys.has(key)) {
        const shadow = SYNTHETIC_SHADOW_MATRIX[sector][horizon] * scenarioMultiplier;
        const travelDate = new Date(now.getTime() + daysAhead * 86400000).toISOString().split("T")[0];
        validRecords.push({
          id: `REC-${recordId++}`,
          timestamp,
          sector: sector as any,
          origin: sector.split("-")[0],
          destination: sector.split("-")[1],
          horizon: horizon as any,
          days_ahead: daysAhead,
          travel_date: travelDate,
          airline: "AI-Synthesized Benchmark",
          flight_number: "SHADOW-01",
          raw_price: shadow,
          base_fare_inr: Math.round(shadow * DECOMPOSITION_BASE_RATIO * 100) / 100,
          taxes_fees_udf_inr: Math.round(shadow * DECOMPOSITION_TAX_RATIO * 100) / 100,
          total_fare_inr: shadow,
          is_synthetic: true,
          capture_method: "econometric_shadow_matrix",
          z_score: 0.0
        });
        imputedCount++;
      }
    }
  }

  // 4. Weighted Laspeyres Index Formulation
  const sectorBreakdown: Record<string, SectorMetric> = {};
  let weightedLaspeyresSum = 0;
  let weightedPriceSum = 0;

  for (const [sector, weight] of Object.entries(DGCA_SECTOR_WEIGHTS)) {
    const sectorRows = validRecords.filter(r => r.sector === sector);
    const avgFare = sectorRows.length > 0
      ? sectorRows.reduce((sum, r) => sum + r.total_fare_inr, 0) / sectorRows.length
      : SYNTHETIC_SHADOW_MATRIX[sector]["T+15"];

    const priceRelative = (avgFare / BASE_REFERENCE_PRICE_P0) * 100;
    const weightedContrib = weight * priceRelative;

    weightedLaspeyresSum += weightedContrib;
    weightedPriceSum += weight * avgFare;

    sectorBreakdown[sector] = {
      sector: sector as any,
      dgca_weight: weight,
      current_mean_fare_inr: Math.round(avgFare * 100) / 100,
      base_reference_price_inr: BASE_REFERENCE_PRICE_P0,
      sector_price_relative: Math.round(priceRelative * 100) / 100,
      weighted_contribution: Math.round(weightedContrib * 100) / 100,
      records_count: sectorRows.length
    };
  }

  const finalApix = Math.round(weightedLaspeyresSum * 100) / 100;
  const inflationDelta = Math.round(((weightedPriceSum - BASE_REFERENCE_PRICE_P0) / BASE_REFERENCE_PRICE_P0) * 10000) / 100;

  // Lead-Time Elasticity Curve
  const elasticityCurve: Record<string, Record<string, number>> = {};
  for (const sector of Object.keys(DGCA_SECTOR_WEIGHTS)) {
    elasticityCurve[sector] = {};
    for (const horizon of Object.keys(BOOKING_HORIZONS)) {
      const match = validRecords.filter(r => r.sector === sector && r.horizon === horizon);
      if (match.length > 0) {
        const avg = match.reduce((s, r) => s + r.total_fare_inr, 0) / match.length;
        elasticityCurve[sector][horizon] = Math.round(avg * 100) / 100;
      } else {
        elasticityCurve[sector][horizon] = SYNTHETIC_SHADOW_MATRIX[sector][horizon];
      }
    }
  }

  const summary: PipelineSummary = {
    index_name: "Airpulse APIx (Aviation Price Index)",
    problem_statement: "SIH26056 - NSO & RBI High-Frequency Inflation Modernization",
    calculation_timestamp: timestamp,
    base_reference_p0: BASE_REFERENCE_PRICE_P0,
    apix_index_value: finalApix,
    weighted_mean_fare_inr: Math.round(weightedPriceSum * 100) / 100,
    inflation_deflation_delta_pct: inflationDelta,
    total_valid_records: validRecords.length,
    sectors_monitored_count: Object.keys(DGCA_SECTOR_WEIGHTS).length,
    imputed_records_count: imputedCount,
    rejected_records_count: rejectedRecords.length,
    sector_breakdown: sectorBreakdown,
    lead_time_elasticity_curve: elasticityCurve,
    decomposition_summary: {
      base_fare_share_pct: DECOMPOSITION_BASE_RATIO * 100,
      taxes_fees_udf_share_pct: DECOMPOSITION_TAX_RATIO * 100,
      mean_base_fare_inr: Math.round(weightedPriceSum * DECOMPOSITION_BASE_RATIO * 100) / 100,
      mean_taxes_fees_udf_inr: Math.round(weightedPriceSum * DECOMPOSITION_TAX_RATIO * 100) / 100
    }
  };

  return {
    summary,
    records: validRecords,
    rejectedRecords
  };
}

/**
 * Creates a HistoricalRun instance from a pipeline summary.
 */
export function createHistoricalRunFromSummary(
  summary: PipelineSummary,
  runIndex: number,
  previousApix?: number
): HistoricalRun {
  const apix = summary.apix_index_value;
  const prev = previousApix ?? apix;
  const delta = Math.round((apix - prev) * 100) / 100;
  
  // Standard deviation spread proxy (~1.8 - 2.5 index points)
  const spread = Math.round((apix * 0.022) * 100) / 100;
  const dateObj = new Date(summary.calculation_timestamp);
  const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const sectorBreakdown: Record<string, { meanFare: number; priceRelativeIndex: number; recordsCount: number }> = {};
  if (summary.sector_breakdown) {
    for (const [secKey, secVal] of Object.entries(summary.sector_breakdown)) {
      sectorBreakdown[secKey] = {
        meanFare: secVal.current_mean_fare_inr,
        priceRelativeIndex: Math.round(secVal.sector_price_relative * 10000) / 100,
        recordsCount: secVal.records_count
      };
    }
  }

  return {
    runIndex,
    runLabel: `Run #${runIndex}`,
    timestamp: summary.calculation_timestamp,
    displayTime: timeStr,
    apixIndex: apix,
    weightedMeanFare: summary.weighted_mean_fare_inr,
    inflationDeltaPct: summary.inflation_deflation_delta_pct,
    upperVolatilityBound: Math.round((apix + spread) * 100) / 100,
    lowerVolatilityBound: Math.round((apix - spread) * 100) / 100,
    validRecordsCount: summary.total_valid_records,
    anomalyCleansedCount: summary.rejected_records_count,
    runOverRunDelta: delta,
    sectorBreakdown
  };
}

/**
 * Pre-generates the last 10 historical simulation runs ending with the initial summary.
 */
export function generateInitialHistoricalRuns(currentSummary: PipelineSummary): HistoricalRun[] {
  const now = new Date();
  const runs: HistoricalRun[] = [];
  const baseApix = currentSummary.apix_index_value;

  // Calibrated volatility sequence over the previous 9 intervals
  const deltas = [-3.8, +1.9, -2.4, +4.2, +2.1, -3.1, +1.5, +2.8, -1.2, 0.0];

  for (let i = 0; i < 10; i++) {
    const runNum = i + 1;
    const minutesAgo = (9 - i) * 15;
    const runDate = new Date(now.getTime() - minutesAgo * 60000);
    const timeStr = runDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    
    // Calculate historical index
    let runApix = baseApix + deltas[i];
    runApix = Math.round(runApix * 100) / 100;
    
    const prevApix = i > 0 ? runs[i - 1].apixIndex : runApix;
    const rorDelta = Math.round((runApix - prevApix) * 100) / 100;
    const spread = Math.round((runApix * 0.022) * 100) / 100;
    const weightedFare = Math.round((runApix / 100) * BASE_REFERENCE_PRICE_P0);
    const inflationDelta = Math.round(((weightedFare - BASE_REFERENCE_PRICE_P0) / BASE_REFERENCE_PRICE_P0) * 10000) / 100;

    // Sector breakdown for historical points
    let sectorBreakdown: Record<string, { meanFare: number; priceRelativeIndex: number; recordsCount: number }>;
    if (i === 9 && currentSummary.sector_breakdown) {
      sectorBreakdown = {};
      for (const [secKey, secVal] of Object.entries(currentSummary.sector_breakdown)) {
        sectorBreakdown[secKey] = {
          meanFare: secVal.current_mean_fare_inr,
          priceRelativeIndex: Math.round(secVal.sector_price_relative * 10000) / 100,
          recordsCount: secVal.records_count
        };
      }
    } else {
      const delBlrIndex = Math.round(runApix * 1.055 * 100) / 100;
      const blrDelIndex = Math.round(runApix * 0.985 * 100) / 100;
      const delBomIndex = Math.round(runApix * 0.935 * 100) / 100;

      sectorBreakdown = {
        "DEL-BLR": {
          meanFare: Math.round((delBlrIndex / 100) * BASE_REFERENCE_PRICE_P0),
          priceRelativeIndex: delBlrIndex,
          recordsCount: Math.round(currentSummary.total_valid_records * 0.40)
        },
        "BLR-DEL": {
          meanFare: Math.round((blrDelIndex / 100) * BASE_REFERENCE_PRICE_P0),
          priceRelativeIndex: blrDelIndex,
          recordsCount: Math.round(currentSummary.total_valid_records * 0.35)
        },
        "DEL-BOM": {
          meanFare: Math.round((delBomIndex / 100) * BASE_REFERENCE_PRICE_P0),
          priceRelativeIndex: delBomIndex,
          recordsCount: Math.round(currentSummary.total_valid_records * 0.25)
        }
      };
    }

    runs.push({
      runIndex: runNum,
      runLabel: `Run #${runNum}`,
      timestamp: runDate.toISOString(),
      displayTime: timeStr,
      apixIndex: i === 9 ? currentSummary.apix_index_value : runApix,
      weightedMeanFare: i === 9 ? currentSummary.weighted_mean_fare_inr : weightedFare,
      inflationDeltaPct: i === 9 ? currentSummary.inflation_deflation_delta_pct : inflationDelta,
      upperVolatilityBound: Math.round((runApix + spread) * 100) / 100,
      lowerVolatilityBound: Math.round((runApix - spread) * 100) / 100,
      validRecordsCount: currentSummary.total_valid_records + (i % 3) * 2 - 2,
      anomalyCleansedCount: currentSummary.rejected_records_count + (i % 2),
      runOverRunDelta: rorDelta,
      sectorBreakdown
    });
  }

  return runs;
}
