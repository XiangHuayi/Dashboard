# Azure DevOps Pipeline Dashboard - 部署指南

## 🚀 部署到 Azure App Service

### 前置要求

1. Azure 订阅账号
2. Azure DevOps 组织和项目
3. 已安装 Azure CLI（可选）

### 部署步骤

#### 1. 在 Azure Portal 创建 App Service

```bash
# 使用 Azure CLI 创建资源组
az group create --name dashboard-rg --location eastus

# 创建 App Service Plan
az appservice plan create \
  --name dashboard-plan \
  --resource-group dashboard-rg \
  --sku B1 \
  --is-linux

# 创建 Web App
az webapp create \
  --name pipeline-dashboard-app \
  --resource-group dashboard-rg \
  --plan dashboard-plan \
  --runtime "NODE:18-lts"
```

或者在 Azure Portal 手动创建：
- 资源类型: Web App
- 运行时: Node.js 18 LTS
- 操作系统: Linux
- 定价层: B1 或更高

#### 2. 配置环境变量

在 Azure Portal 的 App Service 配置中添加以下应用程序设置：

```
AZURE_DEVOPS_ORG=jci
AZURE_DEVOPS_PROJECT=OpenBlue%20SESAM%20V2
AZURE_DEVOPS_PIPELINE_ID=8857
AZURE_DEVOPS_TOKEN=your-token-here
PIPELINE_LIST=8857:sesam.modules.backend-apigateway,8892:sesam.alarmservice.backend,8805:sesam.portal.frontend,8891:sesam.calculateservice.backend,8856:sesam.modules.backend-alarm,8855:sesam.modules.backend-energy,8819:sesam.modules.backend-hvac
PORT=8080
WEBSITE_NODE_DEFAULT_VERSION=~18
SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

或使用 Azure CLI：

```bash
az webapp config appsettings set \
  --name pipeline-dashboard-app \
  --resource-group dashboard-rg \
  --settings \
    AZURE_DEVOPS_ORG=jci \
    AZURE_DEVOPS_PROJECT=OpenBlue%20SESAM%20V2 \
    AZURE_DEVOPS_TOKEN=your-token-here \
    PIPELINE_LIST="8857:sesam.modules.backend-apigateway,8892:sesam.alarmservice.backend,8805:sesam.portal.frontend,8891:sesam.calculateservice.backend,8856:sesam.modules.backend-alarm,8855:sesam.modules.backend-energy,8819:sesam.modules.backend-hvac"
```

#### 3. 在 Azure DevOps 创建 Pipeline

1. 进入你的 Azure DevOps 项目
2. 点击 **Pipelines** > **New Pipeline**
3. 选择代码仓库位置
4. 选择 **Existing Azure Pipelines YAML file**
5. 选择 `azure-pipelines.yml`
6. 点击 **Run**

#### 4. 配置 Service Connection

在 Azure DevOps 中创建 Azure 服务连接：

1. 进入 **Project Settings** > **Service connections**
2. 点击 **New service connection**
3. 选择 **Azure Resource Manager**
4. 选择 **Service principal (automatic)**
5. 选择你的订阅和资源组
6. 命名为: `AzureConnection`（与 pipeline 中的 `azureSubscription` 变量对应）

#### 5. 配置 Pipeline 变量

在 Azure DevOps Pipeline 中添加变量：

- `azureSubscription`: Azure 服务连接名称（例如：AzureConnection）
- `webAppName`: Azure Web App 名称（例如：pipeline-dashboard-app）

#### 6. 推送代码并触发部署

```bash
git add .
git commit -m "Add Azure deployment configuration"
git push origin main
```

Pipeline 会自动触发并部署应用。

### 访问部署的应用

部署成功后，访问：
```
https://pipeline-dashboard-app.azurewebsites.net
```

或使用自定义域名配置。

### 🔒 安全配置

#### 1. 保护敏感信息

建议使用 Azure Key Vault 存储敏感信息：

```bash
# 创建 Key Vault
az keyvault create \
  --name dashboard-keyvault \
  --resource-group dashboard-rg \
  --location eastus

# 添加 secret
az keyvault secret set \
  --vault-name dashboard-keyvault \
  --name "AzureDevOpsToken" \
  --value "your-token-here"

# 配置 App Service 使用 Key Vault
az webapp config appsettings set \
  --name pipeline-dashboard-app \
  --resource-group dashboard-rg \
  --settings \
    AZURE_DEVOPS_TOKEN="@Microsoft.KeyVault(SecretUri=https://dashboard-keyvault.vault.azure.net/secrets/AzureDevOpsToken/)"
```

#### 2. 启用认证

在 Azure Portal 中为 App Service 配置身份验证：
- **Authentication** > **Add identity provider**
- 选择 Azure AD 或其他提供商

### 📊 监控和日志

#### 启用 Application Insights

```bash
# 创建 Application Insights
az monitor app-insights component create \
  --app dashboard-insights \
  --location eastus \
  --resource-group dashboard-rg \
  --application-type web

# 连接到 Web App
az monitor app-insights component connect-webapp \
  --app dashboard-insights \
  --resource-group dashboard-rg \
  --web-app pipeline-dashboard-app
```

#### 查看日志

```bash
# 实时日志流
az webapp log tail \
  --name pipeline-dashboard-app \
  --resource-group dashboard-rg

# 下载日志
az webapp log download \
  --name pipeline-dashboard-app \
  --resource-group dashboard-rg \
  --log-file logs.zip
```

### 🔄 持续部署

Pipeline 已配置为在推送到 `main` 或 `master` 分支时自动部署。

### 💡 常见问题

**Q: 部署后页面无法访问？**
A: 检查端口配置，Azure App Service 默认使用环境变量 `PORT`，确保 server.js 中使用了 `process.env.PORT`。

**Q: 环境变量不生效？**
A: 重启 App Service: `az webapp restart --name pipeline-dashboard-app --resource-group dashboard-rg`

**Q: SCSS 没有编译？**
A: 确保 `package.json` 中有 `prestart` 脚本，或在部署时设置 `SCM_DO_BUILD_DURING_DEPLOYMENT=true`。

### 📞 支持

如遇问题，可以：
1. 查看 Azure Portal 中的 Log Stream
2. 检查 Application Insights 的诊断信息
3. 查看 Azure DevOps Pipeline 日志

---

## 🌐 替代部署选项

### 选项 1: Azure Container Instances

适合轻量级部署，无需管理 App Service Plan。

### 选项 2: Azure Kubernetes Service (AKS)

适合大规模、高可用性需求。

### 选项 3: Azure Static Web Apps + Azure Functions

前端静态托管，后端使用 Serverless 函数。
