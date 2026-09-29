/*
 * sakura.js — 舞い散る花びらと玉ボケの Canvas エンジン
 *
 *  - 花びらはぼかし段階ごとのスプライトを起動時に一度だけ描いておき、毎フレームは drawImage のみ
 *  - 奥（小さく淡い）〜 手前（大きくボケる）の被写界深度。手前の数枚は前面キャンバスに描く
 *  - 横風のゆらぎ・ときどきの突風・ポインタのそよ風・クリック時の舞い上がり
 *  - setNight(0..1) で夜桜モード（発光する花びら・街明かりのような玉ボケ）へ
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var SPRITE = 160;      // スプライト1枚の一辺（px）
  var PETAL_LEN = 84;    // スプライト内の花びらの長さ（px）
  var BLURS = [0, 1.6, 4.5, 9];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var supportsFilter = (function () {
    try {
      var c = document.createElement('canvas').getContext('2d');
      if (!('filter' in c)) return false;
      c.filter = 'blur(2px)';
      return c.filter === 'blur(2px)';
    } catch (e) { return false; }
  })();

  // 切れ込みのある桜の花びら。原点が中心、-y 方向が先端。
  function petalPath(ctx, w, bend) {
    var L = PETAL_LEN, h = L / 2;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.bezierCurveTo(-0.46 * L * w, h * 0.55 + bend, -0.52 * L * w, -h * 0.5, -0.2 * L * w, -h);
    ctx.quadraticCurveTo(-0.07 * L * w, -h * 0.97, 0, -h * 0.8);
    ctx.quadraticCurveTo(0.07 * L * w, -h * 0.97, 0.2 * L * w, -h);
    ctx.bezierCurveTo(0.52 * L * w, -h * 0.5, 0.46 * L * w, h * 0.55 - bend, 0, h);
    ctx.closePath();
  }

  var SHAPES = [
    { w: 0.72, bend: 0 },
    { w: 0.62, bend: 6 },
    { w: 0.82, bend: -5 }
  ];

  var PALETTES = {
    day: {
      stops: [[0, 'rgba(226,120,148,1)'], [0.42, 'rgba(244,184,198,1)'], [1, 'rgba(255,236,241,1)']],
      vein: 'rgba(214,104,134,.22)',
      glow: null
    },
    night: {
      stops: [[0, 'rgba(255,150,180,1)'], [0.5, 'rgba(255,205,220,1)'], [1, 'rgba(255,246,249,1)']],
      vein: 'rgba(255,255,255,.25)',
      glow: 'rgba(255,150,185,.9)'
    }
  };

  function makePetalSprite(shape, blur, pal) {
    var c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    var g = c.getContext('2d');
    g.translate(SPRITE / 2, SPRITE / 2);
    var grad = g.createLinearGradient(0, PETAL_LEN / 2, 0, -PETAL_LEN / 2);
    pal.stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });

    var paint = function () {
      petalPath(g, shape.w, shape.bend);
      g.fillStyle = grad;
      g.fill();
      if (blur < 2) {
        g.beginPath();
        g.moveTo(0, PETAL_LEN / 2 - 4);
        g.quadraticCurveTo(shape.bend * 0.3, 0, 0, -PETAL_LEN * 0.22);
        g.strokeStyle = pal.vein;
        g.lineWidth = 1.2;
        g.stroke();
      }
    };

    if (pal.glow) {
      g.shadowColor = pal.glow;
      g.shadowBlur = 18 + blur * 2;
    }
    if (blur > 0) {
      if (supportsFilter) {
        g.filter = 'blur(' + blur + 'px)';
        paint();
      } else {
        // filter 非対応ブラウザは影だけを描いてぼかしの代わりにする
        g.shadowColor = pal.stops[1][1];
        g.shadowBlur = blur * 2.2;
        g.shadowOffsetX = SPRITE * 4;
        g.translate(-SPRITE * 4, 0);
        paint();
      }
    } else {
      paint();
    }
    return c;
  }

  function makeBokehSprite(rgb) {
    var s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var r = s / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',.34)');
    grad.addColorStop(0.82, 'rgba(' + rgb + ',.38)');
    grad.addColorStop(0.94, 'rgba(' + rgb + ',.55)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(r, r, r, 0, TAU);
    g.fill();
    return c;
  }

  function Sakura(opts) {
    this.back = opts.back;
    this.front = opts.front;
    this.bctx = this.back.getContext('2d');
    this.fctx = this.front.getContext('2d');
    this.reduce = !!opts.reduce;
    this.density = opts.density || 1;

    this.sprites = { day: [], night: [] };
    var self = this;
    ['day', 'night'].forEach(function (k) {
      SHAPES.forEach(function (shape) {
        self.sprites[k].push(BLURS.map(function (b) { return makePetalSprite(shape, b, PALETTES[k]); }));
      });
    });
    this.bokehSprites = {
      day: [makeBokehSprite('243,190,204'), makeBokehSprite('255,226,214')],
      night: [makeBokehSprite('255,170,200'), makeBokehSprite('255,214,170')]
    };

    this.petals = [];
    this.bursts = [];
    this.bokeh = [];
    this.wind = 18;
    this.windTarget = 18;
    this.gustT = 0;
    this.nextGust = rand(7, 13);
    this.night = 0;
    this.nightTarget = 0;
    this.pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };
    this.running = false;
    this.last = 0;
    this.t = 0;
    this.frameTimes = [];
    this.lastTrim = 0;

    this._loop = this._loop.bind(this);
    this.resize();
    this._seed();

    window.addEventListener('resize', this._debounce(function () {
      self.resize();
      self._fitCount();
      if (self.reduce) self._drawStatic();
    }, 150));

    if (!this.reduce) {
      window.addEventListener('pointermove', function (e) {
        var p = self.pointer;
        if (p.active) {
          p.vx = lerp(p.vx, e.clientX - p.x, 0.5);
          p.vy = lerp(p.vy, e.clientY - p.y, 0.5);
        }
        p.x = e.clientX; p.y = e.clientY; p.active = true;
      }, { passive: true });
      document.addEventListener('pointerleave', function () { self.pointer.active = false; });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.stop(); else self.start();
      });
    }
  }

  Sakura.prototype._debounce = function (fn, ms) {
    var id;
    return function () { clearTimeout(id); id = setTimeout(fn, ms); };
  };

  Sakura.prototype.resize = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    [this.back, this.front].forEach(function (c) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }, this);
  };

  Sakura.prototype._targetCount = function () {
    var area = (this.w * this.h) / (1440 * 900);
    var n = Math.round(clamp(area * 40, 18, 48) * this.density);
    return this.reduce ? Math.min(n, 12) : n;
  };

  Sakura.prototype._makePetal = function (initial) {
    // 奥:手前 = 45% : 43% : 12% くらいの分布
    var r = Math.random();
    var z = r < 0.45 ? rand(0, 0.35) : r < 0.88 ? rand(0.35, 0.8) : rand(0.8, 1);
    var p = {
      z: z,
      size: lerp(9, 30, z) * rand(0.85, 1.15) + (z > 0.8 ? rand(8, 22) : 0),
      vy: lerp(22, 74, z) * rand(0.8, 1.2),
      swayA: lerp(10, 38, z) * rand(0.6, 1.3),
      swayF: rand(0.35, 0.9),
      phase: rand(0, TAU),
      rot: rand(0, TAU),
      vrot: rand(-1.1, 1.1),
      flip: rand(0, TAU),
      vflip: rand(1.2, 3.2) * (Math.random() < 0.5 ? -1 : 1),
      shape: (Math.random() * SHAPES.length) | 0,
      blur: z < 0.18 ? 1 : z < 0.8 ? 0 : z < 0.92 ? 2 : 3,
      alpha: z < 0.35 ? rand(0.45, 0.65) : z < 0.8 ? rand(0.75, 0.95) : rand(0.55, 0.75),
      pushX: 0,
      pushY: 0,
      x: 0,
      y: 0
    };
    var m = p.size * 1.5;
    p.x = rand(-this.w * 0.15, this.w * 1.05);
    p.y = initial ? rand(-m, this.h + m) : -m - rand(0, this.h * 0.25);
    return p;
  };

  Sakura.prototype._seed = function () {
    var n = this._targetCount();
    this.petals = [];
    for (var i = 0; i < n; i++) this.petals.push(this._makePetal(true));
    this.bokeh = [];
    var nb = this.w < 700 ? 4 : 7;
    for (var j = 0; j < nb; j++) {
      this.bokeh.push({
        x: rand(0, this.w), y: rand(0, this.h),
        r: rand(40, 150), a: rand(0.18, 0.5),
        vx: rand(-6, 6), vy: rand(-4, 4),
        tone: (Math.random() * 2) | 0, phase: rand(0, TAU)
      });
    }
  };

  Sakura.prototype._fitCount = function () {
    var n = this._targetCount();
    while (this.petals.length < n) this.petals.push(this._makePetal(true));
    if (this.petals.length > n) this.petals.length = n;
  };

  Sakura.prototype.setNight = function (v) {
    v = clamp(v, 0, 1);
    if (this.reduce) {
      if (Math.abs(v - this.night) < 0.01) return;
      this.night = this.nightTarget = v;
      this._drawStatic();
      return;
    }
    this.nightTarget = v;
  };

  // 突風。strength は倍率。
  Sakura.prototype.gust = function (strength) {
    this.gustT = 0;
    this.gustPower = strength || 1;
    this.gustDur = rand(2.2, 3.6);
    this.gusting = true;
  };

  // (x, y) から花びらを舞い上げる
  Sakura.prototype.burst = function (x, y, n, spread) {
    if (this.reduce) return;
    n = n || 10;
    spread = spread || 1;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + rand(-1.3, 1.3) * spread;
      var sp = rand(120, 320);
      this.bursts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: rand(10, 20), rot: rand(0, TAU), vrot: rand(-6, 6),
        flip: rand(0, TAU), vflip: rand(4, 9),
        shape: (Math.random() * SHAPES.length) | 0,
        life: 0, max: rand(1.6, 2.6)
      });
    }
    if (this.bursts.length > 120) this.bursts.splice(0, this.bursts.length - 120);
  };

  Sakura.prototype.start = function () {
    if (this.reduce) { this._drawStatic(); return; }
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  };

  Sakura.prototype.stop = function () { this.running = false; };

  Sakura.prototype._loop = function (now) {
    if (!this.running) return;
    var dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;
    this._adapt(dt);
    this._update(dt);
    this._draw();
    requestAnimationFrame(this._loop);
  };

  // 重い端末では枚数を自動で減らす
  Sakura.prototype._adapt = function (dt) {
    var ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 90) ft.shift();
    if (ft.length < 90 || this.t - this.lastTrim < 3) return;
    var avg = ft.reduce(function (a, b) { return a + b; }, 0) / ft.length;
    if (avg > 1 / 42 && this.petals.length > 12) {
      this.petals.length = Math.max(12, Math.round(this.petals.length * 0.8));
      this.density *= 0.8;
      this.lastTrim = this.t;
    }
  };

  Sakura.prototype._update = function (dt) {
    var t = this.t;

    // 風：ゆっくり揺らぎ、ときどき突風
    this.nextGust -= dt;
    if (this.nextGust <= 0) { this.gust(rand(0.8, 1.4)); this.nextGust = rand(9, 16); }
    var gustAdd = 0;
    if (this.gusting) {
      this.gustT += dt;
      var k = this.gustT / this.gustDur;
      if (k >= 1) this.gusting = false;
      else gustAdd = Math.sin(k * Math.PI) * 120 * this.gustPower;
    }
    this.windTarget = 16 + Math.sin(t * 0.13) * 14 + Math.sin(t * 0.051 + 1.7) * 10;
    this.wind = lerp(this.wind, this.windTarget + gustAdd, 1 - Math.exp(-dt * 1.6));
    this.night = lerp(this.night, this.nightTarget, 1 - Math.exp(-dt * 3));

    var ptr = this.pointer, R = 170, R2 = R * R;
    var pv = Math.sqrt(ptr.vx * ptr.vx + ptr.vy * ptr.vy);
    ptr.vx *= Math.exp(-dt * 6);
    ptr.vy *= Math.exp(-dt * 6);

    var w = this.w, h = this.h;
    for (var i = 0; i < this.petals.length; i++) {
      var p = this.petals[i];
      var depth = 0.35 + 0.65 * p.z;

      if (ptr.active && pv > 0.4) {
        var dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          var f = (1 - Math.sqrt(d2) / R) * depth * 9;
          p.pushX += ptr.vx * f;
          p.pushY += ptr.vy * f * 0.7;
        }
      }
      var decay = Math.exp(-dt * 1.8);
      p.pushX *= decay;
      p.pushY *= decay;
      p.pushX = clamp(p.pushX, -600, 600);
      p.pushY = clamp(p.pushY, -400, 400);

      var sway = Math.sin(t * p.swayF + p.phase) * p.swayA + Math.sin(t * p.swayF * 2.3 + p.phase * 1.7) * p.swayA * 0.35;
      p.x += (this.wind * depth + sway + p.pushX) * dt;
      p.y += (p.vy + p.pushY + Math.cos(t * p.swayF + p.phase) * p.swayA * 0.25) * dt;
      var spin = 1 + Math.abs(this.wind) / 90 + Math.abs(p.pushX) / 300;
      p.rot += p.vrot * dt * spin;
      p.flip += p.vflip * dt * spin;

      var m = p.size * 1.6;
      if (p.y > h + m || p.x > w + m * 4 || p.x < -m * 6) {
        var np = this._makePetal(false);
        if (p.x > w + m * 4) { np.x = -m; np.y = rand(-m, h * 0.7); }
        this.petals[i] = np;
      }
    }

    for (var j = this.bursts.length - 1; j >= 0; j--) {
      var b = this.bursts[j];
      b.life += dt;
      if (b.life > b.max) { this.bursts.splice(j, 1); continue; }
      var drag = Math.exp(-dt * 2.4);
      b.vx = b.vx * drag + this.wind * 0.6 * dt * 4;
      b.vy = b.vy * drag + 90 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vrot * dt;
      b.flip += b.vflip * dt;
    }

    for (var k2 = 0; k2 < this.bokeh.length; k2++) {
      var o = this.bokeh[k2];
      o.x += (o.vx + this.wind * 0.05) * dt;
      o.y += o.vy * dt;
      if (o.x < -o.r) o.x = w + o.r; else if (o.x > w + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = h + o.r; else if (o.y > h + o.r) o.y = -o.r;
    }
  };

  Sakura.prototype._drawPetal = function (ctx, sprite, x, y, rot, flip, size, alpha) {
    var dpr = this.dpr;
    var sx = Math.cos(flip);
    if (sx > -0.08 && sx < 0.08) sx = sx < 0 ? -0.08 : 0.08;
    var sy = 0.82 + 0.18 * Math.sin(flip * 0.6);
    var k = size / PETAL_LEN;
    var c = Math.cos(rot), s = Math.sin(rot);
    ctx.globalAlpha = alpha * (0.72 + 0.28 * Math.abs(sx));
    ctx.setTransform(c * sx * k * dpr, s * sx * k * dpr, -s * sy * k * dpr, c * sy * k * dpr, x * dpr, y * dpr);
    ctx.drawImage(sprite, -SPRITE / 2, -SPRITE / 2);
  };

  Sakura.prototype._pass = function (mode, weight) {
    var set = this.sprites[mode];
    var bctx = this.bctx, fctx = this.fctx;
    var comp = mode === 'night' ? 'lighter' : 'source-over';
    bctx.globalCompositeOperation = comp;
    fctx.globalCompositeOperation = comp;
    var nightDim = mode === 'night' ? 0.95 : 1;

    for (var i = 0; i < this.petals.length; i++) {
      var p = this.petals[i];
      var ctx = p.z > 0.8 ? fctx : bctx;
      this._drawPetal(ctx, set[p.shape][p.blur], p.x, p.y, p.rot, p.flip, p.size, p.alpha * weight * nightDim);
    }
    for (var j = 0; j < this.bursts.length; j++) {
      var b = this.bursts[j];
      var life = b.life / b.max;
      var a = life < 0.1 ? life / 0.1 : 1 - Math.pow((life - 0.1) / 0.9, 2);
      this._drawPetal(fctx, set[b.shape][0], b.x, b.y, b.rot, b.flip, b.size, a * 0.9 * weight * nightDim);
    }
  };

  Sakura.prototype._drawBokeh = function (weight, mode) {
    var ctx = this.bctx, dpr = this.dpr, t = this.t;
    var sprites = this.bokehSprites[mode];
    ctx.globalCompositeOperation = mode === 'night' ? 'lighter' : 'source-over';
    for (var i = 0; i < this.bokeh.length; i++) {
      var o = this.bokeh[i];
      var pulse = 0.75 + 0.25 * Math.sin(t * 0.4 + o.phase);
      ctx.globalAlpha = o.a * pulse * weight * (mode === 'night' ? 0.55 : 0.6);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(sprites[o.tone], o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    }
  };

  Sakura.prototype._draw = function () {
    var b = this.bctx, f = this.fctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    f.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, this.back.width, this.back.height);
    f.clearRect(0, 0, this.front.width, this.front.height);

    var n = this.night;
    if (n < 0.995) { this._drawBokeh(1 - n, 'day'); this._pass('day', 1 - n); }
    if (n > 0.005) { this._drawBokeh(n, 'night'); this._pass('night', n); }

    b.globalAlpha = 1; f.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    f.globalCompositeOperation = 'source-over';
  };

  Sakura.prototype._drawStatic = function () { this._draw(); };

  window.Sakura = Sakura;
})();
