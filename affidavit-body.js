/* affidavit-body.js — reorder/insert/undo with export-time exhibit labeling */

/* ---------- DOM helpers ---------- */
const $ = (sel, el=document) => el.querySelector(sel);
const el = (tag, props={}) => Object.assign(document.createElement(tag), props);

/* ---------- Storage keys ---------- */
const LS_CASE_KEY   = "jf_case";
const LS_OATH_KEY   = "jf_oathType";
const LS_PARAS_KEY  = "jf_paragraphs";
const LS_SCHEME_KEY = "jf_exhibitScheme"; // "letters" | "numbers"

/* ---------- History (Undo/Redo) ---------- */
const MAX_HISTORY = 50;
let UNDO_STACK = [];
let REDO_STACK = [];
function snapshotParas() { return localStorage.getItem(LS_PARAS_KEY) || "[]"; }
function pushHistory() { UNDO_STACK.push(snapshotParas()); if (UNDO_STACK.length>MAX_HISTORY) UNDO_STACK.shift(); REDO_STACK = []; syncUndoRedoButtons(); }
function restoreFrom(serialized) { localStorage.setItem(LS_PARAS_KEY, serialized); renderParagraphs(); syncUndoRedoButtons(); }
function canUndo(){return UNDO_STACK.length>0;} function canRedo(){return REDO_STACK.length>0;}
function undo(){ if(!canUndo())return; const cur=snapshotParas(); const prev=UNDO_STACK.pop(); REDO_STACK.push(cur); restoreFrom(prev); }
function redo(){ if(!canRedo())return; const cur=snapshotParas(); const next=REDO_STACK.pop(); UNDO_STACK.push(cur); restoreFrom(next); }
function syncUndoRedoButtons(){ const ub=$("#undoBtn"), rb=$("#redoBtn"); if(!ub||!rb) return; ub.disabled=!canUndo(); rb.disabled=!canRedo(); }

/* ---------- IndexedDB for exhibit PDFs ---------- */
const DB_NAME="affidavitDB"; const STORE="files";
function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"id"}); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function saveFileBlob(file){ const db=await openDB(); return new Promise((res,rej)=>{ const id=crypto.randomUUID(); const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put({id,name:file.name,type:file.type,blob:file}); tx.oncomplete=()=>res(id); tx.onerror=()=>rej(tx.error); }); }
async function getFileBlob(id){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,"readonly"); const req=tx.objectStore(STORE).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error); }); }

/* ---------- Load/save ---------- */
function loadCase(){ try{return JSON.parse(localStorage.getItem(LS_CASE_KEY)||"{}");}catch{return{}} }
function loadOath(){ try{return JSON.parse(localStorage.getItem(LS_OATH_KEY)||"null");}catch{return null} }
function loadParas(){ try{return JSON.parse(localStorage.getItem(LS_PARAS_KEY)||"[]");}catch{return[]} }
function saveParas(list){ localStorage.setItem(LS_PARAS_KEY, JSON.stringify(list)); }
function loadScheme(){ const s = localStorage.getItem(LS_SCHEME_KEY); return s || "letters"; }
function saveScheme(s){ localStorage.setItem(LS_SCHEME_KEY, s); }

/* ---------- Utilities ---------- */
function alpha(n){ let s=""; while(n>0){n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26);} return s; } // 1->A, 26->Z, 27->AA
function byNumber(a,b){ return (a.number||0)-(b.number||0); }

/* ---------- Model helpers ---------- */
function createParagraph(){ return { id:crypto.randomUUID(), number:0, text:"", exhibitFileId:null }; }
function newParagraph(){ const list=loadParas().sort(byNumber); const p=createParagraph(); p.number=list.length+1; return p; }
function renumber(list){ list.forEach((p,i)=>{ p.number=i+1; }); return list; } // no exhibit labels stored
function askExhibitScheme() {
  return new Promise((resolve) => {
    const modal = document.getElementById('schemeModal');
    const ok = document.getElementById('schemeOk');
    const cancel = document.getElementById('schemeCancel');
    const form = document.getElementById('schemeForm');

    const close = (value) => {
      modal.setAttribute('aria-hidden', 'true');
      // cleanup handlers
      ok.onclick = cancel.onclick = null;
      resolve(value); // "letters" | "numbers" | null (if cancelled)
    };

    modal.setAttribute('aria-hidden', 'false');

    ok.onclick = () => {
      const chosen = new FormData(form).get('scheme') || 'letters';
      close(chosen);
    };
    cancel.onclick = () => close(null);

    // close on backdrop click
    modal.onclick = (e) => { if (e.target === modal) close(null); };
  });
}

