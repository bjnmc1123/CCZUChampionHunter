/* 常州大学·赛事猎手 · 页面逻辑（无依赖，读 data/data.js 打包好的 JSON） */
(function () {
  'use strict';

  var D = window.EVENT_DATA;
  var B = window.EVENT_BUNDLE || {};
  var main = document.querySelector('main') || document.body;

  function fatal(msg) {
    var box = document.createElement('div');
    box.className = 'wrap';
    box.innerHTML = '<div class="fatal"><b>数据没加载出来。</b><br>' + msg + '</div>';
    main.appendChild(box);
  }
  if (!D) {
    fatal('找不到 <code>data/data.js</code>。首次使用请双击 <code>启动.cmd</code>（它会从 ' +
      '<code>tools/out/*.json</code> 重新打包），或运行 <code>python serve.py --local</code> 后打开 ' +
      '<code>http://127.0.0.1:8770/</code>。');
    return;
  }

  var comp = D.competitions || {};
  var cal = D.calendar || {};
  var fit = D.fit || {};
  var sc = D.scores || {};
  var rule = D.calc_rules || {};
  var man = D.manifest || {};

  var C_ITEMS = comp.items || [];
  var CAL_ITEMS = cal.items || [];
  var FIT_ITEMS = fit.items || [];
  var CELLS = sc.cells || [];
  var COLUMNS = sc.columns || [];
  var AWARDS = sc.awardLevels || [];

  var bySeqComp = {};
  var bySeqCal = {};
  var bySeqFit = {};
  C_ITEMS.forEach(function (x) { bySeqComp[x['序号']] = x; });
  CAL_ITEMS.forEach(function (x) { bySeqCal[x['序号']] = x; });
  FIT_ITEMS.forEach(function (x) { bySeqFit[x['序号']] = x; });

  // D = 计算机类无法参加，不进入可报清单/时间报表/测算
  function tierOfSeq(seq) {
    var f = bySeqFit[seq];
    return f ? f['档位'] : '';
  }
  function isJoinable(seq) {
    return ['A', 'B', 'C'].indexOf(tierOfSeq(seq)) >= 0;
  }
  var JOINABLE = C_ITEMS.filter(function (c) { return isJoinable(c['序号']); });
  var UNJOINABLE = C_ITEMS.filter(function (c) { return tierOfSeq(c['序号']) === 'D'; });

  // 序号重排：可报 A/B/C 在前 1—55（按原 CSV 顺序），D 档接在后面（继续按原 CSV 顺序）
  var ORDER_ALL = C_ITEMS.slice().sort(function (a, b) { return a['序号'] - b['序号']; });
  var JOIN_LIST = ORDER_ALL.filter(function (c) { return isJoinable(c['序号']); });
  var D_LIST = ORDER_ALL.filter(function (c) { return tierOfSeq(c['序号']) === 'D'; });
  var NEW_NO = {};
  JOIN_LIST.concat(D_LIST).forEach(function (c, i) { NEW_NO[c['序号']] = i + 1; });
  function displayNo(seq) { return NEW_NO[seq] || seq; }

  var STATUS_ORDER = ['可赶', '进行中', '已结束', '待补', '下届待发'];
  var STATUS_NOTE = {
    '可赶': '官方报名截止未过；没有官方日期的按推算最早值判，带「推算时间」标签。',
    '进行中': '当前有环节在时间窗内（官方或推算），具体看「状态依据」。',
    '已结束': '本届时间已全部过去。',
    '待补': '没有可用日期，或关键日期未取到；没有依据不推算。',
    '下届待发': '下届时间仅有单届参考，不可靠推算，等正式通知。'
  };
  var NODE_LABEL = {
    reg: '报名截止', school: '校内选拔/校赛', prov: '省赛', nat: '国赛'
  };
  var TIERS = ['A', 'B', 'C', 'D'];
  var JOIN_TIERS = ['A', 'B', 'C'];      // 可报清单只列这三档；D 只在统计卡里能看
  var TIER_NAME = { A: '直接对口', B: '技术可跨', C: '通用组队', D: '不可参加' };

  var state = {
    tab: 'time',
    timeStatus: '',
    tiers: { A: true, B: true, C: true, D: false },
    q: '',
    level: '',
    evidence: '',
    dept: '',
    status: '',
    open: {}
  };
  var drawerKind = '';
  var drawerStatus = '可赶';

  // ---------- 小工具
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString('zh-CN');
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function isTbd(s) { return !s || s === '待补'; }
  // 源文档里的 Markdown 加粗标记在页面上按纯文本显示，避免出现字面 ** 号
  function plain(s) { return String(s == null ? '' : s).replace(/\*\*/g, '').replace(/__/g, ''); }
  function evKind(e) {
    if (!e) return '待补';
    if (e.indexOf('档案') === 0) return '档案';
    if (e.indexOf('候选') === 0) return '候选';
    if (e === '推定') return '推定';
    return e;
  }
  function evBadge(e) {
    var k = evKind(e);
    var cls = k === '推定' ? 'ev-pass' : (k === '档案' ? 'ev-file' : (k === '候选' ? 'ev-cand' : ''));
    return '<span class="badge ' + cls + '" title="证据等级：' + esc(k) + '">' + esc(k) + '</span>';
  }
  function tierBadge(t) {
    return '<span class="badge t-' + esc(t) + '" title="' + esc(TIER_NAME[t] || '') + '">' + esc(t) + '</span>';
  }
  function tierCell(t) {
    return tierBadge(t);
  }
  function statusBadge(s, ca) {
    var h = '<span class="badge st-' + esc(s) + '">' + esc(s) + '</span>';
    if (ca && (ca['时间来源'] === 'estimated' || ca['推算'] === true)) {
      h += ' <span class="badge st-est" title="按推算最早值判，不是官方日期">推算时间</span>';
    }
    return h;
  }
  function statusOf(seq) {
    var c = bySeqCal[seq];
    return c ? c['状态'] : '待补';
  }
  function link(u) {
    if (!u) return '<span class="muted">待补</span>';
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener">来源</a>';
  }
  function depts(s) {
    return String(s || '').split(/[、\/／,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ---------- 顶部元信息
  var genAt = (man.meta || {}).generatedAt || B.generatedAt || '未知';
  var nComp = C_ITEMS.length;
  var dist = (comp.meta && comp.meta.distributions && comp.meta.distributions['级别等次']) || {};
  // 状态计数按当前数据现算，避免与源文件里的缓存值打架
  var statusCount = {};
  CAL_ITEMS.forEach(function (x) { statusCount[x['状态']] = (statusCount[x['状态']] || 0) + 1; });
  STATUS_ORDER.forEach(function (s) { if (statusCount[s] == null) statusCount[s] = 0; });
  var tierCount = {};
  FIT_ITEMS.forEach(function (x) { tierCount[x['档位']] = (tierCount[x['档位']] || 0) + 1; });

  document.getElementById('meta-line').innerHTML =
    '数据生成 <b>' + esc(genAt) + '</b> · Ⅰ级目录 <b>' + nComp + '</b> 项' +
    '（甲等 ' + (dist['Ⅰ级甲等'] || 0) + ' / 乙等 ' + (dist['Ⅰ级乙等'] || 0) +
    ' / 丙等 ' + (dist['Ⅰ级丙等'] || 0) + '）' +
    ' · 赛历基线 ' + esc((cal.meta || {}).baselineDate || '待补') +
    ' · 数据包 <b>' + esc(B.generatedAt || '未知') + '</b>';

  // ---------- KPI（每张卡可点开总表）
  var cardDefs = [
    { key: 'total', cls: '', label: 'Ⅰ级竞赛总数', value: nComp, sub: '66 号附件1 全量 · 点开看 A/B/C/D 标注' }
  ];
  TIERS.forEach(function (t) {
    cardDefs.push({
      key: 'tier-' + t, cls: t.toLowerCase(),
      label: t + ' ' + TIER_NAME[t], value: tierCount[t] || 0,
      sub: pct(tierCount[t] || 0, FIT_ITEMS.length) + '% · 点开看该档列表'
    });
  });
  var timeSub = STATUS_ORDER.filter(function (s) {
    return s !== '可赶' && statusCount[s];
  }).map(function (s) {
    return s + ' ' + statusCount[s];
  }).join(' · ');
  cardDefs.push({
    key: 'time', cls: '', label: '时间状态',
    value: statusCount['可赶'] || 0,
    valueSuffix: ' <span style="font-size:13px;font-weight:400">项可赶</span>',
    sub: timeSub + ' · 点开看各状态列表'
  });
  function kpis() {
    var h = '';
    cardDefs.forEach(function (c) {
      h += '<div class="kpi clickable ' + c.cls + '" data-card="' + c.key + '" role="button" tabindex="0"' +
        ' aria-label="' + esc(c.label + ' ' + c.value + '，点开查看列表') + '">' +
        '<span class="open-hint">点开 ▸</span>' +
        '<div class="k">' + esc(c.label) + '</div>' +
        '<div class="v">' + c.value + (c.valueSuffix || '') + '</div>' +
        '<div class="n">' + c.sub + '</div></div>';
    });
    document.getElementById('kpis').innerHTML = h;
  }
  kpis();

  // ---------- 标签页
  function setTab(name, push) {
    state.tab = name;
    var btns = document.querySelectorAll('#tabs button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === name);
    }
    var panes = document.querySelectorAll('.pane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle('active', panes[j].id === 'pane-' + name);
    }
    if (push !== false) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) setTab(b.getAttribute('data-tab'));
  });

  // ---------- 统计卡抽屉
  function openDrawer(kind) {
    drawerKind = kind;
    var title = document.getElementById('drawer-title');
    var tools = document.getElementById('drawer-tools');
    var body = document.getElementById('drawer-body');
    var rows;
    tools.innerHTML = '';
    if (kind === 'total') {
      rows = JOIN_LIST.concat(D_LIST);   // 按新序号 1—114 排：前 55 可报，后 59 为 D
      title.textContent = 'Ⅰ级竞赛总数 · ' + C_ITEMS.length + ' 项（逐条标 A/B/C/D）';
      tools.innerHTML = '<p class="drawer-note">四档分布：A ' + (tierCount['A'] || 0) + ' / B ' + (tierCount['B'] || 0) +
        ' / C ' + (tierCount['C'] || 0) + ' / D ' + (tierCount['D'] || 0) + '</p>';
    } else if (kind.indexOf('tier-') === 0) {
      var t = kind.slice(5);
      rows = C_ITEMS.filter(function (c) { return tierOfSeq(c['序号']) === t; });
      title.textContent = t + ' ' + TIER_NAME[t] + ' · ' + rows.length + ' 项';
    } else {
      title.textContent = '时间状态 · ' + CAL_ITEMS.length + ' 项（全量）';
      var th = '';
      STATUS_ORDER.forEach(function (s) {
        th += '<span class="chip st-' + s + (drawerStatus === s ? ' on' : '') + '" data-dst="' + s + '">' +
          s + ' <span class="cnt">' + (statusCount[s] || 0) + '</span></span>';
      });
      tools.innerHTML = '<div class="chips">' + th + '</div>';
      rows = CAL_ITEMS.filter(function (x) { return x['状态'] === drawerStatus; });
    }
    body.innerHTML = drawerTable(rows);
    document.getElementById('drawer-mask').hidden = false;
    document.body.classList.add('drawer-open');
  }
  function closeDrawer() {
    document.getElementById('drawer-mask').hidden = true;
    document.body.classList.remove('drawer-open');
    drawerKind = '';
  }
  function drawerTable(rows) {
    if (!rows || !rows.length) return '<p class="drawer-empty">没有项目。</p>';
    var h = '<div class="tw"><table class="grid"><thead><tr>' +
      '<th class="c-no">序号</th><th>名称</th><th class="c-tier">档位</th>' +
      '<th class="c-lv">级别</th><th class="c-st">时间</th><th></th></tr></thead><tbody>';
    rows.forEach(function (c) {
      var t = tierOfSeq(c['序号']);
      var act = isJoinable(c['序号'])
        ? '<span class="drawer-link" data-open="' + c['序号'] + '">在清单中打开</span>'
        : '<span class="muted">—</span>';
      h += '<tr><td class="datenum">' + displayNo(c['序号']) + '</td>' +
        '<td>' + esc(c['名称']) + '</td>' +
        '<td>' + tierCell(t) + '</td>' +
        '<td><span class="badge lv">' + esc(c['级别等次']) + '</span></td>' +
        '<td>' + statusBadge(statusOf(c['序号']), bySeqCal[c['序号']]) + '</td>' +
        '<td>' + act + '</td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }
  function locate(seq) {
    closeDrawer();
    state.tiers = { A: true, B: true, C: true, D: false };
    state.q = '';
    state.level = '';
    state.evidence = '';
    state.dept = '';
    state.status = '';
    document.getElementById('q').value = '';
    ['f-level', 'f-evidence', 'f-dept', 'f-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    state.open = {};
    state.open[seq] = true;
    initListFilters();
    listView();
    setTab('list');
    var tr = document.querySelector('#list-table tbody tr[data-seq="' + seq + '"]');
    if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'center' });
  }
  document.getElementById('kpis').addEventListener('click', function (e) {
    var card = e.target.closest('.kpi.clickable');
    if (card) openDrawer(card.getAttribute('data-card'));
  });
  document.getElementById('kpis').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.kpi.clickable');
    if (card) { e.preventDefault(); openDrawer(card.getAttribute('data-card')); }
  });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-mask').addEventListener('click', function (e) {
    if (e.target === document.getElementById('drawer-mask')) closeDrawer();
  });
  document.getElementById('drawer-body').addEventListener('click', function (e) {
    var a = e.target.closest('.drawer-link');
    if (a) locate(a.getAttribute('data-open'));
  });
  document.getElementById('drawer-tools').addEventListener('click', function (e) {
    var c = e.target.closest('.chip[data-dst]');
    if (!c) return;
    drawerStatus = c.getAttribute('data-dst');
    openDrawer('time');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('drawer-mask').hidden) closeDrawer();
  });

  // ---------- 时间节点三档渲染
  // official 正常 + 「官方」；estimated 加「推算」+ 区间/依据，single 标「单届参考·未推区间」；pending 灰色「待补」
  function nodeLevelBadge(lv) {
    if (lv === 'estimated') return '<span class="lvl lvl-est">推算</span>';
    if (lv === 'official') return '<span class="lvl lvl-off">官方</span>';
    return '<span class="lvl lvl-pend">待补</span>';
  }
  function itemNodes(item) {
    var nodes = item['nodes'] || [];
    if (nodes.length) return nodes;
    // 兼容没有 nodes[] 的旧数据：从四个文本字段合成，档位读「节点档位」
    var lvMap = item['节点档位'] || {};
    return ['reg', 'school', 'prov', 'nat'].filter(function (k) {
      return item[NODE_FIELD[k]];
    }).map(function (k) {
      return {
        key: k, label: NODE_LABEL[k], text: item[NODE_FIELD[k]],
        level: lvMap[k] || 'pending', basis: null, range: null, single: false
      };
    });
  }
  var NODE_FIELD = { reg: '报名截止', school: '校内选拔或校赛', prov: '省赛', nat: '国赛' };
  function nodeLine(n) {
    var lv = n.level || 'pending';
    var text = n.text || '待补';
    var h = '<div class="node">' + nodeLevelBadge(lv) +
      '<span class="nl">' + esc(n.label || NODE_LABEL[n.key] || '') + '</span>' +
      '<span class="nt">' + (isTbd(text) ? '<span class="muted">待补</span>' : esc(plain(text))) + '</span>';
    if (lv === 'estimated') {
      if (n.range) h += '<div class="nmeta">推算区间：' + esc(n.range) + '</div>';
      if (n.single) h += '<div class="nmeta"><span class="lvl lvl-single">单届参考·未推区间</span></div>';
      if (n.basis) h += '<details class="nbasis"><summary>依据</summary><div>' + esc(n.basis) + '</div></details>';
    }
    h += '</div>';
    return h;
  }
  function nodesBlock(item) {
    var nodes = itemNodes(item);
    if (!nodes.length) return '<span class="muted">待补</span>';
    return nodes.map(nodeLine).join('');
  }

  // ---------- 视图一：时间报表（只列 A/B/C）
  function timeReport() {
    var chips = document.getElementById('time-chips');
    var body = document.getElementById('time-body');
    var joinableCal = CAL_ITEMS.filter(function (x) { return isJoinable(x['序号']); });

    var counts = {};
    STATUS_ORDER.forEach(function (s) { counts[s] = 0; });
    joinableCal.forEach(function (x) {
      var s = x['状态'];
      counts[s] = (counts[s] || 0) + 1;
    });

    var h = '<span class="chip' + (state.timeStatus === '' ? ' on' : '') + '" data-st="">全部 <span class="cnt">' + joinableCal.length + '</span></span>';
    STATUS_ORDER.forEach(function (s) {
      h += '<span class="chip st-' + s + (state.timeStatus === s ? ' on' : '') + '" data-st="' + s + '">' +
        s + ' <span class="cnt">' + (counts[s] || 0) + '</span></span>';
    });
    chips.innerHTML = h;

    var groups = state.timeStatus ? [state.timeStatus] : STATUS_ORDER;
    var out = '';
    groups.forEach(function (s) {
      var rows = joinableCal.filter(function (x) { return x['状态'] === s; });
      // 组内按「从今天起最近的截止」升序；没有日期的排后面（再按序号）
      rows.sort(function (a, b) {
        var ma = markerOf(a), mb = markerOf(b);
        var da = (ma && ma.day != null) ? ma.day : Infinity;
        var db = (mb && mb.day != null) ? mb.day : Infinity;
        return (da - db) || (displayNo(a['序号']) - displayNo(b['序号']));
      });
      if (!rows.length) return;
      out += '<div class="group"><div class="group-head"><h3>' + s + '</h3>' +
        '<span class="n">' + rows.length + ' 项</span></div>' +
        '<p class="group-note">' + esc(STATUS_NOTE[s] || '') + '</p>' +
        '<div class="tw"><table class="grid time-table"><thead><tr>' +
        '<th class="c-no">序号</th><th>名称 / 状态依据</th><th class="c-lv">级别</th>' +
        '<th>关键时间节点（官方 / 推算 / 待补）</th><th class="c-st">状态</th><th class="c-st">来源</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (x) {
        out += '<tr class="time-row" id="ev-' + displayNo(x['序号']) + '" data-cal="' + x['序号'] + '">' +
          '<td class="datenum">' + displayNo(x['序号']) + '</td>' +
          '<td>' + esc(x['名称']) +
          (x['状态依据'] ? '<span class="sbt">依据：' + esc(plain(x['状态依据'])) + '</span>' : '') +
          '</td>' +
          '<td><span class="badge lv">' + esc(x['级别']) + '</span></td>' +
          '<td class="nodes">' + nodesBlock(x) + '</td>' +
          '<td>' + statusBadge(x['状态'], x) + '</td>' +
          '<td class="nowrap">' + link(x['来源URL']) + '</td></tr>';
      });
      out += '</tbody></table></div></div>';
    });
    body.innerHTML = out;
  }
  document.getElementById('time-chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    state.timeStatus = c.getAttribute('data-st') || '';
    timeReport();
  });

  // ---------- 时间轴：12 个月份列，赛事序号在列内纵向堆叠（不做坐标散点，从结构上不重叠）
  var DAY = 86400000;
  var NOW = new Date();
  var TODAY = Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()) / DAY;
  var TL_END = TODAY + 365;
  var TL_MONTHS = 12;
  var tlShow = { official: true, estimated: true };   // 图例筛选：只影响时间轴

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
  }
  function dayToYmd(d) {
    var t = new Date(d * DAY);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  }
  // 标记点日期：从今天起最近的官方截止（reg / school 等官方节点区间结束日，多批次取最近一批）
  // → 没有则取推算最早值 → 再没有则取最近的未来官方节点
  function markerOf(ca) {
    var nodes = ca['nodes'] || [];
    var ends = [];
    nodes.forEach(function (n) {
      if (n.level !== 'official') return;
      (n.intervals || []).forEach(function (it) {
        if (!it.end) return;
        var d = parseDay(it.end);
        if (d != null && d >= TODAY) ends.push(d);
      });
    });
    if (ends.length) {
      ends.sort(function (a, b) { return a - b; });
      return { day: ends[0], src: 'official', why: '最近官方截止' };
    }
    var est = [];
    nodes.forEach(function (n) {
      if (n.level === 'estimated') (n.intervals || []).forEach(function (it) { if (it.start) est.push(it.start); });
    });
    if (est.length) {
      est.sort();
      return { day: parseDay(est[0]), src: 'estimated', why: '推算最早值' };
    }
    var fut = [];
    nodes.forEach(function (n) {
      if (n.level !== 'official') return;
      (n.intervals || []).forEach(function (it) { if (it.start) fut.push(it.start); });
    });
    fut.sort();
    for (var j = 0; j < fut.length; j++) {
      var d = parseDay(fut[j]);
      if (d != null && d >= TODAY) return { day: d, src: 'official', why: '最近节点' };
    }
    return null;
  }
  function timelineMarkers() {
    var out = [];
    JOIN_LIST.forEach(function (c) {
      var ca = bySeqCal[c['序号']];
      if (!ca) return;
      if (ca['状态'] !== '可赶') return;   // 轴是「将来一年还能报的窗口」：进行中报名已关、下届待发只有单届参考，都不上轴
      var m = markerOf(ca);
      if (!m || m.day == null) return;
      if (m.day < TODAY || m.day > TL_END) return;
      out.push({ seq: c['序号'], n: displayNo(c['序号']), name: c['名称'], day: m.day, src: m.src, why: m.why });
    });
    out.sort(function (a, b) { return a.day - b.day || a.n - b.n; });
    return out;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function timelineView() {
    var box = document.getElementById('timeline');
    if (!box) return;
    var markers = timelineMarkers();
    var shown = markers.filter(function (m) { return tlShow[m.src]; });
    var cur = dayToYmd(TODAY);

    // 今天所在的月 + 之后 11 个月，共 12 列
    var months = [];
    var y = cur.y, mo = cur.m;
    for (var i = 0; i < TL_MONTHS; i++) {
      months.push({
        key: y + '-' + pad2(mo + 1), label: y + '·' + pad2(mo + 1),
        today: i === 0, items: []
      });
      mo += 1;
      if (mo > 11) { mo = 0; y += 1; }
    }
    var byKey = {};
    months.forEach(function (mm) { byKey[mm.key] = mm; });
    shown.forEach(function (m) {
      var d = dayToYmd(m.day);
      var mm = byKey[d.y + '-' + pad2(d.m + 1)];
      if (mm) mm.items.push(m);
    });

    function legendBtn(k, label, cls) {
      var on = tlShow[k];
      return '<button type="button" class="tl-legend-item" data-k="' + k + '" aria-pressed="' +
        (on ? 'true' : 'false') + '" title="' + (on ? '点击隐藏「' : '点击显示「') + label + '」">' +
        '<i class="tl-dot ' + cls + ' tl-legend-dot" aria-hidden="true"></i>' +
        '<span class="tl-legend-label">' + label + '</span></button>';
    }

    var h = '<div class="tl-head"><span class="tl-title">时间轴 · ' +
      esc(ymd(TODAY)) + ' → ' + esc(ymd(TL_END)) + '（' + markers.length + ' 项有日期' +
      (shown.length !== markers.length ? '，当前显示 ' + shown.length + ' 项' : '') + '）</span>' +
      '<span class="tl-legend">' +
      legendBtn('official', '官方截止', 'off') +
      legendBtn('estimated', '推算时间', 'est') +
      '<span class="tl-legend-today"><i class="tl-today-chip" aria-hidden="true"></i>今天（' +
      months[0].label + ' 列头标红）</span>' +
      '</span></div>';
    h += '<div class="tl-wrap"><div class="tl-months">';

    months.forEach(function (mm) {
      h += '<div class="tl-col' + (mm.today ? ' is-today' : '') + '" data-month="' + mm.key + '">' +
        '<div class="tl-col-head">' +
        (mm.today ? '<span class="tl-today-tag">今天</span>' : '') +
        '<span class="tl-ym">' + mm.label + '</span></div>' +
        '<div class="tl-col-body">';
      mm.items.forEach(function (m) {
        var cls = m.src === 'estimated' ? 'est' : 'off';
        var tip = '序号 ' + m.n + ' · ' + m.name + '\n' +
          (m.src === 'estimated' ? '推算时间：' : '') + ymd(m.day) + '（' + m.why + '）' +
          (m.src === 'estimated' ? '\n推算值，非官方日期' : '');
        h += '<button type="button" class="tl-dot ' + cls + '" data-n="' + m.n + '" title="' +
          esc(tip) + '">' + m.n + '</button>';
      });
      if (!mm.items.length) h += '<span class="tl-empty">—</span>';
      h += '</div></div>';
    });

    h += '</div></div>';
    h += '<p class="tl-hint">点序号跳到下方对应赛事并高亮；点上方「官方截止 / 推算时间」可只看一类；列按自然月分，同月赛事在列内自上而下排。</p>';
    box.innerHTML = h;
  }
  function ymd(day) {
    var t = new Date(day * DAY);
    var m = t.getUTCMonth() + 1, d = t.getUTCDate();
    return t.getUTCFullYear() + '-' + pad2(m) + '-' + pad2(d);
  }
  function jumpTo(n) {
    var row = document.getElementById('ev-' + n);
    if (!row) return false;
    if (row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (row.classList) {
      row.classList.add('flash');
      setTimeout(function () { row.classList.remove('flash'); }, 2000);
    }
    return true;
  }
  function toggleSource(k) {
    if (k !== 'official' && k !== 'estimated') return false;
    tlShow[k] = !tlShow[k];
    timelineView();          // 重渲染：列内点数、空列、按钮 aria-pressed 一起同步
    return tlShow[k];
  }
  document.getElementById('timeline').addEventListener('click', function (e) {
    var l = e.target.closest('.tl-legend-item');
    if (l) { toggleSource(l.getAttribute('data-k')); return; }
    var b = e.target.closest('.tl-dot');
    if (b && b.getAttribute('data-n')) jumpTo(b.getAttribute('data-n'));
  });

  // ---------- 视图二：可报清单（只列 A/B/C）
  function initListFilters() {
    var lv = {};
    JOINABLE.forEach(function (x) { lv[x['级别等次']] = 1; });
    var lvOpts = '<option value="">级别：全部</option>';
    Object.keys(lv).forEach(function (k) { lvOpts += '<option value="' + esc(k) + '">' + esc(k) + '</option>'; });
    document.getElementById('f-level').innerHTML = lvOpts;

    document.getElementById('f-evidence').innerHTML =
      '<option value="">证据：全部</option>' +
      '<option value="档案">档案（一手核对）</option>' +
      '<option value="推定">推定（须核简章）</option>' +
      '<option value="候选">候选</option>';

    var dep = {};
    FIT_ITEMS.forEach(function (x) {
      if (!isJoinable(x['序号'])) return;
      depts(x['归口']).forEach(function (d) { dep[d] = 1; });
    });
    var depOpts = '<option value="">归口：全部</option>';
    Object.keys(dep).sort(function (a, b) { return dep[b] - dep[a]; }).forEach(function (d) {
      depOpts += '<option value="' + esc(d) + '">' + esc(d) + '</option>';
    });
    document.getElementById('f-dept').innerHTML = depOpts;

    var st = {};
    JOINABLE.forEach(function (x) {
      var c = bySeqCal[x['序号']];
      if (c) st[c['状态']] = 1;
    });
    var stOpts = '<option value="">时间：全部</option>';
    STATUS_ORDER.forEach(function (s) { if (st[s]) stOpts += '<option value="' + s + '">' + s + '</option>'; });
    document.getElementById('f-status').innerHTML = stOpts;

    var chips = '<span class="chip' + (allTiers() ? ' on' : '') + '" data-tier="*">全部档位 <span class="cnt">' + JOINABLE.length + '</span></span>';
    JOIN_TIERS.forEach(function (t) {
      chips += '<span class="chip' + (state.tiers[t] ? ' on' : '') + '" data-tier="' + t + '">' +
        t + ' ' + TIER_NAME[t] + ' <span class="cnt">' + JOINABLE.filter(function (c) {
          return tierOfSeq(c['序号']) === t;
        }).length + '</span></span>';
    });
    document.getElementById('tier-chips').innerHTML = chips;
  }
  function allTiers() {
    return JOIN_TIERS.every(function (t) { return state.tiers[t]; });
  }
  function matchItem(c) {
    var f = bySeqFit[c['序号']] || {};
    if (!state.tiers[f['档位']]) return false;
    if (state.level && c['级别等次'] !== state.level) return false;
    if (state.status && statusOf(c['序号']) !== state.status) return false;
    if (state.evidence && evKind(f['证据']) !== state.evidence) return false;
    if (state.dept && depts(f['归口']).indexOf(state.dept) < 0) return false;
    if (state.q) {
      var hay = [c['名称'], (c['别名'] || []).join(' '), (c['关键词'] || []).join(' '),
        c['主办单位'], c['归口部门'], f['细分专业'], f['切入'], f['归口']].join(' ').toLowerCase();
      var qs = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < qs.length; i++) if (hay.indexOf(qs[i]) < 0) return false;
    }
    return true;
  }
  function rowDetail(c) {
    var f = bySeqFit[c['序号']] || {};
    var ca = bySeqCal[c['序号']] || {};
    var kind = evKind(f['证据']);
    var kindNote = kind === '档案' ? '一手核对（有单档案或候选清单记录）' :
      (kind === '推定' ? '按名称/主办/归口推定，<b>当届简章未取得，必须核简章</b>' :
        (kind === '候选' ? '候选清单，未做一手核对' : '待核'));
    var src = f.source || {};
    var ft = (fit.meta && fit.meta.generatedAt) || '';
    var h = '<tr class="detail-row"><td colspan="7"><div class="detail">';
    h += '<div class="f full"><span class="lbl">竞赛名称（照抄 66 号附件1）</span><span class="val">' + esc(c['名称']) + '</span></div>';
    h += '<div class="f"><span class="lbl">序号 / 原序号</span><span class="val">' + displayNo(c['序号']) +
      ' <span class="src">（原序号 ' + c['序号'] + '）</span></span></div>';
    h += '<div class="f"><span class="lbl">级别 / 等次</span><span class="val">' + esc(c['级别等次']) + '</span></div>';
    h += '<div class="f"><span class="lbl">主办单位</span><span class="val">' + esc(c['主办单位']) + '</span></div>';
    h += '<div class="f"><span class="lbl">归口部门（校内）</span><span class="val">' + esc(c['归口部门']) + '</span></div>';
    h += '<div class="f"><span class="lbl">细分专业</span><span class="val">' + esc(f['细分专业'] || '—') + '</span></div>';
    h += '<div class="f"><span class="lbl">切入方式</span><span class="val">' + esc(f['切入'] || '—') + '</span></div>';
    h += '<div class="f"><span class="lbl">证据等级</span><span class="val">' + evBadge(f['证据']) +
      ' <span class="src">' + esc(f['证据'] || '') + ' — ' + kindNote + '</span></span></div>';
    h += '<div class="f"><span class="lbl">CSV 行号 / 源</span><span class="val">' + esc(f.csvLine != null ? '第 ' + f.csvLine + ' 行' : '待补') +
      ' <span class="src">（' + esc((c.source && c.source.file) || '') + ':' + esc((c.source && c.source.line) || '?') + '）</span></span></div>';
    h += '<div class="f"><span class="lbl">赛历状态</span><span class="val">' + statusBadge(ca['状态'] || '待补', ca) +
      (ca['状态依据'] ? '<span class="src"> ' + esc(plain(ca['状态依据'])) + '</span>' : '') + '</span></div>';
    if (ca && ((ca['nodes'] || []).length || ca['报名截止'])) {
      h += '<div class="f full"><span class="lbl">时间节点（官方 / 推算 / 待补）</span>' +
        '<span class="val">' + nodesBlock(ca) + '</span></div>';
    }
    h += '<div class="f"><span class="lbl">赛历来源</span><span class="val">' + link(ca['来源URL']) +
      (ca['抓取日期'] ? ' <span class="src">抓取 ' + esc(ca['抓取日期']) + '</span>' : '') + '</span></div>';
    h += '<div class="f"><span class="lbl">数据溯源</span><span class="val src">适配：' +
      esc(src.file || '') + (src.line ? ':' + src.line : '') + '（生成 ' + esc(ft) + '）</span></div>';
    h += '</div></td></tr>';
    return h;
  }
  function listView() {
    var rows = JOINABLE.filter(matchItem);
    var tb = document.querySelector('#list-table tbody');
    var hint = document.getElementById('list-hint');
    hint.innerHTML = '显示 <b>' + rows.length + '</b> / ' + JOINABLE.length + ' 项' +
      ' · 证据「推定」标黄，须核当届简章';
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty">没有符合条件的赛事，放宽筛选试试。</td></tr>';
      return;
    }
    var h = '';
    rows.forEach(function (c) {
      var f = bySeqFit[c['序号']] || {};
      var open = !!state.open[c['序号']];
      h += '<tr data-seq="' + c['序号'] + '">' +
        '<td class="datenum">' + displayNo(c['序号']) + '</td>' +
        '<td class="c-name' + (open ? ' open' : '') + '">' +
        '<span class="nm">' + esc(c['名称']) + '</span>' +
        '<span class="op">' + (open ? '收起 ▴' : '展开明细 ▾') + '</span></td>' +
        '<td>' + tierCell(f['档位']) + '</td>' +
        '<td><span class="badge lv">' + esc(c['级别等次']) + '</span></td>' +
        '<td>' + esc(f['细分专业'] || '—') + '</td>' +
        '<td>' + evBadge(f['证据']) + '</td>' +
        '<td>' + statusBadge(statusOf(c['序号']), bySeqCal[c['序号']]) + '</td></tr>';
      if (open) h += rowDetail(c);
    });
    tb.innerHTML = h;
  }
  function bindList() {
    document.querySelector('#list-table tbody').addEventListener('click', function (e) {
      var nameCell = e.target.closest('td.c-name');
      if (!nameCell) return;
      var tr = nameCell.closest('tr');
      var seq = tr.getAttribute('data-seq');
      state.open[seq] = !state.open[seq];
      listView();
    });
    var q = document.getElementById('q');
    var timer = null;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = q.value.trim(); listView(); }, 120);
    });
    document.getElementById('f-level').addEventListener('change', function (e) {
      state.level = e.target.value; listView();
    });
    document.getElementById('f-evidence').addEventListener('change', function (e) {
      state.evidence = e.target.value; listView();
    });
    document.getElementById('f-dept').addEventListener('change', function (e) {
      state.dept = e.target.value; listView();
    });
    document.getElementById('f-status').addEventListener('change', function (e) {
      state.status = e.target.value; listView();
    });
    document.getElementById('tier-chips').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      var t = c.getAttribute('data-tier');
      if (t === '*') {
        JOIN_TIERS.forEach(function (x) { state.tiers[x] = true; });
      } else {
        state.tiers[t] = !state.tiers[t];
        var any = JOIN_TIERS.some(function (x) { return state.tiers[x]; });
        if (!any) state.tiers[t] = true;
      }
      initListFilters();
      listView();
    });
  }

  // ---------- 视图三：分值 / 现金测算（只针对 A/B/C 可报项）
  function shortColumn(c) {
    var scope = c['适用范围'] === '不区分' ? '' : '·' + c['适用范围'];
    return c['等次'] + scope;
  }
  function columnForLevel(level) {
    if (level.indexOf('甲等') >= 0) return 'JIA_MAIN';
    if (level.indexOf('乙等') >= 0) return 'YI';
    if (level.indexOf('丙等') >= 0) return 'BING';
    return '';
  }
  function initScore() {
    var ev = document.getElementById('c-event');
    ev.innerHTML = '<option value="">不指定赛事（自行选口径）</option>' +
      JOINABLE.map(function (c) {
        return '<option value="' + c['序号'] + '">' + (c['序号'] + ' · ' + c['名称']) + '</option>';
      }).join('');

    var cs = document.getElementById('c-column');
    cs.innerHTML = COLUMNS.map(function (c) {
      return '<option value="' + esc(c.key) + '" title="' + esc(c.label) + '">' + esc(c.label) + '</option>';
    }).join('');
    var as = document.getElementById('c-award');
    as.innerHTML = AWARDS.map(function (a) {
      return '<option value="' + esc(a['获奖层级']) + '">' + esc(a['获奖层级']) + '</option>';
    }).join('');
    // 显式给默认值：不依赖浏览器「自动选第一项」的隐式行为
    if (COLUMNS.length) cs.value = COLUMNS[0].key;
    if (AWARDS.length) as.value = AWARDS[0]['获奖层级'];
    document.getElementById('c-x').value = (rule.xPerPoint && rule.xPerPoint.value) || 5;
    ev.addEventListener('change', function () {
      var seq = ev.value;
      if (!seq) return;
      var c = bySeqComp[seq];
      if (!c) return;
      var key = columnForLevel(c['级别等次']);
      if (key) document.getElementById('c-column').value = key;
      calcView();
    });
    cs.addEventListener('change', calcView);
    as.addEventListener('change', calcView);
    document.getElementById('c-x').addEventListener('input', calcView);
  }
  function findCell(col, award) {
    for (var i = 0; i < CELLS.length; i++) {
      if (CELLS[i].column === col && CELLS[i]['获奖层级'] === award) return CELLS[i];
    }
    return null;
  }
  function tierRuleOf(cell) {
    if (!cell) return null;
    var rules = rule.rules || [];
    for (var i = 0; i < rules.length; i++) {
      if (cell.tier && cell.tier.indexOf(rules[i].tier) === 0) return rules[i];
    }
    return null;
  }
  function calcView() {
    var col = document.getElementById('c-column').value;
    var award = document.getElementById('c-award').value;
    var X = parseFloat(document.getElementById('c-x').value);
    if (isNaN(X) || X < 0) X = 0;
    var cell = findCell(col, award);
    var r = tierRuleOf(cell);
    var out = document.getElementById('calc-result');
    if (!cell) { out.innerHTML = '<p class="muted">没有这一格。</p>'; return; }

    var points = cell.points;
    var cash = null, method = '';
    if (cell.cashFixed != null) {
      cash = cell.cashFixed;
      method = '第二层次：定额，不乘分值';
    } else if ((cell.tier || '').indexOf('第三层次') === 0) {
      cash = points * X;
      method = '第三层次：分值 × X';
    } else {
      cash = 0;
      method = '第四层次：0 元（只计工作量，不参与绩效分配）';
    }
    var assumed = (method.indexOf('× X') >= 0);

    var evSel = document.getElementById('c-event');
    var evName = '';
    if (evSel && evSel.value) {
      var evc = bySeqComp[evSel.value];
      if (evc) evName = evc['名称'];
    }

    var h = '<div class="big">' + num(cash) + ' 元</div>';
    h += '<div class="row">' +
      '<div><span class="lbl">业绩分值</span>' + num(points) + ' 分</div>' +
      '<div><span class="lbl">现金口径</span>' + esc(method) + (assumed ? ' <span class="assume">X=' + X + ' 为假设值</span>' : '') + '</div>' +
      '<div><span class="lbl">成果层次</span>' + esc(cell.tier || '待补') + '</div>' +
      '<div><span class="lbl">参赛口径</span>' + esc(cell.columnLabel || '') + '</div>' +
      '</div>';
    if (evName) h += '<div class="note">按赛事「' + esc(evName) + '」的级别等次选定参赛口径；甲等赛事若是国际项目/非主体赛，请手动切到 JIA_INTL 那一行。</div>';
    h += '<div class="note">第二层次与业绩分不重复奖励：测算收益只取现金或只取分值，不叠加。</div>';
    out.innerHTML = h;

    var m = document.querySelectorAll('#matrix td.num');
    for (var i = 0; i < m.length; i++) {
      var c = m[i];
      c.classList.toggle('hl', c.getAttribute('data-col') === col && c.getAttribute('data-award') === award);
    }
  }
  function matrixView() {
    var h = '<div class="panel"><h3>业绩分值矩阵（66 号附件2）</h3>';
    h += '<p class="hint">点任意格可切到该口径；括号内为现金口径。' +
      '甲等分两种范围，看「适用范围」不要混用。</p>';
    h += '<div class="tw"><table class="grid matrix"><thead><tr><th>获奖层级</th>';
    COLUMNS.forEach(function (c) { h += '<th class="num">' + esc(shortColumn(c)) + '</th>'; });
    h += '</tr></thead><tbody>';
    AWARDS.forEach(function (a) {
      h += '<tr><td>' + esc(a['获奖层级']) + (a['是否合并'] ? ' <span class="badge" title="附件2 末行合并档">合并档</span>' : '') + '</td>';
      COLUMNS.forEach(function (c) {
        var cell = findCell(c.key, a['获奖层级']);
        var sub = '—';
        if (cell) {
          if (cell.cashFixed != null) sub = '定额 ' + num(cell.cashFixed) + ' 元';
          else if ((cell.tier || '').indexOf('第三层次') === 0) sub = '分值 × X';
          else sub = '0 元';
        }
        h += '<td class="num" data-col="' + esc(c.key) + '" data-award="' + esc(a['获奖层级']) + '">' +
          '<div>' + (cell ? num(cell.points) + ' 分' : '—') + '</div>' +
          '<div class="muted" style="font-size:11.5px">' + esc(sub) + '</div></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    h += '<div class="panel"><h3>合并档说明</h3><p>' + esc(sc.mergeNote || '') + '</p></div>';
    if (rule.xPerPoint) {
      h += '<div class="panel"><h3>X 元/分（<span class="assume">假设值</span>）</h3><ul>' +
        '<li>当前取 <b>' + esc(rule.xPerPoint.value) + ' ' + esc(rule.xPerPoint.unit || '元/分') + '</b>，状态：' +
        esc(rule.xPerPoint.status || '') + '（official = ' + esc(String(rule.xPerPoint.official)) + '）</li>' +
        '<li>推算依据：' + esc((rule.xPerPoint.derivedFrom && (rule.xPerPoint.derivedFrom.cash + ' 元 / ' +
          rule.xPerPoint.derivedFrom.points + ' 分')) || '待补') + '</li>' +
        '<li>' + esc(rule.xPerPoint.note || '') + '</li></ul>' +
        '<p class="hint">单元格里可以直接改 X 试算，页面上不会保存。</p></div>';
    }
    if (sc.level2Quota) {
      h += '<div class="panel"><h3>Ⅱ级甲等（第八条第1款）</h3>' +
        '<p>' + esc(sc.level2Quota.rule) + '（' + esc(sc.level2Quota.source || '') + '）</p>' +
        '<p class="hint">分值：第一层级 ' + num((sc.level2Quota.points || {})['奖项第一层级']) +
        ' / 第二层级 ' + num((sc.level2Quota.points || {})['奖项第二层级']) +
        ' / 第三层级 ' + num((sc.level2Quota.points || {})['奖项第三层级']) +
        '，现金口径：' + esc(sc.level2Quota.cashRule) + '（' + esc(sc.level2Quota.tier) + '）</p></div>';
    }
    document.getElementById('matrix').innerHTML = h;
    document.querySelector('#matrix').addEventListener('click', function (e) {
      var td = e.target.closest('td.num');
      if (!td) return;
      document.getElementById('c-column').value = td.getAttribute('data-col');
      document.getElementById('c-award').value = td.getAttribute('data-award');
      calcView();
    });
  }

  // ---------- 视图四：快速入口
  function quickView() {
    var picks = [49, 46, 47];
    var h = '';
    picks.forEach(function (seq) {
      var c = bySeqComp[seq];
      var f = bySeqFit[seq] || {};
      if (!c) return;
      var text = f['切入'] || '';
      var m = /群\s*([0-9]{6,12})/.exec(text);
      var ca = bySeqCal[seq] || {};
      h += '<div class="card"><h3>' + esc(c['名称']) + '</h3>' +
        '<div><span class="badge lv">序号 ' + displayNo(seq) + '</span> ' + tierBadge(f['档位']) +
        ' <span class="badge lv">' + esc(c['级别等次']) + '</span> ' +
        statusBadge(ca['状态'] || '待补', ca) + '</div>' +
        '<div class="kv"><span class="lbl">校内 QQ 群</span>' +
        (m ? '<span class="qq">' + esc(m[1]) + '</span>' : '<span class="none">未在数据中查到群号（待补，不编）</span>') +
        '</div>' +
        '<div class="kv"><span class="lbl">切入 / 备注</span>' + esc(plain(text)) + '</div>' +
        '<div class="kv"><span class="lbl">归口</span>' + esc(f['归口'] || c['归口部门']) + '</div>' +
        '</div>';
    });
    document.getElementById('quick-body').innerHTML = h;
  }

  // ---------- 视图五：口径与溯源
  function aboutView() {
    var h = '';
    h += '<div class="panel"><h3>现金口径</h3><ul>';
    ((rule.rules) || []).forEach(function (r) {
      h += '<li><b>' + esc(r.tier) + ' ' + esc(r.tierName) + '</b>：' + esc(r.cashMethod) +
        '；' + esc(r.formula) + '<br><span class="hint">' + esc(r.note) + '</span></li>';
    });
    h += '</ul>';
    if (rule.xPerPoint) {
      h += '<p class="hint">X 元/分当前值 <span class="assume">' + esc(rule.xPerPoint.value) + ' ' +
        esc(rule.xPerPoint.unit) + '</span>（' + esc(rule.xPerPoint.status) + '）。' + esc(rule.xPerPoint.note) + '</p>';
    }
    h += '<p>' + esc(sc.mergeNote || '') + '</p>';
    h += '<p class="hint">第二层次与业绩分不重复奖励：测算只取现金或只取分值，不叠加。</p></div>';

    h += '<div class="panel"><h3>源文件</h3><ul>' +
      '<li>比赛目录：<code>docs/data/竞赛目录_66号附件1.csv</code>（114 项；CSV 行号 = 序号 + 1）</li>' +
      '<li>适配判定：<code>docs/赛事库/专业适配_计算机类.md</code></li>' +
      '<li>赛历：<code>docs/赛事库/</code> 赛历 md · 学术时间与补充节点</li>' +
      '<li>分值：<code>docs/data/竞赛业绩分值矩阵.json</code>（66 号附件2）</li>' +
      '<li>制度依据：常大〔2025〕66号（2025-12-19 施行）、常大委〔2025〕36号（2025-06-13 施行）；已废止版本不作依据。</li></ul></div>';
    document.getElementById('about-body').innerHTML = h;
  }

  // ---------- 页脚
  function footer() {
    document.getElementById('foot').innerHTML =
      '数据来源 <code>tools/out</code>（6 份 json）· 生成时间 ' + esc(genAt) +
      ' · Ⅰ级目录 ' + nComp + ' 项 · 可报 ' + JOINABLE.length + ' 项<br>' +
      '仅供筛选参考，报名以当届官方简章为准；标黄「推定」的档位与「待补」的时间必须回官方核对。' +
      '本页不构成学校认定口径。';
  }

  // ---------- 初始化
  initListFilters();
  timeReport();
  timelineView();
  listView();
  bindList();
  initScore();
  matrixView();
  calcView();
  quickView();
  aboutView();
  footer();

  // ---------- 回到顶部（滚过 400px 才出现，抽屉 z-index 更高会盖住它）
  var toTop = document.getElementById('to-top');
  function syncToTop() {
    if (!toTop) return;
    var y = window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) || 0;
    if (y > 400) toTop.classList.add('show');
    else toTop.classList.remove('show');
  }
  if (toTop) {
    toTop.addEventListener('click', function () {
      if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', syncToTop, { passive: true });
    syncToTop();
  }

  var want = (location.hash || '').replace('#', '');
  if (want && document.getElementById('pane-' + want)) setTab(want, false);

  // 调试/验收钩子：统计卡点开的同一入口，供 node _smoke.js 调用
  window.__ssh = {
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    locate: locate,
    listView: listView,
    timeReport: timeReport,
    nodesBlock: nodesBlock,
    timelineView: timelineView,
    timelineMarkers: timelineMarkers,
    toggleSource: toggleSource,
    tlShow: tlShow,
    jumpTo: jumpTo,
    syncToTop: syncToTop,
    toTopElement: toTop,
    state: state,
    joinable: JOINABLE.length,
    unjoinable: UNJOINABLE.length
  };
})();
