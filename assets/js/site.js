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

  // 강의 목차 접기·펼치기: 지금 대주제는 화살표 버튼, 소주제는 줄 전체가 버튼이다. 다른 대주제의 화살표는 링크라 건드리지 않는다
  document.querySelectorAll('button.tree-toggle, .unit-btn').forEach(function (btn) {
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
  // 사이드바 목록을 내려 강의 글에서는 지금 강의를 위에서 1/3쯤에, 대주제 화면에서는 지금 대주제를 위쪽에 보인다
  var sideNav = document.querySelector('.side-nav');
  var curItem = sideNav && sideNav.querySelector('.lec-link.current, .tree-link.current');
  if (curItem && sideNav.scrollHeight > sideNav.clientHeight) {
    var itemTop = curItem.getBoundingClientRect().top - sideNav.getBoundingClientRect().top + sideNav.scrollTop;
    sideNav.scrollTop = itemTop - (curItem.classList.contains('lec-link') ? sideNav.clientHeight / 3 : 48);
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

  // 스타일 예시(글 front matter page_style): 강의 HTML은 그대로 두고, 스타일 CSS가 고를 수 있게 구조에 class를 붙인다.
  // 섹션(h1부터 다음 h1 앞까지)을 section.sx-sec으로 묶고, 캡처 자리와 캡션, 이어지는 ①② 단계를 div.sx-group으로 묶는다.
  if (article && article.classList.contains('sx')) {
    var isBlank = function (el) { return el.tagName === 'P' && el.textContent.replace(/ /g, '').trim() === ''; };
    var isShot = function (el) { return el && el.tagName === 'P' && /^\[(화면 캡처|인포그래픽|이미지): /.test(el.textContent.trim()); };
    var isCap = function (el) { return el && el.tagName === 'P' && el.textContent.trim().charAt(0) === '▲'; };
    var stepMark = function (el) { var s = el && el.tagName === 'P' && el.querySelector(':scope > b:first-child > span'); return s && /^[①-⑳]$/.test(s.textContent) ? s : null; };
    article.querySelectorAll('p').forEach(function (p) { if (isBlank(p)) p.remove(); });
    var sec = null;
    Array.prototype.slice.call(article.children).forEach(function (el) {
      if (el.tagName === 'H1') {
        sec = document.createElement('section'); sec.className = 'sx-sec';
        article.insertBefore(sec, el);
        var num = el.querySelector('span'); if (num) num.classList.add('sx-num');
      }
      if (sec) sec.appendChild(el);
      if (el.tagName === 'P' && el.getAttribute('data-ke-size') === 'size14' && el.previousElementSibling && el.previousElementSibling.tagName === 'H1') el.classList.add('sx-sum');
    });
    var makeSteps = function (first) {
      var ol = document.createElement('ol'); ol.className = 'sx-steps';
      var p = first;
      while (p && stepMark(p)) {
        var next = p.nextElementSibling, mark = stepMark(p), li = document.createElement('li');
        var n = document.createElement('span'); n.className = 'sx-n'; n.textContent = mark.textContent; n.setAttribute('data-d', String(mark.textContent.charCodeAt(0) - 0x245F));
        mark.parentNode.remove();
        var body = document.createElement('div'); body.className = 'sx-text'; body.innerHTML = p.innerHTML.replace(/^\s+/, '');
        li.appendChild(n); li.appendChild(body); ol.appendChild(li); p.remove(); p = next;
      }
      return ol;
    };
    article.querySelectorAll('p').forEach(function (p) {
      if (!p.isConnected || !isShot(p)) return;
      var m = p.innerHTML.match(/^\s*\[(화면 캡처|인포그래픽|이미지): ([^\s—]+)\s*—\s*([\s\S]*)\]\s*$/);
      var group = document.createElement('div'); group.className = 'sx-group';
      var fig = document.createElement('figure'); fig.className = 'sx-shot';
      fig.innerHTML = '<div class="sx-frame"><span class="sx-kind">' + (m ? m[1] : '') + '</span><span class="sx-id">' + (m ? m[2] : '') + '</span><span class="sx-desc">' + (m ? m[3] : p.innerHTML) + '</span></div>';
      p.parentNode.insertBefore(group, p);
      group.appendChild(fig);
      var after = p.nextElementSibling; p.remove();
      if (isCap(after)) {
        var cap = document.createElement('figcaption'); cap.innerHTML = after.innerHTML.replace(/^\s*(▲|&#9650;)\s*/, '');
        fig.appendChild(cap); var a2 = after.nextElementSibling; after.remove(); after = a2;
      }
      if (stepMark(after)) group.appendChild(makeSteps(after));
      else group.classList.add('sx-solo');
    });
    article.querySelectorAll('p').forEach(function (p) {
      if (p.isConnected && stepMark(p)) p.parentNode.insertBefore(makeSteps(p), p);
    });
    // 접고 펴기: 섹션 머리(제목과 요약 줄) 오른쪽 버튼이나 머리 전체를 누른다. 원래 '더보기' 버튼은 CSS로 숨기고 그 버튼의 동작을 그대로 쓴다.
    // 숨긴 버튼의 높이가 0이라 접힌 상자의 높이도 0이 된다.
    article.querySelectorAll('.sx-sec').forEach(function (s) {
      var h = s.querySelector(':scope > h1'), box = s.querySelector(':scope > div[data-ke-type="moreLess"]');
      if (!h || !box) return;
      var orig = box.querySelector('.btn-toggle-moreless');
      var head = document.createElement('div'); head.className = 'sx-head';
      var text = document.createElement('div'); text.className = 'sx-head-text';
      s.insertBefore(head, h); head.appendChild(text); text.appendChild(h);
      var sum = s.querySelector(':scope > .sx-sum'); if (sum) text.appendChild(sum);
      var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'sx-fold';
      fold.innerHTML = '<span class="sx-fold-label"></span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.appendChild(fold);
      var sync = function () {
        var open = box.classList.contains('open');
        s.classList.toggle('sx-closed', !open);
        fold.setAttribute('aria-expanded', open ? 'true' : 'false');
        fold.querySelector('.sx-fold-label').textContent = open ? '접기' : '펼치기';
      };
      new MutationObserver(sync).observe(box, { attributes: true, attributeFilter: ['class'] });
      fold.addEventListener('click', function (e) { e.stopPropagation(); if (orig) orig.click(); });
      head.addEventListener('click', function (e) { if (!e.target.closest('a, button') && orig) orig.click(); });
      sync();
    });
  }

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
