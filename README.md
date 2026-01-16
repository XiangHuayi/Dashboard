# Azure DevOps Pipeline Dashboard

这是一个用于展示Azure DevOps Pipeline统计数据的仪表板项目。

## 功能特性

- 📊 可视化Pipeline启动频率
- 🕒 可选择不同时间段进行统计
- ✅❌ 显示Pipeline成功率和失败率
- 📈 支持多种图表类型（柱状图、线性图、饼图）
- 🔄 实时数据更新
- 💻 本地运行支持

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+), Chart.js
- **后端**: Node.js, Express.js
- **数据源**: Azure DevOps REST API

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填入您的Azure DevOps配置信息：

```bash
cp .env.example .env
```

### 3. 启动服务器

```bash
npm start
```

或者使用开发模式（支持自动重启）：

```bash
npm run dev
```

### 4. 访问应用

打开浏览器访问: `http://localhost:3000`

## API配置

您需要在 `.env` 文件中配置以下信息：

- `AZURE_DEVOPS_ORG`: 您的Azure DevOps组织名
- `AZURE_DEVOPS_PROJECT`: 项目名称
- `AZURE_DEVOPS_PIPELINE_ID`: 默认Pipeline ID
- `AZURE_DEVOPS_TOKEN`: 访问令牌
- `PIPELINE_LIST`: Pipeline列表配置（格式: id:name,id:name,...）

### 添加新的Pipeline

要添加新的Pipeline，只需编辑 `.env` 文件中的 `PIPELINE_LIST` 配置项：

```env
PIPELINE_LIST=8857:sesam.modules.backend-apigateway,8892:sesam.alarmservice.backend,新ID:新Pipeline名称
```

格式说明：
- 使用逗号 `,` 分隔不同的Pipeline
- 每个Pipeline使用 `:` 分隔ID和名称
- ID在左边，名称在右边
- 添加后重启服务器即可在下拉菜单中看到新的选项

## 项目结构

```
pipeline-dashboard/
├── public/           # 静态文件
│   ├── index.html   # 主页面
│   ├── style.scss   # SCSS样式源文件
│   ├── style.css    # 编译后的CSS文件（自动生成）
│   └── app.js       # 前端逻辑
├── server.js        # 后端服务器
├── .env             # 环境变量配置
├── package.json     # 项目依赖
└── README.md        # 说明文档
```

## 开发说明

### 样式开发

项目使用 SCSS 进行样式开发：

- **源文件**: `public/style.scss`
- **编译后**: `public/style.css`（自动生成，不要手动编辑）

修改样式时：

1. 编辑 `public/style.scss` 文件
2. 运行 `npm run build:css` 编译
3. 或使用 `npm run watch:css` 自动监听编译

### 可用脚本

- `npm start` - 编译SCSS并启动服务器
- `npm run dev` - 开发模式（支持自动重启）
- `npm run build:css` - 编译SCSS为CSS
- `npm run watch:css` - 监听SCSS文件变化并自动编译

## 使用说明

1. 打开网页后，您可以看到Pipeline统计图表
2. 使用时间选择器选择要查看的时间范围
3. 切换不同的图表类型查看数据
4. 数据会自动刷新以显示最新状态

## 🚀 部署到 Azure

详细的 Azure 部署指南请查看 [DEPLOYMENT.md](DEPLOYMENT.md)

### 快速部署步骤

1. 在 Azure Portal 创建 Web App (Node.js 18 LTS)
2. 配置环境变量（Azure DevOps 凭据）
3. 在 Azure DevOps 创建 Pipeline (使用 azure-pipelines.yml)
4. 推送代码触发自动部署

部署后访问：`https://your-app-name.azurewebsites.net`

## API 端点

部署后可通过以下端点访问：

- `GET /` - Dashboard 主页面
- `GET /api/pipelines` - 获取可用的 Pipeline 列表
- `GET /api/pipeline-runs?days=30&pipelineId=8857` - 获取 Pipeline 运行数据
- `GET /api/health` - 健康检查端点