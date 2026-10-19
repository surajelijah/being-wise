(function () {
  "use strict";

  var REFRESH_MS = 15000;

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  var voterId = store.get("bw.voterId", null);
  if (!voterId) { voterId = uuid(); store.set("bw.voterId", voterId); }
  var voted = new Set(store.get("bw.voted", []));

  // ---- Data layer -------------------------------------------------------
  // Uses the site's /api endpoints; falls back to browser-only preview mode
  // when the database isn't connected (503) or the API isn't reachable.
  var LIVE = true;
  var serverApi = {
    list: function () {
      return fetch("/api/questions", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw Object.assign(new Error("list failed"), { status: r.status });
        return r.json();
      });
    },
    add: function (text, name) { return post("/api/questions", { text: text, name: name }); },
    vote: function (id) { return post("/api/vote", { id: id, voterId: voterId }); }
  };
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: r.status, userMessage: data.error });
          return data;
        });
      });
  }
  var api = serverApi;

  function localApi() {
    function all() { return store.get("bw.demo.questions", []); }
    return {
      list: function () { return Promise.resolve(all()); },
      add: function (text, name) {
        var qs = all();
        var id = uuid();
        qs.push({ id: id, text: text, name: name || null, created_at: new Date().toISOString(), votes: 0 });
        store.set("bw.demo.questions", qs);
        return Promise.resolve({ id: id });
      },
      vote: function (id) {
        var qs = all();
        qs.forEach(function (q) { if (q.id === id) q.votes += 1; });
        store.set("bw.demo.questions", qs);
        return Promise.resolve();
      }
    };
  }

  // ---- UI ---------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var list = $("q-list"), form = $("ask-form"), text = $("q-text"), nameEl = $("q-name"), msg = $("form-msg"), btn = $("ask-btn");
  var questions = [], sort = "top", highlightId = null, toastTimer;

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    var units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(s / units[i][1]);
      if (n >= 1) return n + " " + units[i][0] + (n > 1 ? "s" : "") + " ago";
    }
  }

  function render() {
    var sorted = questions.slice().sort(function (a, b) {
      if (sort === "top" && b.votes !== a.votes) return b.votes - a.votes;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    list.innerHTML = sorted.map(function (q, i) {
      var isVoted = voted.has(q.id);
      var who = q.name ? esc(q.name) : "Anonymous";
      var isNew = q.id === highlightId;
      return '<li class="q-item' + (isNew ? " highlight" : "") + '" id="q-' + esc(q.id) + '">' +
        '<span class="num">' + String(i + 1).padStart(2, "0") + '</span>' +
        '<div class="q-body"><p class="q-text">' + esc(q.text) + '</p>' +
        '<div class="q-meta"><span class="who">' + who + '</span> · ' + ago(q.created_at) + (isNew ? '<span class="new-tag">Your question</span>' : "") + '</div></div>' +
        '<button class="vote' + (isVoted ? " voted" : "") + '" data-id="' + esc(q.id) + '"' + (isVoted ? " disabled" : "") +
        ' aria-label="' + (isVoted ? "You voted for this question" : "Vote for this question") + '">' + ARROW +
        '<span class="n">' + q.votes + '</span><small>' + (q.votes === 1 ? "vote" : "votes") + '</small></button></li>';
    }).join("");
    $("empty").hidden = questions.length > 0;
    $("tab-count").textContent = questions.length;
    $("stat-questions").textContent = questions.length;
    $("stat-votes").textContent = questions.reduce(function (t, q) { return t + q.votes; }, 0);
    $("stat-seekers").textContent = new Set(questions.filter(function (q) { return q.name; }).map(function (q) { return q.name.trim().toLowerCase(); })).size;
  }

  function load() {
    return api.list().then(function (rows) { questions = rows; render(); })
      .catch(function (err) {
        if (api === serverApi && (err.status === 503 || err.status === 404 || !err.status)) {
          LIVE = false; api = localApi(); $("demo-banner").hidden = false;
          return load();
        }
        toast("Could not load questions. Please refresh in a moment.");
      });
  }

  text.addEventListener("input", function () { $("q-count").textContent = text.value.length; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = text.value.trim(), n = nameEl.value.trim();
    if (t.length < 3) { msg.textContent = "Please share a little more of your question."; return; }
    btn.disabled = true; msg.textContent = "";
    api.add(t, n).then(function (res) {
      form.reset(); $("q-count").textContent = "0";
      highlightId = res && res.id;
      sort = "new"; syncSort();
      return load().then(function () {
        showTab("list");
        celebrate(function () {
          var el = highlightId && document.getElementById("q-" + highlightId);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(function () { highlightId = null; var h = document.querySelector(".q-item.highlight"); if (h) h.classList.remove("highlight"); }, 6000);
        });
      });
    }).catch(function (err) {
      msg.textContent = err.userMessage || "Something went wrong. Please try again.";
    }).then(function () { btn.disabled = false; });
  });

  list.addEventListener("click", function (e) {
    var b = e.target.closest(".vote");
    if (!b || b.disabled) return;
    var id = b.getAttribute("data-id");
    b.disabled = true;
    // Optimistic update
    voted.add(id); store.set("bw.voted", Array.from(voted));
    questions.forEach(function (q) { if (q.id === id) q.votes += 1; });
    render();
    api.vote(id).then(load).catch(function () {
      voted.delete(id); store.set("bw.voted", Array.from(voted));
      toast("Your vote could not be saved. Please try again.");
      load();
    });
  });

  function syncSort() {
    document.querySelectorAll(".sort button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-sort") === sort); });
  }
  document.querySelector(".sort").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sort]");
    if (!b) return;
    sort = b.getAttribute("data-sort"); syncSort(); render();
  });

  // ---- Tabs -------------------------------------------------------------
  var tabs = { list: $("tab-list"), ask: $("tab-ask") };
  var panels = { list: $("panel-list"), ask: $("panel-ask") };
  function showTab(name, focus) {
    Object.keys(tabs).forEach(function (k) {
      var on = k === name;
      tabs[k].setAttribute("aria-selected", on);
      tabs[k].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    if (focus) tabs[name].focus();
    if (name === "ask") { msg.textContent = ""; text.focus({ preventScroll: true }); }
    history.replaceState(null, "", name === "ask" ? "#ask" : location.pathname);
  }
  tabs.list.addEventListener("click", function () { showTab("list"); });
  tabs.ask.addEventListener("click", function () { showTab("ask"); });
  document.querySelector(".tabs").addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") showTab(tabs.list.getAttribute("aria-selected") === "true" ? "ask" : "list", true);
  });
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-goto]");
    if (g) showTab(g.getAttribute("data-goto"));
  });
  if (location.hash === "#ask") showTab("ask");

  // ---- Celebration ------------------------------------------------------
  function celebrate(onClose) {
    var c = $("celebrate"), sp = $("sparkles"), close = $("celebrate-close"), prev = document.activeElement;
    sp.innerHTML = "";
    for (var i = 0; i < 46; i++) {
      var d = document.createElement("span");
      if (i % 3 === 0) d.className = "star";
      d.style.left = (Math.random() * 100) + "%";
      d.style.animationDuration = (4 + Math.random() * 5) + "s";
      d.style.animationDelay = (-Math.random() * 8) + "s";
      sp.appendChild(d);
    }
    c.classList.remove("closing");
    c.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(function () { close.focus(); }, 50);

    function done() {
      c.removeEventListener("keydown", onKey);
      close.removeEventListener("click", done);
      c.classList.add("closing");
      setTimeout(function () {
        c.hidden = true; sp.innerHTML = ""; document.body.style.overflow = "";
        if (prev && prev.focus) prev.focus({ preventScroll: true });
        onClose && onClose();
      }, 380);
    }
    function onKey(e) { if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); if (e.key === "Escape") done(); } }
    close.addEventListener("click", done);
    c.addEventListener("keydown", onKey);
  }

  function toast(m) {
    var t = $("toast");
    t.textContent = m; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4000);
  }

  load();
  setInterval(function () { if (LIVE && !document.hidden) load(); }, REFRESH_MS);
})();
