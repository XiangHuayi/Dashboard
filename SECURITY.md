# 安全配置指南

## ⚠️ 环境变量安全最佳实践

### ❌ 绝不要做

- **不要提交 `.env` 文件到Git仓库**
- **不要在代码中硬编码token或密码**
- **不要在公开场合分享 `.env` 文件内容**
- **不要将token截图发送给他人**

### ✅ 应该做

1. **使用 `.env.example` 作为模板**
   ```bash
   # 正确的做法
   cp .env.example .env
   # 然后编辑 .env 填入真实值
   ```

2. **确保 `.env` 在 `.gitignore` 中**
   ```gitignore
   # .gitignore 文件应包含
   .env
   .env.local
   .env.*.local
   ```

3. **使用环境特定的配置**
   - 本地开发：使用 `.env` 文件
   - GitHub CI/CD：使用 GitHub Secrets
   - Azure生产环境：使用 Application Settings

---

## 🔐 在不同环境中配置敏感信息

### 1️⃣ 本地开发环境

**步骤：**
```bash
# 1. 复制模板
cp .env.example .env

# 2. 编辑 .env 文件（不要提交）
# 填入真实的 Azure DevOps token
```

**.env 文件示例：**
```env
AZURE_DEVOPS_ORG=jci
AZURE_DEVOPS_PROJECT=OpenBlue%20SESAM%20V2
AZURE_DEVOPS_TOKEN=your-actual-token-here
PIPELINE_LIST=8857:backend,8892:frontend
PORT=3000
```

---

### 2️⃣ GitHub仓库（CI/CD）

**在GitHub中配置Secrets：**

1. 打开仓库页面：https://github.com/XiangHuayi/Dashboard
2. 点击 `Settings`（仓库设置）
3. 左侧菜单选择 `Secrets and variables` > `Actions`
4. 点击 `New repository secret` 按钮
5. 添加以下secrets：

   | Secret名称 | 用途 | 值示例 |
   |-----------|------|-------|
   | `AZURE_DEVOPS_ORG` | 组织名称 | jci |
   | `AZURE_DEVOPS_PROJECT` | 项目名称 | OpenBlue%20SESAM%20V2 |
   | `AZURE_DEVOPS_TOKEN` | 访问令牌 | （你的PAT token） |
   | `PIPELINE_LIST` | Pipeline列表 | 8857:name1,8892:name2 |

**在GitHub Actions中使用：**
```yaml
# .github/workflows/ci.yml
- name: Create .env file
  run: |
    echo "AZURE_DEVOPS_ORG=${{ secrets.AZURE_DEVOPS_ORG }}" >> .env
    echo "AZURE_DEVOPS_TOKEN=${{ secrets.AZURE_DEVOPS_TOKEN }}" >> .env
```

---

### 3️⃣ Azure App Service（生产环境）

**在Azure Portal中配置：**

1. 登录 [Azure Portal](https://portal.azure.com)
2. 找到你的 App Service
3. 左侧菜单选择 `Configuration`（配置）
4. 点击 `Application settings` 标签
5. 点击 `New application setting` 添加环境变量：

   | 名称 | 值 |
   |-----|---|
   | `AZURE_DEVOPS_ORG` | jci |
   | `AZURE_DEVOPS_PROJECT` | OpenBlue%20SESAM%20V2 |
   | `AZURE_DEVOPS_TOKEN` | （你的PAT token） |
   | `PIPELINE_LIST` | 8857:name1,8892:name2 |
   | `PORT` | 8080 |
   | `NODE_ENV` | production |

6. 点击 `Save` 保存配置
7. 重启App Service使配置生效

**优势：**
- ✅ 不需要在代码中存储敏感信息
- ✅ 可以随时在Azure Portal中修改
- ✅ 不会暴露在Git历史中

---

### 4️⃣ 使用Azure Key Vault（推荐生产环境）

**更高级的安全方案：**

```bash
# 1. 创建Key Vault
az keyvault create --name myKeyVault --resource-group myResourceGroup

# 2. 添加secrets
az keyvault secret set --vault-name myKeyVault --name "AzureDevOpsToken" --value "your-token"

# 3. 在App Service中引用
# Application setting 值设置为：
@Microsoft.KeyVault(SecretUri=https://myKeyVault.vault.azure.net/secrets/AzureDevOpsToken/)
```

---

## 🔑 Azure DevOps Personal Access Token (PAT) 管理

### 创建PAT的步骤

1. 登录 Azure DevOps
2. 点击右上角头像 > `Personal access tokens`
3. 点击 `New Token`
4. 配置token：
   - **Name**: Dashboard App Token
   - **Organization**: 选择你的组织
   - **Expiration**: 建议90天或自定义
   - **Scopes**: 
     - ✅ Build (Read)
     - ✅ Code (Read) - 如果需要访问代码
5. 点击 `Create` 并**立即复制token**（只显示一次）

### Token安全建议

- 🔒 使用最小权限原则（只授予必要的权限）
- ⏰ 设置合理的过期时间（建议不超过90天）
- 🔄 定期轮换token
- 📝 记录token的用途和位置
- 🗑️ 不用的token立即撤销

---

## 🚨 如果token泄露了怎么办

### 立即行动：

1. **撤销泄露的token**
   - Azure DevOps > 头像 > Personal access tokens
   - 找到泄露的token并点击 `Revoke`

2. **创建新token**
   - 按照上述步骤创建新token

3. **更新配置**
   - 本地：更新 `.env` 文件
   - GitHub：更新 Repository Secrets
   - Azure：更新 Application Settings

4. **检查Git历史**
   ```bash
   # 如果token被提交到Git历史中
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch .env" \
     --prune-empty --tag-name-filter cat -- --all
   
   # 强制推送（谨慎操作）
   git push origin --force --all
   ```

---

## 📋 配置检查清单

在部署前确保：

- [ ] `.env` 文件在 `.gitignore` 中
- [ ] `.env.example` 不包含真实token
- [ ] 本地 `.env` 文件从未被提交
- [ ] GitHub Secrets已配置
- [ ] Azure Application Settings已配置
- [ ] Token权限最小化
- [ ] Token设置了过期时间
- [ ] 团队成员了解安全规范

---

## 📚 参考资源

- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Azure App Service Configuration](https://docs.microsoft.com/en-us/azure/app-service/configure-common)
- [Azure Key Vault](https://docs.microsoft.com/en-us/azure/key-vault/)
- [Azure DevOps PAT](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
