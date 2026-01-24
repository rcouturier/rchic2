/**
 * RCHIC Web Application
 * Interface web pour l'Analyse Statistique Implicative
 */

// Register cytoscape-dagre extension
if (typeof cytoscape !== 'undefined' && typeof cytoscapeDagre !== 'undefined') {
  cytoscape.use(cytoscapeDagre);
}

class RchicApp {
  constructor() {
    // Configuration - use same host/port as the web page
    this.apiBase = window.location.origin + '/api';

    // State
    this.currentAnalysis = 'implicative';
    this.variables = [];
    this.selectedVariables = new Set();
    this.cy = null;  // Cytoscape instance
    this.currentData = null;
    this.currentTab = 'graph';  // Onglet actif

    // Thresholds configuration
    this.thresholds = [
      { id: 1, enabled: true, value: 99, color: '#e74c3c' },
      { id: 2, enabled: false, value: 95, color: '#27ae60' },
      { id: 3, enabled: false, value: 90, color: '#3498db' },
      { id: 4, enabled: false, value: 85, color: '#9b59b6' }
    ];

    // Initialize
    this.init();
  }

  async init() {
    // Initialize i18n first
    await this.initI18n();

    this.bindEvents();
    this.initCytoscape();
    await this.checkConnection();
  }

  async initI18n() {
    // Load translations
    await window.i18n.load(window.i18n.locale);

    // Language selector
    const langSelector = document.getElementById('lang-selector');
    if (langSelector) {
      langSelector.value = window.i18n.locale;
      langSelector.addEventListener('change', async (e) => {
        await window.i18n.load(e.target.value);
        // Update dynamic content
        this.updateDynamicTranslations();
      });
    }
  }

  updateDynamicTranslations() {
    // Update connection status
    const indicator = document.getElementById('status-indicator');
    if (indicator) {
      const isConnected = indicator.classList.contains('connected');
      indicator.textContent = window.i18n.t(isConnected ? 'status.connected' : 'status.disconnected');
    }

    // Update select options (not handled by data-i18n on options)
    this.updateSelectOptions();
  }

  updateSelectOptions() {
    // Computing mode select
    const computingMode = document.getElementById('computing-mode');
    if (computingMode) {
      computingMode.options[0].text = window.i18n.t('options.classic');
      computingMode.options[1].text = window.i18n.t('options.classicConfidence');
      computingMode.options[2].text = window.i18n.t('options.implifiance');
      computingMode.options[3].text = window.i18n.t('options.entropic');
    }

    // Hierarchy mode select
    const hierarchyMode = document.getElementById('hierarchy-mode');
    if (hierarchyMode) {
      hierarchyMode.options[0].text = window.i18n.t('options.classic');
      hierarchyMode.options[1].text = window.i18n.t('options.classicConfidence');
      hierarchyMode.options[2].text = window.i18n.t('options.implifiance');
    }
  }

  // ==========================================================================
  // Event Binding
  // ==========================================================================

