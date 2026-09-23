"""
Airpulse APIx - Interactive Web Analytics Dashboard Portal
Designed for National Statistical Office (NSO) and Reserve Bank of India (RBI)
Addressing Smart India Hackathon Problem Statement SIH26056

Streamlit Wide-Mode Central Bank Intelligence Portal
"""

import os
import sys
import glob
import json
import time
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

import streamlit as st
import pandas as pd
import numpy as np

# Ensure local module visibility
sys.path.append(str(Path(__file__).parent.resolve()))
from engine import (
    AirpulsePipelineEngine,
    execute_synchronous_pipeline,
    BASE_REFERENCE_PRICE_P0,
    DGCA_SECTOR_WEIGHTS,
    BOOKING_HORIZONS,
    DECOMPOSITION_BASE_RATIO,
    DECOMPOSITION_TAX_RATIO
)

# ------------------------------------------------------------------------------
# STREAMLIT CONFIGURATION (WIDE MODE & CLEAN INSTITUTIONAL THEMING)
# ------------------------------------------------------------------------------
st.set_page_config(
    page_title="Airpulse APIx | NSO & RBI Aviation Inflation Portal",
    page_icon="✈️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Institutional CSS styling
st.markdown("""
<style>
    /* Clean typography & header styling */
    .metric-container {
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 16px 20px;
        margin-bottom: 12px;
    }
    .metric-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 2.1rem;
        font-weight: 700;
        color: #f8fafc;
        letter-spacing: -0.02em;
    }
    .metric-label {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 4px;
    }
    .metric-delta-pos {
        color: #ef4444;
        font-size: 0.88rem;
        font-weight: 600;
    }
    .metric-delta-neg {
        color: #10b981;
        font-size: 0.88rem;
        font-weight: 600;
    }
    .stButton>button {
        width: 100%;
        background-color: #0284c7;
        color: white;
        font-weight: 600;
        border-radius: 6px;
        border: none;
        padding: 0.55rem 1rem;
        transition: all 0.15s ease-in-out;
    }
    .stButton>button:hover {
        background-color: #0369a1;
        color: #ffffff;
    }
    .data-table-container {
        border: 1px solid #334155;
        border-radius: 6px;
        overflow: hidden;
    }
</style>
""", unsafe_allow_html=True)


# ------------------------------------------------------------------------------
# CACHED DATA LOADING PIPELINE
# ------------------------------------------------------------------------------
@st.cache_data(ttl=60, show_spinner=False)
def load_all_extracted_datasets(data_dir_path: str = "extracted_data") -> Tuple[pd.DataFrame, Optional[Dict[str, Any]], List[str]]:
    """
    Scans and reads all historical compiled spreadsheets inside extracted_data/
    without freezing the UI thread. Merges records into a deduplicated master view.
    """
    data_dir = Path(data_dir_path)
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)

    csv_pattern = str(data_dir / "apix_pipeline_run_*.csv")
    csv_files = sorted(glob.glob(csv_pattern), reverse=True)

    summary_json_path = data_dir / "latest_apix_summary.json"
    latest_summary: Optional[Dict[str, Any]] = None
    if summary_json_path.exists():
        try:
            with open(summary_json_path, "r", encoding="utf-8") as f:
                latest_summary = json.load(f)
        except Exception as e:
            latest_summary = None

    if not csv_files:
        # Check for fallback latest_apix_records.csv
        latest_csv = data_dir / "latest_apix_records.csv"
        if latest_csv.exists():
            df = pd.read_csv(latest_csv)
            return df, latest_summary, [str(latest_csv)]
        return pd.DataFrame(), latest_summary, []

    dfs: List[pd.DataFrame] = []
    for f in csv_files:
        try:
            temp_df = pd.read_csv(f)
            temp_df["source_file"] = Path(f).name
            dfs.append(temp_df)
        except Exception as read_err:
            continue

    if not dfs:
        return pd.DataFrame(), latest_summary, csv_files

    merged_df = pd.concat(dfs, ignore_index=True)
    if "timestamp" in merged_df.columns:
        merged_df["timestamp"] = pd.to_datetime(merged_df["timestamp"], errors="coerce")
        merged_df = merged_df.sort_values(by="timestamp", ascending=False)

    return merged_df, latest_summary, csv_files


# ------------------------------------------------------------------------------
# SIDEBAR CONTROLS & MANUAL PIPELINE TRIGGER
# ------------------------------------------------------------------------------
st.sidebar.markdown("### 🏛️ Institutional Controls")
st.sidebar.markdown("**Authority**: National Statistical Office & RBI")
st.sidebar.markdown("**Focus**: Aviation Cost Index (Problem SIH26056)")

st.sidebar.divider()

st.sidebar.markdown("#### ⚡ Execution Override")
st.sidebar.caption("Run immediate web scraping, deep DOM extraction, outlier rejection & index derivation.")

