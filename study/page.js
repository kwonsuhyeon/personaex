// 페이지 동작: DAG 위젯, 목차 강조, 체크리스트 저장, 용어 색인, papers-wiki 링크
const PAPERS_PORT = 4711;           // papers-wiki 서버 포트 (바뀌면 여기만 고친다)
const STORE_PREFIX = 'causal-study:';
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- DAG 위젯 ----------
function mountDag(host) {
  const id = host.dataset.preset;
  const p = window.DAG_PRESETS[id];
  if (!p) { host.textContent = `프리셋 없음: ${id}`; return; }
  const S = new Set();
  const isStatic = !!p.static;
  host.classList.toggle('static', isStatic);

  const W = isStatic ? 360 : 640, sx = isStatic ? 3.0 : 5.0, sy = isStatic ? (p.sy || 1) : 2.6, ox = isStatic ? 30 : 70, oy = 30;
  const maxY = Math.max(...p.nodes.map(n => n.y));
  const H = oy + maxY * sy + 40;
  const pos = Object.fromEntries(p.nodes.map(n => [n.id, { x: ox + n.x * sx, y: oy + n.y * sy }]));
  const size = Object.fromEntries(p.nodes.map(n => {
    const len = [...n.label].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? 14 : 8.2), 0);
    return [n.id, { w: Math.max(44, len + 22), h: 32 }];
  }));

  host.innerHTML = `<div class="dag-head"><span>${esc(p.title)}</span>${isStatic ? '' : '<button type="button">초기화</button>'}</div>
    <div class="dag-body"><div class="dag-svg"></div>${isStatic ? '' : '<div class="dag-panel"></div>'}</div>`;
  if (isStatic) host.querySelector('.dag-body').style.display = 'block';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': p.title });
  host.querySelector('.dag-svg').appendChild(svg);
  const defs = el('defs', {}, svg);
  for (const kind of ['plain', 'causal', 'bias', 'closed']) {
    const m = el('marker', { id: `arr-${id}-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    const color = { plain: '#6b7380', causal: 'var(--path-causal)', bias: 'var(--path-bias)', closed: 'var(--path-closed)' }[kind];
    el('path', { d: 'M0,0 L10,5 L0,10 z', style: `fill:${color}` }, m);
  }
  const edgeLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg);

  function clip(a, b) { // a 중심에서 b 중심으로 향하는 선을 b 상자 경계에서 자른다
    const dx = b.x - a.x, dy = b.y - a.y, hw = size[b.id].w / 2 + 3, hh = size[b.id].h / 2 + 3;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: b.x - dx * t, y: b.y - dy * t };
  }
  const edgeEls = p.edges.map(([a, b]) => {
    const A = { ...pos[a], id: a }, B = { ...pos[b], id: b };
    const start = clip(B, A), end = clip(A, B);
    return { a, b, line: el('line', { x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: 'edge' }, edgeLayer) };
  });
  // 개입으로 지워진 화살표: 점선 + ✕ (정적 그림 전용)
  (p.removed || []).forEach(([a, b]) => {
    const A = { ...pos[a], id: a }, B = { ...pos[b], id: b };
    const start = clip(B, A), end = clip(A, B);
    el('line', { x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: 'edge removed' }, edgeLayer);
    const t = el('text', { x: (start.x + end.x) / 2 + 10, y: (start.y + end.y) / 2 + 5, class: 'cut-mark' }, edgeLayer);
    t.textContent = '✕ 끊김';
  });
  const nodeEls = {};
  p.nodes.forEach(n => {
    const g = el('g', { class: 'node' + (n.latent ? ' latent' : '') + (n.id === p.x ? ' is-x' : '') + (n.id === p.y ? ' is-y' : '') + (n.fixed ? ' fixed' : '') }, nodeLayer);
    const { w, h } = size[n.id];
    el('rect', { x: pos[n.id].x - w / 2, y: pos[n.id].y - h / 2, width: w, height: h, rx: 8 }, g);
    const t = el('text', { x: pos[n.id].x, y: pos[n.id].y + 1 }, g); t.textContent = n.label;
    nodeEls[n.id] = g;
    if (!isStatic && !n.latent && n.id !== p.x && n.id !== p.y) {
      g.addEventListener('click', () => { S.has(n.id) ? S.delete(n.id) : S.add(n.id); render(); });
      el('title', {}, g).textContent = '클릭하면 통제/해제';
    }
  });

  if (isStatic) { // edgeKinds: { 'A>B': 'causal'|'bias'|'closed' } 로 경로 색을 지정할 수 있다
    edgeEls.forEach(e => {
      const kind = (p.edgeKinds || {})[`${e.a}>${e.b}`] || 'plain';
      e.line.setAttribute('class', 'edge ' + kind);
      e.line.setAttribute('marker-end', `url(#arr-${id}-${kind})`);
    });
    return;
  }

  const panel = host.querySelector('.dag-panel');
  host.querySelector('.dag-head button').addEventListener('click', () => { S.clear(); render(); });
  const label = nid => p.nodes.find(n => n.id === nid).label.split(' ')[0];

  function render() {
    const r = window.DagCore.analyze(p, S);
    const edgeKind = {};
    for (const pr of r.paths) {
      if (!pr.open) continue;
      for (let i = 0; i < pr.path.length - 1; i++) {
        const k = pr.steps[i] === '→' ? `${pr.path[i]}>${pr.path[i + 1]}` : `${pr.path[i + 1]}>${pr.path[i]}`;
        if (!pr.causal) edgeKind[k] = 'bias'; else if (edgeKind[k] !== 'bias') edgeKind[k] = 'causal';
      }
    }
    edgeEls.forEach(e => {
      const kind = edgeKind[`${e.a}>${e.b}`] || 'closed';
      e.line.setAttribute('class', 'edge ' + kind);
      e.line.setAttribute('marker-end', `url(#arr-${id}-${kind})`);
    });
    for (const [nid, g] of Object.entries(nodeEls)) g.classList.toggle('ctrl', S.has(nid));

    const items = r.paths.map(pr => {
      const txt = pr.path.map((n, i) => label(n) + (i < pr.steps.length ? ` ${pr.steps[i]} ` : '')).join('');
      let why = pr.causal ? '인과 경로' : (pr.backdoor ? '비인과 경로(뒷문)' : '비인과 경로');
      if (pr.open) {
        why += ' · 열림';
        if (pr.openedColliders.length) why += ` — 충돌변수 ${pr.openedColliders.map(c => label(c.node) + (c.via !== c.node ? `(후손 ${label(c.via)} 통제)` : '')).join(', ')}를 통제해서 열림`;
      } else {
        why += pr.blockedBy.why === 'collider' ? ` · 막힘 — 충돌변수 ${label(pr.blockedBy.node)}에서 막힘` : ` · 막힘 — ${label(pr.blockedBy.node)}를 통제해서 막힘`;
      }
      const cls = (pr.causal ? 'causal' : 'bias') + (pr.open ? ' open' : ' closed');
      return `<li class="${cls}">${esc(txt)}<br><span class="why">${esc(why)}</span></li>`;
    }).join('');

    let verdict;
    if (r.badCtrl.length) {
      verdict = `<div class="verdict bad">✖ X의 후손 ${r.badCtrl.map(label).join(', ')}를 통제했다 → 총효과를 구할 수 없다 (인과 경로를 막거나 충돌 편향을 만든다)</div>`;
    } else if (r.openNonCausal.length) {
      const stuck = r.openNonCausal.every(pr => pr.path.slice(1, -1).every(n => p.nodes.find(x => x.id === n).latent || pr.openedColliders.some(c => c.node === n)));
      verdict = `<div class="verdict bad">✖ 열린 비인과 경로 ${r.openNonCausal.length}개 → 추정치에 편향이 남는다</div>` +
        (stuck ? '<div class="hint">남은 경로는 측정하지 못한 변수만 거친다. 통제로는 막을 수 없다 — 도구변수·DID 같은 다른 식별 전략이 필요하다.</div>' : '');
    } else {
      const causalExists = r.paths.some(pr => pr.causal);
      verdict = `<div class="verdict ok">✔ 열린 비인과 경로 없음 → 뒷문 기준 충족, 총효과 식별 가능${causalExists ? '' : ' (X → Y 인과 경로가 없으니 참 효과는 0)'}</div>`;
    }
    const ctrlTxt = S.size ? `{ ${[...S].map(label).join(', ')} }` : '{ } (아무것도 통제 안 함)';
    const extra = p.extra && S.has(p.extra.when) ? `<div class="extra-msg">${esc(p.extra.text)}</div>` : '';
    panel.innerHTML = `<div class="hint">노드를 클릭하면 통제/해제된다. 점선 노드는 측정하지 못한 변수라 통제할 수 없다.</div>
      <div><b>통제 집합</b> ${esc(ctrlTxt)}</div>${verdict}${extra}
      <div><b>X와 Y 사이 경로 ${r.paths.length}개</b></div><ul class="paths">${items}</ul>
      <div class="dag-note">${esc(p.note || '')}</div>
      <details><summary>DAGitty에서 같은 그래프 그리기</summary><pre><code>${esc(window.DagCore.toDagitty(p))}</code></pre>
      <div class="hint">dagitty.net → Model → Model code 칸에 붙여 넣는다.</div></details>`;
  }
  render();
}

