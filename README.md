# Airpulse APIx

## High-Frequency Aviation Inflation Measurement Platform

**Smart India Hackathon 2026 — Problem Statement: SIH26056**

**Institutional Beneficiaries:** National Statistical Office (NSO), Ministry of Statistics & Programme Implementation (MoSPI) · Reserve Bank of India (RBI)

---

## 1. Executive Summary

Airpulse APIx is a high-frequency aviation price intelligence platform designed to transform airline fare collection from periodic manual sampling into an automated, continuously refreshed data pipeline.

The platform captures airfares across selected high-density domestic aviation corridors and multiple advance-booking horizons, cleans and standardizes the observations, detects anomalous prices, estimates missing observations, and aggregates the resulting data into an aviation-specific price index.

The system combines:

* Automated browser-based airfare extraction
* Persistent browser sessions and Shadow DOM traversal
* High-frequency fare observation across multiple booking horizons
* Statistical anomaly detection
* Fare-component decomposition
* Econometric missing-price imputation
* Weighted Laspeyres index computation
* Lead-time elasticity analysis
* Institutional REST APIs
* Interactive statistical intelligence dashboards

The resulting platform is intended to provide a structured, machine-readable view of short-term movements in domestic airfares.

---

# 2. Problem Context

Airfare prices are highly dynamic and can change frequently as airlines adjust inventory, demand, booking lead time, and fare classes.

A low-frequency collection process can therefore miss important intra-month price movements.

Airpulse APIx addresses this data-collection challenge through an automated pipeline capable of repeatedly observing airfare conditions across:

**Selected Corridors**

* DEL → BLR
* BLR → DEL
* DEL → BOM

**Advance-Booking Horizons**

* T+1
* T+7
* T+15
* T+30
* T+45

This produces a structured time-series dataset suitable for statistical analysis and index construction.

---

# 3. Core System Pipeline

```text
                    AIRPULSE APIx
                         │
                         ▼
              ┌─────────────────────┐
              │  Airfare Extraction │
              │     Playwright      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Data Normalization  │
              │ Pandas / NumPy      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Anomaly Detection   │
              │ Rolling Z-Score     │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Fare Decomposition  │
              │ Base + Taxes/Fees   │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Missing Fare Model  │
              │ Shadow Price        │
              │ Imputation          │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Aviation Price      │
              │ Index Calculation   │
              │ Weighted Laspeyres  │
              └──────────┬──────────┘
                         │
                 ┌───────┴────────┐
                 ▼                ▼
        ┌───────────────┐  ┌───────────────┐
        │ Streamlit     │  │ FastAPI       │
        │ Dashboard     │  │ Institutional │
        │               │  │ API           │
        └───────────────┘  └───────────────┘
```

---

# 4. System Architecture

Airpulse APIx consists of three primary application layers.

| Layer                       | File             | Technology                         | Primary Responsibility                                                                                            |
| --------------------------- | ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Data & Analytics Engine** | `engine.py`      | Playwright, Pandas, NumPy, AsyncIO | Fare extraction, browser automation, cleaning, anomaly detection, decomposition, imputation and index calculation |
| **Analytics Dashboard**     | `app.py`         | Streamlit                          | Interactive monitoring, price trends, elasticity curves, records and index visualization                          |
| **Institutional API**       | `api_service.py` | FastAPI, Uvicorn, Pydantic v2      | Secure machine-readable access to indices, records, methodology and pipeline controls                             |

---

# 5. Data Acquisition Layer

## 5.1 Automated Browser Extraction

The extraction engine uses **Playwright** to interact with dynamically rendered airline and booking interfaces.

The browser automation layer is designed to handle:

* JavaScript-rendered content
* Dynamic fare components
* Modern Web Components
* Shadow DOM elements
* Persistent browser contexts
* Session continuity
* Structured extraction of fare observations

The objective is to convert dynamically rendered booking information into normalized statistical records.

---

# 6. Data Processing & Quality Control

Every extracted observation passes through a statistical processing pipeline before being used for index computation.

### Processing Flow

```text
Raw Fare
   ↓
Schema Validation
   ↓
Normalization
   ↓
Duplicate Detection
   ↓
Outlier Detection
   ↓
Fare Decomposition
   ↓
Missing-Value Handling
   ↓
Validated Observation
   ↓
Index Calculation
```

## 6.1 Rolling Z-Score Filtering

The platform applies sector-horizon-level anomaly detection.

For an observation \(P_i\):

$$
Z_i = \frac{P_i-\mu}{\sigma}
$$

