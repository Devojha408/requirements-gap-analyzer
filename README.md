# Requirements Gap Analyzer

An AI-powered tool to analyze Confluence requirements against your GitHub codebase using Langflow and Astra DB.

## 🌟 Features

- **Confluence Integration**: Analyze requirements directly from Confluence pages
- **GitHub Integration**: Automatically process codebases from GitHub repositories
- **File Upload Alternative**: Upload requirements documents (PDF, TXT, DOC, MD, JSON)
- **AI-Powered Analysis**: Uses LLMs to identify gaps between requirements and implementation
- **Detailed Reports**: Get comprehensive analysis with identified gaps and recommendations
- **Modern UI**: Clean, aesthetic interface with drag-and-drop file upload
- **Export Reports**: Download analysis results as text files

## Prerequisites

- Node.js (recommended >= 18)
- npm (or yarn/pnpm)
- Langflow instance with API access
- Astra DB setup (for RAG vectors)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

If you haven't added required packages, run:
```bash
npm install express cors dotenv multer axios form-data @datastax/langflow-client
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Langflow Configuration
API_KEY=your-langflow-api-key
LANGFLOW_BASE_URL=https://hackathon-agentic.finconsgroup.com

# Main Analysis Flow ID
# This is "The Requirement Inspector" flow
# Extract this from your Langflow flow export or use the ID shown in Langflow UI
MAIN_ANALYSIS_FLOW_ID=your-flow-id-here

# Server Configuration
PORT=3000
```

### 3. Start the Server

```bash
npm start
```

### 4. Open the Application

Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### Example Analysis Request

Here's an example of how to use the tool:

1. **Confluence URL**: 
   ```
   https://devoza.atlassian.net/wiki/spaces/~7120206bba52d9464649e5972eb97775948ffe/pages/393217/Restaurant+Management+System
   ```

2. **GitHub Repository**: 
   ```
   https://github.com/darakmayur/restaurant-management-system.git
   ```

3. **Branch Name**: 
   ```
   master
   ```

4. **Additional Instructions** (Optional):
   ```
   Focus on authentication and authorization features. 
   Check for security compliance with OWASP standards.
   ```

**Example complete input:**
```
Analyze the requirements from https://devoza.atlassian.net/wiki/spaces/~7120206bba52d9464649e5972eb97775948ffe/pages/393217/Restaurant+Management+System
for the Restaurant Management System project against the codebase at https://github.com/darakmayur/restaurant-management-system.git master branch
```

The tool will:
- Construct a single chat message with all inputs (Confluence URL, GitHub URL, branch)
- Send this message to your main Langflow flow
- The flow handles all processing (requirements extraction, codebase analysis, gap detection)
- Generate a detailed report with:
  - Summary of analysis
  - Identified gaps
  - Recommendations

**Note:** All processing happens in one main flow (`MAIN_ANALYSIS_FLOW_ID`). The GitHub URL, branch name, and Confluence link are all passed in the chat input message.

## 🔧 API Endpoints

### Upload File
```http
POST /api/upload-file
Content-Type: multipart/form-data

Body: file (PDF, TXT, DOC, DOCX, MD, JSON)
```

**Response:**
```json
{
  "success": true,
  "file_path": "flow-id/timestamp-filename.pdf",
  "original_name": "requirements.pdf"
}
```

### Run Analysis
```http
POST /api/analyze
Content-Type: application/json

{
  "input_value": "Analyze the requirements from https://confluence.com/page against https://github.com/user/repo.git master branch",
  "file_path": "path/to/file"       // optional (from upload response, for File component)
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "analysis_1234567890",
  "elapsed_ms": 15000,
  "response": {
    "outputs": [...],
    ...
  }
}
```

**Important:** The GitHub URL, branch name, and Confluence link are all passed in the `input_value` as a natural language message to your main flow.

## 🎨 UI Features

- **Modern Design**: Clean, aesthetic interface with light/dark mode support
- **Drag & Drop**: Drag and drop files for easy upload
- **Responsive**: Works on desktop, tablet, and mobile devices
- **Real-time Feedback**: Loading states, progress indicators, and error handling
- **Export Reports**: Download analysis results as formatted text files
- **Form Validation**: Client-side validation for all inputs
- **Toast Notifications**: User-friendly success/error messages

## 🏗️ Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐
│   Frontend  │────────▶│   Express   │────────▶│  Langflow Main Flow │
│  (HTML/JS)  │         │   Server    │         │                     │
└─────────────┘         └─────────────┘         │  • Parse inputs     │
                              │                  │  • Fetch GitHub     │
      User Inputs:            │                  │  • Fetch Confluence │
      • Confluence URL        │                  │  • Create RAG       │
      • GitHub URL            │                  │  • Analyze gaps     │
      • Branch name           │                  └─────────┬───────────┘
      • Instructions          │                            │
                              │                            ▼
                              │                     ┌─────────────┐
                              │                     │  Astra DB   │
                              │                     │ (RAG Store) │
                              │                     └─────────────┘
                              ▼
                        ┌─────────────┐
                        │  Langflow   │
                        │   Files     │
                        │   Storage   │
                        └─────────────┘
```

**Simplified Flow:**
- Everything happens in one main flow
- All inputs (GitHub URL, Confluence link, branch) are passed in the chat message
- No separate codebase processing endpoint needed
- The flow handles all extraction and analysis internally

## 📝 Notes

- **Simplified Architecture**: Everything happens in one main flow (`MAIN_ANALYSIS_FLOW_ID`)
- **Chat-based Input**: GitHub URL, Confluence link, and branch name are all passed in the `input_value` as a natural language message
- **No CODE_CONNECTOR_FLOW_ID needed**: The main flow handles all processing internally
- File uploads use Langflow's `/api/v1/files/upload/{flow_id}` endpoint
- Analysis results are parsed and displayed in a structured format (Summary, Gaps, Recommendations)
- Maximum file upload size: 10MB (configurable in `server.js`)
- Supported file types: .txt, .pdf, .doc, .docx, .md, .json
- The frontend automatically constructs the analysis query from the form inputs

## 🐛 Troubleshooting

### API Key Issues
If you see 403 errors, verify your `API_KEY` in the `.env` file matches your Langflow API key.

### CORS Issues
If running on a different port, update the `API_CONFIG.baseUrl` in `app.js`.

### File Upload Fails
Check the file size (max 10MB) and file type. Ensure the flow ID is correct.

### Analysis Timeout
Large codebases may take longer to process. Consider increasing server timeout or processing in smaller chunks.

## 📄 License

This project is part of the Requirements Gap Analyzer system.
