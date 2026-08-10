/* ---------------------------------------------------------------
   Hero simulation — islanded microgrid frequency response.

   Plant (aggregated islanded AC microgrid, Hz and kW):

     M  d(Δf)/dt = P_p + P_s − P_load − D·Δf
     τ  d(P_p)/dt = −(1/m_p)·Δf − P_p

   P_p is the droop (primary) contribution behind the inverter's power
   measurement filter; P_s is the secondary set-point. Steady state with
   no secondary is Δf = −P_load / (1/m_p + D), which is what the droop
   authority slider is really setting.

   Two secondary controllers run against the identical plant:

     · Droop + PI      classic, no anti-windup — so it overshoots once
                       the reserve ramp limit starts binding
     · Koopman MPC     velocity-form predictive control, cost solved as
                       a small QP by Hildreth's method, with the ramp
                       and magnitude limits as explicit constraints

   Both see the same actuator: |P_s| ≤ 30 kW and a ramp limit the
   visitor sets. The MPC knows about the limit; the PI only meets it.

   This is a reduced model chosen so it runs at 60fps in a browser, not
   the four-bus Simulink testbed. The qualitative claim it demonstrates
   — that anticipating a binding rate limit removes the overshoot — is
   the same one the thesis makes.
   --------------------------------------------------------------- */
