// 사이트 동작: 좁은 화면 메뉴, 강의 목차(대주제·소주제) 접기, 검색 창, 오른쪽 목차, 읽은 정도 막대, 맨 위로,
// 강의 글 섹션 접기(펼친 상태로 시작, 모두 접기·펼치기), 표 가로 스크롤, 코드 색과 복사 버튼
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

  // 왼쪽 목차 접기(넓은 화면): 접은 상태를 이 브라우저에 기억해 다른 강의로 가도 남긴다(사용자 결정, 2026-10-19).
  // 그리기 전에 html.side-closed를 붙이는 일은 _layouts/default.html head의 짧은 스크립트가 한다. 저장이 막히면 이 페이지에서만 접힌다
  var root = document.documentElement;
  var sideClose = document.querySelector('.side-close'), sideOpen = document.querySelector('.side-open');
  function setSide(closed) {
    root.classList.toggle('side-closed', closed);
    if (sideClose) sideClose.setAttribute('aria-expanded', closed ? 'false' : 'true');
    if (sideOpen) sideOpen.setAttribute('aria-expanded', closed ? 'false' : 'true');
    try { if (closed) localStorage.setItem('site-side', 'closed'); else localStorage.removeItem('site-side'); } catch (e) {}
  }
  if (sideClose) sideClose.addEventListener('click', function () { setSide(true); if (sideOpen) sideOpen.focus(); });
  if (sideOpen) sideOpen.addEventListener('click', function () { setSide(false); if (sideClose) sideClose.focus(); });
  if (root.classList.contains('side-closed')) setSide(true);

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

  // 검색 창: search.json을 처음 열 때 한 번 받아 강의 제목과 대주제 이름에서 찾는다(본문은 검색 자료에 넣지 않는다)
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
    // 제목에 남은 &amp; 같은 HTML 문자 참조를 글자로 되돌린다
    var decoder = document.createElement('textarea');
    var decode = function (s) { decoder.innerHTML = s || ''; return decoder.value; };
    var load = function () {
      if (!loading) {
        loading = fetch(search.getAttribute('data-src'))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            d.forEach(function (p) { p.title = decode(p.title); });
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
        '<span class="sr-meta">' + esc([p.category, p.date].filter(Boolean).join(' · ')) + '</span></a></li>';
    };
    var render = function () {
      var q = input.value.trim();
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      active = -1;
      if (!data) { list.innerHTML = ''; label.textContent = ''; hint.textContent = '글 목록을 불러오는 중…'; return; }
      if (!terms.length) {
        list.innerHTML = data.slice(0, 6).map(function (p) { return item(p, []); }).join('');
        label.textContent = data.length ? '강의 목록' : '';
        hint.textContent = data.length ? '' : '아직 글이 없습니다.';
        return;
      }
      var found = [];
      data.forEach(function (p) {
        var title = p.title.toLowerCase(), cat = (p.category || '').toLowerCase(), score = 0;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i], a = title.indexOf(t) !== -1, b = cat.indexOf(t) !== -1;
          if (!a && !b) return;
          score += (a ? 10 : 0) + (b ? 3 : 0);
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
  // 강의 글 본문(_layouts/lecture.html의 .post 안). 대주제 화면의 안내 글에는 섹션과 접기를 만들지 않는다
  var lecture = article && article.closest('.post') ? article : null;

  // 본문 첫 '# 제목'이 글 제목과 같으면 지워 제목이 두 번 보이지 않게 한다
  var postTitle = document.querySelector('.post-title');
  if (lecture && postTitle) {
    var first = lecture.firstElementChild;
    if (first && first.tagName === 'H1' && first.textContent.trim() === postTitle.textContent.trim()) first.remove();
  }

  // 섹션: 본문에서 가장 큰 제목 단계의 제목마다, 그 제목부터 다음 같은 단계 제목 앞까지를 section.sx-sec으로 묶는다.
  // 제목은 머리(.sx-head)에 두고 나머지는 접는 상자(.sx-body)에 넣는다. 모두 펼친 상태로 시작하고, 머리 오른쪽 버튼이나 머리를 누르면 하나씩 접고 편다.
  // 글 front matter에 page_style이 있으면(.sx) 제목 앞에 0부터 번호를 붙이고, 캡처와 ①② 단계를 묶는다(모양은 assets/css/styles/<이름>.css).
  var folds = [];
  var foldAll = document.querySelector('.fold-all');
  function setFold(sec, open) {
    sec.classList.toggle('sx-closed', !open);
    sec._body.style.height = '';
    sec._fold.setAttribute('aria-expanded', open ? 'true' : 'false');
    sec._fold.querySelector('.sx-fold-label').textContent = open ? '접기' : '펼치기';
  }
  function syncFoldAll() {
    if (!foldAll) return;
    var anyOpen = folds.some(function (s) { return !s.classList.contains('sx-closed'); });
    foldAll.textContent = anyOpen ? '모두 접기' : '모두 펼치기';
    foldAll.setAttribute('aria-pressed', anyOpen ? 'false' : 'true');
  }
  function toggleFold(sec) {
    var body = sec._body, opening = sec.classList.contains('sx-closed');
    var start = body.offsetHeight;
    setFold(sec, opening);
    var end = opening ? body.scrollHeight : 0;
    if (!opening) sec.classList.remove('sx-closed');
    body.style.height = start + 'px';
    requestAnimationFrame(function () { body.style.height = end + 'px'; });
    setTimeout(function () {
      if (!opening) sec.classList.add('sx-closed');
      body.style.height = '';
    }, 280);
    if (foldAll) setTimeout(syncFoldAll, 300);
  }
  if (lecture) {
    var isHead = function (el) { return /^H[1-4]$/.test(el.tagName); };
    var levels = Array.prototype.filter.call(lecture.children, isHead).map(function (h) { return +h.tagName.charAt(1); });
    var secLv = Math.min.apply(null, levels);
    var styled = lecture.classList.contains('sx');
    var sec = null;
    Array.prototype.slice.call(lecture.children).forEach(function (el) {
      if (isHead(el) && +el.tagName.charAt(1) === secLv) {
        sec = document.createElement('section'); sec.className = 'sx-sec';
        lecture.insertBefore(sec, el);
        el.classList.add('sx-h');
        if (styled) {
          var num = document.createElement('span'); num.className = 'sx-num'; num.textContent = folds.length + '.';
          el.insertBefore(document.createTextNode(' '), el.firstChild);
          el.insertBefore(num, el.firstChild);
        }
        var head = document.createElement('div'); head.className = 'sx-head';
        var text = document.createElement('div'); text.className = 'sx-head-text';
        text.appendChild(el); head.appendChild(text);
        var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'sx-fold';
        fold.innerHTML = '<span class="sx-fold-label"></span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        head.appendChild(fold);
        var body = document.createElement('div'); body.className = 'sx-body';
        sec.appendChild(head); sec.appendChild(body);
        sec._body = body; sec._fold = fold;
        (function (s) {
          fold.addEventListener('click', function (e) { e.stopPropagation(); toggleFold(s); });
          head.addEventListener('click', function (e) { if (!e.target.closest('a, button')) toggleFold(s); });
        })(sec);
        setFold(sec, true);
        folds.push(sec);
        return;
      }
      if (sec) sec._body.appendChild(el);
    });

    if (styled) {
      // 캡처: 이미지 하나뿐인 문단(![캡션](그림))은 그림과 캡션(alt)으로, 아직 그림이 없는 자리 표시 문단
      // ([화면 캡처: 이름 — 설명], [삽화: 이름 — 설명. 프롬프트: 경로] 다음 줄 ▲ 캡션)은 그림 틀로 만든다. 삽화 자리의 프롬프트 경로는 제작용이라 보이지 않는다. 바로 뒤의 ①② 단계 문단은 같은 묶음(.sx-group)에 넣는다
      var stepMark = function (el) {
        var t = el && el.tagName === 'P' && el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue.replace(/^\s+/, '') : '';
        return /^[①-⑳]/.test(t) ? t.charAt(0) : null;
      };
      var isCap = function (el) { return el && el.tagName === 'P' && el.textContent.trim().charAt(0) === '▲'; };
      var capText = function (h) { return h.replace(/^\s*(▲|&#9650;)\s*/, ''); };
      var makeSteps = function (firstStep) {
        var ol = document.createElement('ol'); ol.className = 'sx-steps';
        var p = firstStep;
        while (p && stepMark(p)) {
          var next = p.nextElementSibling, mark = stepMark(p), li = document.createElement('li');
          var n = document.createElement('span'); n.className = 'sx-n'; n.textContent = mark; n.setAttribute('data-d', String(mark.charCodeAt(0) - 0x245F));
          p.firstChild.nodeValue = p.firstChild.nodeValue.replace(/^\s*[①-⑳]\s*/, '');
          var txt = document.createElement('div'); txt.className = 'sx-text'; txt.innerHTML = p.innerHTML;
          li.appendChild(n); li.appendChild(txt); ol.appendChild(li); p.remove(); p = next;
        }
        return ol;
      };
      var shot = function (p) {
        var img = p.children.length === 1 && p.firstElementChild.tagName === 'IMG' && p.textContent.trim() === '' ? p.firstElementChild : null;
        var m = !img && p.innerHTML.match(/^\s*\[(화면 캡처|인포그래픽|이미지|삽화): ([^\s—]+)\s*—\s*([\s\S]*?)\]\s*(?:\n\s*((?:▲|&#9650;)[\s\S]*))?$/);
        if (!img && !m) return null;
        var fig = document.createElement('figure'); fig.className = 'sx-shot';
        var cap = document.createElement('figcaption');
        if (img) {
          fig.classList.add('sx-img'); fig.appendChild(img);
          cap.textContent = img.getAttribute('alt') || '';
        } else {
          fig.innerHTML = '<div class="sx-frame"><span class="sx-kind">' + m[1] + '</span><span class="sx-id">' + m[2] + '</span><span class="sx-desc">' + m[3].replace(/\s*프롬프트:\s*[^\s<]+\s*$/, '') + '</span></div>';
          if (m[4]) cap.innerHTML = capText(m[4]);
        }
        var after = p.nextElementSibling;
        if (isCap(after)) { cap.innerHTML = capText(after.innerHTML); after.remove(); }
        if (cap.textContent.trim()) fig.appendChild(cap);
        return fig;
      };
      lecture.querySelectorAll('.sx-body > p').forEach(function (p) {
        if (!p.isConnected) return;
        var fig = shot(p);
        if (!fig) return;
        var group = document.createElement('div'); group.className = 'sx-group';
        p.parentNode.insertBefore(group, p);
        group.appendChild(fig);
        var after = p.nextElementSibling; p.remove();
        if (stepMark(after)) group.appendChild(makeSteps(after));
        else group.classList.add('sx-solo');
      });
      // 캡처 없이 이어지는 ①② 단계: makeSteps가 단계 문단을 지우므로, 자리 표시를 먼저 넣고 만든 목록으로 바꾼다.
      // 지운 문단 앞에 넣으려다 오류로 스크립트가 멈춰, 요약 줄과 소제목 번호가 빠진 강의가 있었다(2026-10-19)
      lecture.querySelectorAll('.sx-body > p').forEach(function (p) {
        if (!p.isConnected || !stepMark(p)) return;
        var parent = p.parentNode, spot = document.createComment('steps');
        parent.insertBefore(spot, p);
        parent.replaceChild(makeSteps(p), spot);
      });

      // 섹션 요약 줄과 소제목 번호(골든 HTML의 구조만 참고했고, 모양은 사이트의 제목과 회색 글자 그대로다):
      // 섹션의 첫 문단이 `→ `로 시작하면 섹션 제목 아래(접어도 보이는 자리)로 옮기고,
      // 섹션 안의 h3에 N.M, h4에 N.M.K 번호를 붙인다. N은 섹션 번호(0부터)다
      folds.forEach(function (s, i) {
        var first = s._body.firstElementChild;
        if (first && first.tagName === 'P' && /^\s*→\s/.test(first.textContent)) {
          first.className = 'sx-lead';
          s.querySelector('.sx-head-text').appendChild(first);
        }
        // 더 알아보기: `#### 더 알아보기: …` 제목과 그 아래 글(다음 제목 앞까지)을 번호 없는 작은 참고 글(more-note)로 묶는다.
        // 번호를 단 소제목으로 두면 본 흐름처럼 읽혀, 참고사항처럼 작게 보이게 해 달라고 사용자가 짚었다(사용자 결정, 2026-10-22)
        Array.prototype.slice.call(s._body.children).forEach(function (el) {
          if (el.tagName !== 'H4' || !/^\s*더 알아보기/.test(el.textContent)) return;
          var note = document.createElement('div'); note.className = 'more-note';
          el.parentNode.insertBefore(note, el);
          el.classList.add('more-h');
          var next = el;
          while (next && !(next !== el && /^H[1-4]$/.test(next.tagName))) {
            var after = next.nextElementSibling; note.appendChild(next); next = after;
          }
        });
        var m = 0, k = 0;
        Array.prototype.forEach.call(s._body.children, function (el) {
          if (el.tagName !== 'H3' && el.tagName !== 'H4') return;
          if (el.tagName === 'H3') { m += 1; k = 0; } else { k += 1; }
          var num = document.createElement('span'); num.className = 'sx-subnum';
          num.textContent = el.tagName === 'H3' ? i + '.' + m : i + '.' + m + '.' + k;
          el.insertBefore(document.createTextNode(' '), el.firstChild);
          el.insertBefore(num, el.firstChild);
        });
      });
    }

    // 질문: 원고의 `> **❓ 질문**` 인용은 상자로 두지 않고 말풍선 선 그림을 단 질문 줄(q-line)로 바꾼다(사용자 결정, 2026-10-19).
    // 칸 안의 Q 글자는 섹션 번호 칸(채운 칸 안의 숫자)과 같아 보여 바탕 없는 선 그림으로 바꿨다
    lecture.querySelectorAll('blockquote').forEach(function (q) {
      var p = q.firstElementChild, st = p && p.tagName === 'P' ? p.firstElementChild : null;
      if (!st || st.tagName !== 'STRONG' || p.firstChild !== st || !/^❓/.test(st.textContent.trim())) return;
      q.classList.add('q-line');
      var mark = document.createElement('span');
      mark.className = 'q-mark'; mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3.6c4.7 0 8.4 3.3 8.4 7.4s-3.7 7.4-8.4 7.4c-1 0-2-.15-2.9-.43L4.6 19.9l1.2-3.7C4.4 14.9 3.6 13 3.6 11c0-4.1 3.7-7.4 8.4-7.4z"/>' +
        '<path d="M9.9 9.1a2.2 2.2 0 0 1 4.3.6c0 1.5-2.2 1.8-2.2 3.2"/><path d="M12 15.6v.05"/></svg>';
      q.insertBefore(mark, p);
    });

    // 잇는 줄: 섹션 끝의 `> **↓ 이어서**` 인용은 상자로 두지 않고 옅은 구분선 아래 흐린 글자의 잇는 줄(go-line)로 그린다.
    // 일반 문단은 본문과, 질문 줄은 할 일과 구분되지 않아 사용자가 전용 모양을 골랐다(사용자 결정, 2026-10-26)
    lecture.querySelectorAll('blockquote').forEach(function (q) {
      var p = q.firstElementChild, st = p && p.tagName === 'P' ? p.firstElementChild : null;
      if (!st || st.tagName !== 'STRONG' || p.firstChild !== st || !/^↓/.test(st.textContent.trim())) return;
      q.classList.add('go-line');
    });

    // 대화 줄: 원고의 `- **이름:** "말"` 글머리표는 이름 칩과 다음 줄의 큰 글씨 말로 된 대화 줄(say-line)로 바꾼다.
    // 말이 본문 글씨와 같아 눈에 들어오지 않는다고 사용자가 짚었다(사용자 결정, 2026-10-22)
    lecture.querySelectorAll('li').forEach(function (li) {
      var st = li.firstElementChild;
      if (!st || st.tagName !== 'STRONG' || li.firstChild !== st || !/:$/.test(st.textContent.trim())) return;
      var rest = '';
      for (var n = st.nextSibling; n; n = n.nextSibling) rest += n.textContent;
      if (!/^\s*["“]/.test(rest)) return;
      var say = document.createElement('span');
      say.className = 'say-text';
      while (st.nextSibling) say.appendChild(st.nextSibling);
      if (say.firstChild && say.firstChild.nodeType === 3) say.firstChild.data = say.firstChild.data.replace(/^\s+/, '');
      st.textContent = st.textContent.trim().replace(/:$/, '');
      st.classList.add('say-who');
      li.classList.add('say-line');
      li.appendChild(say);
      li.parentElement.classList.add('say-list');
    });

    // 형광펜: 원고의 `==문장==`은 마크다운 변환이 글자 그대로 두므로, 코드 밖의 글자에서 찾아 형광펜(mark.hl)으로 바꾼다.
    // 굵은 글씨는 결론, 형광펜은 꼭 기억할 문장으로 쓰임을 나눈다(사용자 결정, 2026-10-22)
    var walker = document.createTreeWalker(lecture, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.data.indexOf('==') < 0 || n.parentElement.closest('pre, code') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var hlNodes = [];
    while (walker.nextNode()) hlNodes.push(walker.currentNode);
    hlNodes.forEach(function (n) {
      var parts = n.data.split(/==([^=\n]+?)==/);
      if (parts.length < 3) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (t, k) {
        if (k % 2) {
          var m = document.createElement('mark');
          m.className = 'hl';
          m.textContent = t;
          frag.appendChild(m);
        } else if (t) {
          frag.appendChild(document.createTextNode(t));
        }
      });
      n.parentNode.replaceChild(frag, n);
    });
  }
  if (foldAll && folds.length) {
    foldAll.hidden = false;
    syncFoldAll();
    foldAll.addEventListener('click', function () {
      // 화면에 보이는 맨 위 섹션 제목을 기억했다가, 접거나 편 뒤 그 제목이 같은 자리에 오게 한다.
      // 긴 섹션 중간을 읽고 있어 화면에 섹션 제목이 없으면, 읽던 섹션의 제목을 화면 맨 위(24px)에 둔다
      var anchor = null, before = 0;
      folds.forEach(function (s) {
        var r = s.querySelector('.sx-h').getBoundingClientRect();
        if (!anchor && r.bottom > 0 && r.top < window.innerHeight) { anchor = s.querySelector('.sx-h'); before = r.top; }
      });
      if (!anchor) folds.forEach(function (s) {
        var r = s.getBoundingClientRect();
        if (!anchor && r.top <= 0 && r.bottom > 0) { anchor = s.querySelector('.sx-h'); before = 24; }
      });
      var open = foldAll.textContent !== '모두 접기';
      folds.forEach(function (s) { setFold(s, open); });
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

  // 코드 색: 코드 블록의 language-<이름> class를 highlight.js 언어 이름으로 바꾼 뒤 칠하고 복사 버튼을 단다
  var langMap = { shell: 'bash', bash: 'bash', powershell: 'powershell', sql: 'sql', text: 'plaintext', claude: 'plaintext', chatgpt: 'plaintext', python: 'python', javascript: 'javascript', html: 'xml', css: 'css', json: 'json', yaml: 'yaml', csharp: 'csharp' };
  document.querySelectorAll('.article pre').forEach(function (pre) {
    var code = pre.querySelector('code');
    if (!code) return;
    var m = (code.className || '').match(/language-([\w-]+)/);
    var lang = m ? m[1] : 'text';
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

  // 오른쪽 목차: 섹션 제목(.sx-h)과 그 아래 한 단계 제목으로 만든다(섹션이 없으면 본문 제목 가운데 가장 큰 단계와 그 아래 한 단계).
  // 누른 제목이 접힌 섹션 안에 있으면 그 섹션을 먼저 펼친 뒤 이동한다.
  var toc = document.querySelector('.toc');
  var heads = [], tocLinks = [];
  if (lecture && toc) {
    heads = Array.prototype.filter.call(lecture.querySelectorAll('h1, h2, h3, h4'), function (h) {
      return h.textContent.trim();
    });
    var outer = heads.filter(function (h) { return !h.closest('.sx-body'); });
    var topLv = Math.min.apply(null, (outer.length ? outer : heads).map(function (h) { return +h.tagName.charAt(1); }));
    heads = heads.filter(function (h) { var lv = +h.tagName.charAt(1); return lv >= topLv && lv <= topLv + 1; });
    if (heads.length < 2) {
      heads = [];
      toc.closest('.post-wrap').classList.add('no-toc');
    } else {
      var ol = toc.querySelector('.toc-list');
      var group = -1;
      heads.forEach(function (h, i) {
        if (!h.id) h.id = 'section-' + (i + 1);
        var li = document.createElement('li');
        if (+h.tagName.charAt(1) > topLv) li.className = 'lv2'; else group++;
        li.setAttribute('data-group', group);
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(h.id);
        a.textContent = h.textContent.trim();
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var sec = h.closest('.sx-sec');
          if (sec && sec.classList.contains('sx-closed')) { setFold(sec, true); syncFoldAll(); }
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
      // 소제목은 지금 읽는 섹션 것만 펼친다. 섹션마다 소제목을 두면 목차가 화면보다 길어져 지금 위치가 칸 밖으로 숨기 때문이다(UR6)
      var g = tocLinks[cur].parentNode.getAttribute('data-group');
      tocLinks.forEach(function (a) {
        var li = a.parentNode;
        if (li.classList.contains('lv2')) li.classList.toggle('open', li.getAttribute('data-group') === g);
      });
      // 소제목이 많아 목차가 칸보다 길면 칸을 움직여 지금 위치 항목이 칸 안에 보이게 한다(UR6)
      var box = tocLinks[cur].closest('.toc-inner');
      if (box && box.scrollHeight > box.clientHeight) {
        var br = box.getBoundingClientRect(), ar = tocLinks[cur].getBoundingClientRect();
        if (ar.top < br.top + 56 || ar.bottom > br.bottom - 32) box.scrollTop += ar.top - br.top - box.clientHeight / 3;
      }
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
})();
