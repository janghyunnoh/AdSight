<p align="center">
  <img src="app/static/adsight-icon.png" alt="AdSight icon" width="88" />
</p>

<h1 align="center">AdSight</h1>
<p align="center"><strong>AI Assistant for Advertising Analytics</strong></p>
<p align="center">Connect advertising data, compare performance, and understand what changed.</p>

## Overview

AdSight is a web-based advertising analytics workspace developed around marketing practitioners' feedback. It connects Lark spreadsheets, helps users configure their data with AI, and combines interactive dashboards with evidence-based change analysis.

The current MVP uses Lark REST APIs for read-only data access and NVIDIA API for column interpretation and finding explanations.

## Features

- **Data connection** — Load Lark Sheets and Wiki documents, select worksheets, and preview source data.
- **AI-assisted setup** — Get suggested Korean column names, meanings, and analysis roles. Review and edit recommendations or configure columns manually, then reuse approved settings when reconnecting.
- **Interactive dashboards** — Explore key metrics, compare trends and targets, and save dashboard preferences.
- **Change analysis** — Select periods, targets, metrics, and increase/decrease thresholds independently of the dashboard. Inspect rule-based findings with target-level charts, daily trends, and AI explanations.
- **Shared feedback** — Record improvements and track their resolution.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.11, FastAPI, HTTPX |
| Frontend | HTML, CSS, JavaScript, SVG |
| Data integration | Lark Sheets / Wiki REST APIs |
| AI | NVIDIA API with structured JSON responses |
| Persistence | SQLite |

## Getting Started

### 1. Set Up the Environment

```sh
git clone https://github.com/janghyunnoh/AdSight.git
cd AdSight
conda env create -f environment.yml
conda activate adsight
cp .env.example .env
```

### 2. Configure Credentials

Edit `.env` with your Lark app credentials and, optionally, a NVIDIA API key for AI features:

```dotenv
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
LARK_DOMAIN=https://open.larksuite.com
NVIDIA_API_KEY=your_nvidia_api_key
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
```

The Lark app needs Sheets read permissions and access to the target document. Wiki links also require Wiki node read access. Publish permission changes in the Lark Developer Console before testing.

See [.env.example](.env.example) for optional configuration.

### 3. Run the App

```sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

Open **http://127.0.0.1:8000** and connect a document. To access the workspace inside Lark, register your hosted URL as the Web App homepage.

## Data and AI

Source spreadsheets remain read-only. Approved settings, dashboard preferences, and feedback are stored in `data/notes.sqlite3`; use persistent storage when deploying.

AI interpretation uses column samples and optional user context. Finding explanations use computed aggregates and supporting evidence, rather than complete source rows. AI output is provided in Korean. Recommendations require review, and detected changes do not establish statistical significance or business causes. API failures preserve existing settings and computed results.

This is a development MVP with shared server data. Authentication and per-user access control are planned; restrict access when working with sensitive documents. Keep credentials and local databases out of source control.

## Tests

Run backend tests:

```sh
python -m unittest discover -s tests -q
```

Run frontend tests with Node.js:

```sh
for test_file in tests/test_*.cjs; do
  node "$test_file" || exit 1
done
```

## Roadmap

- Conversational AI assistant
- Lark OpenAPI MCP-based agent workflows
- User authentication and access control
