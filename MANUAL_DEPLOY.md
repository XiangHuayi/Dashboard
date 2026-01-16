# 手动部署到 Azure App Service

## 方法 1: 使用 Azure Portal 手动部署

### 步骤：

1. **下载构建产物**
   - 进入 Azure DevOps Pipeline 运行记录
   - 点击成功的构建
   - 下载 Artifacts (drop/dashboard-xxxxx.zip)

2. **在 Azure Portal 部署**
   - 打开 Azure Portal: https://portal.azure.com
   - 找到你的 App Service
   - 进入 **Deployment Center**
   - 选择 **Manual Deployment** 或 **ZIP Deploy**
   - 上传下载的 zip 文件

## 方法 2: 使用 Azure CLI 部署

### 前提条件：
```bash
# 安装 Azure CLI
# Windows: https://aka.ms/installazurecliwindows
# 或使用 PowerShell:
# winget install -e --id Microsoft.AzureCLI
```

### 部署步骤：

```bash
# 1. 登录 Azure
az login

# 2. 设置订阅（如果有多个）
az account set --subscription "YOUR_SUBSCRIPTION_ID"

# 3. 本地构建项目
npm ci
npm run build:css

# 4. 创建部署包
cd "c:\Users\jxianghu\Documents\trae_projects\dashboard"
Compress-Archive -Path * -DestinationPath deploy.zip -Force

# 5. 部署到 Azure App Service
az webapp deploy --resource-group YOUR_RESOURCE_GROUP `
  --name YOUR_APP_NAME `
  --src-path deploy.zip `
  --type zip

# 6. 配置环境变量
az webapp config appsettings set `
  --resource-group YOUR_RESOURCE_GROUP `
  --name YOUR_APP_NAME `
  --settings `
    AZURE_DEVOPS_ORG=jci `
    AZURE_DEVOPS_PROJECT="OpenBlue SESAM V2" `
    AZURE_DEVOPS_TOKEN="YOUR_TOKEN" `
    "PIPELINE_LIST=8857:sesam.modules.backend-apigateway,8892:sesam.alarmservice.backend,8805:sesam.portal.frontend,8891:sesam.calculateservice.backend,8856:sesam.modules.backend-alarm,8855:sesam.modules.backend-energy,8819:sesam.modules.backend-hvac"

# 7. 重启应用
az webapp restart --resource-group YOUR_RESOURCE_GROUP --name YOUR_APP_NAME
```

## 方法 3: 使用 Git 直接部署

```bash
# 1. 在 Azure Portal 启用 Local Git 部署
# App Service > Deployment Center > Local Git

# 2. 获取 Git URL 和凭据
# 复制显示的 Git Clone URI

# 3. 添加 Azure Git 远程仓库
git remote add azure <YOUR_AZURE_GIT_URL>

# 4. 推送到 Azure
git push azure main

# 应用会自动构建和部署
```

## 方法 4: 配置自动部署（推荐）

### 创建 Azure Service Connection

1. **在 Azure DevOps 中创建服务连接**
   - 进入项目: https://dev.azure.com/jci/OpenBlue%20SESAM%20V2
   - 点击 **Project Settings** (左下角)
   - 选择 **Service connections**
   - 点击 **New service connection**
   - 选择 **Azure Resource Manager**
   - 选择 **Service principal (automatic)**
   - 配置：
     - Subscription: 选择你的 Azure 订阅
     - Resource group: 选择包含 App Service 的资源组
     - Service connection name: 输入 `AzureConnection`
     - Grant access permission to all pipelines: ✅ 勾选
   - 点击 **Save**

2. **在 Azure Portal 创建 App Service**（如果还没有）
   ```bash
   # 使用 Azure CLI
   az group create --name dashboard-rg --location eastus
   
   az appservice plan create \
     --name dashboard-plan \
     --resource-group dashboard-rg \
     --sku B1 \
     --is-linux
   
   az webapp create \
     --name pipeline-dashboard-app \
     --resource-group dashboard-rg \
     --plan dashboard-plan \
     --runtime "NODE:18-lts"
   ```

