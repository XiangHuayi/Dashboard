# Cloudflare Pages 部署指南

## 🌐 部署方式选择

### 方案一：Cloudflare Pages（推荐）
将前端部署到Cloudflare Pages，API使用Cloudflare Workers/Pages Functions。

### 方案二：混合部署
- 前端：Cloudflare Pages
- 后端：保持在Azure App Service

---

## 📦 方案一：完整迁移到Cloudflare Pages

### 项目结构调整

Cloudflare Pages需要特定的目录结构：

```
dashboard/
├── functions/              # Cloudflare Functions (API端点)
│   └── api/
│       ├── pipelines.js    # /api/pipelines
│       ├── pipeline-runs.js # /api/pipeline-runs
│       └── health.js       # /api/health
├── public/                 # 静态文件（自动部署）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── wrangler.toml          # Cloudflare配置
└── package.json
```

### 1️⃣ 在Cloudflare Dashboard中配置

#### A. 创建Pages项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择 `Workers & Pages`
3. 点击 `Create application` > `Pages` > `Connect to Git`
4. 选择你的GitHub仓库：`XiangHuayi/Dashboard`
5. 配置构建设置：

   | 设置项 | 值 |
   |-------|---|
   | **Production branch** | `main` |
   | **Framework preset** | `None` |
   | **Build command** | `npm run build:css` |
   | **Build output directory** | `public` |
   | **Root directory** | `/` |

6. 点击 `Save and Deploy`

**⚠️ 重要：** Cloudflare Pages会自动检测 `functions/` 目录中的Functions，无需额外配置。

#### B. 配置环境变量

在 `Settings` > `Environment variables` 中添加：

| 变量名 | 值 | 环境 |
|-------|---|-----|
| `AZURE_DEVOPS_ORG` | jci | Production, Preview |
| `AZURE_DEVOPS_PROJECT` | OpenBlue%20SESAM%20V2 | Production, Preview |
| `AZURE_DEVOPS_TOKEN` | （你的token） | Production, Preview |
| `PIPELINE_LIST` | 8857:name1,8892:name2 | Production, Preview |

### 2️⃣ 创建Cloudflare Functions

需要将Express API转换为Cloudflare Functions格式。

#### 创建 `functions/api/pipelines.js`：

```javascript
export async function onRequest(context) {
  const { env } = context;
  
  const pipelineList = env.PIPELINE_LIST || '';
  const pipelines = pipelineList.split(',').map(item => {
    const [id, name] = item.split(':');
    return { id, name: name || `Pipeline ${id}` };
  }).filter(p => p.id);
  
  return new Response(JSON.stringify(pipelines), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### 创建 `functions/api/pipeline-runs.js`：

```javascript
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const days = parseInt(url.searchParams.get('days')) || 7;
  const pipelineId = url.searchParams.get('pipelineId') || '8857';
  
  const org = env.AZURE_DEVOPS_ORG;
  const project = env.AZURE_DEVOPS_PROJECT;
  const token = env.AZURE_DEVOPS_TOKEN;
  
  const azureUrl = `https://dev.azure.com/${org}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1&$top=1000`;
  
  const response = await fetch(azureUrl, {
    headers: {
      'Authorization': `Basic ${btoa(`:${token}`)}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
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
    runs: runs.slice(0, 100), // 限制返回数量
  };
}
```

#### 创建 `functions/api/health.js`：

```javascript
export async function onRequest() {
  return new Response(JSON.stringify({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 3️⃣ 使用Wrangler CLI本地开发

#### 安装Wrangler

```bash
npm install -g wrangler
```

#### 登录Cloudflare

```bash
wrangler login
```

#### 本地测试

```bash
# 创建 .dev.vars 文件（Cloudflare的本地环境变量）
echo "AZURE_DEVOPS_ORG=jci" > .dev.vars
echo "AZURE_DEVOPS_PROJECT=OpenBlue%20SESAM%20V2" >> .dev.vars
echo "AZURE_DEVOPS_TOKEN=your-token" >> .dev.vars
echo "PIPELINE_LIST=8857:name1,8892:name2" >> .dev.vars

# 本地开发服务器
wrangler pages dev public --compatibility-date=2024-01-01
```

### 4️⃣ 部署到Cloudflare

#### 方式A：通过Git自动部署（推荐）

```bash
# 提交代码到GitHub
git add .
git commit -m "Add Cloudflare Pages support"
git push github main
```

Cloudflare会自动检测到推送并开始构建。

#### 方式B：使用Wrangler手动部署

```bash
# 构建前端
npm run build:css

# 部署
wrangler pages deploy public --project-name=dashboard
```

---

## 📦 方案二：混合部署（前端Cloudflare + 后端Azure）

如果你想保持现有的Node.js后端在Azure上。

### 1️⃣ 部署前端到Cloudflare Pages

**构建设置：**
- Build command: `npm run build:css`
- Build output directory: `public`

### 2️⃣ 修改前端API调用

编辑 `public/app.js`，添加API_BASE_URL配置：

```javascript
// 根据环境选择API地址
const API_BASE_URL = window.location.hostname.includes('pages.dev') 
  ? 'https://your-app.azurewebsites.net'  // Azure后端地址
  : '';  // 本地开发时使用相对路径

// 修改fetch调用
async function loadPipelines() {
  const response = await fetch(`${API_BASE_URL}/api/pipelines`);
  // ...
}
```

### 3️⃣ 配置CORS

在Azure的 `server.js` 中允许Cloudflare域名：

```javascript
const cors = require('cors');
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://dashboard.pages.dev',  // 你的Cloudflare域名
    'https://your-custom-domain.com'
  ]
}));
```

---

## 🔒 安全配置

### Cloudflare环境变量

**不要在代码中硬编码token！**

在Cloudflare Dashboard中配置：
1. 进入你的Pages项目
2. `Settings` > `Environment variables`
3. 添加secrets（Production和Preview环境）

### 本地开发

创建 `.dev.vars` 文件（已在.gitignore中）：

```env
AZURE_DEVOPS_ORG=jci
AZURE_DEVOPS_PROJECT=OpenBlue%20SESAM%20V2
AZURE_DEVOPS_TOKEN=your-token
PIPELINE_LIST=8857:backend,8892:frontend
```

---

## 📊 构建命令说明

### 当前package.json脚本

```json
{
  "scripts": {
    "build:css": "sass public/style.scss public/style.css",
    "prestart": "npm run build:css",
    "start": "node server.js"
  }
}
```

### Cloudflare Pages构建

Cloudflare Pages会执行：
1. `npm install` - 安装依赖
2. `npm run build:css` - 编译SCSS
3. 部署 `public/` 目录中的静态文件

---

## 🚀 部署后访问

### Cloudflare提供的URL

```
https://dashboard-xxx.pages.dev
```

### 自定义域名

在Cloudflare Pages设置中添加自定义域名：
1. `Custom domains` > `Set up a custom domain`
2. 输入你的域名
3. Cloudflare会自动配置DNS

---

## 🔍 常见问题

### Q: Functions不工作？
A: 确保functions文件夹结构正确，路径 `/api/pipelines` 对应 `functions/api/pipelines.js`

### Q: 环境变量读取不到？
A: 在Cloudflare Dashboard中检查环境变量是否配置在正确的环境（Production/Preview）

### Q: 本地开发如何测试Functions？
A: 使用 `wrangler pages dev public` 命令启动本地服务器

### Q: 构建失败？
A: 检查 `package.json` 中的 `build:css` 脚本是否正确，确保 `sass` 依赖已安装

---

## 📚 参考资源

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Functions 文档](https://developers.cloudflare.com/pages/functions/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