/** Move an existing paragraph to 1-based position (push others down). */
function moveToPosition(id, target1){
  pushHistory();
  const list=loadParas().sort(byNumber);
  const fromIdx=list.findIndex(p=>p.id===id); if(fromIdx===-1) return;
  const item=list.splice(fromIdx,1)[0];
  const insertIdx=Math.max(0, Math.min(target1-1, list.length));
  list.splice(insertIdx,0,item);
  saveParas(renumber(list));
}

/** Add to end */
function addParagraph(){ pushHistory(); const list=loadParas().sort(byNumber); list.push(newParagraph()); saveParas(renumber(list)); }
/** Insert blank at position */
function insertNewAt(target1){ pushHistory(); const list=loadParas().sort(byNumber); const p=createParagraph(); const idx=Math.max(0,Math.min(target1-1,list.length)); list.splice(idx,0,p); saveParas(renumber(list)); }
/** Insert blank below number */
function insertNewBelow(number1){ pushHistory(); insertNewAt(number1+1); }
/** Patch/update */
function upsertParagraph(patch){ pushHistory(); const list=loadParas().sort(byNumber); const i=list.findIndex(x=>x.id===patch.id); if(i===-1) list.push(patch); else list[i]={...list[i],...patch}; saveParas(renumber(list)); }
/** Delete */
function removeParagraph(id){ pushHistory(); const list=loadParas().filter(p=>p.id!==id).sort(byNumber); saveParas(renumber(list)); }

/* ---------- Exhibit labels (computed on the fly) ---------- */
/** Return a Map of paragraphId -> label in current order for paras that have exhibits. */
function computeExhibitLabels(paras, scheme){
  const map = new Map();
  let idx = 1;
  paras.filter(p=>!!p.exhibitFileId).forEach(p=>{
    map.set(p.id, scheme==="numbers" ? String(idx) : alpha(idx));
    idx++;
  });
  return map;
}

/* ---------- Render heading + intro ---------- */
function renderHeading(){
  const c=loadCase(); const cf=c.courtFile||{};
  const plaintiffName=c.plaintiff?`${(c.plaintiff.first||'').trim()} ${(c.plaintiff.last||'').trim()}`.trim():'';
  const defendantName=c.defendant?`${(c.defendant.first||'').trim()} ${(c.defendant.last||'').trim()}`.trim():'';
  const cfNo=[cf.year,cf.assign,cf.suffix].filter(Boolean).join('-');
  $("#heading").innerHTML = `
    <div>${c.courtName || ''}</div>
    <div><strong>Court File No.:</strong> ${cfNo}</div>
    <div class="style-of-cause mt-6">
      <div><strong>${plaintiffName}</strong></div>
      <div class="vs">v.</div>
      <div><strong>${defendantName}</strong></div>
    </div>
  `;
}

