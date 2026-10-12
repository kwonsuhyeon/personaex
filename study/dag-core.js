// d-분리 판정 — 브라우저(window.DagCore)와 Node(require) 양쪽에서 쓴다.
// preset: { nodes:[{id,label,x,y,latent}], edges:[[from,to]], x:'처치', y:'결과' }
(function (root) {
  function buildGraph(p) {
    const parents = {}, children = {};
    p.nodes.forEach(n => { parents[n.id] = []; children[n.id] = []; });
    p.edges.forEach(([a, b]) => { children[a].push(b); parents[b].push(a); });
    return { parents, children };
  }

  function descendants(g, id) {
    const out = new Set(), stack = [...g.children[id]];
    while (stack.length) {
      const v = stack.pop();
      if (!out.has(v)) { out.add(v); stack.push(...g.children[v]); }
    }
    return out;
  }

  // 방향을 무시한 골격(skeleton)에서 x → y 단순 경로 전체
  function allPaths(p) {
    const adj = {};
    p.nodes.forEach(n => { adj[n.id] = []; });
    p.edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const res = [], path = [p.x], seen = new Set([p.x]);
    (function dfs(u) {
      if (u === p.y) { res.push(path.slice()); return; }
      for (const v of adj[u]) {
        if (seen.has(v)) continue;
        seen.add(v); path.push(v); dfs(v); path.pop(); seen.delete(v);
      }
    })(p.x);
    return res;
  }

  const hasEdge = (p, a, b) => p.edges.some(e => e[0] === a && e[1] === b);

  // S: 통제(조건화)한 노드 집합
  function analyzePath(p, g, path, S) {
    const steps = [];
    for (let i = 0; i < path.length - 1; i++) steps.push(hasEdge(p, path[i], path[i + 1]) ? '→' : '←');
    const causal = steps.every(s => s === '→');
    const backdoor = steps[0] === '←';
    let blockedBy = null;
    const openedColliders = [];
    for (let i = 1; i < path.length - 1; i++) {
      const m = path[i];
      const collider = steps[i - 1] === '→' && steps[i] === '←';
      if (collider) {
        const viaDesc = [...descendants(g, m)].find(v => S.has(v));
        if (S.has(m) || viaDesc) { openedColliders.push({ node: m, via: S.has(m) ? m : viaDesc }); continue; }
        blockedBy = { node: m, why: 'collider' }; break;
      }
      if (S.has(m)) { blockedBy = { node: m, why: 'conditioned' }; break; }
    }
    return { path, steps, causal, backdoor, open: !blockedBy, blockedBy, openedColliders };
  }

  function analyze(p, S) {
    S = S instanceof Set ? S : new Set(S || []);
    const g = buildGraph(p);
    const paths = allPaths(p).map(pa => analyzePath(p, g, pa, S));
    const descX = descendants(g, p.x);
    const badCtrl = [...S].filter(v => descX.has(v));
    const openNonCausal = paths.filter(r => !r.causal && r.open);
    const openCausal = paths.filter(r => r.causal && r.open);
    const blockedCausal = paths.filter(r => r.causal && !r.open);
    return {
      paths, descX, badCtrl, openNonCausal, openCausal, blockedCausal,
      // 뒷문 기준: X의 후손을 통제하지 않고, 열린 비인과 경로가 없다
      identified: openNonCausal.length === 0 && badCtrl.length === 0,
    };
  }

  function toDagitty(p) {
    const lines = ['dag {'];
    p.nodes.forEach(n => {
      const role = n.id === p.x ? 'exposure,' : n.id === p.y ? 'outcome,' : n.latent ? 'latent,' : '';
      lines.push(`  ${n.id} [${role}pos="${(n.x / 100).toFixed(2)},${(n.y / 100).toFixed(2)}"]`);
    });
    p.edges.forEach(([a, b]) => lines.push(`  ${a} -> ${b}`));
    lines.push('}');
    return lines.join('\n');
  }

  const api = { buildGraph, descendants, allPaths, analyze, toDagitty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DagCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
