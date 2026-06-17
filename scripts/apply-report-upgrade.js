const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const cssPath = path.join(root, 'public/assets/app.css');
const dbPath = path.join(root, 'data/blog.db');
const version = 'report-20260617-v1';

function patchServer() {
  let server = fs.readFileSync(serverPath, 'utf8');

  server = server.replace(
    "app.use(express.static('public', { maxAge: '7d' }));",
    "app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: 0, etag: false, lastModified: false }));\napp.use(express.static('public', { maxAge: '1h' }));"
  );

  server = server.replace(
    /<link rel="preconnect" href="https:\/\/cdnjs\.cloudflare\.com"><link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/highlight\.js\/11\.11\.1\/styles\/github-dark\.min\.css"><link rel="stylesheet" href="\/assets\/app\.css">/g,
    `<link rel="stylesheet" href="/assets/app.css?v=${version}">`
  );

  server = server.replace(
    /<script src="\/assets\/app\.js"><\/script>/g,
    `<script src="/assets/app.js?v=${version}"></script>`
  );

  fs.writeFileSync(serverPath, server);
}

function patchCss() {
  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('report-page-note')) {
    css += `

/* 训练报告适配与代码块缓存兜底 */
.report-page-note{padding:18px 20px;border:1px solid var(--line);border-radius:16px;background:var(--paper-2);color:var(--muted);box-shadow:var(--shadow-soft)}
body pre,body pre.hljs,body main pre,body article pre,body .article pre,body .prose pre{background:linear-gradient(180deg,#fffdf8,#f8eddd)!important;color:#3a3028!important;border:1px solid #decbb2!important;box-shadow:0 12px 34px rgba(82,55,30,.08)!important;border-radius:18px!important}body pre code,body pre code.hljs,body code.hljs,body .hljs{background:transparent!important;color:#3a3028!important;text-shadow:none!important}
`;
    fs.writeFileSync(cssPath, css);
  }
}

function ensureCategory(db, name, slug, description, color) {
  const row = db.prepare('SELECT id FROM categories WHERE slug=?').get(slug);
  if (row) return row.id;
  const info = db.prepare('INSERT INTO categories (name,slug,description,color) VALUES (?,?,?,?)').run(name, slug, description, color);
  return info.lastInsertRowid;
}

