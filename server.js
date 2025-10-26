require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const { LangflowClient } = require('@datastax/langflow-client');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'application/json'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only txt, pdf, doc, docx, md, and json files are allowed.'));
    }
  }
});

// Logging middleware
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] → ${req.method} ${req.originalUrl}`);
  
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ← ${res.statusCode} ${elapsed}ms`);
  });
  next();
});

// Environment configuration
const LANGFLOW_BASE_URL = process.env.LANGFLOW_BASE_URL || 'https://hackathon-agentic.finconsgroup.com';
const MAIN_ANALYSIS_FLOW_ID = process.env.MAIN_ANALYSIS_FLOW_ID || 'd5e49d37-42d9-453a-b428-a6bafc90f608';
const SERVER_API_KEY = process.env.API_KEY;

if (!SERVER_API_KEY) {
  console.warn('⚠️  No API_KEY set in environment. API calls will fail.');
  console.warn('   Please add API_KEY=your-key to .env file');
} else {
  console.log('✓ API_KEY loaded from environment');
}

// Serve frontend
const staticDir = path.join(__dirname, '.');
app.use(express.static(staticDir));
app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));

// Helper function
function getApiKey(req) {
  return SERVER_API_KEY || req.headers['x-api-key'] || req.query.api_key || null;
}

// POST /api/upload-file - Upload requirements file to Langflow
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  console.log('\n📄 Uploading requirements file...');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const apiKey = getApiKey(req);
    if (!apiKey) {
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'API key required' });
    }

    console.log(`  File: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log(`  Type: ${req.file.mimetype}`);

    // Upload to Langflow file management
    const flowId = MAIN_ANALYSIS_FLOW_ID;
    const url = `${LANGFLOW_BASE_URL}/api/v1/files/upload/${flowId}`;
    
    console.log(`  Uploading to: ${url}`);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const uploadResponse = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'x-api-key': apiKey
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    fs.unlinkSync(req.file.path);

    console.log('✓ File uploaded successfully');
    
    return res.json({
      success: true,
      file_path: uploadResponse.data.file_path,
      original_name: req.file.originalname,
      message: 'Requirements file uploaded successfully'
    });

  } catch (err) {
    console.error('✗ File upload error:', err.message);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({ 
      error: 'File upload failed', 
      details: err.response?.data || err.message || String(err) 
    });
  }
});

// POST /api/analyze - Run main analysis flow
app.post('/api/analyze', async (req, res) => {
  console.log('\n🔍 Running requirement analysis...');
  
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const { input_value, file_path, session_id } = req.body;
    
    if (!input_value) {
      return res.status(400).json({ error: 'input_value is required' });
    }

    console.log(`  Query: ${input_value.substring(0, 150)}...`);
    
    if (file_path) {
      console.log(`  Requirements file: ${file_path}`);
    }

    // Initialize Langflow client
    const client = new LangflowClient({ 
      baseUrl: LANGFLOW_BASE_URL, 
      apiKey: apiKey
    });

    // Everything is handled by the main flow now
    // GitHub URL, branch, and Confluence URL are all in the input_value
    const analysisSessionId = session_id || `analysis_${Date.now()}`;

    const runOptions = {
      session_id: analysisSessionId
    };

    // Add file_path to tweaks if provided (for File component in flow)
    if (file_path) {
      // File component ID from "The Requirement Inspector" flow
      runOptions.tweaks = {
        'File-hqkLd': {
          path: [file_path]  // File component expects an array of file paths
        }
      };
      console.log(`  ✓ File path added to tweaks: ${file_path}`);
    }

    console.log('🚀 Running main analysis flow...');
    const startTime = Date.now();
    
    const flow = client.flow(MAIN_ANALYSIS_FLOW_ID);
    const response = await flow.run(input_value, runOptions);

    const elapsed = Date.now() - startTime;
    console.log(`✓ Analysis completed (${elapsed}ms)`);

    return res.json({
      success: true,
      session_id: analysisSessionId,
      elapsed_ms: elapsed,
      response: response
    });

  } catch (err) {
    console.error('✗ Analysis error:', err.message);
    console.error('  Stack:', err.stack);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      details: err.message || String(err) 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\n📋 Configuration:`);
  console.log(`   Langflow URL: ${LANGFLOW_BASE_URL}`);
  console.log(`   Main Analysis Flow: ${MAIN_ANALYSIS_FLOW_ID}`);
  console.log(`   API Key: ${SERVER_API_KEY ? '✓ Set' : '✗ Not set'}`);
  
  if (SERVER_API_KEY) {
    console.log(`   API Key Preview: ${SERVER_API_KEY.substring(0, 10)}...`);
  }
  
  console.log(`\n📝 Usage:`);
  console.log(`   All analysis happens in the main flow`);
  console.log(`   GitHub URL and Confluence link are passed in the chat input`);
  console.log(`   Example: "Analyze requirements from [confluence-url] against [github-url] master branch"`);
  console.log('');
});
