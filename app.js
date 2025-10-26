// Application State
const state = {
  isLoading: false,
  confluenceUrl: '',
  githubUrl: '',
  branchName: 'main',
  instructions: '',
  uploadedFile: null,
  uploadedFileName: null,
  results: null,
  error: null
};

// API Configuration
const API_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoints: {
    uploadFile: '/api/upload-file',
    analyze: '/api/analyze'
  }
};

// DOM Elements
const elements = {
  // Requirements source
  confluenceUrl: document.getElementById('confluenceUrl'),
  requirementsFile: document.getElementById('requirementsFile'),
  fileLabel: document.getElementById('fileLabel'),
  fileStatus: document.getElementById('fileStatus'),
  
  // Codebase source
  githubUrl: document.getElementById('githubUrl'),
  branchName: document.getElementById('branchName'),
  
  // Analysis instructions
  analysisInstructions: document.getElementById('analysisInstructions'),
  charCount: document.getElementById('charCount'),
  
  // Action buttons
  analyzeBtn: document.getElementById('analyzeBtn'),
  resetBtn: document.getElementById('resetBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  
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
  // File upload
  elements.requirementsFile.addEventListener('change', handleFileSelected);
  
  // Character count
  elements.analysisInstructions.addEventListener('input', updateCharCount);
  
  // Action buttons
  elements.analyzeBtn.addEventListener('click', handleAnalyze);
  elements.resetBtn.addEventListener('click', handleReset);
  
  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener('click', handleDownload);
  }
  
  // Drag and drop for file upload
  setupDragAndDrop();
}

// Setup Drag and Drop
function setupDragAndDrop() {
  const fileLabel = document.querySelector('.file-upload-label');
  
  if (!fileLabel) return;
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    fileLabel.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  ['dragenter', 'dragover'].forEach(eventName => {
    fileLabel.addEventListener(eventName, () => {
      fileLabel.classList.add('drag-over');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    fileLabel.addEventListener(eventName, () => {
      fileLabel.classList.remove('drag-over');
    }, false);
  });
  
  fileLabel.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
      elements.requirementsFile.files = files;
      handleFileSelected({ target: { files } });
    }
  }, false);
}

// Handle File Selected
function handleFileSelected(e) {
  const file = e.target.files[0];
  if (file) {
    state.uploadedFileName = file.name;
    elements.fileLabel.textContent = file.name;
    elements.fileStatus.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
    elements.fileStatus.classList.remove('hidden', 'status-default', 'status-error');
    elements.fileStatus.classList.add('status-info');
  } else {
    state.uploadedFileName = null;
    elements.fileLabel.textContent = 'Choose a file or drag & drop';
    elements.fileStatus.classList.add('hidden');
  }
}

// Upload File to Langflow
async function uploadFileToLangflow(file) {
  try {
    updateFileStatus('Uploading to Langflow...', 'loading');

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
    return data.file_path;

  } catch (error) {
    console.error('File upload error:', error);
    updateFileStatus(`✗ Upload failed: ${error.message}`, 'error');
    throw error;
  }
}

// Handle Analyze
async function handleAnalyze() {
  console.log('🔍 Analyze button clicked');
  
  // Get form values
  const confluenceUrl = elements.confluenceUrl.value.trim();
  const githubUrl = elements.githubUrl.value.trim();
  const branchName = elements.branchName.value.trim() || 'main';
  const instructions = elements.analysisInstructions.value.trim();
  const file = elements.requirementsFile.files[0];

  console.log('Form values:', { confluenceUrl, githubUrl, branchName, hasFile: !!file });

  // Validation
  if (!confluenceUrl && !file) {
    showToast('Please provide either a Confluence URL or upload a requirements file', 'error');
    return;
  }

  if (!githubUrl) {
    showToast('Please enter a GitHub repository URL', 'error');
    return;
  }

  // Validate GitHub URL
  const isValidGithub = githubUrl.includes('github.com');
  if (!isValidGithub) {
    showToast('Please enter a valid GitHub repository URL', 'error');
    return;
  }

  try {
    setState({ isLoading: true, error: null });
    showSection('loading');
    elements.analyzeBtn.disabled = true;

    // Show progress message for long-running analysis
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    if (loadingText) loadingText.textContent = 'Analyzing requirements...';
    if (loadingSubtext) loadingSubtext.textContent = 'This may take 4-5 minutes. Please wait...';

    // Upload file to Langflow if provided
    let filePath = null;
    if (file) {
      console.log('📤 Uploading file...');
      filePath = await uploadFileToLangflow(file);
      console.log('✓ File uploaded:', filePath);
    }

    // Build analysis query - everything in one message for the main flow
    const analysisQuery = buildAnalysisQuery(confluenceUrl, githubUrl, branchName, instructions);
    console.log('📝 Analysis query:', analysisQuery);
    
    // Call analysis API - now everything goes to MAIN_ANALYSIS_FLOW_ID
    const result = await callAnalysisAPI(analysisQuery, filePath);
    
    setState({ isLoading: false, results: result });
    displayResults(result);
    showSection('results');
    elements.analyzeBtn.disabled = false;

  } catch (error) {
    console.error('❌ Analysis error:', error);
    setState({ isLoading: false, error: error.message });
    displayError(error.message);
    showSection('error');
    elements.analyzeBtn.disabled = false;
  }
}

