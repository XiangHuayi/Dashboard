// Cloudflare Pages Function: /api/pipeline-runs
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  try {
    const days = parseInt(url.searchParams.get('days')) || 7;
    const pipelineId = url.searchParams.get('pipelineId') || '8857';
    
    const org = env.AZURE_DEVOPS_ORG;
    const project = env.AZURE_DEVOPS_PROJECT;
    const token = env.AZURE_DEVOPS_TOKEN;
    
    if (!org || !project || !token) {
      return new Response(JSON.stringify({ 
        error: 'Azure DevOps configuration missing' 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    const azureUrl = `https://dev.azure.com/${org}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1&$top=1000`;
    
    const response = await fetch(azureUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`:${token}`)}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch Azure DevOps data',
        details: errorText
      }), {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    const data = await response.json();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const filteredRuns = data.value.filter(run => 
      new Date(run.createdDate) >= cutoffDate
    );
    
    // 统计处理
    const statistics = processStatistics(filteredRuns);
    
    return new Response(JSON.stringify(statistics), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
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

function processStatistics(runs) {
  const totalRuns = runs.length;
  const successCount = runs.filter(r => r.result === 'succeeded').length;
  const failureCount = runs.filter(r => r.result === 'failed').length;
  const successRate = totalRuns > 0 ? ((successCount / totalRuns) * 100).toFixed(2) : 0;
  
  // 按日期统计
  const dailyStats = {};
  const hourlyStats = Array(24).fill(0);
  
  runs.forEach(run => {
    const date = new Date(run.createdDate);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = { success: 0, failed: 0 };
    }
    
    if (run.result === 'succeeded') {
      dailyStats[dateKey].success++;
    } else if (run.result === 'failed') {
      dailyStats[dateKey].failed++;
    }
    
    hourlyStats[hour]++;
  });
  
  // 计算部署频率
  const dates = Object.keys(dailyStats);
  const dayCount = dates.length || 1;
  const deployFrequency = (totalRuns / dayCount).toFixed(2);
  
  return {
    totalRuns,
    successCount,
    failureCount,
    successRate,
    deployFrequency,
    dailyStats,
    hourlyStats,
    runs: runs.slice(0, 100), // 限制返回数量，避免响应过大
  };
}
