const express = require('express');
const Database = require('better-sqlite3');
const compression = require('compression');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { marked } = require('marked');
const hljs = require('highlight.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = process.env.BLOG_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(10).toString('base64url');

fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('public/uploads', { recursive: true });

marked.use({
  async: false,
  mangle: false,
  headerIds: false,
  renderer: {
    html() { return ''; },
    code(tokenOrCode, info) {
      const code = typeof tokenOrCode === 'object' ? tokenOrCode.text : tokenOrCode;
      const langRaw = typeof tokenOrCode === 'object' ? tokenOrCode.lang : info;
      const lang = String(langRaw || '').split(/\s+/)[0].toLowerCase();
      try {
        if (lang && hljs.getLanguage(lang)) {
          return `<pre><code class="hljs language-${escAttr(lang)}">${hljs.highlight(String(code), { language: lang }).value}</code></pre>`;
        }
        return `<pre><code class="hljs">${hljs.highlightAuto(String(code)).value}</code></pre>`;
      } catch (_) {
        return `<pre><code class="hljs">${esc(code)}</code></pre>`;
      }
    }
  }
});

const db = new Database('data/blog.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT DEFAULT '管理员',
  avatar TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1'
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  category_id INTEGER,
  tags TEXT DEFAULT '[]',
  is_published INTEGER DEFAULT 1,
  is_pinned INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT DEFAULT '',
  content TEXT NOT NULL,
  is_approved INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS site_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_visits INTEGER DEFAULT 0,
  today_visits INTEGER DEFAULT 0,
  today_date TEXT DEFAULT ''
);
`);
for (const sql of [
  'ALTER TABLE posts ADD COLUMN is_pinned INTEGER DEFAULT 0',
  'ALTER TABLE posts ADD COLUMN cover_image TEXT DEFAULT ""'
]) { try { db.exec(sql); } catch (_) {} }

db.prepare("INSERT OR IGNORE INTO site_stats (id,total_visits,today_visits,today_date) VALUES (1,0,0,'')").run();
seed();

app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static('public', { maxAge: '7d' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: 'public/uploads/',
    filename: (_, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /\.(jpg|jpeg|png|gif|webp)$/i.test(path.extname(file.originalname)))
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const commentLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

function seed() {
  if (!db.prepare('SELECT id FROM users WHERE username=?').get(ADMIN_USERNAME)) {
    db.prepare('INSERT INTO users (username,password,nickname) VALUES (?,?,?)').run(ADMIN_USERNAME, bcrypt.hashSync(ADMIN_PASSWORD, 10), '博客站长');
    if (!process.env.ADMIN_PASSWORD) console.log(`[blog] 临时管理员密码：${ADMIN_PASSWORD}`);
  }
  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const rows = [
      ['技术分享', 'tech', '技术文章与工程记录', '#6366f1'],
      ['生活随笔', 'life', '生活、观察与片段', '#ec4899'],
      ['开源项目', 'opensource', '项目复盘与发布记录', '#10b981'],
      ['读书笔记', 'reading', '阅读摘要与思考', '#f59e0b']
    ];
    const ins = db.prepare('INSERT INTO categories (name,slug,description,color) VALUES (?,?,?,?)');
    rows.forEach(r => ins.run(...r));
  }
  if (db.prepare('SELECT COUNT(*) c FROM posts').get().c === 0) {
    db.prepare('INSERT INTO posts (title,slug,content,excerpt,category_id,tags,is_pinned) VALUES (?,?,?,?,?,?,?)').run(
      '欢迎来到墨言小栈', 'hello-world',
      '# 欢迎来到墨言小栈\n\n这里会记录技术、项目、生活和阅读。\n\n## 写作方向\n\n- 工程实践\n- 产品想法\n- 开源记录\n- 日常观察\n\n> 慢慢写，认真记录。',
      '一个安静、清爽、专注写作的个人博客。', 1, JSON.stringify(['博客', '记录']), 1
    );
  }
  const set = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  set.run('site_name', '墨言小栈');
  set.run('site_description', '一个安静写字的地方');
  set.run('site_logo', '墨');
  set.run('footer_text', '© 2026 墨言小栈 · 用文字记录生活');
  set.run('posts_per_page', '9');
}

function esc(v = '') { return String(v).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])); }
function escAttr(v = '') { return esc(v).replace(/`/g, '&#96;'); }
function setting(key, def = '') { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? def; }
function site() { return { name: setting('site_name', '墨言小栈'), description: setting('site_description', ''), logo: setting('site_logo', '墨'), footer: setting('footer_text', ''), postsPerPage: Number(setting('posts_per_page', '9')) || 9 }; }
function tagsFrom(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function slugify(v) { return String(v || '').trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || crypto.randomBytes(4).toString('hex'); }
function readTime(md) { const t = String(md || '').replace(/[#>*_`\[\]()!-]/g, ''); const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length; const words = t.replace(/[\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean).length; return Math.max(1, Math.ceil(cjk / 300 + words / 200)); }
function plain(md, n = 160) { return String(md || '').replace(/```[\s\S]*?```/g, '').replace(/[#>*_`\[\]()!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
function auth(req, res, next) { if (req.session.isAdmin) return next(); return res.redirect('/admin/login'); }
function track(req, _res, next) { if (!req.path.startsWith('/admin') && !req.path.startsWith('/assets')) { const today = new Date().toISOString().slice(0, 10); const st = db.prepare('SELECT * FROM site_stats WHERE id=1').get(); const tv = st.today_date === today ? st.today_visits + 1 : 1; db.prepare('UPDATE site_stats SET total_visits=?,today_visits=?,today_date=? WHERE id=1').run(st.total_visits + 1, tv, today); } next(); }
function nav(active = '') { const s = site(); const a = p => active === p ? 'active' : ''; return `<nav class="nav"><div class="nav-inner"><a class="brand" href="/"><span>${esc(s.logo)}</span><b>${esc(s.name)}</b></a><button class="menu-btn" onclick="toggleMenu()">☰</button><div class="nav-links"><a class="${a('/')}" href="/">首页</a><a class="${a('/archive')}" href="/archive">归档</a><a class="${a('/about')}" href="/about">关于</a><button class="theme-btn" onclick="toggleTheme()">明暗</button></div></div></nav>`; }
function layout(title, body, desc = '') { const s = site(); const d = desc || s.description; return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(s.name)}</title><meta name="description" content="${escAttr(d)}"><link rel="preconnect" href="https://cdnjs.cloudflare.com"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css"><link rel="stylesheet" href="/assets/app.css"></head><body>${body}<script src="/assets/app.js"></script></body></html>`; }
function tocAndHtml(md) { let html = marked.parse(md || ''); const items = []; const seen = {}; html = html.replace(/<h([1-3])>(.*?)<\/h\1>/g, (_, lv, inner) => { const text = inner.replace(/<[^>]+>/g, ''); const base = slugify(text); let id = base, i = 2; while (seen[id]) id = `${base}-${i++}`; seen[id] = 1; items.push({ lv, id, text }); return `<h${lv} id="${id}">${inner}</h${lv}>`; }); const toc = items.length > 1 ? `<aside class="toc"><b>目录</b>${items.map(x => `<a class="l${x.lv}" href="#${x.id}">${esc(x.text)}</a>`).join('')}</aside>` : ''; return { toc, html }; }
function postCard(p) { const tags = tagsFrom(p.tags); const cover = p.cover_image ? `<img src="${escAttr(p.cover_image)}" alt="${escAttr(p.title)}" loading="lazy">` : `<div class="cover-mark">${esc((p.title || '墨').slice(0, 1))}</div>`; return `<article class="card fade"><a class="cover" href="/post/${escAttr(p.slug)}">${cover}</a><div class="card-body">${p.is_pinned ? '<span class="pin">置顶</span>' : ''}${p.category_name ? `<span class="cat" style="--cat:${escAttr(p.category_color)}">${esc(p.category_name)}</span>` : ''}<h2><a href="/post/${escAttr(p.slug)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt || plain(p.content))}</p><div class="meta"><span>${esc(String(p.created_at).slice(0, 10))}</span><span>${p.view_count || 0} 阅读</span><span>${readTime(p.content)} 分钟</span></div>${tags.length ? `<div class="tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</div></article>`; }

app.use(track);

app.get('/', (req, res) => {
  const s = site();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = s.postsPerPage;
  const offset = (page - 1) * limit;
  const category = req.query.category ? Number(req.query.category) : null;
  const params = [];
  let where = 'WHERE p.is_published=1';
  if (category) { where += ' AND p.category_id=?'; params.push(category); }
  const total = db.prepare(`SELECT COUNT(*) c FROM posts p ${where}`).get(...params).c;
  const posts = db.prepare(`SELECT p.*,c.name category_name,c.color category_color FROM posts p LEFT JOIN categories c ON p.category_id=c.id ${where} ORDER BY p.is_pinned DESC,p.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const cats = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const st = db.prepare('SELECT * FROM site_stats WHERE id=1').get();
  const postTotal = db.prepare('SELECT COUNT(*) c FROM posts WHERE is_published=1').get().c;
  const pages = Math.ceil(total / limit);
  const filters = cats.map(c => `<a class="chip ${category === c.id ? 'on' : ''}" href="/?category=${c.id}" style="--cat:${escAttr(c.color)}">${esc(c.name)}</a>`).join('');
  const pagination = pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map(n => `<a class="${n === page ? 'on' : ''}" href="/?page=${n}${category ? `&category=${category}` : ''}">${n}</a>`).join('')}</div>` : '';
  const body = `${nav('/')}<header class="hero"><div class="orb"></div><p class="eyebrow">Writing / Engineering / Notes</p><h1>欢迎来到 <span>${esc(s.name)}</span></h1><p>${esc(s.description)}</p><form class="search" action="/search"><input name="q" placeholder="搜索文章、项目、笔记"><button>搜索</button></form></header><main class="container"><section class="toolbar"><h2>最新文章</h2><div>${filters}</div></section><section class="grid">${posts.length ? posts.map(postCard).join('') : '<div class="empty">这个分类暂时还没有文章。</div>'}</section>${pagination}</main><section class="stats"><span>今日 ${st.today_visits}</span><span>累计 ${st.total_visits}</span><span>文章 ${postTotal}</span></section><footer>${esc(s.footer)}</footer>`;
  res.send(layout('首页', body));
});

app.get('/post/:slug', (req, res) => {
  const p = db.prepare('SELECT p.*,c.name category_name,c.color category_color FROM posts p LEFT JOIN categories c ON p.category_id=c.id WHERE p.slug=? AND p.is_published=1').get(req.params.slug);
  if (!p) return res.status(404).send(layout('404', `${nav()}<main class="container page"><h1>404</h1><p>文章不存在。</p></main>`));
  db.prepare('UPDATE posts SET view_count=view_count+1 WHERE id=?').run(p.id); p.view_count++;
  const { toc, html } = tocAndHtml(p.content);
  const comments = db.prepare('SELECT * FROM comments WHERE post_id=? AND is_approved=1 ORDER BY created_at DESC').all(p.id);
  const tags = tagsFrom(p.tags);
  const commentsHtml = comments.map(c => `<div class="comment"><b>${esc(c.author_name)}</b><time>${esc(String(c.created_at).slice(0, 10))}</time><p>${esc(c.content)}</p></div>`).join('');
  const body = `${nav()}<main class="article"><header class="article-head">${p.category_name ? `<span class="cat" style="--cat:${escAttr(p.category_color)}">${esc(p.category_name)}</span>` : ''}<h1>${esc(p.title)}</h1><p class="meta"><span>${esc(String(p.created_at).slice(0, 10))}</span><span>${p.view_count} 阅读</span><span>${readTime(p.content)} 分钟</span>${tags.length ? `<span>${tags.map(esc).join(' / ')}</span>` : ''}</p></header>${p.cover_image ? `<img class="article-cover" src="${escAttr(p.cover_image)}" alt="${escAttr(p.title)}">` : ''}${toc}<article class="prose">${html}</article><section class="comments"><h2>评论 ${comments.length}</h2><form class="comment-form" method="post" action="/post/${escAttr(p.slug)}/comments"><input name="author_name" required maxlength="40" placeholder="昵称"><input name="author_email" type="email" maxlength="120" placeholder="邮箱，可选"><textarea name="content" required maxlength="1000" placeholder="写下你的想法"></textarea><button>发表评论</button></form>${commentsHtml || '<p class="muted">还没有评论。</p>'}</section></main><footer>${esc(site().footer)}</footer>`;
  res.send(layout(p.title, body, p.excerpt || plain(p.content, 140)));
});

app.post('/post/:slug/comments', commentLimiter, (req, res) => {
  const p = db.prepare('SELECT id,slug FROM posts WHERE slug=? AND is_published=1').get(req.params.slug);
  if (!p) return res.status(404).send('not found');
  const name = String(req.body.author_name || '').trim().slice(0, 40);
  const email = String(req.body.author_email || '').trim().slice(0, 120);
  const content = String(req.body.content || '').trim().slice(0, 1000);
  if (!name || !content) return res.redirect(`/post/${p.slug}`);
  db.prepare('INSERT INTO comments (post_id,author_name,author_email,content) VALUES (?,?,?,?)').run(p.id, name, email, content);
  res.redirect(`/post/${p.slug}#comments`);
});

app.get('/archive', (req, res) => {
  const posts = db.prepare('SELECT title,slug,created_at,view_count,is_pinned FROM posts WHERE is_published=1 ORDER BY is_pinned DESC,created_at DESC').all();
  const groups = posts.reduce((m, p) => ((m[String(p.created_at).slice(0, 4)] ||= []).push(p), m), {});
  const html = Object.entries(groups).sort((a, b) => b[0] - a[0]).map(([y, arr]) => `<section class="archive-year"><h2>${esc(y)}</h2>${arr.map(p => `<a href="/post/${escAttr(p.slug)}"><span>${p.is_pinned ? '📌 ' : ''}${esc(p.title)}</span><small>${esc(String(p.created_at).slice(5, 10))} · ${p.view_count} 阅读</small></a>`).join('')}</section>`).join('');
  res.send(layout('归档', `${nav('/archive')}<main class="container page"><h1>文章归档</h1><p class="muted">共 ${posts.length} 篇文章</p>${html || '<div class="empty">暂无文章。</div>'}</main><footer>${esc(site().footer)}</footer>`));
});

app.get('/about', (_req, res) => {
  const s = site();
  res.send(layout('关于', `${nav('/about')}<main class="container page narrow"><h1>关于本站</h1><div class="panel prose"><p><strong>${esc(s.name)}</strong> 是一个面向长期写作的个人博客。</p><h2>站点特性</h2><ul><li>清爽响应式界面</li><li>Markdown 写作</li><li>代码高亮</li><li>分类、标签与归档</li><li>评论与后台管理</li></ul><h2>技术栈</h2><p>Node.js / Express / SQLite / 原生前端。</p></div></main><footer>${esc(s.footer)}</footer>`));
});

app.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? db.prepare('SELECT p.*,c.name category_name,c.color category_color FROM posts p LEFT JOIN categories c ON p.category_id=c.id WHERE p.is_published=1 AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?) ORDER BY p.is_pinned DESC,p.created_at DESC LIMIT 30').all(`%${q}%`, `%${q}%`, `%${q}%`) : [];
  res.send(layout('搜索', `${nav()}<main class="container page"><form class="search wide" action="/search"><input name="q" value="${escAttr(q)}" placeholder="搜索文章"><button>搜索</button></form>${q ? `<p class="muted">搜索 “${esc(q)}”，找到 ${rows.length} 篇文章。</p>` : ''}<section class="grid">${rows.length ? rows.map(postCard).join('') : '<div class="empty">未找到相关文章。</div>'}</section></main><footer>${esc(site().footer)}</footer>`));
});

app.get('/rss.xml', (_req, res) => {
  const s = site();
  const posts = db.prepare('SELECT * FROM posts WHERE is_published=1 ORDER BY created_at DESC LIMIT 30').all();
  const items = posts.map(p => `<item><title>${esc(p.title)}</title><link>${PUBLIC_BASE_URL}/post/${esc(p.slug)}</link><guid>${PUBLIC_BASE_URL}/post/${esc(p.slug)}</guid><description><![CDATA[${esc(p.excerpt || plain(p.content, 240))}]]></description><pubDate>${new Date(`${p.created_at} UTC`).toUTCString()}</pubDate></item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(s.name)}</title><link>${PUBLIC_BASE_URL}</link><description>${esc(s.description)}</description><language>zh-CN</language>${items}</channel></rss>`);
});

app.get('/sitemap.xml', (_req, res) => {
  const posts = db.prepare('SELECT slug,updated_at,created_at FROM posts WHERE is_published=1 ORDER BY created_at DESC').all();
  const base = ['/', '/archive', '/about'].map(u => `<url><loc>${PUBLIC_BASE_URL}${u}</loc><changefreq>weekly</changefreq><priority>${u === '/' ? '1.0' : '0.5'}</priority></url>`).join('');
  const urls = posts.map(p => `<url><loc>${PUBLIC_BASE_URL}/post/${esc(p.slug)}</loc><lastmod>${String(p.updated_at || p.created_at).slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base}${urls}</urlset>`);
});

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.send(layout('登录', `<main class="login"><form method="post" action="/admin/login"><h1>管理后台</h1>${req.query.error ? '<p class="alert">用户名或密码错误</p>' : ''}<input name="username" required placeholder="用户名"><input name="password" type="password" required placeholder="密码"><button>登录</button></form></main>`));
});
app.post('/admin/login', loginLimiter, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.body.username);
  if (u && bcrypt.compareSync(String(req.body.password || ''), u.password)) { req.session.isAdmin = true; req.session.userId = u.id; req.session.nickname = u.nickname; return res.redirect('/admin'); }
  res.redirect('/admin/login?error=1');
});
app.get('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
function adminNav(active) { const links = [['/admin','仪表盘','home'],['/admin/posts','文章','posts'],['/admin/posts/new','写文章','new'],['/admin/categories','分类','cats'],['/admin/comments','评论','comments'],['/admin/settings','设置','settings']]; return `<aside class="admin-side"><b>墨言后台</b>${links.map(l => `<a class="${active === l[2] ? 'on' : ''}" href="${l[0]}">${l[1]}</a>`).join('')}<a href="/" target="_blank">查看站点</a><a href="/admin/logout">退出</a></aside>`; }
function adminLayout(title, active, content) { return layout(title, `<div class="admin">${adminNav(active)}<main class="admin-main">${content}</main></div>`); }

app.get('/admin', auth, (_req, res) => {
  const stats = { posts: db.prepare('SELECT COUNT(*) c FROM posts').get().c, comments: db.prepare('SELECT COUNT(*) c FROM comments').get().c, cats: db.prepare('SELECT COUNT(*) c FROM categories').get().c, views: db.prepare('SELECT SUM(view_count) c FROM posts').get().c || 0 };
  res.send(adminLayout('仪表盘', 'home', `<h1>仪表盘</h1><div class="admin-grid"><div><b>${stats.posts}</b><span>文章</span></div><div><b>${stats.comments}</b><span>评论</span></div><div><b>${stats.cats}</b><span>分类</span></div><div><b>${stats.views}</b><span>阅读</span></div></div>`));
});

app.get('/admin/posts', auth, (_req, res) => {
  const posts = db.prepare('SELECT p.*,c.name category_name FROM posts p LEFT JOIN categories c ON p.category_id=c.id ORDER BY p.created_at DESC').all();
  const rows = posts.map(p => `<tr><td><a href="/post/${escAttr(p.slug)}" target="_blank">${esc(p.title)}</a></td><td>${p.category_name ? esc(p.category_name) : '-'}</td><td>${p.is_published ? '已发布' : '草稿'}</td><td>${p.is_pinned ? '是' : '-'}</td><td>${p.view_count}</td><td><a href="/admin/posts/${p.id}/edit">编辑</a></td></tr>`).join('');
  res.send(adminLayout('文章管理', 'posts', `<div class="admin-head"><h1>文章管理</h1><a class="btn" href="/admin/posts/new">新建文章</a></div><table><thead><tr><th>标题</th><th>分类</th><th>状态</th><th>置顶</th><th>阅读</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`));
});

function postForm(p = {}) {
  const cats = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const opts = cats.map(c => `<option value="${c.id}" ${Number(p.category_id) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<form class="admin-form" method="post" enctype="multipart/form-data"><label>标题<input name="title" required value="${escAttr(p.title || '')}"></label><label>Slug<input name="slug" value="${escAttr(p.slug || '')}" placeholder="留空自动生成"></label><label>摘要<textarea name="excerpt" rows="3">${esc(p.excerpt || '')}</textarea></label><label>封面图 URL<input name="cover_image" value="${escAttr(p.cover_image || '')}"></label><label>上传封面<input type="file" name="cover" accept="image/jpeg,image/png,image/gif,image/webp"></label><label>分类<select name="category_id"><option value="">无分类</option>${opts}</select></label><label>标签，逗号分隔<input name="tags" value="${escAttr(tagsFrom(p.tags).join(', '))}"></label><div class="checks"><label><input type="checkbox" name="is_published" ${p.is_published !== 0 ? 'checked' : ''}> 发布</label><label><input type="checkbox" name="is_pinned" ${p.is_pinned ? 'checked' : ''}> 置顶</label></div><label>正文 Markdown<textarea name="content" rows="22" required>${esc(p.content || '')}</textarea></label><button>保存</button></form>`;
}
function postPayload(req) { const tags = String(req.body.tags || '').split(/[,，]/).map(x => x.trim()).filter(Boolean); const cover = req.file ? `/uploads/${req.file.filename}` : String(req.body.cover_image || '').trim(); return { title: String(req.body.title || '').trim(), slug: slugify(req.body.slug || req.body.title), content: String(req.body.content || ''), excerpt: String(req.body.excerpt || '').trim(), cover_image: cover, category_id: req.body.category_id ? Number(req.body.category_id) : null, tags: JSON.stringify(tags), is_published: req.body.is_published ? 1 : 0, is_pinned: req.body.is_pinned ? 1 : 0 }; }
app.get('/admin/posts/new', auth, (_req, res) => res.send(adminLayout('写文章', 'new', `<h1>写文章</h1>${postForm()}`)));
app.post('/admin/posts/new', auth, upload.single('cover'), (req, res) => { const p = postPayload(req); db.prepare('INSERT INTO posts (title,slug,content,excerpt,cover_image,category_id,tags,is_published,is_pinned) VALUES (?,?,?,?,?,?,?,?,?)').run(p.title,p.slug,p.content,p.excerpt,p.cover_image,p.category_id,p.tags,p.is_published,p.is_pinned); res.redirect('/admin/posts'); });
app.get('/admin/posts/:id/edit', auth, (req, res) => { const p = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id); if (!p) return res.redirect('/admin/posts'); res.send(adminLayout('编辑文章', 'posts', `<h1>编辑文章</h1>${postForm(p)}<form method="post" action="/admin/posts/${p.id}/delete" onsubmit="return confirm('确认删除？')"><button class="danger">删除文章</button></form>`)); });
app.post('/admin/posts/:id/edit', auth, upload.single('cover'), (req, res) => { const p = postPayload(req); db.prepare('UPDATE posts SET title=?,slug=?,content=?,excerpt=?,cover_image=?,category_id=?,tags=?,is_published=?,is_pinned=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.title,p.slug,p.content,p.excerpt,p.cover_image,p.category_id,p.tags,p.is_published,p.is_pinned,req.params.id); res.redirect('/admin/posts'); });
app.post('/admin/posts/:id/delete', auth, (req, res) => { db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id); res.redirect('/admin/posts'); });

app.get('/admin/categories', auth, (_req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const rows = cats.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.slug)}</td><td><span class="swatch" style="background:${escAttr(c.color)}"></span>${esc(c.color)}</td></tr>`).join('');
  res.send(adminLayout('分类管理', 'cats', `<h1>分类管理</h1><form class="inline-form" method="post"><input name="name" required placeholder="分类名"><input name="slug" placeholder="slug"><input name="color" value="#6366f1"><button>添加</button></form><table><thead><tr><th>名称</th><th>Slug</th><th>颜色</th></tr></thead><tbody>${rows}</tbody></table>`));
});
app.post('/admin/categories', auth, (req, res) => { const name = String(req.body.name || '').trim(); if (name) db.prepare('INSERT OR IGNORE INTO categories (name,slug,color) VALUES (?,?,?)').run(name, slugify(req.body.slug || name), String(req.body.color || '#6366f1')); res.redirect('/admin/categories'); });

app.get('/admin/comments', auth, (_req, res) => { const rows = db.prepare('SELECT c.*,p.title FROM comments c LEFT JOIN posts p ON c.post_id=p.id ORDER BY c.created_at DESC').all().map(c => `<tr><td>${esc(c.author_name)}</td><td>${esc(c.title || '')}</td><td>${esc(c.content)}</td><td>${c.is_approved ? '显示' : '隐藏'}</td><td><form method="post" action="/admin/comments/${c.id}/toggle"><button>切换</button></form></td></tr>`).join(''); res.send(adminLayout('评论管理', 'comments', `<h1>评论管理</h1><table><thead><tr><th>作者</th><th>文章</th><th>内容</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`)); });
app.post('/admin/comments/:id/toggle', auth, (req, res) => { db.prepare('UPDATE comments SET is_approved=CASE is_approved WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id); res.redirect('/admin/comments'); });

app.get('/admin/settings', auth, (_req, res) => { const s = site(); res.send(adminLayout('站点设置', 'settings', `<h1>站点设置</h1><form class="admin-form" method="post"><label>站点名<input name="site_name" value="${escAttr(s.name)}"></label><label>站点描述<input name="site_description" value="${escAttr(s.description)}"></label><label>Logo 文本<input name="site_logo" value="${escAttr(s.logo)}"></label><label>页脚<input name="footer_text" value="${escAttr(s.footer)}"></label><label>每页文章数<input name="posts_per_page" type="number" min="1" max="30" value="${s.postsPerPage}"></label><hr><label>新用户名<input name="username" placeholder="留空不修改"></label><label>新密码<input name="password" type="password" placeholder="留空不修改"></label><button>保存设置</button></form>`)); });
app.post('/admin/settings', auth, (req, res) => { const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'); ['site_name','site_description','site_logo','footer_text','posts_per_page'].forEach(k => up.run(k, String(req.body[k] || ''))); if (req.body.username || req.body.password) { const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId); const username = String(req.body.username || u.username).trim(); const pass = req.body.password ? bcrypt.hashSync(String(req.body.password), 10) : u.password; db.prepare('UPDATE users SET username=?,password=? WHERE id=?').run(username, pass, u.id); } res.redirect('/admin/settings'); });

app.use((req, res) => res.status(404).send(layout('404', `${nav()}<main class="container page"><h1>404</h1><p>页面不存在。</p><a class="btn" href="/">返回首页</a></main>`)));
app.listen(PORT, () => console.log(`[blog] listening on ${PORT}`));
