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

// 获取 Unit Test Code Coverage 数据
app.get('/api/unit-test-coverage', async (req, res) => {
    const unitTestPipelines = process.env.PIPELINE_UNIT_TEST ? 
        process.env.PIPELINE_UNIT_TEST.split(',').map(item => {
            const [id, name] = item.split(':');
            return { id: id.trim(), name: name.trim() };
        }) : [];

    if (unitTestPipelines.length === 0) {
        return res.json({
            success: true,
            data: [],
            message: 'No unit test pipelines configured'
        });
    }

    try {
        const coverageData = await Promise.all(unitTestPipelines.map(async (pipeline) => {
            try {
                // 获取最新的 build
                const runsResponse = await axios.get(
                    `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/pipelines/${pipeline.id}/runs?api-version=7.1&$top=1`,
                    {
                        headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                    }
                );

                if (!runsResponse.data.value || runsResponse.data.value.length === 0) {
                    return {
                        pipelineId: pipeline.id,
                        pipelineName: pipeline.name,
                        error: 'No runs found'
                    };
                }

                const latestRun = runsResponse.data.value[0];
                const buildId = latestRun.id;

                // 获取项目 ID
                const projectResponse = await axios.get(
                    `https://dev.azure.com/${AZURE_CONFIG.org}/_apis/projects/${AZURE_CONFIG.project}?api-version=7.1`,
                    {
                        headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                    }
                );
                const projectId = projectResponse.data.id;

                // 获取代码覆盖率
                const coverageResponse = await axios.get(
                    `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/test/codecoverage?buildId=${buildId}&api-version=7.1-preview.1`,
                    {
                        headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                    }
                );

                let coveragePercentage = 0;
                let linesCovered = 0;
                let linesTotal = 0;

                if (coverageResponse.data.coverageData && coverageResponse.data.coverageData.length > 0) {
                    const coverageStats = coverageResponse.data.coverageData[0].coverageStats || [];
                    const lineCoverage = coverageStats.find(stat => stat.label === 'Lines');
                    
                    if (lineCoverage) {
                        linesCovered = lineCoverage.covered || 0;
                        linesTotal = lineCoverage.total || 0;
                        if (linesTotal > 0) {
                            coveragePercentage = ((linesCovered / linesTotal) * 100).toFixed(2);
                        }
                    }
                }

                return {
                    pipelineId: pipeline.id,
                    pipelineName: pipeline.name,
                    buildId: buildId,
                    buildNumber: latestRun.name,
                    buildDate: latestRun.createdDate,
                    buildResult: latestRun.result,
                    coverage: {
                        percentage: parseFloat(coveragePercentage),
                        linesCovered: linesCovered,
                        linesTotal: linesTotal
                    },
                    links: {
                        coverage: `https://dev.azure.com/${AZURE_CONFIG.org}/${projectId}/_build/results?buildId=${buildId}&view=codecoverage-tab`,
                        tests: `https://dev.azure.com/${AZURE_CONFIG.org}/${projectId}/_build/results?buildId=${buildId}&view=ms.vss-test-web.build-test-results-tab`
                    }
                };
            } catch (error) {
                console.error(`Error fetching coverage for pipeline ${pipeline.id}:`, error.message);
                return {
                    pipelineId: pipeline.id,
                    pipelineName: pipeline.name,
                    error: error.message
                };
            }
        }));

        res.json({
            success: true,
            data: coverageData
        });
    } catch (error) {
        console.error('Error fetching unit test coverage:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch unit test coverage',
            details: error.message
        });
    }
});

