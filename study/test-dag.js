// node test-dag.js — 프리셋 기대 결과와 d-분리 판정 비교
const core = require('./dag-core.js');
const presets = require('./dag-presets.js');
let fail = 0, total = 0;
for (const [id, p] of Object.entries(presets)) {
  if (p.static) continue;
  for (const t of p.tests || []) {
    const r = core.analyze(p, t.S);
    const got = { openCausal: r.openCausal.length, openNonCausal: r.openNonCausal.length, identified: r.identified };
    for (const k of ['openCausal', 'openNonCausal', 'identified']) {
      if (!(k in t)) continue;
      total++;
      if (got[k] !== t[k]) { fail++; console.log(`FAIL ${id} S={${t.S}} ${k}: 기대 ${t[k]}, 실제 ${got[k]}`); }
    }
  }
}
console.log(`${total - fail}/${total} 통과`);
process.exit(fail ? 1 : 0);