(function () {
  "use strict";

  var figure = document.querySelector("[data-sim]");
  if (!figure) return;

  var svg = figure.querySelector("[data-sim-plot]");
  var controls = figure.querySelector("[data-sim-controls]");
  if (!svg || !controls) return;

  /* ---- constants ------------------------------------------------ */
  var TS = 0.05;        // s, controller and integration step
  var T_END = 8;        // s, window
  var T_STEP = 0.5;     // s, when the load step lands
  var U_MAX = 30;       // kW, secondary reserve magnitude
  var BAND = 0.02;      // Hz, settling band (±20 mHz)
  var F0 = 50;

  var PI_KP = 40;       // kW/Hz
  var PI_KI = 110;      // kW/(Hz·s)
  var MPC_NP = 30;      // prediction horizon (1.5 s)
  var MPC_NC = 4;       // control horizon
  var MPC_Q = 1;
  var MPC_R = 1e-5;

  /* plot geometry, in the SVG's own viewBox units */
  var X0 = 56, X1 = 500, Y0 = 30, Y1 = 210;

  var NS = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- small dense linear algebra ------------------------------- */
  function mul(A, B) {
    var n = A.length, k = B.length, m = B[0].length;
    var C = new Array(n);
    for (var i = 0; i < n; i++) {
      C[i] = new Float64Array(m);
      for (var p = 0; p < k; p++) {
        var a = A[i][p];
        if (a === 0) continue;
        for (var j = 0; j < m; j++) C[i][j] += a * B[p][j];
      }
    }
    return C;
  }

  /* Must return a plain Array of rows: A[0].map(...) on a Float64Array
     row would coerce every returned row to NaN. */
  function transpose(A) {
    var rows = A[0].length, out = new Array(rows);
    for (var j = 0; j < rows; j++) {
      var col = new Float64Array(A.length);
      for (var i = 0; i < A.length; i++) col[i] = A[i][j];
      out[j] = col;
    }
    return out;
  }

  function inverse(A) {
    var n = A.length, i, j, c, r;
    var M = new Array(n);
    for (i = 0; i < n; i++) {
      M[i] = new Float64Array(2 * n);
      for (j = 0; j < n; j++) M[i][j] = A[i][j];
      M[i][n + i] = 1;
    }
    for (c = 0; c < n; c++) {
      var piv = c;
      for (r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      var d = M[c][c];
      for (j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c];
        if (f === 0) continue;
        for (j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    var out = new Array(n);
    for (i = 0; i < n; i++) out[i] = M[i].slice(n);
    return out;
  }

  /* ---- plant, discretised --------------------------------------- */
  function plant(mp) {
    var Meq = 18, D = 2, tau = 0.45;
    var Ac = [[-D / Meq, 1 / Meq], [-1 / (mp * tau), -1 / tau]];
    var Bc = [[1 / Meq], [0]];
    var Ec = [[-1 / Meq], [0]];

    /* Ad = e^(Ac·Ts), and sum = ∫e^(Ac·s)ds, both by series. */
    var Ad = [new Float64Array([1, 0]), new Float64Array([0, 1])];
    var term = [new Float64Array([1, 0]), new Float64Array([0, 1])];
    var sum = [new Float64Array([TS, 0]), new Float64Array([0, TS])];
    for (var k = 1; k < 12; k++) {
      term = mul(term, Ac);
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) term[i][j] *= TS / k;
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
        Ad[i][j] += term[i][j];
        sum[i][j] += term[i][j] * TS / (k + 1);
      }
    }
    return { Ad: Ad, Bd: mul(sum, Bc), Ed: mul(sum, Ec) };
  }

  /* ---- Hildreth QP: min ½x'Hx + f'x subject to Mc·x ≤ g ---------- */
  function hildreth(Hi, f, Mc, g) {
    var n = f.length, m = Mc.length, i, j;

    var col = new Array(n);
    for (i = 0; i < n; i++) col[i] = [-f[i]];
    var x = mul(Hi, col);

    var feasible = true;
    for (i = 0; i < m; i++) {
      var s = 0;
      for (j = 0; j < n; j++) s += Mc[i][j] * x[j][0];
      if (s > g[i] + 1e-9) { feasible = false; break; }
    }
    if (feasible) {
      var u = new Float64Array(n);
      for (i = 0; i < n; i++) u[i] = x[i][0];
      return u;
    }

    var MHi = mul(Mc, Hi);
    var P = mul(MHi, transpose(Mc));
    var fcol = new Array(n);
    for (i = 0; i < n; i++) fcol[i] = [f[i]];
    var dv = mul(MHi, fcol);
    var d = new Float64Array(m);
    for (i = 0; i < m; i++) d[i] = dv[i][0] + g[i];

    var lam = new Float64Array(m);
    for (var it = 0; it < 60; it++) {
      var delta = 0;
      for (i = 0; i < m; i++) {
        if (P[i][i] === 0) continue;
        var w = d[i];
        for (j = 0; j < m; j++) if (j !== i) w += P[i][j] * lam[j];
        var prev = lam[i];
        lam[i] = Math.max(0, -w / P[i][i]);
        delta += (lam[i] - prev) * (lam[i] - prev);
      }
      if (delta < 1e-16) break;
    }

    var lamCol = new Array(m);
    for (i = 0; i < m; i++) lamCol[i] = [lam[i]];
    var corr = mul(transpose(Mc), lamCol);
    var rhs = new Array(n);
    for (i = 0; i < n; i++) rhs[i] = [-(f[i] + corr[i][0])];
    var sol = mul(Hi, rhs);
    var out = new Float64Array(n);
    for (i = 0; i < n; i++) out[i] = sol[i][0];
    return out;
  }

  /* ---- MPC design (velocity form, output = Δf) ------------------- */
  function designMPC(mp) {
    var p = plant(mp), Ad = p.Ad, Bd = p.Bd;

    /* augmented state x̃ = [Δx₁ Δx₂ y]' so the controller is offset-free */
    var A = [
      new Float64Array([Ad[0][0], Ad[0][1], 0]),
      new Float64Array([Ad[1][0], Ad[1][1], 0]),
      new Float64Array([Ad[0][0], Ad[0][1], 1])
    ];
    var B = [[Bd[0][0]], [Bd[1][0]], [Bd[0][0]]];
    var C = [[0, 0, 1]];

    var F = [], i, j;
    var Apow = A;
    for (i = 0; i < MPC_NP; i++) {
      F.push(mul(C, Apow)[0]);
      Apow = mul(Apow, A);
    }

    var h = new Float64Array(MPC_NP);
    var Ai = [
      new Float64Array([1, 0, 0]),
      new Float64Array([0, 1, 0]),
      new Float64Array([0, 0, 1])
    ];
    for (i = 0; i < MPC_NP; i++) {
      h[i] = mul(mul(C, Ai), B)[0][0];
      Ai = mul(Ai, A);
    }

    var Phi = [];
    for (i = 0; i < MPC_NP; i++) {
      var row = new Float64Array(MPC_NC);
      for (j = 0; j < MPC_NC; j++) if (i - j >= 0) row[j] = h[i - j];
      Phi.push(row);
    }

    var PhiT = transpose(Phi);
    var H = mul(PhiT, Phi);
    for (i = 0; i < MPC_NC; i++)
      for (j = 0; j < MPC_NC; j++)
        H[i][j] = 2 * (MPC_Q * H[i][j] + (i === j ? MPC_R : 0));

    return { F: F, PhiT: PhiT, Hi: inverse(H) };
  }

  /* ---- simulate one controller ---------------------------------- */
  function simulate(opts, controller) {
    var mp = opts.droop / 1000;              // mHz/kW → Hz/kW
    var duMax = opts.ramp * TS;              // kW/s → kW per step
    var p = plant(mp), Ad = p.Ad, Bd = p.Bd, Ed = p.Ed;
    var N = Math.round(T_END / TS);
    var kStep = Math.round(T_STEP / TS);
    var mpc = controller === "mpc" ? designMPC(mp) : null;

    var x0 = 0, x1 = 0, xp0 = 0, xp1 = 0, u = 0, xi = 0;
    var f = new Float64Array(N + 1);
    var i, j;

    for (var k = 0; k <= N; k++) {
      var y = x0;
      f[k] = y;
      var load = k >= kStep ? opts.load : 0;
      var want;

      if (controller === "pi") {
        var e = -y;
        xi += e * TS;
        want = PI_KP * e + PI_KI * xi;       // no anti-windup, deliberately
      } else {
        var t0 = x0 - xp0, t1 = x1 - xp1;
        var fv = new Float64Array(MPC_NC);
        var Fx = new Float64Array(MPC_NP);
        for (i = 0; i < MPC_NP; i++) Fx[i] = mpc.F[i][0] * t0 + mpc.F[i][1] * t1 + mpc.F[i][2] * y;
        for (i = 0; i < MPC_NC; i++) {
          var s = 0;
          for (j = 0; j < MPC_NP; j++) s += mpc.PhiT[i][j] * Fx[j];
          fv[i] = 2 * MPC_Q * s;
        }

        var Mc = [], g = [];
        for (i = 0; i < MPC_NC; i++) {
          var rp = new Float64Array(MPC_NC), rm = new Float64Array(MPC_NC);
          rp[i] = 1; rm[i] = -1;
          Mc.push(rp); g.push(duMax);
          Mc.push(rm); g.push(duMax);
          var cp = new Float64Array(MPC_NC), cm = new Float64Array(MPC_NC);
          for (j = 0; j <= i; j++) { cp[j] = 1; cm[j] = -1; }
          Mc.push(cp); g.push(U_MAX - u);
          Mc.push(cm); g.push(U_MAX + u);
        }
        want = u + hildreth(mpc.Hi, fv, Mc, g)[0];
      }

      /* the actuator is the same for both controllers */
      var du = want - u;
      if (du > duMax) du = duMax;
      if (du < -duMax) du = -duMax;
      var un = u + du;
      if (un > U_MAX) un = U_MAX;
      if (un < -U_MAX) un = -U_MAX;

      xp0 = x0; xp1 = x1;
      var n0 = Ad[0][0] * x0 + Ad[0][1] * x1 + Bd[0][0] * un + Ed[0][0] * load;
      var n1 = Ad[1][0] * x0 + Ad[1][1] * x1 + Bd[1][0] * un + Ed[1][0] * load;
      x0 = n0; x1 = n1; u = un;
    }
    return f;
  }

  function measure(f) {
    var nadir = 0, over = 0, i;
    for (i = 0; i < f.length; i++) {
      if (f[i] < nadir) nadir = f[i];
      if (f[i] > over) over = f[i];
    }
    var settle = null;
    for (i = f.length - 1; i >= 0; i--) {
      if (Math.abs(f[i]) > BAND) { settle = i * TS - T_STEP; break; }
    }
    return { nadir: nadir, over: over, settle: settle };
  }

  /* ---- rendering ------------------------------------------------ */
  function niceStep(span) {
    var raw = span / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return mult * mag;
  }

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  var gridG = svg.querySelector("[data-grid]");
  var tickG = svg.querySelector("[data-yticks]");
  var traceMain = svg.querySelector("[data-trace-main]");
  var traceBase = svg.querySelector("[data-trace-base]");
  var eventLine = svg.querySelector("[data-event]");
  var eventLabel = svg.querySelector("[data-event-label]");
  var descNode = svg.querySelector("#plot-desc");

  function xOf(t) { return X0 + (t / T_END) * (X1 - X0); }

  function drawAxis(lo, hi) {
    while (gridG.firstChild) gridG.removeChild(gridG.firstChild);
    while (tickG.firstChild) tickG.removeChild(tickG.firstChild);

    var step = niceStep(hi - lo);
    var start = Math.ceil(lo / step) * step;
    for (var v = start; v <= hi + 1e-9; v += step) {
      var y = Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
      gridG.appendChild(el("line", { x1: X0, y1: y, x2: X1, y2: y }));
      var label = el("text", { x: X0 - 8, y: y + 4, "text-anchor": "end" });
      label.textContent = (F0 + v).toFixed(Math.abs(step) < 0.05 ? 3 : 2);
      tickG.appendChild(label);
    }

    var setpoint = svg.querySelector("[data-setpoint]");
    var y0 = Y1 - ((0 - lo) / (hi - lo)) * (Y1 - Y0);
    setpoint.setAttribute("y1", y0);
    setpoint.setAttribute("y2", y0);

    var xe = xOf(T_STEP);
    eventLine.setAttribute("x1", xe);
    eventLine.setAttribute("x2", xe);
    eventLabel.setAttribute("x", xe + 6);
  }

  function pathFor(f, lo, hi) {
    var d = "", i;
    for (i = 0; i < f.length; i++) {
      var x = xOf(i * TS);
      var y = Y1 - ((f[i] - lo) / (hi - lo)) * (Y1 - Y0);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
    }
    return d;
  }

  function animateDraw(path) {
    if (reduced.matches || typeof path.getTotalLength !== "function") return;
    var len = path.getTotalLength();
    if (!len) return;
    path.animate(
      [{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }],
      { duration: 1100, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "none" }
    );
  }

  /* ---- controls -------------------------------------------------- */
  var inputs = {
    load: figure.querySelector("#sim-load"),
    droop: figure.querySelector("#sim-droop"),
    ramp: figure.querySelector("#sim-ramp")
  };
  var outs = {
    load: figure.querySelector('[data-out="load"]'),
    droop: figure.querySelector('[data-out="droop"]'),
    ramp: figure.querySelector('[data-out="ramp"]')
  };
  var cells = {};
  Array.prototype.forEach.call(figure.querySelectorAll("[data-cell]"), function (n) {
    cells[n.getAttribute("data-cell")] = n;
  });

  function readOpts() {
    return {
      load: parseFloat(inputs.load.value),
      droop: parseFloat(inputs.droop.value),
      ramp: parseFloat(inputs.ramp.value)
    };
  }

  function fmtSettle(v) { return v === null ? "—" : v.toFixed(2) + " s"; }
  function fmtHz(v) { return (F0 + v).toFixed(3); }
  function fmtMilli(v) { return Math.round(v * 1000) + " mHz"; }

  var pending = false;

  function run(animate) {
    var opts = readOpts();

    outs.load.textContent = opts.load.toFixed(1) + " kW";
    outs.droop.textContent = opts.droop.toFixed(2) + " mHz/kW";
    outs.ramp.textContent = opts.ramp.toFixed(0) + " kW/s";

    var fPi = simulate(opts, "pi");
    var fMpc = simulate(opts, "mpc");

    var lo = 0, hi = 0, i;
    for (i = 0; i < fPi.length; i++) {
      lo = Math.min(lo, fPi[i], fMpc[i]);
      hi = Math.max(hi, fPi[i], fMpc[i]);
    }
    var pad = Math.max((hi - lo) * 0.18, 0.01);
    lo -= pad; hi += pad;

    drawAxis(lo, hi);
    traceBase.setAttribute("d", pathFor(fPi, lo, hi));
    traceMain.setAttribute("d", pathFor(fMpc, lo, hi));

    var mPi = measure(fPi), mMpc = measure(fMpc);
    cells["mpc-nadir"].textContent = fmtHz(mMpc.nadir);
    cells["mpc-settle"].textContent = fmtSettle(mMpc.settle);
    cells["mpc-over"].textContent = fmtMilli(mMpc.over);
    cells["pi-nadir"].textContent = fmtHz(mPi.nadir);
    cells["pi-settle"].textContent = fmtSettle(mPi.settle);
    cells["pi-over"].textContent = fmtMilli(mPi.over);

    if (descNode) {
      descNode.textContent =
        "Frequency after a " + opts.load.toFixed(1) + " kilowatt load step on an islanded microgrid. " +
        "The Koopman MPC secondary reaches a nadir of " + fmtHz(mMpc.nadir) + " hertz, settles in " +
        fmtSettle(mMpc.settle) + " and overshoots by " + fmtMilli(mMpc.over) + ". " +
        "The droop plus PI baseline reaches " + fmtHz(mPi.nadir) + " hertz, settles in " +
        fmtSettle(mPi.settle) + " and overshoots by " + fmtMilli(mPi.over) + ".";
    }

    if (animate) { animateDraw(traceBase); animateDraw(traceMain); }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () { pending = false; run(false); });
  }

  Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener("input", schedule);
  });

  var replay = figure.querySelector("[data-sim-replay]");
  if (replay) replay.addEventListener("click", function () { run(true); });

  /* Everything is wired: show the controls and the metric table. */
  controls.hidden = false;
  var metrics = figure.querySelector("[data-sim-metrics]");
  if (metrics) metrics.hidden = false;
  figure.classList.add("is-live");

  run(true);
})();