function renderIntro(){
  const c=loadCase(); const d=c.deponent||{}; const oath=(loadOath()||'').toLowerCase();
  const nameOf = (person)=>[person?.first, person?.last].filter(Boolean).join(' ').trim();
  const roleLower=(d.role||'').toLowerCase();

  let fullName=nameOf(d);
  if(!fullName){
    if(roleLower==='plaintiff' && c.plaintiff) fullName=nameOf(c.plaintiff);
    if(roleLower==='defendant' && c.defendant) fullName=nameOf(c.defendant);
  }

  const cityPart = d.city ? `of the City of ${d.city}` : '';
  const provincePart = d.prov ? `in the Province of ${d.prov}` : '';

  let capacityPhrase = '';
  switch (roleLower) {
    case 'plaintiff':
    case 'defendant': capacityPhrase=`the ${roleLower}`; break;
    case 'lawyer': capacityPhrase='the lawyer for a party'; break;
    case 'officer':
    case 'employee': capacityPhrase = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${roleLower} of a party`; break;
    default: capacityPhrase = d.role ? `the ${d.role}` : '';
  }

  const oathText = oath==='swear' ? 'MAKE OATH AND SAY:' : 'AFFIRM:';
  const parts=[fullName?`I, <strong>${fullName}</strong>`:'I,', cityPart, provincePart, capacityPhrase||null].filter(Boolean);
  $("#intro").innerHTML = `
    <h2>Affidavit of ${fullName || ''}</h2>
    <p class="mt-12">${parts.join(', ')}, ${oathText}</p>
  `;
}

/* ---------- Paragraph list UI ---------- */
const paraList = $("#paraList");

function renderParagraphs() {
  const list = loadParas().sort(byNumber);
  const labels = computeExhibitLabels(list, "letters"); // UI default = letters
  paraList.innerHTML = "";
  list.forEach(p => paraList.appendChild(renderRow(p, list.length, labels)));
}


function renderRow(p, totalCount, labels){
  const row = el("div", { className: "row" });
  const labelText = p.exhibitFileId ? (labels.get(p.id) ? `Exhibit ${labels.get(p.id)}` : "Exhibit") : "No exhibit";
  row.innerHTML = `
    <div class="row-num">
      <label>No.</label>
      <div class="para-num-row">
        <div class="num-controls">
          <input type="number" class="num" min="1" step="1" value="${p.number}">
          <button type="button" class="applyReorder">Apply</button>
        </div>
        <button type="button" class="del">Remove paragraph</button>
        <button type="button" class="insBelow">Insert new paragraph below</button>
      </div>
    </div>

    <div class="row-text">
      <label>Paragraph text</label>
      <textarea class="txt" placeholder="Type the paragraph…">${p.text || ""}</textarea>
      <div>
        <span class="pill">${labelText}</span>
        <span class="fileName ml-6"></span>
      </div>
    </div>

    <div class="row-file">
      <label>Attach PDF (optional)</label>
      <input type="file" class="file" accept="application/pdf">
    </div>
  `;

  const num  = $(".num", row);
  const txt  = $(".txt", row);
  const file = $(".file", row);
  const del  = $(".del", row);
  const insBelow = $(".insBelow", row);
  const name = $(".fileName", row);
  const applyReorder = $(".applyReorder", row);

  const desiredNumber = () => {
    let n = Math.round(Number(num.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > totalCount) n = totalCount;
    return n;
  };

  const syncButtonState = () => { applyReorder.disabled = (desiredNumber() === p.number); };
  syncButtonState();
  num.addEventListener('input', syncButtonState);

  applyReorder.onclick = () => { const n=desiredNumber(); if(n!==p.number){ moveToPosition(p.id,n); renderParagraphs(); } };
  del.onclick = () => { if (confirm("Remove this paragraph?")) { removeParagraph(p.id); renderParagraphs(); } };
  insBelow.onclick = () => { insertNewBelow(p.number); renderParagraphs(); };

  txt.oninput = () => { upsertParagraph({ id:p.id, text:txt.value }); };

  file.onchange = async () => {
    const f = file.files?.[0]; if (!f) return;
    if (f.type !== "application/pdf") { alert("Please attach a PDF."); file.value=""; return; }
    const fileId = await saveFileBlob(f);
    upsertParagraph({ id:p.id, exhibitFileId:fileId });
    renderParagraphs();
  };

  (async () => {
    if (p.exhibitFileId) {
      const rec = await getFileBlob(p.exhibitFileId);
      if (rec) name.textContent = `• ${rec.name}`;
    }
  })();

  return row;
}

/* ---------- Export (TXT) ---------- */
function buildAffidavitText(){
  const c=loadCase(), d=(c.deponent||{}), paras=loadParas().sort(byNumber);
  const cf=c.courtFile||{}; const oath=(loadOath()||'').toLowerCase();
  const scheme = loadScheme();
  const labels = computeExhibitLabels(paras, scheme);

  const nameOf=(person)=>[person?.first, person?.last].filter(Boolean).join(" ").trim();
  const roleLower=(d.role||'').toLowerCase();

  let title=nameOf(d);
  if(!title){
    if(roleLower==='plaintiff' && c.plaintiff) title=nameOf(c.plaintiff);
    if(roleLower==='defendant' && c.defendant) title=nameOf(c.defendant);
  }

  const lines=[];
  lines.push(c.courtName||"");
  lines.push(`Court File No.: ${[cf.year,cf.assign,cf.suffix].filter(Boolean).join("-")}`);
  const pl=c.plaintiff?`${(c.plaintiff.first||'').trim()} ${(c.plaintiff.last||'').trim()}`.trim():'';
  const df=c.defendant?`${(c.defendant.first||'').trim()} ${(c.defendant.last||'').trim()}`.trim():'';
  lines.push(`${pl} v. ${df}`.trim());
  lines.push("");
  lines.push(`Affidavit of ${title||""}`);
  lines.push("");

  const cityPart=d.city?`of the City of ${d.city}`:'';
  const provincePart=d.prov?`in the Province of ${d.prov}`:'';
  let capacityPhrase='';
  switch (roleLower){
    case 'plaintiff':
    case 'defendant': capacityPhrase=`the ${roleLower}`; break;
    case 'lawyer': capacityPhrase='the lawyer for a party'; break;
    case 'officer':
    case 'employee': capacityPhrase = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${roleLower} of a party`; break;
    default: capacityPhrase = d.role ? `the ${d.role}` : '';
  }
  const oathText=oath==='swear'?'MAKE OATH AND SAY:':'AFFIRM:';
  const opening=[title?`I, ${title}`:'I,', cityPart, provincePart, capacityPhrase||null].filter(Boolean).join(', ');
  lines.push(`${opening}, ${oathText}`);
  lines.push("");

  paras.forEach(p=>{
    const label = p.exhibitFileId ? labels.get(p.id) : null;
    const suffix = label ? ` (Exhibit ${label})` : "";
    lines.push(`${p.number}. ${p.text || ""}${suffix}`);
  });

  return lines.join("\n");
}

