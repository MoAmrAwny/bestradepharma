(function(){
  /* The payload is inlined into the page as a JSON script tag by the build.
     At build time (prerender) it is handed to us on window.PAYLOAD instead. */
  var PAYLOAD = window.PAYLOAD;
  if (!PAYLOAD) {
    var tag = document.getElementById("payload");
    if (!tag) return;
    try { PAYLOAD = JSON.parse(tag.textContent); } catch (e) { return; }
  }
  var D = PAYLOAD.data, UI = PAYLOAD.ui, PLATES = PAYLOAD.plates, FLAGS = PAYLOAD.flags;
  var LANGKEY = (PAYLOAD.code || "leaflet") + ".lang";
  var path = null;
  var body = document.body;

  /* Language survives a reload. Arabic when storage is unavailable or unreadable. */
  function readLang(){
    if (window.__PRERENDER_LANG) return window.__PRERENDER_LANG;
    try {
      var v = window.localStorage.getItem(LANGKEY);
      if (v === "ar" || v === "en") return v;
    } catch (e) {}
    return "ar";
  }
  function saveLang(v){
    try { window.localStorage.setItem(LANGKEY, v); } catch (e) {}
  }
  var lang = readLang();

  function t(o){ return (o && o[lang] !== undefined) ? o[lang] : ""; }
  function listSep(){ return (lang === "ar") ? "، " : ", "; }
  function el(tag, cls, txt){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }
  function claimById(id){
    for (var i = 0; i < D.claims.length; i++){ if (D.claims[i].id === id) return D.claims[i]; }
    return null;
  }
  function labelled(cls, label, text){
    var n = el("div", cls);
    n.appendChild(el("div","lbl", label));
    n.appendChild(el("p", null, text));
    return n;
  }

  function sectionWhat(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secWhat)));
    s.appendChild(el("p", null, t(UI.notMedicine)));
    s.appendChild(el("p","sub", t(D.product.registration.authority) + " " +
                                D.product.registration.number + ". " +
                                t(D.product.countryOfManufacture) + "."));
    return s;
  }

  function sectionHow(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secHow)));
    var box = el("div","dose");
    box.appendChild(el("span","n","1"));
    box.appendChild(el("span","t", t(D.product.dose)));
    s.appendChild(box);

    var cont = claimById("ucii-continuous-use");
    if (cont){
      var p = el("p", null, t(cont.statement));
      p.style.marginTop = "16px";
      s.appendChild(p);
    }

    /* When to expect a difference. Renders the measurement points the trials
       actually used. Gated so the decision behind it stays visible. */
    var tte = FLAGS.timeToEffect ? claimById("ucii-time-to-effect") : null;
    if (tte){
      var box2 = el("div","expect");
      box2.appendChild(el("div","lbl", t(UI.expectHeading)));
      box2.appendChild(el("p", null, t(tte.statement)));
      if (tte.qualifications && tte.qualifications.length){
        var ul = el("ul");
        tte.qualifications.forEach(function(q){ ul.appendChild(el("li", null, t(q))); });
        box2.appendChild(ul);
      }
      s.appendChild(box2);
    }
    return s;
  }

  function verdictLabel(v){
    if (v === "matches") return t(UI.verdictMatches);
    if (v === "low-end-of-effective-range") return t(UI.verdictLowEnd);
    if (v === "below-trial-dose") return t(UI.verdictBelow);
    if (v === "not-comparable") return t(UI.verdictNotComparable);
    return "";
  }

  function sectionInside(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secInside)));
    var grid = el("div","cards");
    var ordered = D.ingredients.slice().sort(function(a, b){
      return (a.readerRank || 99) - (b.readerRank || 99);
    });
    ordered.forEach(function(ing){
      var c = el("div","card");
      c.setAttribute("role","button");
      c.setAttribute("tabindex","0");

      var plate = el("div","plate");
      var img = document.createElement("img");
      img.src = PLATES[ing.id];
      img.alt = t(ing.name);
      img.loading = "lazy";
      img.decoding = "async";
      plate.appendChild(img);
      plate.appendChild(el("span","cue", t(UI.tapForFact)));
      c.appendChild(plate);

      var b = el("div","body");
      b.appendChild(el("div","nm", t(ing.name)));
      b.appendChild(el("div","amt", t(UI.amountLabel) + " " + ing.amount.value + " " + ing.amount.unit));

      var f = el("div","fact");
      f.appendChild(el("div","tag", t(UI.funFact)));
      f.appendChild(el("h3", null, t(ing.story.headline)));
      f.appendChild(el("p", null, t(ing.story.body)));
      var m = el("div","mech");
      m.appendChild(el("b", null, t(UI.howItWorks)));
      m.appendChild(document.createTextNode(t(ing.mechanism)));
      f.appendChild(m);
      f.appendChild(el("div","src", t(UI.sourceLabel) + ". " + t(ing.source)));

      /* The number first, then what is missing from it. */
      if (ing.standardisation && ing.standardisation.declared === false && ing.standardisation.note){
        f.appendChild(labelled("stand", t(UI.standNotLabel), t(ing.standardisation.note)));
      }
      if (ing.comparison && ing.comparison.trialDose){
        var cm = el("div","cmp v-" + ing.comparison.verdict);
        cm.appendChild(el("div","lbl", t(UI.compareLabel)));
        cm.appendChild(el("span","vd", verdictLabel(ing.comparison.verdict)));
        cm.appendChild(el("p", null, t(ing.comparison.trialDose)));
        f.appendChild(cm);
      }

      if (ing.allergen) f.appendChild(el("div","allergen", t(ing.allergen)));
      f.appendChild(el("div","src", t(UI.tapToClose)));
      b.appendChild(f);
      c.appendChild(b);

      function toggle(){ c.classList.toggle("open"); }
      c.addEventListener("click", toggle);
      c.addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " "){ e.preventDefault(); toggle(); }
      });
      grid.appendChild(c);
    });
    s.appendChild(grid);
    return s;
  }

  function sectionAvoid(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secAvoid)));
    s.appendChild(el("p","sub", t(UI.checkIntro)));

    var box = el("div","check");
    D.interactionChecks.forEach(function(q){
      var w = el("div","q");
      w.appendChild(el("div","qt", t(q.question)));
      var btns = el("div","btns");
      var yes = el("button", null, t(UI.yes));
      var no  = el("button", null, t(UI.no));
      yes.type = "button"; no.type = "button";
      yes.setAttribute("aria-pressed","false");
      no.setAttribute("aria-pressed","false");
      btns.appendChild(yes); btns.appendChild(no);
      w.appendChild(btns);

      var a = el("div","ans sev-" + q.severity);
      a.appendChild(el("b", null, q.severity === "do-not-take" ? t(UI.doNotTake) : t(UI.askDoctor)));
      a.appendChild(document.createTextNode(t(q.ifYes)));
      w.appendChild(a);

      yes.addEventListener("click", function(){
        yes.setAttribute("aria-pressed","true");
        no.setAttribute("aria-pressed","false");
        w.classList.add("show");
      });
      no.addEventListener("click", function(){
        no.setAttribute("aria-pressed","true");
        yes.setAttribute("aria-pressed","false");
        w.classList.remove("show");
      });
      box.appendChild(w);
    });
    s.appendChild(box);

    s.appendChild(el("h3","warns-title", t(UI.warningsTitle)));
    var ul = el("ul","warns");
    D.warnings.forEach(function(wn){
      ul.appendChild(el("li", wn.origin === "added" ? "added" : null, t(wn.text)));
    });
    s.appendChild(ul);
    return s;
  }

  function sectionEvidence(){
    var mine = D.claims.filter(function(c){
      return c.paths && c.paths.indexOf(path) !== -1;
    });
    if (!mine.length) return null;

    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secEvidence)));
    s.appendChild(el("p","sub", t(UI.evidenceIntro)));

    mine.forEach(function(c){
      var cite = null, i;
      for (i = 0; i < D.citations.length; i++){
        if (D.citations[i].id === c.supportedBy) cite = D.citations[i];
      }
      var box = el("div","ev");
      box.appendChild(el("p","stmt", t(c.statement)));
      if (cite){
        var bits = [];
        if (cite.population) bits.push(t(cite.population));
        if (cite.participants) bits.push(cite.participants + " " + t(UI.people));
        if (cite.durationDays) bits.push(cite.durationDays + " " + t(UI.days));
        box.appendChild(el("div","who", bits.join(listSep()) ));
      }
      if (c.qualifications && c.qualifications.length){
        box.appendChild(el("div","qh", t(UI.qualsHeading)));
        var ul = el("ul");
        c.qualifications.forEach(function(q){ ul.appendChild(el("li", null, t(q))); });
        box.appendChild(ul);
      }
      if (cite && cite.url){
        var sr = el("div","src");
        var a = document.createElement("a");
        a.href = cite.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.textContent = [cite.authors, cite.year, cite.journal].join(listSep());
        sr.appendChild(a);
        box.appendChild(sr);
      }
      s.appendChild(box);
    });
    return s;
  }

  function sectionOther(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secOther)));
    s.appendChild(el("p","sub", t(UI.colourNote)));

    /* Gelatin is lifted out of the table. In this market it is the question
       asked first, and a table cell is not room enough to answer it. */
    var gelatin = null, rest = [];
    D.nonActiveIngredients.forEach(function(n){
      if (gelatin === null && n.eNumber === null && n.restrictions && n.restrictions.length) gelatin = n;
      else rest.push(n);
    });
    if (gelatin && FLAGS.restrictions){
      var g = el("div","gel");
      g.appendChild(el("h3", null, t(UI.gelatinHeading)));
      gelatin.restrictions.forEach(function(r){ g.appendChild(el("p", null, t(r))); });
      s.appendChild(g);
    } else if (gelatin){
      rest.unshift(gelatin);
    }

    var tb = el("table","other");
    rest.forEach(function(n){
      var tr = el("tr");
      var td = el("td");
      td.appendChild(el("div", null, t(n.name)));
      td.appendChild(el("div","why", t(n.purpose)));
      if (FLAGS.restrictions && n.restrictions && n.restrictions.length){
        n.restrictions.forEach(function(r){
          var rd = el("div","restr");
          rd.appendChild(el("b", null, t(UI.restrictionLabel)));
          rd.appendChild(document.createTextNode(t(r)));
          td.appendChild(rd);
        });
      }
      tr.appendChild(td);
      tr.appendChild(el("td", null, n.eNumber || ""));
      tb.appendChild(tr);
    });
    s.appendChild(tb);
    return s;
  }

  function sectionContact(){
    var s = el("section");
    s.appendChild(el("div","eyebrow", t(UI.secContact)));
    var ul = el("ul","facts");
    function row(label, value){
      var li = el("li");
      li.appendChild(el("b", null, label));
      li.appendChild(document.createTextNode(value));
      ul.appendChild(li);
    }
    row(t(UI.madeBy), t(D.product.manufacturedBy));
    row(t(UI.madeFor), t(D.product.manufacturedFor));
    row(t(UI.regLabel), t(D.product.registration.authority) + " " + D.product.registration.number);
    row(t(UI.storage), t(D.product.storage));
    row(t(UI.web), D.product.website);
    s.appendChild(ul);

    var a = document.createElement("a");
    a.className = "call";
    a.href = "tel:" + D.product.telephone;
    a.textContent = t(UI.phone) + "  " + D.product.telephone;
    s.appendChild(a);
    return s;
  }

  var BUILDERS = {
    "what-it-is": sectionWhat,
    "how-to-take": sectionHow,
    "ingredients": sectionInside,
    "evidence": sectionEvidence,
    "safety": sectionAvoid,
    "contact": sectionContact
  };

  function renderMain(){
    var main = document.getElementById("main");
    main.innerHTML = "";
    if (!path) return;
    var cfg = null, i;
    for (i = 0; i < D.paths.length; i++){ if (D.paths[i].id === path) cfg = D.paths[i]; }
    var order = cfg.sectionOrder.filter(function(k){ return BUILDERS[k]; });
    var built = [];
    order.forEach(function(key){
      var node = BUILDERS[key]();
      if (node) built.push(node);
    });
    built.forEach(function(node, idx){
      main.appendChild(node);
      if (idx < built.length - 1) main.appendChild(el("hr","rule"));
    });
    main.appendChild(el("hr","rule"));
    main.appendChild(sectionOther());
  }

  function leadFor(id){ return (id === "pain") ? UI.painLead : UI.prevLead; }

  function renderDoors(){
    var box = document.getElementById("doors");
    box.innerHTML = "";
    D.paths.forEach(function(p){
      var b = el("button","door");
      b.type = "button";
      b.appendChild(el("span","big", t(p.door)));
      b.appendChild(el("span","small", t(leadFor(p.id))));
      b.addEventListener("click", function(){
        goTo(p.id, true);
      });
      box.appendChild(b);
    });
  }

  function renderAll(){
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";
    document.title = t(UI.pageTitle);
    document.getElementById("title").textContent = t(D.product.name);
    document.getElementById("tagline").textContent =
      path ? t(leadFor(path)) : t(UI.tagline);
    document.getElementById("chooseDoor").textContent = t(UI.chooseDoor);
    document.getElementById("doorHint").textContent = t(UI.doorHint);
    document.getElementById("reg").textContent = t(D.product.countryOfManufacture);
    document.getElementById("disclaimer").textContent = t(D.product.disclaimer);
    document.getElementById("back").textContent = t(UI.backToDoors);
    document.getElementById("topbacktext").textContent = t(UI.back);
    document.getElementById("topbackarrow").textContent = (lang === "ar") ? "→" : "←";
    renderDoors();
    renderMain();
  }

  var btns = document.querySelectorAll(".lang button");
  for (var i = 0; i < btns.length; i++){
    btns[i].addEventListener("click", function(e){
      lang = e.currentTarget.getAttribute("data-lang");
      saveLang(lang);
      for (var j = 0; j < btns.length; j++){
        btns[j].setAttribute("aria-pressed", String(btns[j].getAttribute("data-lang") === lang));
      }
      renderAll();
    });
  }
  for (var k2 = 0; k2 < btns.length; k2++){
    btns[k2].setAttribute("aria-pressed", String(btns[k2].getAttribute("data-lang") === lang));
  }

  function goTo(next, push){
    path = next;
    if (path){
      body.setAttribute("data-path", path);
      body.className = "reg-" + path;
    } else {
      body.removeAttribute("data-path");
      body.className = "";
    }
    renderAll();
    window.scrollTo(0, 0);
    if (push && window.history && window.history.pushState){
      window.history.pushState({path: path}, "", path ? ("#" + path) : "#");
    }
  }

  function goBack(){
    if (window.history && window.history.length > 1){ window.history.back(); }
    else { goTo(null, true); }
  }

  document.getElementById("back").addEventListener("click", goBack);
  document.getElementById("topback").addEventListener("click", goBack);

  window.addEventListener("popstate", function(e){
    var next = (e.state && e.state.path) ? e.state.path : null;
    goTo(next, false);
  });

  var opened = (location.hash || "").replace("#", "");
  var valid = false, k;
  for (k = 0; k < D.paths.length; k++){ if (D.paths[k].id === opened) valid = true; }
  goTo(valid ? opened : null, false);
  if (window.history && window.history.replaceState){
    window.history.replaceState({path: path}, "", path ? ("#" + path) : "#");
  }
})();
