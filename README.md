# 墨言小栈重构版

这是 `blog.gooffu.tech` 的 Node.js + Express + SQLite 个人博客项目。

## 技术栈

- Node.js
- Express
- SQLite / better-sqlite3
- marked + highlight.js
- 原生 HTML / CSS / JavaScript

## 主要功能

- 首页文章流
- 分类筛选
- 文章归档
- 文章详情页
- Markdown 渲染
- 代码高亮
- 阅读时间
- 自动目录
- 评论系统
- 后台管理
- 暗色模式
- RSS / sitemap

## 部署

```bash
npm install
cp .env.example .env
# 修改 .env 里的 BLOG_SESSION_SECRET / ADMIN_PASSWORD / PUBLIC_BASE_URL
npm start
```

生产环境建议使用 PM2：

```bash
npm install -g pm2
pm2 start server.js --name moyan-blog
pm2 save
```

## 环境变量

```bash
PORT=3000
PUBLIC_BASE_URL=https://blog.gooffu.tech
BLOG_SESSION_SECRET=replace_with_a_long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_a_strong_initial_password
NODE_ENV=production
```

## 注意

不要提交：

- `.env`
- `data/blog.db`
- `public/uploads/*`
- `node_modules/`

这些内容已经由 `.gitignore` 排除。
