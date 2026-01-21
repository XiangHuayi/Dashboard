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

// 获取配置端点
app.get('/api/config', (req, res) => {
    // 解析多个 repository
    const repositories = process.env.REPOSITORY_ID ? 
        process.env.REPOSITORY_ID.split(',').map(item => {
            const [id, name] = item.split(':');
            return { id: id.trim(), name: name.trim() };
        }) : [];
    
    res.json({
        success: true,
        data: {
            repositories: repositories,
            // 为了向后兼容，保留 repositoryId 字段（第一个 repository）
            repositoryId: repositories.length > 0 ? `${repositories[0].id}:${repositories[0].name}` : ''
        }
    });
});

// 获取 Lead Time for Changes 数据
app.get('/api/lead-time', async (req, res) => {
    try {
        const { days = 30, repositoryId } = req.query;
        const targetUser = req.query.targetUser || 'jzhouk1@jci.com';
        const repoId = repositoryId || process.env.REPOSITORY_ID;
        
        if (!repoId) {
            return res.status(400).json({
                success: false,
                error: 'Repository ID is required'
            });
        }

        // 解析 repository ID 和 name
        const [id, name] = repoId.includes(':') 
            ? repoId.split(':') 
            : [repoId, 'Repository'];
        
        // 获取 Pull Requests
        const prUrl = `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/git/repositories/${id.trim()}/pullrequests?searchCriteria.status=completed&api-version=7.2-preview.2`;
        
        const response = await axios.get(prUrl, {
            headers: {
                'Authorization': `Bearer ${AZURE_CONFIG.token}`,
                'Content-Type': 'application/json',
            },
        });
        
        // 过滤指定天数内的 PR
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        
        const recentPRs = response.data.value.filter(pr => 
            pr.closedDate && new Date(pr.closedDate) >= cutoffDate
        );
        
        // 计算 Lead Time 统计
        const leadTimeData = calculateDeploymentLeadTime(recentPRs, targetUser);
        
        res.json({
            success: true,
            data: {
                repository: {
                    id: id.trim(),
                    name: name.trim()
                },
                targetUser: targetUser,
                statistics: leadTimeData.statistics,
                cycles: leadTimeData.cycles,
                dailyStats: leadTimeData.dailyStats
            }
        });
    } catch (error) {
        console.error('Error fetching lead time data:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch lead time data',
            details: error.message
        });
    }
});

