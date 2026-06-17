const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

const replacements = [
  [/<p class=\"muted\">管理员会自动进入后台，普通用户进入个人中心。<\/p>/g, ''],
  [/<p class=\"muted\">全部已发布文章。<\/p>/g, ''],
  [/<p class=\"muted\">发布一篇新的博客文章。<\/p>/g, ''],
  [/<p class=\"muted\">管理自己发布的文章。站点后台请进入 \/admin。<\/p>/g, ''],
  [/<p class=\"muted\">管理自己发布的文章。<\/p>/g, ''],
  [/<p class=\"muted\">查看和管理自己发布的博客。<\/p>/g, ''],
  [/<p class=\"muted\">对应 6-[1-6][^<]*<\/p>/g, ''],
  [/对应 6-[1-6][^<。]*。/g, ''],
  [/全部已发布文章。/g, ''],
  [/发布一篇新的博客文章。/g, ''],
  [/查看和管理自己发布的博客。/g, ''],
  [/管理自己发布的文章。/g, '']
];

for (const [pattern, value] of replacements) {
  s = s.replace(pattern, value);
}

// Remove the visible recommendation explanation box while keeping the recommendation algorithm active.
s = s.replace(/<h1>智能推荐<\/h1><div class=\"report-page-note\">'\+note\+'<\/div><section/g, '<h1>智能推荐</h1><section');
s = s.replace(/<h1>智能推荐<\/h1><div class=\"report-page-note\">\$\{note\}<\/div><section/g, '<h1>智能推荐</h1><section');
s = s.replace(/<h1>智能推荐<\/h1><div class=\"report-page-note\">[^<]*<\/div><section/g, '<h1>智能推荐</h1><section');

// Make navigation names shorter and less classroom-like.
s = s.replace(/博客列表/g, '文章');
s = s.replace(/博客发布/g, '写文章');
s = s.replace(/博客管理/g, '我的');

fs.writeFileSync(serverPath, s);
console.log('public copy cleaned');