  bindEvents() {
    // File loading
    document.getElementById('btn-load').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFile(e.target.files[0]);
      }
    });

    // Analysis type buttons
    document.querySelectorAll('.btn-analysis').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchAnalysisType(e.target.dataset.type);
      });
    });

    // Compute button
    document.getElementById('btn-compute').addEventListener('click', () => {
      this.compute();
    });

    // Export button
    document.getElementById('btn-export').addEventListener('click', () => {
      this.exportResults();
    });

    // Threshold controls
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`th${i}-check`).addEventListener('change', (e) => {
        this.thresholds[i-1].enabled = e.target.checked;
        this.updateVisualization();
      });

      document.getElementById(`th${i}-range`).addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById(`th${i}-value`).textContent = val;
        this.thresholds[i-1].value = parseInt(val);
      });

      document.getElementById(`th${i}-range`).addEventListener('change', () => {
        this.updateVisualization();
      });

      document.getElementById(`th${i}-color`).addEventListener('change', (e) => {
        this.thresholds[i-1].color = e.target.value;
        this.updateVisualization();
      });
    }

    // Variable selection
    document.getElementById('btn-select-all').addEventListener('click', () => {
      this.selectAllVariables(true);
    });

    document.getElementById('btn-deselect-all').addEventListener('click', () => {
      this.selectAllVariables(false);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F7') {
        e.preventDefault();
        this.selectAllVariables(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        this.selectAllVariables(false);
      }
    });

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Console buttons
    document.getElementById('btn-refresh-console').addEventListener('click', () => {
      this.fetchConsoleMessages();
    });

    document.getElementById('btn-clear-console').addEventListener('click', () => {
      this.clearConsole();
    });
  }

  // ==========================================================================
  // API Communication
  // ==========================================================================

  async checkConnection() {
    try {
      const response = await fetch(`${this.apiBase}/health`);
      if (response.ok) {
        this.setConnectionStatus(true);
        return true;
      }
    } catch (e) {
      console.error('Connection error:', e);
    }
    this.setConnectionStatus(false);
    return false;
  }

  setConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    if (connected) {
      indicator.textContent = window.i18n.t('status.connected');
      indicator.className = 'status connected';
    } else {
      indicator.textContent = window.i18n.t('status.disconnected');
      indicator.className = 'status disconnected';
    }
  }

  async apiCall(endpoint, method = 'GET', data = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, options);
      const result = await response.json();

      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (e) {
      console.error('API Error:', e);
      throw e;
    }
  }

  async uploadFile(file) {
    this.showLoading(true);

    try {
      // Read file content as text
      const content = await this.readFileContent(file);

      // Send as plain text body
      const response = await fetch(`${this.apiBase}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: content
      });

      const result = await response.json();

      if (result.success) {
        this.variables = result.variables;
        this.selectedVariables = new Set(result.variables);

        this.updateFileInfo(file.name, result.n_rows, result.n_variables);
        this.updateVariablesList();
        this.enableCompute(true);

        // Show compute section and analysis type section now that file is loaded
        document.getElementById('compute-section').classList.remove('hidden');
        document.getElementById('analysis-type-section').classList.remove('hidden');

        // Show options panel for current analysis type
        this.updateOptionsVisibility();

        // Reset visualization (hide previous results)
        this.resetVisualization();

        this.showToast(window.i18n.t('messages.fileLoaded'), 'success');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (e) {
      this.showToast(window.i18n.t('messages.connectionError') + ': ' + e.message, 'error');
    } finally {
      this.showLoading(false);
    }
  }

  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // ==========================================================================
  // Computation
  // ==========================================================================

  async compute() {
    this.showLoading(true);

    try {
      // Switch to graph tab BEFORE rendering to ensure visibility
      this.switchTab('graph');

      // Wait for browser to finish rendering (two animation frames for safety)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      let result;
      const selectedVars = Array.from(this.selectedVariables);

      switch (this.currentAnalysis) {
        case 'implicative':
          result = await this.computeImplicative(selectedVars);
          this.renderImplicativeGraph(result);
          break;

        case 'similarity':
          result = await this.computeSimilarity(selectedVars);
          // Wait for container to have valid dimensions
          await this.waitForContainer();
          this.renderTree(result, 'similarity');
          break;

        case 'hierarchy':
          result = await this.computeHierarchy(selectedVars);
          // Wait for container to have valid dimensions
          await this.waitForContainer();
          this.renderTree(result, 'hierarchy');
          break;
      }

      this.currentData = result;
      document.getElementById('btn-export').disabled = false;

      // Update console messages after computation
      await this.fetchConsoleMessages();

    } catch (e) {
      this.showToast(window.i18n.t('messages.computeError') + ': ' + e.message, 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async waitForContainer() {
    // Wait until viz-container has valid dimensions
    const vizContainer = document.getElementById('viz-container');
    let attempts = 0;
    while (attempts < 20) {
      if (vizContainer.clientWidth > 0 && vizContainer.clientHeight > 0) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
  }

  async computeImplicative(selectedVars) {
    // Find the minimum active threshold
    const activeThresholds = this.thresholds.filter(t => t.enabled);
    const minThreshold = activeThresholds.length > 0
      ? Math.min(...activeThresholds.map(t => t.value))
      : 85;

    const mode = document.getElementById('computing-mode').value;
    const complete = document.getElementById('complete-graph').checked;

    return await this.apiCall('/implicative', 'POST', {
      threshold: minThreshold,
      computing_mode: parseInt(mode),
      complete_graph: complete,
      selected_variables: selectedVars
    });
  }

  async computeSimilarity(selectedVars) {
    return await this.apiCall('/similarity', 'POST', {
      selected_variables: selectedVars,
      contribution_supp: false,
      typicality_supp: false
    });
  }

  async computeHierarchy(selectedVars) {
    const mode = document.getElementById('hierarchy-mode').value;

    return await this.apiCall('/hierarchy', 'POST', {
      computing_mode: parseInt(mode),
      selected_variables: selectedVars,
      contribution_supp: false,
      typicality_supp: false
    });
  }

  // ==========================================================================
  // Cytoscape Graph Rendering
  // ==========================================================================

  initCytoscape() {
    this.cy = cytoscape({
      container: document.getElementById('graph-container'),
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'background-color': '#4A90D9',
            'color': '#2c3e50',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-weight': '500',
            'width': 'label',
            'height': 'label',
            'padding': '12px',
            'shape': 'roundrectangle',
            'text-wrap': 'wrap',
            'text-max-width': '100px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#e74c3c'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2
          }
        },
        {
          selector: 'edge.show-label',
          style: {
            'label': 'data(confidence)',
            'font-size': '10px',
            'text-background-color': 'white',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px'
          }
        }
      ],
      layout: { name: 'preset' },
      wheelSensitivity: 0.3
    });

    // Edge click handler
    this.cy.on('tap', 'edge', (e) => {
      this.showEdgeInfo(e.target.data());
    });

    // Node click handler
    this.cy.on('tap', 'node', (e) => {
      this.showNodeInfo(e.target.data());
    });
  }

  renderImplicativeGraph(data) {
    // Show graph container
    document.getElementById('placeholder').classList.add('hidden');
    document.getElementById('tree-container').classList.add('hidden');
    document.getElementById('graph-container').classList.remove('hidden');

    const elements = [];
    const showConfidence = document.getElementById('show-confidence').checked;

    // Helper to unwrap array values from R's JSON serialization
    const unwrap = (val) => Array.isArray(val) ? val[0] : val;

    // Create nodes
    data.nodes.forEach(node => {
      elements.push({
        data: {
          id: unwrap(node.id),
          label: unwrap(node.label),
          occurrences: unwrap(node.occurrences)
        }
      });
    });

    // Create edges with colors based on thresholds
    data.edges.forEach(edge => {
      const implication = unwrap(edge.implication);
      const color = this.getEdgeColor(implication);
      if (color) {  // Only add if threshold is active
        elements.push({
          data: {
            id: unwrap(edge.id),
            source: unwrap(edge.source),
            target: unwrap(edge.target),
            implication: implication,
            confidence: unwrap(edge.confidence).toFixed(3),
            counter_examples: unwrap(edge.counter_examples),
            color: color
          },
          classes: showConfidence ? 'show-label' : ''
        });
      }
    });

    this.cy.elements().remove();
    this.cy.add(elements);

    // Apply dagre layout (hierarchical, top to bottom)
    const layout = this.cy.layout({
      name: 'dagre',
      rankDir: 'TB',           // Top to Bottom (source above target)
      nodeSep: 50,             // Horizontal spacing between nodes
      rankSep: 80,             // Vertical spacing between ranks
      edgeSep: 10,             // Spacing between edges
      animate: false,
      fit: false,
      padding: 30
    });

    layout.run();

    // Fit graph to show all elements in the viewport
    this.cy.fit(null, 50);

    // Update info
    this.showToast(window.i18n.t('messages.graphResult', { nodes: data.n_nodes, edges: data.n_edges }), 'info');
  }

  getEdgeColor(implication) {
    // Sort thresholds by value descending
    const sorted = [...this.thresholds]
      .filter(t => t.enabled)
      .sort((a, b) => b.value - a.value);

    for (const threshold of sorted) {
      if (implication > threshold.value) {
        return threshold.color;
      }
    }
    return null;  // Below all thresholds
  }

  updateVisualization() {
    if (this.currentAnalysis === 'implicative' && this.currentData && this.cy) {
      // Update edges visibility and colors without redoing the layout
      const showConfidence = document.getElementById('show-confidence').checked;
      const data = this.currentData;

      // Helper to unwrap array values from R's JSON serialization
      const unwrap = (val) => Array.isArray(val) ? val[0] : val;

      // Update each edge
      data.edges.forEach(edge => {
        const edgeId = unwrap(edge.id);
        const implication = unwrap(edge.implication);
        const color = this.getEdgeColor(implication);
        const cyEdge = this.cy.getElementById(edgeId);

        if (color) {
          // Edge should be visible
          if (cyEdge.length === 0) {
            // Edge doesn't exist, add it
            this.cy.add({
              data: {
                id: edgeId,
                source: unwrap(edge.source),
                target: unwrap(edge.target),
                implication: implication,
                confidence: unwrap(edge.confidence).toFixed(3),
                counter_examples: unwrap(edge.counter_examples),
                color: color
              },
              classes: showConfidence ? 'show-label' : ''
            });
          } else {
            // Edge exists, update color and class
            cyEdge.data('color', color);
            if (showConfidence) {
              cyEdge.addClass('show-label');
            } else {
              cyEdge.removeClass('show-label');
            }
          }
        } else {
          // Edge should be hidden
          if (cyEdge.length > 0) {
            cyEdge.remove();
          }
        }
      });
    }
  }

  showEdgeInfo(data) {
    const infoPanel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    content.innerHTML = `
      <div class="info-row">
        <span class="label">Regle:</span>
        <span class="value">${data.source} => ${data.target}</span>
      </div>
      <div class="info-row">
        <span class="label">Implication:</span>
        <span class="value">${data.implication}</span>
      </div>
      <div class="info-row">
        <span class="label">Confiance:</span>
        <span class="value">${data.confidence}</span>
      </div>
      <div class="info-row">
        <span class="label">Contre-exemples:</span>
        <span class="value">${data.counter_examples}</span>
      </div>
    `;

    infoPanel.classList.remove('hidden');
  }

  showNodeInfo(data) {
    const infoPanel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    content.innerHTML = `
      <div class="info-row">
        <span class="label">Variable:</span>
        <span class="value">${data.label}</span>
      </div>
      <div class="info-row">
        <span class="label">Occurrences:</span>
        <span class="value">${data.occurrences || 'N/A'}</span>
      </div>
    `;

    infoPanel.classList.remove('hidden');
  }

  // ==========================================================================
  // Tree Rendering (D3.js)
  // ==========================================================================

  renderTree(data, type) {
    // Show tree container
    document.getElementById('placeholder').classList.add('hidden');
    document.getElementById('graph-container').classList.add('hidden');
    document.getElementById('tree-container').classList.remove('hidden');

    const container = document.getElementById('tree-container');
    container.innerHTML = '';

    // Get parent container dimensions
    const vizContainer = document.getElementById('viz-container');
    const width = vizContainer.clientWidth || 1200;
    const height = vizContainer.clientHeight || 800;
    const margin = { top: 40, right: 40, bottom: 80, left: 40 };

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Calculate dimensions
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Extract data from new API format
    const variablesOrder = data.variables_order;  // Variables in display order
    const inputVariables = data.input_variables;  // Variables in original order
    const variableLeft = data.variable_left;      // Original indices (1-based)
    const variableRight = data.variable_right;    // Original indices (1-based)
    const significant = data.significant;
    const nbLevels = Array.isArray(data.nb_levels) ? data.nb_levels[0] : data.nb_levels;

    // Create mapping from original variable index (1-based) to display position (1-based)
    // input_variables[i-1] is the name of original variable i
    // We need to find where that name appears in variablesOrder
    const originalToDisplay = {};
    for (let origIdx = 1; origIdx <= inputVariables.length; origIdx++) {
      const varName = inputVariables[origIdx - 1];
      const displayIdx = variablesOrder.indexOf(varName) + 1;  // 1-based display position
      originalToDisplay[origIdx] = displayIdx;
    }

    // Spacing
    const dx = innerWidth / (variablesOrder.length + 1);
    const dy = (innerHeight - 150) / (nbLevels + 1);

    // Initial x positions and y heights for each ORIGINAL variable index
    // Tree starts from TOP (like tcltk version)
    const offsetX = {};
    const offsetY = {};

    // Space for rotated labels at top - closer to tree
    const treeStartY = 80;

    // Initialize positions based on display order
    for (let origIdx = 1; origIdx <= inputVariables.length; origIdx++) {
      const displayPos = originalToDisplay[origIdx];
      offsetX[origIdx] = displayPos * dx;
      offsetY[origIdx] = treeStartY;  // Start from top
    }

    // Draw variable labels (vertical text) at TOP in display order - closer to tree
    variablesOrder.forEach((v, i) => {
      const displayPos = i + 1;
      g.append('text')
        .attr('x', displayPos * dx)
        .attr('y', treeStartY - 5)
        .attr('text-anchor', 'start')
        .attr('transform', `rotate(-60, ${displayPos * dx}, ${treeStartY - 5})`)
        .style('font-size', '11px')
        .style('fill', '#2c3e50')
        .text(v);
    });

    // Draw tree edges - tree grows DOWNWARD from top
    for (let level = 0; level < nbLevels; level++) {
      const leftOrigIdx = variableLeft[level];   // Original variable index
      const rightOrigIdx = variableRight[level]; // Original variable index
      const y2 = treeStartY + (level + 1) * dy;  // Y increases downward
      const isSignificant = significant[level] === 1;

      // Left vertical line (from current height down to new level)
      g.append('line')
        .attr('x1', offsetX[leftOrigIdx])
        .attr('y1', offsetY[leftOrigIdx])
        .attr('x2', offsetX[leftOrigIdx])
        .attr('y2', y2)
        .attr('stroke', '#555')
        .attr('stroke-width', 2);

      // Horizontal line connecting left and right
      g.append('line')
        .attr('x1', offsetX[leftOrigIdx])
        .attr('y1', y2)
        .attr('x2', offsetX[rightOrigIdx])
        .attr('y2', y2)
        .attr('stroke', isSignificant ? '#e74c3c' : '#555')
        .attr('stroke-width', isSignificant ? 3 : 2);

      // Right vertical line (from new level up to current height)
      g.append('line')
        .attr('x1', offsetX[rightOrigIdx])
        .attr('y1', y2)
        .attr('x2', offsetX[rightOrigIdx])
        .attr('y2', offsetY[rightOrigIdx])
        .attr('stroke', '#555')
        .attr('stroke-width', 2);

      // Arrow for hierarchy tree (pointing right)
      if (type === 'hierarchy') {
        g.append('polygon')
          .attr('points', `${offsetX[rightOrigIdx]-5},${y2-5} ${offsetX[rightOrigIdx]},${y2} ${offsetX[rightOrigIdx]-5},${y2+5}`)
          .attr('fill', isSignificant ? '#e74c3c' : '#555');
      }

      // Update positions for merged cluster
      const newX = (offsetX[leftOrigIdx] + offsetX[rightOrigIdx]) / 2;
      offsetX[leftOrigIdx] = newX;
      offsetX[rightOrigIdx] = newX;
      offsetY[leftOrigIdx] = y2;
      offsetY[rightOrigIdx] = y2;
    }

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    this.showToast(window.i18n.t('messages.treeResult', { variables: variablesOrder.length, levels: nbLevels }), 'info');
  }

  // ==========================================================================
  // UI Updates
  // ==========================================================================

  switchAnalysisType(type) {
    this.currentAnalysis = type;

    // Update buttons
    document.querySelectorAll('.btn-analysis').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Update options visibility
    this.updateOptionsVisibility();

    // Reset visualization if data loaded
    if (this.variables.length > 0) {
      document.getElementById('placeholder').classList.remove('hidden');
      document.getElementById('graph-container').classList.add('hidden');
      document.getElementById('tree-container').classList.add('hidden');
      document.getElementById('info-panel').classList.add('hidden');
    }
  }

  updateOptionsVisibility() {
    const fileLoaded = this.variables.length > 0;

    // Show/hide option panels based on current analysis type AND file loaded status
    document.getElementById('options-implicative').classList.toggle('hidden',
      !fileLoaded || this.currentAnalysis !== 'implicative');
    document.getElementById('options-hierarchy').classList.toggle('hidden',
      !fileLoaded || this.currentAnalysis !== 'hierarchy');
    document.getElementById('options-similarity').classList.toggle('hidden',
      !fileLoaded || this.currentAnalysis !== 'similarity');
  }

  resetVisualization() {
    // Hide graph and tree containers
    document.getElementById('graph-container').classList.add('hidden');
    document.getElementById('tree-container').classList.add('hidden');

    // Show placeholder with updated message
    const placeholder = document.getElementById('placeholder');
    placeholder.classList.remove('hidden');
    placeholder.querySelector('p').textContent = window.i18n.t('messages.loadFilePrompt');

    // Hide info panel
    document.getElementById('info-panel').classList.add('hidden');

    // Reset current data
    this.currentData = null;

    // Disable export button
    document.getElementById('btn-export').disabled = true;

    // Clear cytoscape graph if exists
    if (this.cy) {
      this.cy.elements().remove();
    }

    // Clear tree container
    document.getElementById('tree-container').innerHTML = '';
  }

  updateFileInfo(filename, nRows, nVars) {
    document.getElementById('file-info').classList.remove('hidden');
    document.getElementById('filename').textContent = filename;
    document.getElementById('n-rows').textContent = nRows;
    document.getElementById('n-vars').textContent = nVars;
  }

  updateVariablesList() {
    const container = document.getElementById('variables-list');
    container.innerHTML = '';

    this.variables.forEach(varName => {
      const item = document.createElement('div');
      item.className = 'variable-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `var-${varName}`;
      checkbox.checked = this.selectedVariables.has(varName);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedVariables.add(varName);
        } else {
          this.selectedVariables.delete(varName);
        }
      });

      const label = document.createElement('label');
      label.htmlFor = `var-${varName}`;
      label.textContent = varName;

      item.appendChild(checkbox);
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  selectAllVariables(select) {
    this.variables.forEach(varName => {
      const checkbox = document.getElementById(`var-${varName}`);
      if (checkbox) {
        checkbox.checked = select;
      }
      if (select) {
        this.selectedVariables.add(varName);
      } else {
        this.selectedVariables.delete(varName);
      }
    });
  }

  enableCompute(enabled) {
    document.getElementById('btn-compute').disabled = !enabled;
  }

  showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  async exportResults() {
    if (this.currentAnalysis === 'implicative' && this.cy) {
      // Export as PNG
      const png = this.cy.png({ scale: 2, bg: 'white' });
      const link = document.createElement('a');
      link.download = 'rchic_graph.png';
      link.href = png;
      link.click();
    } else {
      // Export tree as SVG
      const svg = document.querySelector('#tree-container svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'rchic_tree.svg';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
    }

    this.showToast(window.i18n.t('messages.exportSuccess'), 'success');
  }

  // ==========================================================================
  // Tab Management
  // ==========================================================================

  switchTab(tabId) {
    this.currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab content
    document.getElementById('tab-content-graph').classList.toggle('hidden', tabId !== 'graph');
    document.getElementById('tab-content-data').classList.toggle('hidden', tabId !== 'data');

    // If switching to data tab, load console messages
    if (tabId === 'data') {
      this.fetchConsoleMessages();
    }

    // If switching to graph tab, refresh the visualization
    if (tabId === 'graph' && this.cy) {
      // Delay to ensure the container is visible
      setTimeout(() => {
        this.cy.resize();
        this.cy.fit();
      }, 50);
    }
  }

  // ==========================================================================
  // Console Management
  // ==========================================================================

  async fetchConsoleMessages() {
    try {
      const response = await fetch(`${this.apiBase}/console`);
      const result = await response.json();
      if (result.success) {
        this.renderConsole(result.messages);
      }
    } catch (e) {
      console.error('Error fetching console:', e);
    }
  }

  renderConsole(messages) {
    const outputEl = document.getElementById('console-output');

    if (!messages || messages.length === 0) {
      outputEl.innerHTML = `<p class="text-muted">${window.i18n.t('messages.runCalculation')}</p>`;
      return;
    }

    outputEl.innerHTML = messages.map(msg => {
      let lineClass = 'console-line';

      // Colorer selon le type de message
      if (msg.startsWith('===') || msg.startsWith('---')) {
        lineClass += ' header';
      } else if (msg.toLowerCase().includes('erreur') || msg.toLowerCase().includes('error')) {
        lineClass += ' error';
      } else if (msg.toLowerCase().includes('warning') || msg.toLowerCase().includes('attention')) {
        lineClass += ' warning';
      }

      return `<div class="${lineClass}">${this.escapeHtml(msg)}</div>`;
    }).join('');

    // Scroll to bottom
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async clearConsole() {
    try {
      await fetch(`${this.apiBase}/console/clear`, { method: 'POST' });
      document.getElementById('console-output').innerHTML = `<p class="text-muted">${window.i18n.t('messages.runCalculation')}</p>`;
    } catch (e) {
      console.error('Error clearing console:', e);
    }
  }
}

// ==========================================================================
// Initialize Application
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  window.rchicApp = new RchicApp();
});
