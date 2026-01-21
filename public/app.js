// Global variables
let currentChart = null;
let currentData = null;
let currentView = 'statistics';

// DOM elements
const pipelineSelect = document.getElementById('pipelineSelect');
const timeRangeSelect = document.getElementById('timeRange');
const chartTypeSelect = document.getElementById('chartType');
const refreshBtn = document.getElementById('refreshBtn');
const refreshCoverageBtn = document.getElementById('refreshCoverageBtn');
const loadingIndicator = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Statistics elements
const totalRunsEl = document.getElementById('totalRuns');
const successRunsEl = document.getElementById('successRuns');
const failureRunsEl = document.getElementById('failureRuns');
const successRateEl = document.getElementById('successRate');
const deployFrequencyEl = document.getElementById('deployFrequency');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupNavigation();
    loadPipelines();
});

// Setup navigation
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

// Switch view
function switchView(view) {
    currentView = view;
    
    // Update navigation button state
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Switch view container
    const statisticsView = document.getElementById('statisticsView');
    const coverageView = document.getElementById('coverageView');
    const leadtimeView = document.getElementById('leadtimeView');
    const changefailureView = document.getElementById('changefailureView');
    
    if (view === 'statistics') {
        statisticsView.classList.add('active');
        coverageView.classList.remove('active');
        leadtimeView.classList.remove('active');
        changefailureView.classList.remove('active');
    } else if (view === 'coverage') {
        statisticsView.classList.remove('active');
        coverageView.classList.add('active');
        leadtimeView.classList.remove('active');
        changefailureView.classList.remove('active');
        loadCoverageData();
    } else if (view === 'leadtime') {
        statisticsView.classList.remove('active');
        coverageView.classList.remove('active');
        leadtimeView.classList.add('active');
        changefailureView.classList.remove('active');
        loadLeadTimeData();
    } else if (view === 'changefailure') {
        statisticsView.classList.remove('active');
        coverageView.classList.remove('active');
        leadtimeView.classList.remove('active');
        changefailureView.classList.add('active');
        loadChangeFailureData();
    }
}

// Setup event listeners
function setupEventListeners() {
    pipelineSelect.addEventListener('change', loadData);
    timeRangeSelect.addEventListener('change', loadData);
    refreshBtn.addEventListener('click', loadData);
    if (refreshCoverageBtn) {
        refreshCoverageBtn.addEventListener('click', loadCoverageData);
    }
    chartTypeSelect.addEventListener('change', updateChart);
    
    // Lead Time event listeners
    const leadtimeTimeRange = document.getElementById('leadtimeTimeRange');
    const refreshLeadtimeBtn = document.getElementById('refreshLeadtimeBtn');
    if (leadtimeTimeRange) {
        leadtimeTimeRange.addEventListener('change', loadLeadTimeData);
    }
    if (refreshLeadtimeBtn) {
        refreshLeadtimeBtn.addEventListener('click', loadLeadTimeData);
    }
    
    // Change Failure Rate event listeners
    const changefailureTimeRange = document.getElementById('changefailureTimeRange');
    const refreshChangeFailureBtn = document.getElementById('refreshChangeFailureBtn');
    if (changefailureTimeRange) {
        changefailureTimeRange.addEventListener('change', loadChangeFailureData);
    }
    if (refreshChangeFailureBtn) {
        refreshChangeFailureBtn.addEventListener('click', loadChangeFailureData);
    }
}

// Load pipeline list
async function loadPipelines() {
    try {
        const response = await fetch('/api/pipelines');
        const result = await response.json();
        
        if (result.success && result.data) {
            pipelineSelect.innerHTML = '';
            result.data.forEach((pipeline, index) => {
                const option = document.createElement('option');
                option.value = pipeline.id;
                option.textContent = `${pipeline.name} (${pipeline.id})`;
                if (index === 0) option.selected = true;
                pipelineSelect.appendChild(option);
            });
            // Load data after loading pipeline list
            loadData();
        }
    } catch (error) {
        console.error('Error loading pipelines:', error);
        showError('Unable to load Pipeline list: ' + error.message);
    }
}