3. **修改 azure-pipelines.yml**
   - 取消注释 Deploy 阶段
   - 替换 `YOUR_AZURE_SERVICE_CONNECTION_NAME` 为 `AzureConnection`
   - 替换 `YOUR_WEB_APP_NAME` 为你的 App Service 名称

4. **提交并推送代码**
   ```bash
   git add azure-pipelines.yml
   git commit -m "Enable auto deployment"
   git push origin main
   ```

## 快速部署脚本（PowerShell）

将以下内容保存为 `deploy.ps1`:

```powershell
# 配置参数
$ResourceGroup = "dashboard-rg"
$AppName = "pipeline-dashboard-app"
$Location = "eastus"

# 登录 Azure
Write-Host "Logging in to Azure..." -ForegroundColor Green
az login

# 构建应用
Write-Host "Building application..." -ForegroundColor Green
npm ci
npm run build:css

# 创建部署包
Write-Host "Creating deployment package..." -ForegroundColor Green
Compress-Archive -Path * -DestinationPath deploy.zip -Force

# 检查资源组是否存在
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Host "Creating resource group..." -ForegroundColor Green
    az group create --name $ResourceGroup --location $Location
}

# 检查 App Service 是否存在
$appExists = az webapp show --name $AppName --resource-group $ResourceGroup 2>$null
if (-not $appExists) {
    Write-Host "Creating App Service..." -ForegroundColor Green
    az appservice plan create --name "$AppName-plan" --resource-group $ResourceGroup --sku B1 --is-linux
    az webapp create --name $AppName --resource-group $ResourceGroup --plan "$AppName-plan" --runtime "NODE:18-lts"
}

# 部署应用
Write-Host "Deploying to Azure..." -ForegroundColor Green
az webapp deploy --resource-group $ResourceGroup --name $AppName --src-path deploy.zip --type zip

# 配置环境变量
Write-Host "Configuring environment variables..." -ForegroundColor Green
az webapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $AppName `
  --settings `
    AZURE_DEVOPS_ORG=jci `
    AZURE_DEVOPS_PROJECT="OpenBlue SESAM V2" `
    AZURE_DEVOPS_TOKEN="$env:AZURE_DEVOPS_TOKEN" `
    "PIPELINE_LIST=8857:sesam.modules.backend-apigateway,8892:sesam.alarmservice.backend,8805:sesam.portal.frontend,8891:sesam.calculateservice.backend,8856:sesam.modules.backend-alarm,8855:sesam.modules.backend-energy,8819:sesam.modules.backend-hvac"

# 重启应用
Write-Host "Restarting application..." -ForegroundColor Green
az webapp restart --resource-group $ResourceGroup --name $AppName

# 获取应用 URL
$appUrl = az webapp show --name $AppName --resource-group $ResourceGroup --query defaultHostName -o tsv
Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Application URL: https://$appUrl" -ForegroundColor Cyan

# 清理
Remove-Item deploy.zip -Force
```

使用方法：
```powershell
# 设置 Azure DevOps Token 环境变量
$env:AZURE_DEVOPS_TOKEN = "YOUR_TOKEN_HERE"

# 运行部署脚本
.\deploy.ps1
```

## 验证部署

部署完成后，访问以下端点验证：

```bash
# 健康检查
curl https://your-app-name.azurewebsites.net/api/health

# Pipeline 列表
curl https://your-app-name.azurewebsites.net/api/pipelines

# Dashboard 页面
# 在浏览器中打开: https://your-app-name.azurewebsites.net
```

## 故障排除

### 查看日志
```bash
# 实时日志
az webapp log tail --name YOUR_APP_NAME --resource-group YOUR_RESOURCE_GROUP

# 下载日志
az webapp log download --name YOUR_APP_NAME --resource-group YOUR_RESOURCE_GROUP --log-file logs.zip
```

### 常见问题

**Q: 部署后显示 500 错误？**
- 检查环境变量是否正确配置
- 查看应用日志排查错误

**Q: SCSS 没有编译？**
- 确保 `prestart` 脚本在 package.json 中
- 手动运行 `npm run build:css` 后再部署

**Q: 无法访问 Azure DevOps API？**
- 检查 Token 是否有效
- 确保 Token 有正确的权限（Build: Read）
