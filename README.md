
# gh-org-invite-core-enhanced

GitHub 企业版多组织邀请管理工具

## ✨ 功能特点

- 支持**多组织管理**，可在前端直接配置 Token 和组织名
- 首页展示组织成员数量、未接受邀请数量、Copilot 状态
- 支持查看每个成员的具体 GitHub 用户名和头像
- 支持 **GitHub 用户名** 或 **邮箱** 两种方式发送组织邀请（批量）
- 检测 GitHub Copilot 启用状态（All members / Disabled / Selected）
- 配置自动保存到浏览器，下次访问无需重新输入

## 🚀 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000，在页面上直接添加组织配置即可使用。

---

## 📦 Vercel 部署步骤

### 第一步：推送代码到 GitHub

```bash
# 初始化 git 仓库
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit"

# 添加远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/仓库名.git

# 推送到 GitHub
git push -u origin main
```

### 第二步：在 Vercel 部署

1. 访问 [vercel.com](https://vercel.com)
2. 使用 GitHub 账号登录
3. 点击 **「New Project」**
4. 在列表中找到并选择你刚推送的仓库
5. 点击 **「Deploy」**
6. 等待 1-2 分钟，部署完成
7. 获得访问链接，如 `https://your-project.vercel.app`

### 第三步：添加访问密码保护（强烈推荐）

1. 在 Vercel 项目页面，点击 **Settings**
2. 左侧找到 **Password Protection**（需要 Pro 计划）
3. 开启密码保护，设置访问密码
4. 这样只有知道密码的人才能访问页面

> 💡 如果没有 Pro 计划，可以考虑使用 Cloudflare Access 等免费方案保护

---

## 🔑 GitHub Token 权限配置

### Token 创建步骤（图文）

1. 登录 GitHub，点击右上角头像
2. 进入 **Settings**（设置）
3. 左侧菜单滚动到底部，点击 **Developer settings**
4. 点击 **Personal access tokens** → **Tokens (classic)**
5. 点击 **「Generate new token」** → **「Generate new token (classic)」**
6. 填写 Token 信息：
   - **Note**: 填写备注，如 `org-invite-tool`
   - **Expiration**: 选择过期时间（建议 90 天，定期更换）
7. 勾选权限（见下表）
8. 点击 **「Generate token」**
9. **立即复制保存 Token**（页面刷新后无法再查看）

### 所需权限清单

#### 必需权限

| 权限 | 用途 |
|------|------|
| `admin:org` | 创建组织邀请、管理成员 |
| `read:org` | 读取组织成员列表、获取成员角色信息 |

#### 可选权限

| 权限 | 用途 | 说明 |
|------|------|------|
| `manage_billing:copilot` | 检测 Copilot 启用状态 | 不勾选则 Copilot 状态显示"未知" |
| `audit_log` | 读取成员加入时间 | ⚠️ 仅 GitHub Enterprise 支持 |

> 💡 **注意**：成员加入时间功能依赖**审计日志 API**，这是 **GitHub Enterprise** 专属功能。如果你的组织不是企业版，成员加入时间将无法显示（但邀请时间可以正常显示）。

### 权限勾选截图说明

在 Token 创建页面，需要勾选：

```
☑️ admin:org
   ☑️ read:org
   ☑️ write:org
   
☑️ manage_billing:copilot (可选，用于检测 Copilot 状态)

☑️ audit_log (可选，企业版专用，用于获取成员加入时间)
```

---

## 🔒 安全说明

### Token 安全措施

| 措施 | 说明 |
|------|------|
| ✅ Token 通过 Headers 传递 | 不在 URL 中暴露，避免被服务器日志记录 |
| ✅ HTTPS 加密传输 | Vercel 默认提供 SSL 证书 |
| ✅ 本地持久化存储 | Token 保存在浏览器 localStorage，关闭浏览器不会丢失 |

### localStorage 存储说明

| 情况 | Token 是否保留 |
|------|---------------|
| 关闭浏览器标签页 | ✅ 保留 |
| 关闭整个浏览器 | ✅ 保留 |
| 电脑重启 | ✅ 保留 |
| 刷新页面 | ✅ 保留 |
| 清除浏览器缓存/数据 | ❌ 丢失 |
| 使用无痕/隐私模式 | ❌ 不保存 |
| 换另一个浏览器 | ❌ 需重新输入 |
| 换另一台电脑 | ❌ 需重新输入 |

### 安全最佳实践

1. **创建专用 Token** - 为此工具单独创建一个 Token，不要使用主 Token
2. **最小权限原则** - 只勾选必要的权限
3. **定期轮换** - 建议每 90 天更换一次 Token
4. **私人使用** - 不要将部署链接分享给他人
5. **密码保护** - 使用 Vercel 密码保护或其他访问控制
6. **不在公共电脑使用** - 避免 Token 被他人获取

---

## 📊 批量邀请限制

- GitHub API 每小时限制 **5,000 次请求**
- 用户名邀请：2 次请求/人（查询用户 + 发送邀请）
- 邮箱邀请：1 次请求/人
- 理论上每小时可邀请 **2,500-5,000 人**
- 建议每次批量控制在 **100-200 人** 以内

---

## 🔌 API 概览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/members?org=xxx` | GET | 返回组织成员列表 |
| `/api/invitations?org=xxx` | GET | 返回未接受的邀请列表 |
| `/api/copilot?org=xxx` | GET | 返回 Copilot 启用状态 |
| `/api/invite` | POST | 发送邀请 |

Token 通过 `x-github-token` Header 传递。

---

## ❓ 常见问题

**Q: 邮箱邀请失败怎么办？**
A: 检查组织设置是否允许邮箱邀请，或改用用户名邀请。

**Q: 提示 Token 权限不足？**
A: 确保 Token 勾选了 `admin:org` 权限。

**Q: Copilot 状态显示未知？**
A: 需要 Token 有 `manage_billing:copilot` 权限，或组织未启用 Copilot。

**Q: 配置丢失了？**
A: 可能清除了浏览器数据，需要重新输入配置。
# yqoqing
# yaoqing
# yaoqing
