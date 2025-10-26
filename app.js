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
  error: null,
  monitoringInterval: null
};

// API Configuration
const API_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoints: {
    uploadFile: '/api/upload-file',
    analyze: '/api/analyze',
    monitor: '/api/monitor/flow',
    config: '/api/config'
  }
};

// Application Configuration (loaded from server)
let APP_CONFIG = {
  flow_id: null
};

// Load configuration from server
async function loadConfig() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.config}`);
    if (response.ok) {
      const data = await response.json();
      APP_CONFIG = data;
      console.log('✓ Configuration loaded:', { flow_id: APP_CONFIG.flow_id });
    } else {
      console.warn('⚠️ Failed to load configuration from server');
    }
  } catch (error) {
    console.warn('⚠️ Error loading configuration:', error.message);
  }
}

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
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
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
    
    // Disable and hide download button during analysis
    if (elements.downloadBtn) {
      elements.downloadBtn.disabled = true;
      elements.downloadBtn.classList.add('hidden');
    }

    // Clear previous results for streaming
    if (elements.summaryText) {
      elements.summaryText.textContent = '';
    }
    if (elements.gapsList) {
      elements.gapsList.innerHTML = '';
    }
    if (elements.recommendationsList) {
      elements.recommendationsList.innerHTML = '';
    }

    // Show progress message for long-running analysis
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    if (loadingText) loadingText.textContent = 'Analyzing requirements...';
    if (loadingSubtext) loadingSubtext.textContent = 'Using streaming mode. Results will appear as they are generated...';

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
    
    // Use streaming for better UX with long-running flows
    const USE_STREAMING = true;
    
    // Get flow ID from configuration (loaded from server environment)
    const FLOW_ID = APP_CONFIG.flow_id;
    
    if (!FLOW_ID) {
      throw new Error('Flow ID not configured. Please set MAIN_ANALYSIS_FLOW_ID in your environment.');
    }
    
    // Show results section immediately when streaming starts
    if (USE_STREAMING) {
      showSection('results');
      elements.loadingSection.classList.add('hidden');
      // Start monitoring which component is running
      startMonitoring(FLOW_ID);
    }
    
    // Call analysis API - now everything goes to MAIN_ANALYSIS_FLOW_ID
    const result = await callAnalysisAPI(analysisQuery, filePath, USE_STREAMING);
    
    // Stop monitoring when done
    stopMonitoring();
    
    // Hide streaming progress indicator
    const streamingProgress = document.getElementById('streamingProgress');
    if (streamingProgress) {
      streamingProgress.classList.add('hidden');
    }
    
    setState({ isLoading: false, results: result });
    
    if (!USE_STREAMING) {
      displayResults(result);
    } else {
      // In streaming mode, parse the accumulated text to populate gaps/recommendations
      const streamedText = elements.summaryText?.textContent.replace('▊', '').trim() || '';
      console.log('📄 Parsing streamed text, length:', streamedText.length);
      
      if (streamedText) {
        const sections = parseAnalysisOutput(streamedText);
        console.log('📊 Parsed sections:', {
          summaryLength: sections.summary?.length || 0,
          gapsCount: sections.gaps?.length || 0,
          recsCount: sections.recommendations?.length || 0
        });
        
        // Update summary (already shown during streaming)
        // Parse and display gaps
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
        
        // Parse and display recommendations
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
      } else {
        console.warn('⚠️ No streamed text found to parse');
      }
    }
    
    // Only enable download button after successful completion
    elements.analyzeBtn.disabled = false;
    if (elements.downloadBtn) {
      elements.downloadBtn.disabled = false;
      elements.downloadBtn.classList.remove('hidden');
    }

  } catch (error) {
    console.error('❌ Analysis error:', error);
    stopMonitoring(); // Stop monitoring on error
    
    // Hide streaming progress on error
    const streamingProgress = document.getElementById('streamingProgress');
    if (streamingProgress) {
      streamingProgress.classList.add('hidden');
    }
    
    // Keep download button disabled on error
    if (elements.downloadBtn) {
      elements.downloadBtn.disabled = true;
      elements.downloadBtn.classList.add('hidden');
    }
    
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
  // Remove cursor element if present
  const summaryText = elements.summaryText.textContent.replace('▊', '').trim();
  report += summaryText + '\n\n';
  
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
async function callAnalysisAPI(query, filePath, useStreaming = false) {
  const payload = {
    input_value: query,
    session_id: `analysis_${Date.now()}`
  };

  // Add uploaded file path if available (for File component in flow)
  if (filePath) {
    payload.file_path = filePath;
  }

    console.log('🚀 Calling analysis API with payload:', payload);
    console.log('📡 Streaming mode:', useStreaming ? 'enabled (will use ReadableStream)' : 'disabled (will wait for complete JSON)');

  try {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.analyze}${useStreaming ? '?stream=true' : ''}`;
    
    const response = await fetch(url, {
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

    if (useStreaming && response.headers.get('Content-Type') === 'application/x-ndjson') {
      // Handle streaming response using ReadableStream API
      console.log('📡 Using ReadableStream to read chunks in real-time');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      let lastActivityTime = Date.now();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const event = JSON.parse(line);
            
            // Update last activity time
            lastActivityTime = Date.now();
            
            if (event.type === 'start') {
              console.log('✓ ' + event.message);
            } else if (event.type === 'keepalive') {
              // Keep-alive received, connection is still alive
              console.log('💓 Keep-alive');
            } else if (event.type === 'add_message') {
              // Message added to chat (from Langflow)
              console.log('📨 Message received:', event.data);
            } else if (event.type === 'token') {
              // Update UI with each token
              console.log('📝 Streaming token...');
              updateStreamingOutput(event.data);
            } else if (event.type === 'end') {
              console.log('✓ Streaming complete:', event);
              
              // Remove streaming cursor
              const cursor = elements.summaryText?.querySelector('.streaming-cursor');
              if (cursor) {
                cursor.remove();
              }
              
              // Enable download button on successful completion
              if (elements.downloadBtn) {
                elements.downloadBtn.disabled = false;
                elements.downloadBtn.classList.remove('hidden');
              }
              
              return event;
            } else if (event.type === 'error') {
              console.error('✗ Stream error:', event.error);
              
              // Keep download button disabled on error
              if (elements.downloadBtn) {
                elements.downloadBtn.disabled = true;
                elements.downloadBtn.classList.add('hidden');
              }
              
              throw new Error(event.error);
            }
          } catch (e) {
            console.warn('Failed to parse event:', line);
          }
        }
      }
      
      return { success: true };
    } else {
      // Non-streaming response - wait for complete JSON
      console.log('📦 Waiting for complete JSON response...');
      const data = await response.json();
      console.log('✓ Analysis complete:', data);
      return data.response;
    }

  } catch (error) {
    console.error('❌ Analysis API error:', error);
    
    // Check if it's a timeout/abort error
    if (error.message && (error.message.includes('terminated') || error.message.includes('aborted') || error.name === 'AbortError')) {
      throw new Error('Connection timeout. The analysis is taking longer than expected. Please try again or contact support if the issue persists.');
    }
    
    throw error;
  }
}

