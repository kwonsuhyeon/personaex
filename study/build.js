// node build.js — src/*.md + style.css + dag-*.js + page.js → causal-graph-study.html
// 원본은 src/*.md다. 결과 HTML을 직접 고치지 말고 원본을 고친 뒤 다시 빌드한다.
//
// 마크다운 확장 문법
//   # 제목 {#id}            장(h2). ## → h3, ### → h4
//   :::dag 프리셋id          DAG 위젯 (프리셋은 dag-presets.js)
//   :::box answer|note|warn|extra 제목  …  :::   강조 상자 (extra = 원문 외 보충)
//   :::check 그룹id  - 항목 …  :::              이해 확인 체크박스 (localStorage 저장)
//   {{보충}}                 "원문 외 보충" 배지
//   [[papers:노트id|표시글]]  papers-wiki 딥링크
//   <dfn>용어</dfn>          용어 정의 (부록 색인에 자동 수집)
//   < 로 시작하는 줄          HTML 그대로 통과 (빈 줄까지)
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const OUT = path.join(DIR, 'causal-graph-study.html');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  // sh_wiki 공통 규약: ASCII 화살표를 유니코드로 (코드 밖에서만)
  s = s.replace(/<->/g, '↔').replace(/=>/g, '⇒').replace(/->/g, '→').replace(/<= /g, '⇐ ').replace(/<- /g, '← ');
  s = s.replace(/\{\{보충\}\}/g, '<span class="badge-extra">원문 외 보충</span>');
  s = s.replace(/\[\[papers:([^\]|]+)\|([^\]]+)\]\]/g, '<a class="pw" data-note="$1">$2</a>');
  s = s.replace(/\[\[papers:([^\]]+)\]\]/g, '<a class="pw" data-note="$1">📚 $1</a>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

const slug = (() => { let n = 0; return () => `s${++n}`; })();

function render(md, toc, secTitle) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = l => /^(#{1,3} |:::|```|\||> |\s*[-*] |\s*\d+\. |<)/.test(l) || l.trim() === '';
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    let m;
    if ((m = line.match(/^(#{1,3}) (.+?)(?:\s*\{#([\w-]+)\})?\s*$/))) {
      const level = m[1].length + 1, text = m[2], id = m[3] || slug();
      if (level <= 3) toc.push({ level, id, text: text.replace(/<[^>]+>/g, '') });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++; continue;
    }
    if ((m = line.match(/^:::dag\s+(\w+)/))) { out.push(`<div class="dag" data-preset="${m[1]}"></div>`); i++; continue; }
    if (/^:::dagrow/.test(line)) { // 정적 그림 여러 개를 한 줄로
      const ids = line.replace(/^:::dagrow\s*/, '').split(/\s+/).filter(Boolean);
      out.push(`<div class="dagrow n${ids.length}">${ids.map(id => `<div class="dag" data-preset="${id}"></div>`).join('')}</div>`); i++; continue;
    }
    if ((m = line.match(/^:::box\s+(\w+)\s*(.*)$/))) {
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      i++;
      out.push(`<div class="box ${m[1]}">${m[2] ? `<div class="box-title">${inline(m[2])}</div>` : ''}${render(body.join('\n'), [], secTitle)}</div>`);
      continue;
    }
    if ((m = line.match(/^:::check\s+([\w-]+)/))) {
      const group = m[1], items = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') { const t = lines[i++].replace(/^\s*-\s*(\[ \]\s*)?/, '').trim(); if (t) items.push(t); }
      i++;
      out.push(`<ul class="check">${items.map((t, k) => `<li><label><input type="checkbox" data-key="${group}-${k}"><span>${inline(t)}</span></label></li>`).join('')}</ul>`);
      continue;
    }
    if (line.startsWith('```')) {
      const body = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`); continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => { // 코드(`…`)와 [[링크|글]] 안의 | 는 열 구분으로 보지 않는다
        const body = r.trim().replace(/^\|/, '').replace(/\|$/, '');
        const out = []; let cur = '', inCode = false, inLink = false;
        for (const ch of body) {
          if (ch === '`') inCode = !inCode;
          if (cur.endsWith('[') && ch === '[') inLink = true;
          if (cur.endsWith(']') && ch === ']') inLink = false;
          if (ch === '|' && !inCode && !inLink) { out.push(cur.trim()); cur = ''; } else cur += ch;
        }
        out.push(cur.trim());
        return out;
      };
      const hasHead = rows[1] && /^\|?\s*:?-{2,}/.test(rows[1]);
      const head = hasHead ? `<thead><tr>${cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const body = (hasHead ? rows.slice(2) : rows).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<table>${head}<tbody>${body}</tbody></table>`); continue;
    }
    if (line.startsWith('> ')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${render(body.join('\n'), [], secTitle)}</blockquote>`); continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)[0].length;
        const text = lines[i].replace(/^\s*([-*]|\d+\.) /, '');
        if (indent >= 2 && items.length) items[items.length - 1].sub.push(text); else items.push({ text, sub: [] });
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map(it => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map(s => `<li>${inline(s)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (line.startsWith('<')) {
      const body = [];
      while (i < lines.length && lines[i].trim() !== '') body.push(lines[i++]);
      out.push(inline(body.join('\n'))); continue;
    }
    const para = [];
    while (i < lines.length && !isBlockStart(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const files = fs.readdirSync(path.join(DIR, 'src')).filter(f => f.endsWith('.md')).sort();
const toc = [];
const sections = files.map(f => {
  const md = fs.readFileSync(path.join(DIR, 'src', f), 'utf8');
  const title = (md.match(/^# (.+?)(?:\s*\{#[\w-]+\})?\s*$/m) || [, f])[1];
  return `<section data-title="${esc(title)}">\n${render(md, toc, title)}\n</section>`;
}).join('\n');

const tocHtml = toc.map(t => `<a class="h${t.level}" href="#${t.id}">${esc(t.text)}</a>`).join('\n');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const built = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>인과 그래프 스터디 — SEM 연구자를 위한 인과추론</title>
<style>
${read('style.css')}
</style>
</head>
<body>
<div class="layout">
<nav class="toc">
<div class="toc-title">목차</div>
${tocHtml}
<div class="progress"></div>
</nav>
<main>
<header class="hero">
<h1>인과 그래프 스터디</h1>
<p>"SEM 연구자를 위한 인과추론 — AI 시대의 구조적 인과 모델(SCM) 입문" 특강 대비 · papers-wiki 자료 기반</p>
<p>빌드 ${built} · 원본 <code>papers-wiki/wiki/study/src/*.md</code> → <code>node build.js</code></p>
</header>
${sections}
</main>
</div>
<script>
${read('dag-core.js')}
${read('dag-presets.js')}
${read('page.js')}
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html, 'utf8');
console.log(`빌드 완료: ${path.basename(OUT)} (${files.length}개 장, 목차 ${toc.length}항목, ${(html.length / 1024).toFixed(0)}KB)`);
