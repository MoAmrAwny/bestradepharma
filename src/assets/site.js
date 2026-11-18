/* bestradepharma.com — the small amount of behaviour the static pages need:
   header shadow, mobile menu, fade-up on scroll, count-up numbers, and the
   language switch on product pages. No framework. Every page is complete and
   readable without this file. */
(function () {
  "use strict";
  var d = document, root = d.documentElement, body = d.body;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var hasIO = "IntersectionObserver" in window;
  function each(sel, fn, scope) { Array.prototype.forEach.call((scope || d).querySelectorAll(sel), fn); }

  /* Sticky header gains a soft shadow once the page scrolls. */
  function onScroll() {
    var s = (window.scrollY || window.pageYOffset || 0) > 8;
    each(".site-header", function (h) { h.classList.toggle("scrolled", s); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Mobile menu. */
  each(".menu-btn", function (b) {
    b.addEventListener("click", function () {
      var h = b.closest(".site-header");
      var open = !h.classList.contains("open");
      h.classList.toggle("open", open);
      b.setAttribute("aria-expanded", String(open));
    });
  });
  d.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    each(".site-header.open", function (h) {
      h.classList.remove("open");
      var b = h.querySelector(".menu-btn");
      if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); }
    });
  });

  /* Sections fade up as they scroll into view. */
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    each(".reveal", function (el) { io.observe(el); });
  } else {
    each(".reveal", function (el) { el.classList.add("in"); });
  }

  /* Patient numbers count up (2.4 s, ease-out) when their section comes into
     view; each bar fills to its share of the largest. The HTML already holds
     the final values, so without JS or with reduced motion nothing moves. */
  var AR = "٠١٢٣٤٥٦٧٨٩";
  function fmt(n, el) {
    var s = Math.round(n).toLocaleString("en-US");
    var l = (el.closest("[lang]") || root).getAttribute("lang");
    if (l === "ar") s = s.replace(/\d/g, function (c) { return AR[c]; }).replace(/,/g, "٬");
    return "+" + s;
  }
  if (hasIO && !reduce) {
    each("[data-countup]", function (sec) {
      var nums = sec.querySelectorAll("[data-count]");
      var bars = sec.querySelectorAll("[data-w]");
      function set(k) {
        Array.prototype.forEach.call(nums, function (n) { n.textContent = fmt(+n.getAttribute("data-count") * k, n); });
        Array.prototype.forEach.call(bars, function (b) { b.style.width = (+b.getAttribute("data-w") * k).toFixed(1) + "%"; });
      }
      set(0);
      var cio = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        cio.disconnect();
        var t0 = null;
        function step(t) {
          if (t0 === null) t0 = t;
          var x = Math.min(1, (t - t0) / 2400);
          set(1 - Math.pow(1 - x, 3));
          if (x < 1) window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
      }, { rootMargin: "0px 0px -25% 0px" });
      cio.observe(sec);
    });
  }

  /* Product pages: one URL, both languages. The header button switches in
     place, remembers the choice for this product, and keeps ?lang in the URL
     in step so a reload or a shared link opens the same language. */
  var code = body.getAttribute("data-code");
  function syncTitle() {
    var t = body.getAttribute("data-title-" + root.lang);
    if (t) d.title = t;
  }
  function setLang(l) {
    if (l !== "ar" && l !== "en") return;
    root.lang = l;
    root.dir = l === "ar" ? "rtl" : "ltr";
    try { window.localStorage.setItem(code + ".lang", l); } catch (e) {}
    try { window.history.replaceState(window.history.state, "", window.location.pathname + "?lang=" + l + window.location.hash); } catch (e) {}
    syncTitle();
    if (window.LeafletSetLang) window.LeafletSetLang(l);
    var next = d.querySelector('.site-header[data-lv="' + l + '"] .lang-switch');
    if (next) next.focus();
    onScroll();
  }
  if (code) {
    syncTitle();
    each("button.lang-switch", function (b) {
      b.addEventListener("click", function () { setLang(b.getAttribute("data-to")); });
    });
  }
})();
