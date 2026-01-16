// Cloudflare Pages Function: /api/health
export async function onRequest() {
  return new Response(JSON.stringify({ 
    status: 'ok',
    service: 'Azure DevOps Pipeline Dashboard',
    timestamp: new Date().toISOString(),
    platform: 'Cloudflare Pages'
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
  });
}
