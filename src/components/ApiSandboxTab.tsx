import React, { useState } from "react";
import { PipelineSummary, FlightRecord } from "../engineSimulation";
import { Send, Key, Lock, CheckCircle2, XCircle, Copy, Check, Terminal } from "lucide-react";

interface ApiSandboxTabProps {
  summary: PipelineSummary;
  records: FlightRecord[];
  onTrigger: () => void;
}

interface EndpointDef {
  method: "GET" | "POST";
  path: string;
  tag: string;
  description: string;
  requiresAuth: boolean;
  defaultParams?: Record<string, string>;
}

const ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/health",
    tag: "System",
    description: "System health check, storage status, and active sector list.",
    requiresAuth: false
  },
  {
    method: "GET",
    path: "/api/v1/apix/latest",
    tag: "APIx Core Index",
    description: "Returns the latest Weighted Laspeyres Aviation Index, delta vs P0, and granular decomposition.",
    requiresAuth: true
  },
  {
    method: "GET",
    path: "/api/v1/apix/elasticity",
    tag: "APIx Analytics",
    description: "Lead-time price elasticity curves across T+1, T+7, T+15, T+30, T+45 for all DGCA sectors.",
    requiresAuth: true
  },
  {
    method: "GET",
    path: "/api/v1/records",
    tag: "Raw Data Ingestion",
    description: "Paginated flight fare database records with sector & horizon query parameters.",
    requiresAuth: true,
    defaultParams: { sector: "DEL-BLR", horizon: "T+1", page: "1", page_size: "10" }
  },
  {
    method: "POST",
    path: "/api/v1/pipeline/trigger",
    tag: "Pipeline Orchestration",
    description: "Triggers on-demand execution of Playwright scraping, Z-score outlier filtering, and Laspeyres derivation.",
    requiresAuth: true,
    defaultParams: { sync_mode: "true" }
  },
  {
    method: "GET",
    path: "/api/v1/methodology",
    tag: "Econometric Methodology",
    description: "Formal econometric documentation: Laspeyres formula, DGCA weights, and Z-score parameters.",
    requiresAuth: false
  }
];

