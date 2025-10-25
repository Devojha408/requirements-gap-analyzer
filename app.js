// Application State
const state = {
  isLoading: false,
  currentQuery: '',
  results: null,
  error: null,
  uploadedFile: null,
  codebaseProcessed: false,
  codebaseSessionId: null
};

// API Configuration
const API_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoints: {
    processCodebase: '/api/process-codebase',
    uploadFile: '/api/upload-file',
    analyze: '/api/analyze'
  }
};

// DOM Elements
const elements = {
  // Codebase section
  codebaseInput: document.getElementById('codebaseUrl'),
  branchInput: document.getElementById('branchInput'),
  processCodebaseBtn: document.getElementById('processCodebaseBtn'),
  codebaseStatus: document.getElementById('codebaseStatus'),
  
  // File upload section
  fileInput: document.getElementById('requirementsFile'),
  fileUploadBtn: document.getElementById('uploadFileBtn'),
  fileStatus: document.getElementById('fileStatus'),
  
  // Analysis section
  queryInput: document.getElementById('analysisQuery'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  charCount: document.getElementById('charCount'),
  
  // Results section
  loadingSection: document.getElementById('loadingSection'),
  resultsSection: document.getElementById('resultsSection'),
  errorSection: document.getElementById('errorSection'),
  summaryText: document.getElementById('summaryText'),
  gapsList: document.getElementById('gapsList'),
  recommendationsList: document.getElementById('recommendationsList'),
  errorMessage: document.getElementById('errorMessage')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateCharCount();
});

// Setup Event Listeners
function setupEventListeners() {
  // Codebase processing
  elements.processCodebaseBtn.addEventListener('click', handleProcessCodebase);
  
  // File upload
  elements.fileInput.addEventListener('change', handleFileSelected);
  elements.fileUploadBtn.addEventListener('click', handleFileUpload);
  
  // Analysis
  elements.queryInput.addEventListener('input', updateCharCount);
  elements.analyzeBtn.addEventListener('click', handleAnalyze);
  
  // Enter key support
  elements.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  });
}

// Handle Process Codebase
async function handleProcessCodebase() {
  const gitUrl = elements.codebaseInput.value.trim();
  const branch = elements.branchInput.value.trim() || 'main';
  
  if (!gitUrl) {
    showToast('Please enter a Git repository URL', 'error');
    return;
  }

  // Validate Git URL format
  const gitUrlPattern = /^(https?:\/\/)?([\w\.-]+@)?[\w\.-]+(:\d+)?(\/[\w\.-\/]*)?\.git$/i;
  const isGithub = gitUrl.includes('github.com');
  const isGitlab = gitUrl.includes('gitlab.com');
  
  if (!gitUrlPattern.test(gitUrl) && !isGithub && !isGitlab) {
    showToast('Please enter a valid Git repository URL', 'error');
    return;
  }

  try {
    elements.processCodebaseBtn.disabled = true;
    updateCodebaseStatus('Processing codebase from Git...', 'loading');

    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.processCodebase}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        git_url: gitUrl,
        branch: branch
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || response.statusText);
    }

    const data = await response.json();
    state.codebaseProcessed = true;
    state.codebaseSessionId = data.session_id;
    
    updateCodebaseStatus(`✓ Codebase uploaded to Astra DB (${data.elapsed_ms}ms)`, 'success');
    showToast('Codebase processed successfully! RAG vectors created.', 'success');

  } catch (error) {
    console.error('Codebase processing error:', error);
    updateCodebaseStatus(`✗ Failed: ${error.message}`, 'error');
    showToast(`Codebase processing failed: ${error.message}`, 'error');
    elements.processCodebaseBtn.disabled = false;
  }
}

// Handle File Selected
function handleFileSelected(e) {
  const file = e.target.files[0];
  if (file) {
    elements.fileUploadBtn.disabled = false;
    updateFileStatus(`Selected: ${file.name} (${formatFileSize(file.size)})`, 'info');
  } else {
    elements.fileUploadBtn.disabled = true;
    updateFileStatus('No file selected', 'default');
  }
}

// Handle File Upload
async function handleFileUpload() {
  const file = elements.fileInput.files[0];
  if (!file) {
    showToast('Please select a file first', 'error');
    return;
  }

  try {
    elements.fileUploadBtn.disabled = true;
    updateFileStatus('Uploading...', 'loading');

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.uploadFile}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || response.statusText);
    }

    const data = await response.json();
    state.uploadedFile = data.file_path;
    
    updateFileStatus(`✓ Uploaded: ${data.original_name}`, 'success');
    showToast('File uploaded successfully!', 'success');
    
    // Enable analyze button
    elements.analyzeBtn.disabled = false;

  } catch (error) {
    console.error('File upload error:', error);
    updateFileStatus(`✗ Failed: ${error.message}`, 'error');
    showToast(`File upload failed: ${error.message}`, 'error');
    elements.fileUploadBtn.disabled = false;
  }
}

