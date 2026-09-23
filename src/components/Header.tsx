import React from "react";
import { Play, Download, ExternalLink, Activity, Zap, Loader2 } from "lucide-react";

interface HeaderProps {
  activeTab: "dashboard" | "code" | "api" | "methodology";
  setActiveTab: (tab: "dashboard" | "code" | "api" | "methodology") => void;
  onTriggerPipeline: () => void;
  isRunning: boolean;
  currentApix: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onTriggerPipeline,
  isRunning,
  currentApix,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
      {/* Indeterminate loading bar during fake lag */}
      {isRunning && (
        <div className="w-full bg-slate-900 h-1 overflow-hidden relative">
          <div className="w-full h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-pulse" />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("dashboard");
            }}
            className="text-lg font-bold tracking-tight text-white flex items-center gap-2"
          >
            <span className="text-sky-400">Airpulse</span>
            <span>APIx</span>
          </a>
        </div>

        {/* Zone 2: Clean text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`transition-colors whitespace-nowrap ${
              activeTab === "dashboard"
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`transition-colors whitespace-nowrap ${
              activeTab === "code"
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Python Modules
          </button>
          <button
            onClick={() => setActiveTab("api")}
            className={`transition-colors whitespace-nowrap ${
              activeTab === "api"
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            REST Sandbox
          </button>
          <button
            onClick={() => setActiveTab("methodology")}
            className={`transition-colors whitespace-nowrap ${
              activeTab === "methodology"
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Methodology
          </button>
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 font-mono text-xs px-2.5 py-1 bg-slate-900 border border-slate-800 rounded">
            <span className="text-slate-400">APIx:</span>
            <span className="font-bold text-sky-400 tabular-nums">
              {currentApix.toFixed(2)}
            </span>
          </div>

          <button
            onClick={onTriggerPipeline}
            disabled={isRunning}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
              isRunning
                ? "bg-amber-950/70 border border-amber-500/50 text-amber-300 cursor-not-allowed"
                : "bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold hover:shadow-md active:scale-95"
            }`}
            title="Force trigger live data ingestion pipeline"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="font-mono">Loading Data...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Force Trigger</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
