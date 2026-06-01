(() => {
  const root = document.documentElement;

  const forceCodeStyle = document.createElement('style');
  forceCodeStyle.setAttribute('data-blog-code-override', 'true');
  forceCodeStyle.textContent = `
    body pre,
    body pre.hljs,
    body main pre,
    body article pre,
    body .article pre,
    body .prose pre {
      background: linear-gradient(180deg, #fffdf8, #f8eddd) !important;
      color: #3a3028 !important;
      border: 1px solid #decbb2 !important;
      box-shadow: 0 12px 34px rgba(82,55,30,.08) !important;
      border-radius: 18px !important;
    }
    body pre code,
    body pre code.hljs,
    body code.hljs,
    body .hljs {
      background: transparent !important;
      color: #3a3028 !important;
      text-shadow: none !important;
    }
    body pre .hljs-keyword,
    body pre .hljs-selector-tag,
    body pre .hljs-built_in { color: #9a3412 !important; }
    body pre .hljs-string,
    body pre .hljs-title,
    body pre .hljs-name { color: #166534 !important; }
    body pre .hljs-number,
    body pre .hljs-literal { color: #1d4ed8 !important; }
    body pre .hljs-comment,
    body pre .hljs-quote { color: #8b7d6f !important; font-style: italic; }
  `;
  document.head.appendChild(forceCodeStyle);

  const saved = localStorage.getItem('theme');
  if (saved) root.dataset.theme = saved;
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';

  window.toggleTheme = () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
  };

  window.toggleMenu = () => {
    document.querySelector('.nav-links')?.classList.toggle('open');
  };

  const reveal = el => el.classList.add('visible');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -52px 0px' });
    document.querySelectorAll('.fade,.card,.toc,.comments').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.fade,.card,.toc,.comments').forEach(reveal);
  }

  document.querySelectorAll('pre').forEach(pre => {
    if (pre.parentElement?.classList.contains('code-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-code';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText || '';
      try {
        await navigator.clipboard.writeText(code.trimEnd());
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      } catch (_) {
        btn.textContent = '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      }
    });
    wrap.appendChild(btn);
  });

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', id);
    });
  });
})();
