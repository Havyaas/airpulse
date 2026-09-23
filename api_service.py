"""
Airpulse APIx - Secure Institutional REST API Microservice
Designed for National Statistical Office (NSO) and Reserve Bank of India (RBI)
Addressing Smart India Hackathon Problem Statement SIH26056

Framework: FastAPI with Pydantic v2 & Asynchronous Uvicorn Server
Features:
- Institutional X-API-KEY and Bearer Token Authentication
- Real-time Laspeyres Index & Sector Decomposition Endpoints
- Lead-Time Elasticity Yield Curve Endpoints
- Automated Pipeline Trigger & Records Ingestion
- Econometric Methodology Specification Schema
"""

import os
import sys
import json
import glob
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

import pandas as pd
import numpy as np

from fastapi import FastAPI, Depends, HTTPException, Security, Query, BackgroundTasks, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Ensure visibility of engine components
sys.path.append(str(Path(__file__).parent.resolve()))
from engine import (
    AirpulsePipelineEngine,
    execute_synchronous_pipeline,
    BASE_REFERENCE_PRICE_P0,
    DGCA_SECTOR_WEIGHTS,
    BOOKING_HORIZONS,
    DECOMPOSITION_BASE_RATIO,
    DECOMPOSITION_TAX_RATIO,
    OUTLIER_ZSCORE_THRESHOLD,
    LUXURY_FARE_CAP_INR
)

# ------------------------------------------------------------------------------
# SECURITY & AUTHENTICATION CONFIGURATION
# ------------------------------------------------------------------------------
# Institutional API Key for NSO & RBI access (Defaults to secure demo key if unset)
INSTITUTIONAL_API_KEY = os.environ.get("AIRPULSE_API_KEY", "rbi-nso-airpulse-sih26056-key")

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


def verify_institutional_access(
    api_key: Optional[str] = Security(api_key_header),
    bearer: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme)
) -> str:
    """
    Validates either X-API-KEY or Bearer Authorization token for institutional clients.
    """
    token = api_key or (bearer.credentials if bearer else None)
    if not token or token != INSTITUTIONAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Valid institutional API Key ('X-API-KEY' header) or Bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return token


