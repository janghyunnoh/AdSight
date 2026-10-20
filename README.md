<p align="center">
  <img src="app/static/adsight-icon.png" alt="AdSight icon" width="88" />
</p>

<h1 align="center">AdSight</h1>
<p align="center"><strong>AI Assistant for Advertising Data Analysis</strong></p>
<p align="center">From advertising spreadsheets to clearer performance insights.</p>

## Overview

AdSight is a web-based assistant for exploring advertising data and understanding campaign performance. It brings spreadsheet data into an interactive workspace for visualization and comparison, with a roadmap toward Lark OpenAPI MCP integration and LLM-based insight generation.

**Current stage: a working data exploration MVP.** Spreadsheet retrieval and dashboard visualization use the Lark REST API. MCP-powered agent workflows, automated anomaly detection, and LLM-generated insights are planned and are not yet implemented.

## Features

- **Connect your data** — Load a Lark spreadsheet using its URL or token, including spreadsheets inside Lark Wiki.
- **Explore your sheets** — Switch worksheets, sort columns, and refresh data from the source. Columns and rows are handled dynamically.
- **Build a focused dashboard** — Choose summary metrics and aggregation methods, then filter by date and comparison target.
- **Compare performance** — Compare companies or campaigns over time, inspect values on hover, and view related metrics such as spend, clicks, and conversions together.
- **Capture feedback** — Record feature requests and improvements in development notes, mark items complete, and export them as text.

## How It Works

```text
Lark Sheets / Wiki
       |
       v
FastAPI backend -- Lark REST API
       |
       v
Web workspace
  Data connection -> Interactive dashboard -> Metric comparisons

Planned: Lark OpenAPI MCP -> AI agent -> LLM-generated insights
```

The web app can be opened from Lark by registering a hosted URL as its Web App homepage. Lark provides the entry point; the application backend runs on your own server or hosting provider.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.11, FastAPI, HTTPX |
| Frontend | HTML, CSS, JavaScript |
| Data integration | Lark Sheets and Wiki REST APIs |
| Planned AI integration | Lark OpenAPI MCP, LLM-based agent workflows |

## Getting Started

### 1. Set up the environment

```sh
git clone https://github.com/janghyunnoh/AdSight.git
cd AdSight
conda env create -f environment.yml
conda activate adsight
cp .env.example .env
```

### 2. Configure Lark access

Set the following values in your local `.env` file:

```dotenv
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
LARK_DOMAIN=https://open.larksuite.com
LARK_SPREADSHEET_TOKEN=your_default_spreadsheet_token
```

The app needs Sheets read permissions and access to the document you want to load. Wiki links also require Wiki node read access. Publish permission changes in the Lark Developer Console before testing them.

The official [Lark OpenAPI MCP](https://github.com/larksuite/lark-openapi-mcp) checkout is maintained separately and is not required to run the current REST-based MVP.

### 3. Start the app

```sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

Open **http://127.0.0.1:8000**, enter a spreadsheet URL or token, and select a worksheet.

## Roadmap

- [x] Spreadsheet connection, data preview, and refresh
- [x] Interactive dashboards and multi-target comparisons
- [x] Development notes for feature requests and improvements
- [ ] Automated detection of unusual performance changes
- [ ] Lark OpenAPI MCP integration for agent tool access
- [ ] Natural-language questions and LLM-generated performance insights
- [ ] User authentication and access control for hosted use

## Configuration & Data

Credentials stay on the backend. Real `.env` files, local databases, runtime files, and the separate MCP checkout are excluded from this repository.

This is a development MVP. Restrict access or add authentication before hosting sensitive advertising data. Lark app availability controls who can discover the app in Lark; the hosted application and API still need their own access checks.
