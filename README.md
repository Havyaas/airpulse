# Airpulse APIx: High-Frequency Aviation Inflation Measurement Platform
### Smart India Hackathon Problem Statement SIH26056
**Institutional Beneficiaries**: National Statistical Office (NSO, MoSPI) & Reserve Bank of India (RBI)

---

## 🏛️ Executive Summary & Policy Context

Traditional Consumer Price Index (CPI) calculations for air transport suffer from collection latency, monthly manual sampling bias, and an inability to account for dynamic yield management algorithms used by airlines. 

**Airpulse APIx** provides an automated, high-frequency data collection and analytics pipeline that:
1. Systematically extracts airfares across high-density DGCA trunk corridors (`DEL-BLR`, `BLR-DEL`, `DEL-BOM`) and forward booking horizons ($T+1, T+7, T+15, T+30, T+45$).
2. Traverses deep Shadow DOM elements in modern web components using persistent browser profiles to ensure continuous data capture.
3. Applies rolling sector-horizon Z-score outlier filtering ($|Z| > 2.5$) and caps luxury/business class anomalies ($> ₹28,000$).
4. Implements structural granular decomposition: Base Fare (78% proxy) vs. Taxes/Fees/UDF (22% proxy).
5. Deploys an Econometric AI Synthetic Shadow Price Imputation fallback when flights sell out or are canceled.
6. Constructs the official **Weighted Laspeyres Aviation Price Index (APIx)** against a fixed base reference ($P_0 = ₹4,500$) weighted by official DGCA passenger density statistics.

---

## 📁 System Architecture

The platform is organized into three production-grade components:

| Component | File | Technology | Responsibility |
| :--- | :--- | :--- | :--- |
| **Engine** | `engine.py` | Playwright, Pandas, NumPy, Asyncio | Anti-bot scraping, Shadow DOM JavaScript injection, Z-score outlier filtering, granular decomposition, AI shadow price imputation, and Laspeyres computation. |
| **Dashboard** | `app.py` | Streamlit (Wide-mode) | High-frequency central bank intelligence portal, lead-time price elasticity curves, live records log stream, and interactive force trigger. |
| **API Microservice** | `api_service.py` | FastAPI, Uvicorn, Pydantic v2 | Institutional REST API with `X-API-KEY` security, OpenAPI/Swagger docs, elasticity curves, paginated records query, and trigger webhooks. |

---

## 📐 Econometric Formulation: Weighted Laspeyres Index

$$\text{APIx}_t = \left( \sum_{i=1}^{K} w_i \cdot \frac{P_{t,i}}{P_{0,i}} \right) \times 100$$

Where:
- $w_i$: DGCA Passenger Volume Weight for Sector $i$:
  - `DEL-BLR`: $0.40$ (40%)
  - `BLR-DEL`: $0.35$ (35%)
  - `DEL-BOM`: $0.25$ (25%)
  - $\sum w_i = 1.0$
- $P_{t,i}$: Observed mean economy airfare in sector $i$ at high-frequency time $t$.
- $P_{0,i}$: Fixed historical base reference price ($₹4,500.00$).
- **Inflation / Deflation Delta**:
$$\Delta\% = \left( \frac{\bar{P}_t - P_0}{P_0} \right) \times 100 = \text{APIx}_t - 100$$

---

## 🚀 Quickstart & Execution Guide

### 1. Installation
```bash
# Clone or navigate to the repository
cd airpulse-apix

# Install Python requirements
pip install -r requirements.txt

# Install Playwright browser binaries (for live browser extraction)
playwright install chromium
```

### 2. Run the Autonomous Pipeline Engine
```bash
python engine.py
```
This will extract records, clean them, perform decomposition, compute the Laspeyres index, and write the timestamped CSV and JSON files to `extracted_data/`.

### 3. Launch the Streamlit Analytics Portal
```bash
streamlit run app.py
```
Opens the interactive wide-mode central bank dashboard at `http://localhost:8501`.

### 4. Launch the FastAPI Microservice
```bash
uvicorn api_service:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger API documentation will be available at:
`http://localhost:8000/docs`

---

## 🔒 Institutional API Endpoints

All secure endpoints require the header `X-API-KEY: rbi-nso-airpulse-sih26056-key` (or Bearer token):

- `GET /health` : Verifies storage state, disk health, and latest run timestamps.
- `GET /api/v1/apix/latest` : Retrieves latest Laspeyres index, inflation delta, and granular decomposition.
- `GET /api/v1/apix/elasticity` : Lead-time pricing curve matrix across $T+1$ to $T+45$.
- `GET /api/v1/records?sector=DEL-BLR&page=1&page_size=25` : Paginated records stream.
- `POST /api/v1/pipeline/trigger` : Manual or cron-scheduled pipeline trigger.
- `GET /api/v1/methodology` : Public statistical methodology schema for NSO audit compliance.
