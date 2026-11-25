/* Techno-Hangar · effets visuels (JavaScript simple, sans dépendance).
   Inspirés de React Bits (MIT), réécrits pour le site. Tout est coupé si l'élève
   a demandé de réduire les animations. */
(function () {
  "use strict";
  var CALME = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var RAR = { commun: "#8b8b96", rare: "#2fd39a", epique: "#b07cff", legendaire: "#f5b74a", jeton: "#f5b74a" };
  var NOMS = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  /* ---------- SplitText : lettres qui apparaissent en décalé ---------- */
  function split(n, texte, retard) {
    n.textContent = ""; n.setAttribute("aria-label", texte);
    var k = 0;
    texte.split(" ").forEach(function (mot, i) {
      if (i) n.appendChild(document.createTextNode(" "));
      var m = el("span", "fx-mot"); m.setAttribute("aria-hidden", "true");
      Array.from(mot).forEach(function (c) {
        var s = el("span", "fx-l", c); s.style.transitionDelay = ((retard || 0) + k * 28) + "ms"; k++; m.appendChild(s);
      });
      n.appendChild(m);
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { n.classList.add("fx-on"); }); });
    return n;
  }

  /* ---------- ClickSpark : étincelles au clic ---------- */
  function etincelles(x, y, couleur) {
    if (CALME) return;
    for (var i = 0; i < 10; i++) {
      var s = el("i", "fx-spark");
      s.style.left = x + "px"; s.style.top = y + "px"; s.style.background = couleur || "#f5b74a";
      s.style.setProperty("--a", (i * 36 + Math.random() * 12) + "deg");
      document.body.appendChild(s);
      setTimeout(function (n) { return function () { n.remove(); }; }(s), 650);
    }
  }
  function spark(bouton, couleur) {
    bouton.addEventListener("click", function (e) {
      var r = bouton.getBoundingClientRect();
      etincelles(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, couleur);
    });
    return bouton;
  }

  /* ---------- Révélation d'une récompense (le « moment » du pass) ----------
     items : [{ nom, rarete, type ("avatar", "titre", "jeton", "banniere"…), visuel: Element, sous: "Palier 4 · Saison 2" }]
     opts  : { lien: "…profil#pass", texteLien: "Voir mon pass" } */
  function reveler(items, opts) {
    if (!items || !items.length || document.querySelector(".fx-rev")) return;
    opts = opts || {};
    var d = el("dialog", "fx-rev");
    d.setAttribute("aria-label", "Nouvelle récompense");
    var i = 0;
    function montrer() {
      var it = items[i], rar = it.type === "jeton" ? "jeton" : (it.rarete || "commun"), c = RAR[rar] || RAR.commun;
      d.innerHTML = "";
      d.style.setProperty("--rc", c);
      d.className = "fx-rev r-" + rar;
      var scene = el("div", "fx-scene");
      scene.appendChild(el("div", "fx-rayons"));
      scene.appendChild(el("div", "fx-halo"));
      if (rar === "legendaire" && !CALME) for (var k = 0; k < 14; k++) {
        var p = el("i", "fx-braise"); p.style.left = (8 + Math.random() * 84) + "%";
        p.style.animationDelay = (Math.random() * 2.4) + "s"; p.style.animationDuration = (2.2 + Math.random() * 1.6) + "s"; scene.appendChild(p);
      }
      var vis = el("div", "fx-vis"); if (it.visuel) vis.appendChild(it.visuel); scene.appendChild(vis);
      d.appendChild(scene);
      var txt = el("div", "fx-txt");
      txt.appendChild(el("div", "fx-sur", items.length > 1 ? "Nouveau palier · " + (i + 1) + " / " + items.length : "Nouveau palier"));
      txt.appendChild(split(el("h2", "fx-nom"), it.nom || "", 350));
      txt.appendChild(el("div", "fx-rar", it.type === "jeton" ? "À échanger en boutique" : (NOMS[rar] || "") + (it.typeNom ? " · " + it.typeNom : "")));
      if (it.sous) txt.appendChild(el("small", "fx-sous", it.sous));
      d.appendChild(txt);
      var bas = el("div", "fx-bas");
      if (opts.lien) { var a = el("a", "btn", opts.texteLien || "Voir"); a.href = opts.lien; bas.appendChild(a); }
      var ok = el("button", "btn primary", i < items.length - 1 ? "Suivant" : "Super");
      ok.type = "button";
      ok.onclick = function (e) {
        etincelles(e.clientX, e.clientY, c);
        if (i < items.length - 1) { i++; montrer(); } else fermer();
      };
      bas.appendChild(ok); d.appendChild(bas);
      setTimeout(function () { ok.focus(); }, 50);
    }
    function fermer() { d.classList.add("fx-sort"); setTimeout(function () { try { d.close(); } catch (e) {} d.remove(); }, CALME ? 0 : 220); }
    d.addEventListener("cancel", function (e) { e.preventDefault(); fermer(); });
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    document.body.appendChild(d);
    montrer();
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
  }

  /* ---------- Bannières animées (canvas) : .bn-anim-aurore, .bn-anim-etoiles ---------- */
  var SCENES = {
    aurore: function (cx, w, h, t, etat) {
      // dessin en basse résolution puis agrandi : rideaux doux et peu coûteux
      var lw = Math.max(40, Math.round(w / 4)), lh = Math.max(12, Math.round(h / 4));
      if (!etat.bas || etat.bas.width !== lw) {
        etat.bas = document.createElement("canvas"); etat.bas.width = lw; etat.bas.height = lh;
        var s = document.createElement("canvas"); s.width = 1; s.height = 128;
        var g = s.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128);
        gr.addColorStop(0, "rgba(120,80,255,0)"); gr.addColorStop(.35, "rgba(120,90,255,.30)");
        gr.addColorStop(.72, "rgba(40,230,170,.70)"); gr.addColorStop(1, "rgba(40,230,170,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 1, 128); etat.sprite = s;
      }
      var b2 = etat.bas.getContext("2d");
      b2.globalCompositeOperation = "source-over"; b2.fillStyle = "#050b14"; b2.fillRect(0, 0, lw, lh);
      b2.globalCompositeOperation = "lighter";
      var bandes = [[.42, .9, .00055, .00035, .55], [.55, 1.3, .0009, -.0004, .4], [.34, .6, .0004, .00025, .35]];
      for (var k = 0; k < bandes.length; k++) {
        var q = bandes[k]; b2.globalAlpha = q[4];
        for (var x = 0; x < lw; x++) {
          var u = x / lw;
          var y = lh * q[0] + Math.sin(u * 6.2 * q[1] + t * q[2] * 6) * lh * .12 + Math.sin(u * 14 - t * q[3] * 9) * lh * .05;
          var lg = lh * (.42 + .2 * Math.sin(u * 9 + t * .0008 + k));
          b2.drawImage(etat.sprite, x, y - lg * .6, 1, lg);
        }
      }
      b2.globalAlpha = 1; b2.globalCompositeOperation = "source-over";
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
      cx.drawImage(etat.bas, 0, 0, w, h);
    },
    etoiles: function (cx, w, h, t, etat) {
      if (!etat.fond || etat.w !== w) {
        etat.w = w;
        var f = document.createElement("canvas"); f.width = w; f.height = h;
        var g = f.getContext("2d");
        g.fillStyle = "#04050c"; g.fillRect(0, 0, w, h);
        [[.25, .6, "rgba(120,80,255,.32)"], [.7, .35, "rgba(40,140,255,.26)"], [.55, .8, "rgba(245,183,74,.14)"]].forEach(function (n) {
          var r = g.createRadialGradient(w * n[0], h * n[1], 0, w * n[0], h * n[1], w * .35);
          r.addColorStop(0, n[2]); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h);
        });
        etat.fond = f;
        etat.st = []; for (var i = 0; i < Math.round(w * h / 900); i++) etat.st.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + .3, p: Math.random() * 6.28, v: Math.random() * .012 + .004 });
        etat.filante = null;
      }
      cx.drawImage(etat.fond, 0, 0);
      for (var k = 0; k < etat.st.length; k++) {
        var s = etat.st[k], x = (s.x + t * s.v) % w;
        cx.globalAlpha = .45 + .55 * Math.abs(Math.sin(s.p + t * .0015 * (1 + s.r)));
        cx.fillStyle = "#fff"; cx.fillRect(x, s.y, s.r, s.r);
      }
      cx.globalAlpha = 1;
      if (!etat.filante && Math.random() < .004) etat.filante = { x: Math.random() * w * .7, y: Math.random() * h * .4, t0: t };
      if (etat.filante) {
        var a = (t - etat.filante.t0) / 700;
        if (a > 1) etat.filante = null;
        else {
          var x0 = etat.filante.x + a * w * .3, y0 = etat.filante.y + a * h * .35;
          var gr = cx.createLinearGradient(x0, y0, x0 - 60, y0 - 70 * h / w);
          gr.addColorStop(0, "rgba(255,255,255," + (1 - a) + ")"); gr.addColorStop(1, "rgba(255,255,255,0)");
          cx.strokeStyle = gr; cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 - 60, y0 - 70 * h / w); cx.stroke();
        }
      }
    }
  };
  function animer(n) {
    if (n._fx) return; n._fx = true;
    var m = /bn-anim-([a-z]+)/.exec(n.className), scene = m && SCENES[m[1]];
    if (!scene) return;
    var cv = el("canvas", "fx-bn-cv"); cv.setAttribute("aria-hidden", "true");
    n.insertBefore(cv, n.firstChild);
    var cx = cv.getContext("2d"), etat = {}, visible = false, raf = 0, dpr = Math.min(1.5, window.devicePixelRatio || 1), w = 0, h = 0;
    function taille() {
      var r = n.getBoundingClientRect(); w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0); etat.fond = null;
    }
    function image(t) { if (!n.isConnected) return; scene(cx, w, h, t, etat); if (visible && !CALME && !document.hidden) raf = requestAnimationFrame(image); }
    taille(); image(performance.now());
    if (CALME) return;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(image);
    }).observe(n);
    document.addEventListener("visibilitychange", function () { cancelAnimationFrame(raf); if (visible && !document.hidden) raf = requestAnimationFrame(image); });
    if ("ResizeObserver" in window) new ResizeObserver(function () { taille(); if (!visible || CALME) image(performance.now()); }).observe(n);
  }
  function chercher(racine) { [].forEach.call((racine || document).querySelectorAll('[class*="bn-anim-"]'), animer); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { chercher(); });
  else chercher();
  new MutationObserver(function (l) {
    l.forEach(function (m) { m.addedNodes.forEach(function (x) { if (x.nodeType === 1) { if (/bn-anim-/.test(x.className)) animer(x); chercher(x); } }); });
  }).observe(document.documentElement, { childList: true, subtree: true });


  /* ---------- Secousse (erreur de saisie) ---------- */
  function secouer(n) { if (CALME || !n) return; n.classList.remove("fx-secoue"); void n.offsetWidth; n.classList.add("fx-secoue"); setTimeout(function () { n.classList.remove("fx-secoue"); }, 500); }

  /* ---------- Entrée en cascade d'une zone (une seule fois) ---------- */
  function entree(zone, selecteur) {
    if (!zone) return;
    if (zone.dataset.fxVu) { zone.classList.remove("fx-entree"); return; }
    zone.dataset.fxVu = "1";
    if (CALME) return;
    zone.classList.add("fx-entree");
    [].forEach.call(zone.querySelectorAll(selecteur || ".carte, .seq-titre, h2, .spe-bloc, .spe-tag"), function (c, k) { c.style.setProperty("--i", Math.min(k, 14)); });
    setTimeout(function () { zone.classList.remove("fx-entree"); }, 1600);
  }

  /* ---------- Inclinaison légère des cartes (souris seulement) ---------- */
  if (!CALME && window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest && e.target.closest(".carte.res:not(.off), .carte.outil:not(.off)"); if (!c) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.setProperty("--ry", (x * 5).toFixed(2) + "deg"); c.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg");
    });
    document.addEventListener("pointerout", function (e) {
      var c = e.target.closest && e.target.closest(".carte"); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); }
    });
  }

  /* ---------- Fond de points qui réagit au pointeur (écran de connexion) ---------- */
  function grillePoints(hote, couleur) {
    var cv = el("canvas", "fx-points"); cv.setAttribute("aria-hidden", "true"); hote.insertBefore(cv, hote.firstChild);
    var cx = cv.getContext("2d"), dpr = Math.min(1.5, window.devicePixelRatio || 1), w = 0, h = 0, pts = [], P = { x: -999, y: -999, a: 0 }, raf = 0, t0 = performance.now();
    var PAS = 26, rgb = couleur || [91, 140, 255];
    function taille() {
      w = innerWidth; h = innerHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = []; for (var y = PAS / 2; y < h; y += PAS) for (var x = PAS / 2; x < w; x += PAS) pts.push(x, y);
    }
    function image(t) {
      cx.clearRect(0, 0, w, h);
      var onde = ((t - t0) % 7000) / 7000 * Math.hypot(w, h) * 1.3, cxO = w / 2, cyO = h * .3;
      P.a += ((P.x > -900 ? 1 : 0) - P.a) * .08;
      for (var i = 0; i < pts.length; i += 2) {
        var x = pts[i], y = pts[i + 1], dx = x - P.x, dy = y - P.y, d = Math.sqrt(dx * dx + dy * dy), k = 0, ox = 0, oy = 0;
        if (d < 150) { k = (1 - d / 150) * P.a; ox = dx / (d || 1) * k * 7; oy = dy / (d || 1) * k * 7; }
        var dO = Math.abs(Math.hypot(x - cxO, y - cyO) - onde), kO = dO < 60 ? (1 - dO / 60) * .55 : 0;
        var e = Math.max(k, kO);
        cx.fillStyle = e > .02 ? "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (.18 + e * .8).toFixed(3) + ")" : "rgba(237,237,240,.09)";
        var r = 1 + e * 1.6; cx.fillRect(x + ox - r / 2, y + oy - r / 2, r, r);
      }
      if (!CALME && !document.hidden) raf = requestAnimationFrame(image);
    }
    taille(); image(performance.now());
    addEventListener("resize", function () { taille(); if (CALME) image(performance.now()); });
    if (CALME) return;
    addEventListener("pointermove", function (e) { P.x = e.clientX; P.y = e.clientY; }, { passive: true });
    document.addEventListener("pointerleave", function () { P.x = P.y = -999; });
    document.addEventListener("visibilitychange", function () { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(image); });
  }

  window.TH_FX = { secouer: secouer, entree: entree, grillePoints: grillePoints, split: split, spark: spark, etincelles: etincelles, reveler: reveler, animer: animer, calme: CALME };
})();