function calculateDeploymentLeadTime(prs, targetUser) {
    // 按关闭时间排序（从旧到新）
    const sortedPRs = prs.sort((a, b) => 
        new Date(a.closedDate) - new Date(b.closedDate)
    );
    
    // 提取所有 PR 的基本信息
    const allPRs = sortedPRs.map(pr => ({
        id: pr.pullRequestId,
        title: pr.title,
        createdBy: pr.createdBy.displayName,
        uniqueName: pr.createdBy.uniqueName,
        createdDate: new Date(pr.creationDate),
        closedDate: new Date(pr.closedDate),
        isTargetUser: pr.createdBy.uniqueName === targetUser
    }));
    
    // 找出所有目标用户的 PR
    const targetUserPRs = allPRs.filter(pr => pr.isTargetUser);
    
    // 计算部署周期
    const cycles = [];
    
  // 新逻辑：
  // 1. 周期结束于 Kai Zhou 的 PR
  // 2. 下一个周期从 Kai Zhou PR 之后的第一个其他人的 PR 开始
  // 3. 如果 Kai Zhou PR 后面连续是 Kai Zhou 的 PR，跳过直到找到其他人的 PR
  
  console.log('===== 开始计算周期 =====');
  console.log(`总 PR 数: ${allPRs.length}, Kai Zhou PR 数: ${targetUserPRs.length}`);
  console.log('PR 列表:');
  allPRs.forEach((pr, idx) => {
    console.log(`  [${idx}] ${pr.isTargetUser ? '**KAI**' : pr.createdBy} - ${pr.title.substring(0, 30)}`);
  });
  
  if (targetUserPRs.length > 0 && allPRs.length > 0) {
    // 遍历每个 Kai Zhou 的 PR（作为周期结束点）
    for (let i = 0; i < targetUserPRs.length; i++) {
      console.log(`\n--- 处理第 ${i + 1} 个 Kai Zhou PR ---`);
      const endPR = targetUserPRs[i];
      const endPRIndex = allPRs.findIndex(pr => pr.id === endPR.id);
      console.log(`  结束 PR [${endPRIndex}]: ${endPR.title.substring(0, 30)}`);
      
      // 找到这个 Kai Zhou PR 之后的第一个非 Kai Zhou PR（作为下一个周期的起始点）
      let nextStartPR = null;
      for (let j = endPRIndex + 1; j < allPRs.length; j++) {
        if (!allPRs[j].isTargetUser) {
          nextStartPR = allPRs[j];
          break;
        }
      }
      
      // 如果这是第一个 Kai Zhou PR，需要找到它之前的起始点
      let startPR = null;
      if (i === 0) {
        // 第一个周期：从第一个 PR（任何人）开始
        startPR = allPRs[0];
        console.log(`  第一个周期，起始 PR [0]: ${startPR.title.substring(0, 30)}`);
      } else {
        // 后续周期：从上一个 Kai Zhou PR 之后的第一个非 Kai Zhou PR 开始
        const prevEndPRIndex = allPRs.findIndex(pr => pr.id === targetUserPRs[i - 1].id);
        console.log(`  上一个 Kai Zhou PR [${prevEndPRIndex}]: ${targetUserPRs[i - 1].title.substring(0, 30)}`);
        console.log(`  在 [${prevEndPRIndex + 1}] 到 [${endPRIndex - 1}] 之间寻找非 Kai Zhou PR...`);
        
        // 只在上一个 Kai Zhou PR 和当前 Kai Zhou PR 之间找起始点
        for (let j = prevEndPRIndex + 1; j < endPRIndex; j++) {
          console.log(`    检查 [${j}]: ${allPRs[j].isTargetUser ? 'Kai Zhou' : allPRs[j].createdBy} - ${allPRs[j].title.substring(0, 20)}`);
          if (!allPRs[j].isTargetUser) {
            startPR = allPRs[j];
            console.log(`    ✓ 找到起始 PR [${j}]`);
            break;
          }
        }
        
        if (!startPR) {
          console.log(`    ✗ 中间没有非 Kai Zhou PR，跳过此周期（连续的 Kai Zhou PR）`);
        }
      }
      
      // 只有找到起始 PR 时才创建周期
      if (startPR && startPR.id !== endPR.id) {
        console.log(`  ✓ 创建周期: [${allPRs.indexOf(startPR)}] ${startPR.createdBy} -> [${endPRIndex}] Kai Zhou`);
        const leadTimeMs = endPR.closedDate - startPR.closedDate;
        const leadTimeHours = leadTimeMs / (1000 * 60 * 60);
        const leadTimeDays = leadTimeHours / 24;
        
        const prsInCycle = allPRs.filter(pr => 
          pr.closedDate >= startPR.closedDate && pr.closedDate <= endPR.closedDate
        );
        
        cycles.push({
          cycleNumber: cycles.length + 1,
          startPR: {
            id: startPR.id,
            title: startPR.title,
            createdBy: startPR.createdBy,
            closedDate: startPR.closedDate.toISOString()
          },
          endPR: {
            id: endPR.id,
            title: endPR.title,
            closedDate: endPR.closedDate.toISOString()
          },
          leadTimeMs,
          leadTimeHours: Math.round(leadTimeHours * 100) / 100,
          leadTimeDays: Math.round(leadTimeDays * 100) / 100,
          totalPRsInCycle: prsInCycle.length,
          prsInCycle: prsInCycle.map(pr => ({
            id: pr.id,
            title: pr.title,
            createdBy: pr.createdBy,
            closedDate: pr.closedDate.toISOString()
          }))
        });
      }
    }
  }
  
  console.log(`\n===== 周期计算完成，总共 ${cycles.length} 个周期 =====\n`);
  
  // 计算统计数据
  const totalCycles = cycles.length;
  const leadTimes = cycles.map(c => c.leadTimeHours);
  
  const avgLeadTime = totalCycles > 0 
    ? leadTimes.reduce((sum, val) => sum + val, 0) / totalCycles 
    : 0;
  
  const sortedLeadTimes = [...leadTimes].sort((a, b) => a - b);
  const medianLeadTime = totalCycles > 0
    ? sortedLeadTimes[Math.floor(totalCycles / 2)]
    : 0;
  
  const minLeadTime = totalCycles > 0 ? Math.min(...leadTimes) : 0;
  const maxLeadTime = totalCycles > 0 ? Math.max(...leadTimes) : 0;
  
  // 按日期分组统计
  const dailyStats = {};
  cycles.forEach(cycle => {
    const dateKey = cycle.endPR.closedDate.split('T')[0];
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = {
        count: 0,
        totalLeadTime: 0,
        avgLeadTime: 0,
        cycles: []
      };
    }
    dailyStats[dateKey].count++;
    dailyStats[dateKey].totalLeadTime += cycle.leadTimeHours;
    dailyStats[dateKey].cycles.push(cycle);
  });
  
  // 计算每日平均值
  Object.keys(dailyStats).forEach(date => {
    dailyStats[date].avgLeadTime = 
      Math.round((dailyStats[date].totalLeadTime / dailyStats[date].count) * 100) / 100;
  });
  
  // 计算部署频率
  const timeSpanDays = allPRs.length > 0 
    ? (allPRs[allPRs.length - 1].closedDate - allPRs[0].closedDate) / (1000 * 60 * 60 * 24)
    : 1;
  
  return {
    statistics: {
      totalCycles,
      totalTargetUserPRs: targetUserPRs.length,
      totalPRs: allPRs.length,
      avgLeadTimeHours: Math.round(avgLeadTime * 100) / 100,
      avgLeadTimeDays: Math.round((avgLeadTime / 24) * 100) / 100,
      medianLeadTimeHours: Math.round(medianLeadTime * 100) / 100,
      minLeadTimeHours: Math.round(minLeadTime * 100) / 100,
      maxLeadTimeHours: Math.round(maxLeadTime * 100) / 100,
      deploymentFrequency: Math.round((totalCycles / Math.max(timeSpanDays, 1)) * 100) / 100
    },
    cycles,
    dailyStats
  };
}

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