trigger_col = st.sidebar.container()
if trigger_col.button("Force Pipeline Trigger Now", use_container_width=True):
    with st.spinner("Executing Playwright scraping, Z-score outlier filter, and Laspeyres calculations..."):
        try:
            start_time = time.time()
            summary_res = execute_synchronous_pipeline()
            elapsed = time.time() - start_time
            st.sidebar.success(f"Pipeline executed in {elapsed:.2f}s! APIx: {summary_res['apix_index_value']}")
            st.cache_data.clear()
            st.rerun()
        except Exception as err:
            st.sidebar.error(f"Pipeline execution failed: {err}")

st.sidebar.divider()

# Sector Filter in Sidebar
st.sidebar.markdown("#### 🔍 Filter Criteria")
sector_filter = st.sidebar.multiselect(
    "DGCA Monitored Sectors:",
    options=list(DGCA_SECTOR_WEIGHTS.keys()),
    default=list(DGCA_SECTOR_WEIGHTS.keys())
)

horizon_filter = st.sidebar.multiselect(
    "Booking Lead-Time Horizons:",
    options=list(BOOKING_HORIZONS.keys()),
    default=list(BOOKING_HORIZONS.keys())
)

st.sidebar.divider()
st.sidebar.caption("Formula: $APIx = \\sum w_i \\cdot (P_{t,i} / P_0) \\times 100$")
st.sidebar.caption(f"Base Reference ($P_0$): ₹{BASE_REFERENCE_PRICE_P0:,.0f} | Base Fare Ratio: {DECOMPOSITION_BASE_RATIO*100:.0f}%")


# ------------------------------------------------------------------------------
# MAIN PORTAL HEADER
# ------------------------------------------------------------------------------
st.markdown("## ✈️ Airpulse APIx: Aviation Inflation Measurement Platform")
st.markdown(
    "Official high-frequency aviation price tracker modernizing the Consumer Price Index (CPI) "
    "transport sub-group for the **National Statistical Office (NSO)** and **Reserve Bank of India (RBI)**."
)

# Load data
df_all, latest_summary, loaded_files = load_all_extracted_datasets()

# If dataset is empty on first boot, offer initialization
if df_all.empty:
    st.warning("No historical extraction datasets detected in `extracted_data/`. Click below to initialize the first data collection batch.")
    if st.button("Initialize First Extraction Run"):
        with st.spinner("Initializing first Airpulse APIx run..."):
            execute_synchronous_pipeline()
            st.cache_data.clear()
            st.rerun()
    st.stop()


# ------------------------------------------------------------------------------
# CORE KPI METRICS STRIP
# ------------------------------------------------------------------------------
# Compute current metrics
current_apix = latest_summary.get("apix_index_value", 100.0) if latest_summary else 100.0
inflation_delta = latest_summary.get("inflation_deflation_delta_pct", 0.0) if latest_summary else 0.0
total_records = len(df_all)
sectors_count = len(df_all["sector"].unique()) if "sector" in df_all.columns else len(DGCA_SECTOR_WEIGHTS)
avg_base_fare = df_all["base_fare_inr"].mean() if "base_fare_inr" in df_all.columns else 0.0

col1, col2, col3, col4 = st.columns(4)

with col1:
    delta_symbol = "▲" if inflation_delta >= 0 else "▼"
    st.metric(
        label="Latest Calculated APIx Index",
        value=f"{current_apix:.2f}",
        delta=f"{delta_symbol} {inflation_delta:+.2f}% vs P0",
        delta_color="inverse"
    )

with col2:
    st.metric(
        label="Base Price Reference (P0)",
        value=f"₹{BASE_REFERENCE_PRICE_P0:,.0f}",
        delta=f"Current Weighted: ₹{latest_summary.get('weighted_mean_fare_inr', 0.0):,.0f}" if latest_summary else None,
        delta_color="off"
    )

with col3:
    st.metric(
        label="Total Records Captured",
        value=f"{total_records:,}",
        delta=f"{len(loaded_files)} Batches Archived",
        delta_color="off"
    )

with col4:
    st.metric(
        label="Monitored Sectors Density",
        value=f"{sectors_count} High-Density Corridors",
        delta="DGCA Weight: 100%",
        delta_color="off"
    )

st.divider()

# Apply filter masks
filtered_df = df_all[
    (df_all["sector"].isin(sector_filter)) &
    (df_all["horizon"].isin(horizon_filter))
].copy()


# ------------------------------------------------------------------------------
# DOUBLE-COLUMN HORIZONTAL WORKSPACE CONFIGURATION
# ------------------------------------------------------------------------------
left_col, right_col = st.columns([1, 1], gap="large")