// Handle Analyze
async function handleAnalyze() {
  const query = elements.queryInput.value.trim();
  
  if (!query) {
    showToast('Please enter an analysis query', 'error');
    return;
  }

  if (query.length < 10) {
    showToast('Query is too short. Please provide more details.', 'error');
    return;
  }

  try {
    setState({ isLoading: true, currentQuery: query, error: null });
    showSection('loading');
    
    const result = await callAnalysisAPI(query);
    
    setState({ isLoading: false, results: result });
    displayResults(result);
    showSection('results');

  } catch (error) {
    console.error('Analysis error:', error);
    setState({ isLoading: false, error: error.message });
    displayError(error.message);
    showSection('error');
  }
}

// Call Analysis API
async function callAnalysisAPI(query) {
  const payload = {
    input_value: query,
    session_id: state.codebaseSessionId || `user_${Date.now()}`
  };

  // Add uploaded file path if available
  if (state.uploadedFile) {
    payload.file_path = state.uploadedFile;
  }

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.analyze}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || response.statusText);
    }

    const data = await response.json();
    return data.response;

  } catch (error) {
    console.error('Analysis API error:', error);
    throw error;
  }
}

// Display Results
function displayResults(result) {
  try {
    // Extract text from Langflow response
    let outputText = '';
    
    if (result.outputs && result.outputs.length > 0) {
      const output = result.outputs[0];
      
      if (output.outputs && output.outputs.length > 0) {
        const firstOutput = output.outputs[0];
        
        if (firstOutput.results && firstOutput.results.message) {
          outputText = firstOutput.results.message.text || firstOutput.results.message;
        } else if (firstOutput.messages && firstOutput.messages.length > 0) {
          outputText = firstOutput.messages[0].text || firstOutput.messages[0];
        }
      }
    }

    // Parse the output text
    const sections = parseAnalysisOutput(outputText);
    
    // Display summary
    elements.summaryText.textContent = sections.summary || 'Analysis completed successfully.';
    
    // Display gaps
    elements.gapsList.innerHTML = '';
    if (sections.gaps && sections.gaps.length > 0) {
      sections.gaps.forEach(gap => {
        const li = document.createElement('li');
        li.textContent = gap;
        elements.gapsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No gaps detected';
      li.style.color = 'var(--color-success)';
      elements.gapsList.appendChild(li);
    }
    
    // Display recommendations
    elements.recommendationsList.innerHTML = '';
    if (sections.recommendations && sections.recommendations.length > 0) {
      sections.recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.textContent = rec;
        elements.recommendationsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No recommendations at this time';
      elements.recommendationsList.appendChild(li);
    }

  } catch (error) {
    console.error('Error displaying results:', error);
    elements.summaryText.textContent = 'Analysis completed, but there was an error parsing the results.';
  }
}

// Parse Analysis Output
function parseAnalysisOutput(text) {
  const sections = {
    summary: '',
    gaps: [],
    recommendations: []
  };

  if (!text) return sections;

  // Extract summary (first paragraph or before "Gaps" section)
  const summaryMatch = text.match(/^(.*?)(?=\n\n|Gaps:|Recommendations:|$)/s);
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim();
  }

  // Extract gaps
  const gapsMatch = text.match(/Gaps?:?\s*([\s\S]*?)(?=Recommendations?:|$)/i);
  if (gapsMatch) {
    const gapsText = gapsMatch[1];
    sections.gaps = gapsText
      .split(/\n/)
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  // Extract recommendations
  const recsMatch = text.match(/Recommendations?:?\s*([\s\S]*?)$/i);
  if (recsMatch) {
    const recsText = recsMatch[1];
    sections.recommendations = recsText
      .split(/\n/)
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  return sections;
}

// Display Error
function displayError(message) {
  elements.errorMessage.textContent = message || 'An unexpected error occurred. Please try again.';
}

// Update State
function setState(updates) {
  Object.assign(state, updates);
}

// Show Section
function showSection(section) {
  elements.loadingSection.classList.add('hidden');
  elements.resultsSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
  
  if (section === 'loading') {
    elements.loadingSection.classList.remove('hidden');
  } else if (section === 'results') {
    elements.resultsSection.classList.remove('hidden');
  } else if (section === 'error') {
    elements.errorSection.classList.remove('hidden');
  }
}

// Update Character Count
function updateCharCount() {
  const length = elements.queryInput.value.length;
  elements.charCount.textContent = `${length}/2000`;
  
  if (length > 2000) {
    elements.charCount.style.color = 'var(--color-error)';
  } else {
    elements.charCount.style.color = 'var(--color-text-secondary)';
  }
}

// Update File Status
function updateFileStatus(message, type) {
  elements.fileStatus.textContent = message;
  elements.fileStatus.className = `file-status status-${type}`;
}

// Update Codebase Status
function updateCodebaseStatus(message, type) {
  elements.codebaseStatus.textContent = message;
  elements.codebaseStatus.className = `codebase-status status-${type}`;
}

// Format File Size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Show Toast
function showToast(message, type = 'info') {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? 'var(--color-success)' : type === 'error' ? 'var(--color-error)' : 'var(--color-info)'};
    color: white;
    border-radius: var(--radius-base);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}