function seedReportPost() {
  if (!fs.existsSync(dbPath)) {
    console.log('未找到 data/blog.db，跳过文章写入。先启动一次博客后再运行本脚本即可。');
    return;
  }

  const db = new Database(dbPath);
  const categoryId = ensureCategory(db, '综合训练', 'training', '软件开发综合训练项目说明、设计与测试记录', '#8a5a2d');

  const content = `# 软件开发综合训练项目说明与系统设计

> 本文用于配合软件开发综合训练报告撰写和答辩演示，集中说明博客系统的需求分析、总体设计、模块实现、系统测试、总结与改进方向。

## 一 训练目的与任务对应

软件开发综合训练要求学生综合运用程序设计、数据结构、数据库、软件工程和开发工具完成一个可运行的软件系统。本博客系统以“个人内容发布与管理”为业务对象，围绕文章发布、分类归档、全文检索、评论互动、后台管理和部署维护构建完整功能链。

系统训练目标对应关系如下。

| 训练要求 | 博客系统中的体现 |
| --- | --- |
| 问题分析 | 从访客、评论者、管理员三类角色出发分析功能需求和非功能需求 |
| 解决方案 | 采用 Node.js + Express + SQLite 的轻量 Web 架构实现完整博客系统 |
| 开发工具使用 | 使用 GitHub、PM2、Nginx、SQLite、Markdown 渲染和前端样式进行工程化开发 |
| 系统测试 | 通过首页访问、文章检索、后台登录、评论提交、部署更新等用例验证系统 |
| 报告内容 | 按需求分析、总体设计、模块设计与实现、系统测试、总结分析组织材料 |

## 二 需求分析

（1）总体需求  
博客系统需要为普通访客提供稳定清晰的文章阅读入口，为管理员提供文章维护和站点管理能力，同时保证系统部署简单、数据结构清楚、页面显示稳定。

（2）功能性需求  
① 文章浏览：访客能够在首页浏览最新文章，并进入文章详情页阅读正文。  
② 分类归档：访客能够按照分类和年份查看文章，降低内容查找成本。  
③ 文章检索：访客能够根据关键词搜索标题、摘要和正文。  
④ 评论互动：访客能够在文章详情页提交评论。  
⑤ 后台管理：管理员能够登录后台，进行文章、分类、评论和站点信息维护。  
⑥ 内容渲染：系统支持 Markdown 正文、代码块高亮、目录生成和阅读时间估算。

（3）非功能性需求  
① 可用性：页面布局清晰，适配桌面端和移动端。  
② 安全性：后台密码使用 bcrypt 摘要存储，登录和评论接口加入限流。  
③ 可维护性：核心数据保存在 SQLite 中，代码和数据分离，便于备份与迁移。  
④ 性能：对静态资源进行缓存控制，对文章和分类查询使用简单 SQL 语句完成。  
⑤ 可部署性：通过 PM2 管理 Node 进程，通过 Nginx 代理域名，通过 GitHub Actions 支持自动部署。

## 三 总体设计

（1）系统架构  
系统采用单体 Web 应用架构，整体链路如下。

\`\`\`text
浏览器 → Nginx 反向代理 → Express 应用 → SQLite 数据库
\`\`\`

浏览器负责页面访问和用户操作，Nginx 负责域名入口和 HTTPS，Express 负责路由控制、数据查询、页面拼接和表单处理，SQLite 负责文章、分类、评论、用户和站点设置的持久化存储。

（2）功能结构  
系统主要分为前台展示模块和后台管理模块。前台展示模块包含首页文章流、文章详情页、归档页、搜索页、关于页和 RSS / sitemap 输出；后台管理模块包含登录认证、文章管理、分类管理、评论管理和站点设置。

（3）数据库设计  
系统核心数据表如下。

| 数据表 | 主要字段 | 说明 |
| --- | --- | --- |
| users | id、username、password、nickname | 保存后台管理员信息 |
| categories | id、name、slug、description、color | 保存文章分类信息 |
| posts | id、title、slug、content、excerpt、category_id、tags、view_count | 保存文章主体内容 |
| comments | id、post_id、author_name、author_email、content、is_approved | 保存文章评论 |
| settings | key、value | 保存站点名称、描述、页脚等配置 |
| site_stats | total_visits、today_visits、today_date | 保存访问统计 |

## 四 模块设计与实现

（1）文章模块  
文章模块以 posts 表为核心。管理员在后台提交标题、slug、摘要、正文、分类、标签和发布状态后，系统将数据写入 SQLite。访客访问文章详情页时，系统按照 slug 查询文章，并将 Markdown 内容转换为 HTML，同时生成目录和代码块样式。

（2）分类与归档模块  
分类信息保存在 categories 表中，文章通过 category_id 与分类关联。首页分类筛选通过 URL 参数传递分类 id，后端拼接 SQL 条件查询对应文章。归档页按照 created_at 字段按年份聚合，便于展示时间线。

（3）搜索模块  
搜索模块接收关键词参数 q，使用 LIKE 查询标题、摘要和正文。该方案实现简单，适合小型个人博客。后续若文章量增大，可升级为 SQLite FTS5 全文索引，提高检索性能。

（4）评论模块  
评论模块接收昵称、邮箱和评论内容，写入 comments 表。为了降低恶意提交风险，评论接口使用 express-rate-limit 做请求频率限制。后台评论管理页可以切换评论显示状态。

（5）安全模块  
后台登录使用 bcryptjs 对密码进行摘要比对，Session 使用 httpOnly Cookie 保存登录状态。系统不再公开默认密码，敏感配置通过 .env 文件提供，避免将密钥提交到 GitHub。

（6）部署模块  
部署模块使用 GitHub 保存代码，GitHub Actions 通过 SSH 登录服务器执行更新，PM2 负责进程守护，Nginx 负责域名反向代理。该部署结构简单可靠，适合课程项目和个人站点。

## 五 系统测试

| 测试编号 | 测试内容 | 测试操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| T01 | 首页访问 | 访问 / | 显示站点标题、分类和文章列表 | 通过 |
| T02 | 文章详情 | 点击任意文章 | 显示文章标题、正文、目录和评论区 | 通过 |
| T03 | 分类筛选 | 点击分类标签 | 仅显示对应分类文章 | 通过 |
| T04 | 关键词搜索 | 输入关键词并提交 | 返回相关标题、摘要或正文匹配文章 | 通过 |
| T05 | 后台登录 | 输入管理员账号密码 | 登录成功后进入后台仪表盘 | 通过 |
| T06 | 文章发布 | 在后台新建文章并保存 | 首页和归档页出现新文章 | 通过 |
| T07 | 评论提交 | 在文章页提交评论 | 评论写入数据库并展示 | 通过 |
| T08 | 部署更新 | 推送 GitHub 或手动拉取代码 | PM2 重启后页面更新 | 通过 |

## 六 总结及分析

本系统完成了个人博客从需求分析、数据库设计、模块实现到部署测试的完整流程。系统功能虽然不复杂，但覆盖了 Web 应用开发的主要环节，包括路由设计、数据持久化、用户认证、Markdown 内容渲染、评论交互、后台维护和服务器部署。

当前系统仍有可改进空间。第一，搜索功能仍基于 LIKE 查询，文章量增加后可引入 SQLite FTS5。第二，后台编辑器缺少实时预览和自动保存，后续可提高写作体验。第三，评论模块可以增加敏感词过滤、验证码和邮件通知。第四，训练报告中还应补充用例图、功能结构图、E-R 图、流程图和测试截图，使文档表达更加完整。

## 七 训练体会

通过本次博客系统开发，可以较完整地理解一个 Web 应用从问题分析到上线运行的过程。项目不仅涉及前端页面，还涉及数据库设计、服务端路由、会话管理、文件上传、部署脚本和运行维护。相比单独完成代码练习，综合训练更强调系统性和工程化，需要考虑功能能否长期运行、数据是否安全、部署是否可重复、页面是否便于用户使用。

## 八 参考文献

[1] Ian Sommerville．Software Engineering[M]．Boston：Pearson，2016．  
[2] Express.js Contributors．Express Documentation[Z]．2026．  
[3] SQLite Consortium．SQLite Documentation[Z]．2026．  
[4] Node.js Contributors．Node.js Documentation[Z]．2026．  
[5] PM2 Documentation Team．PM2 Runtime Documentation[Z]．2026．  
[6] GitHub Docs．GitHub Actions Documentation[Z]．2026．`;

  db.prepare(`
    INSERT INTO posts (title, slug, content, excerpt, category_id, tags, is_published, is_pinned, updated_at)
    VALUES (@title, @slug, @content, @excerpt, @category_id, @tags, 1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title,
      content=excluded.content,
      excerpt=excluded.excerpt,
      category_id=excluded.category_id,
      tags=excluded.tags,
      is_published=1,
      is_pinned=1,
      updated_at=CURRENT_TIMESTAMP
  `).run({
    title: '软件开发综合训练项目说明与系统设计',
    slug: 'software-development-training-report',
    content,
    excerpt: '按综合训练报告要求整理博客系统的需求分析、总体设计、模块实现、系统测试和总结分析。',
    category_id: categoryId,
    tags: JSON.stringify(['综合训练', '需求分析', '总体设计', '系统测试'])
  });

  db.close();
}

patchServer();
patchCss();
seedReportPost();
console.log('已完成：缓存修复、代码块浅色兜底、综合训练报告文章写入。');
