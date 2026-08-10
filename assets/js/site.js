/* ---------------------------------------------------------------
   Site behaviour: theme toggle, section reveal, research disclosures.
   Everything here is an enhancement — the page is complete without it.
   --------------------------------------------------------------- */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------- *
   * Theme toggle
   * ------------------------------------------------------------- */
  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function buildToggle() {
    var nav = document.querySelector(".masthead .nav");
    if (!nav) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.innerHTML =
      '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4' +
      'M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>' +
      '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z"/></svg>';

    function label() {
      var next = currentTheme() === "dark" ? "light" : "dark";
      btn.setAttribute("aria-label", "Switch to " + next + " theme");
      btn.setAttribute("title", "Switch to " + next + " theme");
    }
    label();

    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.classList.add("theme-switching");
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* non-fatal */ }
      label();
      document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { root.classList.remove("theme-switching"); });
      });
    });

    nav.appendChild(btn);
  }

  /* Follow the system preference while no explicit choice is stored. */
  function watchSystemTheme() {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      var stored = null;
      try { stored = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
      if (!stored) {
        document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: currentTheme() } }));
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ------------------------------------------------------------- *
   * Reveal on scroll
   * ------------------------------------------------------------- */
  function reveal() {
    if (reduced.matches || !("IntersectionObserver" in window)) return;

    /* Deliberately not the hero figure: it is above the fold, and fading it
       in only delays the plot and fights with its own draw animation. */
    var targets = document.querySelectorAll(
      ".section-body > .section-title, .section-body > .section-intro, .entry, .postrow"
    );
    if (!targets.length) return;

    /* Anything already on screen at load is left alone. Fading in content the
       visitor is looking at only delays it — the effect is for things they
       scroll down to. */
    var pending = [];
    Array.prototype.forEach.call(targets, function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
      pending.push(el);
    });
    if (!pending.length) return;

    pending.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", (i % 6) * 55 + "ms");
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

    pending.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------- *
   * Research disclosures
   *
   * The markup is <details>, so this only adds height animation and
   * hash deep-linking. Without JS the panels still open and close.
   * ------------------------------------------------------------- */
  function disclosures() {
    var panels = document.querySelectorAll(".entry > details");
    if (!panels.length) return;

    Array.prototype.forEach.call(panels, function (d) {
      var body = d.querySelector(".entry-detail");
      if (!body) return;

      d.addEventListener("toggle", function () {
        d.closest(".entry").classList.toggle("is-open", d.open);
        if (d.open && d.id) {
          history.replaceState(null, "", "#" + d.id);
        }
      });

      if (reduced.matches) return;

      /* Animate the panel rather than letting it snap. The details element
         stays authoritative for state; this only paints the transition. */
      var animation = null;
      d.addEventListener("click", function (event) {
        var summary = event.target.closest("summary");
        if (!summary || !d.contains(summary)) return;
        event.preventDefault();

        if (animation) { animation.cancel(); animation = null; }

        if (!d.open) {
          d.open = true;
          animation = body.animate(
            { height: ["0px", body.scrollHeight + "px"], opacity: [0, 1] },
            { duration: 260, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
          );
        } else {
          animation = body.animate(
            { height: [body.scrollHeight + "px", "0px"], opacity: [1, 0] },
            { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)" }
          );
          animation.addEventListener("finish", function () { d.open = false; });
        }
        animation.addEventListener("finish", function () { animation = null; });
      });
    });

    /* Open whatever the URL points at, on load and on later hash changes. */
    function openFromHash() {
      var id = window.location.hash.slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (target && target.tagName.toLowerCase() === "details") {
        target.open = true;
        target.closest(".entry").classList.add("is-open");
        target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "center" });
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  }

  buildToggle();
  watchSystemTheme();
  reveal();
  disclosures();
})();