// Update streaming output in real-time
function updateStreamingOutput(chunk) {
  // Update the summary text with streaming chunks
  if (elements.summaryText) {
    // Remove cursor if it exists
    const cursor = elements.summaryText.querySelector('.streaming-cursor');
    if (cursor) {
      cursor.remove();
    }
    
    // Append the chunk
    elements.summaryText.textContent += chunk;
    
    // Add blinking cursor to show streaming is active
    const cursorSpan = document.createElement('span');
    cursorSpan.className = 'streaming-cursor';
    cursorSpan.textContent = '▊';
    elements.summaryText.appendChild(cursorSpan);
    
    // Auto-scroll to bottom
    elements.summaryText.parentElement.scrollTop = elements.summaryText.parentElement.scrollHeight;
  }
}

// Start monitoring component status during analysis
function startMonitoring(flowId) {
  // Clear any existing monitoring
  stopMonitoring();
  
  console.log(`📊 Starting monitoring for flow: ${flowId}`);
  
  state.monitoringInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.monitor}/${flowId}`);
      
      if (!response.ok) {
        console.warn(`⚠️ Monitor API returned ${response.status}`);
        return;
      }
      
      const data = await response.json();
      
      // Log the structure for debugging
      if (data.success && data.builds && data.builds.vertex_builds) {
        const componentCount = Object.keys(data.builds.vertex_builds).length;
        console.log(`📊 Monitor data: ${componentCount} component(s)`);
        updateComponentStatus(data.builds.vertex_builds);
      } else if (data.success && data.builds) {
        console.log('⚠️ Monitor response has builds but no vertex_builds:', Object.keys(data.builds));
      } else {
        console.warn('⚠️ Unexpected monitor response structure');
      }
    } catch (err) {
      console.warn('⚠️ Monitor polling error:', err.message);
    }
  }, 3000); // Poll every 3 seconds
}

// Stop monitoring
function stopMonitoring() {
  if (state.monitoringInterval) {
    clearInterval(state.monitoringInterval);
    state.monitoringInterval = null;
    console.log('✓ Monitoring stopped');
  }
}

// Update component status in UI
function updateComponentStatus(vertexBuilds) {
  const streamingProgress = document.getElementById('streamingProgress');
  const currentComponentSpan = document.getElementById('currentComponent');
  
  // vertex_builds is an object where keys are component names and values are arrays of build data
  const componentNames = Object.keys(vertexBuilds);
  
  if (componentNames.length === 0) {
    return;
  }
  
  // Get the most recent component (last key or first in iteration order)
  const latestComponent = componentNames[componentNames.length - 1];
  const componentBuilds = vertexBuilds[latestComponent];
  
  if (!componentBuilds || componentBuilds.length === 0) {
    return;
  }
  
  // Get the first build (could also get the most recent)
  const currentBuild = componentBuilds[0];
  
  // Check if component is running (based on outputs or logs)
  const isRunning = currentBuild.outputs && currentBuild.outputs.response && currentBuild.outputs.response.message;
  
  // Check for completion status in logs
  let isCompleted = false;
  if (currentBuild.logs && currentBuild.logs.response) {
    const logs = currentBuild.logs.response;
    const lastLog = logs[logs.length - 1];
    if (lastLog && lastLog.name === "Chain End") {
      isCompleted = true;
    }
  }
  
  if (streamingProgress) {
    streamingProgress.classList.remove('hidden');
  }
  
  // Update component name display (remove "Agent-" prefix if present)
  if (currentComponentSpan) {
    const cleanName = latestComponent.replace(/^Agent[- ]?/, '').replace(/[-_]/g, ' ');
    currentComponentSpan.textContent = isCompleted 
      ? '✓ Analysis complete! Generating report...' 
      : `🔄 Processing: ${cleanName}...`;
  }
  
  console.log(`📊 Current component: ${latestComponent}${isCompleted ? ' (completed)' : ' (running)'}`);
  
  // Log component details
  if (currentBuild.data && currentBuild.data.results) {
    console.log(`📊 Component data:`, {
      hasArtifacts: !!currentBuild.data.artifacts,
      hasOutputs: !!currentBuild.outputs,
      logCount: currentBuild.logs?.response?.length || 0
    });
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

  if (!text) {
    console.warn('⚠️ parseAnalysisOutput: No text provided');
    return sections;
  }

  console.log('🔍 Parsing text preview:', text.substring(0, 200) + '...');

  // Extract summary (first paragraph or before "Gaps" section)
  const summaryMatch = text.match(/^(.*?)(?=\n\n|Gaps:|Recommendations:|$)/s);
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim();
    console.log('✓ Found summary:', sections.summary.substring(0, 100) + '...');
  }

  // Extract gaps
  const gapsMatch = text.match(/Gaps?:?\s*([\s\S]*?)(?=Recommendations?:|$)/i);
  if (gapsMatch) {
    const gapsText = gapsMatch[1];
    sections.gaps = gapsText
      .split(/\n/)
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
    console.log('✓ Found gaps:', sections.gaps.length);
  } else {
    console.log('⚠️ No gaps section found');
  }

  // Extract recommendations
  const recsMatch = text.match(/Recommendations?:?\s*([\s\S]*?)$/i);
  if (recsMatch) {
    const recsText = recsMatch[1];
    sections.recommendations = recsText
      .split(/\n/)
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
    console.log('✓ Found recommendations:', sections.recommendations.length);
  } else {
    console.log('⚠️ No recommendations section found');
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