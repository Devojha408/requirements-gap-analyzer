# Requirements Gap Analyzer

Simple local setup for the Requirements Gap Analyzer (frontend + Express server that calls Langflow).

## Prerequisites
- Node.js (recommended >= 18)
- npm (or yarn/pnpm)

## Install
1. Open a terminal in the project folder:
   - cd c:\Users\DevOza\Downloads\exported-assets\requirements-gap-analyzer
2. Install dependencies:
   - npm install

(If you haven't added required packages, run:
- npm install express cors dotenv multer axios form-data @datastax/langflow-client
)

## Configuration
Create a `.env` file in the project root (not committed). Example:

```text
API_KEY=your_langflow_api_key_here
LANGFLOW_BASE_URL=https://hackathon-agentic.finconsgroup.com
FLOW_ID=flowid
PORT=3000