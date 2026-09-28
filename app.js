/* Java道場 — Java SE 17 Silver 対策。オフラインで動く1ページのアプリ。
 * 記録は端末の localStorage に置く（サーバーには何も送らない）。 */
(function () {
  "use strict";

  var QUESTIONS = (window.QUESTIONS || []).slice();
  var BY_ID = {};
  QUESTIONS.forEach(function (q) { BY_ID[q.id] = q; });

  var STORE_KEY = "javadojo.v1";
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // 箱の番号 → 次の出題までの日数
  var MAX_BOX = INTERVALS.length - 1;
  var EXAM_SIZE = 60, EXAM_MIN_PER_Q = 1.5, PASS_RATE = 0.65; // 本番：60問・90分・65%
  var TOPIC_ORDER = window.TOPIC_ORDER || [];

  // ---------- 記録 ----------
  function blank() {
    return { v: 1, cards: {}, days: {}, exams: [], settings: { newPerDay: 10, theme: "auto", topicsOff: [] } };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1) {
        var b = blank();
        s.settings = Object.assign(b.settings, s.settings || {});
        s.cards = s.cards || {}; s.days = s.days || {}; s.exams = s.exams || [];
        return s;
      }
    } catch (e) { /* 読めなければ新規 */ }
    return blank();
  }
  var S = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { toast("記録を保存できませんでした（容量不足の可能性）"); }
  }
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }

  function today(offset) {
    var d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function addDays(ymd, n) {
    var p = ymd.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function card(id) { return S.cards[id]; }

  function record(id, ok) {
    var t = today();
    var c = S.cards[id] || { box: 0, due: t, ok: 0, ng: 0, firstDay: t };
    if (ok) { c.ok++; c.box = Math.min(c.box + 1, MAX_BOX); c.due = addDays(t, INTERVALS[c.box]); }
    else { c.ng++; c.box = 0; c.due = addDays(t, 1); }
    c.last = t;
    S.cards[id] = c;
    S.days[t] = (S.days[t] || 0) + 1;
    save();
  }

  // ---------- 集計 ----------
  function dueIds() {
    var t = today();
    return QUESTIONS.filter(function (q) { var c = card(q.id); return c && c.due <= t; })
      .sort(function (a, b) { return card(a.id).due < card(b.id).due ? -1 : 1; })
      .map(function (q) { return q.id; });
  }
  function newToday() {
    var t = today(), n = 0;
    for (var id in S.cards) if (S.cards[id].firstDay === t) n++;
    return n;
  }
  function topicRank(t) { var i = TOPIC_ORDER.indexOf(t); return i < 0 ? 99 : i; }
  // 新しい問題は研修の順（分野の並び順）に出す。設定で外した分野は出さない（復習と模擬試験には出る）
  function unseenIds() {
    var off = S.settings.topicsOff || [];
    return QUESTIONS.map(function (q, i) { return { q: q, i: i }; })
      .filter(function (x) { return !card(x.q.id) && off.indexOf(x.q.topic) < 0; })
      .sort(function (a, b) { return topicRank(a.q.topic) - topicRank(b.q.topic) || a.i - b.i; })
      .map(function (x) { return x.q.id; });
  }
  function weakIds() {
    return QUESTIONS.filter(function (q) { var c = card(q.id); return c && c.ng > 0 && c.box <= 2; })
      .sort(function (a, b) { return card(b.id).ng - card(a.id).ng; })
      .map(function (q) { return q.id; });
  }
  function topics() {
    var seen = {}, list = [];
    QUESTIONS.forEach(function (q) { if (!seen[q.topic]) { seen[q.topic] = 1; list.push(q.topic); } });
    return list.sort(function (a, b) { return topicRank(a) - topicRank(b); });
  }
  function topicStat(t) {
    var qs = QUESTIONS.filter(function (q) { return q.topic === t; });
    var seen = 0, ok = 0, ng = 0, mastered = 0;
    qs.forEach(function (q) {
      var c = card(q.id); if (!c) return;
      seen++; ok += c.ok; ng += c.ng; if (c.box >= 3) mastered++;
    });
    return { total: qs.length, seen: seen, rate: ok + ng ? ok / (ok + ng) : null, mastered: mastered };
  }
  function streak() {
    var n = 0, d = S.days[today()] ? today() : today(-1);
    while (S.days[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- 表示の道具 ----------
  var root = document.getElementById("app");
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var KW = /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|non-sealed|package|permits|private|protected|public|record|return|sealed|short|static|super|switch|synchronized|this|throw|throws|try|var|void|volatile|while|yield|true|false|null)\b/;
  var KW_FULL = new RegExp("^" + KW.source + "$");
  function highlight(line) {
    var out = "", re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d[\d_]*(?:\.\d+)?[LlFfDd]?\b|\b0[xXbB][\da-fA-F_]+\b)|([A-Za-z_$][\w$-]*)/g, m, last = 0;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index));
      var t = m[0];
      if (m[1]) out += '<span class="tok-com">' + esc(t) + "</span>";
      else if (m[2]) out += '<span class="tok-str">' + esc(t) + "</span>";
      else if (m[3]) out += '<span class="tok-num">' + esc(t) + "</span>";
      else if (KW_FULL.test(t)) out += '<span class="tok-kw">' + esc(t) + "</span>";
      else out += esc(t);
      last = re.lastIndex;
    }
    return out + esc(line.slice(last));
  }
  function codeBlock(code) {
    var rows = code.replace(/\t/g, "    ").split("\n").map(function (ln, i) {
      return '<tr><td class="ln">' + (i + 1) + '</td><td class="src">' + (highlight(ln) || " ") + "</td></tr>";
    }).join("");
    return '<div class="code" role="region" aria-label="コード"><table><tbody>' + rows + "</tbody></table></div>";
  }
  function looksLikeCode(s) { return /[;{}()=]|^\s*(int|String|char|long|byte|short|double|float|var)\b/.test(s) && !/[ぁ-んァ-ン一-龥]/.test(s); }
  function bar(title, back, extra) {
    return '<div class="bar">' + (back ? '<button class="icon-btn" data-act="' + back + '" aria-label="戻る">← 戻る</button>' : "") +
      "<h1>" + esc(title) + "</h1>" + (extra || "") + "</div>";
  }
  var toastTimer;
  function toast(msg) {
    var el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  // 確認は画面内で行う（埋め込み表示では confirm() が使えないため）
  function ask(msg, okLabel, onOk) {
    var wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><p>' + esc(msg) + '</p><div class="menu" style="margin:0">' +
      '<button class="btn" data-m="no">やめておく</button><button class="btn primary" data-m="yes">' + esc(okLabel) + "</button></div></div>";
    wrap.addEventListener("click", function (e) {
      var m = e.target.getAttribute("data-m");
      if (m || e.target === wrap) { wrap.remove(); if (m === "yes") onOk(); }
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-m="yes"]').focus();
  }
  function applyTheme() {
    var t = S.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }

  // ---------- 画面 ----------
  var view = "home", session = null, examTimer = null;

  function render() {
    clearInterval(examTimer); examTimer = null;
    if (view === "home") return renderHome();
    if (view === "topics") return renderTopics();
    if (view === "quiz") return renderQuiz();
    if (view === "summary") return renderSummary();
    if (view === "exam") return renderExam();
    if (view === "examResult") return renderExamResult();
    if (view === "stats") return renderStats();
    if (view === "settings") return renderSettings();
  }
  function go(v) { view = v; render(); window.scrollTo(0, 0); }

  function renderHome() {
    var due = dueIds().length;
    var fresh = Math.max(0, Math.min(S.settings.newPerDay - newToday(), unseenIds().length));
    var todo = due + fresh, done = S.days[today()] || 0, weak = weakIds().length;
    var seen = QUESTIONS.filter(function (q) { return card(q.id); }).length;
    var offN = (S.settings.topicsOff || []).length;
    root.innerHTML =
      bar("Java道場", null, '<button class="icon-btn" data-act="settings" aria-label="設定">設定</button>') +
      '<div class="card"><div class="hero"><div class="grow"><div class="label">今日の復習</div>' +
      '<div class="big">' + todo + '<span class="label"> 問</span></div>' +
      '<div class="label">復習 ' + due + ' ／ 新しい問題 ' + fresh + (offN ? "（" + offN + "分野を除外中）" : "") + "</div></div></div>" +
      '<div class="stats-row"><div class="stat"><b>' + done + '</b><span>今日解いた</span></div>' +
      '<div class="stat"><b>' + streak() + '日</b><span>連続</span></div>' +
      '<div class="stat"><b>' + seen + "/" + QUESTIONS.length + '</b><span>出会った問題</span></div></div>' +
      '<div style="margin-top:14px"><button class="btn primary" data-act="startReview"' + (todo ? "" : " disabled") + ">" +
      (todo ? "今日の分を始める" : "今日の分は終わり") + "</button></div></div>" +
      '<div class="menu">' +
      '<button class="tile" data-act="topics"><b>分野別</b><span>' + topics().length + " 分野</span></button>" +
      '<button class="tile" data-act="startWeak"' + (weak ? "" : " disabled") + "><b>苦手だけ</b><span>" + weak + " 問</span></button>" +
      '<button class="tile" data-act="startExam"><b>模擬試験</b><span>' + Math.min(EXAM_SIZE, QUESTIONS.length) + "問・" +
      Math.round(Math.min(EXAM_SIZE, QUESTIONS.length) * EXAM_MIN_PER_Q) + "分</span></button>" +
      '<button class="tile" data-act="stats"><b>記録</b><span>正答率・試験の履歴</span></button></div>' +
      '<p class="note">本番の形式：60問・90分・合格ライン65%。全問、実際にコンパイル・実行して答えを確かめてあります。</p>' +
      (window.EMBEDDED ? '<p class="note">これは試用版です。ホーム画面に追加する版とは記録が別になります。</p>' : "");
  }

  function renderTopics() {
    var html = bar("分野別", "home") + '<div class="list">';
    topics().forEach(function (t) {
      var st = topicStat(t);
      var pct = st.total ? Math.round(st.mastered / st.total * 100) : 0;
      html += '<button class="row" data-act="startTopic" data-topic="' + esc(t) + '"><div class="name">' + esc(t) +
        '<div class="meter"><i style="width:' + pct + '%"></i></div></div><div class="meta">' +
        (st.rate == null ? "未着手" : Math.round(st.rate * 100) + "%") + "<br>" + st.seen + "/" + st.total + "</div></button>";
    });
    root.innerHTML = html + '</div><p class="note">バーは「3回続けて正解した問題」の割合。</p>';
  }

  // ---- 通常の出題（復習・分野別・苦手） ----
  function startSession(mode, ids, title) {
    if (!ids.length) { toast("出題できる問題がありません"); return; }
    session = { mode: mode, title: title, queue: ids.slice(), idx: 0, sel: [], answered: false, results: [], retried: {}, recorded: {} };
    go("quiz");
  }
  function current() { return BY_ID[session.queue[session.idx]]; }
  // 選択肢の並びを出題ごとに入れ替える（位置で答えを覚えないように）。「上記」を含む問題は並びを保つ
  function order(q) {
    session.perm = session.perm || {};
    if (!session.perm[q.id]) {
      var idx = q.choices.map(function (_, k) { return k; });
      session.perm[q.id] = q.choices.some(function (c) { return /上記|いずれも/.test(c); }) ? idx : shuffle(idx);
    }
    return session.perm[q.id];
  }
  function letterOf(q, k) { return "ABCDEFGH"[order(q).indexOf(k)]; }

  function renderQuiz() {
    var q = current(), n = session.queue.length, i = session.idx;
    var multi = q.type === "multi", need = q.answer.length;
    var html = bar(session.title, "quitSession", '<span class="sub">' + (i + 1) + " / " + n + "</span>") +
      '<div class="progress"><i style="width:' + (i / n * 100) + '%"></i></div>' +
      '<div class="qhead"><span class="chip">' + esc(q.sub || q.topic) + "</span>" + (multi ? '<span class="chip">' + need + "つ選ぶ</span>" : "") +
      (card(q.id) ? "" : '<span class="chip">新しい問題</span>') + "</div>" +
      '<div class="qtext">' + esc(q.q) + "</div>" + (q.code ? codeBlock(q.code) : "") + '<div class="choices">';
    order(q).forEach(function (k, pos) {
      var c = q.choices[k], cls = "choice" + (multi ? " multi" : "");
      if (session.answered) {
        var isAns = q.answer.indexOf(k) >= 0, picked = session.sel.indexOf(k) >= 0;
        if (isAns) cls += " correct"; else if (picked) cls += " wrong";
      } else if (session.sel.indexOf(k) >= 0) cls += " selected";
      html += '<button class="' + cls + '" data-act="pick" data-k="' + k + '"' + (session.answered ? " disabled" : "") +
        '><span class="mark">' + "ABCDEFGH"[pos] + '</span><span class="body' + ((q.mono && !/[ぁ-んァ-ン一-龥]/.test(c)) || looksLikeCode(c) ? " mono" : "") + '">' + esc(c) + "</span></button>";
    });
    html += "</div>";
    if (session.answered) {
      var ok = session.results[session.results.length - 1];
      html += '<div class="verdict ' + (ok ? "ok" : "ng") + '">' + (ok ? "正解" : "不正解　正解は " +
        q.answer.map(function (k) { return letterOf(q, k); }).sort().join("・")) + "</div>" +
        '<div class="explain"><h3>解説</h3><p>' + esc(q.explain) + "</p></div>" +
        '<div class="sticky-foot"><button class="btn primary" data-act="next">' + (i + 1 < n ? "次へ" : "結果を見る") + "</button></div>";
    } else {
      var ready = multi ? session.sel.length === need : session.sel.length === 1;
      html += '<div class="sticky-foot"><button class="btn primary" data-act="submit"' + (ready ? "" : " disabled") + ">" +
        (multi && !ready ? need + "つ選んでください（" + session.sel.length + "/" + need + "）" : "答え合わせ") + "</button></div>";
    }
    root.innerHTML = html;
  }

  function isCorrect(q, sel) {
    if (sel.length !== q.answer.length) return false;
    return q.answer.every(function (k) { return sel.indexOf(k) >= 0; });
  }
  function submit() {
    var q = current(), ok = isCorrect(q, session.sel);
    session.answered = true; session.results.push(ok);
    if (!session.recorded[q.id]) { session.recorded[q.id] = 1; record(q.id, ok); }
    // 間違えた問題は、同じ回の最後にもう一度だけ出す（記録は1回目の結果で付ける）
    if (!ok && !session.retried[q.id] && session.mode !== "exam") { session.retried[q.id] = 1; session.queue.push(q.id); }
    render();
  }
  function next() {
    session.idx++; session.sel = []; session.answered = false;
    if (session.idx >= session.queue.length) return go("summary");
    render(); window.scrollTo(0, 0);
  }
  function renderSummary() {
    var ok = session.results.filter(Boolean).length, n = session.results.length;
    root.innerHTML = bar("おつかれさま", "home") +
      '<div class="card"><div class="result-big">' + ok + " / " + n + '</div><div class="result-sub">正解（やり直しの出題を含む）</div>' +
      '<button class="btn primary" data-act="home">ホームへ</button></div>' +
      '<p class="note">間違えた問題は明日また出ます。正解が続くほど、次に出るまでの間が空いていきます（1→3→7→14→30→60日）。</p>';
  }

  // ---- 模擬試験 ----
  function startExam() {
    var ids = shuffle(QUESTIONS.map(function (q) { return q.id; })).slice(0, EXAM_SIZE);
    session = { mode: "exam", queue: ids, idx: 0, answers: {}, start: Date.now(), limit: Math.round(ids.length * EXAM_MIN_PER_Q * 60) };
    go("exam");
  }
  function examLeft() { return Math.max(0, session.limit - Math.floor((Date.now() - session.start) / 1000)); }
  function fmt(sec) { return Math.floor(sec / 60) + ":" + pad(sec % 60); }
  function renderExam() {
    var q = current(), n = session.queue.length, i = session.idx, sel = session.answers[q.id] || [];
    var multi = q.type === "multi", answered = Object.keys(session.answers).length;
    var html = bar("模擬試験", "quitExam", '<span class="timer" id="timer">' + fmt(examLeft()) + "</span>") +
      '<div class="progress"><i style="width:' + (answered / n * 100) + '%"></i></div>' +
      '<div class="qhead"><span>第' + (i + 1) + "問 / " + n + "</span>" + (multi ? '<span class="chip">' + q.answer.length + "つ選ぶ</span>" : "") + "</div>" +
      '<div class="qtext">' + esc(q.q) + "</div>" + (q.code ? codeBlock(q.code) : "") + '<div class="choices">';
    order(q).forEach(function (k, pos) {
      var c = q.choices[k];
      html += '<button class="choice' + (multi ? " multi" : "") + (sel.indexOf(k) >= 0 ? " selected" : "") + '" data-act="examPick" data-k="' + k +
        '"><span class="mark">' + "ABCDEFGH"[pos] + '</span><span class="body' + ((q.mono && !/[ぁ-んァ-ン一-龥]/.test(c)) || looksLikeCode(c) ? " mono" : "") + '">' + esc(c) + "</span></button>";
    });
    html += '</div><div class="sticky-foot"><div class="menu" style="margin:0 0 8px">' +
      '<button class="btn" data-act="examPrev"' + (i ? "" : " disabled") + ">← 前へ</button>" +
      '<button class="btn" data-act="examNext"' + (i + 1 < n ? "" : " disabled") + ">次へ →</button></div>" +
      '<button class="btn primary" data-act="examFinish">採点する（' + answered + "/" + n + " 回答済み）</button></div>";
    root.innerHTML = html;
    examTimer = setInterval(function () {
      var left = examLeft(), el = document.getElementById("timer");
      if (el) { el.textContent = fmt(left); el.className = "timer" + (left < 300 ? " low" : ""); }
      if (!left) { toast("時間切れ"); finishExam(); }
    }, 1000);
  }
  function finishExam() {
    clearInterval(examTimer);
    var ok = 0, wrong = [];
    session.queue.forEach(function (id) {
      var q = BY_ID[id], sel = session.answers[id] || [], good = isCorrect(q, sel);
      if (good) ok++; else wrong.push(id);
      if (sel.length) record(id, good); // 空欄は記録しない
    });
    var n = session.queue.length, sec = Math.min(session.limit, Math.floor((Date.now() - session.start) / 1000));
    S.exams.push({ date: today(), ok: ok, n: n, sec: sec }); save();
    session.result = { ok: ok, n: n, sec: sec, wrong: wrong };
    go("examResult");
  }
  function renderExamResult() {
    var r = session.result, rate = r.ok / r.n, pass = rate >= PASS_RATE;
    var html = bar("模擬試験の結果", "home") + '<div class="card"><div class="result-big ' + (pass ? "pass" : "fail") + '">' +
      Math.round(rate * 100) + '%</div><div class="result-sub">' + r.ok + " / " + r.n + " 問正解・" + fmt(r.sec) + "　" +
      (pass ? "合格ライン（65%）を超えた" : "合格ラインは65%（あと " + Math.max(0, Math.ceil(r.n * PASS_RATE) - r.ok) + " 問）") + "</div>" +
      (r.wrong.length ? '<button class="btn primary" data-act="reviewWrong">間違えた ' + r.wrong.length + " 問を解説つきで解き直す</button>" : "") +
      '<button class="btn" data-act="home">ホームへ</button></div>';
    var byTopic = {};
    r.wrong.forEach(function (id) { var t = BY_ID[id].topic; byTopic[t] = (byTopic[t] || 0) + 1; });
    var keys = Object.keys(byTopic).sort(function (a, b) { return byTopic[b] - byTopic[a]; });
    if (keys.length) {
      html += '<div class="section-title">間違えた分野</div><div class="list">' + keys.map(function (t) {
        return '<div class="row"><div class="name">' + esc(t) + '</div><div class="meta">' + byTopic[t] + " 問</div></div>";
      }).join("") + "</div>";
    }
    root.innerHTML = html;
  }

  // ---- 記録・設定 ----
  function renderStats() {
    var total = 0, ok = 0;
    for (var id in S.cards) { ok += S.cards[id].ok; total += S.cards[id].ok + S.cards[id].ng; }
    var html = bar("記録", "home") + '<div class="card"><div class="stats-row" style="margin:0">' +
      '<div class="stat"><b>' + total + '</b><span>解いた回数</span></div>' +
      '<div class="stat"><b>' + (total ? Math.round(ok / total * 100) + "%" : "—") + '</b><span>正答率</span></div>' +
      '<div class="stat"><b>' + streak() + '日</b><span>連続</span></div></div></div>';
    var days = [];
    for (var k = 13; k >= 0; k--) days.push(today(-k));
    var max = Math.max.apply(null, days.map(function (d) { return S.days[d] || 0; }).concat([1]));
    html += '<div class="section-title">この2週間（1日の解答数）</div><div class="card"><div style="display:flex;align-items:flex-end;gap:4px;height:80px">' +
      days.map(function (d) {
        var v = S.days[d] || 0;
        return '<div title="' + d + "：" + v + '問" style="flex:1;height:' + Math.max(3, v / max * 100) + '%;background:' + (v ? "var(--accent)" : "var(--surface-2)") + ';border-radius:3px"></div>';
      }).join("") + '</div><div class="note" style="display:flex;justify-content:space-between"><span>' + days[0].slice(5) + "</span><span>今日</span></div></div>";
    html += '<div class="section-title">分野ごとの正答率</div><div class="list">' + topics().map(function (t) {
      var st = topicStat(t);
      return '<div class="row"><div class="name">' + esc(t) + '</div><div class="meta">' + (st.rate == null ? "—" : Math.round(st.rate * 100) + "%") + "</div></div>";
    }).join("") + "</div>";
    if (S.exams.length) {
      html += '<div class="section-title">模擬試験の履歴</div><div class="list">' + S.exams.slice(-10).reverse().map(function (e) {
        var p = Math.round(e.ok / e.n * 100);
        return '<div class="row"><div class="name">' + e.date + '</div><div class="meta ' + (p >= 65 ? "pass" : "fail") + '">' + p + "%（" + e.ok + "/" + e.n + "）</div></div>";
      }).join("") + "</div>";
    }
    root.innerHTML = html;
  }

  function renderSettings() {
    var s = S.settings;
    root.innerHTML = bar("設定", "home") +
      '<div class="section-title">1日に出す新しい問題の数</div><div class="pill-row">' +
      [5, 10, 20, 40].map(function (n) { return '<button class="pill' + (s.newPerDay === n ? " on" : "") + '" data-act="setNew" data-n="' + n + '">' + n + "問</button>"; }).join("") +
      '</div><div class="section-title">新しい問題を出す分野（外した分野も、復習と模擬試験には出ます）</div><div class="pill-row">' +
      topics().map(function (t) {
        var on = (s.topicsOff || []).indexOf(t) < 0;
        return '<button class="pill' + (on ? " on" : "") + '" data-act="toggleTopic" data-topic="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + "</button>";
      }).join("") +
      '</div><div class="section-title">表示</div><div class="pill-row">' +
      [["auto", "端末に合わせる"], ["light", "明るい"], ["dark", "暗い"]].map(function (t) {
        return '<button class="pill' + (s.theme === t[0] ? " on" : "") + '" data-act="setTheme" data-t="' + t[0] + '">' + t[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="section-title">記録のバックアップ</div><div class="card">' +
      '<p class="note" style="margin-top:0">記録はこの端末の中だけにあります。iPhoneでは、長く開かないと消されることがあるので、ときどき書き出して保存してください。</p>' +
      (window.EMBEDDED ? "" : '<button class="btn" data-act="export">書き出す（ファイルに保存）</button>') +
      '<button class="btn" data-act="copyExport">書き出す（コピー）</button>' +
      '<textarea id="imp" placeholder="書き出したテキストを貼り付けて「読み込む」"></textarea>' +
      '<button class="btn" data-act="import" style="margin-top:8px">読み込む</button></div>' +
      '<div class="section-title">やり直し</div><button class="btn" data-act="reset" style="color:var(--ng)">記録をすべて消す</button>' +
      '<p class="note">問題数 ' + QUESTIONS.length + "・版 " + esc(window.QUESTIONS_VERSION || "-") + "</p>";
  }
  function exportText() { return JSON.stringify(S); }

  // ---------- 操作 ----------
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    var a = b.getAttribute("data-act");
    switch (a) {
      case "home": case "topics": case "stats": case "settings": return go(a);
      case "startReview": {
        var fresh = unseenIds().slice(0, Math.max(0, S.settings.newPerDay - newToday()));
        return startSession("review", dueIds().concat(fresh), "今日の分");
      }
      case "startWeak": return startSession("weak", weakIds(), "苦手だけ");
      case "startTopic": {
        var t = b.getAttribute("data-topic");
        var ids = QUESTIONS.filter(function (q) { return q.topic === t; })
          .sort(function (x, y) { var cx = card(x.id), cy = card(y.id); return (cx ? cx.box : -1) - (cy ? cy.box : -1); })
          .map(function (q) { return q.id; });
        return startSession("topic", ids, t);
      }
      case "pick": {
        var k = +b.getAttribute("data-k"), q = current();
        if (q.type === "multi") {
          var p = session.sel.indexOf(k);
          if (p >= 0) session.sel.splice(p, 1); else if (session.sel.length < q.answer.length) session.sel.push(k);
        } else session.sel = [k];
        return render();
      }
      case "submit": return submit();
      case "next": return next();
      case "quitSession":
        if (!session.results.length) return go("home");
        return ask("ここでやめますか？ 解いた分は記録済みです。", "やめる", function () { go("home"); });
      case "startExam": return startExam();
      case "examPick": {
        var q2 = current(), k2 = +b.getAttribute("data-k"), sel = (session.answers[q2.id] || []).slice();
        if (q2.type === "multi") {
          var p2 = sel.indexOf(k2);
          if (p2 >= 0) sel.splice(p2, 1); else if (sel.length < q2.answer.length) sel.push(k2);
        } else sel = [k2];
        if (sel.length) session.answers[q2.id] = sel; else delete session.answers[q2.id];
        return render();
      }
      case "examPrev": session.idx--; render(); return window.scrollTo(0, 0);
      case "examNext": session.idx++; render(); return window.scrollTo(0, 0);
      case "examFinish": {
        var left = session.queue.length - Object.keys(session.answers).length;
        if (!left) return finishExam();
        return ask("未回答が " + left + " 問あります。採点しますか？", "採点する", finishExam);
      }
      case "quitExam": return ask("模擬試験をやめますか？ この回は記録されません。", "やめる", function () { go("home"); });
      case "reviewWrong": return startSession("weak", session.result.wrong, "解き直し");
      case "setNew": S.settings.newPerDay = +b.getAttribute("data-n"); save(); return render();
      case "toggleTopic": {
        var tp = b.getAttribute("data-topic"), off = S.settings.topicsOff || (S.settings.topicsOff = []), at = off.indexOf(tp);
        if (at >= 0) off.splice(at, 1); else off.push(tp);
        save(); return render();
      }
      case "setTheme": S.settings.theme = b.getAttribute("data-t"); save(); applyTheme(); return render();
      /* EXPORT-FILE-START（試用版では build.py が取り除く：埋め込み表示ではファイル保存が効かないため） */
      case "export": {
        var blob = new Blob([exportText()], { type: "application/json" });
        var url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = "javadojo-" + today() + ".json";
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return;
      }
      /* EXPORT-FILE-END */
      case "copyExport": {
        var txt = exportText();
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast("コピーしました"); }, function () { document.getElementById("imp").value = txt; toast("下の欄に出しました。長押しでコピー"); });
        else { document.getElementById("imp").value = txt; toast("下の欄に出しました。長押しでコピー"); }
        return;
      }
      case "import": {
        try {
          var s = JSON.parse(document.getElementById("imp").value);
          if (!s || s.v !== 1 || !s.cards) throw 0;
          return ask("今の記録を、貼り付けた記録で置き換えます。", "置き換える", function () {
            try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e2) { return toast("保存できませんでした"); }
            S = load(); applyTheme(); toast("読み込みました"); go("home");
          });
        } catch (err) { return toast("読み込めませんでした。書き出したテキストをそのまま貼ってください"); }
      }
      case "reset":
        return ask("記録をすべて消します。元に戻せません。", "消す", function () {
          ask("本当に消しますか？", "すべて消す", function () { S = blank(); save(); applyTheme(); toast("消しました"); go("home"); });
        });
    }
  });

  applyTheme();
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