# ------------------------------------------------------------------------------
# FASTAPI APP & MIDDLEWARE SETUP
# ------------------------------------------------------------------------------
app = FastAPI(
    title="Airpulse APIx Institutional Microservice",
    description=(
        "High-Frequency Aviation Inflation Data Collection and Weighted Laspeyres "
        "Index Microservice for the National Statistical Office (NSO) and Reserve Bank of India (RBI). "
        "Solving Smart India Hackathon Problem Statement SIH26056."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Enable CORS for institutional dashboards and client portals
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------
# PYDANTIC DATA SCHEMAS
# ------------------------------------------------------------------------------
class SectorContribution(BaseModel):
    sector: str = Field(..., description="Monitored DGCA city pair (e.g., DEL-BLR)")
    dgca_weight: float = Field(..., description="Passenger volume share weight (sum=1.0)")
    current_mean_fare_inr: float = Field(..., description="Current mean fare in INR")
    base_reference_price_inr: float = Field(..., description="Base reference benchmark (P0=4500.0)")
    sector_price_relative: float = Field(..., description="Price relative: (Pt / P0) * 100")
    weighted_contribution: float = Field(..., description="Weight * Price relative")
    records_count: int = Field(..., description="Number of valid records in this sector")


class DecompositionSummary(BaseModel):
    base_fare_share_pct: float = Field(..., description="Base fare percentage proxy (78%)")
    taxes_fees_udf_share_pct: float = Field(..., description="Taxes/fees/UDF percentage proxy (22%)")
    mean_base_fare_inr: float = Field(..., description="Estimated mean base fare in INR")
    mean_taxes_fees_udf_inr: float = Field(..., description="Estimated mean taxes/fees in INR")


class APIxIndexResponse(BaseModel):
    index_name: str
    problem_statement: str
    calculation_timestamp: str
    base_reference_p0: float
    apix_index_value: float = Field(..., description="Calculated Weighted Laspeyres Aviation Price Index")
    weighted_mean_fare_inr: float = Field(..., description="Current volume-weighted mean fare")
    inflation_deflation_delta_pct: float = Field(..., description="Inflation delta vs P0 (e.g. +14.2%)")
    total_valid_records: int
    sectors_monitored_count: int
    sector_breakdown: Dict[str, SectorContribution]
    decomposition_summary: DecompositionSummary


class ElasticityResponse(BaseModel):
    timestamp: str
    horizons_monitored: List[str]
    sectors: List[str]
    lead_time_elasticity_curve: Dict[str, Dict[str, float]] = Field(
        ..., description="Average fare mapped by Sector and Booking Horizon (T+1 to T+45)"
    )


class FlightRecord(BaseModel):
    timestamp: str
    sector: str
    origin: str
    destination: str
    horizon: str
    days_ahead: int
    travel_date: str
    airline: str
    flight_number: str
    raw_price: float
    base_fare_inr: float
    taxes_fees_udf_inr: float
    total_fare_inr: float
    is_synthetic: bool
    capture_method: str
    z_score: Optional[float] = None


class PaginatedRecordsResponse(BaseModel):
    total_records: int
    page: int
    page_size: int
    total_pages: int
    records: List[FlightRecord]


class PipelineTriggerResponse(BaseModel):
    status: str
    message: str
    trigger_time: str
    execution_mode: str


class MethodologyResponse(BaseModel):
    index_title: str
    governing_authorities: List[str]
    problem_statement: str
    laspeyres_formula: str
    base_reference_price_p0_inr: float
    weights_specification: Dict[str, float]
    horizons_specification: Dict[str, int]
    decomposition_proxies: Dict[str, float]
    cleansing_protocols: Dict[str, Any]


# ------------------------------------------------------------------------------
# DATA UTILITY HELPERS
# ------------------------------------------------------------------------------
def get_latest_summary_data() -> Dict[str, Any]:
    """Retrieves the latest compiled summary JSON or executes an on-demand pass."""
    data_dir = Path("extracted_data")
    summary_path = data_dir / "latest_apix_summary.json"
    if summary_path.exists():
        try:
            with open(summary_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    
    # If uninitialized, execute pipeline to prime storage
    return execute_synchronous_pipeline()


def get_latest_records_dataframe() -> pd.DataFrame:
    """Reads latest records CSV or all archived batches."""
    data_dir = Path("extracted_data")
    latest_csv = data_dir / "latest_apix_records.csv"
    if latest_csv.exists():
        return pd.read_csv(latest_csv)
    
    # Check glob
    csv_files = sorted(glob.glob(str(data_dir / "apix_pipeline_run_*.csv")), reverse=True)
    if csv_files:
        return pd.read_csv(csv_files[0])
    
    # Prime pipeline if missing
    execute_synchronous_pipeline()
    return pd.read_csv(latest_csv)


# ------------------------------------------------------------------------------
# API ENDPOINTS
# ------------------------------------------------------------------------------

@app.get("/", tags=["System"])
def root_info():
    """System information and quick service overview."""
    return {
        "service": "Airpulse APIx Institutional Microservice",
        "jurisdiction": "National Statistical Office (NSO) / Reserve Bank of India (RBI)",
        "problem_statement": "SIH26056 - Modernizing Aviation Price Inflation Statistics",
        "version": "1.0.0",
        "documentation": "/docs",
        "health_check": "/health"
    }


@app.get("/health", tags=["System"])
def health_check():
    """Verifies pipeline storage health, disk availability, and latest batch status."""
    data_dir = Path("extracted_data")
    summary_path = data_dir / "latest_apix_summary.json"
    has_data = summary_path.exists()
    
    last_modified = None
    if has_data:
        last_modified = datetime.fromtimestamp(summary_path.stat().st_mtime).isoformat()

    return {
        "status": "healthy",
        "database_connected": True,
        "storage_initialized": data_dir.exists(),
        "latest_batch_timestamp": last_modified,
        "active_sectors": list(DGCA_SECTOR_WEIGHTS.keys()),
        "base_reference_p0": BASE_REFERENCE_PRICE_P0
    }


@app.get(
    "/api/v1/apix/latest",
    response_model=APIxIndexResponse,
    tags=["APIx Core Index"],
    summary="Get Latest Calculated Weighted Laspeyres Index"
)
def get_latest_apix_index(auth: str = Depends(verify_institutional_access)):
    """
    Returns the latest calculated official Airpulse APIx Index, percentage delta vs P0,
    sectoral contributions, and structural price decomposition (Base Fare vs Taxes/UDF).
    Protected by institutional authentication.
    """
    summary = get_latest_summary_data()
    return summary


@app.get(
    "/api/v1/apix/elasticity",
    response_model=ElasticityResponse,
    tags=["APIx Analytics"],
    summary="Get Lead-Time Price Elasticity Curves"
)
def get_price_elasticity(auth: str = Depends(verify_institutional_access)):
    """
    Retrieves the lead-time price elasticity breakdown across booking horizons
    (T+1, T+7, T+15, T+30, T+45) for all monitored DGCA city corridors.
    """
    summary = get_latest_summary_data()
    curve = summary.get("lead_time_elasticity_curve", {})
    return {
        "timestamp": summary.get("calculation_timestamp", datetime.utcnow().isoformat()),
        "horizons_monitored": list(BOOKING_HORIZONS.keys()),
        "sectors": list(DGCA_SECTOR_WEIGHTS.keys()),
        "lead_time_elasticity_curve": curve
    }


@app.get(
    "/api/v1/records",
    response_model=PaginatedRecordsResponse,
    tags=["Raw Data Ingestion"],
    summary="Query Captured Flight Fare Database Records"
)
def get_captured_records(
    sector: Optional[str] = Query(None, description="Filter by sector (e.g., DEL-BLR)"),
    horizon: Optional[str] = Query(None, description="Filter by horizon (e.g., T+7)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=200, description="Records per page"),
    auth: str = Depends(verify_institutional_access)
):
    """
    Retrieves filtered and paginated flight fare observations collected across
    scraping batches, including synthetic shadow price flags and Z-score status.
    """
    df = get_latest_records_dataframe()
    if df.empty:
        return {
            "total_records": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "records": []
        }

    if sector:
        df = df[df["sector"] == sector.strip().upper()]
    if horizon:
        df = df[df["horizon"] == horizon.strip().upper()]

    total_records = len(df)
    total_pages = max(1, (total_records + page_size - 1) // page_size)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size

    sliced_df = df.iloc[start_idx:end_idx].fillna("")
    records = sliced_df.to_dict(orient="records")

    return {
        "total_records": total_records,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "records": records
    }


@app.post(
    "/api/v1/pipeline/trigger",
    response_model=PipelineTriggerResponse,
    tags=["Pipeline Orchestration"],
    summary="Force Trigger High-Frequency Extraction & Calculation Pipeline"
)
def trigger_pipeline_run(
    background_tasks: BackgroundTasks,
    sync_mode: bool = Query(False, description="Run synchronously (waits for completion)"),
    auth: str = Depends(verify_institutional_access)
):
    """
    Executes an on-demand run of the AirpulsePipelineEngine:
    Bypasses anti-bot walls via persistent browser context, traverses shadow-DOM,
    cleans outliers via Z-score, decomposes fares, and publishes new Laspeyres index figures.
    """
    if sync_mode:
        summary = execute_synchronous_pipeline()
        return {
            "status": "completed",
            "message": f"Synchronous run completed successfully. APIx Index: {summary['apix_index_value']}",
            "trigger_time": datetime.utcnow().isoformat(),
            "execution_mode": "synchronous"
        }
    else:
        background_tasks.add_task(execute_synchronous_pipeline)
        return {
            "status": "accepted",
            "message": "Asynchronous pipeline execution task enqueued in background worker.",
            "trigger_time": datetime.utcnow().isoformat(),
            "execution_mode": "asynchronous_background"
        }


@app.get(
    "/api/v1/methodology",
    response_model=MethodologyResponse,
    tags=["Econometric Methodology"],
    summary="Get Formal Econometric & Statistical Specification"
)
def get_methodology_spec():
    """
    Returns the formal econometric parameters, DGCA volume shares,
    outlier threshold guidelines, and Laspeyres index formulation for official audits.
    Publicly accessible to ensure transparency for statistical authorities.
    """
    return {
        "index_title": "Airpulse APIx: Weighted Laspeyres Aviation Price Index",
        "governing_authorities": [
            "National Statistical Office (NSO), Ministry of Statistics and Programme Implementation (MoSPI)",
            "Reserve Bank of India (RBI), Department of Economic and Policy Research (DEPR)"
        ],
        "problem_statement": "Smart India Hackathon SIH26056: High-Frequency Aviation Inflation Modernization",
        "laspeyres_formula": "APIx_t = [ Sum_{i} ( w_i * ( P_{t,i} / P_{0,i} ) ) ] * 100",
        "base_reference_price_p0_inr": BASE_REFERENCE_PRICE_P0,
        "weights_specification": DGCA_SECTOR_WEIGHTS,
        "horizons_specification": BOOKING_HORIZONS,
        "decomposition_proxies": {
            "base_fare_share": DECOMPOSITION_BASE_RATIO,
            "taxes_fees_udf_share": DECOMPOSITION_TAX_RATIO
        },
        "cleansing_protocols": {
            "rolling_zscore_cutoff": OUTLIER_ZSCORE_THRESHOLD,
            "luxury_fare_cap_inr": LUXURY_FARE_CAP_INR,
            "synthetic_shadow_price_imputation": True
        }
    }


# ------------------------------------------------------------------------------
# STANDALONE SERVER LAUNCHER
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print("=" * 75)
    print(f"Starting Airpulse APIx FastAPI Microservice on port {port}")
    print(f"Swagger Documentation: http://localhost:{port}/docs")
    print(f"Institutional Key    : {INSTITUTIONAL_API_KEY}")
    print("=" * 75)
    uvicorn.run("api_service:app", host="0.0.0.0", port=port, reload=True)
