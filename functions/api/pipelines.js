// Cloudflare Pages Function: /api/pipelines
export async function onRequest(context) {
  const { env } = context;
  
  try {
    const pipelineList = env.PIPELINE_LIST || '';
    
    if (!pipelineList) {
      return new Response(JSON.stringify({ error: 'PIPELINE_LIST not configured' }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    const pipelines = pipelineList.split(',').map(item => {
      const [id, name] = item.split(':');
      return { 
        id: id.trim(), 
        name: (name || `Pipeline ${id}`).trim() 
      };
    }).filter(p => p.id);
    
    return new Response(JSON.stringify(pipelines), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }
}
