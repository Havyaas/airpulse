import React, { useState, useEffect, useRef } from "react";
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Search,
  Sparkles,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Code,
  Loader2
} from "lucide-react";
import { PipelineSummary, FlightRecord, HistoricalRun } from "../engineSimulation";

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  type: "command" | "info" | "scrape" | "ingest" | "cleanse" | "calc" | "data" | "summary" | "warning" | "success";
  text: string;
  batchIndex?: number;
  dataRow?: {
    sector: string;
    carrier: string;
    flight: string;
    horizon: string;
    fare: number;
    baseFare: number;
    taxes: number;
    zScore?: number;
    status: "INGESTED" | "CLEANSED" | "SYNTHETIC";
  };
}

interface TerminalLogBoxProps {
  summary: PipelineSummary;
  records: FlightRecord[];
  rejectedRecords: FlightRecord[];
  historicalRuns: HistoricalRun[];
  onTrigger: () => void;
  isRunning: boolean;
  pipelineStage?: string;
  selectedSector?: string;
  onSectorChange?: (sector: string) => void;
}

export const TerminalLogBox: React.FC<TerminalLogBoxProps> = ({
  summary,
  records,
  rejectedRecords,
  historicalRuns,
  onTrigger,
  isRunning,
  pipelineStage,
  selectedSector = "ALL",
  onSectorChange
}) => {
  const [logs, setLogs] = useState<TerminalLogEntry[]>([]);
  const [terminalViewMode, setTerminalViewMode] = useState<"stream" | "datatable" | "json">("stream");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [commandInput, setCommandInput] = useState<string>("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [selectedLogLevel, setSelectedLogLevel] = useState<string>("ALL");

  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const triggerCounterRef = useRef<number>(historicalRuns.length || 10);
  const prevIsRunningRef = useRef<boolean>(isRunning);
  const prevStageRef = useRef<string>("");

  const formatTimestamp = () => {
    const now = new Date();
    return now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
  };

  // Initialize terminal on mount with initial batch history
  useEffect(() => {
    const initialBatch = triggerCounterRef.current;
    const initialLogs: TerminalLogEntry[] = [
      {
        id: "boot-0",
        timestamp: formatTimestamp(),
        type: "info",
        text: "Airpulse APIx Pipeline Engine v2.4.0 (x86_64-linux-gnu, python 3.11.8)"
      },
      {
        id: "boot-1",
        timestamp: formatTimestamp(),
        type: "command",
        text: "systemctl status airpulse-worker.service --no-pager"
      },
      {
        id: "boot-2",
        timestamp: formatTimestamp(),
        type: "success",
        text: "● airpulse-worker.service - DGCA Laspeyres Aviation Index Ingestion Daemon (Active: running)"
      },
      {
        id: "boot-3",
        timestamp: formatTimestamp(),
        type: "info",
        text: "Trunk corridors configured: DEL-BLR (0.40), BLR-DEL (0.35), DEL-BOM (0.25) | Base Reference P0: ₹4,500.00"
      },
      {
        id: "boot-4",
        timestamp: formatTimestamp(),
        type: "command",
        text: `airpulse-cli execute --batch=${initialBatch} --corridors=ALL --horizons=T+1,T+7,T+15,T+30,T+45`
      },
      {
        id: "boot-5",
        timestamp: formatTimestamp(),
        type: "ingest",
        text: `Ingested ${records.length + rejectedRecords.length} quotes across DEL-BLR, BLR-DEL, DEL-BOM`,
        batchIndex: initialBatch
      },
      {
        id: "boot-6",
        timestamp: formatTimestamp(),
        type: "cleanse",
        text: `Rolling Z-Score filter (|Z| ≤ 2.5): ${rejectedRecords.length} anomalies cleansed, ${records.length} valid quotes retained`,
        batchIndex: initialBatch
      },
      {
        id: "boot-7",
        timestamp: formatTimestamp(),
        type: "calc",
        text: `Weighted Laspeyres APIx derived: ${summary.apix_index_value.toFixed(2)} pts (${summary.inflation_deflation_delta_pct >= 0 ? "+" : ""}${summary.inflation_deflation_delta_pct.toFixed(2)}% vs P0) | Mean Fare: ₹${summary.weighted_mean_fare_inr.toLocaleString()}`,
        batchIndex: initialBatch
      }
    ];

    // Append 5 sample data quotes
    const sample = records.slice(0, 5);
    sample.forEach((r, idx) => {
      initialLogs.push({
        id: `sample-${idx}`,
        timestamp: formatTimestamp(),
        type: "data",
        text: `QUOTE: ${r.sector} [${r.horizon}] ${r.airline} #${r.flight_number} -> ₹${r.total_fare_inr.toLocaleString()} (Base: ₹${r.base_fare_inr.toLocaleString()} + Tax: ₹${r.taxes_fees_udf_inr.toLocaleString()}) [Z=${r.z_score !== undefined ? (r.z_score >= 0 ? "+" : "") + r.z_score.toFixed(2) : "0.00"}]`,
        batchIndex: initialBatch,
        dataRow: {
          sector: r.sector,
          carrier: r.airline,
          flight: r.flight_number,
          horizon: r.horizon,
          fare: r.total_fare_inr,
          baseFare: r.base_fare_inr,
          taxes: r.taxes_fees_udf_inr,
          zScore: r.z_score,
          status: "INGESTED"
        }
      });
    });

    initialLogs.push({
      id: "boot-ready",
      timestamp: formatTimestamp(),
      type: "info",
      text: "Pipeline idle. Ready for next trigger dispatch. Type 'help' or click 'Trigger Run'."
    });

    setLogs(initialLogs);
  }, []);

  // Monitor pipeline stage changes during execution
  useEffect(() => {
    if (isRunning && pipelineStage && pipelineStage !== prevStageRef.current) {
      prevStageRef.current = pipelineStage;

      let logType: TerminalLogEntry["type"] = "info";
      if (pipelineStage.includes("Playwright") || pipelineStage.includes("Shadow-DOM")) {
        logType = "scrape";
      } else if (pipelineStage.includes("Z-Score") || pipelineStage.includes("capping")) {
        logType = "cleanse";
      } else if (pipelineStage.includes("Laspeyres") || pipelineStage.includes("Decomposing")) {
        logType = "calc";
      } else if (pipelineStage.includes("Archiving") || pipelineStage.includes("Synthetic")) {
        logType = "ingest";
      }

      setLogs((prev) => [
        ...prev,
        {
          id: `stage-${Date.now()}-${Math.random()}`,
          timestamp: formatTimestamp(),
          type: logType,
          text: pipelineStage,
          batchIndex: triggerCounterRef.current
        }
      ]);
    }
  }, [isRunning, pipelineStage]);

  // Handle Trigger Start & Completion
  useEffect(() => {
    // When transition from not running to running (Trigger started)
    if (!prevIsRunningRef.current && isRunning) {
      triggerCounterRef.current += 1;
      const currentBatch = triggerCounterRef.current;
      setLogs((prev) => [
        ...prev,
        {
          id: `cmd-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "command",
          text: `airpulse-pipeline --force-trigger --batch=#${String(currentBatch).padStart(3, "0")}`,
          batchIndex: currentBatch
        },
        {
          id: `start-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "info",
          text: `[BATCH #${String(currentBatch).padStart(3, "0")}] Fetching live flight data across all sectors...`,
          batchIndex: currentBatch
        }
      ]);
    }

    // When transition from running to finished (Trigger completed!)
    if (prevIsRunningRef.current && !isRunning) {
      const currentBatch = triggerCounterRef.current;
      const validSample = records.slice(0, 6);
      const rejectedSample = rejectedRecords.slice(0, 2);

      const completionLogs: TerminalLogEntry[] = [
        {
          id: `done-complete-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "success",
          text: `[INGESTION COMPLETE] Pipeline batch #${String(currentBatch).padStart(3, "0")} finished. All ${records.length + rejectedRecords.length} quotes loaded successfully.`,
          batchIndex: currentBatch
        },
        {
          id: `done-ingest-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "ingest",
          text: `[DATA INGESTED] Successfully harvested ${records.length + rejectedRecords.length} quotes from high-frequency reservation feeds.`,
          batchIndex: currentBatch
        },
        {
          id: `done-cleanse-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "cleanse",
          text: `[ANOMALY FILTER] |Z| ≤ 2.5 applied: ${rejectedRecords.length} outlier fares excluded (mean Z-score = +3.18). ${records.length} pure economy quotes preserved.`,
          batchIndex: currentBatch
        }
      ];

      // Add actual data rows for valid samples
      validSample.forEach((r, idx) => {
        completionLogs.push({
          id: `batch-${currentBatch}-valid-${idx}`,
          timestamp: formatTimestamp(),
          type: "data",
          text: `  > ${r.sector.padEnd(8)} ${r.horizon.padEnd(5)} ${r.airline.padEnd(11)} ${r.flight_number.padEnd(8)} Fare: ₹${r.total_fare_inr.toLocaleString().padEnd(7)} (Base: ₹${r.base_fare_inr.toLocaleString()} + Tax: ₹${r.taxes_fees_udf_inr.toLocaleString()}) [Z=${r.z_score !== undefined ? (r.z_score >= 0 ? "+" : "") + r.z_score.toFixed(2) : "0.00"}]`,
          batchIndex: currentBatch,
          dataRow: {
            sector: r.sector,
            carrier: r.airline,
            flight: r.flight_number,
            horizon: r.horizon,
            fare: r.total_fare_inr,
            baseFare: r.base_fare_inr,
            taxes: r.taxes_fees_udf_inr,
            zScore: r.z_score,
            status: "INGESTED"
          }
        });
      });

      // Add rejected sample row if exists
      rejectedSample.forEach((r, idx) => {
        completionLogs.push({
          id: `batch-${currentBatch}-rej-${idx}`,
          timestamp: formatTimestamp(),
          type: "warning",
          text: `  ! [REJECTED] ${r.sector.padEnd(8)} ${r.horizon.padEnd(5)} ${r.airline.padEnd(11)} ${r.flight_number.padEnd(8)} Fare: ₹${r.total_fare_inr.toLocaleString().padEnd(7)} Reason: ${r.rejection_reason || "Outlier Z > 2.5"}`,
          batchIndex: currentBatch,
          dataRow: {
            sector: r.sector,
            carrier: r.airline,
            flight: r.flight_number,
            horizon: r.horizon,
            fare: r.total_fare_inr,
            baseFare: r.base_fare_inr,
            taxes: r.taxes_fees_udf_inr,
            zScore: r.z_score,
            status: "CLEANSED"
          }
        });
      });

      // Add sector breakdown
      const secDELBLR = summary.sector_breakdown["DEL-BLR"];
      const secBLRDEL = summary.sector_breakdown["BLR-DEL"];
      const secDELBOM = summary.sector_breakdown["DEL-BOM"];

      completionLogs.push({
        id: `done-sectors-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "calc",
        text: `[SECTORS] DEL-BLR(40%): ₹${secDELBLR?.current_mean_fare_inr.toLocaleString() || "---"} (I=${secDELBLR?.sector_price_relative.toFixed(2) || "---"}) | BLR-DEL(35%): ₹${secBLRDEL?.current_mean_fare_inr.toLocaleString() || "---"} (I=${secBLRDEL?.sector_price_relative.toFixed(2) || "---"}) | DEL-BOM(25%): ₹${secDELBOM?.current_mean_fare_inr.toLocaleString() || "---"} (I=${secDELBOM?.sector_price_relative.toFixed(2) || "---"})`,
        batchIndex: currentBatch
      });

      // Add final summary calculation log
      const isInflation = summary.inflation_deflation_delta_pct >= 0;
      completionLogs.push({
        id: `done-calc-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "summary",
        text: `[BATCH #${String(currentBatch).padStart(3, "0")} COMPLETE] APIx Laspeyres Index: ${summary.apix_index_value.toFixed(2)} pts | Delta vs P0: ${isInflation ? "+" : ""}${summary.inflation_deflation_delta_pct.toFixed(2)}% | Weighted Mean Fare: ₹${summary.weighted_mean_fare_inr.toLocaleString()} | Base Proxy: ₹${summary.decomposition_summary.mean_base_fare_inr.toLocaleString()} (78%) | Taxes/UDF: ₹${summary.decomposition_summary.mean_taxes_fees_udf_inr.toLocaleString()} (22%)`,
        batchIndex: currentBatch
      });

      completionLogs.push({
        id: `done-ready-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "success",
        text: `Batch #${String(currentBatch).padStart(3, "0")} synchronized to telemetry store and CSV archive. Daemon standing by.`,
        batchIndex: currentBatch
      });

      setLogs((prev) => [...prev, ...completionLogs]);
    }

    prevIsRunningRef.current = isRunning;
  }, [isRunning, records, rejectedRecords, summary]);

  // Auto-scroll to bottom of terminal when logs update
  useEffect(() => {
    if (autoScroll && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll, terminalViewMode]);

  // Copy terminal contents to clipboard
  const handleCopyLogs = () => {
    const textToCopy = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download terminal session text file
  const handleDownloadLog = () => {
    const textContent = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`)
      .join("\n");
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `airpulse_terminal_session_${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.log`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear terminal
  const handleClearTerminal = () => {
    setLogs([
      {
        id: `clear-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "info",
        text: "Terminal cleared by user. Standby mode active."
      }
    ]);
  };

  // Interactive CLI commands handler
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput.trim();
    if (!cmd) return;

    // Add to command history
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setCommandInput("");

    // Log the entered command
    const cmdLog: TerminalLogEntry = {
      id: `user-cmd-${Date.now()}`,
      timestamp: formatTimestamp(),
      type: "command",
      text: `$ ${cmd}`
    };

    const newLogs: TerminalLogEntry[] = [cmdLog];
    const lowerCmd = cmd.toLowerCase();

    if (lowerCmd === "help" || lowerCmd === "--help" || lowerCmd === "-h") {
      newLogs.push({
        id: `help-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "info",
        text: [
          "AVAILABLE AIRPULSE CLI COMMANDS:",
          "  force-trigger, trigger Force trigger live Playwright data ingestion sequence",
          "  latest, data           List flight quotes captured in the latest batch",
          "  status                 Display worker status, active PID & route weights",
          "  stats, apix            Show current Laspeyres APIx index and econometric metrics",
          "  sectors                Show breakdown for DEL-BLR, BLR-DEL, DEL-BOM",
          "  json                   Dump current JSON summary payload",
          "  clear                  Clear the terminal console buffer",
          "  mode [stream|table|json] Switch terminal display mode",
          "  filter [sector]        Isolate sector (e.g. 'filter DEL-BLR' or 'filter ALL')"
        ].join("\n")
      });
    } else if (
      lowerCmd === "trigger" ||
      lowerCmd === "run" ||
      lowerCmd === "exec" ||
      lowerCmd === "force-trigger" ||
      lowerCmd === "force"
    ) {
      if (isRunning) {
        newLogs.push({
          id: `warn-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "warning",
          text: "ERROR: Pipeline worker is actively scraping live routes. Please wait for completion."
        });
      } else {
        newLogs.push({
          id: `trig-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "success",
          text: "Force trigger dispatched: Scraping live flight routes..."
        });
        onTrigger();
      }
    } else if (lowerCmd === "clear" || lowerCmd === "cls") {
      handleClearTerminal();
      return;
    } else if (lowerCmd === "latest" || lowerCmd === "data") {
      newLogs.push({
        id: `latest-hdr-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "info",
        text: `--- LATEST BATCH INGESTED FLIGHT DATA (SAMPLE OF ${records.length} VALID RECORDS) ---`
      });
      records.slice(0, 8).forEach((r, idx) => {
        newLogs.push({
          id: `latest-row-${idx}-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "data",
          text: `[${r.sector}] [${r.horizon}] ${r.airline} #${r.flight_number} -> ₹${r.total_fare_inr.toLocaleString()} (Base: ₹${r.base_fare_inr.toLocaleString()} + Tax: ₹${r.taxes_fees_udf_inr.toLocaleString()}) Z=${r.z_score !== undefined ? (r.z_score >= 0 ? "+" : "") + r.z_score.toFixed(2) : "0.00"}`,
          dataRow: {
            sector: r.sector,
            carrier: r.airline,
            flight: r.flight_number,
            horizon: r.horizon,
            fare: r.total_fare_inr,
            baseFare: r.base_fare_inr,
            taxes: r.taxes_fees_udf_inr,
            zScore: r.z_score,
            status: "INGESTED"
          }
        });
      });
    } else if (lowerCmd === "stats" || lowerCmd === "apix") {
      newLogs.push({
        id: `stats-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "calc",
        text: [
          `APIx Laspeyres Index : ${summary.apix_index_value.toFixed(2)} pts`,
          `Base Reference (P0)   : ₹${summary.base_reference_p0.toFixed(2)}`,
          `Weighted Mean Fare   : ₹${summary.weighted_mean_fare_inr.toLocaleString()}`,
          `Inflation Delta vs P0: ${summary.inflation_deflation_delta_pct >= 0 ? "+" : ""}${summary.inflation_deflation_delta_pct.toFixed(2)}%`,
          `Total Valid Records  : ${summary.total_valid_records}`,
          `Cleansed Anomalies   : ${summary.rejected_records_count}`
        ].join("\n")
      });
    } else if (lowerCmd === "sectors") {
      const breakdownText = Object.entries(summary.sector_breakdown)
        .map(([k, v]) => `  ${k.padEnd(8)} Weight: ${(v.dgca_weight * 100).toFixed(0)}% | Mean: ₹${v.current_mean_fare_inr.toLocaleString().padEnd(7)} | Relative: ${v.sector_price_relative.toFixed(2)} | Valid Quotes: ${v.records_count}`)
        .join("\n");
      newLogs.push({
        id: `sec-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "info",
        text: `DGCA TRUNK SECTOR BREAKDOWN:\n${breakdownText}`
      });
    } else if (lowerCmd.startsWith("mode ")) {
      const modeParam = lowerCmd.split(" ")[1];
      if (modeParam === "stream" || modeParam === "datatable" || modeParam === "json") {
        setTerminalViewMode(modeParam);
        newLogs.push({
          id: `mode-ok-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "success",
          text: `Switched terminal view mode to '${modeParam}'.`
        });
      } else {
        newLogs.push({
          id: `mode-err-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "warning",
          text: "Usage: mode [stream|datatable|json]"
        });
      }
    } else if (lowerCmd.startsWith("filter ")) {
      const secParam = cmd.split(" ")[1]?.toUpperCase();
      if (secParam && (secParam === "ALL" || secParam === "DEL-BLR" || secParam === "BLR-DEL" || secParam === "DEL-BOM")) {
        if (onSectorChange) onSectorChange(secParam);
        newLogs.push({
          id: `flt-ok-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "success",
          text: `Isolated sector filter set to: ${secParam}`
        });
      } else {
        newLogs.push({
          id: `flt-err-${Date.now()}`,
          timestamp: formatTimestamp(),
          type: "warning",
          text: "Usage: filter [ALL|DEL-BLR|BLR-DEL|DEL-BOM]"
        });
      }
    } else if (lowerCmd === "json") {
      setTerminalViewMode("json");
      newLogs.push({
        id: `json-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "info",
        text: "Switching terminal to raw JSON payload view."
      });
    } else {
      newLogs.push({
        id: `err-${Date.now()}`,
        timestamp: formatTimestamp(),
        type: "warning",
        text: `airpulse-cli: command not found: '${cmd}'. Type 'help' for available commands.`
      });
    }

    setLogs((prev) => [...prev, ...newLogs]);
  };

  // Keyboard navigation for command history
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setCommandInput(commandHistory[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx < commandHistory.length) {
          setHistoryIndex(nextIdx);
          setCommandInput(commandHistory[nextIdx]);
        } else {
          setHistoryIndex(-1);
          setCommandInput("");
        }
      }
    }
  };

  // Filter logs based on search & log level
  const filteredLogs = logs.filter((log) => {
    if (selectedLogLevel !== "ALL") {
      if (selectedLogLevel === "COMMAND" && log.type !== "command") return false;
      if (selectedLogLevel === "DATA" && log.type !== "data") return false;
      if (selectedLogLevel === "INGEST" && log.type !== "ingest") return false;
      if (selectedLogLevel === "CLEANSE" && log.type !== "cleanse") return false;
      if (selectedLogLevel === "CALC" && log.type !== "calc" && log.type !== "summary") return false;
    }
    if (searchFilter) {
      return log.text.toLowerCase().includes(searchFilter.toLowerCase());
    }
    return true;
  });

  // Extract all data rows captured in terminal across runs for Data Table view
  const capturedDataRows = logs
    .filter((l) => l.dataRow !== undefined)
    .map((l) => ({
      timestamp: l.timestamp,
      batchIndex: l.batchIndex || triggerCounterRef.current,
      ...l.dataRow!
    }));

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-2xl font-mono text-xs">
      {/* 1. Terminal Window Titlebar (macOS / Linux styling) */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 select-none">
        {/* Left: Window Traffic Lights & Host Shell Info */}
        <div className="flex items-center gap-3">
          {/* Traffic Lights */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/90 border border-rose-600 inline-block shadow-sm" />
            <span className="w-3 h-3 rounded-full bg-amber-500/90 border border-amber-600 inline-block shadow-sm" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/90 border border-emerald-600 inline-block shadow-sm" />
          </div>

          {/* Terminal Title */}
          <div className="flex items-center gap-2 text-slate-300 font-semibold tracking-wide">
            <TerminalIcon className="w-4 h-4 text-sky-400" />
            <span>airpulse-engine@pipeline-worker</span>
            <span className="text-slate-500 hidden sm:inline">:</span>
            <span className="text-sky-400/90 hidden sm:inline">~/data-stream/telemetry.log</span>
          </div>

          {/* Live Status Pill */}
          <div className="flex items-center gap-1.5 pl-2">
            {isRunning ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-bold text-[10px] flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
                LOADING...
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                IDLE · BATCH #{triggerCounterRef.current}
              </span>
            )}
            <span className="text-[10px] text-slate-500 hidden md:inline">PID: 49102</span>
          </div>
        </div>

        {/* Right: Terminal View Mode & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5 text-[11px]">
            <button
              onClick={() => setTerminalViewMode("stream")}
              className={`px-2 py-1 rounded transition-colors ${
                terminalViewMode === "stream"
                  ? "bg-slate-800 text-sky-300 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Stream Log
            </button>
            <button
              onClick={() => setTerminalViewMode("datatable")}
              className={`px-2 py-1 rounded transition-colors ${
                terminalViewMode === "datatable"
                  ? "bg-slate-800 text-sky-300 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Data Table ({capturedDataRows.length})
            </button>
            <button
              onClick={() => setTerminalViewMode("json")}
              className={`px-2 py-1 rounded transition-colors ${
                terminalViewMode === "json"
                  ? "bg-slate-800 text-sky-300 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              JSON Payload
            </button>
          </div>

          {/* Trigger Run Button inside terminal */}
          <button
            onClick={onTrigger}
            disabled={isRunning}
            className={`px-2.5 py-1 rounded border text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
              isRunning
                ? "bg-amber-950/80 text-amber-300 border-amber-600/60 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm"
            }`}
            title="Force trigger live data ingestion"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span>Scraping...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>Force Trigger</span>
              </>
            )}
          </button>

          {/* Copy Logs */}
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Copy terminal contents"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download Logs */}
          <button
            onClick={handleDownloadLog}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Download session log file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Clear Terminal */}
          <button
            onClick={handleClearTerminal}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
            title="Clear terminal buffer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Minimize / Expand Toggle */}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title={isMinimized ? "Expand terminal" : "Collapse terminal"}
          >
            {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed Bar Notice */}
      {isMinimized ? (
        <div className="px-4 py-2 bg-slate-950 text-slate-400 text-xs flex items-center justify-between">
          <span>Terminal minimized. {logs.length} logged events recorded. Active batch: #{triggerCounterRef.current}.</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-sky-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Restore Window</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          {/* 2. Secondary Sub-Bar: Filter & Auto-Scroll Controls */}
          <div className="bg-slate-950/80 border-b border-slate-900 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-[11px]">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search in logs */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                <input
                  type="text"
                  placeholder="Grep terminal logs..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-36 sm:w-48 text-[11px]"
                />
              </div>

              {/* Log Level Filter */}
              <div className="flex items-center gap-1 text-slate-400">
                <span className="hidden sm:inline">Filter:</span>
                <select
                  value={selectedLogLevel}
                  onChange={(e) => setSelectedLogLevel(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-sky-500 text-[11px] cursor-pointer"
                >
                  <option value="ALL">All Levels</option>
                  <option value="COMMAND">Commands ($)</option>
                  <option value="DATA">Data Quotes</option>
                  <option value="INGEST">Ingest Events</option>
                  <option value="CLEANSE">Cleanse / Filter</option>
                  <option value="CALC">APIx Calculations</option>
                </select>
              </div>

              {/* Sector Filter indicator */}
              {selectedSector !== "ALL" && (
                <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 text-[10px] font-semibold">
                  Route Focus: {selectedSector}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-300">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span>Auto-scroll</span>
              </label>

              <span className="text-slate-600">|</span>
              <span className="text-slate-400 font-mono">
                {logs.length} Lines · {capturedDataRows.length} Quotes
              </span>
            </div>
          </div>

          {/* 3. Terminal Canvas Body */}
          <div
            ref={terminalBodyRef}
            className="p-4 bg-black/95 text-slate-300 font-mono text-[11.5px] leading-relaxed h-[340px] overflow-y-auto space-y-1 selection:bg-sky-500 selection:text-black"
          >
            {/* View 1: Stream Log View */}
            {terminalViewMode === "stream" && (
              <div className="space-y-1">
                {filteredLogs.map((log) => {
                  let levelBadge = (
                    <span className="text-slate-500 font-semibold">[INFO]</span>
                  );
                  let textColor = "text-slate-300";

                  if (log.type === "command") {
                    levelBadge = <span className="text-emerald-400 font-bold">$</span>;
                    textColor = "text-emerald-300 font-semibold";
                  } else if (log.type === "scrape") {
                    levelBadge = <span className="text-indigo-400 font-semibold">[SCRAPE]</span>;
                    textColor = "text-indigo-200";
                  } else if (log.type === "ingest") {
                    levelBadge = <span className="text-sky-400 font-semibold">[INGEST]</span>;
                    textColor = "text-sky-200";
                  } else if (log.type === "cleanse") {
                    levelBadge = <span className="text-amber-400 font-semibold">[CLEANSE]</span>;
                    textColor = "text-amber-200";
                  } else if (log.type === "calc") {
                    levelBadge = <span className="text-cyan-400 font-bold">[CALC]</span>;
                    textColor = "text-cyan-200 font-medium";
                  } else if (log.type === "summary") {
                    levelBadge = <span className="text-emerald-400 font-bold">[SUMMARY]</span>;
                    textColor = "text-emerald-200 font-bold bg-emerald-950/40 px-1 py-0.5 rounded";
                  } else if (log.type === "warning") {
                    levelBadge = <span className="text-rose-400 font-bold">[ALERT]</span>;
                    textColor = "text-rose-300";
                  } else if (log.type === "success") {
                    levelBadge = <span className="text-emerald-400 font-bold">[STATUS]</span>;
                    textColor = "text-emerald-300";
                  } else if (log.type === "data") {
                    levelBadge = <span className="text-sky-400 font-mono">[DATA]</span>;
                    textColor = "text-slate-200";
                  }

                  return (
                    <div key={log.id} className="flex items-start gap-2 hover:bg-slate-900/60 px-1.5 py-0.5 rounded transition-colors group">
                      <span className="text-slate-500 shrink-0 text-[10.5px] tabular-nums select-none">
                        [{log.timestamp}]
                      </span>
                      <span className="shrink-0 select-none">{levelBadge}</span>
                      <span className={`flex-1 break-all whitespace-pre-wrap ${textColor}`}>
                        {log.text}
                      </span>
                    </div>
                  );
                })}

                {/* Clean Loading Indicator in Terminal */}
                {isRunning && (
                  <div className="flex items-center gap-2 text-sky-400 py-1.5 px-2 font-mono text-xs animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span>Loading data...</span>
                  </div>
                )}
              </div>
            )}

            {/* View 2: Data Table View (Every time triggered, all data rows listed in terminal table) */}
            {terminalViewMode === "datatable" && (
              <div className="space-y-2">
                <div className="text-slate-400 text-xs pb-1 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-white">
                    INGESTED FLIGHT QUOTES FROM TRIGGER BATCHES ({capturedDataRows.length} ROWS)
                  </span>
                  <span className="text-[11px] text-sky-400">
                    Latest Trigger Batch: #{triggerCounterRef.current}
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-800/80 rounded bg-slate-950/80">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2.5">Batch</th>
                        <th className="py-1.5 px-2">Time</th>
                        <th className="py-1.5 px-2">Sector</th>
                        <th className="py-1.5 px-2">Horizon</th>
                        <th className="py-1.5 px-2.5">Carrier</th>
                        <th className="py-1.5 px-2">Flight</th>
                        <th className="py-1.5 px-2.5 text-right">Fare (₹)</th>
                        <th className="py-1.5 px-2 text-right">Base (78%)</th>
                        <th className="py-1.5 px-2 text-right">Tax (22%)</th>
                        <th className="py-1.5 px-2 text-right">Z-Score</th>
                        <th className="py-1.5 px-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {capturedDataRows.length > 0 ? (
                        capturedDataRows.map((row, idx) => (
                          <tr key={`cap-${idx}`} className="hover:bg-slate-900/60 transition-colors">
                            <td className="py-1.5 px-2.5 text-slate-400 font-bold">
                              #{row.batchIndex}
                            </td>
                            <td className="py-1.5 px-2 text-slate-500 text-[10px]">
                              {row.timestamp}
                            </td>
                            <td className="py-1.5 px-2 font-semibold text-white">
                              {row.sector}
                            </td>
                            <td className="py-1.5 px-2 text-sky-400">
                              {row.horizon}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-300">
                              {row.carrier}
                            </td>
                            <td className="py-1.5 px-2 text-slate-400 font-bold">
                              {row.flight}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-white tabular-nums">
                              ₹{row.fare.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-400 tabular-nums">
                              ₹{row.baseFare.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-sky-400 tabular-nums">
                              ₹{row.taxes.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-400 tabular-nums">
                              {row.zScore !== undefined
                                ? (row.zScore >= 0 ? "+" : "") + row.zScore.toFixed(2)
                                : "0.00"}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              {row.status === "INGESTED" ? (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                                  INGESTED
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                                  CLEANSED
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-slate-500">
                            No flight quotes captured in this buffer yet. Click "Trigger Batch" above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* View 3: JSON Payload View */}
            {terminalViewMode === "json" && (
              <div className="space-y-2">
                <div className="text-slate-400 text-xs pb-1 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-white">
                    TELEMETRY REST API JSON PAYLOAD (BATCH #{triggerCounterRef.current})
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    HTTP 200 OK · application/json
                  </span>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-sky-300 text-[11px] leading-relaxed overflow-x-auto">
                  {JSON.stringify(
                    {
                      batch_id: triggerCounterRef.current,
                      status: "SUCCESS",
                      pipeline_worker: "airpulse-node-01",
                      calculated_at: summary.calculation_timestamp,
                      apix_index_value: summary.apix_index_value,
                      base_reference_price_p0: summary.base_reference_p0,
                      inflation_deflation_delta_pct: summary.inflation_deflation_delta_pct,
                      weighted_mean_fare_inr: summary.weighted_mean_fare_inr,
                      decomposition: summary.decomposition_summary,
                      sectors: summary.sector_breakdown,
                      sample_quotes_count: records.length,
                      anomalies_cleansed: rejectedRecords.length
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>

          {/* 4. Interactive Terminal Command Prompt ($ airpulse-cli >) */}
          <form
            onSubmit={handleCommandSubmit}
            className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex items-center gap-2 text-xs"
          >
            <span className="text-emerald-400 font-bold select-none flex items-center gap-1 font-mono">
              <span className="text-sky-400">airpulse</span>
              <span className="text-slate-500">@</span>
              <span className="text-slate-300">worker</span>
              <span className="text-emerald-400">:~$</span>
            </span>

            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type 'trigger', 'latest', 'stats', 'sectors', 'help' or 'clear'..."
              className="flex-1 bg-transparent text-white font-mono placeholder-slate-500 focus:outline-none text-xs"
              autoComplete="off"
              spellCheck={false}
            />

            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-[11px] flex items-center gap-1 transition-colors"
            >
              <span>Execute</span>
              <ArrowRight className="w-3 h-3 text-sky-400" />
            </button>
          </form>
        </>
      )}
    </div>
  );
};
