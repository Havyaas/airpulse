import React, { useState, useMemo } from "react";
import {
  PipelineSummary,
  FlightRecord,
  DGCA_SECTOR_WEIGHTS,
  BOOKING_HORIZONS,
  BASE_REFERENCE_PRICE_P0,
  HistoricalRun
} from "../engineSimulation";
import { ApixVolatilityChart } from "./ApixVolatilityChart";
import { TerminalLogBox } from "./TerminalLogBox";
import {
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
  Database,
  ArrowRight,
  Loader2
} from "lucide-react";

interface DashboardTabProps {
  summary: PipelineSummary;
  records: FlightRecord[];
  rejectedRecords: FlightRecord[];
  historicalRuns?: HistoricalRun[];
  onTrigger: () => void;
  isRunning: boolean;
  pipelineStage: string;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  summary,
  records,
  rejectedRecords,
  historicalRuns = [],
  onTrigger,
  isRunning,
  pipelineStage,
}) => {
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [selectedHorizon, setSelectedHorizon] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeLogView, setActiveLogView] = useState<"valid" | "rejected">("valid");

  // Filtering records
  const filteredRecords = useMemo(() => {
    const list = activeLogView === "valid" ? records : rejectedRecords;
    return list.filter((r) => {
      const matchSector = selectedSector === "ALL" || r.sector === selectedSector;
      const matchHorizon = selectedHorizon === "ALL" || r.horizon === selectedHorizon;
      const matchSearch =
        !searchQuery ||
        r.flight_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.airline.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.sector.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSector && matchHorizon && matchSearch;
    });
  }, [records, rejectedRecords, activeLogView, selectedSector, selectedHorizon, searchQuery]);

  // Lead-time elasticity data
  const horizonOrder = ["T+1", "T+7", "T+15", "T+30", "T+45"];
  const sectorKeys = Object.keys(DGCA_SECTOR_WEIGHTS);

  // Maximum value for elasticity chart bar height scaling
  const maxFare = useMemo(() => {
    let max = 0;
    for (const sec of sectorKeys) {
      for (const h of horizonOrder) {
        const val = summary.lead_time_elasticity_curve[sec]?.[h] || 0;
        if (val > max) max = val;
      }
    }
    return max > 0 ? max : 10000;
  }, [summary]);

  // Download filtered CSV
  const handleExportCSV = () => {
    const headers = [
      "timestamp",
      "sector",
      "origin",
      "destination",
      "horizon",
      "days_ahead",
      "travel_date",
      "airline",
      "flight_number",
      "raw_price",
      "base_fare_inr",
      "taxes_fees_udf_inr",
      "total_fare_inr",
      "is_synthetic",
      "z_score"
    ];
    const rows = filteredRecords.map((r) => [
      r.timestamp,
      r.sector,
      r.origin,
      r.destination,
      r.horizon,
      r.days_ahead,
      r.travel_date,
      `"${r.airline}"`,
      r.flight_number,
      r.raw_price,
      r.base_fare_inr,
      r.taxes_fees_udf_inr,
      r.total_fare_inr,
      r.is_synthetic,
      r.z_score ?? ""
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `airpulse_apix_stream_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isInflation = summary.inflation_deflation_delta_pct >= 0;

  // Sector isolation calculations for top-level indicators
  const currentSectorData =
    selectedSector !== "ALL" && summary.sector_breakdown
      ? summary.sector_breakdown[selectedSector]
      : null;
  const displayIndexValue = currentSectorData
    ? currentSectorData.sector_price_relative
    : summary.apix_index_value;
  const displayMeanFare = currentSectorData
    ? currentSectorData.current_mean_fare_inr
    : summary.weighted_mean_fare_inr;
  const displayDeltaPct = currentSectorData
    ? ((currentSectorData.current_mean_fare_inr - BASE_REFERENCE_PRICE_P0) / BASE_REFERENCE_PRICE_P0) * 100
    : summary.inflation_deflation_delta_pct;
  const isSectorInflation = displayDeltaPct >= 0;

  return (
    <div className="space-y-6">
      {/* Title & Institutional Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Aviation Price Index (APIx) Central Bank Intelligence Portal
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Modernized high-frequency airfare collection & Laspeyres indexation for NSO & RBI (SIH26056)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <span>Base Ref (P0): <strong className="text-slate-200">₹{BASE_REFERENCE_PRICE_P0.toLocaleString()}</strong></span>
            <span>·</span>
            <span>Batch: <strong className="text-slate-200">{new Date(summary.calculation_timestamp).toLocaleTimeString()}</strong></span>
          </div>
        </div>
      </div>

      {/* 4 Core KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Latest APIx Index */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>{selectedSector !== "ALL" ? `${selectedSector} Price Relative` : "Latest APIx Index Value"}</span>
            {selectedSector !== "ALL" && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                Isolated
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-white tabular-nums">
              {displayIndexValue.toFixed(2)}
            </span>
            <span
              className={`text-xs font-semibold font-mono flex items-center gap-0.5 ${
                isSectorInflation ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isSectorInflation ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isSectorInflation ? "+" : ""}
              {displayDeltaPct.toFixed(2)}% vs P0
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {selectedSector !== "ALL"
              ? `Relative price ratio against baseline reference P0 (₹4,500)`
              : `Weighted Laspeyres against reference P0 (₹4,500)`}
          </div>
        </div>

        {/* Metric 2: Weighted Mean Fare */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {selectedSector !== "ALL" ? `${selectedSector} Mean Airfare` : "Weighted Mean Airfare"}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-sky-400 tabular-nums">
              ₹{displayMeanFare.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              P0: ₹{BASE_REFERENCE_PRICE_P0.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {selectedSector !== "ALL"
              ? `Base Fare Proxy: ₹${Math.round(displayMeanFare * 0.78).toLocaleString()} (78%)`
              : `Base Fare: ₹${summary.decomposition_summary.mean_base_fare_inr.toLocaleString()} (78%)`}
          </div>
        </div>

        {/* Metric 3: Total Records Captured */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Valid Sample Records
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-white tabular-nums">
              {selectedSector !== "ALL" && currentSectorData
                ? currentSectorData.records_count
                : summary.total_valid_records}
            </span>
            <span className="text-xs font-mono text-amber-400">
              {summary.rejected_records_count} Cleansed
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {selectedSector !== "ALL"
              ? `Records for sector ${selectedSector}`
              : `Rolling Z-score filtered (|Z| ≤ 2.5)`}
          </div>
        </div>

        {/* Metric 4: Monitored Sectors Density */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {selectedSector !== "ALL" ? `${selectedSector} Weight Status` : "DGCA Density Coverage"}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-white tabular-nums">
              {selectedSector !== "ALL"
                ? `${((DGCA_SECTOR_WEIGHTS[selectedSector] || 0) * 100).toFixed(0)}%`
                : `${summary.sectors_monitored_count} Trunk Routes`}
            </span>
            <span className="text-xs font-mono text-emerald-400">
              {selectedSector !== "ALL" ? "DGCA Weight" : "100% Weight Sum"}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {selectedSector !== "ALL"
              ? `Contribution: ${((DGCA_SECTOR_WEIGHTS[selectedSector] || 0) * 100).toFixed(0)}% of APIx composite basket`
              : "DEL-BLR (40%) · BLR-DEL (35%) · DEL-BOM (25%)"}
          </div>
        </div>
      </div>

      {/* Sector Trend Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-sky-950/80 border border-sky-800 flex items-center justify-center text-sky-400 shrink-0">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <span>Sector Trend Isolation Filter</span>
              {selectedSector !== "ALL" && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                  Active: {selectedSector}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Isolate high-frequency price trends, regression projections, and yield corridors for specific sectors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="dashboard-sector-filter" className="text-xs text-slate-400 font-mono hidden sm:inline">
            Isolate Sector:
          </label>
          <select
            id="dashboard-sector-filter"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-slate-950 border border-slate-700 hover:border-sky-500 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500 cursor-pointer shadow-sm transition-colors"
          >
            <option value="ALL">All Monitored Routes (Composite APIx)</option>
            <option value="DEL-BLR">DEL-BLR · Delhi → Bengaluru (40% Weight)</option>
            <option value="BLR-DEL">BLR-DEL · Bengaluru → Delhi (35% Weight)</option>
            <option value="DEL-BOM">DEL-BOM · Delhi → Mumbai (25% Weight)</option>
          </select>
          {selectedSector !== "ALL" && (
            <button
              onClick={() => setSelectedSector("ALL")}
              className="px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:text-white rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              title="Reset sector filter to All Sectors"
            >
              Reset to All
            </button>
          )}
        </div>
      </div>

      {/* D3.js Historical APIx Volatility Trends Visualization & OLS Projection */}
      <ApixVolatilityChart
        historicalRuns={historicalRuns}
        onTriggerRun={onTrigger}
        isRunning={isRunning}
        selectedSector={selectedSector}
        onSectorChange={setSelectedSector}
      />

      {/* Live Pipeline Telemetry Terminal Console (Data listed on every trigger) */}
      <TerminalLogBox
        summary={summary}
        records={records}
        rejectedRecords={rejectedRecords}
        historicalRuns={historicalRuns}
        onTrigger={onTrigger}
        isRunning={isRunning}
        pipelineStage={pipelineStage}
        selectedSector={selectedSector}
        onSectorChange={setSelectedSector}
      />

      {/* Double-Column Horizontal Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Lead-Time Elasticity Curve & Decomposition */}
        <div className="lg:col-span-6 space-y-6">
          {/* Elasticity Curve Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Lead-Time Price Elasticity Curve
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedSector !== "ALL"
                    ? `Yield decay for ${selectedSector} across booking horizons`
                    : "Yield decay from immediate departure (T+1) to advance purchase (T+45)"}
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                {selectedSector !== "ALL" ? `${selectedSector} Curve` : "Composite Yield Curve"}
              </span>
            </div>

            {/* Visual Bar Chart for Elasticity */}
            <div className="mt-4 space-y-4">
              {horizonOrder.map((h) => {
                const delBlr = summary.lead_time_elasticity_curve["DEL-BLR"]?.[h] || 0;
                const blrDel = summary.lead_time_elasticity_curve["BLR-DEL"]?.[h] || 0;
                const delBom = summary.lead_time_elasticity_curve["DEL-BOM"]?.[h] || 0;
                const avgAcross = Math.round((delBlr + blrDel + delBom) / 3);

                const currentRouteFare =
                  selectedSector !== "ALL"
                    ? summary.lead_time_elasticity_curve[selectedSector]?.[h] || 0
                    : avgAcross;

                return (
                  <div key={h} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="w-10 font-bold text-sky-400">{h}</span>
                        <span className="text-slate-400">({BOOKING_HORIZONS[h]} days ahead)</span>
                      </div>
                      <div className="font-mono font-bold text-white tabular-nums flex items-center gap-1.5">
                        <span>₹{currentRouteFare.toLocaleString()}</span>
                        {selectedSector !== "ALL" && (
                          <span className="text-[10px] font-normal text-sky-400">({selectedSector})</span>
                        )}
                      </div>
                    </div>

                    {/* Multi-segment route bar */}
                    <div className="w-full bg-slate-950 h-5 rounded overflow-hidden flex border border-slate-800">
                      <div
                        className={`bg-sky-500 h-full transition-all duration-300 flex items-center justify-end px-1.5 text-[10px] font-mono font-medium text-slate-950 ${
                          selectedSector !== "ALL" && selectedSector !== "DEL-BLR" ? "opacity-30" : "opacity-100"
                        }`}
                        style={{ width: `${Math.min(100, (delBlr / maxFare) * 100 * 0.4)}%` }}
                        title={`DEL-BLR (40% weight): ₹${delBlr.toLocaleString()}`}
                      >
                        40%
                      </div>
                      <div
                        className={`bg-indigo-500 h-full transition-all duration-300 flex items-center justify-end px-1.5 text-[10px] font-mono font-medium text-white ${
                          selectedSector !== "ALL" && selectedSector !== "BLR-DEL" ? "opacity-30" : "opacity-100"
                        }`}
                        style={{ width: `${Math.min(100, (blrDel / maxFare) * 100 * 0.35)}%` }}
                        title={`BLR-DEL (35% weight): ₹${blrDel.toLocaleString()}`}
                      >
                        35%
                      </div>
                      <div
                        className={`bg-teal-500 h-full transition-all duration-300 flex items-center justify-end px-1.5 text-[10px] font-mono font-medium text-slate-950 ${
                          selectedSector !== "ALL" && selectedSector !== "DEL-BOM" ? "opacity-30" : "opacity-100"
                        }`}
                        style={{ width: `${Math.min(100, (delBom / maxFare) * 100 * 0.25)}%` }}
                        title={`DEL-BOM (25% weight): ₹${delBom.toLocaleString()}`}
                      >
                        25%
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
                      <span className={selectedSector === "DEL-BLR" ? "text-sky-300 font-semibold" : "text-slate-400"}>
                        DEL-BLR: ₹{delBlr.toLocaleString()}
                      </span>
                      <span className={selectedSector === "BLR-DEL" ? "text-indigo-300 font-semibold" : "text-slate-400"}>
                        BLR-DEL: ₹{blrDel.toLocaleString()}
                      </span>
                      <span className={selectedSector === "DEL-BOM" ? "text-teal-300 font-semibold" : "text-slate-400"}>
                        DEL-BOM: ₹{delBom.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className={`flex items-center gap-1.5 ${selectedSector === "DEL-BLR" ? "text-sky-300 font-semibold" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> DEL-BLR (40%)
              </span>
              <span className={`flex items-center gap-1.5 ${selectedSector === "BLR-DEL" ? "text-indigo-300 font-semibold" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> BLR-DEL (35%)
              </span>
              <span className={`flex items-center gap-1.5 ${selectedSector === "DEL-BOM" ? "text-teal-300 font-semibold" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" /> DEL-BOM (25%)
              </span>
            </div>
          </div>

          {/* Granular Price Decomposition Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Granular Fare Decomposition (Part b)
                </h3>
                <p className="text-xs text-slate-400">
                  Separating Pure Airfare from Government Taxes, Airport Fees & UDF
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                78% / 22% Proxy
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <div className="text-xs text-slate-400 font-medium">Base Fare Proxy (78%)</div>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  ₹{summary.decomposition_summary.mean_base_fare_inr.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Subject to airline yield management
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <div className="text-xs text-slate-400 font-medium">Taxes, Fees & UDF (22%)</div>
                <div className="text-xl font-bold font-mono text-sky-400 mt-1">
                  ₹{summary.decomposition_summary.mean_taxes_fees_udf_inr.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Statutory fees, GST & User Development Fees
                </div>
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="mt-4">
              <div className="w-full bg-slate-950 h-3 rounded overflow-hidden flex border border-slate-800">
                <div className="bg-sky-500 h-full" style={{ width: "78%" }} />
                <div className="bg-amber-500 h-full" style={{ width: "22%" }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1">
                <span>Airline Base Revenue (78%)</span>
                <span>Fiscal & Airport Surcharges (22%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Active Database Records Stream Logs */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            {/* Table Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-white">
                  Database Records Stream Logs
                </h3>
                {/* Segmented view switch */}
                <div className="flex items-center p-0.5 bg-slate-950 rounded border border-slate-800 text-xs">
                  <button
                    onClick={() => setActiveLogView("valid")}
                    className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
                      activeLogView === "valid"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Valid ({records.length})
                  </button>
                  <button
                    onClick={() => setActiveLogView("rejected")}
                    className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
                      activeLogView === "rejected"
                        ? "bg-rose-950/80 text-rose-300"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Rejected ({rejectedRecords.length})
                  </button>
                </div>
              </div>

              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1 text-xs font-mono font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search flight or airline..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">All Sectors</option>
                <option value="DEL-BLR">DEL-BLR (40% Weight)</option>
                <option value="BLR-DEL">BLR-DEL (35% Weight)</option>
                <option value="DEL-BOM">DEL-BOM (25% Weight)</option>
              </select>

              <select
                value={selectedHorizon}
                onChange={(e) => setSelectedHorizon(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">All Horizons (T+1 to T+45)</option>
                <option value="T+1">T+1 (1 Day Ahead)</option>
                <option value="T+7">T+7 (7 Days Ahead)</option>
                <option value="T+15">T+15 (15 Days Ahead)</option>
                <option value="T+30">T+30 (30 Days Ahead)</option>
                <option value="T+45">T+45 (45 Days Ahead)</option>
              </select>
            </div>

            {/* Table View */}
            <div className="border border-slate-800 rounded overflow-hidden max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Sector</th>
                    <th className="py-2.5 px-2">Horizon</th>
                    <th className="py-2.5 px-3">Carrier</th>
                    <th className="py-2.5 px-2">Flight #</th>
                    <th className="py-2.5 px-3 text-right">Fare (₹)</th>
                    <th className="py-2.5 px-2 text-right">Z-Score</th>
                    {activeLogView === "rejected" && <th className="py-2.5 px-3">Rejection Reason</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-200">
                          {rec.sector}
                        </td>
                        <td className="py-2 px-2 text-sky-400">
                          {rec.horizon}
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-sans">
                          {rec.airline}
                        </td>
                        <td className="py-2 px-2 text-slate-400">
                          {rec.flight_number}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white tabular-nums">
                          ₹{rec.total_fare_inr.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400 tabular-nums">
                          {rec.z_score !== undefined ? rec.z_score.toFixed(2) : "0.00"}
                        </td>
                        {activeLogView === "rejected" && (
                          <td className="py-2 px-3 text-rose-400 text-[11px] font-sans">
                            {rec.rejection_reason}
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={activeLogView === "rejected" ? 7 : 6} className="py-8 text-center text-slate-500 font-sans">
                        No records match the current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Showing {filteredRecords.length} records</span>
              <span>Sorted newest to oldest</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
