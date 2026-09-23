import React, { useState } from "react";
import { CODE_FILES_CATALOG, CodeFileMeta } from "../codeFiles";
import { Copy, Check, Download, FileCode, CheckCircle, Terminal } from "lucide-react";

export const CodeExplorerTab: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>("engine");
  const [copied, setCopied] = useState<boolean>(false);

  const currentFile = CODE_FILES_CATALOG.find((f) => f.id === selectedFileId) || CODE_FILES_CATALOG[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (file: CodeFileMeta) => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", file.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    CODE_FILES_CATALOG.forEach((file) => {
      handleDownload(file);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Production-Grade Python Architecture Artifacts
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Full complete code for SIH26056: Playwright scraper engine, Streamlit analytics portal & FastAPI microservice
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadAll}
            className="px-3 py-1.5 text-xs font-semibold text-sky-400 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-500/30 rounded flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download All 3 Python Files (.py)
          </button>
        </div>
      </div>

      {/* File Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-lg">
        {CODE_FILES_CATALOG.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setSelectedFileId(f.id);
              setCopied(false);
            }}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium flex items-center gap-2 transition-colors ${
              selectedFileId === f.id
                ? "bg-sky-500 text-slate-950 font-bold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{f.name}</span>
            <span className="text-[10px] opacity-75">({f.lines} lines)</span>
          </button>
        ))}
      </div>

      {/* File Metadata Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-mono text-white">{currentFile.name}</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-800 text-sky-400 rounded">
              {currentFile.badge}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">{currentFile.description}</p>
          <div className="mt-2 text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <span className="text-emerald-400">SIH26056 Mapping:</span>
            <span>{currentFile.sihMapping}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-mono font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied!" : "Copy Code"}</span>
          </button>
          <button
            onClick={() => handleDownload(currentFile)}
            className="px-3 py-1.5 text-xs font-mono font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {currentFile.name}</span>
          </button>
        </div>
      </div>

      {/* Execution Snippet Tip */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono flex items-center gap-2 text-slate-400">
        <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
        {currentFile.id === "engine" && (
          <span>Execute standalone: <strong className="text-white">python engine.py</strong></span>
        )}
        {currentFile.id === "app" && (
          <span>Execute Streamlit dashboard: <strong className="text-white">streamlit run app.py</strong></span>
        )}
        {currentFile.id === "api" && (
          <span>Execute FastAPI microservice: <strong className="text-white">uvicorn api_service:app --reload --port 8000</strong></span>
        )}
        {currentFile.id === "requirements" && (
          <span>Install dependencies: <strong className="text-white">pip install -r requirements.txt && playwright install chromium</strong></span>
        )}
        {currentFile.id === "readme" && (
          <span>Review documentation for complete econometric formulations and Central Bank guidelines.</span>
        )}
      </div>

      {/* Code Viewer */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>{currentFile.name} — {currentFile.lines} lines</span>
          <span>UTF-8 · Python 3.10+ Compliant</span>
        </div>
        <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[700px] overflow-y-auto">
          <code>{currentFile.content}</code>
        </pre>
      </div>
    </div>
  );
};
