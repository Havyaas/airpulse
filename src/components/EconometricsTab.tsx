import React from "react";
import {
  BASE_REFERENCE_PRICE_P0,
  DGCA_SECTOR_WEIGHTS,
  BOOKING_HORIZONS,
  DECOMPOSITION_BASE_RATIO,
  DECOMPOSITION_TAX_RATIO,
  OUTLIER_ZSCORE_THRESHOLD,
  LUXURY_FARE_CAP_INR
} from "../engineSimulation";
import { BookOpen, CheckCircle, ShieldCheck, Scale, Cpu, Calculator, Activity } from "lucide-react";

export const EconometricsTab: React.FC = () => {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title & Institutional Intro */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight">
          Econometric Formulation & Central Bank Methodological Specification
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Standardized under Smart India Hackathon Problem Statement SIH26056 for the National Statistical Office (NSO) and Reserve Bank of India (RBI)
        </p>
      </div>

      {/* 01. Mathematical Formulation */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-sky-400" />
          <h2 className="text-base font-bold text-white">01. Weighted Laspeyres Aviation Index Formulation</h2>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          The traditional Consumer Price Index (CPI) methodology utilizes a base-period weighted Laspeyres aggregation structure. In the high-frequency airfare context, passenger quantities $Q_0$ from DGCA official statistics determine the fixed weight shares $w_i$, isolating pure price movements from compositional passenger volume shifts:
        </p>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm text-sky-300 text-center">
          {"APIx_t = [ Σ w_i · ( P_{t,i} / P_{0,i} ) ] × 100"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded p-3">
            <span className="font-mono text-sky-400 font-bold block mb-1">w_i (DGCA Weight)</span>
            <span className="text-slate-400">
              Corridor passenger traffic volume share relative to total monitored domestic seat-kilometres (Σ w_i = 1.0).
            </span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded p-3">
            <span className="font-mono text-sky-400 font-bold block mb-1">P_(t,i) (Current Fare)</span>
            <span className="text-slate-400">
              Harmonized arithmetic mean of valid economy fares observed across horizons in corridor i at time t.
            </span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded p-3">
            <span className="font-mono text-sky-400 font-bold block mb-1">P_(0,i) (Base Reference)</span>
            <span className="text-slate-400">
              Fixed historical benchmark airfare established at ₹{BASE_REFERENCE_PRICE_P0.toLocaleString()} INR.
            </span>
          </div>
        </div>
      </div>

      {/* 02. DGCA Volume Weights */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white">02. DGCA High-Density Corridor Weights</h2>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          The sectors selected represent the dense trunk corridors of Indian domestic civil aviation, accounting for a commanding share of commercial passenger traffic:
        </p>

        <div className="border border-slate-800 rounded overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">City Pair Corridor</th>
                <th className="py-2.5 px-4">Origin / Destination</th>
                <th className="py-2.5 px-4 text-center">DGCA Weight (w_i)</th>
                <th className="py-2.5 px-4 text-center">Percentage Share</th>
                <th className="py-2.5 px-4 text-right">Base Ref Price (P0)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {Object.entries(DGCA_SECTOR_WEIGHTS).map(([sec, wt]) => (
                <tr key={sec} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 font-bold text-white">{sec}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-400">
                    {sec === "DEL-BLR" && "New Delhi Indira Gandhi ➔ Bengaluru Kempegowda"}
                    {sec === "BLR-DEL" && "Bengaluru Kempegowda ➔ New Delhi Indira Gandhi"}
                    {sec === "DEL-BOM" && "New Delhi Indira Gandhi ➔ Mumbai Chhatrapati Shivaji"}
                  </td>
                  <td className="py-2.5 px-4 text-center text-sky-400 font-bold">{wt.toFixed(2)}</td>
                  <td className="py-2.5 px-4 text-center text-emerald-400 font-bold">{(wt * 100).toFixed(0)}%</td>
                  <td className="py-2.5 px-4 text-right">₹{BASE_REFERENCE_PRICE_P0.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 03. Granular Decomposition & Outlier Cleansing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Statistical Outlier Filtration</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Aviation pricing displays fat-tailed distributions due to dynamic bucket pricing and premium cabins. The pipeline enforces a two-tier filter:
          </p>
          <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside font-sans">
            <li>
              <strong className="text-slate-200">Luxury Ceiling Cap:</strong> Hard truncation at ₹{LUXURY_FARE_CAP_INR.toLocaleString()} INR to strip non-economy fares without distorting median metrics.
            </li>
            <li>
              <strong className="text-slate-200">Rolling Z-Score Filter:</strong> Evaluates |Z| = |(P - μ)/σ| &gt; {OUTLIER_ZSCORE_THRESHOLD} inside each (Sector, Horizon) stratum to reject flash spikes.
            </li>
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">AI Synthetic Imputation & Decomposition</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Time series integrity requires zero breaks when routes sell out or cancel:
          </p>
          <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside font-sans">
            <li>
              <strong className="text-slate-200">Shadow Price Matrix:</strong> Imputes realistic shadow reservation prices across T+1 to T+45 to guarantee index continuity for monetary policy modeling.
            </li>
            <li>
              <strong className="text-slate-200">Structural Decomposition:</strong> Fixed structural separation into Base Carrier Fare ({DECOMPOSITION_BASE_RATIO * 100}%) and Statutory Taxes/UDF ({DECOMPOSITION_TAX_RATIO * 100}%).
            </li>
          </ul>
        </div>
      </div>

      {/* 04. Rolling Dispersion & OLS Forward Projection */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-bold text-white">04. Rolling Dispersion Analysis & OLS Linear Forecasting</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
          <div className="space-y-2 bg-slate-950/60 border border-slate-800/80 rounded p-4">
            <h4 className="font-bold text-sky-300 flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Rolling Volatility Dispersion (σ_10)
            </h4>
            <p className="text-slate-400">
              High-frequency airline pricing indices are evaluated using a rolling sample standard deviation across the past 10 observation batches:
            </p>
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded font-mono text-[11px] text-sky-200">
              σ_10 = √[(1 / (N - 1)) × Σ(APIx_i - μ)²]
            </div>
            <p className="text-slate-400">
              This metric quantifies short-term price variance and stability across high-density domestic aviation trunk corridors.
            </p>
          </div>

          <div className="space-y-2 bg-slate-950/60 border border-slate-800/80 rounded p-4">
            <h4 className="font-bold text-amber-300 flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              OLS Forward Linear Trend Projection (+3 Steps)
            </h4>
            <p className="text-slate-400">
              To anticipate near-term headline aviation inflation pressure, an Ordinary Least Squares (OLS) bivariate regression is estimated across the historical 10-run window:
            </p>
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded font-mono text-[11px] text-amber-200">
              APIx_pred(t + k) = β₀ + β₁ × (t + k), where k ∈ [1, 2, 3]
            </div>
            <p className="text-slate-400">
              The slope coefficient β₁ quantifies the rate of cost inflation/deflation drift per time increment, plotted with an expanding 95% prediction interval cone directly on the D3 chart.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