Observations satisfying:

$$
|Z_i| > 2.5
$$

are flagged as potential anomalies for downstream treatment.

The filtering operates within comparable sector and booking-horizon groups rather than treating all airfare observations as belonging to a single distribution.

---

## 6.2 High-Fare Anomaly Handling

The pipeline separately identifies unusually high fare observations, including potential premium or business-class anomalies.

A configurable threshold is applied to identify observations above:

$$
₹28,000
$$

Such observations are treated as potential anomalies and are prevented from disproportionately affecting the economy-fare index.

---

# 7. Fare Decomposition

The system separates the observed ticket price into two analytical components:

$$
P_t = B_t + T_t
$$

Where:

* \(B_t\) = Base Fare
* \(T_t\) = Taxes, fees and applicable charges

For the current prototype configuration:

| Component          | Prototype Share |
| ------------------ | --------------: |
| Base Fare          |             78% |
| Taxes / Fees / UDF |             22% |
| **Total**          |        **100%** |

These percentages should be treated as configurable model parameters rather than universal characteristics of every airfare observation.

---

# 8. Missing-Price & Sold-Out Handling

Airfare datasets can contain missing observations because of:

* Sold-out inventory
* Cancelled flights
* Temporary availability changes
* Incomplete extraction
* Dynamic booking-system responses

Airpulse APIx incorporates a **Synthetic Shadow Price** mechanism for handling missing observations.

The objective is to estimate a statistically consistent proxy price while preserving the continuity of the time series.

The imputation layer can incorporate available information such as:

* Sector
* Booking horizon
* Historical prices
* Nearby observations
* Fare distribution
* Temporal price patterns

Imputed observations are explicitly marked so that observed and estimated values remain distinguishable within the dataset.

---

# 9. Aviation Price Index

The platform calculates an aviation-specific weighted Laspeyres index.

$$
APIx_t =
\left(
\sum_{i=1}^{K}
w_i
\frac{P_{t,i}}{P_{0,i}}
\right)
\times 100
$$

Where:

* \(APIx_t\) = Aviation Price Index at time \(t\)
* \(w_i\) = sector weight
* \(P_{t,i}\) = observed mean airfare for sector \(i\)
* \(P_{0,i}\) = base-period reference airfare

### Prototype Sector Weights

| Sector    |   Weight |
| --------- | -------: |
| DEL → BLR |     0.40 |
| BLR → DEL |     0.35 |
| DEL → BOM |     0.25 |
| **Total** | **1.00** |

The prototype uses:

$$
P_{0,i}=₹4,500
$$

as the configured base reference.

---

# 10. Inflation / Deflation Signal

The corresponding percentage movement relative to the configured base reference is:

$$
\Delta\% =
\left(
\frac{\bar P_t-P_0}{P_0}
\right)
\times100
$$

For the index representation:

$$
\Delta\% = APIx_t-100
$$

### Example

If:

$$
APIx_t=112
$$

then the index is **12 index points above the base value of 100**, corresponding to a **12% increase relative to the configured base reference**, subject to the assumptions of the index methodology.

---

# 11. Lead-Time Price Analytics

A key analytical output is the relationship between airfare and booking lead time.

The platform compares prices across:

$$
T+1,\ T+7,\ T+15,\ T+30,\ T+45
$$

This produces a lead-time pricing curve that can be used to examine how observed fares vary as the departure date approaches.

```text
Price
  │
  │        ●
  │      ●
  │    ●
  │  ●
  │ ●
  └──────────────────────────
    T+45  T+30  T+15  T+7  T+1
             Booking Horizon
```

---

# 12. Analytics Dashboard

The Streamlit dashboard functions as the visual intelligence layer.

### Core Dashboard Modules

**1. Aviation Price Index**

* Current APIx value
* Base value
* Percentage movement
* Historical index trend

**2. Sector Monitoring**

* DEL–BLR
* BLR–DEL
* DEL–BOM

**3. Lead-Time Analytics**

* T+1
* T+7
* T+15
* T+30
* T+45

**4. Fare Decomposition**

* Base fare
* Taxes
* Fees
* UDF

**5. Data Quality**

* Records collected
* Valid records
* Outliers detected
* Imputed records

**6. Live Pipeline Monitor**

* Latest extraction timestamp
* Pipeline status
* Records processed
* Latest index calculation

---

# 13. Institutional REST API

The FastAPI microservice provides programmatic access to the platform.

All protected endpoints require API authentication through:

```http
X-API-KEY: <institutional-api-key>
```

## Endpoint Architecture

### Health

