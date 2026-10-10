const samples = {
  explicit: '10 sheets, stainless steel grade 304, thickness 0.060 in, 48 x 96 in.',
  ambiguous: 'Need 10 stainless sheets 4 x 8 ASAP.',
  conflict: 'Quote 304 stainless, grade 316 required on certificate, 5 sheets, 48 x 96 x 0.060 in.'
};
const $ = (s) => document.querySelector(s);
const rfqEl = $('#rfq'), countEl = $('#char-count'), results = $('#results');
let latest = null, answers = {}, toastTimer;
rfqEl.addEventListener('input', () => { countEl.textContent = `${rfqEl.value.length.toLocaleString()} / 20,000`; answers = {}; });
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
  rfqEl.value = samples[button.dataset.sample]; rfqEl.dispatchEvent(new Event('input'));
  $('#form-error').hidden = true; rfqEl.focus();
}));
$('#file-input').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  if (file.size > 50000) { showError('That file is too large. Choose a text file under 50 KB.'); e.target.value = ''; return; }
  try { rfqEl.value = await file.text(); rfqEl.dispatchEvent(new Event('input')); showToast(`Loaded ${file.name}`); }
  catch { showError('Could not read that file. Try a plain text .txt file.'); }
  e.target.value = '';
});
$('#analyze').addEventListener('click', () => analyze());
async function analyze() {
  const rfq = rfqEl.value.trim();
  if (!rfq) { showError('Paste an RFQ or choose a sample before analyzing.'); rfqEl.focus(); return; }
  $('#form-error').hidden = true;
  const button = $('#analyze'); button.disabled = true; button.querySelector('span:first-child').textContent = 'Analyzing…';
  try {
    const response = await fetch('/api/quote', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({rfq, answers}) });
    let data; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status}).`);
    if (!Array.isArray(data.lines)) throw new Error('The quote response is missing line items.');
    latest = data; render(data); results.hidden = false;
    results.scrollIntoView({behavior:'smooth', block:'start'});
  } catch (err) { showError(err.message || 'Could not analyze this RFQ. Check that the local server is running.'); }
  finally { button.disabled = false; button.querySelector('span:first-child').textContent = 'Analyze RFQ'; }
}
function render(data) {
  const lines = data.lines || [];
  $('#line-count').textContent = `${lines.length} ${lines.length === 1 ? 'LINE' : 'LINES'}`;
  const ready = data.status === 'ready_for_review';
  $('#status-banner').classList.toggle('ready', ready);
  $('#status-title').textContent = ready ? 'Ready for human review' : 'Clarification needed';
  $('#status-copy').textContent = ready ? 'All listed specs and prices have catalog support. This remains a draft.' : 'Open questions are highlighted below. Blocked lines are excluded from the total.';
  $('#status-pill').textContent = ready ? 'DRAFT · REVIEW REQUIRED' : 'REVIEW REQUIRED';
  $('#status-banner .banner-icon').textContent = ready ? '✓' : '!';
  $('#total').textContent = money(data.total_usd);
  $('#line-list').innerHTML = lines.length ? lines.map((line,i) => renderLine(line,i)).join('') : '<div class="no-questions">No line items were extracted. Try adding one item per line.</div>';
  const questions = [];
  lines.forEach((line,i) => (line.issues || []).forEach(issue => questions.push({line,i,issue})));
  $('#issue-summary').textContent = questions.length ? `${questions.length} open ${questions.length === 1 ? 'question' : 'questions'} across ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}` : 'No open questions';
  $('#questions-list').innerHTML = questions.length ? questions.map(q => renderQuestion(q)).join('') : '<div class="no-questions">Every extracted field has support. Review the evidence and confirm all commercial terms before sending.</div>';
  $('#questions-list').querySelectorAll('input[data-field]').forEach(input => input.addEventListener('change', () => {
    const i = input.dataset.line, field = input.dataset.field; answers[i] ||= {};
    answers[i][field] = ['thickness_in','width_in','length_in'].includes(field) ? (input.value.trim() ? Number(input.value) : null) : input.value.trim();
    input.classList.toggle('answered', !!input.value.trim());
    if (input.value.trim() && field !== 'note') { showToast('Clarification saved — rechecking quote'); analyze(); }
  }));
}
function renderLine(line,i) {
  const specs = [['Grade',line.grade,'grade'],['Thk',fmt(line.thickness_in),'thickness_in'],['Width',fmt(line.width_in),'width_in'],['Length',fmt(line.length_in),'length_in']].filter(([,v]) => v !== null && v !== undefined && v !== '');
  const evidence = line.source_text || '(No source text returned)';
  const ev = line.evidence || {};
  const catalogName = ev.source || (line.data_label === 'Synthetic demo catalog' ? 'Synthetic demo catalog' : line.data_label === 'Supplied catalog' ? 'Supplied catalog' : 'No exact catalog match');
  const price = line.unit_price_usd == null ? '<span class="unpriced">No supported price</span>' : `<b>${money(line.line_total_usd)} </b><small>${money(line.unit_price_usd)} / sheet</small>`;
  const units = [line.thickness_in,line.width_in,line.length_in].filter(v=>v!=null).length ? 'in' : '';
  return `<article class="line-item"><div class="line-top"><span class="line-number">${String(i+1).padStart(2,'0')}</span><div style="min-width:0"><div class="line-title">${esc(line.quantity ?? '—')} ${esc(line.unit || 'sheet')}${Number(line.quantity)===1?'':'s'}${line.grade ? ` · Grade ${esc(line.grade)}` : ''}</div><div class="spec-chips">${specs.map(([k,v,field])=>`<span class="spec-chip">${k} ${esc(v)}${k==='Thk' || k==='Width' || k==='Length' ? ` ${units}`:''}${answers[i]?.[field] !== undefined ? ' · human clarified':''}</span>`).join('') || '<span class="spec-chip">Specifications incomplete</span>'}</div></div><div class="line-price">${price}</div></div><div class="line-meta"><div class="evidence-box"><div class="meta-label">BUYER SOURCE · VERBATIM</div><div class="evidence-text">“${esc(evidence)}”</div>${Object.keys(answers[i]||{}).length?'<small class="clarification-note">Resolved specs shown above came from human clarification; original source is unchanged.</small>':''}</div><div class="match-box"><span class="match-symbol">${ev.catalog_id ? '✓' : '○'}</span><div><b>${esc(catalogName)}</b><small>${ev.certificates?.length ? `Certificates: ${esc(ev.certificates.join(', '))}` : ev.catalog_id ? 'No certificate evidence supplied' : 'Match not established'}</small></div></div></div>${(line.issues||[]).length?`<div class="issue-tags">${line.issues.map(x=>`<span class="issue-tag">${esc(x)}</span>`).join('')}</div>`:''}</article>`;
}
function renderQuestion({line,i,issue}) {
  const lower=issue.toLowerCase();
  if ((lower.includes('width') && lower.includes('length')) || (lower.includes('dimension') && lower.includes('width') && lower.includes('length'))) {
    return ['width_in','length_in'].filter(field=>line[field]==null).map(field=>{
      const label=`Line ${i+1} · ${field==='width_in'?'Width':'Length'} (in)`, value=answers[i]?.[field] ?? '', placeholder=field==='width_in'?'e.g. 48':'e.g. 96';
      return `<div class="question"><label for="q-${i}-${field}">${esc(label)}</label><input id="q-${i}-${field}" type="number" min="0" step="any" inputmode="decimal" data-line="${i}" data-field="${field}" value="${esc(value)}" placeholder="${placeholder}" aria-describedby="q-desc-${i}-${field}"><div class="question-source" id="q-desc-${i}-${field}">${esc(issue)}</div></div>`;
    }).join('');
  }
  let field='',label='',value='',placeholder='Enter clarification';
  if (lower.includes('grade')) {field='grade';label=`Line ${i+1} · Confirm stainless grade`;value=answers[i]?.grade ?? line.grade ?? '';placeholder='e.g. 304';}
  else if (lower.includes('thickness')) {field='thickness_in';label=`Line ${i+1} · Thickness (in)`;value=answers[i]?.thickness_in ?? line.thickness_in ?? '';placeholder='e.g. 0.060';}
  else if (lower.includes('width')) {field='width_in';label=`Line ${i+1} · Width (in)`;value=answers[i]?.width_in ?? line.width_in ?? '';placeholder='e.g. 48';}
  else if (lower.includes('length')) {field='length_in';label=`Line ${i+1} · Length (in)`;value=answers[i]?.length_in ?? line.length_in ?? '';placeholder='e.g. 96';}
  else if (lower.includes('dimension units') || lower.includes('units')) {field='dimension_unit';label=`Line ${i+1} · Confirm dimension units`; value=answers[i]?.dimension_unit ?? '';placeholder='inches';}
  else if (lower.includes('quantity')) {field='quantity';label=`Line ${i+1} · Positive sheet quantity`;value=answers[i]?.quantity ?? line.quantity ?? '';placeholder='e.g. 10';}
  else {field='note'; label=`Line ${i+1} · Review`; value='';placeholder='Clarification for seller';}
  return `<div class="question"><label for="q-${i}-${field}">${esc(label)}</label><input id="q-${i}-${field}" type="text" inputmode="${field.endsWith('_in')||field==='quantity'?'decimal':'text'}" data-line="${i}" data-field="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-describedby="q-desc-${i}-${field}"><div class="question-source" id="q-desc-${i}-${field}">${esc(issue)}</div></div>`;
}
function money(n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n.toLocaleString('en-US',{style:'currency',currency:'USD'}) : '—'; }
function fmt(n){return typeof n==='number'?String(n):n}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function exportObject(){if(!latest)return null; return {document_type:'DRAFT — FOR HUMAN REVIEW',product:'QuoteProof',created_at:new Date().toISOString(),data_notice:latest.data_notice||'Synthetic demo catalog may be used. Verify all prices and certificates.',status:latest.status,total_usd:latest.total_usd,lines:latest.lines,unresolved_issues:latest.issues||[],integration_status:latest.integration_status||{nicrronninoo:'unavailable',block_convey:'unavailable'}}}
function download(name,type,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#export-json').addEventListener('click',()=>{const obj=exportObject();if(obj)download('quoteproof-draft.json','application/json',JSON.stringify(obj,null,2));});
$('#export-csv').addEventListener('click',()=>{if(!latest)return;const rows=[['DRAFT — FOR HUMAN REVIEW','Synthetic/demo data must be verified'],['quantity','unit','grade','thickness_in','width_in','length_in','unit_price_usd','line_total_usd','source_text','issues','catalog_source','certificates'],...latest.lines.map(l=>[l.quantity,l.unit,l.grade,l.thickness_in,l.width_in,l.length_in,l.unit_price_usd,l.line_total_usd,l.source_text,(l.issues||[]).join('; '),l.evidence?.source||l.data_label||'',(l.evidence?.certificates||[]).join('; ')])];download('quoteproof-draft.csv','text/csv;charset=utf-8',rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n\r\n'+csvCell(`UNRESOLVED ISSUES: ${(latest.issues||[]).join('; ')||'None'}`));});
$('#export-text').addEventListener('click',async()=>{if(!latest)return;const obj=exportObject();const text=`QUOTEPROOF QUOTE DRAFT — FOR HUMAN REVIEW\nStatus: ${latest.status}\nIndicative total: ${money(latest.total_usd)}\n${latest.data_notice||'Synthetic demo pricing may apply; verify.'}\n\n${latest.lines.map((l,i)=>`${i+1}. ${l.quantity??'Qty?'} ${l.unit} grade ${l.grade??'unspecified'} — ${[l.thickness_in,l.width_in,l.length_in].map(x=>x??'?').join(' x ')} in; ${l.unit_price_usd==null?'no supported unit price':money(l.unit_price_usd)+' / sheet'}; line ${money(l.line_total_usd)}\n   Source: ${l.source_text}\n   Issues: ${(l.issues||[]).join('; ')||'None'}`).join('\n')}\n\nUnresolved: ${(latest.issues||[]).join('; ')||'None'}\nIntegrations: Nicrronninoo unavailable; Block Convey unavailable.`;
 try{await navigator.clipboard.writeText(text);showToast('Draft summary copied');}catch{download('quoteproof-draft.txt','text/plain',text);showToast('Clipboard unavailable — downloaded draft summary');}});
function csvCell(v){const raw=String(v??'');const safe=/^[\s]*[=+\-@\t\r\n]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`}
function showError(message){const el=$('#form-error');el.textContent=message;el.hidden=false}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
