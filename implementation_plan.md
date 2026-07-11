# Implementation Plan: Automated Weekly Review Pulse

This document outlines the phase-wise implementation plan for building the Automated Weekly Review Pulse system, based on the provided architecture and problem statement.

## Goal Description
The goal is to build an automated weekly pipeline that ingests public app reviews (App Store and Play Store), processes them using an LLM to extract thematic insights, and distributes the findings via Google Docs and Gmail using Model Context Protocol (MCP) integrations. The final output is a highly scannable, one-page weekly note (under 250 words) highlighting top themes, verbatim quotes, and actionable next steps.

## Proposed Changes

### Phase 1: Project Initialization & Configuration
Set up the foundational project structure and dependencies.
- Initialize a Node.js/TypeScript project.
- Setup environment variables for LLM API keys and MCP server configurations.
- Create the core directory structure (`src/ingestion`, `src/llm`, `src/mcp`, `src/orchestration`).

### Phase 2: Data Ingestion & Anonymization Module
Build the data pipeline to read and clean raw review exports.
- **File Reader**: Implement parsers for the public review exports (CSV/JSON).
- **Date Filtering**: Filter reviews to strictly include the last 8-12 weeks.
- **Data Cleaning**:
  - Exclude reviews with less than 8 words.
  - Exclude reviews containing emojis.
  - Exclude reviews in Hindi language (using proper language detection like CLD/Franc).
  - Exclude reviews in Hinglish (Romanized Hindi) using advanced detection or language models.
- **PII Stripper**: Implement a privacy filter to aggressively scrub usernames, emails, device IDs, and other identifiable data before it reaches the LLM.

### Phase 3: LLM Processing Engine
Implement the core intelligence layer to analyze and structure the reviews using a single-pass prompt strategy, as the cleaned dataset (~180 reviews, ~40KB) fits well within the 8k token limit of Groq's Llama-3-70b.
- **Data Minimization**: Before sending to the LLM, map the JSON array to a compact string format (e.g., `[Rating: 5] Title - Text`) to save tokens and improve LLM focus.
- **Prompt Engineering**: Design a system and user prompt that enforces strict constraints:
  - Cluster into a maximum of 5 themes.
  - Extract the top 3 themes.
  - Include 3 *verbatim* user quotes (must be exact matches from the input).
  - Propose 3 concrete action ideas based on the negative/constructive feedback.
  - Output a highly scannable summary report (≤ 250 words).
- **Structured Output (JSON Mode)**: Force the LLM to return a predefined JSON schema (e.g., `themes`, `quotes`, `action_ideas`, `report_markdown`) so we can programmatically validate constraints (like word count) before formatting.
- **Integration**: Connect to the Groq API (via `groq-sdk`), implement retry logic for JSON parsing failures, and pass the structured data to Phase 4.

### Phase 4: Output Formatting & MCP Integrations
Connect the structured insights to the output surfaces using Model Context Protocol (MCP) servers.
- **Programmatic Formatting**: Since Phase 3 returns highly structured JSON (including a pre-written summary), programmatically stitch these fields together to create a polished Markdown report and an HTML email body (eliminating the need for a redundant second LLM call).
- **MCP Client Setup**: Initialize an MCP client using `@modelcontextprotocol/sdk` to communicate with standard local/remote Google Docs and Gmail MCP servers.
- **Google Docs Integration**: Call the appropriate tool (e.g., `create_doc` or `update_doc`) on the Docs MCP server to push the finalized Markdown report, generating a shareable URL.
- **Gmail Integration**: Call the appropriate tool (e.g., `create_draft`) on the Gmail MCP server to construct a draft email containing the HTML summary and a link to the newly created Google Doc.

### Phase 5: Orchestration & Automation
Tie all modules together into a single automated workflow.
- **Main Pipeline**: Create `src/main.ts` to orchestrate the flow: `Ingest -> Process -> Format -> Publish`.
- **Scheduling**: Setup the deployment or scheduling mechanism (e.g., node-cron) to run this pipeline weekly.

---

## Verification Plan

### Automated Tests
- Unit tests for the PII stripper to ensure no sensitive data passes through.
- Unit tests for date filtering logic.

### Manual Verification
- **End-to-End Run**: Execute the pipeline manually with a sample review export.
- **Output Inspection**: Verify the generated Google Doc is created, scannable, and under 250 words.
- **Draft Verification**: Check the Gmail inbox for a properly formatted draft email containing the insights and links.