export const ApiSandboxTab: React.FC<ApiSandboxTabProps> = ({ summary, records, onTrigger }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef>(ENDPOINTS[1]);
  const [apiKey, setApiKey] = useState<string>("rbi-nso-airpulse-sih26056-key");
  const [params, setParams] = useState<Record<string, string>>(selectedEndpoint.defaultParams || {});
  const [responseState, setResponseState] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    data: any;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleSelectEndpoint = (ep: EndpointDef) => {
    setSelectedEndpoint(ep);
    setParams(ep.defaultParams || {});
    setResponseState(null);
  };

  const handleSendRequest = () => {
    const startTime = performance.now();

    // Check authentication if required
    if (selectedEndpoint.requiresAuth && apiKey !== "rbi-nso-airpulse-sih26056-key") {
      const elapsed = Math.round(performance.now() - startTime + 8);
      setResponseState({
        status: 401,
        statusText: "Unauthorized",
        durationMs: elapsed,
        data: {
          detail: "Unauthorized: Valid institutional API Key ('X-API-KEY' header) or Bearer token is required."
        }
      });
      return;
    }

    let resultData: any = {};

    if (selectedEndpoint.path === "/health") {
      resultData = {
        status: "healthy",
        database_connected: true,
        storage_initialized: true,
        latest_batch_timestamp: summary.calculation_timestamp,
        active_sectors: Object.keys(summary.sector_breakdown),
        base_reference_p0: summary.base_reference_p0
      };
    } else if (selectedEndpoint.path === "/api/v1/apix/latest") {
      resultData = summary;
    } else if (selectedEndpoint.path === "/api/v1/apix/elasticity") {
      resultData = {
        timestamp: summary.calculation_timestamp,
        horizons_monitored: ["T+1", "T+7", "T+15", "T+30", "T+45"],
        sectors: Object.keys(summary.sector_breakdown),
        lead_time_elasticity_curve: summary.lead_time_elasticity_curve
      };
    } else if (selectedEndpoint.path === "/api/v1/records") {
      const sectorParam = params.sector?.toUpperCase();
      const horizonParam = params.horizon?.toUpperCase();
      const page = parseInt(params.page || "1", 10);
      const pageSize = parseInt(params.page_size || "10", 10);

      let matched = records;
      if (sectorParam && sectorParam !== "ALL") {
        matched = matched.filter((r) => r.sector === sectorParam);
      }
      if (horizonParam && horizonParam !== "ALL") {
        matched = matched.filter((r) => r.horizon === horizonParam);
      }

      const total = matched.length;
      const sliced = matched.slice((page - 1) * pageSize, page * pageSize);

      resultData = {
        total_records: total,
        page,
        page_size: pageSize,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
        records: sliced
      };
    } else if (selectedEndpoint.path === "/api/v1/pipeline/trigger") {
      onTrigger();
      resultData = {
        status: "completed",
        message: `Synchronous run completed successfully. APIx Index: ${summary.apix_index_value}`,
        trigger_time: new Date().toISOString(),
        execution_mode: "synchronous"
      };
    } else if (selectedEndpoint.path === "/api/v1/methodology") {
      resultData = {
        index_title: "Airpulse APIx: Weighted Laspeyres Aviation Price Index",
        governing_authorities: [
          "National Statistical Office (NSO), Ministry of Statistics and Programme Implementation (MoSPI)",
          "Reserve Bank of India (RBI), Department of Economic and Policy Research (DEPR)"
        ],
        problem_statement: "Smart India Hackathon SIH26056: High-Frequency Aviation Inflation Modernization",
        laspeyres_formula: "APIx_t = [ Sum_{i} ( w_i * ( P_{t,i} / P_{0,i} ) ) ] * 100",
        base_reference_price_p0_inr: 4500.0,
        weights_specification: {
          "DEL-BLR": 0.40,
          "BLR-DEL": 0.35,
          "DEL-BOM": 0.25
        },
        horizons_specification: {
          "T+1": 1,
          "T+7": 7,
          "T+15": 15,
          "T+30": 30,
          "T+45": 45
        },
        decomposition_proxies: {
          base_fare_share: 0.78,
          taxes_fees_udf_share: 0.22
        },
        cleansing_protocols: {
          rolling_zscore_cutoff: 2.5,
          luxury_fare_cap_inr: 28000.0,
          synthetic_shadow_price_imputation: true
        }
      };
    }

    const duration = Math.round(performance.now() - startTime + 12);
    setResponseState({
      status: 200,
      statusText: "OK",
      durationMs: duration,
      data: resultData
    });
  };

  const curlCommand = `curl -X ${selectedEndpoint.method} "http://localhost:8000${selectedEndpoint.path}" \\
  -H "X-API-KEY: ${apiKey}" \\
  -H "Content-Type: application/json"`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Institutional REST API Microservice Sandbox
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Test and inspect FastAPI endpoints for Reserve Bank of India & National Statistical Office quantitative models
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auth: <strong>X-API-KEY</strong></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Endpoint List & Request Builder */}
        <div className="lg:col-span-5 space-y-4">
          {/* Endpoints List */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Available FastAPI Microservice Endpoints
            </div>
            {ENDPOINTS.map((ep) => (
              <button
                key={ep.path}
                onClick={() => handleSelectEndpoint(ep)}
                className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                  selectedEndpoint.path === ep.path
                    ? "bg-slate-800 border border-sky-500/50 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ep.method === "GET"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-amber-950 text-amber-400 border border-amber-800"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="font-semibold">{ep.path}</span>
                </div>
                <span className="text-[10px] text-slate-500">{ep.tag}</span>
              </button>
            ))}
          </div>

          {/* Authentication & Parameters Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Request Authentication & Headers
            </div>

            <div>
              <label className="text-xs text-slate-300 font-mono block mb-1 flex items-center justify-between">
                <span>X-API-KEY Header</span>
                {apiKey === "rbi-nso-airpulse-sih26056-key" ? (
                  <span className="text-[10px] text-emerald-400">✓ Valid Institutional Key</span>
                ) : (
                  <span className="text-[10px] text-rose-400">✗ Invalid (Will test 401)</span>
                )}
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setApiKey("rbi-nso-airpulse-sih26056-key")}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Reset Valid Key
                </button>
                <span className="text-[10px] text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setApiKey("invalid-token-test")}
                  className="text-[10px] text-slate-400 hover:text-rose-400"
                >
                  Test 401 Unauthorized
                </button>
              </div>
            </div>

            {/* Parameters if endpoint supports them */}
            {selectedEndpoint.defaultParams && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs text-slate-300 font-mono block">Query Parameters</label>
                {Object.entries(params).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 w-24 truncate">{key}:</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setParams({ ...params, [key]: e.target.value })}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSendRequest}
              className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded font-mono flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Request to FastAPI</span>
            </button>
          </div>
        </div>

        {/* Right: Response Inspector & cURL generator */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active Endpoint Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="px-2 py-0.5 rounded font-bold bg-sky-950 text-sky-400 border border-sky-800">
                  {selectedEndpoint.method}
                </span>
                <span className="font-bold text-white">{selectedEndpoint.path}</span>
              </div>
              <button
                onClick={copyCurl}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied cURL" : "Copy cURL"}</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-sans">{selectedEndpoint.description}</p>
          </div>

          {/* Response Inspector */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Response:</span>
                {responseState ? (
                  <span
                    className={`font-bold flex items-center gap-1 ${
                      responseState.status === 200 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {responseState.status === 200 ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    {responseState.status} {responseState.statusText}
                  </span>
                ) : (
                  <span className="text-slate-500">Awaiting execution</span>
                )}
              </div>
              {responseState && (
                <span className="text-slate-400">Latency: {responseState.durationMs}ms</span>
              )}
            </div>

            <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[500px] overflow-y-auto">
              <code>
                {responseState
                  ? JSON.stringify(responseState.data, null, 2)
                  : "// Click 'Send Request to FastAPI' to invoke endpoint simulation and inspect output payload."}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