// Load data
async function loadData() {
    try {
        showLoading(true);
        hideError();
        
        const days = timeRangeSelect.value;
        const pipelineId = pipelineSelect.value;
        const response = await fetch(`/api/pipeline-runs?days=${days}&pipelineId=${pipelineId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        
        currentData = result.data;
        updateStatistics(currentData.statistics);
        updateChart();
        updateRunsTable(currentData.runs);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// Update statistics
function updateStatistics(stats) {
    totalRunsEl.textContent = stats.totalRuns;
    successRunsEl.textContent = stats.successCount;
    failureRunsEl.textContent = stats.failureCount;
    successRateEl.textContent = `${stats.successRate}%`;
    deployFrequencyEl.textContent = stats.deployFrequency;
}

// Update chart
function updateChart() {
    if (!currentData) return;
    
    const chartType = chartTypeSelect.value;
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // Destroy existing chart
    if (currentChart) {
        currentChart.destroy();
    }
    
    let chartConfig;
    
    switch (chartType) {
        case 'daily':
            chartConfig = createDailyChart(currentData.statistics.dailyStats);
            break;
        case 'hourly':
            chartConfig = createHourlyChart(currentData.statistics.hourlyStats);
            break;
        case 'success-rate':
            chartConfig = createSuccessRateChart(currentData.statistics);
            break;
        default:
            chartConfig = createDailyChart(currentData.statistics.dailyStats);
    }
    
    currentChart = new Chart(ctx, chartConfig);
}

// Create daily chart
function createDailyChart(dailyStats) {
    const sortedDates = Object.keys(dailyStats).sort((a, b) => new Date(a) - new Date(b));
    const labels = sortedDates.map(date => formatDate(new Date(date)));
    const successData = sortedDates.map(date => dailyStats[date].success);
    const failureData = sortedDates.map(date => dailyStats[date].failed);
    
    return {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Success',
                    data: successData,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Failed',
                    data: failureData,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Pipeline Runs - Daily Statistics',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    };
}

// Create hourly chart
function createHourlyChart(hourlyStats) {
    const hours = Array.from({length: 24}, (_, i) => i);
    const labels = hours.map(hour => `${hour}:00`);
    const totalData = hours.map(hour => hourlyStats[hour]?.total || 0);
    const successData = hours.map(hour => hourlyStats[hour]?.success || 0);
    const failureData = hours.map(hour => hourlyStats[hour]?.failed || 0);
    
    return {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total',
                    data: totalData,
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Success',
                    data: successData,
                    borderColor: 'rgba(40, 167, 69, 1)',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Failed',
                    data: failureData,
                    borderColor: 'rgba(220, 53, 69, 1)',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Pipeline Run Distribution - Hourly Statistics',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    };
}

// Create success rate chart
function createSuccessRateChart(stats) {
    return {
        type: 'doughnut',
        data: {
            labels: ['Success', 'Failed'],
            datasets: [{
                data: [stats.successCount, stats.failureCount],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)',
                    'rgba(220, 53, 69, 0.8)'
                ],
                borderColor: [
                    'rgba(40, 167, 69, 1)',
                    'rgba(220, 53, 69, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Pipeline Success Rate Analysis (${stats.successRate}%)`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    };
}

// Update runs table
function updateRunsTable(runs) {
    const tbody = document.querySelector('#runsTable tbody');
    tbody.innerHTML = '';
    
    runs.slice(0, 20).forEach(run => { // Only show recent 20 records
        const row = document.createElement('tr');
        
        const duration = calculateDuration(run.createdDate, run.finishedDate);
        
        row.innerHTML = `
            <td>${run.id}</td>
            <td>${run.name}</td>
            <td><span class="status-badge status-${run.state}">${getStatusText(run.state)}</span></td>
            <td><span class="status-badge result-${run.result}">${getResultText(run.result)}</span></td>
            <td>${formatDateTime(new Date(run.createdDate))}</td>
            <td>${run.finishedDate ? formatDateTime(new Date(run.finishedDate)) : '-'}</td>
            <td>${duration}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Utility functions
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(state) {
    const statusMap = {
        'completed': 'Completed',
        'running': 'Running',
        'pending': 'Pending',
        'cancelling': 'Cancelling',
        'cancelled': 'Cancelled'
    };
    return statusMap[state] || state;
}

function getResultText(result) {
    const resultMap = {
        'succeeded': 'Succeeded',
        'failed': 'Failed',
        'canceled': 'Cancelled',
        'none': 'No Result'
    };
    return resultMap[result] || result;
}

function calculateDuration(startDate, endDate) {
    if (!endDate) return '-';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end - start;
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

function showLoading(show) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Load code coverage data
async function loadCoverageData() {
    try {
        showLoading(true);
        hideError();
        
        const response = await fetch('/api/unit-test-coverage');
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch coverage data');
        }
        
        updateCoverageCards(result.data);
    } catch (error) {
        console.error('Error loading coverage data:', error);
        showError('Failed to load coverage data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Update coverage cards
function updateCoverageCards(data) {
    const container = document.getElementById('coverageCards');
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="no-data">No Unit Test Pipeline configured</div>';
        return;
    }
    
    data.forEach(pipeline => {
        const card = document.createElement('div');
        card.className = 'coverage-card';
        
        if (pipeline.error) {
            card.innerHTML = `
                <div class="coverage-card-header">
                    <h3>${pipeline.pipelineName}</h3>
                    <span class="pipeline-id">#${pipeline.pipelineId}</span>
                </div>
                <div class="error-info">
                    <p>⚠️ ${pipeline.error}</p>
                </div>
            `;
        } else {
            const coverageClass = getCoverageClass(pipeline.coverage.percentage);
            const resultClass = pipeline.buildResult === 'succeeded' ? 'success' : 'failure';
            
            card.innerHTML = `
                <div class="coverage-card-header">
                    <h3>${pipeline.pipelineName}</h3>
                    <span class="pipeline-id">#${pipeline.pipelineId}</span>
                </div>
                
                <div class="build-info">
                    <div class="build-status ${resultClass}">
                        ${pipeline.buildResult === 'succeeded' ? '✅' : '❌'} Build ${pipeline.buildNumber}
                    </div>
                    <div class="build-date">${formatDateTime(new Date(pipeline.buildDate))}</div>
                </div>
                
                <div class="coverage-display">
                    <div class="coverage-circle ${coverageClass}">
                        <svg viewBox="0 0 36 36" class="circular-chart">
                            <path class="circle-bg"
                                d="M18 2.0845
                                a 15.9155 15.9155 0 0 1 0 31.831
                                a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path class="circle"
                                stroke-dasharray="${pipeline.coverage.percentage}, 100"
                                d="M18 2.0845
                                a 15.9155 15.9155 0 0 1 0 31.831
                                a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <text x="18" y="20.35" class="percentage">${pipeline.coverage.percentage}%</text>
                        </svg>
                    </div>
                    <div class="coverage-stats">
                        <p class="coverage-label">Code Coverage</p>
                        <p class="coverage-numbers">${pipeline.coverage.linesCovered} / ${pipeline.coverage.linesTotal} lines</p>
                    </div>
                </div>
                
                <div class="coverage-actions">
                    <a href="${pipeline.links.coverage}" target="_blank" class="action-link coverage-link">
                        📊 View Coverage Report
                    </a>
                    <a href="${pipeline.links.tests}" target="_blank" class="action-link tests-link">
                        🧪 View Test Results
                    </a>
                </div>
            `;
        }
        
        container.appendChild(card);
    });
}

// Get coverage class
function getCoverageClass(percentage) {
    if (percentage >= 80) return 'high';
    if (percentage >= 60) return 'medium';
    return 'low';
}

// Load Lead Time for Changes data
let currentLeadTimeChart = null;
let availableRepositories = [];

async function loadLeadTimeData() {
    try {
        showLoading(true);
        hideError();
        
        // First get configuration
        const configResponse = await fetch('/api/config');
        const configResult = await configResponse.json();
        
        console.log('Config result:', configResult);
        
        if (!configResult.success) {
            throw new Error('Unable to get configuration');
        }
        
        availableRepositories = configResult.data.repositories || [];
        
        if (availableRepositories.length === 0) {
            throw new Error('Repository ID not configured, please set REPOSITORY_ID in .env file');
        }
        
        // Update repository selector
        updateRepositorySelector();
        
        // Get currently selected repository
        const selectedRepoId = document.getElementById('leadtimeRepository')?.value || availableRepositories[0].id;
        const selectedRepo = availableRepositories.find(r => r.id === selectedRepoId) || availableRepositories[0];
        
        const days = document.getElementById('leadtimeTimeRange').value;
        const response = await fetch(`/api/lead-time?days=${days}&repositoryId=${encodeURIComponent(selectedRepo.id + ':' + selectedRepo.name)}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch Lead Time data');
        }
        
        updateLeadTimeStatistics(result.data.statistics);
        updateLeadTimeChart(result.data.dailyStats, result.data.cycles);
        updateLeadTimeCycles(result.data.cycles);
    } catch (error) {
        console.error('Error loading lead time data:', error);
        showError('Failed to load Lead Time data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Update repository selector
function updateRepositorySelector() {
    let selector = document.getElementById('leadtimeRepository');
    
    // If selector doesn't exist, create it
    if (!selector) {
        const controlsDiv = document.querySelector('.leadtime-controls');
        if (controlsDiv) {
            const selectorHTML = `
                <div class="control-group">
                    <label for="leadtimeRepository">Repository:</label>
                    <select id="leadtimeRepository" onchange="loadLeadTimeData()">
                    </select>
                </div>
            `;
            controlsDiv.insertAdjacentHTML('afterbegin', selectorHTML);
            selector = document.getElementById('leadtimeRepository');
        }
    }
    
    if (selector && availableRepositories.length > 0) {
        const currentValue = selector.value;
        selector.innerHTML = availableRepositories.map(repo => 
            `<option value="${repo.id}">${repo.name}</option>`
        ).join('');
        
        // Restore previous selection
        if (currentValue && availableRepositories.find(r => r.id === currentValue)) {
            selector.value = currentValue;
        }
    }
}

// Update Lead Time statistics
function updateLeadTimeStatistics(stats) {
    document.getElementById('totalPRs').textContent = stats.totalCycles;
    document.getElementById('avgLeadTime').textContent = `${stats.avgLeadTimeHours}h (${stats.avgLeadTimeDays}d)`;
    document.getElementById('medianLeadTime').textContent = `${stats.medianLeadTimeHours}h`;
    document.getElementById('minLeadTime').textContent = `${stats.minLeadTimeHours}h`;
    document.getElementById('maxLeadTime').textContent = `${stats.maxLeadTimeHours}h`;
}

// Update Lead Time chart
function updateLeadTimeChart(dailyStats, cycles) {
    const ctx = document.getElementById('leadtimeChart').getContext('2d');
    
    if (currentLeadTimeChart) {
        currentLeadTimeChart.destroy();
    }
    
    // Use cycle data instead of aggregating by date
    const labels = cycles.map((cycle, idx) => `Cycle ${cycle.cycleNumber}`);
    const leadTimes = cycles.map(cycle => cycle.leadTimeHours);
    
    // Set different colors for different lead times
    // Green: < 1 week (168 hours)
    // Yellow: 1 week - 1 month (168-720 hours)
    // Red: > 1 month (>720 hours)
    const backgroundColors = leadTimes.map(hours => {
        if (hours < 168) return 'rgba(40, 167, 69, 0.6)';  // Green: <1 week
        if (hours < 720) return 'rgba(255, 193, 7, 0.6)';  // Yellow: 1 week-1 month
        return 'rgba(220, 53, 69, 0.6)';                    // Red: >1 month
    });
    
    const borderColors = leadTimes.map(hours => {
        if (hours < 168) return 'rgba(40, 167, 69, 1)';
        if (hours < 720) return 'rgba(255, 193, 7, 1)';
        return 'rgba(220, 53, 69, 1)';
    });
    
    currentLeadTimeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Lead Time (hours)',
                    data: leadTimes,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Lead Time for Changes - Cycle Details',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const cycle = cycles[context.dataIndex];
                            return [
                                `Lead Time: ${cycle.leadTimeDays} days`,
                                `PRs in Cycle: ${cycle.totalPRsInCycle}`,
                                `Start: ${new Date(cycle.startPR.closedDate).toLocaleDateString()}`,
                                `End: ${new Date(cycle.endPR.closedDate).toLocaleDateString()}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Lead Time (hours)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + 'h';
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

// Update Lead Time table (show cycles)
function updateLeadTimeCycles(cycles) {
    const tbody = document.querySelector('#leadtimeTable tbody');
    tbody.innerHTML = '';
    
    cycles.slice(0, 50).forEach(cycle => {
        const row = document.createElement('tr');
        
        // Add style class based on Lead Time
        // Green: < 1 week (168 hours)
        // Yellow: 1 week - 1 month (168-720 hours)
        // Red: > 1 month (>720 hours)
        let leadTimeClass = '';
        if (cycle.leadTimeHours < 168) {
            leadTimeClass = 'leadtime-fast';
        } else if (cycle.leadTimeHours < 720) {
            leadTimeClass = 'leadtime-medium';
        } else {
            leadTimeClass = 'leadtime-slow';
        }
        
        row.className = leadTimeClass;
        
        row.innerHTML = `
            <td>Cycle #${cycle.cycleNumber}</td>
            <td title="${cycle.startPR.title}">${cycle.startPR.title.length > 30 ? cycle.startPR.title.substring(0, 30) + '...' : cycle.startPR.title}</td>
            <td>${formatDateTime(new Date(cycle.startPR.closedDate))}</td>
            <td title="${cycle.endPR.title}">${cycle.endPR.title.length > 30 ? cycle.endPR.title.substring(0, 30) + '...' : cycle.endPR.title}</td>
            <td>${formatDateTime(new Date(cycle.endPR.closedDate))}</td>
            <td><strong>${cycle.leadTimeHours}h</strong></td>
            <td>${cycle.leadTimeDays}d</td>
            <td>${cycle.totalPRsInCycle}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Keep old updateLeadTimeTable function for compatibility
function updateLeadTimeTable(pullRequests) {
    const tbody = document.querySelector('#leadtimeTable tbody');
    tbody.innerHTML = '';
    
    pullRequests.slice(0, 50).forEach(pr => {
        const row = document.createElement('tr');
        
        // Add style class based on Lead Time
        // Green: < 1 week (168 hours)
        // Yellow: 1 week - 1 month (168-720 hours)
        // Red: > 1 month (>720 hours)
        let leadTimeClass = '';
        if (pr.leadTimeHours < 168) {
            leadTimeClass = 'leadtime-fast';
        } else if (pr.leadTimeHours < 720) {
            leadTimeClass = 'leadtime-medium';
        } else {
            leadTimeClass = 'leadtime-slow';
        }
        
        row.className = leadTimeClass;
        
        row.innerHTML = `
            <td>${pr.id}</td>
            <td title="${pr.title}">${pr.title.length > 50 ? pr.title.substring(0, 50) + '...' : pr.title}</td>
            <td>${pr.createdBy}</td>
            <td>${formatDateTime(new Date(pr.createdDate))}</td>
            <td>${formatDateTime(new Date(pr.closedDate))}</td>
            <td><strong>${pr.leadTimeHours}</strong></td>
            <td>${pr.leadTimeDays}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Load Change Failure Rate data
let currentChangeFailureChart = null;

async function loadChangeFailureData() {
    try {
        showLoading(true);
        hideError();
        
        const days = document.getElementById('changefailureTimeRange').value;
        const response = await fetch(`/api/change-failure-rate?days=${days}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch Change Failure Rate data');
        }
        
        updateChangeFailureStatistics(result.data.statistics);
        updateChangeFailureChart(result.data.bugsBySeverity, result.data.statistics);
        updateBugsTable(result.data.bugs);
    } catch (error) {
        console.error('Error loading change failure rate data:', error);
        showError('Failed to load Change Failure Rate data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Update Change Failure Rate statistics
function updateChangeFailureStatistics(stats) {
    document.getElementById('totalBugs').textContent = stats.totalBugs;
    document.getElementById('totalDeployments').textContent = stats.totalDeployments;
    document.getElementById('changeFailureRate').textContent = `${stats.changeFailureRate}%`;
    document.getElementById('cfrPeriod').textContent = stats.period;
}

// Update Change Failure Rate chart
function updateChangeFailureChart(bugsBySeverity, stats) {
    const ctx = document.getElementById('changefailureChart').getContext('2d');
    
    if (currentChangeFailureChart) {
        currentChangeFailureChart.destroy();
    }
    
    // Prepare severity data
    const severities = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'];
    const severityCounts = severities.map(severity => {
        return bugsBySeverity[severity] ? bugsBySeverity[severity].length : 0;
    });
    
    const severityColors = [
        'rgba(220, 53, 69, 0.7)',   // Critical - Red
        'rgba(255, 193, 7, 0.7)',   // High - Yellow
        'rgba(102, 126, 234, 0.7)', // Medium - Blue
        'rgba(40, 167, 69, 0.7)'    // Low - Green
    ];
    
    const borderColors = [
        'rgba(220, 53, 69, 1)',
        'rgba(255, 193, 7, 1)',
        'rgba(102, 126, 234, 1)',
        'rgba(40, 167, 69, 1)'
    ];
    
    currentChangeFailureChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: severities,
            datasets: [
                {
                    label: 'Bugs Count',
                    data: severityCounts,
                    backgroundColor: severityColors,
                    borderColor: borderColors,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Change Failure Rate: ${stats.changeFailureRate}% (${stats.totalBugs} bugs / ${stats.totalDeployments} deployments)`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Number of Bugs'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Bug Severity'
                    }
                }
            }
        }
    });
}

// Update bugs table
function updateBugsTable(bugs) {
    const tbody = document.querySelector('#bugsTable tbody');
    tbody.innerHTML = '';
    
    if (bugs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No environment change failure bugs found in this period</td></tr>';
        return;
    }
    
    bugs.forEach(bug => {
        const row = document.createElement('tr');
        
        // Add severity class
        let severityClass = '';
        if (bug.severity.includes('1 - Critical')) {
            severityClass = 'severity-critical';
        } else if (bug.severity.includes('2 - High')) {
            severityClass = 'severity-high';
        } else if (bug.severity.includes('3 - Medium')) {
            severityClass = 'severity-medium';
        } else {
            severityClass = 'severity-low';
        }
        
        row.className = severityClass;
        
        row.innerHTML = `
            <td><strong>#${bug.id}</strong></td>
            <td title="${bug.title}">${bug.title.length > 60 ? bug.title.substring(0, 60) + '...' : bug.title}</td>
            <td><span class="severity-badge ${severityClass}">${bug.severity}</span></td>
            <td><span class="state-badge state-${bug.state.toLowerCase()}">${bug.state}</span></td>
            <td>${bug.assignedTo}</td>
            <td>${formatDateTime(new Date(bug.createdDate))}</td>
            <td>${bug.tags}</td>
            <td><a href="${bug.url}" target="_blank" class="view-link">View →</a></td>
        `;
        
        tbody.appendChild(row);
    });
}