// Build Analysis Query - combine everything into one chat message
function buildAnalysisQuery(confluenceUrl, githubUrl, branchName, instructions) {
  let query = 'Analyze the requirements ';
  
  if (confluenceUrl) {
    query += `from ${confluenceUrl} `;
  } else {
    query += `from the uploaded document `;
  }
  
  query += `for the project against the codebase at ${githubUrl}`;
  
  if (branchName && branchName !== 'main' && branchName !== 'master') {
    query += ` ${branchName} branch`;
  } else {
    query += ` ${branchName} branch`;
  }
  
  if (instructions) {
    query += `.\n\nAdditional instructions: ${instructions}`;
  }
  
  return query;
}

// Handle Reset
function handleReset() {
  console.log('🔄 Reset button clicked');
  
  // Clear all inputs
  elements.confluenceUrl.value = '';
  elements.githubUrl.value = '';
  elements.branchName.value = 'main';
  elements.analysisInstructions.value = '';
  elements.requirementsFile.value = '';
  
  // Reset file upload UI
  elements.fileLabel.textContent = 'Choose a file or drag & drop';
  elements.fileStatus.classList.add('hidden');
  
  // Reset state
  state.uploadedFile = null;
  state.uploadedFileName = null;
  state.results = null;
  state.error = null;
  
  // Update char count
  updateCharCount();
  
  // Hide results/error sections
  elements.resultsSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
  elements.loadingSection.classList.add('hidden');
  
  console.log('✓ Form reset complete');
  showToast('Form reset successfully', 'info');
}

// Handle Download
function handleDownload() {
  if (!state.results) return;
  
  const reportText = generateReportText();
  const blob = new Blob([reportText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `requirements-gap-analysis-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Report downloaded successfully', 'success');
}

// Generate Report Text
function generateReportText() {
  let report = '=== REQUIREMENTS GAP ANALYSIS REPORT ===\n\n';
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  report += '--- SUMMARY ---\n';
  report += elements.summaryText.textContent + '\n\n';
  
  report += '--- IDENTIFIED GAPS ---\n';
  const gaps = Array.from(elements.gapsList.children).map(li => li.textContent);
  if (gaps.length > 0) {
    gaps.forEach((gap, i) => {
      report += `${i + 1}. ${gap}\n`;
    });
  } else {
    report += 'No gaps identified\n';
  }
  report += '\n';
  
  report += '--- RECOMMENDATIONS ---\n';
  const recommendations = Array.from(elements.recommendationsList.children).map(li => li.textContent);
  if (recommendations.length > 0) {
    recommendations.forEach((rec, i) => {
      report += `${i + 1}. ${rec}\n`;
    });
  } else {
    report += 'No recommendations\n';
  }
  
  return report;
}

// Call Analysis API - simplified to pass everything in the chat input
async function callAnalysisAPI(query, filePath) {
  const payload = {
    input_value: query,
    session_id: `analysis_${Date.now()}`
  };

  // Add uploaded file path if available (for File component in flow)
  if (filePath) {
    payload.file_path = filePath;
  }

  console.log('🚀 Calling analysis API with payload:', payload);

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
    console.log('✓ Analysis complete:', data);
    return data.response;

  } catch (error) {
    console.error('❌ Analysis API error:', error);
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
  const length = elements.analysisInstructions.value.length;
  elements.charCount.textContent = `${length}/1000`;
  
  if (length > 1000) {
    elements.charCount.style.color = 'var(--color-error)';
  } else {
    elements.charCount.style.color = 'var(--color-text-secondary)';
  }
}

// Update File Status
function updateFileStatus(message, type) {
  elements.fileStatus.textContent = message;
  elements.fileStatus.className = `file-status status-${type}`;
  elements.fileStatus.classList.remove('hidden');
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