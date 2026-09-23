/**
 * Airpulse APIx: High-Frequency Aviation Inflation Analytics Platform
 * Smart India Hackathon Problem Statement SIH26056
 * Addressing requirements for the National Statistical Office (NSO) and Reserve Bank of India (RBI)
 */

import React, { useState, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { DashboardTab } from "./components/DashboardTab";
import { CodeExplorerTab } from "./components/CodeExplorerTab";
import { ApiSandboxTab } from "./components/ApiSandboxTab";
import { EconometricsTab } from "./components/EconometricsTab";
import {
  runAirpulseSimulation,
  PipelineSummary,
  FlightRecord,
  HistoricalRun,
  generateInitialHistoricalRuns,
  createHistoricalRunFromSummary
} from "./engineSimulation";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "code" | "api" | "methodology">("dashboard");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pipelineStage, setPipelineStage] = useState<string>("");
  const [scenarioMultiplier, setScenarioMultiplier] = useState<number>(1.0);

  // Initial simulation data
  const [simulationData, setSimulationData] = useState<{
    summary: PipelineSummary;
    records: FlightRecord[];
    rejectedRecords: FlightRecord[];
  }>(() => {
    const initial = runAirpulseSimulation(1.0);
    return initial;
  });

  // Track historical runs for D3 volatility visualization
  const [historicalRuns, setHistoricalRuns] = useState<HistoricalRun[]>(() =>
    generateInitialHistoricalRuns(simulationData.summary)
  );

  // Keep track of previous lag duration to ensure every click has a noticeably different lag time
  const lastLagDurationRef = useRef<number>(0);

  // Pipeline Execution trigger with differing lag time on every click (no verbose loading details)
  const handleTriggerPipeline = () => {
    if (isRunning) return;
    setIsRunning(true);
    setPipelineStage("Loading...");

    // Every time force trigger is clicked, the lag time differs noticeably
    const durationOptions = [2800, 3600, 4400, 5200, 6100, 7000, 4800, 3900, 5600, 6500];
    let candidate = durationOptions[Math.floor(Math.random() * durationOptions.length)];
    while (Math.abs(candidate - lastLagDurationRef.current) < 800) {
      candidate = durationOptions[Math.floor(Math.random() * durationOptions.length)];
    }
    const lagDurationMs = candidate + Math.floor(Math.random() * 300 - 150);
    lastLagDurationRef.current = lagDurationMs;

    setTimeout(() => {
      // Refresh simulation with market jitter multiplier
      const randomFactor = 0.96 + Math.random() * 0.08;
      const updated = runAirpulseSimulation(scenarioMultiplier * randomFactor);
      setSimulationData(updated);

      // Append new run to historical time series
      setHistoricalRuns((prevRuns) => {
        const nextIndex = (prevRuns[prevRuns.length - 1]?.runIndex ?? 0) + 1;
        const lastApix = prevRuns[prevRuns.length - 1]?.apixIndex;
        const newRun = createHistoricalRunFromSummary(updated.summary, nextIndex, lastApix);
        return [...prevRuns, newRun];
      });

      setIsRunning(false);
      setPipelineStage("");
    }, lagDurationMs);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-slate-950">
      {/* Universal Top Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onTriggerPipeline={handleTriggerPipeline}
        isRunning={isRunning}
        currentApix={simulationData.summary.apix_index_value}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "dashboard" && (
          <DashboardTab
            summary={simulationData.summary}
            records={simulationData.records}
            rejectedRecords={simulationData.rejectedRecords}
            historicalRuns={historicalRuns}
            onTrigger={handleTriggerPipeline}
            isRunning={isRunning}
            pipelineStage={pipelineStage}
          />
        )}

        {activeTab === "code" && <CodeExplorerTab />}

        {activeTab === "api" && (
          <ApiSandboxTab
            summary={simulationData.summary}
            records={simulationData.records}
            onTrigger={handleTriggerPipeline}
          />
        )}

        {activeTab === "methodology" && <EconometricsTab />}
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Airpulse APIx</span>
            <span>·</span>
            <span>National Statistical Office & Reserve Bank of India</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("code")}
              className="text-slate-400 hover:text-sky-400 transition-colors"
            >
              Python Files (engine.py, app.py, api_service.py)
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className="text-slate-400 hover:text-sky-400 transition-colors"
            >
              FastAPI OpenAPI Spec
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
