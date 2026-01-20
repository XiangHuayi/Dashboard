// 全局变量
let currentChart = null;
let currentData = null;
let currentView = 'statistics';

// DOM元素
const pipelineSelect = document.getElementById('pipelineSelect');
const timeRangeSelect = document.getElementById('timeRange');
const chartTypeSelect = document.getElementById('chartType');
const refreshBtn = document.getElementById('refreshBtn');
const refreshCoverageBtn = document.getElementById('refreshCoverageBtn');
const loadingIndicator = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// 统计元素
const totalRunsEl = document.getElementById('totalRuns');
const successRunsEl = document.getElementById('successRuns');
const failureRunsEl = document.getElementById('failureRuns');
const successRateEl = document.getElementById('successRate');
const deployFrequencyEl = document.getElementById('deployFrequency');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupNavigation();
    loadPipelines();
});

// 设置导航
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

// 切换视图
function switchView(view) {
    currentView = view;
    
    // 更新导航按钮状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 切换视图容器
    const statisticsView = document.getElementById('statisticsView');
    const coverageView = document.getElementById('coverageView');
    
    if (view === 'statistics') {
        statisticsView.classList.add('active');
        coverageView.classList.remove('active');
    } else if (view === 'coverage') {
        statisticsView.classList.remove('active');
        coverageView.classList.add('active');
        loadCoverageData();
    }
}

// 设置事件监听器
function setupEventListeners() {
    pipelineSelect.addEventListener('change', loadData);
    timeRangeSelect.addEventListener('change', loadData);
    refreshBtn.addEventListener('click', loadData);
    if (refreshCoverageBtn) {
        refreshCoverageBtn.addEventListener('click', loadCoverageData);
    }
    chartTypeSelect.addEventListener('change', updateChart);
    refreshBtn.addEventListener('click', loadData);
}

// 加载Pipeline列表
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
            // 加载完pipeline列表后再加载数据
            loadData();
        }
    } catch (error) {
        console.error('Error loading pipelines:', error);
        showError('无法加载Pipeline列表: ' + error.message);
    }
}

// 加载数据
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
            throw new Error(result.error || '获取数据失败');
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

// 更新统计信息
function updateStatistics(stats) {
    totalRunsEl.textContent = stats.totalRuns;
    successRunsEl.textContent = stats.successCount;
    failureRunsEl.textContent = stats.failureCount;
    successRateEl.textContent = `${stats.successRate}%`;
    deployFrequencyEl.textContent = stats.deployFrequency;
}

// 更新图表
function updateChart() {
    if (!currentData) return;
    
    const chartType = chartTypeSelect.value;
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // 销毁现有图表
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

// 创建按日统计图表
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
                    label: '成功',
                    data: successData,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 2
                },
                {
                    label: '失败',
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
                    text: 'Pipeline运行次数 - 按日统计',
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

// 创建按小时统计图表
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
                    label: '总计',
                    data: totalData,
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '成功',
                    data: successData,
                    borderColor: 'rgba(40, 167, 69, 1)',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                },
                {
                    label: '失败',
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
                    text: 'Pipeline运行分布 - 按小时统计',
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

// 创建成功率分析图表
function createSuccessRateChart(stats) {
    return {
        type: 'doughnut',
        data: {
            labels: ['成功', '失败'],
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
                    text: `Pipeline成功率分析 (${stats.successRate}%)`,
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

// 更新运行记录表格
function updateRunsTable(runs) {
    const tbody = document.querySelector('#runsTable tbody');
    tbody.innerHTML = '';
    
    runs.slice(0, 20).forEach(run => { // 只显示最近20条记录
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

// 工具函数
function formatDate(date) {
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(date) {
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(state) {
    const statusMap = {
        'completed': '已完成',
        'running': '运行中',
        'pending': '等待中',
        'cancelling': '取消中',
        'cancelled': '已取消'
    };
    return statusMap[state] || state;
}

function getResultText(result) {
    const resultMap = {
        'succeeded': '成功',
        'failed': '失败',
        'canceled': '已取消',
        'none': '无结果'
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
        return `${minutes}分 ${seconds}秒`;
    } else {
        return `${seconds}秒`;
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

// 加载 Code Coverage 数据
async function loadCoverageData() {
    try {
        showLoading(true);
        hideError();
        
        const response = await fetch('/api/unit-test-coverage');
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '获取 Coverage 数据失败');
        }
        
        updateCoverageCards(result.data);
    } catch (error) {
        console.error('Error loading coverage data:', error);
        showError('加载 Coverage 数据失败: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// 更新 Coverage 卡片
function updateCoverageCards(data) {
    const container = document.getElementById('coverageCards');
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="no-data">暂无 Unit Test Pipeline 配置</div>';
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

// 获取覆盖率等级样式
function getCoverageClass(percentage) {
    if (percentage >= 80) return 'high';
    if (percentage >= 60) return 'medium';
    return 'low';
}