// 프리셋 기대 결과 자체 점검 (콘솔)
function selfTest() {
  let n = 0, bad = 0;
  for (const [id, p] of Object.entries(window.DAG_PRESETS)) {
    for (const t of (p.tests || [])) {
      const r = window.DagCore.analyze(p, t.S);
      const got = { openCausal: r.openCausal.length, openNonCausal: r.openNonCausal.length, identified: r.identified };
      for (const k of Object.keys(got)) if (k in t) { n++; if (got[k] !== t[k]) bad++; console.assert(got[k] === t[k], `${id} S={${t.S}} ${k}`); }
    }
  }
  console.log(`[DAG 자체 점검] ${n - bad}/${n} 통과`);
}

// ---------- 체크리스트 ----------
function mountChecks() {
  const boxes = [...document.querySelectorAll('ul.check input[type=checkbox]')];
  const update = () => {
    const done = boxes.filter(b => b.checked).length;
    const prog = document.querySelector('nav.toc .progress');
    if (prog) prog.textContent = `이해 확인 체크 ${done}/${boxes.length}`;
  };
  boxes.forEach(b => {
    const key = STORE_PREFIX + b.dataset.key;
    b.checked = localStorage.getItem(key) === '1';
    b.addEventListener('change', () => { b.checked ? localStorage.setItem(key, '1') : localStorage.removeItem(key); update(); });
  });
  update();
}