// Change Failure Rate API
app.get('/api/change-failure-rate', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const bugTagFilter = process.env.BUG_TAG_FILTER || 'Environment Change Failure';
        const pipelineId = process.env.CHANGE_FAILURE_PIPELINE_ID || '8805';
        
        // Calculate date range
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD (date only)
        
        // Fetch bugs with the specific tag
        const bugsUrl = `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/wit/wiql?api-version=7.1-preview.2`;
        const wiqlQuery = {
            query: `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.Tags] CONTAINS '${bugTagFilter}' AND [System.CreatedDate] >= '${cutoffDateStr}' ORDER BY [System.CreatedDate] DESC`
        };
        
        console.log('WIQL Query:', wiqlQuery.query);
        
        const bugsResponse = await axios.post(bugsUrl, wiqlQuery, {
            headers: {
                'Authorization': `Bearer ${AZURE_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const bugIds = bugsResponse.data.workItems ? bugsResponse.data.workItems.map(item => item.id) : [];
        
        // Fetch detailed bug information
        let bugs = [];
        if (bugIds.length > 0) {
            const bugDetailsUrl = `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_apis/wit/workitems?ids=${bugIds.join(',')}&api-version=7.1`;
            const bugDetailsResponse = await axios.get(bugDetailsUrl, {
                headers: {
                    'Authorization': `Bearer ${AZURE_CONFIG.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            bugs = bugDetailsResponse.data.value.map(bug => ({
                id: bug.id,
                title: bug.fields['System.Title'],
                state: bug.fields['System.State'],
                createdDate: bug.fields['System.CreatedDate'],
                tags: bug.fields['System.Tags'] || '',
                severity: bug.fields['Microsoft.VSTS.Common.Severity'] || 'Unassigned',
                assignedTo: bug.fields['System.AssignedTo']?.displayName || 'Unassigned',
                description: bug.fields['System.Description'] || '',
                url: `https://dev.azure.com/${AZURE_CONFIG.org}/${AZURE_CONFIG.project}/_workitems/edit/${bug.id}`
            }));
        }
        
        // Fetch deployment count (pipeline runs)
        const deploymentsUrl = buildAzureApiUrl(pipelineId, 1000);
        const deploymentsResponse = await axios.get(deploymentsUrl, {
            headers: {
                'Authorization': `Bearer ${AZURE_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const allDeployments = deploymentsResponse.data.value;
        const deployments = allDeployments.filter(run => {
            const createdDate = new Date(run.createdDate);
            return createdDate >= cutoffDate && run.result === 'succeeded';
        });
        
        // Calculate Change Failure Rate
        const totalBugs = bugs.length;
        const totalDeployments = deployments.length;
        const changeFailureRate = totalDeployments > 0 
            ? ((totalBugs / totalDeployments) * 100).toFixed(2)
            : 0;
        
        // Group bugs by severity
        const bugsBySeverity = bugs.reduce((acc, bug) => {
            const severity = bug.severity;
            if (!acc[severity]) {
                acc[severity] = [];
            }
            acc[severity].push(bug);
            return acc;
        }, {});
        
        res.json({
            success: true,
            data: {
                statistics: {
                    totalBugs,
                    totalDeployments,
                    changeFailureRate: parseFloat(changeFailureRate),
                    period: `${days} days`
                },
                bugs,
                bugsBySeverity,
                deployments: deployments.slice(0, 20) // Recent 20 deployments
            }
        });
    } catch (error) {
        console.error('Error fetching change failure rate:', error.message);
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
        }
        res.status(500).json({
            success: false,
            error: 'Failed to fetch change failure rate',
            details: error.message
        });
    }
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