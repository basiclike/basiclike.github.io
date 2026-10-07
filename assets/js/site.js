// 사이트 동작: 좁은 화면 메뉴, 강의 목차(대주제·소주제) 접기, 검색 창, 오른쪽 목차, 읽은 정도 막대, 맨 위로,
// 강의 HTML의 더보기 접은글(펼친 상태로 시작, 모두 접기·펼치기), 표 가로 스크롤, 코드 색과 복사 버튼
(function () {
  var body = document.body;

  // 좁은 화면 메뉴
  var menuBtn = document.querySelector('.menu-btn');
  var overlay = document.getElementById('overlay');
  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(!body.classList.contains('menu-open')); });
  if (overlay) overlay.addEventListener('click', function () { setMenu(false); });

  // 강의 목차 접기·펼치기: 대주제는 화살표 버튼, 소주제는 줄 전체가 버튼이다
  document.querySelectorAll('.tree-toggle, .unit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.tree-item');
      var open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var label = btn.getAttribute('aria-label');
      if (label) btn.setAttribute('aria-label', label.replace(/ (접기|펼치기)$/, open ? ' 접기' : ' 펼치기'));
    });
  });
  // 로그아웃: 잠긴 강의의 비밀번호를 이 기기에 기억해 둔 경우(StatiCrypt '기억하기')에만 버튼을 보이고, 누르면 지운다
  var logout = document.querySelector('.logout-btn');
  try {
    var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf('staticrypt') === 0; });
    if (logout && keys.length) {
      logout.hidden = false;
      logout.addEventListener('click', function () {
        keys.forEach(function (k) { localStorage.removeItem(k); });
        location.reload();
      });
    }
  } catch (e) {}
  // 지금 읽는 강의가 사이드바 목록 안에서 보이게 한다
  var curLec = document.querySelector('.lec-link.current');
  if (curLec) {
    var nav = document.querySelector('.side-nav');
    if (nav && nav.scrollHeight > nav.clientHeight) nav.scrollTop = curLec.offsetTop - nav.clientHeight / 3;
  }

  // 검색 창: search.json을 처음 열 때 한 번 받아 제목·카테고리·본문에서 찾는다
  var search = document.getElementById('search');
  var closeSearch = function () {};
  if (search) {
    var input = document.getElementById('search-input');
    var list = document.getElementById('search-results');
    var label = document.getElementById('search-label');
    var hint = document.getElementById('search-hint');
    var data = null, loading = null, active = -1, lastFocus = null;

    var esc = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    };
    var highlight = function (text, terms) {
      var lower = text.toLowerCase(), ranges = [];
      terms.forEach(function (t) {
        for (var i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + t.length)) ranges.push([i, i + t.length]);
      });
      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var out = '', pos = 0;
      ranges.forEach(function (r) {
        var start = Math.max(r[0], pos);
        if (r[1] <= start) return;
        out += esc(text.slice(pos, start)) + '<mark>' + esc(text.slice(start, r[1])) + '</mark>';
        pos = r[1];
      });
      return out + esc(text.slice(pos));
    };
    var snippet = function (text, terms) {
      var lower = text.toLowerCase(), at = -1;
      terms.forEach(function (t) { var i = lower.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; });
      if (at === -1) return '';
      var start = Math.max(0, at - 40);
      return (start > 0 ? '…' : '') + text.slice(start, start + 150) + (start + 150 < text.length ? '…' : '');
    };
    // 본문 글자에 남은 &nbsp; 같은 HTML 문자 참조를 글자로 되돌린다
    var decoder = document.createElement('textarea');
    var decode = function (s) { decoder.innerHTML = s || ''; return decoder.value; };
    var load = function () {
      if (!loading) {
        loading = fetch(search.getAttribute('data-src'))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            d.forEach(function (p) { p.title = decode(p.title); p.text = decode(p.text).replace(/\s+/g, ' '); });
            data = d;
          }, function () { data = []; });
      }
      return loading;
    };
    var setActive = function (i) {
      var items = list.children;
      if (!items.length) return;
      if (items[active]) items[active].classList.remove('active');
      active = (i + items.length) % items.length;
      items[active].classList.add('active');
      items[active].scrollIntoView({ block: 'nearest' });
    };
    var item = function (p, terms) {
      return '<li><a href="' + esc(p.url) + '"><span class="sr-title">' + highlight(p.title, terms) + '</span>' +
        '<span class="sr-meta">' + esc([p.category, p.date].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="sr-snippet">' + highlight(snippet(p.text || '', terms), terms) + '</span></a></li>';
    };
    var render = function () {
      var q = input.value.trim();
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      active = -1;
      if (!data) { list.innerHTML = ''; label.textContent = ''; hint.textContent = '글 목록을 불러오는 중…'; return; }
      if (!terms.length) {
        list.innerHTML = data.slice(0, 6).map(function (p) { return item(p, []); }).join('');
        label.textContent = data.length ? '최근 글' : '';
        hint.textContent = data.length ? '' : '아직 글이 없습니다.';
        return;
      }
      var found = [];
      data.forEach(function (p) {
        var title = p.title.toLowerCase(), cat = (p.category || '').toLowerCase(), text = (p.text || '').toLowerCase(), score = 0;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i], a = title.indexOf(t) !== -1, b = cat.indexOf(t) !== -1, c = text.indexOf(t) !== -1;
          if (!a && !b && !c) return;
          score += (a ? 10 : 0) + (b ? 3 : 0) + (c ? 1 : 0);
        }
        found.push({ p: p, score: score });
      });
      found.sort(function (x, y) { return y.score - x.score; });
      list.innerHTML = found.slice(0, 20).map(function (r) { return item(r.p, terms); }).join('');
      label.textContent = found.length ? '검색 결과 ' + found.length + '개' : '';
      hint.textContent = found.length ? '' : '“' + q + '”에 맞는 글이 없습니다.';
      if (found.length) setActive(0);
    };
    var openSearch = function () {
      lastFocus = document.activeElement;
      setMenu(false);
      search.hidden = false;
      body.classList.add('search-open');
      input.value = '';
      render();
      input.focus();
      load().then(render);
    };
    closeSearch = function () {
      if (search.hidden) return;
      search.hidden = true;
      body.classList.remove('search-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    document.querySelectorAll('.search-open').forEach(function (b) { b.addEventListener('click', openSearch); });
    search.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', closeSearch); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        var a = list.children[active] && list.children[active].querySelector('a');
        if (a) { e.preventDefault(); location.href = a.href; }
      }
    });
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (search.hidden) openSearch();
      }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSearch(); setMenu(false); }
  });

  var article = document.getElementById('article');

  // 마크다운 노트 첫 줄의 '# 제목'이 글 제목과 같으면 숨겨 제목이 두 번 보이지 않게 한다
  var postTitle = document.querySelector('.post-title');
  if (article && postTitle && article.classList.contains('md')) {
    var first = article.firstElementChild;
    if (first && first.tagName === 'H1' && first.textContent.trim() === postTitle.textContent.trim()) first.remove();
  }

  // 더보기 접은글: 강의 HTML의 div[data-ke-type="moreLess"] 구조를 그대로 쓴다.
  // 모두 펼친 상태로 시작하고, 하나씩 접거나 제목 아래 '모두 접기' 버튼으로 한꺼번에 접고 편다.
  var folds = [];
  var foldAll = document.querySelector('.fold-all');
  function setFold(box, open) {
    box.classList.toggle('open', open);
    box.style.height = '';
    box._btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function syncFoldAll() {
    if (!foldAll) return;
    var anyOpen = folds.some(function (b) { return b.classList.contains('open'); });
    foldAll.textContent = anyOpen ? '모두 접기' : '모두 펼치기';
    foldAll.setAttribute('aria-pressed', anyOpen ? 'false' : 'true');
  }
  document.querySelectorAll('div[data-ke-type="moreLess"]').forEach(function (box) {
    var btn = box.querySelector('.btn-toggle-moreless');
    var content = box.querySelector('.moreless-content');
    if (!btn || !content) return;
    box._btn = btn;
    btn.removeAttribute('href');
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    setFold(box, true);
    folds.push(box);
    function toggle() {
      var opening = !box.classList.contains('open');
      var start = box.offsetHeight;
      box.classList.toggle('open', opening);
      var end = box.scrollHeight;
      if (!opening) { box.classList.add('open'); end = btn.offsetHeight; }
      box.style.height = start + 'px';
      requestAnimationFrame(function () { box.style.height = end + 'px'; });
      setTimeout(function () {
        if (!opening) box.classList.remove('open');
        box.style.height = '';
      }, 280);
      btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (foldAll) setTimeout(syncFoldAll, 300);
    }
    btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
  if (foldAll && folds.length) {
    foldAll.hidden = false;
    syncFoldAll();
    foldAll.addEventListener('click', function () {
      // 지금 화면 맨 위에 보이는 절 제목을 기억했다가, 접거나 편 뒤 그 제목이 같은 자리에 오게 한다
      var anchor = null;
      document.querySelectorAll('.article h1, .article h2').forEach(function (h) {
        if (!anchor && h.getBoundingClientRect().bottom > 0 && !h.closest('div[data-ke-type="moreLess"]')) anchor = h;
      });
      var before = anchor ? anchor.getBoundingClientRect().top : 0;
      var open = foldAll.textContent !== '모두 접기';
      folds.forEach(function (b) { setFold(b, open); });
      syncFoldAll();
      if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
    });
  }

  // 표를 가로 스크롤 상자로 감싼다
  document.querySelectorAll('.article table').forEach(function (t) {
    if (t.parentElement.classList.contains('table-wrap')) return;
    var w = document.createElement('div');
    w.className = 'table-wrap';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });

  // 코드 색: 강의 HTML의 data-ke-language를 highlight.js 언어 이름으로 바꾼 뒤 칠하고 복사 버튼을 단다
  var langMap = { shell: 'bash', bash: 'bash', powershell: 'powershell', sql: 'sql', text: 'plaintext', claude: 'plaintext', chatgpt: 'plaintext', python: 'python', javascript: 'javascript', html: 'xml', css: 'css', json: 'json', yaml: 'yaml', csharp: 'csharp' };
  document.querySelectorAll('.article pre').forEach(function (pre) {
    var code = pre.querySelector('code');
    if (!code) return;
    var lang = pre.getAttribute('data-ke-language');
    if (!lang) {
      var m = (code.className || '').match(/language-([\w-]+)/);
      lang = m ? m[1] : 'text';
    }
    code.className = 'language-' + (langMap[lang] || lang);
    if (window.hljs) { try { window.hljs.highlightElement(code); } catch (err) {} }

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = '복사';
    copy.addEventListener('click', function () {
      var text = code.innerText.replace(/\n$/, '');
      var done = function () {
        copy.textContent = '복사됨';
        copy.classList.add('done');
        setTimeout(function () { copy.textContent = '복사'; copy.classList.remove('done'); }, 1500);
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) {}
        ta.remove();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
    pre.appendChild(copy);
  });

  // 오른쪽 목차: 접은글 밖 제목 가운데 가장 큰 단계와 그 아래 한 단계(접은글 안의 작은 제목 포함)로 만든다.
  // 누른 제목이 접힌 접은글 안에 있으면 그 접은글을 먼저 펼친 뒤 이동한다.
  var toc = document.querySelector('.toc');
  var heads = [], tocLinks = [];
  if (article && toc) {
    heads = Array.prototype.filter.call(article.querySelectorAll('h1, h2, h3'), function (h) {
      return h.textContent.trim();
    });
    var outer = heads.filter(function (h) { return !h.closest('div[data-ke-type="moreLess"]'); });
    var top = Math.min.apply(null, (outer.length ? outer : heads).map(function (h) { return +h.tagName.charAt(1); }));
    heads = heads.filter(function (h) { return +h.tagName.charAt(1) <= top + 1; });
    if (heads.length < 2) {
      heads = [];
      toc.closest('.post-wrap').classList.add('no-toc');
    } else {
      var ol = toc.querySelector('.toc-list');
      heads.forEach(function (h, i) {
        if (!h.id) h.id = 'section-' + (i + 1);
        var li = document.createElement('li');
        if (+h.tagName.charAt(1) > top) li.className = 'lv2';
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(h.id);
        a.textContent = h.textContent.trim();
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var box = h.closest('div[data-ke-type="moreLess"]');
          if (box && box._btn && !box.classList.contains('open')) { setFold(box, true); syncFoldAll(); }
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (history.replaceState) history.replaceState(null, '', '#' + encodeURIComponent(h.id));
          setMenu(false);
        });
        li.appendChild(a);
        ol.appendChild(li);
        tocLinks.push(a);
      });
    }
  }

  // 스크롤: 읽은 정도 막대, 맨 위로 버튼, 목차의 지금 위치
  var bar = document.querySelector('.progress span');
  var toTop = document.querySelector('.to-top');
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    if (toTop) toTop.classList.toggle('show', y > 600);
    if (tocLinks.length) {
      var cur = 0;
      heads.forEach(function (h, i) { if (h.offsetParent !== null && h.getBoundingClientRect().top < 140) cur = i; });
      tocLinks.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
})();
