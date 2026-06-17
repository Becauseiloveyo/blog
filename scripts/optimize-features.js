const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

const loginGet = "app.get('/login',(req,res)=>{ const next=escAttr(req.query.next||'/dashboard'); const body=nav('/login')+'<main class=\"login\"><form method=\"post\" action=\"/login\"><h1>登录</h1><p class=\"muted\">管理员会自动进入后台，普通用户进入个人中心。</p><input name=\"username\" required placeholder=\"用户名\"><input name=\"password\" type=\"password\" required placeholder=\"密码\"><input type=\"hidden\" name=\"next\" value=\"'+next+'\"><button>登录</button><p class=\"muted\"><a href=\"/register\">注册普通账号</a> · <a href=\"/admin/login\">后台入口</a></p></form></main>'; res.send(layout('登录',body)); });";
const loginPost = "app.post('/login',loginLimiter,(req,res)=>{ const u=db.prepare(\"SELECT * FROM users WHERE username=?\").get(req.body.username); if(!u||!bcrypt.compareSync(String(req.body.password||''),u.password)) return res.redirect('/login?error=1'); req.session.userId=u.id; req.session.nickname=u.nickname; if((u.role||'admin')==='admin'){ req.session.isAdmin=true; return res.redirect('/admin'); } res.redirect(req.body.next||'/dashboard'); });";

s = s.replace(/app\.get\('\/login',\(req,res\)=>\{[^\n]*?\}\);/, loginGet);
s = s.replace(/app\.post\('\/login',loginLimiter,\(req,res\)=>\{[^\n]*?\}\);/, loginPost);

const dashboard = "app.get('/dashboard',userAuth,(req,res)=>{ const rows=db.prepare('SELECT * FROM posts WHERE author_id=? ORDER BY created_at DESC').all(req.session.userId); const html=rows.map(p=>'<tr><td><a href=\"/post/'+escAttr(p.slug)+'\">'+esc(p.title)+'</a></td><td>'+p.view_count+'</td><td>'+esc(String(p.created_at).slice(0,10))+'</td><td><a href=\"/dashboard/posts/'+p.id+'/edit\">编辑</a><form style=\"display:inline;margin-left:10px\" method=\"post\" action=\"/dashboard/posts/'+p.id+'/delete\" onsubmit=\"return confirm(\\\'确认删除这篇文章？\\\')\"><button>删除</button></form></td></tr>').join(''); const body=nav('/dashboard')+'<main class=\"container page\"><h1>我的博客</h1><p class=\"muted\">管理自己发布的文章。站点后台请进入 /admin。</p><p><a class=\"btn\" href=\"/write\">发布新博客</a> <a class=\"btn\" href=\"/user/logout\">退出登录</a></p><table><thead><tr><th>标题</th><th>阅读</th><th>时间</th><th>操作</th></tr></thead><tbody>'+(html||'<tr><td colspan=\"4\">暂无文章</td></tr>')+'</tbody></table></main><footer>'+esc(site().footer)+'</footer>'; res.send(layout('我的博客',body)); });";
s = s.replace(/app\.get\('\/dashboard',userAuth,\(req,res\)=>\{[^\n]*?\}\);/, dashboard);

if (!s.includes('USER_POST_EDIT_V1')) {
  const editRoutes = [
    "// USER_POST_EDIT_V1",
    "app.get('/dashboard/posts/:id/edit',userAuth,(req,res)=>{ const p=db.prepare('SELECT * FROM posts WHERE id=? AND author_id=?').get(req.params.id,req.session.userId); if(!p) return res.redirect('/dashboard'); const cats=db.prepare('SELECT * FROM categories ORDER BY name').all(); const opts=cats.map(c=>'<option value=\"'+c.id+'\" '+(Number(p.category_id)===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join(''); const body=nav('/dashboard')+'<main class=\"container page narrow\"><h1>编辑文章</h1><form class=\"admin-form\" method=\"post\" action=\"/dashboard/posts/'+p.id+'/edit\"><label>标题<input name=\"title\" required value=\"'+escAttr(p.title||'')+'\"></label><label>摘要<textarea name=\"excerpt\" rows=\"3\">'+esc(p.excerpt||'')+'</textarea></label><label>分类<select name=\"category_id\">'+opts+'</select></label><label>标签<input name=\"tags\" value=\"'+escAttr(tagsFrom(p.tags).join(', '))+'\"></label><label>正文<textarea name=\"content\" rows=\"18\" required>'+esc(p.content||'')+'</textarea></label><button>保存修改</button></form></main><footer>'+esc(site().footer)+'</footer>'; res.send(layout('编辑文章',body)); });",
    "app.post('/dashboard/posts/:id/edit',userAuth,(req,res)=>{ const old=db.prepare('SELECT * FROM posts WHERE id=? AND author_id=?').get(req.params.id,req.session.userId); if(!old) return res.redirect('/dashboard'); const tags=String(req.body.tags||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean); db.prepare('UPDATE posts SET title=?,content=?,excerpt=?,category_id=?,tags=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND author_id=?').run(String(req.body.title||'').trim(),String(req.body.content||''),String(req.body.excerpt||'').trim(),req.body.category_id?Number(req.body.category_id):null,JSON.stringify(tags),req.params.id,req.session.userId); res.redirect('/dashboard'); });",
    "app.post('/dashboard/posts/:id/delete',userAuth,(req,res)=>{ db.prepare('DELETE FROM posts WHERE id=? AND author_id=?').run(req.params.id,req.session.userId); res.redirect('/dashboard'); });"
  ].join('\n');
  s = s.replace("app.get('/recommend'", editRoutes + "\napp.get('/recommend'");
}

if (!s.includes('COURSE_FEATURES_NAV_OPTIMIZED_V1')) {
  s = s.replace(/function nav\(active = ''\) \{[\s\S]*?\nfunction layout/, "function nav(active = '') { const siteInfo = site(); const a = p => active === p ? 'active' : ''; return '<nav class=\"nav\"><div class=\"nav-inner\"><a class=\"brand\" href=\"/\"><span>'+esc(siteInfo.logo)+'</span><b>'+esc(siteInfo.name)+'</b></a><button class=\"menu-btn\" onclick=\"toggleMenu()\">☰</button><div class=\"nav-links\"><a class=\"'+a('/')+'\" href=\"/\">首页</a><a class=\"'+a('/posts')+'\" href=\"/posts\">文章</a><a class=\"'+a('/recommend')+'\" href=\"/recommend\">推荐</a><a class=\"'+a('/archive')+'\" href=\"/archive\">归档</a><a class=\"'+a('/about')+'\" href=\"/about\">关于</a><a class=\"'+a('/write')+'\" href=\"/write\">写文章</a><a class=\"'+a('/dashboard')+'\" href=\"/dashboard\">我的</a><a class=\"'+a('/login')+'\" href=\"/login\">登录</a><button class=\"theme-btn\" onclick=\"toggleTheme()\">明暗</button></div></div></nav>'; }\n// COURSE_FEATURES_NAV_OPTIMIZED_V1\nfunction layout");
}

s = s.replace(/对应 6-[1-6][^<。]*。/g, '');
s = s.replace(/查看和管理自己发布的博客。/g, '管理自己发布的文章。');
s = s.replace(/博客管理/g, '我的博客');
s = s.replace(/博客列表/g, '文章列表');
s = s.replace(/博客发布/g, '写文章');

fs.writeFileSync(serverPath, s);
console.log('features optimized');
