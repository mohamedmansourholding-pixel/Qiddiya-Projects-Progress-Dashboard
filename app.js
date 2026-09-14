const fmt = n => Math.round(n).toLocaleString('en-US');
const pct = n => (n*100).toFixed(1)+'%';
const pct0 = n => (n*100).toFixed(0)+'%';
const PALETTE = ['#2DD4E8','#9B7BF5','#FBBF54','#3ADDA0','#FF7A93','#5EA8FF','#F19BE0','#7DE0C4'];
const STATUS_COLOR = {'A - Approved':'#3ADDA0','B - Approved with Comments':'#5EA8FF','C - Revise and Resubmit':'#FF7A93','Pending':'#FBBF54'};
const GAUGE_TARGETS = {'Mix Design':['#3ADDA0'],'Material Approval Request':['#FBBF54'],'Shop Drawing':['#FF7A93'],
  'Inspection & Test Plan':['#FBBF54'],'Prequalification Submittal':['#5EA8FF'],'Method Statement':['#3ADDA0']};
const GAUGE_SHORT = {'Mix Design':'Mix Design','Material Approval Request':'MAT','Shop Drawing':'Shop DWG',
  'Inspection & Test Plan':'ITP','Prequalification Submittal':'Pre-Qualifi','Method Statement':'MS'};

Chart.defaults.color = '#9AA5B8';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';

// Lightweight custom plugin: draws the numeric value above each point of any
// line dataset flagged with showValueLabels (used for the % Complete line on
// the concrete pouring chart).
const lineValueLabelsPlugin = {
  id: 'lineValueLabels',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    chart.data.datasets.forEach((dataset, i)=>{
      if(!dataset.showValueLabels) return;
      const meta = chart.getDatasetMeta(i);
      if(meta.hidden) return;
      meta.data.forEach((point, idx)=>{
        const raw = dataset.data[idx];
        if(raw===null || raw===undefined) return;
        const label = (dataset.valueFormatter ? dataset.valueFormatter(raw) : raw);
        ctx.save();
        ctx.font = "700 11px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // small pill background for legibility over bars/gridlines
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(6,9,15,0.72)';
        ctx.fillRect(point.x-textWidth/2-4, point.y-22, textWidth+8, 15);
        ctx.fillStyle = dataset.borderColor || '#3ADDA0';
        ctx.fillText(label, point.x, point.y-8);
        ctx.restore();
      });
    });
  }
};
Chart.register(lineValueLabelsPlugin);

// ================================================================
// BOOT SEQUENCE — loads config.json (branding/title) and data.json
// (all dashboard data) at runtime, then applies config to the header
// and runs the existing render pipeline unchanged below.
// ================================================================
function applyConfig(cfg, dataRowCount){
  if(cfg.pageTitle) document.title = cfg.pageTitle;
  const set = (id, val) => { const el = document.getElementById(id); if(el && val!=null) el.textContent = val; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if(el && val!=null) el.innerHTML = val; };
  const logoEl = document.getElementById('cfgLogo');
  if(logoEl && cfg.logoSrc){ logoEl.src = cfg.logoSrc; logoEl.alt = cfg.orgName || 'Logo'; }
  set('cfgOrgDivision', cfg.orgDivision);
  setHtml('cfgProjectTitle', cfg.projectTitle);
  const taglineEl = document.getElementById('cfgTagline');
  if(taglineEl && cfg.tagline){
    taglineEl.innerHTML = cfg.tagline.replace('{{totalCount}}', fmt(dataRowCount));
  }
}