// ---------- 용어 색인 ----------
function mountGlossary() {
  const host = document.getElementById('glossary');
  if (!host) return;
  const seen = new Map();
  document.querySelectorAll('main dfn').forEach((d, i) => {
    const term = d.textContent.trim();
    if (seen.has(term)) return;
    d.id = d.id || `term-${i}`;
    const sec = d.closest('section');
    seen.set(term, { id: d.id, where: sec ? sec.dataset.title : '' });
  });
  const list = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  host.innerHTML = `<table><thead><tr><th>용어</th><th>처음 정의한 곳</th></tr></thead><tbody>${
    list.map(([t, v]) => `<tr><td><a href="#${v.id}">${esc(t)}</a></td><td>${esc(v.where)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- 목차 강조 ----------
function mountTocSpy() {
  const links = [...document.querySelectorAll('nav.toc a[href^="#"]')];
  const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const onScroll = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top < 120) cur = t;
    links.forEach(a => a.classList.toggle('active', cur && a.getAttribute('href') === '#' + cur.id));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ---------- papers-wiki 링크 ----------
function mountPaperLinks() {
  document.querySelectorAll('a.pw').forEach(a => {
    a.href = `http://localhost:${PAPERS_PORT}/#${a.dataset.note}`;
    a.target = '_blank';
    a.title = 'papers-wiki에서 열기 (서버가 켜져 있어야 함)';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.dag[data-preset]').forEach(mountDag);
  selfTest();
  mountChecks();
  mountGlossary();
  mountTocSpy();
  mountPaperLinks();
});
