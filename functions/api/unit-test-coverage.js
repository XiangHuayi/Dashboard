// Cloudflare Pages Function: /api/unit-test-coverage
export async function onRequest(context) {
  const { env } = context;
  
  try {
    const org = env.AZURE_DEVOPS_ORG;
    const project = env.AZURE_DEVOPS_PROJECT;
    const token = env.AZURE_DEVOPS_TOKEN;
    const pipelineUnitTest = env.PIPELINE_UNIT_TEST || '';
    
    if (!org || !project || !token) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Azure DevOps configuration missing' 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    if (!pipelineUnitTest) {
      return new Response(JSON.stringify({ 
        success: true,
        data: [] 
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    // 解析 PIPELINE_UNIT_TEST 配置
    const pipelines = pipelineUnitTest.split(',').map(item => {
      const [id, name] = item.split(':');
      return { 
        id: id.trim(), 
        name: (name || `Pipeline ${id}`).trim() 
      };
    }).filter(p => p.id);
    
    // 并行获取所有 pipeline 的 coverage 数据
    const coveragePromises = pipelines.map(pipeline => 
      getCoverageForPipeline(org, project, token, pipeline.id, pipeline.name)
    );
    
    const coverageResults = await Promise.all(coveragePromises);
    
    return new Response(JSON.stringify({ 
      success: true,
      data: coverageResults 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }
}

async function getCoverageForPipeline(org, project, token, pipelineId, pipelineName) {
  try {
    // 获取最新的成功构建
    const runsUrl = `https://dev.azure.com/${org}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1&$top=1`;
    const runsResponse = await fetch(runsUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`:${token}`)}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!runsResponse.ok) {
      throw new Error(`Failed to fetch runs for pipeline ${pipelineId}`);
    }
    
    const runsData = await runsResponse.json();
    
    if (!runsData.value || runsData.value.length === 0) {
      return {
        pipelineId,
        pipelineName,
        error: 'No builds found'
      };
    }
    
    const latestRun = runsData.value[0];
    const buildId = latestRun.id;
    const buildResult = latestRun.result;
    const buildNumber = latestRun.name;
    const buildDate = latestRun.createdDate;
    
    // 获取 build 详情以获取 build ID（用于 coverage API）
    const buildUrl = `https://dev.azure.com/${org}/${project}/_apis/build/builds?definitions=${pipelineId}&$top=1&api-version=7.1`;
    const buildResponse = await fetch(buildUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`:${token}`)}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!buildResponse.ok) {
      throw new Error(`Failed to fetch build for pipeline ${pipelineId}`);
    }
    
    const buildData = await buildResponse.json();
    
    if (!buildData.value || buildData.value.length === 0) {
      return {
        pipelineId,
        pipelineName,
        buildResult,
        buildNumber,
        buildDate,
        error: 'No builds found'
      };
    }
    
    const build = buildData.value[0];
    const actualBuildId = build.id;
    
    // 获取 code coverage 数据
    const coverageUrl = `https://dev.azure.com/${org}/${project}/_apis/test/codecoverage?buildId=${actualBuildId}&api-version=7.1-preview.1`;
    const coverageResponse = await fetch(coverageUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`:${token}`)}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!coverageResponse.ok) {
      return {
        pipelineId,
        pipelineName,
        buildResult,
        buildNumber,
        buildDate,
        error: 'Coverage data not available'
      };
    }
    
    const coverageData = await coverageResponse.json();
    
    if (!coverageData.coverageData || coverageData.coverageData.length === 0) {
      return {
        pipelineId,
        pipelineName,
        buildResult,
        buildNumber,
        buildDate,
        error: 'No coverage data available'
      };
    }
    
    // 处理 coverage 数据
    const coverage = processCoverageData(coverageData.coverageData);
    
    return {
      pipelineId,
      pipelineName,
      buildId: actualBuildId,
      buildResult,
      buildNumber,
      buildDate,
      coverage,
      links: {
        coverage: `https://dev.azure.com/${org}/${project}/_build/results?buildId=${actualBuildId}&view=codecoverage-tab`,
        tests: `https://dev.azure.com/${org}/${project}/_build/results?buildId=${actualBuildId}&view=ms.vss-test-web.build-test-results-tab`,
        build: `https://dev.azure.com/${org}/${project}/_build/results?buildId=${actualBuildId}`
      }
    };
  } catch (error) {
    return {
      pipelineId,
      pipelineName,
      error: error.message
    };
  }
}

function processCoverageData(coverageData) {
  // 聚合所有模块的覆盖率数据
  let totalLines = 0;
  let coveredLines = 0;
  
  coverageData.forEach(module => {
    if (module.coverageStats) {
      module.coverageStats.forEach(stat => {
        if (stat.label === 'Lines') {
          totalLines += stat.total || 0;
          coveredLines += stat.covered || 0;
        }
      });
    }
  });
  
  const percentage = totalLines > 0 
    ? Math.round((coveredLines / totalLines) * 100) 
    : 0;
  
  return {
    linesTotal: totalLines,
    linesCovered: coveredLines,
    percentage
  };
}