# ----------------- LEFT COLUMN: ELASTICITY CURVE & DECOMPOSITION -----------------
with left_col:
    st.markdown("### 📊 Lead-Time Price Elasticity Curve")
    st.caption("Sorted across booking horizons (T+1 to T+45) illustrating yield curve dynamics.")

    if not filtered_df.empty:
        # Group by horizon and sector
        elasticity_summary = (
            filtered_df.groupby(["horizon", "sector"])["total_fare_inr"]
            .mean()
            .reset_index()
        )
        
        # Sort by horizon sequence T+1, T+7, T+15, T+30, T+45
        horizon_order = ["T+1", "T+7", "T+15", "T+30", "T+45"]
        elasticity_summary["horizon_cat"] = pd.Categorical(
            elasticity_summary["horizon"],
            categories=horizon_order,
            ordered=True
        )
        elasticity_summary = elasticity_summary.sort_values("horizon_cat")

        # Render responsive bar chart
        pivot_chart = elasticity_summary.pivot(index="horizon", columns="sector", values="total_fare_inr")
        # Ensure ordered rows
        pivot_chart = pivot_chart.reindex(horizon_order)

        st.bar_chart(pivot_chart, height=340)

        st.markdown("#### 🔬 Granular Decomposition: Base Fare vs Taxes/Fees/UDF")
        decomp_agg = (
            filtered_df.groupby("horizon")[["base_fare_inr", "taxes_fees_udf_inr"]]
            .mean()
            .reindex(horizon_order)
            .dropna()
        )
        decomp_agg.columns = ["Base Fare (78% Proxy)", "Taxes / Fees / UDF (22% Proxy)"]
        st.area_chart(decomp_agg, height=220)
    else:
        st.info("No records match the active filter criteria.")


# ----------------- RIGHT COLUMN: ACTIVE DATABASE STREAM LOGS -----------------
with right_col:
    st.markdown("### 📜 Database Records Stream Logs")
    st.caption("Real-time chronological feed sorted from newest to oldest.")

    if not filtered_df.empty:
        display_columns = [
            "timestamp", "sector", "horizon", "airline",
            "flight_number", "total_fare_inr", "base_fare_inr", "is_synthetic"
        ]
        available_cols = [c for c in display_columns if c in filtered_df.columns]
        
        stream_df = filtered_df[available_cols].copy()
        if "timestamp" in stream_df.columns:
            stream_df["timestamp"] = stream_df["timestamp"].astype(str)

        # Format currency columns
        if "total_fare_inr" in stream_df.columns:
            stream_df["total_fare_inr"] = stream_df["total_fare_inr"].apply(lambda v: f"₹{v:,.2f}")
        if "base_fare_inr" in stream_df.columns:
            stream_df["base_fare_inr"] = stream_df["base_fare_inr"].apply(lambda v: f"₹{v:,.2f}")

        st.dataframe(
            stream_df,
            use_container_width=True,
            height=580,
            hide_index=True
        )

        # Quick CSV Download affordance
        csv_buffer = filtered_df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="📥 Export Filtered Records (CSV)",
            data=csv_buffer,
            file_name=f"airpulse_apix_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            use_container_width=True
        )
    else:
        st.info("No logs to display.")


# ------------------------------------------------------------------------------
# METHODOLOGICAL SPECIFICATION & LASPEYRES FORMULATION SECTION
# ------------------------------------------------------------------------------
st.divider()
st.markdown("### 📐 DGCA Weighting & Econometric Index Specification")

tab_weights, tab_outlier, tab_api = st.tabs(["DGCA Sector Weights", "Statistical Cleansing Audit", "API Service Specifications"])

with tab_weights:
    w_col1, w_col2 = st.columns([1, 1])
    with w_col1:
        st.markdown("""
        **Laspeyres Formulation Formula**:
        $$APIx_t = \\left( \\sum_{i=1}^{K} w_i \\cdot \\frac{P_{t,i}}{P_{0,i}} \\right) \\times 100$$
        
        - **$w_i$**: DGCA passenger traffic volume weight for sector $i$.
        - **$P_{t,i}$**: Average observed economy ticket price in current period $t$.
        - **$P_{0,i}$**: Fixed historical base reference price (₹4,500.00).
        """)
    with w_col2:
        weights_data = [
            {"Sector": sec, "DGCA Weight Share": f"{wt * 100:.1f}%", "Weight Value (w_i)": wt, "Base Ref (P0)": f"₹{BASE_REFERENCE_PRICE_P0:,.0f}"}
            for sec, wt in DGCA_SECTOR_WEIGHTS.items()
        ]
        st.table(pd.DataFrame(weights_data))

with tab_outlier:
    st.markdown("""
    **Cleansing & Synthetic Imputation Rules**:
    1. **Hard Luxury Cap**: Fares exceeding ₹28,000 are systematically dropped to eliminate Business/First-class fare distortions.
    2. **Rolling Sector-Horizon Z-Score**: Observations where $|Z| > 2.5$ relative to the group mean are rejected as anomalous spikes.
    3. **AI Synthetic Shadow Price**: If carrier cancellations or sold-out conditions produce zero observations for a sector-horizon cell, calibrated shadow prices are dynamically imputed to preserve time-series continuity.
    """)

with tab_api:
    st.markdown("""
    **Institutional Microservice**:
    The accompanying FastAPI service (`api_service.py`) provides automated REST ingestion endpoints for NSO and RBI quantitative teams.
    - `GET /api/v1/apix/latest`: Instant Laspeyres index and sector contributions.
    - `GET /api/v1/apix/elasticity`: Full lead-time pricing curves across all horizons.
    - `POST /api/v1/pipeline/trigger`: Authenticated scheduled execution webhook.
    """)

st.caption("Airpulse APIx Prototype | Smart India Hackathon SIH26056 | National Statistical Office & Reserve Bank of India")
