/* 화면 테마: 헥사(기본), 문서, 다크. 사이드바 아래의 버튼(.theme-opt)으로 고르고, 고른 값은 이 브라우저에 저장해 유지한다.
   로그아웃 버튼을 누르면 저장한 테마도 지워 헥사로 돌아간다. 그리기 전에 테마를 붙이는 일은 _layouts/default.html head의 짧은 스크립트가 한다. */
(function () {
  var KEY = 'site-theme', THEMES = ['hex', 'paper', 'dark'], root = document.documentElement;

  function current() { return root.getAttribute('data-theme') || 'hex'; }
  function mark() {
    document.querySelectorAll('.theme-opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-value') === current()));
    });
  }
  function apply(t) {
    if (THEMES.indexOf(t) < 0) t = 'hex';
    root.setAttribute('data-theme', t);
    try { if (t === 'hex') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {}
    mark();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.theme-opt');
    if (b) apply(b.getAttribute('data-theme-value'));
  });
  // site.js의 로그아웃(비밀번호를 지우고 다시 연다)보다 먼저 테마를 지운다
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.logout-btn')) {
      try { localStorage.removeItem(KEY); } catch (err) {}
    }
  }, true);
  mark();
})();
