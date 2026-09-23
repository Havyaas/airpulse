import React, { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";
import { HistoricalRun, BASE_REFERENCE_PRICE_P0 } from "../engineSimulation";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Info,
  Sliders,
  Shield,
  Maximize2,
  Sparkles,
  Layers
} from "lucide-react";

export interface ProjectedPoint {
  runIndex: number;
  runLabel: string;
  shortLabel: string;
  projectedApix: number;
  projectedMeanFare: number;
  upperBound: number;
  lowerBound: number;
  displayTime: string;
  stepAhead: number;
  isProjected: true;
}

interface ApixVolatilityChartProps {
  historicalRuns: HistoricalRun[];
  onTriggerRun?: () => void;
  isRunning?: boolean;
  selectedSector?: string;
  onSectorChange?: (sector: string) => void;
}

export const ApixVolatilityChart: React.FC<ApixVolatilityChartProps> = ({
  historicalRuns,
  onTriggerRun,
  isRunning = false,
  selectedSector = "ALL",
  onSectorChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // User interactive display toggles
  const [showVolatilityBand, setShowVolatilityBand] = useState<boolean>(true);
  const [showBaseReference, setShowBaseReference] = useState<boolean>(true);
  const [showTrendProjection, setShowTrendProjection] = useState<boolean>(true);
  const [internalSector, setInternalSector] = useState<string>("ALL");
  const activeSector = selectedSector ?? internalSector;

  const handleSectorChange = (sector: string) => {
    setInternalSector(sector);
    if (onSectorChange) onSectorChange(sector);
  };
  const [hoveredData, setHoveredData] = useState<{
    isProjected: boolean;
    runLabel: string;
    displayTime: string;
    apixIndex: number;
    meanFare: number;
    delta?: number;
    validRecords?: number;
    cleansed?: number;
    rSquared?: number;
    slope?: number;
    stepAhead?: number;
  } | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(800);

  // Maintain only the last 10 runs for this specific visualization
  const last10Runs = useMemo(() => {
    return historicalRuns.slice(-10);
  }, [historicalRuns]);

  // Isolate specific sector data or fall back to composite APIx
  const chartRuns = useMemo(() => {
    return last10Runs.map((r) => {
      if (activeSector !== "ALL" && r.sectorBreakdown && r.sectorBreakdown[activeSector]) {
        const sec = r.sectorBreakdown[activeSector];
        const spread = Math.round((sec.priceRelativeIndex * 0.022) * 100) / 100;
        return {
          ...r,
          apixIndex: sec.priceRelativeIndex,
          weightedMeanFare: sec.meanFare,
          upperVolatilityBound: Math.round((sec.priceRelativeIndex + spread) * 100) / 100,
          lowerVolatilityBound: Math.round((sec.priceRelativeIndex - spread) * 100) / 100,
          validRecordsCount: sec.recordsCount
        };
      }
      return r;
    });
  }, [last10Runs, activeSector]);

  // Statistical calculations across the 10 runs
  const stats = useMemo(() => {
    if (chartRuns.length === 0) {
      return { mean: 100, stdDev: 0, min: 100, max: 100, latestDelta: 0, cv: 0 };
    }
    const values = chartRuns.map((r) => r.apixIndex);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = chartRuns[chartRuns.length - 1];
    const prev = chartRuns.length > 1 ? chartRuns[chartRuns.length - 2] : latest;
    const latestDelta = Math.round((latest.apixIndex - prev.apixIndex) * 100) / 100;
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    return {
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      latestDelta,
      cv: Math.round(cv * 100) / 100
    };
  }, [chartRuns]);

  // OLS Linear Regression & 3-Step Ahead Trend Projection
  const projection = useMemo(() => {
    const N = chartRuns.length;
    if (N < 2) {
      return {
        slope: 0,
        intercept: 100,
        rSquared: 0,
        projectedPoints: [] as ProjectedPoint[]
      };
    }

    const xValues = chartRuns.map((_, i) => i);
    const yValues = chartRuns.map((r) => r.apixIndex);

    const xMean = (N - 1) / 2;
    const yMean = yValues.reduce((a, b) => a + b, 0) / N;

    let num = 0;
    let den = 0;
    for (let i = 0; i < N; i++) {
      num += (xValues[i] - xMean) * (yValues[i] - yMean);
      den += Math.pow(xValues[i] - xMean, 2);
    }

    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // Calculate R² (coefficient of determination)
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < N; i++) {
      const predY = slope * i + intercept;
      ssTot += Math.pow(yValues[i] - yMean, 2);
      ssRes += Math.pow(yValues[i] - predY, 2);
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

    // Generate 3 future points (x = N, N+1, N+2)
    const latestRun = chartRuns[N - 1];
    const latestTime = new Date(latestRun.timestamp);
    const projectedPoints: ProjectedPoint[] = [];

    const residualVariance = N > 2 ? ssRes / (N - 2) : 1.0;
    const standardError = Math.sqrt(residualVariance);

    for (let k = 1; k <= 3; k++) {
      const xFuture = (N - 1) + k;
      const predY = Math.round((slope * xFuture + intercept) * 100) / 100;
      const futureTime = new Date(latestTime.getTime() + k * 15 * 60000);
      const timeStr = futureTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      // Increasing uncertainty cone for projection
      const predictionInterval = standardError * Math.sqrt(1 + 1 / N + Math.pow(xFuture - xMean, 2) / den);
      const upperBound = Math.round((predY + predictionInterval) * 100) / 100;
      const lowerBound = Math.round((predY - predictionInterval) * 100) / 100;

      const meanFare = Math.round((predY / 100) * BASE_REFERENCE_PRICE_P0);
      const futureIndex = latestRun.runIndex + k;

      projectedPoints.push({
        runIndex: futureIndex,
        runLabel: `Run #${futureIndex} (Proj)`,
        shortLabel: `Proj +${k}`,
        projectedApix: predY,
        projectedMeanFare: meanFare,
        upperBound,
        lowerBound,
        displayTime: timeStr,
        stepAhead: k,
        isProjected: true
      });
    }

    return {
      slope: Math.round(slope * 1000) / 1000,
      intercept: Math.round(intercept * 100) / 100,
      rSquared: Math.round(rSquared * 100) / 100,
      projectedPoints
    };
  }, [chartRuns]);

  // Responsive container observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Main D3 Rendering Engine
  useEffect(() => {
    if (!svgRef.current || chartRuns.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous canvas

    const width = containerWidth;
    const height = 340;
    const margin = { top: 25, right: showTrendProjection ? 45 : 35, bottom: 45, left: 55 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    if (innerWidth <= 0 || innerHeight <= 0) return;

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Definitions (Gradients & Glow Filters)
    const defs = svg.append("defs");

    // Primary line gradient
    const lineGradient = defs
      .append("linearGradient")
      .attr("id", "apix-line-gradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", innerWidth)
      .attr("y2", 0);

    lineGradient.append("stop").attr("offset", "0%").attr("stop-color", "#38bdf8");
    lineGradient.append("stop").attr("offset", "60%").attr("stop-color", "#0284c7");
    lineGradient.append("stop").attr("offset", "100%").attr("stop-color", "#06b6d4");

    // Area Fill Gradient
    const areaGradient = defs
      .append("linearGradient")
      .attr("id", "apix-area-gradient")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");

    areaGradient.append("stop").attr("offset", "0%").attr("stop-color", "#0284c7").attr("stop-opacity", 0.35);
    areaGradient.append("stop").attr("offset", "80%").attr("stop-color", "#0284c7").attr("stop-opacity", 0.05);
    areaGradient.append("stop").attr("offset", "100%").attr("stop-color", "#0284c7").attr("stop-opacity", 0.0);

    // Volatility corridor gradient
    const bandGradient = defs
      .append("linearGradient")
      .attr("id", "volatility-band-gradient")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");

    bandGradient.append("stop").attr("offset", "0%").attr("stop-color", "#38bdf8").attr("stop-opacity", 0.15);
    bandGradient.append("stop").attr("offset", "100%").attr("stop-color", "#38bdf8").attr("stop-opacity", 0.04);

    // Projected corridor gradient (Amber/Gold)
    const projBandGradient = defs
      .append("linearGradient")
      .attr("id", "proj-band-gradient")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");

    projBandGradient.append("stop").attr("offset", "0%").attr("stop-color", "#f59e0b").attr("stop-opacity", 0.22);
    projBandGradient.append("stop").attr("offset", "100%").attr("stop-color", "#f59e0b").attr("stop-opacity", 0.04);

    // 1. Scales
    // Domain labels: 10 historical + optional 3 projected
    const domainLabels = showTrendProjection
      ? [...chartRuns.map((d) => d.runLabel), ...projection.projectedPoints.map((p) => p.runLabel)]
      : chartRuns.map((d) => d.runLabel);

    const xScale = d3
      .scalePoint<string>()
      .domain(domainLabels)
      .range([0, innerWidth])
      .padding(0.25);

    // Y Scale: Range across min/max with volatility & projection envelope
    let allValues = chartRuns.map((d) => d.apixIndex);
    if (showVolatilityBand) {
      allValues.push(...chartRuns.map((d) => d.lowerVolatilityBound));
      allValues.push(...chartRuns.map((d) => d.upperVolatilityBound));
    }
    if (showTrendProjection) {
      allValues.push(...projection.projectedPoints.map((p) => p.projectedApix));
      allValues.push(...projection.projectedPoints.map((p) => p.upperBound));
      allValues.push(...projection.projectedPoints.map((p) => p.lowerBound));
    }

    const minVal = d3.min(allValues) ?? 100;
    const maxVal = d3.max(allValues) ?? 140;

    const yMin = Math.min(95, Math.floor(minVal - 3));
    const yMax = Math.ceil(maxVal + 4);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0])
      .nice();

    // 2. Background Grid Lines
    const yAxisGrid = d3
      .axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => "")
      .ticks(6);

    g.append("g")
      .attr("class", "grid-lines")
      .call(yAxisGrid)
      .selectAll("line")
      .attr("stroke", "#1e293b")
      .attr("stroke-dasharray", "3,3")
      .attr("stroke-opacity", 0.7);

    g.select(".grid-lines .domain").remove();

    // 3. Base Reference (P0 = 100.0) Benchmark Line
    if (showBaseReference && yMin <= 100 && yMax >= 100) {
      const p0Y = yScale(100);
      const refGroup = g.append("g").attr("class", "p0-reference-group");

      refGroup
        .append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", p0Y)
        .attr("y2", p0Y)
        .attr("stroke", "#94a3b8")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("stroke-opacity", 0.7);

      refGroup
        .append("text")
        .attr("x", innerWidth - 6)
        .attr("y", p0Y - 6)
        .attr("text-anchor", "end")
        .attr("fill", "#94a3b8")
        .attr("font-family", "monospace")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .text("P0 Base Ref (100.00)");
    }

    // 4. Volatility Confidence Band Corridor (if enabled)
    if (showVolatilityBand) {
      const areaBandGenerator = d3
        .area<HistoricalRun>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.runLabel) ?? 0)
        .y0((d) => yScale(d.lowerVolatilityBound))
        .y1((d) => yScale(d.upperVolatilityBound));

      g.append("path")
        .datum(chartRuns)
        .attr("class", "volatility-band")
        .attr("fill", "url(#volatility-band-gradient)")
        .attr("stroke", "#0284c7")
        .attr("stroke-width", 0.75)
        .attr("stroke-dasharray", "2,2")
        .attr("stroke-opacity", 0.5)
        .attr("d", areaBandGenerator);
    }

    // 5. Gradient Area Fill under Main Historical Line
    const areaGenerator = d3
      .area<HistoricalRun>()
      .curve(d3.curveMonotoneX)
      .x((d) => xScale(d.runLabel) ?? 0)
      .y0(innerHeight)
      .y1((d) => yScale(d.apixIndex));

    g.append("path")
      .datum(chartRuns)
      .attr("class", "apix-area-fill")
      .attr("fill", "url(#apix-area-gradient)")
      .attr("d", areaGenerator);

    // 6. Main APIx Index Trend Line (Historical 10 runs)
    const lineGenerator = d3
      .line<HistoricalRun>()
      .curve(d3.curveMonotoneX)
      .x((d) => xScale(d.runLabel) ?? 0)
      .y((d) => yScale(d.apixIndex));

    const path = g
      .append("path")
      .datum(chartRuns)
      .attr("class", "apix-trend-line")
      .attr("fill", "none")
      .attr("stroke", "url(#apix-line-gradient)")
      .attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", lineGenerator);

    // Entrance transition for historical line
    const totalLength = (path.node() as SVGPathElement)?.getTotalLength() || 1000;
    path
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    // 7. LINEAR TREND PROJECTION OVERLAY (Next 3 Simulated Runs)
    if (showTrendProjection && projection.projectedPoints.length > 0) {
      const lastHistorical = chartRuns[chartRuns.length - 1];
      const projectionLineData = [
        { label: lastHistorical.runLabel, apix: lastHistorical.apixIndex, isHistorical: true },
        ...projection.projectedPoints.map((p) => ({
          label: p.runLabel,
          apix: p.projectedApix,
          isHistorical: false
        }))
      ];

      // Projected confidence cone (prediction interval)
      const projConeData = [
        {
          label: lastHistorical.runLabel,
          upper: lastHistorical.upperVolatilityBound,
          lower: lastHistorical.lowerVolatilityBound
        },
        ...projection.projectedPoints.map((p) => ({
          label: p.runLabel,
          upper: p.upperBound,
          lower: p.lowerBound
        }))
      ];

      const projConeGenerator = d3
        .area<{ label: string; upper: number; lower: number }>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) ?? 0)
        .y0((d) => yScale(d.lower))
        .y1((d) => yScale(d.upper));

      g.append("path")
        .datum(projConeData)
        .attr("class", "projection-cone")
        .attr("fill", "url(#proj-band-gradient)")
        .attr("stroke", "#f59e0b")
        .attr("stroke-width", 0.75)
        .attr("stroke-dasharray", "3,3")
        .attr("stroke-opacity", 0.6)
        .attr("d", projConeGenerator);

      // Regression Overlay Trend Line (Across whole domain from run 1 to run 13)
      const fullTrendData = domainLabels.map((label, idx) => {
        const predVal = projection.slope * idx + projection.intercept;
        return { label, val: predVal };
      });

      const regressionLineGen = d3
        .line<{ label: string; val: number }>()
        .x((d) => xScale(d.label) ?? 0)
        .y((d) => yScale(d.val));

      g.append("path")
        .datum(fullTrendData)
        .attr("class", "linear-regression-trend")
        .attr("fill", "none")
        .attr("stroke", "#f59e0b")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "4,4")
        .attr("stroke-opacity", 0.5)
        .attr("d", regressionLineGen);

      // Distinct Forecast connector path
      const projLineGen = d3
        .line<{ label: string; apix: number; isHistorical: boolean }>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) ?? 0)
        .y((d) => yScale(d.apix));

      g.append("path")
        .datum(projectionLineData)
        .attr("class", "projection-connector-line")
        .attr("fill", "none")
        .attr("stroke", "#f59e0b")
        .attr("stroke-width", 2.2)
        .attr("stroke-dasharray", "5,4")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", projLineGen);

      // Projected node points (Diamonds with glowing pulse)
      const projPointsGroup = g.append("g").attr("class", "projected-nodes");

      projection.projectedPoints.forEach((p, idx) => {
        const cx = xScale(p.runLabel) ?? 0;
        const cy = yScale(p.projectedApix);

        // Halo circle
        projPointsGroup
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 7)
          .attr("fill", "#f59e0b")
          .attr("fill-opacity", 0.18)
          .attr("class", "animate-pulse");

        // Diamond node
        const size = 5.5;
        const diamondPath = `M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`;

        projPointsGroup
          .append("path")
          .attr("d", diamondPath)
          .attr("fill", "#fbbf24")
          .attr("stroke", "#78350f")
          .attr("stroke-width", 1.5)
          .attr("class", "cursor-pointer transition-transform hover:scale-125")
          .on("mouseenter", () => {
            setHoveredData({
              isProjected: true,
              runLabel: p.runLabel,
              displayTime: p.displayTime,
              apixIndex: p.projectedApix,
              meanFare: p.projectedMeanFare,
              rSquared: projection.rSquared,
              slope: projection.slope,
              stepAhead: p.stepAhead
            });
            focusLine.attr("x1", cx).attr("x2", cx).style("opacity", 0.85);
          })
          .on("mouseleave", () => {
            setHoveredData(null);
            focusLine.style("opacity", 0);
          });

        // Top value label
        projPointsGroup
          .append("text")
          .attr("x", cx)
          .attr("y", cy - 10)
          .attr("text-anchor", "middle")
          .attr("fill", "#fbbf24")
          .attr("font-family", "monospace")
          .attr("font-size", "9.5px")
          .attr("font-weight", "bold")
          .text(`${p.projectedApix.toFixed(1)}`);
      });
    }

    // 8. Axes
    // X Axis
    const xAxis = d3.axisBottom(xScale).tickSize(6);
    const xAxisGroup = g
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.select(".domain").attr("stroke", "#334155");
    xAxisGroup.selectAll(".tick line").attr("stroke", "#334155");
    xAxisGroup
      .selectAll(".tick text")
      .attr("fill", (d) => (String(d).includes("(Proj)") ? "#fbbf24" : "#94a3b8"))
      .attr("font-family", "monospace")
      .attr("font-size", "10px")
      .attr("dy", "1.2em");

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat((d) => `${d}`);

    const yAxisGroup = g.append("g").attr("class", "y-axis").call(yAxis);

    yAxisGroup.select(".domain").attr("stroke", "#334155");
    yAxisGroup.selectAll(".tick line").attr("stroke", "#334155");
    yAxisGroup
      .selectAll(".tick text")
      .attr("fill", "#94a3b8")
      .attr("font-family", "monospace")
      .attr("font-size", "11px");

    // Y Axis Label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -42)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-family", "monospace")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .text(
        activeSector !== "ALL"
          ? `${activeSector} RELATIVE INDEX (Base P0 = 100.00)`
          : "APIx INDEX VALUE (Base P0 = 100.00)"
      );

    // 9. Interactive Nodes & Vertical Focus Bar
    const focusLine = g
      .append("line")
      .attr("class", "focus-crosshair")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("opacity", 0);

    const pointsGroup = g.append("g").attr("class", "data-points");

    chartRuns.forEach((d, i) => {
      const cx = xScale(d.runLabel) ?? 0;
      const cy = yScale(d.apixIndex);
      const isLatest = i === chartRuns.length - 1;

      // Outer glow circle for latest run
      if (isLatest) {
        pointsGroup
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 9)
          .attr("fill", "#38bdf8")
          .attr("fill-opacity", 0.25)
          .attr("class", "animate-ping");
      }

      // Outer ring
      pointsGroup
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", isLatest ? 5.5 : 4)
        .attr("fill", isLatest ? "#38bdf8" : "#0f172a")
        .attr("stroke", isLatest ? "#ffffff" : "#38bdf8")
        .attr("stroke-width", 2)
        .attr("class", "cursor-pointer transition-all hover:scale-125")
        .on("mouseenter", () => {
          setHoveredData({
            isProjected: false,
            runLabel: d.runLabel,
            displayTime: d.displayTime,
            apixIndex: d.apixIndex,
            meanFare: d.weightedMeanFare,
            delta: d.runOverRunDelta,
            validRecords: d.validRecordsCount,
            cleansed: d.anomalyCleansedCount
          });
          focusLine.attr("x1", cx).attr("x2", cx).style("opacity", 0.85);
        })
        .on("mouseleave", () => {
          setHoveredData(null);
          focusLine.style("opacity", 0);
        });

      // Quick top label for latest run
      if (isLatest && !showTrendProjection) {
        pointsGroup
          .append("text")
          .attr("x", cx)
          .attr("y", cy - 11)
          .attr("text-anchor", "middle")
          .attr("fill", "#38bdf8")
          .attr("font-family", "monospace")
          .attr("font-size", "10px")
          .attr("font-weight", "bold")
          .text(`${d.apixIndex.toFixed(2)}`);
      }
    });

    // Hover overlay for mouse tracking
    const overlay = g
      .append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    overlay
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        type Candidate =
          | { label: string; isProjected: false; data: HistoricalRun }
          | { label: string; isProjected: true; pData: ProjectedPoint };

        const allCandidates: Candidate[] = [
          ...chartRuns.map((r) => ({
            label: r.runLabel,
            isProjected: false as const,
            data: r
          })),
          ...(showTrendProjection
            ? projection.projectedPoints.map((p) => ({
                label: p.runLabel,
                isProjected: true as const,
                pData: p
              }))
            : [])
        ];

        let closest = allCandidates[0];
        let closestDist = Infinity;

        allCandidates.forEach((item) => {
          const px = xScale(item.label) ?? 0;
          const dist = Math.abs(px - mouseX);
          if (dist < closestDist) {
            closestDist = dist;
            closest = item;
          }
        });

        const px = xScale(closest.label) ?? 0;
        focusLine.attr("x1", px).attr("x2", px).style("opacity", 0.85);

        if (closest.isProjected) {
          const p = closest.pData;
          setHoveredData({
            isProjected: true,
            runLabel: p.runLabel,
            displayTime: p.displayTime,
            apixIndex: p.projectedApix,
            meanFare: p.projectedMeanFare,
            rSquared: projection.rSquared,
            slope: projection.slope,
            stepAhead: p.stepAhead
          });
        } else {
          const d = closest.data;
          setHoveredData({
            isProjected: false,
            runLabel: d.runLabel,
            displayTime: d.displayTime,
            apixIndex: d.apixIndex,
            meanFare: d.weightedMeanFare,
            delta: d.runOverRunDelta,
            validRecords: d.validRecordsCount,
            cleansed: d.anomalyCleansedCount
          });
        }
      })
      .on("mouseleave", () => {
        setHoveredData(null);
        focusLine.style("opacity", 0);
      });
  }, [chartRuns, containerWidth, showVolatilityBand, showBaseReference, showTrendProjection, projection, activeSector]);

  const latestRun = chartRuns[chartRuns.length - 1];
  const isUp = stats.latestDelta >= 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      {/* Header & Controls Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-sky-950/80 border border-sky-800 flex items-center justify-center text-sky-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {activeSector !== "ALL"
                  ? `Historical Route Trends: ${activeSector}`
                  : "Historical APIx Volatility Trends"}
              </h3>
              {activeSector !== "ALL" ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                  {activeSector} Isolated
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  D3.js Dynamic Engine
                </span>
              )}
              {showTrendProjection && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  OLS Forecast (+3 Runs)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeSector !== "ALL"
                ? `High-frequency pricing relative and yield dispersion for ${activeSector} across the last 10 simulation runs`
                : "High-frequency rolling yield dispersion across the last 10 simulation runs with forward projection"}
            </p>
          </div>
        </div>

        {/* Display Toggles */}
        <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
          {/* Sector Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded px-2 py-1">
            <span className="text-slate-400 font-mono text-[11px]">Sector:</span>
            <select
              value={activeSector}
              onChange={(e) => handleSectorChange(e.target.value)}
              className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">All (Composite)</option>
              <option value="DEL-BLR" className="bg-slate-900 text-white">DEL-BLR (40%)</option>
              <option value="BLR-DEL" className="bg-slate-900 text-white">BLR-DEL (35%)</option>
              <option value="DEL-BOM" className="bg-slate-900 text-white">DEL-BOM (25%)</option>
            </select>
          </div>

          {/* Linear Trend Projection Toggle */}
          <button
            onClick={() => setShowTrendProjection(!showTrendProjection)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
              showTrendProjection
                ? "bg-amber-950/70 border-amber-500/60 text-amber-300 font-semibold shadow-sm"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle OLS Linear Trend Projection for next 3 runs"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Trend Projection (+3)</span>
          </button>

          {/* Volatility Band Toggle */}
          <button
            onClick={() => setShowVolatilityBand(!showVolatilityBand)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
              showVolatilityBand
                ? "bg-slate-800 border-sky-500/50 text-sky-300"
                : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>±σ Corridor</span>
          </button>

          {/* Base Reference Toggle */}
          <button
            onClick={() => setShowBaseReference(!showBaseReference)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
              showBaseReference
                ? "bg-slate-800 border-slate-700 text-slate-300"
                : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>P0 (100.0)</span>
          </button>
        </div>
      </div>

      {/* Quantitative Volatility & Econometric Projection Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950 border border-slate-800/80 rounded p-2.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">
            {activeSector !== "ALL" ? `Latest ${activeSector} (#10)` : "Latest Run (#10)"}
          </div>
          <div className="text-lg font-bold font-mono text-white mt-0.5 flex items-baseline gap-2">
            <span>{latestRun?.apixIndex.toFixed(2) ?? "100.00"}</span>
            <span
              className={`text-xs font-semibold font-mono flex items-center ${
                isUp ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isUp ? "+" : ""}
              {stats.latestDelta.toFixed(2)} Δ
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {activeSector !== "ALL"
              ? `Route Fare: ₹${latestRun?.weightedMeanFare.toLocaleString()}`
              : `Weighted Mean: ₹${latestRun?.weightedMeanFare.toLocaleString()}`}
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded p-2.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">10-Run Mean (μ)</div>
          <div className="text-lg font-bold font-mono text-sky-400 mt-0.5">
            {stats.mean.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Base index reference: 100.0
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded p-2.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Volatility (σ)</div>
          <div className="text-lg font-bold font-mono text-amber-400 mt-0.5 flex items-baseline gap-1">
            <span>±{stats.stdDev.toFixed(2)}</span>
            <span className="text-xs text-slate-500 font-normal">pts</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            CV: {stats.cv.toFixed(2)}% (Spread)
          </div>
        </div>

        {/* Projection Drift / Trend Summary */}
        <div className="bg-slate-950 border border-amber-950/80 rounded p-2.5">
          <div className="text-[11px] font-mono text-amber-400/90 uppercase flex items-center justify-between">
            <span>OLS Drift (Slope)</span>
            <span className="text-[10px] text-slate-500">R²: {projection.rSquared.toFixed(2)}</span>
          </div>
          <div className="text-lg font-bold font-mono text-amber-300 mt-0.5 flex items-baseline gap-1">
            <span>{projection.slope >= 0 ? "+" : ""}{projection.slope.toFixed(2)}</span>
            <span className="text-xs text-slate-400 font-normal">pts/run</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            {projection.slope > 0 ? "Upward cost trend" : projection.slope < 0 ? "Disinflationary" : "Stationary"}
          </div>
        </div>
      </div>

      {/* D3 Chart Canvas Container */}
      <div ref={containerRef} className="relative w-full overflow-hidden">
        <svg ref={svgRef} className="w-full select-none" />

        {/* Dynamic Hover Tooltip Callout */}
        {hoveredData && (
          <div
            className={`absolute top-3 right-4 rounded-lg p-3 shadow-2xl backdrop-blur text-xs font-mono space-y-1 z-10 pointer-events-none transition-all ${
              hoveredData.isProjected
                ? "bg-slate-950/95 border border-amber-500/70 text-amber-100 shadow-amber-950/50"
                : "bg-slate-950/95 border border-sky-500/60 text-slate-100 shadow-sky-950/50"
            }`}
            style={{ minWidth: "230px" }}
          >
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span
                className={`font-bold ${
                  hoveredData.isProjected ? "text-amber-400" : "text-sky-400"
                }`}
              >
                {hoveredData.runLabel}
              </span>
              <span className="text-slate-400 text-[11px]">{hoveredData.displayTime}</span>
            </div>

            {hoveredData.isProjected ? (
              <>
                <div className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  OLS Linear Extrapolation (+{hoveredData.stepAhead} Runs)
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Projected APIx:</span>
                  <span className="font-bold text-amber-300 text-sm">
                    {hoveredData.apixIndex.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Projected Fare:</span>
                  <span className="text-white font-semibold">
                    ₹{hoveredData.meanFare.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Trend Drift:</span>
                  <span className="text-amber-400 font-mono">
                    {hoveredData.slope && hoveredData.slope >= 0 ? "+" : ""}
                    {hoveredData.slope?.toFixed(2)} pts/step
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                  <span>Model Fit: R² = {hoveredData.rSquared}</span>
                  <span>95% Conf Band</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">APIx Index:</span>
                  <span className="font-bold text-white text-sm">
                    {hoveredData.apixIndex.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mean Airfare:</span>
                  <span className="text-slate-200">
                    ₹{hoveredData.meanFare.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Run-on-Run Δ:</span>
                  <span
                    className={`font-semibold ${
                      (hoveredData.delta ?? 0) >= 0 ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {(hoveredData.delta ?? 0) >= 0 ? "+" : ""}
                    {hoveredData.delta?.toFixed(2)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                  <span>Samples: {hoveredData.validRecords}</span>
                  <span>Cleansed: {hoveredData.cleansed}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3-Step Forward Projection Cards (when enabled) */}
      {showTrendProjection && projection.projectedPoints.length > 0 && (
        <div className="bg-slate-950/70 border border-amber-950/60 rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-amber-300 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              OLS Forecast Overlay for Next 3 Simulated Runs
            </span>
            <span className="text-slate-400 text-[11px]">
              Formula: <strong className="text-slate-200">APIx(t) = {projection.intercept} + ({projection.slope} × t)</strong> | R² = {projection.rSquared}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {projection.projectedPoints.map((proj) => {
              const vsCurrent = Math.round((proj.projectedApix - (latestRun?.apixIndex ?? 100)) * 100) / 100;
              return (
                <div
                  key={proj.runLabel}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded p-2.5 transition-colors text-xs font-mono"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold text-amber-400">{proj.runLabel}</span>
                    <span>+{proj.stepAhead * 15}m ({proj.displayTime})</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-base font-bold text-white">
                      {proj.projectedApix.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        vsCurrent >= 0 ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {vsCurrent >= 0 ? "+" : ""}
                      {vsCurrent.toFixed(2)} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 border-t border-slate-800 pt-1">
                    <span>Est: ₹{proj.projectedMeanFare.toLocaleString()}</span>
                    <span>Cone: ±{(proj.upperBound - proj.projectedApix).toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Legend */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
            <span>APIx Laspeyres Curve (Past 10)</span>
          </span>

          {showTrendProjection && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-400" />
              <span className="text-amber-300">OLS Forecast (+3 Runs)</span>
            </span>
          )}

          {showVolatilityBand && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 bg-sky-500/20 border border-sky-400/40 rounded-sm" />
              <span>±σ Volatility Corridor</span>
            </span>
          )}

          {showBaseReference && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dashed border-slate-400" />
              <span>P0 Benchmark (100.0)</span>
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500">
          Source: Shadow DOM Traversal & DGCA Trunk Route Aggregation
        </div>
      </div>
    </div>
  );
};
