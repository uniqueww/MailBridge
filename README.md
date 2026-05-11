# Outlook 邮件工作台

一个面向 Outlook 邮箱检索与取件场景的轻量化 Web 工具。

- 无需站点登录，打开即可使用
- 邮箱账号列表保存在当前浏览器
- 支持 Graph API 与 IMAP 双协议取件
- 提供关键词、发件人过滤与邮件详情查看

## 启动

```bash
npm install
npm start
```

默认地址：

```text
http://127.0.0.1:3066
```

可选环境变量：

```bash
HOST=127.0.0.1
PORT=3066
```

## 导入格式

每行一个账号：

```text
账号----密码----clientid----刷新令牌
```

说明：

- 当前版本前端会保留 `password` 字段以兼容原站导入格式
- 但后端实际取件只使用 `email + clientId + refreshToken`
- Graph 默认 scope：`offline_access Mail.Read User.Read`
- IMAP 默认 scope：`https://outlook.office.com/IMAP.AccessAsUser.All offline_access`

## 目录

```text
public/
  index.html
  style.css
  app.js
server.js
package.json
```

## 功能概览

- 批量导入 Outlook 账号配置
- 浏览器端保存账号列表
- Graph API 取件
- IMAP OAuth2 取件
- 邮件列表展示与去重
- 邮件详情弹窗查看

## 后续可扩展

- 更强的本地加密存储
- 批量并发限流
- OAuth 申请向导
- 部署脚本