```http
GET /health
```

Provides system health information including storage state, disk availability and latest pipeline execution metadata.

### Latest Index

```http
GET /api/v1/apix/latest
```

Returns:

* Latest APIx value
* Inflation/deflation delta
* Sector-level values
* Fare decomposition
* Timestamp

### Elasticity / Lead-Time Curve

```http
GET /api/v1/apix/elasticity
```

Returns lead-time pricing observations across the configured booking horizons.

### Records

```http
GET /api/v1/records?sector=DEL-BLR&page=1&page_size=25
```

Provides paginated airfare observations with optional sector filtering.

### Pipeline Trigger

```http
POST /api/v1/pipeline/trigger
```

Triggers a new data-collection and index-generation cycle.

### Methodology

```http
GET /api/v1/methodology
```

Returns the statistical methodology configuration and index schema for audit and reproducibility purposes.

---

# 14. Technology Stack

### Data Collection

* Playwright
* Chromium
* AsyncIO

### Data Engineering

* Python
* Pandas
* NumPy

### Statistical Processing

* Z-score anomaly detection
* Rolling statistical analysis
* Laspeyres index methodology
* Synthetic price imputation

### API Layer

* FastAPI
* Uvicorn
* Pydantic v2

### Visualization

* Streamlit

### Data Storage

* Timestamped CSV
* JSON
* Structured analytical records

---

# 15. End-to-End Execution

### Step 1 — Install Dependencies

```bash
cd airpulse-apix

pip install -r requirements.txt

playwright install chromium
```

### Step 2 — Run the Data Engine

```bash
python engine.py
```

The engine:

1. Extracts airfare observations
2. Validates and normalizes records
3. Detects anomalies
4. Performs fare decomposition
5. Handles missing observations
6. Calculates the aviation price index
7. Writes timestamped outputs

Output directory:

```text
extracted_data/
├── airfare_*.csv
├── airfare_*.json
└── index_*.json
```

### Step 3 — Launch Dashboard

```bash
streamlit run app.py
```

Default local interface:

```text
http://localhost:8501
```

### Step 4 — Launch Institutional API

```bash
uvicorn api_service:app --host 0.0.0.0 --port 8000 --reload
```

Swagger documentation:

```text
http://localhost:8000/docs
```

---

# 16. Institutional Data Flow

```text
Airline / Booking Interfaces
            │
            ▼
     Playwright Engine
            │
            ▼
     Raw Fare Records
            │
            ▼
   Data Quality Pipeline
            │
      ┌─────┴─────┐
      ▼           ▼
  Valid Data   Anomalies
      │           │
      │      Statistical
      │       Treatment
      └─────┬─────┘
            ▼
    Fare Decomposition
            │
            ▼
   Missing Price Model
            │
            ▼
   Sector-Level Prices
            │
            ▼
 Weighted Laspeyres APIx
            │
       ┌────┴─────┐
       ▼          ▼
  Dashboard    REST API
       │          │
       └────┬─────┘
            ▼
    Institutional Analytics
```

---

# 17. Reproducibility & Auditability

Each pipeline execution should retain sufficient metadata to reproduce and audit the resulting index.

Recommended metadata includes:

* Extraction timestamp
* Sector
* Travel date
* Booking horizon
* Observed fare
* Fare components
* Data-source status
* Outlier flag
* Imputation flag
* Model/configuration version
* Index calculation timestamp

This creates an auditable chain from **raw airfare observation → processed observation → sector price → aggregate index**.

---

# 18. Key Outputs

Airpulse APIx produces four primary analytical outputs:

### 01 — High-Frequency Fare Dataset

Structured airfare observations across sectors and booking horizons.

### 02 — Aviation Price Index

A weighted aggregate measure of observed airfare movement.

### 03 — Lead-Time Pricing Analytics

A view of how observed prices vary across advance-booking horizons.

### 04 — Institutional Data API

Machine-readable access for downstream analytical systems and dashboards.

---

# 19. Strategic Value

Airpulse APIx is designed around a simple principle:

> **Convert dynamic airfare observations into a structured, high-frequency statistical signal.**

The platform brings together browser automation, statistical quality control, econometric processing, index construction and institutional APIs in a single pipeline.

```text
HIGH-FREQUENCY DATA
        +
STATISTICAL PROCESSING
        +
ECONOMETRIC INDEXING
        +
INSTITUTIONAL API
        ↓
AVIATION PRICE INTELLIGENCE
```

**Airpulse APIx — From Live Airfares to High-Frequency Aviation Intelligence.**
