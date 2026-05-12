# Outlook 邮件工作台

一个面向 Outlook 邮箱检索与取件场景的轻量化 Web 工具。

- 支持单管理员内置登录
- 管理员可把邮箱保存到服务器
- 管理员可分享一个或多个邮箱生成免登录地址
- 普通用户打开分享地址后可直接取件
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
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

服务端数据默认保存在：

```text
data/store.json
```

## 使用流程

### 管理员

1. 启动服务后，使用内置管理员账号登录
2. 批量导入邮箱账号，邮箱将保存到服务器
3. 可直接对自己的邮箱执行取件
4. 勾选一个或多个邮箱，生成分享地址
5. 分享信息会按 `账号 / 密码 / 取件地址` 三行格式展示并可一键复制

### 普通用户

1. 打开管理员分享出来的地址
2. 无需登录
3. 直接对分享内的邮箱执行取件

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

- 内置管理员登录
- 服务端保存邮箱账号
- 管理员私有邮箱池管理
- 多邮箱分享链接生成
- 分享链接免登录访问
- Graph API 取件
- IMAP OAuth2 取件
- 邮件列表展示与去重
- 邮件详情弹窗查看

## 后续可扩展

- 更强的本地加密存储
- 批量并发限流
- OAuth 申请向导
- 部署脚本
