/*
 * main.js — イントロ、リビール、スクロール連動、カーソル、各種インタラクション
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  /* ---------- 文字分割 ---------- */
  $$('[data-split]').forEach(function (el) {
    var chars = Array.from(el.textContent.trim());
    el.textContent = '';
    chars.forEach(function (ch, i) {
      var s = document.createElement('span');
      s.className = 'char';
      s.style.setProperty('--i', i);
      s.textContent = ch;
      el.appendChild(s);
    });
  });

  /* ---------- 日付の写し込み・コピーライト ---------- */
  var now = new Date();
  $('#date-stamp').textContent = "'" + String(now.getFullYear()).slice(2) + ' ' + (now.getMonth() + 1) + ' ' + now.getDate();
  $('#year').textContent = now.getFullYear();

  /* ---------- URL 未設定のリンク ---------- */
  $$('a[href="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
    a.setAttribute('aria-disabled', 'true');
    a.title = '準備中';
  });

  /* ---------- 花びら ---------- */
  var sakura = new window.Sakura({
    back: $('#petals-back'),
    front: $('#petals-front'),
    reduce: reduce
  });

  /* ---------- イントロ（絞りが開く） ---------- */
  var readyFired = false;
  function ready() {
    if (readyFired) return;
    readyFired = true;
    root.classList.add('is-ready');
    sakura.start();
  }

  function runIntro() {
    var intro = $('#intro');
    var skip = reduce || root.classList.contains('no-intro');
    if (skip) {
      intro.remove();
      ready();
      return;
    }
    try { sessionStorage.setItem('sg-intro', '1'); } catch (e) {}
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    var NS = 'http://www.w3.org/2000/svg';
    var g = $('#iris-blades');
    var blades = [];
    for (var i = 0; i < 5; i++) {
      var p = document.createElementNS(NS, 'polygon');
      g.appendChild(p);
      blades.push(p);
    }

    var L = 1600;
    function drawIris(r, theta) {
      var V = [], U = [];
      for (var k = 0; k < 5; k++) {
        var a = theta + (k * 72 - 90) * Math.PI / 180;
        U.push([Math.cos(a), Math.sin(a)]);
        V.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      for (var k2 = 0; k2 < 5; k2++) {
        var prev = U[(k2 + 4) % 5], cur = U[k2], next = U[(k2 + 1) % 5];
        var d1 = norm(cur[0] - prev[0], cur[1] - prev[1]); // 前の辺の延長（継ぎ目）
        var d2 = norm(next[0] - cur[0], next[1] - cur[1]); // この羽根の内側の辺
        var v = V[k2];
        blades[k2].setAttribute('points', [
          v[0] + ',' + v[1],
          (v[0] + d2[0] * L) + ',' + (v[1] + d2[1] * L),
          (v[0] + d1[0] * L) + ',' + (v[1] + d1[1] * L)
        ].join(' '));
      }
    }
    function norm(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

    var aspect = Math.max(innerWidth / innerHeight, innerHeight / innerWidth);
    var rEnd = (100 * Math.sqrt(1 + aspect * aspect)) / 0.809 * 1.08;
    drawIris(0, 0);

    var HOLD = 520, OPEN = 1150, start = performance.now(), done = false, flashed = false;
    function frame(t) {
      if (done) return;
      var el = t - start;
      if (el > HOLD) {
        intro.classList.add('is-opening');
        var k = clamp((el - HOLD) / OPEN, 0, 1);
        var e = easeInOut(k);
        drawIris(e * rEnd, -e * 0.95);
        if (k > 0.62 && !flashed) {
          flashed = true;
          intro.classList.add('is-flash');
          ready();
          sakura.burst(innerWidth / 2, innerHeight / 2, 26, 2.4);
          sakura.gust(1.6);
        }
        if (k >= 1) { finish(); return; }
      }
      requestAnimationFrame(frame);
    }
    function finish() {
      if (done) return;
      done = true;
      ready();
      intro.classList.add('is-done');
      setTimeout(function () { intro.remove(); }, 700);
    }
    intro.addEventListener('click', finish);
    window.addEventListener('keydown', function onKey() { finish(); window.removeEventListener('keydown', onKey); });
    requestAnimationFrame(frame);
  }

  /* ---------- リビール ---------- */
  var revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- スクロールで 昼 → 夕 → 夜 ---------- */
  var THEMES = {
    day:   { bg: [250, 246, 241], ink: [46, 38, 41],   sub: [125, 108, 114], accent: [201, 96, 122],  night: 0 },
    dusk:  { bg: [244, 221, 216], ink: [56, 38, 46],   sub: [128, 94, 104],  accent: [192, 80, 108],  night: 0.12 },
    night: { bg: [23, 18, 28],    ink: [244, 235, 238], sub: [172, 152, 162], accent: [240, 168, 188], night: 1 }
  };
  var themed = $$('[data-theme]');
  var stops = [];
  var metaTheme = $('meta[name="theme-color"]');

  function measure() {
    var y = window.scrollY;
    stops = themed.map(function (el) {
      return { top: el.getBoundingClientRect().top + y, theme: THEMES[el.dataset.theme] };
    });
  }

  function mixArr(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }

  var lastVars = '';
  function applyTheme() {
    var vh = window.innerHeight;
    var p = window.scrollY + vh * 0.62;
    var i = 0;
    for (var k = 0; k < stops.length; k++) if (stops[k].top <= p) i = k;
    var cur = stops[i].theme, prev = i > 0 ? stops[i - 1].theme : null;
    var t = 1;
    if (prev && prev !== cur) t = smooth(clamp((p - stops[i].top) / (vh * 0.5), 0, 1));
    var from = prev || cur;
    var bg = mixArr(from.bg, cur.bg, t);
    var ink = mixArr(from.ink, cur.ink, t);
    var sub = mixArr(from.sub, cur.sub, t);
    var ac = mixArr(from.accent, cur.accent, t);
    var key = bg + '|' + ink + '|' + sub + '|' + ac;
    if (key !== lastVars) {
      lastVars = key;
      root.style.setProperty('--bg-rgb', bg.join(' '));
      root.style.setProperty('--ink-rgb', ink.join(' '));
      root.style.setProperty('--sub-rgb', sub.join(' '));
      root.style.setProperty('--accent-rgb', ac.join(' '));
      root.style.colorScheme = bg[0] < 100 ? 'dark' : 'light';
      metaTheme.setAttribute('content', 'rgb(' + bg.join(',') + ')');
    }
    sakura.setNight(lerp(from.night, cur.night, t));
    var dusk = (from === THEMES.dusk ? 1 - t : 0) + (cur === THEMES.dusk ? t : 0);
    root.style.setProperty('--dusk', dusk.toFixed(3));
  }

  /* ---------- marquee（フィルムの帯） ---------- */
  var film = $('.film');
  var track = $('[data-marquee]');
  var group = $('.film__group', track);
  var edges = $$('[data-edge]');
  var filmVisible = true;
  var mx = 0, groupW = 0, edgeW = 0;

  edges.forEach(function (edge, n) {
    var html = '';
    for (var j = 0; j < 2; j++) {
      for (var f = 1; f <= 18; f++) {
        var no = n === 0 ? f : f + 'A';
        html += '<span>SAKURAGUMI 400&nbsp;&nbsp;▸ ' + no + '</span>';
      }
    }
    edge.innerHTML = html;
  });

  function layoutMarquee() {
    $$('.film__group', track).slice(1).forEach(function (el) { el.remove(); });
    groupW = group.getBoundingClientRect().width;
    var copies = Math.ceil((window.innerWidth * 1.3) / groupW) + 1;
    for (var c = 0; c < copies; c++) {
      var clone = group.cloneNode(true);
      track.appendChild(clone);
    }
    edgeW = edges[0].scrollWidth / 2;
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { filmVisible = en[0].isIntersecting; }).observe(film);
  }

  /* ---------- 暗いフィルムの帯がヘッダーの下を通るときは文字色を反転 ---------- */
  var headerY = 0;
  function measureHeader() {
    var r = $('.site-header').getBoundingClientRect();
    headerY = r.top + r.height / 2;
  }
  function filmAt(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) if (film.contains(els[i])) return true;
    return false;
  }
  function updateFilmUnderHeader() {
    var fr = film.getBoundingClientRect();
    var near = fr.top < headerY + 40 && fr.bottom > 0;
    var w = window.innerWidth;
    root.classList.toggle('film-l', near && filmAt(w * 0.08, headerY));
    root.classList.toggle('film-c', near && filmAt(w * 0.5, headerY));
    root.classList.toggle('film-r', near && filmAt(w * 0.88, headerY));
  }

  /* ---------- スクロール連動の各種 ---------- */
  var scrollVel = 0, lastScroll = window.scrollY, lastT = performance.now();
  var meter = $('.vf-meter');
  var heroMark = $('.hero__mark');
  var lastMarkY = -1;

  function onFrame(t) {
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    var y = window.scrollY;
    var v = dt > 0 ? (y - lastScroll) / dt : 0;
    lastScroll = y;
    scrollVel = lerp(scrollVel, v, 1 - Math.exp(-dt * 8));

    applyTheme();

    var max = document.documentElement.scrollHeight - window.innerHeight;
    meter.style.setProperty('--meter', max > 0 ? (y / max).toFixed(4) : 0.5);

    updateFilmUnderHeader();

    var yc = Math.min(y, window.innerHeight * 1.2);
    if (yc !== lastMarkY) {
      lastMarkY = yc;
      heroMark.style.setProperty('--mark-rot', (yc * 0.09).toFixed(2) + 'deg');
      heroMark.style.setProperty('--mark-y', (yc * 0.28).toFixed(1) + 'px');
      heroMark.style.setProperty('--mark-o', clamp(1 - yc / (window.innerHeight * 0.85), 0, 1).toFixed(3));
    }

    if (!reduce && filmVisible && groupW) {
      var speed = clamp(55 + scrollVel * 0.45, -700, 900);
      mx -= speed * dt;
      if (mx <= -groupW) mx += groupW;
      if (mx > 0) mx -= groupW;
      track.style.transform = 'translate3d(' + mx.toFixed(2) + 'px,0,0)';
      if (edgeW) {
        var ex = ((mx * 1.35) % edgeW + edgeW) % edgeW - edgeW;
        edges.forEach(function (e) { e.style.transform = 'translate3d(' + ex.toFixed(2) + 'px,0,0)'; });
      }
    }

    requestAnimationFrame(onFrame);
  }

  /* ---------- AF フレームのカーソル ---------- */
  function initCursor() {
    if (!finePointer || reduce) return;
    root.classList.add('has-cursor');
    var cursor = $('.cursor'), frame = $('.cursor__frame'), dot = $('.cursor__dot');
    var mxp = -100, myp = -100;
    var cur = { x: -100, y: -100, w: 34, h: 34 };
    var lock = null;
    var SEL = 'a, button, [data-cursor]';

    window.addEventListener('pointermove', function (e) {
      mxp = e.clientX; myp = e.clientY;
      cursor.classList.remove('is-hidden');
    }, { passive: true });
    document.addEventListener('pointerleave', function () { cursor.classList.add('is-hidden'); });
    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest && e.target.closest(SEL);
      if (el && el !== lock) {
        lock = el;
        cursor.classList.remove('is-locked');
        void cursor.offsetWidth;
        cursor.classList.add('is-locked');
      }
    });
    document.addEventListener('pointerout', function (e) {
      if (!lock) return;
      if (!e.relatedTarget || !lock.contains(e.relatedTarget)) {
        lock = null;
        cursor.classList.remove('is-locked');
      }
    });

    (function tick() {
      var tx, ty, tw, th;
      if (lock && document.contains(lock)) {
        var r = lock.getBoundingClientRect(), pad = 9;
        tx = r.left - pad; ty = r.top - pad; tw = r.width + pad * 2; th = r.height + pad * 2;
      } else {
        tw = th = 34; tx = mxp - 17; ty = myp - 17;
      }
      var k = lock ? 0.22 : 0.3;
      cur.x = lerp(cur.x, tx, k); cur.y = lerp(cur.y, ty, k);
      cur.w = lerp(cur.w, tw, 0.2); cur.h = lerp(cur.h, th, 0.2);
      frame.style.setProperty('--cx', cur.x.toFixed(1) + 'px');
      frame.style.setProperty('--cy', cur.y.toFixed(1) + 'px');
      frame.style.setProperty('--cw', cur.w.toFixed(1) + 'px');
      frame.style.setProperty('--ch', cur.h.toFixed(1) + 'px');
      dot.style.setProperty('--dx', mxp + 'px');
      dot.style.setProperty('--dy', myp + 'px');
      requestAnimationFrame(tick);
    })();
  }

  /* ---------- CTA：マグネット + 塗りの起点 + 花びら ---------- */
  function initCta() {
    $$('[data-magnetic]').forEach(function (btn) {
      var wrap = btn.parentElement;
      function setOrigin(e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        btn.style.setProperty('--y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }
      btn.addEventListener('pointerenter', function (e) {
        setOrigin(e);
        var r = btn.getBoundingClientRect();
        sakura.burst(r.left + r.width * 0.5, r.top + 4, 12, 0.9);
      });
      btn.addEventListener('pointerleave', setOrigin);
      if (!finePointer || reduce) return;
      wrap.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        btn.style.setProperty('--mx', clamp(dx * 0.22, -18, 18).toFixed(1) + 'px');
        btn.style.setProperty('--my', clamp(dy * 0.3, -14, 14).toFixed(1) + 'px');
      });
      wrap.addEventListener('pointerleave', function () {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  /* ---------- フレームの傾き ---------- */
  function initTilt() {
    if (!finePointer || reduce) return;
    $$('[data-tilt]').forEach(function (el) {
      var inner = $('.frame__inner', el);
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        inner.style.setProperty('--rx', (-py * 9).toFixed(2) + 'deg');
        inner.style.setProperty('--ry', (px * 11).toFixed(2) + 'deg');
      });
      el.addEventListener('pointerleave', function () {
        inner.style.setProperty('--rx', '0deg');
        inner.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- シャッター（クリックで1枚撮る） ---------- */
  function initShutter() {
    var flash = $('.shutter-flash'), vf = $('.viewfinder'), no = $('#frame-no');
    var count = 1, shotTimer;
    document.addEventListener('click', function (e) {
      if (!root.classList.contains('is-ready')) return;
      if (e.target.closest('a, button, input, textarea, select, label')) return;
      count = count >= 36 ? 1 : count + 1;
      no.textContent = (count < 10 ? '0' : '') + count;
      if (reduce) return;
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');
      vf.classList.add('is-shot');
      clearTimeout(shotTimer);
      shotTimer = setTimeout(function () { vf.classList.remove('is-shot'); }, 160);
      sakura.burst(e.clientX, e.clientY, 10);
    });
  }

  /* ---------- 起動 ---------- */
  function boot() {
    measure();
    measureHeader();
    layoutMarquee();
    applyTheme();
    initCursor();
    initCta();
    initTilt();
    initShutter();
    runIntro();
    requestAnimationFrame(onFrame);

    var rid;
    window.addEventListener('resize', function () {
      clearTimeout(rid);
      rid = setTimeout(function () { measure(); measureHeader(); layoutMarquee(); }, 150);
    });
    window.addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measure(); layoutMarquee(); });
    }
  }

  boot();
})();
