# Automated Weekly Review Pulse

An automated, weekly pipeline that ingests public App Store and Google Play reviews, processes them using a Large Language Model (LLM) to extract structured thematic insights, and distributes the findings via Google Docs and Gmail using the **Model Context Protocol (MCP)**.

---

## 📋 Features

- **Automated Scraping & Ingestion**: Fetches recent public reviews (last 8-12 weeks) from the App Store and Google Play Store.
- **Privacy Enforcement**: Strips PII (emails, phone numbers, IP addresses, names) during the ingestion phase so no sensitive data is sent to the LLM.
- **Smart Filtering**: Skips reviews with fewer than 8 words, reviews containing emojis, and non-English reviews (detects Hindi and Hinglish).
- **LLM-Powered Theme Analysis**: Clusters reviews into up to 5 distinct categories, extracting top themes, anonymous verbatims, and concrete action ideas.
- **Strict Rate Limiting**: Managed token budget (rpm/tpm limits tailored to Groq `llama-3.3-70b-versatile`) with exponential backoffs.
- **MCP Integration (No API Auth Overhead)**: Uses stdio-based Google Docs and Gmail MCP servers to create documents and drafts directly.
- **Weekly Scheduler**: Scheduled daemon mode using `node-cron`.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+) with TypeScript
- **Scrapers**: `google-play-scraper`, `app-store-scraper`
- **LLM Engine**: Groq SDK (`llama-3.3-70b-versatile`) / OpenAI API
- **MCP Core**: `@modelcontextprotocol/sdk`
- **Scheduler**: `node-cron`

---

## ⚙️ Prerequisites

Before running the project locally, ensure you have:

1. **Node.js**: Installed on your system (v18 or higher is recommended).
2. **Groq API Key**: Obtain a key from the [Groq Console](https://console.groq.com/) for LLM inference.
3. **Google Account & Credentials**: Needed for the Google Docs and Gmail MCP servers.
   - You need a Google Cloud Project with the **Google Docs API** and **Gmail API** enabled.
   - Configure the **OAuth Consent Screen** (Internal or External/Test).
   - Create credentials for an **OAuth Client ID** (Application type: **Desktop App**).
   - Download the client configuration JSON, which the MCP servers will prompt for or read to authenticate.

---

## 🚀 Setup Instructions

### 1. Install Dependencies

Open your terminal in the project directory and run:

```bash
npm install
```

### 2. Configure Environment Variables

Copy the `.env.example` file to create a `.env` file in the project root:

```bash
cp .env.example .env
```

Open the `.env` file and configure the variables:

```ini
# LLM API Keys
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=your_openai_api_key_here # Optional

# MCP Server Settings
GOOGLE_DOCS_MCP_SERVER_COMMAND=npx
GOOGLE_DOCS_MCP_SERVER_ARGS=-y,@modelcontextprotocol/server-google-docs
GMAIL_MCP_SERVER_COMMAND=npx
GMAIL_MCP_SERVER_ARGS=-y,@modelcontextprotocol/server-gmail

# Scraper Settings
PRODUCT_NAME=Groww
PLAY_STORE_PACKAGE=com.nextbillion.groww
APP_STORE_ID=1404871703
APP_STORE_APP_ID=1404871703
DOWNLOAD_WEEKS=12
APP_STORE_COUNTRY=in
EXPORTS_DIR=./data/exports

# Recipient Email for Drafts
USER_EMAIL=your.email@example.com
```

---

## 🏃 Running the Application

You can execute the entire flow (scraping newest reviews followed by processing the pulse report) with a single command:

```bash
npm run full:pipeline
```

This single command runs the steps sequentially as described below:

### Step 1: Download Reviews (Scraping)

Run the scraper to fetch public reviews from the App Store and Google Play Store:

```bash
npm run download:reviews
```

This script will:
1. Fetch up to 500 newest reviews for the configured packages.
2. Filter reviews matching your `DOWNLOAD_WEEKS` config window.
3. Save the raw reviews into the directory configured in `EXPORTS_DIR` (defaults to `data/exports/app_store_reviews.csv` and `data/exports/play_store_reviews.csv`).

### Step 2: Execute the Main Pipeline

Run the main pipeline to ingest, clean, analyze, format, and publish:

```bash
npm run pulse
```

This will run the entire flow:
1. **Ingest & Clean**: Reads the exported CSV files, filters languages (ignores Hindi/Hinglish), trims short messages, removes emojis, and strips PII. Saves the cleaned data to `output/normalized_reviews.json`.
2. **LLM Engine**: Extracts the top 3 themes, 3 verbatim quotes, and 3 action items. Saves results to `output/llm_report.json`.
3. **Format**: Generates a local markdown file (`output/weekly_pulse.md`) and email HTML draft (`output/email_draft.html`).
4. **Publish**:
   - **Google Docs**: Connects via MCP and creates a Google Doc.
   - **Gmail**: Connects via MCP and creates a draft email inside your inbox.

> [!NOTE]
> On the first run, the MCP servers will output a link to authorize access to your Google account. Open that link in your browser to grant the requested permissions.

---

## 🖥️ Running the Frontend Dashboard

We have implemented a stunning, interactive web dashboard to view review metrics, search and filter reviews, explore AI insights/categories, generate JIRA bug reports, and trigger publishing flows manually.

### How to Run

1. **Install Dependencies**:
   Ensure both backend and frontend dependencies are installed.
   ```bash
   npm install
   ```

2. **Start the Dashboard**:
   You can start both the local Express API server and the Vite React frontend concurrently:
   ```bash
   npm run dev
   ```
   - **Frontend**: Accessible at `http://localhost:5173`
   - **API Server**: Listening at `http://localhost:3001`

### Dashboard Features

- **Reviews Tab**: Search and filter reviews by platform (All/iOS/Android), star rating, sentiment, and date ranges. Also draft replies or select negative reviews for JIRA reports.
- **Analytics Tab**: Visual progress bars and interactive SVG charts mapping ratings distribution, overall positive sentiment rates, NPS estimation, and ingestion timeline trends.
- **Categories Tab**: Explore thematic categories and associated user quotes extracted by the LLM.
- **Word Cloud Tab**: Click on popular keywords to quickly search and filter corresponding reviews.
- **Ideation Tab**: Displays AI feature recommendations. Also features a **JIRA Bug Reporter** where you select negative reviews and generate a structured bug ticket.
- **Weekly Note Tab**: Renders the compiled Weekly Pulse markdown note directly, with single-click triggers to publish to Google Docs and Gmail via MCP.

---

## 🕰️ Running in Scheduled (Daemon) Mode

To run the pipeline continuously in the background on a cron schedule:

```bash
npx ts-node src/main.ts --cron
```

- By default, it runs every **Monday at 9:00 AM** (`0 9 * * 1`).
- You can override this schedule by setting the `CRON_SCHEDULE` environment variable in your `.env` file (e.g., `CRON_SCHEDULE="0 0 * * 0"` for midnight every Sunday).

---

## 🧪 Testing and Verification

To verify that the rate-limiter, scheduler, and pipeline are working correctly, run the Phase 5 test suite:

```bash
npx ts-node src/test-phase5.ts
```

This test:
1. Verifies token limit calculations and rate-limiter capacity controls.
2. Tests the scheduler's initialization and stop mechanisms.
3. Executes a test run of the full pipeline using existing/pre-normalized review data.
4. Confirms that local artifacts are successfully generated in the `output/` directory.

You can also run TypeScript type check verification:

```bash
npx tsc --noEmit
```

---

## 📁 Directory Structure

```text
├── data/
│   └── exports/               # Input reviews CSV files
├── docs/                      # Architecture, problem, and edge-case documentation
├── output/                    # Local report and JSON output previews
├── src/
│   ├── ingestion/             # Scraping, CSV reading, PII scrubbing, filtering
│   │   ├── downloader.ts
│   │   ├── file-reader.ts
│   │   └── pii-stripper.ts
│   ├── llm/                   # LLM processing engine & rate-limiting logic
│   │   ├── groq-generator.ts
│   │   ├── llm-processor.ts
│   │   └── rate-limiter.ts
│   ├── mcp/                   # Google Docs & Gmail MCP clients
│   │   ├── docs-client.ts
│   │   └── gmail-client.ts
│   ├── orchestration/         # Report formatter & node-cron scheduler
│   │   ├── formatter.ts
│   │   └── scheduler.ts
│   ├── main.ts                # Main application orchestrator
│   └── test-phase5.ts         # Verification test suite
├── .env.example               # Environment variables template
├── package.json               # Scripts & dependencies
└── tsconfig.json              # TypeScript configuration
```