function download(name, blobText){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([blobText],{type:"text/plain"}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Back
  $("#back").onclick = () => history.back();

  // Undo/Redo
  const undoBtn = $("#undoBtn"), redoBtn = $("#redoBtn");
  if (undoBtn) undoBtn.onclick = () => undo();
  if (redoBtn) redoBtn.onclick = () => redo();

  // Export (TXT)
  $("#exportTxt").onclick = () => {
    const txt = buildAffidavitText();
    download("Affidavit.txt", txt);
  };

  // Export (Combined PDF) — ask user for exhibit scheme at click time
  $("#exportPdf").onclick = async () => {
    const scheme = await askExhibitScheme();           // "letters" | "numbers" | null
    if (!scheme) return;                               // user cancelled

    // Current order + labels in chosen scheme (use this for your real PDF merge)
    const paras  = loadParas().sort(byNumber);
    const labels = computeExhibitLabels(paras, scheme);

    // Stub until merge is implemented:
    alert(
      `Export will use ${
        scheme === "letters" ? "Letters (A, B, C…)" : "Numbers (1, 2, 3…)"
      } for exhibits.\n\n(Stub: implement PDF merge here using the computed labels.)`
    );
  };

  // Headings
  renderHeading();
  renderIntro();

  // Ensure at least one paragraph
  if (loadParas().length === 0) { addParagraph(); }
  renderParagraphs();

  // Add / Insert
  $("#addParaEnd").onclick = () => { addParagraph(); renderParagraphs(); };
  const insertAt = $("#insertAt");
  $("#addParaAt").onclick = () => {
    const len = loadParas().length;
    let n = Math.round(Number(insertAt.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > len + 1) n = len + 1; // allow inserting at end via N+1
    insertNewAt(n);
    renderParagraphs();
  };

  // History baseline + button states
  if (UNDO_STACK.length === 0) UNDO_STACK.push(snapshotParas());
  syncUndoRedoButtons();
});