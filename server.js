const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Azure DevOps API 配置
const AZURE_CONFIG = {
    org: process.env.AZURE_DEVOPS_ORG,
    project: process.env.AZURE_DEVOPS_PROJECT,
    pipelineId: process.env.AZURE_DEVOPS_PIPELINE_ID,
    token: process.env.AZURE_DEVOPS_TOKEN
};

// 解析Pipeline列表
function parsePipelineList() {
    const pipelineListStr = process.env.PIPELINE_LIST || '';
    if (!pipelineListStr) {
        return [{ id: AZURE_CONFIG.pipelineId, name: 'Default Pipeline' }];
    }
    
    return pipelineListStr.split(',').map(item => {
        const [id, name] = item.split(':');
        return { id: id.trim(), name: name.trim() };
    });
}

const PIPELINE_LIST = parsePipelineList();

// 构建Azure DevOps API URL
function buildAzureApiUrl(pipelineId, top = 100) {
    return `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1&$top=${top}`;
}

// 获取Pipeline运行数据的API端点
app.get('/api/pipeline-runs', async (req, res) => {
    try {
        const { days = 30, top = 100, pipelineId = AZURE_CONFIG.pipelineId } = req.query;
        
        const response = await axios.get(buildAzureApiUrl(pipelineId, top), {
            headers: {
                'Authorization': `Bearer ${AZURE_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        });

        const runs = response.data.value;
        
        // 过滤指定天数内的数据
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        
        const filteredRuns = runs.filter(run => {
            const createdDate = new Date(run.createdDate);
            return createdDate >= cutoffDate;
        });

        // 数据统计处理
        const statistics = processStatistics(filteredRuns, days);
        
        res.json({
            success: true,
            data: {
                runs: filteredRuns,
                statistics: statistics,
                total: filteredRuns.length
            }
        });
    } catch (error) {
        console.error('Error fetching pipeline runs:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pipeline runs',
            details: error.message
        });
    }
});

// 处理统计数据
function processStatistics(runs, days) {
    const stats = {
        totalRuns: runs.length,
        successCount: 0,
        failureCount: 0,
        dailyStats: {},
        hourlyStats: {},
        successRate: 0,
        deployFrequency: 0
    };

    runs.forEach(run => {
        // 成功失败统计
        if (run.result === 'succeeded') {
            stats.successCount++;
        } else if (run.result === 'failed') {
            stats.failureCount++;
        }

        // 按日统计
        const date = new Date(run.createdDate).toDateString();
        if (!stats.dailyStats[date]) {
            stats.dailyStats[date] = { total: 0, success: 0, failed: 0 };
        }
        stats.dailyStats[date].total++;
        if (run.result === 'succeeded') {
            stats.dailyStats[date].success++;
        } else if (run.result === 'failed') {
            stats.dailyStats[date].failed++;
        }

        // 按小时统计
        const hour = new Date(run.createdDate).getHours();
        if (!stats.hourlyStats[hour]) {
            stats.hourlyStats[hour] = { total: 0, success: 0, failed: 0 };
        }
        stats.hourlyStats[hour].total++;
        if (run.result === 'succeeded') {
            stats.hourlyStats[hour].success++;
        } else if (run.result === 'failed') {
            stats.hourlyStats[hour].failed++;
        }
    });

    // 计算成功率
    if (stats.totalRuns > 0) {
        stats.successRate = ((stats.successCount / stats.totalRuns) * 100).toFixed(2);
    }

    // 计算部署频率（次/天）
    if (days > 0 && stats.totalRuns > 0) {
        stats.deployFrequency = (stats.totalRuns / days).toFixed(2);
    }

    return stats;
}

// 获取Pipeline列表端点
app.get('/api/pipelines', (req, res) => {
    res.json({
        success: true,
        data: PIPELINE_LIST
    });
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        config: {
            org: AZURE_CONFIG.org,
            project: AZURE_CONFIG.project,
            pipelineId: AZURE_CONFIG.pipelineId,
            hasToken: !!AZURE_CONFIG.token
        }
    });
});

// 提供主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 Pipeline Dashboard Server running on http://localhost:${PORT}`);
    console.log(`📊 Azure DevOps Pipelines: 8857, 8892, 8805, 8891, 8856, 8855, 8819`);
    console.log(`🏢 Organization: ${AZURE_CONFIG.org}`);
    console.log(`📁 Project: ${AZURE_CONFIG.project}`);
});