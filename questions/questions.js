(function () {
  "use strict";

  var cfg = window.BW_CONFIG || {};
  var LIVE = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
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
  var api = LIVE ? supabaseApi() : localApi();

  function supabaseApi() {
    var base = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/";
    var headers = {
      apikey: cfg.supabaseAnonKey,
      Authorization: "Bearer " + cfg.supabaseAnonKey,
      "Content-Type": "application/json"
    };
    function req(path, opts) {
      return fetch(base + path, Object.assign({ headers: headers }, opts)).then(function (r) {
        if (!r.ok && r.status !== 409) throw new Error("Request failed (" + r.status + ")");
        return r.status === 204 || r.status === 201 || r.status === 409 ? null : r.json();
      });
    }
    return {
      list: function () {
        return req("questions?select=id,text,name,created_at,votes(count)&order=created_at.desc").then(function (rows) {
          return rows.map(function (q) {
            return { id: q.id, text: q.text, name: q.name, created_at: q.created_at, votes: (q.votes && q.votes[0] && q.votes[0].count) || 0 };
          });
        });
      },
      add: function (text, name) {
        return req("questions", { method: "POST", headers: Object.assign({ Prefer: "return=minimal" }, headers), body: JSON.stringify({ text: text, name: name || null }) });
      },
      vote: function (id) {
        return req("votes", { method: "POST", headers: Object.assign({ Prefer: "return=minimal" }, headers), body: JSON.stringify({ question_id: id, voter_id: voterId }) });
      }
    };
  }

  function localApi() {
    function all() { return store.get("bw.demo.questions", []); }
    return {
      list: function () { return Promise.resolve(all()); },
      add: function (text, name) {
        var qs = all();
        qs.push({ id: uuid(), text: text, name: name || null, created_at: new Date().toISOString(), votes: 0 });
        store.set("bw.demo.questions", qs);
        return Promise.resolve();
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
  var questions = [], sort = "top";

  if (!LIVE) $("demo-banner").hidden = false;

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
      return '<li class="q-item">' +
        '<span class="num">' + String(i + 1).padStart(2, "0") + '</span>' +
        '<div class="q-body"><p class="q-text">' + esc(q.text) + '</p>' +
        '<div class="q-meta"><span class="who">' + who + '</span> · ' + ago(q.created_at) + '</div></div>' +
        '<button class="vote' + (isVoted ? " voted" : "") + '" data-id="' + esc(q.id) + '"' + (isVoted ? " disabled" : "") +
        ' aria-label="' + (isVoted ? "You voted for this question" : "Vote for this question") + '">' + ARROW +
        '<span class="n">' + q.votes + '</span><small>' + (q.votes === 1 ? "vote" : "votes") + '</small></button></li>';
    }).join("");
    $("empty").hidden = questions.length > 0;
    $("stat-questions").textContent = questions.length;
    $("stat-votes").textContent = questions.reduce(function (t, q) { return t + q.votes; }, 0);
    $("stat-seekers").textContent = new Set(questions.filter(function (q) { return q.name; }).map(function (q) { return q.name.trim().toLowerCase(); })).size;
  }

  function load() {
    return api.list().then(function (rows) { questions = rows; render(); })
      .catch(function () { msg.textContent = "Could not load questions. Please refresh in a moment."; });
  }

  text.addEventListener("input", function () { $("q-count").textContent = text.value.length; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = text.value.trim(), n = nameEl.value.trim();
    if (t.length < 3) { msg.textContent = "Please share a little more of your question."; return; }
    btn.disabled = true; msg.textContent = "";
    api.add(t, n).then(function () {
      form.reset(); $("q-count").textContent = "0";
      msg.textContent = "Thank you — your question has been received.";
      sort = "new"; syncSort();
      return load();
    }).catch(function () {
      msg.textContent = "Something went wrong. Please try again.";
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
      msg.textContent = "Your vote could not be saved. Please try again.";
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

  load();
  if (LIVE) setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
})();
