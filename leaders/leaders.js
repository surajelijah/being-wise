(function () {
  "use strict";

  var KEY_STORE = "bw.leaderKey";
  var $ = function (id) { return document.getElementById(id); };
  var key = null, questions = [], toastTimer;

  try { key = sessionStorage.getItem(KEY_STORE); } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function when(iso) {
    return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function toast(m) {
    var t = $("toast"); t.textContent = m; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function admin(body, asKey) {
    return fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": (asKey !== undefined ? asKey : key) || "" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: r.status });
        return data;
      });
    });
  }

  function showMod(on) {
    $("login-panel").hidden = on;
    $("mod-panel").hidden = !on;
    $("change-panel").hidden = true;
    if (on) load(); else $("passcode").focus();
  }

  function signOut(message) {
    key = null;
    try { sessionStorage.removeItem(KEY_STORE); } catch (e) {}
    showMod(false);
    if (message) $("login-msg").textContent = message;
  }

  function load() {
    return fetch("/api/questions", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (rows) { questions = rows; render(); })
      .catch(function () { toast("Could not load questions."); });
  }

  function render() {
    var f = $("filter").value.trim().toLowerCase();
    var rows = questions.filter(function (q) {
      return !f || q.text.toLowerCase().indexOf(f) !== -1 || (q.name || "").toLowerCase().indexOf(f) !== -1;
    });
    $("mod-count").textContent = questions.length;
    $("mod-list").innerHTML = rows.map(function (q, i) {
      return '<li class="q-item mod" data-id="' + esc(q.id) + '">' +
        '<span class="num">' + String(i + 1).padStart(2, "0") + '</span>' +
        '<div class="q-body"><p class="q-text">' + esc(q.text) + '</p>' +
        '<div class="q-meta"><span class="who">' + (q.name ? esc(q.name) : "Anonymous") + '</span> · ' + when(q.created_at) +
        '<span class="mod-votes">· ' + q.votes + (q.votes === 1 ? " vote" : " votes") + '</span></div></div>' +
        '<button type="button" class="del-btn" data-id="' + esc(q.id) + '">Delete</button></li>';
    }).join("");
    $("mod-empty").hidden = rows.length > 0;
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    key = $("passcode").value;
    $("login-btn").disabled = true; $("login-msg").textContent = "";
    admin({ action: "check" }).then(function () {
      try { sessionStorage.setItem(KEY_STORE, key); } catch (err) {}
      $("passcode").value = "";
      showMod(true);
    }).catch(function (err) {
      key = null;
      $("login-msg").textContent = err.message;
    }).then(function () { $("login-btn").disabled = false; });
  });

  // Two-step delete: first click arms the button, second click deletes.
  $("mod-list").addEventListener("click", function (e) {
    var b = e.target.closest(".del-btn");
    if (!b || b.disabled) return;
    if (!b.classList.contains("confirm")) {
      document.querySelectorAll(".del-btn.confirm").forEach(function (x) { x.classList.remove("confirm"); x.textContent = "Delete"; });
      b.classList.add("confirm"); b.textContent = "Confirm delete";
      return;
    }
    var id = b.getAttribute("data-id"), li = b.closest(".q-item");
    b.disabled = true; b.textContent = "Deleting…";
    admin({ action: "delete", id: id }).then(function () {
      li.classList.add("removing");
      setTimeout(function () {
        questions = questions.filter(function (q) { return q.id !== id; });
        render();
      }, 300);
      toast("Question deleted.");
    }).catch(function (err) {
      if (err.status === 401) return signOut("Your session has expired. Please sign in again.");
      b.disabled = false; b.classList.remove("confirm"); b.textContent = "Delete";
      toast(err.message);
    });
  });

  // ---- Change passcode ----
  $("open-change").addEventListener("click", function () {
    $("mod-panel").hidden = true; $("change-panel").hidden = false;
    $("change-msg").textContent = ""; $("cur-pass").focus();
  });
  $("cancel-change").addEventListener("click", function () {
    $("change-form").reset(); $("change-panel").hidden = true; $("mod-panel").hidden = false;
  });
  $("change-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var cur = $("cur-pass").value, next = $("new-pass").value, again = $("new-pass2").value, msg = $("change-msg");
    if (next.length < 8) { msg.textContent = "New passcode must be at least 8 characters."; return; }
    if (next !== again) { msg.textContent = "The new passcodes don't match."; return; }
    if (next === cur) { msg.textContent = "The new passcode is the same as the current one."; return; }
    $("change-btn").disabled = true; msg.textContent = "";
    admin({ action: "change-passcode", newPasscode: next }, cur).then(function () {
      key = next;
      try { sessionStorage.setItem(KEY_STORE, key); } catch (err) {}
      $("change-form").reset();
      $("change-panel").hidden = true; $("mod-panel").hidden = false;
      toast("Passcode changed. Share the new one with your leaders.");
    }).catch(function (err) {
      msg.textContent = err.status === 401 ? "Current passcode is incorrect." : err.message;
    }).then(function () { $("change-btn").disabled = false; });
  });

  $("filter").addEventListener("input", render);
  $("refresh").addEventListener("click", function () { load().then(function () { toast("Refreshed."); }); });
  $("logout").addEventListener("click", function () { signOut(); });

  if (key) {
    admin({ action: "check" }).then(function () { showMod(true); }).catch(function () { signOut(); });
  } else {
    showMod(false);
  }
})();