async function boot(){
  const [CONFIG, RAW] = await Promise.all([
    fetch('config.json').then(r=>r.json()),
    fetch('data.json').then(r=>r.json())
  ]);
  applyConfig(CONFIG, RAW.rows.length);

// "TODAY" badge updates automatically to the real current date whenever the
// page is opened; the small line underneath shows how fresh the underlying
// data itself is (the latest submission date found in the source file).
const todayStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'});
document.getElementById('reportDate').textContent = todayStr;
document.getElementById('dataAsOf').textContent = 'Data as of ' + RAW.reportDateStr;
document.getElementById('cutoffDate').textContent = RAW.concreteCutoff;

/* ============================================================
   SUBMITTALS TAB — real client-side filtering
   ============================================================ */
const state = {disc:-1, doctype:-1, status:-1, zone:-1};

function populateSelect(id, options){
  const sel = document.getElementById(id);
  options.forEach((o,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = o;
    sel.appendChild(opt);
  });
}
populateSelect('f-disc', RAW.disciplines);
populateSelect('f-doctype', RAW.doctypes);
populateSelect('f-status', RAW.statuses);
populateSelect('f-zone', RAW.zones);

['disc','doctype','status','zone'].forEach(k=>{
  document.getElementById('f-'+k).addEventListener('change', e=>{
    state[k] = parseInt(e.target.value);
    renderSubmittals();
  });
});
document.getElementById('resetSub').addEventListener('click', ()=>{
  state.disc=-1; state.status=-1; state.doctype=-1; state.zone=-1;
  ['f-disc','f-doctype','f-status','f-zone'].forEach(id=>document.getElementById(id).value=-1);
  renderSubmittals();
});

// row = [discIdx, doctypeIdx, statusIdx, zoneIdx, dayOff]
function matches(r, ignore){
  if(ignore!=='disc' && state.disc>=0 && r[0]!==state.disc) return false;
  if(ignore!=='doctype' && state.doctype>=0 && r[1]!==state.doctype) return false;
  if(ignore!=='status' && state.status>=0 && r[2]!==state.status) return false;
  if(ignore!=='zone' && state.zone>=0 && r[3]!==state.zone) return false;
  return true;
}

let wirChart, statusChart, trendChart;

function renderSubmittals(){
  const filtered = RAW.rows.filter(r=>matches(r));
  const total = filtered.length;
  document.getElementById('resultPill').textContent = `${fmt(total)} of ${fmt(RAW.rows.length)}`;

  const statusIdxA = RAW.statuses.indexOf('A - Approved');
  const statusIdxB = RAW.statuses.indexOf('B - Approved with Comments');
  const statusIdxC = RAW.statuses.indexOf('C - Revise and Resubmit');
  const statusIdxP = RAW.statuses.indexOf('Pending');

  const approved = filtered.filter(r=>r[2]===statusIdxA||r[2]===statusIdxB).length;
  const pending = filtered.filter(r=>r[2]===statusIdxP).length;
  const revise = filtered.filter(r=>r[2]===statusIdxC).length;

  document.getElementById('k-total').textContent = fmt(total);
  document.getElementById('k-total-sub').innerHTML = `<b>${pct(total/RAW.rows.length)}</b> of all tracked submittals`;
  document.getElementById('k-approval').textContent = total? pct(approved/total) : '—';
  document.getElementById('k-pending').textContent = fmt(pending);
  document.getElementById('k-pending-sub').innerHTML = total? `<b>${pct(pending/total)}</b> of filtered set` : '—';
  document.getElementById('k-revise').textContent = fmt(revise);

  // ---- 6 submission gauges (respect Discipline + all other filters; target
  //      is now correctly discipline-aware, matching the source "Expected
  //      number" sheet which breaks targets down by discipline) ----
  const gaugeHost = document.getElementById('smallGauges');
  gaugeHost.innerHTML = '';
  Object.entries(GAUGE_SHORT).forEach(([full,short])=>{
    const dtIdx = RAW.doctypes.indexOf(full);
    const actual = filtered.filter(r=>r[1]===dtIdx).length;
    const targetByDisc = RAW.expTargetByDiscipline[full] || {};
    let target;
    if(state.disc>=0){
      target = targetByDisc[RAW.disciplines[state.disc]] || 0;
    } else {
      target = Object.values(targetByDisc).reduce((a,b)=>a+b,0);
    }
    const p = target? Math.min(actual/target,1) : (actual>0 ? 1 : 0);
    const color = GAUGE_TARGETS[full][0];
    const div = document.createElement('div');
    div.className='gcard';
    div.innerHTML = `<div class="name">${short}</div>
      <div class="ring-wrap"><div class="ring" style="background:conic-gradient(${color} 0deg, ${color} ${p*360}deg, rgba(255,255,255,0.06) ${p*360}deg)"></div><div class="ring-center">${actual}</div></div>
      <div class="range"><span>0</span><span>${target}</span></div>`;
    gaugeHost.appendChild(div);
  });
  document.getElementById('gaugeContextNote').textContent = state.disc>=0
    ? `Targets shown for ${RAW.disciplines[state.disc]} only — expected numbers are set per discipline in the source data`
    : `Targets summed across all disciplines — select a Discipline above to see its own target`;

  // ---- WIR by discipline (ignores discipline filter) ----
  const wirDtIdx = RAW.doctypes.indexOf('Work Inspection Request');
  const wirFiltered = RAW.rows.filter(r=>matches(r,'disc') && r[1]===wirDtIdx);
  const wirByDisc = {};
  RAW.disciplines.forEach((d,i)=>{ wirByDisc[d] = wirFiltered.filter(r=>r[0]===i).length; });
  const wirLabels = Object.keys(wirByDisc).filter(d=>wirByDisc[d]>0 || state.disc<0);
  const wirData = wirLabels.map(d=>wirByDisc[d]);
  if(wirChart) wirChart.destroy();
  wirChart = new Chart(document.getElementById('wirChart'), {
    type:'bar',
    data:{labels:wirLabels, datasets:[{data:wirData, backgroundColor:wirLabels.map((_,i)=>PALETTE[i%PALETTE.length]), borderRadius:5, barThickness:30}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.06)'}}, y:{grid:{display:false}, ticks:{font:{family:'Inter', size:12}, color:'#EEF2F9'}}}}
  });

  // ---- Status donut (ignores status filter) ----
  const statusFiltered = RAW.rows.filter(r=>matches(r,'status'));
  const statusCounts = {};
  RAW.statuses.forEach((s,i)=>{ statusCounts[s] = statusFiltered.filter(r=>r[2]===i).length; });
  const sTotal = statusFiltered.length;
  document.getElementById('statusTag').textContent = `of ${fmt(sTotal)}`;
  if(statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('statusChart'), {
    type:'doughnut',
    data:{labels:Object.keys(statusCounts), datasets:[{data:Object.values(statusCounts), backgroundColor:Object.keys(statusCounts).map(s=>STATUS_COLOR[s]), borderColor:'#0E1220', borderWidth:3}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{display:false}}}
  });
  const legendHost = document.getElementById('statusLegend');
  legendHost.innerHTML = '';
  Object.entries(statusCounts).forEach(([s,c])=>{
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<span class="dot" style="background:${STATUS_COLOR[s]}"></span><span class="lab">${s}</span><span class="num">${fmt(c)} · ${sTotal? (c/sTotal*100).toFixed(0):0}%</span>`;
    legendHost.appendChild(row);
  });

  // ---- monthly trend (respects all filters) ----
  const dayToMonth = d => {
    const dt = new Date(RAW.epoch); dt.setDate(dt.getDate()+d);
    return dt.toLocaleString('en-US',{month:'short',year:'2-digit'});
  };
  const monthOrder = [];
  const monthCounts = {};
  filtered.forEach(r=>{
    const m = dayToMonth(r[4]);
    if(!(m in monthCounts)){ monthCounts[m]=0; monthOrder.push(m); }
    monthCounts[m]++;
  });
  // stable chronological order
  const uniqueDays = [...new Set(filtered.map(r=>r[4]))].sort((a,b)=>a-b);
  const seenMonths = [];
  uniqueDays.forEach(d=>{ const m=dayToMonth(d); if(!seenMonths.includes(m)) seenMonths.push(m); });
  let cum = 0;
  const cumData = seenMonths.map(m=>{ cum += monthCounts[m]; return cum; });
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trendChart'), {
    data:{labels:seenMonths, datasets:[
      {type:'bar', label:'Monthly submissions', data:seenMonths.map(m=>monthCounts[m]), backgroundColor:'rgba(45,212,232,0.55)', borderRadius:4, order:2},
      {type:'line', label:'Cumulative', data:cumData, yAxisID:'y1', borderColor:'#9B7BF5', backgroundColor:'#9B7BF5', tension:.35, pointRadius:3, order:1}
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{font:{family:'Inter', size:11}, color:'#EEF2F9'}}},
      scales:{x:{grid:{display:false}}, y:{title:{display:true,text:'monthly',color:'#9AA5B8'}, grid:{color:'rgba(255,255,255,0.06)'}},
        y1:{position:'right', grid:{display:false}, title:{display:true,text:'cumulative',color:'#9AA5B8'}}}}
  });
}

/* ============================================================
   PROGRESS RING (static, top of Submittals tab)
   ============================================================ */
const prog = RAW.progress;
document.getElementById('progressPct').textContent = pct(prog.actual);
document.getElementById('planPct').textContent = pct(prog.plan);
document.getElementById('weeklyPct').textContent = pct(prog.weekly);
const variance = prog.actual - prog.plan;
const varEl = document.getElementById('variancePct');
varEl.textContent = (variance>=0?'+':'')+pct(variance);
varEl.style.color = variance>=0 ? '#3ADDA0' : '#FF7A93';
const ring = document.getElementById('progressRing');
requestAnimationFrame(()=>{
  ring.style.background = `conic-gradient(from -90deg, var(--c1) 0deg, var(--c2) ${prog.actual*360}deg, rgba(255,255,255,0.06) ${prog.actual*360}deg)`;
});

renderSubmittals();

/* ============================================================
   CONCRETE TAB
   ============================================================ */
const contypes = [...new Set(RAW.qcItems.map(i=>i.type))];
populateSelect('f-contype', contypes);
let conState = -1;
document.getElementById('f-contype').addEventListener('change', e=>{ conState = parseInt(e.target.value); renderConcrete(); });

let concreteChart;
function renderConcrete(){
  const items = RAW.qcItems.filter((it,idx)=> conState<0 || contypes.indexOf(it.type)===conState);
  document.getElementById('concreteResultPill').textContent = `${items.length} of ${RAW.qcItems.length} items`;
  const totalBoq = items.reduce((a,b)=>a+b.boq,0);
  const totalActual = items.reduce((a,b)=>a+b.actual,0);
  document.getElementById('concretePct').textContent = totalBoq? pct(totalActual/totalBoq) : '0%';
  document.getElementById('boqTotal').textContent = fmt(totalBoq);
  document.getElementById('actualTotal').textContent = fmt(totalActual);
  document.getElementById('remainingTotal').textContent = fmt(totalBoq-totalActual);

  if(concreteChart) concreteChart.destroy();
  concreteChart = new Chart(document.getElementById('concreteChart'), {
    data:{labels:items.map(i=>i.item), datasets:[
      {type:'bar', label:'BOQ Qty', data:items.map(i=>i.boq), backgroundColor:'rgba(94,168,255,0.35)', borderRadius:4, order:2},
      {type:'bar', label:'Actual Poured', data:items.map(i=>i.actual), backgroundColor:'#FBBF54', borderRadius:4, order:2},
      {type:'line', label:'% Complete', data:items.map(i=> i.boq? i.actual/i.boq*100:0), yAxisID:'y1', borderColor:'#3ADDA0', backgroundColor:'#3ADDA0', tension:.3, pointRadius:4, order:1,
        showValueLabels:true, valueFormatter:v=>v.toFixed(1)+'%'}
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:24}},
      plugins:{legend:{labels:{font:{family:'Inter', size:11}, color:'#EEF2F9'}}},
      scales:{x:{grid:{display:false}, ticks:{font:{family:'Inter', size:11}}},
        y:{title:{display:true,text:'m³',color:'#9AA5B8'}, grid:{color:'rgba(255,255,255,0.06)'}},
        y1:{position:'right', min:0, max:100, grid:{display:false}, title:{display:true,text:'% complete',color:'#9AA5B8'}, ticks:{callback:v=>v+'%'}}}}
  });

  const tbody = document.getElementById('concreteTableBody');
  tbody.innerHTML = '';
  items.forEach(i=>{
    const p = i.boq? i.actual/i.boq : 0;
    const barColor = p>=0.5?'#3ADDA0':(p>0?'#FBBF54':'#FF7A93');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i.type}</td><td style="color:var(--text)">${i.item}</td><td class="num">${fmt(i.boq)}</td><td class="num">${fmt(i.budget)}</td><td class="num">${fmt(i.actual)}</td>
      <td><div style="display:flex; align-items:center; gap:8px;"><div class="mini-bar" style="flex:1"><div style="width:${(p*100).toFixed(1)}%; background:${barColor}"></div></div><span class="mono" style="font-size:11px; width:42px; text-align:right;">${(p*100).toFixed(1)}%</span></div></td>`;
    tbody.appendChild(tr);
  });
}
renderConcrete();

} // end boot()

boot().catch(err=>{
  console.error('Dashboard failed to load:', err);
  document.body.innerHTML = '<div style="padding:40px; font-family:Inter,sans-serif; color:#FF7A93; max-width:640px; margin:60px auto; background:#10151F; border:1px solid #3a2530; border-radius:12px;">'
    + '<h2 style="margin-top:0;">Could not load dashboard data</h2>'
    + '<p>This page needs to fetch <code>config.json</code> and <code>data.json</code> from the same folder. '
    + 'If you opened this file directly from disk (file://), most browsers block that for security reasons — '
    + 'serve the folder with a local web server, or view it via GitHub Pages instead.</p>'
    + '<p style="color:#9AA5B8; font-size:13px;">Technical detail: ' + (err && err.message ? err.message : err) + '</p></div>';
});