// 测试获取 Code Coverage 端点
app.get('/api/test-coverage', async (req, res) => {
    const unitTestPipelines = process.env.PIPELINE_UNIT_TEST ? 
        process.env.PIPELINE_UNIT_TEST.split(',').map(item => {
            const [id, name] = item.split(':');
            return { id: id.trim(), name: name.trim() };
        }) : [];

    console.log('\n========== Testing Code Coverage API ==========');
    console.log('Unit Test Pipelines:', unitTestPipelines);

    const results = [];

    for (const pipeline of unitTestPipelines) {
        console.log(`\n--- Testing pipeline ${pipeline.id}: ${pipeline.name} ---`);
        const pipelineResult = {
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            tests: []
        };

        try {
            // 步骤1: 获取最新的 build
            const runsUrl = `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/pipelines/${pipeline.id}/runs?api-version=7.1&$top=1`;
            console.log(`1. Fetching latest run from: ${runsUrl}`);
            
            const runsResponse = await axios.get(runsUrl, {
                headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
            });

            if (!runsResponse.data.value || runsResponse.data.value.length === 0) {
                pipelineResult.error = 'No runs found';
                console.log('   ❌ No runs found');
                results.push(pipelineResult);
                continue;
            }

            const latestRun = runsResponse.data.value[0];
            const buildId = latestRun.id;
            pipelineResult.buildId = buildId;
            pipelineResult.buildNumber = latestRun.name;
            console.log(`   ✓ Latest build: ${buildId} (${latestRun.name})`);

            // 步骤2: 获取项目 ID
            const projectUrl = `https://dev.azure.com/${AZURE_CONFIG.org}/_apis/projects/${AZURE_CONFIG.project}?api-version=7.1`;
            console.log(`2. Fetching project ID from: ${projectUrl}`);
            
            const projectResponse = await axios.get(projectUrl, {
                headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
            });
            
            const projectId = projectResponse.data.id;
            pipelineResult.projectId = projectId;
            console.log(`   ✓ Project ID: ${projectId}`);

            // 步骤3: 尝试多种方法获取 Code Coverage
            
            // 方法1: Test API - codecoverage
            console.log(`3. Testing Code Coverage APIs...`);
            const testMethod1 = {
                name: 'Test API - codecoverage',
                url: `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/test/codecoverage?buildId=${buildId}&api-version=7.1-preview.1`,
                success: false
            };
            
            try {
                console.log(`   Trying: ${testMethod1.url}`);
                const response = await axios.get(testMethod1.url, {
                    headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                });
                testMethod1.success = true;
                testMethod1.data = response.data;
                console.log(`   ✓ SUCCESS! Response:`, JSON.stringify(response.data, null, 2));
            } catch (error) {
                testMethod1.error = `${error.response?.status || 'ERROR'}: ${error.message}`;
                console.log(`   ❌ Failed: ${testMethod1.error}`);
            }
            pipelineResult.tests.push(testMethod1);

            // 方法2: Build API - coverage
            const testMethod2 = {
                name: 'Build API - code coverage',
                url: `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/build/builds/${buildId}/coverage?api-version=7.1`,
                success: false
            };
            
            try {
                console.log(`   Trying: ${testMethod2.url}`);
                const response = await axios.get(testMethod2.url, {
                    headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                });
                testMethod2.success = true;
                testMethod2.data = response.data;
                console.log(`   ✓ SUCCESS! Response:`, JSON.stringify(response.data, null, 2));
            } catch (error) {
                testMethod2.error = `${error.response?.status || 'ERROR'}: ${error.message}`;
                console.log(`   ❌ Failed: ${testMethod2.error}`);
            }
            pipelineResult.tests.push(testMethod2);

            // 方法3: Test Results
            const testMethod3 = {
                name: 'Test Results API',
                url: `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/test/runs?buildIds=${buildId}&api-version=7.1`,
                success: false
            };
            
            try {
                console.log(`   Trying: ${testMethod3.url}`);
                const response = await axios.get(testMethod3.url, {
                    headers: { 'Authorization': `Bearer ${AZURE_CONFIG.token}` }
                });
                testMethod3.success = true;
                testMethod3.data = response.data;
                console.log(`   ✓ SUCCESS! Found ${response.data.count} test runs`);
            } catch (error) {
                testMethod3.error = `${error.response?.status || 'ERROR'}: ${error.message}`;
                console.log(`   ❌ Failed: ${testMethod3.error}`);
            }
            pipelineResult.tests.push(testMethod3);

            // 生成链接
            pipelineResult.links = {
                coverage: `https://dev.azure.com/${AZURE_CONFIG.org}/${projectId}/_build/results?buildId=${buildId}&view=codecoverage-tab`,
                tests: `https://dev.azure.com/${AZURE_CONFIG.org}/${projectId}/_build/results?buildId=${buildId}&view=ms.vss-test-web.build-test-results-tab`,
                buildDetails: `https://dev.azure.com/${AZURE_CONFIG.org}/${projectId}/_build/results?buildId=${buildId}`
            };

        } catch (error) {
            pipelineResult.error = error.message;
            console.log(`   ❌ Error: ${error.message}`);
        }

        results.push(pipelineResult);
    }

    console.log('\n========== Test Complete ==========\n');

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        results: results
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