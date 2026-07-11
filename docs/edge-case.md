# Edge Cases and Corner Scenarios

This document outlines potential edge cases and corner scenarios for the Automated Weekly Review Pulse system, along with strategies for how they are (or should be) handled in the pipeline.

## 1. Data Ingestion & PII Stripping
- **Missing or Malformed CSV Columns**: 
  - *Scenario*: The store export changes its column headers (e.g., from `Review Text` to `Body`).
  - *Mitigation*: The `csv-reader.ts` script checks for multiple common column names (`Review Title`, `title`, `Title`). If none are found, the row is skipped to prevent crashing.
- **Empty or Extremely Short Reviews**:
  - *Scenario*: A user leaves a 5-star rating with no text.
  - *Mitigation*: The ingestion script skips records where critical fields (like `text` or `date`) are entirely empty or unparseable.
- **Unconventional PII Formats**:
  - *Scenario*: A user writes their email as `john (at) gmail (dot) com` or uses emojis near a phone number.
  - *Mitigation*: While basic regex catches standard formats, complex obfuscation might slip through. The LLM prompt acts as a secondary filter, explicitly instructed to omit any PII from the verbatim quotes.
- **Data Volume Surges**:
  - *Scenario*: The app goes viral and receives 50,000 reviews in a week, exceeding the LLM's context window.
  - *Mitigation*: (Future Enhancement) Implement chunking or sampling (e.g., randomly selecting 1,000 reviews or sorting by helpfulness votes) before sending to the LLM.

## 2. LLM Processing (OpenAI & Groq)
- **API Rate Limits and Timeouts**:
  - *Scenario*: OpenAI or Groq APIs return a 429 (Rate Limit) or 503 (Service Unavailable).
  - *Mitigation*: The pipeline currently throws an error and exits. (Future Enhancement: Add exponential backoff retries using a library like `p-retry`).
- **Malformed JSON Responses**:
  - *Scenario*: Despite requesting `json_object` format, the LLM returns invalid JSON or a schema that doesn't match the expected interfaces.
  - *Mitigation*: The code wraps the JSON parsing in `try/catch` blocks. If the required keys (`topThemes`, `markdownReport`, etc.) are missing, fallback defaults or empty arrays are used to prevent the downstream pipeline from crashing.
- **Insufficient Data for Themes**:
  - *Scenario*: Only 1 or 2 reviews were left in the past 12 weeks.
  - *Mitigation*: The LLM might struggle to find "3 distinct themes." The pipeline handles this gracefully as the formatting scripts dynamically iterate over whatever array length the LLM returns.

## 3. MCP Integrations (Google Docs & Gmail)
- **MCP Server Connection Failures**:
  - *Scenario*: The `npx @modelcontextprotocol/server-...` command fails to start, or node doesn't have permission to spawn the process.
  - *Mitigation*: The `stdio` transport throws an explicit connection error, halting the pipeline before attempting to format the document. The `catch` block in `main.ts` ensures errors are logged.
- **Tool Execution Errors (Auth/Permissions)**:
  - *Scenario*: The MCP server starts, but the underlying Google OAuth token has expired.
  - *Mitigation*: The tool call will reject the promise. This is caught in the MCP client classes, logging the failure without crashing the host OS.

## 4. Orchestration & Scheduling
- **Duplicate Runs**:
  - *Scenario*: The cron job runs, but the `reviews.csv` file hasn't been updated by the team, resulting in a duplicate report.
  - *Mitigation*: (Future Enhancement) The system should hash the CSV file or track the newest review date processed, skipping execution if no new data is found.
- **Silent Failures**:
  - *Scenario*: The node process dies unexpectedly during the week.
  - *Mitigation*: Ensure the process is managed by a process manager like `PM2` or deployed in a containerized environment with restart policies, rather than relying solely on a background terminal process.
