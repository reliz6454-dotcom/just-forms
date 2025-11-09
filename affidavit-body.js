// affidavit-body.js — TipTap-only editors per paragraph + atomic exhibit chips (Node)
// No execCommand, no manual contentEditable handlers — purely TipTap.

import { Editor, Node, Extension } from "https://esm.sh/@tiptap/core@2";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@2";
import Underline from "https://esm.sh/@tiptap/extension-underline@2";
import OrderedList from "https://esm.sh/@tiptap/extension-ordered-list@2";
import BulletList from "https://esm.sh/@tiptap/extension-bullet-list@2";
import ListItem from "https://esm.sh/@tiptap/extension-list-item@2";
import ListKeymap from "https://esm.sh/@tiptap/extension-list-keymap@2";
import { Plugin, PluginKey } from "https://esm.sh/@tiptap/pm@2/state";

import { LS, loadJSON, saveJSON, loadDocSchema, loadDocGuidance } from "./constants.js";

/* ---------- Tiny DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const elx = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  if (props) {
    const { dataset: _ignore, ...rest } = props;
    if (Object.keys(rest || {}).length) Object.assign(node, rest);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
};

/* ---------- Exhibit scheme (letters | numbers) ---------- */
const getExhibitScheme = () => localStorage.getItem(LS.EXHIBIT_SCHEME) || "letters";
const setExhibitScheme = (s) => localStorage.setItem(LS.EXHIBIT_SCHEME, s);
const toLetters = (n)=>{let s="";for(let x=n+1;x>0;){x--;s=String.fromCharCode(65+(x%26))+s;x=Math.floor(x/26)}return s};
const labelFor = (idx, scheme) => scheme === "numbers" ? String(idx + 1) : toLetters(idx);

/* ---------- Storage ---------- */
const loadCase  = () => loadJSON(LS.CASE, {});
const loadOath  = () => loadJSON(LS.OATH, null);
const loadParas = () => loadJSON(LS.PARAS, []);
const saveParas = (list) => saveJSON(LS.PARAS, list);

/* ---------- Undo/Redo at the model level ---------- */
const MAX_HISTORY = 50;
let UNDO = [], REDO = [];
const snap = () => localStorage.getItem(LS.PARAS) || "[]";
const histPush = () => { UNDO.push(snap()); if (UNDO.length>MAX_HISTORY) UNDO.shift(); REDO = []; syncUndoUI(); };
const restore = (s) => { localStorage.setItem(LS.PARAS, s); renderParagraphs(); syncUndoUI(); };
const canUndo = ()=> UNDO.length>0, canRedo=()=> REDO.length>0;
function undo(){ if(!canUndo())return; const cur=snap(); const prev=UNDO.pop(); REDO.push(cur); restore(prev); }
function redo(){ if(!canRedo())return; const cur=snap(); const nxt=REDO.pop(); UNDO.push(cur); restore(nxt); }
function syncUndoUI(){ const ub=$("#undoBtn"), rb=$("#redoBtn"); if(!ub||!rb) return; ub.disabled=!canUndo(); rb.disabled=!canRedo(); }

/* ---------- IndexedDB (files) ---------- */
const DB="affidavitDB", STORE="files";
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
async function writeDoc(doc){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(doc);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function readDoc(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readonly");const q=tx.objectStore(STORE).get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});}
async function saveFileBlob(file){const db=await openDB();return new Promise((res,rej)=>{const id=crypto.randomUUID();const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({id,name:file.name,type:file.type,size:file.size,blob:file,uploadedAt:new Date().toISOString(),pageCount:null,meta:{},system:{},tags:[]});tx.oncomplete=()=>res(id);tx.onerror=()=>rej(tx.error);});}

/* ---------- PDF page count (optional) ---------- */
async function pdfPages(blob){
  try{ if(!window.pdfjsLib?.getDocument) return null;
    const url=URL.createObjectURL(blob); const d=await window.pdfjsLib.getDocument({url}).promise; const n=d.numPages||null; URL.revokeObjectURL(url); return n;
  }catch{ return null; }
}

/* ---------- Utilities ---------- */
const byNo=(a,b)=>(a.number||0)-(b.number||0);
const stripZWSP=(s)=> (s||"").replace(/\u200B/g,"");

/* ---------- Model helpers ---------- */
const newPara = ()=>({ id:crypto.randomUUID(), number:0, html:"", exhibits:[], runs:[{type:"text",text:""}]});
function addPara(){ histPush(); const list=loadParas().sort(byNo); const p=newPara(); p.number=list.length+1; list.push(p); saveParas(list); }
function renumber(list){ list.forEach((p,i)=>p.number=i+1); return list; }
function ensureRuns(p){ if(!Array.isArray(p.runs)) p.runs=[{type:"text",text:""}]; if(typeof p.html!=="string") p.html=""; return p; }
function upsertParagraph(patch){ histPush(); const list=loadParas().sort(byNo); const i=list.findIndex(x=>x.id===patch.id); if(i===-1) list.push(patch); else list[i]={...list[i],...patch}; saveParas(renumber(list)); }
function moveToPos(id,target1){ histPush(); const list=loadParas().sort(byNo); const from=list.findIndex(p=>p.id===id); if(from===-1)return; const it=list.splice(from,1)[0]; const idx=Math.max(0,Math.min(target1-1,list.length)); list.splice(idx,0,it); saveParas(renumber(list)); }
function removeParagraph(id){ histPush(); const list=loadParas().filter(p=>p.id!==id).sort(byNo); saveParas(renumber(list)); const ed=EDITORS.get(id); if(ed){ ed.destroy(); EDITORS.delete(id);} }

/* ---------- Migrations ---------- */
async function migrate() {
  let changed=false; const list=loadParas();
  for(const p of list){ ensureRuns(p); if(typeof p.html!=="string"){p.html="";changed=true;} }
  if(changed) saveParas(list);
}

/* ---------- Labels ---------- */
function computeLabels(paras){
  const scheme=getExhibitScheme(); const map=new Map(); let idx=0;
  paras.sort(byNo).forEach(p=> (p.exhibits||[]).forEach(ex=>{ map.set(ex.id,labelFor(idx,scheme)); idx++; }));
  return map;
}

/* ---------- relabel saved HTML chip text on scheme change ---------- */
function relabelParagraphHTML(p, labels) {
  if (!p || !p.html) return false;
  const div = document.createElement("div");
  div.innerHTML = p.html;
  let changed = false;

  div.querySelectorAll('.exh-chip[data-ex-id]').forEach(n => {
    const id = n.getAttribute("data-ex-id") || '';
    const lab = labels.get(id) || '?';
    const newText = `(exhibit "${lab}")`;
    if (n.textContent !== newText) {
      n.textContent = newText;
      changed = true;
    }
  });

  if (changed) p.html = div.innerHTML;
  return changed;
}
function relabelAllChips() {
  const list = loadParas().sort(byNo).map(ensureRuns);
  const labels = computeLabels(list);
  let changed = false;
  for (const p of list) changed = relabelParagraphHTML(p, labels) || changed;
  if (changed) saveParas(list);
}

/* ---------- live editor chip relabel (global refresh) ---------- */
function refreshAllEditorChipLabels() {
  const list = loadParas().sort(byNo).map(ensureRuns);
  const labels = computeLabels(list);
  for (const [, ed] of EDITORS) {
    try {
      const div = document.createElement("div");
      div.innerHTML = ed.getHTML();
      div.querySelectorAll('.exh-chip[data-ex-id]').forEach(n => {
        const id = n.getAttribute('data-ex-id') || '';
        const lab = labels.get(id) || '?';
        const next = `(exhibit "${lab}")`;
        if (n.textContent !== next) n.textContent = next;
      });
      ed.commands.setContent(div.innerHTML, false);
    } catch {}
  }
}

/* ---------- Heading & intro ---------- */
function partyName(p){ if(!p)return""; const co=(p.company||"").trim(); const person=[p.first||"",p.last||""].map(s=>s.trim()).filter(Boolean).join(" ").trim(); return co||person||""; }
const listNames=(arr)=> (Array.isArray(arr)?arr:[]).map(partyName).filter(Boolean);
function etAl(names,limit=3){ return names.length<=limit?names.join(", "):names.slice(0,limit).join(", ")+", et al."; }
function joinAnd(arr){
  if (!Array.isArray(arr) || arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function lawyerCaption(caseData, deponent){
  const side = (deponent.lawyerSide || "").toLowerCase();
  if (side !== "plaintiff" && side !== "defendant") return "the lawyer for a party";

  const roleSingular = side === "plaintiff" ? "Plaintiff" : "Defendant";
  const rolePlural   = side === "plaintiff" ? "Plaintiffs" : "Defendants";

  if (deponent.lawyerAllParties) {
    return `the lawyer for the ${rolePlural}`;
  }

  const list = side === "plaintiff" ? (caseData.plaintiffs || []) : (caseData.defendants || []);
  const names = (deponent.lawyerPartyIndexes || [])
    .map(i => list[i])
    .map(partyName)
    .filter(Boolean);

  if (names.length === 1) return `the lawyer for the ${roleSingular} ${names[0]}`;
  if (names.length > 1)   return `the lawyer for the ${rolePlural} ${joinAnd(names)}`;
  return "the lawyer for a party";
}
function roleLabel(side,count,isMotion,movingSide){
  const isPl=side==="plaintiff"; const base=isPl?(count>1?"Plaintiffs":"Plaintiff"):(count>1?"Defendants":"Defendant");
  if(!isMotion) return base;
  const moving = movingSide === (isPl? "plaintiff":"defendant");
  const suf = moving ? (count>1?"/Moving Parties":"/Moving Party") : (count>1?"/Responding Parties":"/Responding Party");
  return base + suf;
}
const fmtFile=(cf={})=>{const parts=[cf.year,cf.assign,cf.suffix].map(v=>(v||"").toString().trim()).filter(Boolean); return parts.length?("CV-"+parts.join("-")):"";};
function buildHeading(c={}) {
  const file=fmtFile(c.courtFile||{}); const plRaw=listNames(c.plaintiffs||[]); const dfRaw=listNames(c.defendants||[]);
  const isMotion=!!(c.motion&&c.motion.isMotion); const movingSide=c.motion?c.motion.movingSide:null;
  return {
    l1: file?`Court File No. ${file}`:"Court File No.",
    l2: (c.courtName||"ONTARIO SUPERIOR COURT OF JUSTICE").trim(),
    l3: "BETWEEN:", l4: plRaw.length?etAl(plRaw,3):"[Add plaintiffs in the General Heading form]",
    l5: roleLabel("plaintiff", plRaw.length||1, isMotion, movingSide),
    l6: "-AND-",
    l7: dfRaw.length?etAl(dfRaw,3):"[Add defendants in the General Heading form]",
    l8: roleLabel("defendant", dfRaw.length||1, isMotion, movingSide),
  };
}
function renderHeading(){
  const gh=buildHeading(loadCase()); const c=$("#heading"); if(!c) return;
  c.innerHTML=`
    <div class="gh">
      <div class="gh-line gh-file-no">${gh.l1}</div>
      <div class="gh-line gh-court">${gh.l2}</div>
      <div class="gh-line gh-between">${gh.l3}</div>
      <div class="gh-line gh-parties gh-plaintiffs">${gh.l4}</div>
      <div class="gh-line gh-role gh-pl-role">${gh.l5}</div>
      <div class="gh-line gh-and">${gh.l6}</div>
      <div class="gh-line gh-parties gh-defendants">${gh.l7}</div>
      <div class="gh-line gh-role gh-def-role">${gh.l8}</div>
    </div>`;
}
function renderIntro(){
  const c = loadCase();
  const d = c.deponent || {};
  const oath = (loadOath() || "").toLowerCase();

  const nameOf = (p)=>[p?.first,p?.last].filter(Boolean).join(" ").trim();
  const role = (d.role || "").toLowerCase();

  let full = nameOf(d)
    || (role==="plaintiff"  && c.plaintiffs?.[0] ? nameOf(c.plaintiffs[0])
    :  (role==="defendant" && c.defendants?.[0] ? nameOf(c.defendants[0]) : ""));

  const city = d.city ? `of the City of ${d.city}` : "";
  const prov = d.prov ? `in the Province of ${d.prov}` : "";

  let cap = "";
  switch (role) {
    case "plaintiff":
    case "defendant":
      cap = `the ${role}`;
      break;
    case "lawyer":
      cap = lawyerCaption(c, d);
      break;
    case "officer":
    case "employee":
      cap = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${role} of a party`;
      break;
    default:
      cap = d.role ? `the ${d.role}` : "";
  }

  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const parts = [full ? `I, ${full}` : "I,", city, prov, cap || null].filter(Boolean);

  const intro = document.getElementById("intro");
  if (!intro) return;
  intro.innerHTML = `<h2>Affidavit of ${full || ""}</h2><p class="mt-12">${parts.join(", ")}, ${oathText}</p>`;
}

/* ---------- Jurat (blank display; matches Form 4D options) ---------- */
function juratHTMLBlank() {
  return `
    <h2>Jurat</h2>
    <div class="jurat">

      <p><strong>Sworn or Affirmed before me:</strong>
        <span class="note-italic">(select one)</span>:
        ☐ in person &nbsp; OR &nbsp; ☐ by video conference
      </p>

      <!-- IN PERSON -->
      <p class="section-title">Complete if affidavit is being sworn or affirmed in person:</p>
      <p class="inline-fill">
        <span>at the (City, Town, etc.) of</span><span class="fill md"></span>
        <span>in the (County, Regional Municipality, etc.) of</span><span class="fill md"></span>,
        <span>on (date)</span><span class="fill sm"></span>.
      </p>

      <div class="sig-grid">
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Commissioner (or as may be)</div>
        </div>
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Deponent</div>
        </div>
      </div>

      <!-- VIDEO HEADER -->
      <p class="section-title mt-12">
        Use one of the following if affidavit is being sworn or affirmed by video conference:
      </p>

      <!-- VIDEO — SAME CITY -->
      <p class="section-title mt-12">Complete if deponent and commissioner are in same city or town:</p>
      <p class="inline-fill">
        <span>by</span><span class="fill sm"></span><span class="note-italic">(deponent’s name)</span>
        <span>at the (City, Town, etc.) of</span><span class="fill md"></span>
        <span>in the (County, Regional Municipality, etc.) of</span><span class="fill md"></span>,
        <span>before me on</span><span class="fill sm"></span><span class="note-italic">(date)</span>
        <span>in accordance with O. Reg. 431/20, Administering Oath or Declaration Remotely.</span>
      </p>

      <!-- Commissioner caption only (no rule above) -->
      <div class="comm-block">
        <div class="cap">Commissioner for Taking Affidavits (or as may be)</div>
      </div>

      <div class="sig-grid">
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Commissioner (or as may be)</div>
        </div>
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Deponent</div>
        </div>
      </div>

      <!-- VIDEO — DIFFERENT CITIES -->
      <p class="section-title mt-12">Complete if deponent and commissioner are not in same city or town:</p>
      <p class="inline-fill">
        <span>by</span><span class="fill sm"></span><span class="note-italic">(deponent’s name)</span>
        <span>of (City, Town, etc.) of</span><span class="fill md"></span>
        <span>in the (County, Regional Municipality, etc.) of</span><span class="fill md"></span>,
        <span>before me at the (City, Town, etc.) of</span><span class="fill md"></span>
        <span>in the (County, Regional Municipality, etc.) of</span><span class="fill md"></span>,
        <span>on</span><span class="fill sm"></span><span class="note-italic">(date)</span>
        <span>in accordance with O. Reg. 431/20, Administering Oath or Declaration Remotely.</span>
      </p>

      <!-- Commissioner caption only (no rule above) -->
      <div class="comm-block">
        <div class="cap">Commissioner for Taking Affidavits (or as may be)</div>
      </div>

      <div class="sig-grid">
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Commissioner (or as may be)</div>
        </div>
        <div class="sig">
          <div class="sig-pad"></div>
          <div class="sig-line"></div>
          <div class="cap">Signature of Deponent</div>
        </div>
      </div>

    </div>
  `;
}

function renderJurat() {
  const c = document.getElementById("jurat");
  if (!c) return;
  c.innerHTML = juratHTMLBlank();
}

/* --- TipTap ExhibitChip: inline atomic node with hard delete guard + commands --- */
const ExhibitChip = Node.create({
  name: "exhibitChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  isolating: true,

  addAttributes() {
    return { exId: { default: "" }, label: { default: "?" } };
  },

  parseHTML() {
    return [{
      tag: 'span.exh-chip[data-ex-id]',
      getAttrs: el => ({
        exId: el.getAttribute("data-ex-id") || "",
        // Accept both '(exhibit "X")' and 'exhibit "X"' just in case old content exists
        label: (el.textContent || "").replace(/^\(?\s*exhibit\s+"?(.+?)"?\s*\)?$/i, "$1") || "?"
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const { exId, label } = HTMLAttributes;
    return ["span", { class: "exh-chip", "data-ex-id": exId, contenteditable: "false" }, `(exhibit "${label}")`];
  },

  addCommands() {
    return {
      insertExhibitChip:
        attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run(),
      removeExhibitChip:
        exId => ({ editor }) => {
          const { state, view } = editor;
          const { tr } = state;
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name && node.attrs.exId === exId) {
              tr.delete(pos, pos + node.nodeSize);
            }
          });
          view.dispatch(tr.setMeta("allowChipRemoval", true));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const countChips = (doc) => { let n = 0; doc.descendants(node => { if (node.type?.name === this.name) n++; }); return n; };
    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (tr.getMeta("allowChipRemoval")) return true;
          if (!tr.docChanged) return true;
          const before = countChips(state.doc);
          const after  = countChips(tr.doc);
          return after >= before; // block deletions of chips
        },
      }),
    ];
  },
});

/* --- SmartListExit v3: Backspace/Delete exit list like Enter (ZWSP + chips aware) --- */
const SMART_KEY = new PluginKey("smartListExit");

const SmartListExit = Extension.create({
  name: "smartListExit",
  priority: 'highest',

  addKeyboardShortcuts() {
    const stripZ = (s) => (s || "").replace(/\u200B/g, "").trim();

    const paraAtSel = (state) => {
      const parent = state.selection.$from.parent;
      return parent?.type?.name === 'paragraph' ? parent : null;
    };

    const paraIsEffectivelyEmpty = (para) => {
      if (!para) return false;
      if (para.childCount === 0) return true;
      let hasReal = false;
      para.forEach(ch => {
        if (ch.isText) {
          if (stripZ(ch.text).length) hasReal = true;
        } else if (ch.type?.name === 'exhibitChip') {
          // neutral — chips don't make the item "non-empty"
        } else {
          hasReal = true;
        }
      });
      return !hasReal;
    };

    const inAnyList = (editor) => (
      editor.isActive('listItem') || editor.isActive('orderedList') || editor.isActive('bulletList')
    );

    const exitEmptyListItem = (editor) => {
      const { state } = editor;
      if (!inAnyList(editor)) return false;
      const para = paraAtSel(state);
      if (!paraIsEffectivelyEmpty(para)) return false;

      let changed = false;
      while (editor.isActive('listItem')) {
        const ok = editor.commands.liftListItem('listItem');
        if (!ok) break;
        changed = true;
      }
      let guard = 16;
      while (guard-- > 0 && (editor.isActive('orderedList') || editor.isActive('bulletList') || editor.isActive('listItem'))) {
        if (!editor.can().lift()) break;
        if (!editor.commands.lift()) break;
        changed = true;
      }

      if (changed) {
        editor.chain().focus().setParagraph().run();
        return true;
      }
      return false;
    };

    return {
      Backspace: ({ editor }) => {
        if (exitEmptyListItem(editor)) return true;
        return false;
      },
      Delete: ({ editor }) => {
        if (exitEmptyListItem(editor)) return true;
        return false;
      },
    };
  },
});

/* ---------- TipTap editors per paragraph ---------- */
const EDITORS = new Map();

function runsFromDoc(docJSON){
  const out=[];
  const pushText=(t)=>{ const s=stripZWSP(t||""); if(!s) return; const last=out[out.length-1]; if(last?.type==="text") last.text+=s; else out.push({type:"text",text:s}); };
  function walk(n){
    if(!n) return;
    if(n.type==="text"){ pushText(n.text||""); return; }
    if(n.type==="exhibitChip"){ const id=n.attrs?.exId||""; if(id) out.push({type:"exhibit", exId:id}); return; }
    (n.content||[]).forEach(walk);
  }
  walk(docJSON);
  return out.length?out:[{type:"text",text:""}];
}

function createEditor(mount, p, labels){
  const initialHTML = p.html && p.html.trim()
    ? p.html
    : (() => {
        const div=document.createElement("div"); const para=document.createElement("p");
        (p.runs||[]).forEach(r=>{
          if(r.type==="text") para.append(document.createTextNode(r.text||""));
          if(r.type==="exhibit"){
            const span=document.createElement("span");
            span.className="exh-chip"; span.setAttribute("data-ex-id", r.exId); span.setAttribute("contenteditable","false");
            span.textContent=`(exhibit "${labels.get(r.exId)||"?"}")`;
            para.append(document.createTextNode("\u200B"), span, document.createTextNode("\u200B"));
          }
        });
        if(!para.firstChild) para.append(document.createTextNode(""));
        div.append(para); return div.innerHTML;
      })();

  const editor = new Editor({
    element: mount,
    extensions: [
      SmartListExit,
      OrderedList, BulletList, ListItem, ListKeymap,
      StarterKit,
      Underline,
      ExhibitChip,
    ],
    content: initialHTML,
    editorProps: { attributes: { class: "para-editor", "aria-label":"Paragraph editor" } },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const runs = runsFromDoc(editor.getJSON());
      upsertParagraph({ id: p.id, html, runs });
      syncUndoUI();
    },
  });

  EDITORS.set(p.id, editor);
  return editor;
}

/* ---------- Helper: swap two chip DOM nodes inside an editor ---------- */
function swapChipNodesInEditor(pId, idA, idB){
  const ed = EDITORS.get(pId);
  if(!ed) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = ed.getHTML();

  const a = wrap.querySelector(`.exh-chip[data-ex-id="${idA}"]`);
  const b = wrap.querySelector(`.exh-chip[data-ex-id="${idB}"]`);
  if(!(a && b)){
    // Even if not found (e.g., chip absent), still reapply to avoid losing edits
    ed.commands.setContent(wrap.innerHTML, false);
    return;
  }

  const aParent = a.parentNode, bParent = b.parentNode;
  const aNext = a.nextSibling, bNext = b.nextSibling;

  // Insert a where b was, and b where a was
  bParent.insertBefore(a, bNext);
  aParent.insertBefore(b, aNext);

  ed.commands.setContent(wrap.innerHTML, false);
}
// ↓ Add this helper (place above moveExhibit/removeExhibit)
function persistEditorState(pId) {
  const ed = EDITORS.get(pId);
  if (!ed) return;
  const html = ed.getHTML();
  const runs = runsFromDoc(ed.getJSON());
  upsertParagraph({ id: pId, html, runs });
}

/* ---------- Add/Move/Remove exhibits (model + live editor) ---------- */
function addExhibits(pId, entries){
  histPush();
  const list=loadParas().sort(byNo);
  const i=list.findIndex(pp=>pp.id===pId); if(i===-1) return;
  const p=ensureRuns(list[i]); p.exhibits=p.exhibits||[];
  const newIds=[];
  for(const e of entries){
    const exId=crypto.randomUUID();
    p.exhibits.push({id:exId, fileId:e.fileId, name:e.name||"Exhibit"});
    newIds.push(exId);
  }
  for(const exId of newIds) p.runs.push({type:"exhibit", exId});
  saveParas(renumber(list));

  const labels=computeLabels(loadParas());
  const ed=EDITORS.get(pId);
  if(ed){ for(const exId of newIds){ ed.commands.insertExhibitChip({ exId, label: labels.get(exId)||"?" }); } }

  // Keep stored HTML + all live editors in sync
  relabelAllChips();
  refreshAllEditorChipLabels();
}

function moveExhibit(pId, exId, dir){
  histPush();
  const list=loadParas().sort(byNo);
  const i=list.findIndex(pp=>pp.id===pId); if(i===-1) return;
  const p=ensureRuns(list[i]); const ex=p.exhibits||[]; const idx=ex.findIndex(x=>x.id===exId);
  if(idx<0) { saveParas(renumber(list)); return; }
  const j=idx+dir; if(j<0||j>=ex.length){ saveParas(renumber(list)); return; }

  // capture neighbor BEFORE swap so we can swap the inline chips to match
  const neighborId = ex[j].id;

  // swap in the model (rail order)
  [ex[idx], ex[j]]=[ex[j], ex[idx]];
  saveParas(renumber(list));

  // swap inline chip DOM nodes to match the new order
  swapChipNodesInEditor(pId, exId, neighborId);

  // relabel everywhere to reflect global sequence
  const labels=computeLabels(loadParas());
  const ed=EDITORS.get(pId);
  if(ed){
    const el=document.createElement("div");
    el.innerHTML=ed.getHTML();
    el.querySelectorAll(".exh-chip").forEach(n=>{
      const id=n.getAttribute("data-ex-id");
      n.textContent=`(exhibit "${labels.get(id)||"?"}")`;
    });
    ed.commands.setContent(el.innerHTML, false);
  }
  persistEditorState(pId);
  relabelAllChips();
  refreshAllEditorChipLabels();
}

function removeExhibit(pId, exId) {
  // Note: this *unlinks* the exhibit from the paragraph only.
  // The underlying IndexedDB file record is preserved.
  histPush();
  const list = loadParas().sort(byNo);
  const i = list.findIndex(pp => pp.id === pId);
  if (i === -1) return;
  const p = ensureRuns(list[i]);
  p.exhibits = (p.exhibits || []).filter(x => x.id !== exId);
  p.runs     = (p.runs || []).filter(r => !(r.type === "exhibit" && r.exId === exId));
  saveParas(renumber(list));

  const ed = EDITORS.get(pId);
  if (ed) ed.commands.removeExhibitChip(exId);
  persistEditorState(pId);
  // Keep stored HTML + all live editors in sync
  relabelAllChips();
  refreshAllEditorChipLabels();
}

/* ---------- Affidavit linkage ---------- */
function ensureAffidavitId(){ let id=localStorage.getItem(LS.AFFIDAVIT_ID); if(!id){id=crypto.randomUUID(); localStorage.setItem(LS.AFFIDAVIT_ID,id);} return id; }
function findExhibitLocationByFileId(fileId){
  const paras=loadParas().sort(byNo);
  for(const p of paras){ const hit=(p.exhibits||[]).find(ex=>ex.fileId===fileId); if(hit) return {paragraphId:p.id, paragraphNo:p.number, exhibitId:hit.id}; }
  return null;
}

/* ---------- Intake modal ---------- */
let docMetaModal, docMetaForm, docMetaErr, docMetaSave, docMetaGuidance;
let _queue=[], _current=null, _lastFocus=null;

function lockBg(){ document.body.dataset._scrollY=String(window.scrollY||0); document.body.style.top=`-${document.body.dataset._scrollY}px`; document.body.style.position="fixed"; document.body.style.width="100%"; }
function unlockBg(){ const y=Number(document.body.dataset._scrollY||0); document.body.style.position=""; document.body.style.top=""; document.body.style.width=""; window.scrollTo(0,y); }
function renderGuidance(){ const g=loadDocGuidance(); docMetaGuidance.innerHTML=""; docMetaGuidance.append(elx("h4",{innerText:"Why this matters"}), elx("p",{innerText:g.intro}), elx("p",{innerText:g.note}), elx("h4",{innerText:g.examplesTitle}), (()=>{const u=elx("ul"); (g.examples||[]).forEach(t=>u.append(elx("li",{innerText:t}))); return u;})()); }
function makeNoDate(forId){ const w=elx("div",{className:"field"}), id=forId+"-none", cb=elx("input",{type:"checkbox",id}); const lab=elx("label",{htmlFor:id,innerText:"This document has no date"}); w.append(cb,lab); return w; }
async function openDocMetaForFile(fileId){ const rec=await readDoc(fileId); openDocMeta({fileId, defaults:rec?.meta||{}}); }
function openDocMeta(payload){
  _current=payload; const schema=loadDocSchema(); renderGuidance(); docMetaForm.innerHTML=""; let dateWrap=null;
  schema.forEach(f=>{
    const wrap=elx("div",{className:"field"}); const id=`docmeta-${f.key}`;
    wrap.append(elx("label",{htmlFor:id,innerText:f.label+(f.required?" *":"")}));
    let input;
    if(f.type==="textarea") input=elx("textarea",{id, value:payload.defaults?.[f.key]??""});
    else if(f.type==="select"){ input=elx("select",{id}); (f.choices||[]).forEach(c=>input.append(elx("option",{value:c,innerText:c}))); const v=payload.defaults?.[f.key]; if(v && !f.choices?.includes(v)) input.append(elx("option",{value:v,innerText:v})); if(v) input.value=v; }
    else if(f.type==="date") input=elx("input",{id,type:"date", value:payload.defaults?.[f.key]??""});
    else input=elx("input",{id,type:"text", value:payload.defaults?.[f.key]??""});
    wrap.append(input); docMetaForm.append(wrap); if(f.type==="date") dateWrap=wrap;
  });
  if(dateWrap){
    const dateIn=dateWrap.querySelector('input[type="date"]'); const none=makeNoDate(dateIn.id); dateWrap.after(none);
    const cb=none.querySelector('input[type="checkbox"]'); const prev=!!payload.defaults?.noDocDate; cb.checked=prev;
    const sync=()=>{ if(cb.checked){ dateIn.value=""; dateIn.disabled=true; } else { dateIn.disabled=false; } };
    sync(); cb.addEventListener("change",sync);
  }
  docMetaErr.textContent=""; _lastFocus=document.activeElement; lockBg(); docMetaModal.setAttribute("aria-hidden","false");
}
function closeDocMeta(){ docMetaModal.setAttribute("aria-hidden","true"); unlockBg(); if(_lastFocus){try{_lastFocus.focus();}catch{}} _current=null; }
async function saveDocMeta(fileId, meta){
  const rec=await readDoc(fileId); if(!rec) return;
  const link=findExhibitLocationByFileId(fileId); const aff=localStorage.getItem(LS.AFFIDAVIT_ID)||null;
  rec.meta={...(rec.meta||{}),...meta};
  rec.system={...(rec.system||{}), attachedTo:"affidavit", affidavitId:aff, paragraphId:link?.paragraphId||null, paragraphNo:link?.paragraphNo??null, exhibitId:link?.exhibitId||null};
  if(rec.pageCount==null && rec.type==="application/pdf" && rec.blob){ rec.pageCount=await pdfPages(rec.blob); }
  await writeDoc(rec);
}
function validateDocMeta(){
  const schema=loadDocSchema(); const out={}; let noDate=false;
  for(const f of schema){
    const n=document.getElementById(`docmeta-${f.key}`); if(!n) continue;
    let v=(n.value||"").trim();
    if(f.type==="date"){ const cb=document.getElementById(`${n.id}-none`); noDate=!!cb?.checked; if(noDate) v=""; }
    if(f.required && !v) return {ok:false, message:`Please provide: ${f.label}.`};
    out[f.key]=v;
  }
  const dateEl=document.getElementById("docmeta-docDate");
  if(dateEl){ const cb=document.getElementById(`${dateEl.id}-none`); const has= !dateEl.disabled && (dateEl.value||"").trim(); if(!has && !cb?.checked) return {ok:false, message:'Please enter a document date or check “This document has no date”.'}; }
  out.noDocDate=noDate; return {ok:true, data:out};
}
async function onMetaSave(){
  if(!_current) return; const v=validateDocMeta(); if(!v.ok){ docMetaErr.textContent=v.message||"Please complete required fields."; return; }
  await saveDocMeta(_current.fileId, v.data); closeDocMeta(); if(_queue.length){ openDocMeta(_queue.shift()); }
}

/* ---------- Paragraph row (TipTap-only) ---------- */
function buildToolbar(p){
  const tb=elx("div",{className:"rte-toolbar"});
  tb.dataset.pid = p.id;

  const btn = (t, a, title) => {
    const b = elx("button",{type:"button",innerText:t,title:title||t});
    b.dataset.action = a;
    return b;
  };

  tb.append(
    btn("B","bold","Bold"), btn("i","italic","Italic"), btn("U","underline","Underline"),
    elx("span",{className:"sep"}), btn("•","bullet","Toggle bulleted list"), btn("a.","ordered","Toggle a./b./c. list"),
    elx("span",{className:"sep"}), btn("→","indent","Indent"), btn("←","outdent","Outdent"),
    elx("span",{className:"sep"}), btn("Clear","clear","Clear formatting")
  );
  tb.addEventListener("click",(e)=>{
    const a=e.target?.dataset?.action;
    if(!a) return;
    const ed=EDITORS.get(p.id); if(!ed) return;
    const chain=ed.chain().focus();
    switch(a){
      case "bold": chain.toggleBold().run(); break;
      case "italic": chain.toggleItalic().run(); break;
      case "underline": chain.toggleUnderline().run(); break;
      case "bullet": chain.toggleBulletList().run(); break;
      case "ordered": chain.toggleOrderedList().run(); break;
      case "indent": chain.sinkListItem("listItem").run(); break;
      case "outdent": chain.liftListItem("listItem").run(); break;
      case "clear": chain.unsetAllMarks().clearNodes().run(); break;
    }
  });
  return tb;
}

function renderRow(p,total,labels){
  const row=elx("div",{className:"row"});

  // Left
  const left=elx("div",{className:"row-num"});
  const numWrap=elx("div",{className:"para-num-row"});
  numWrap.append(
    elx("label",{className:"no-inline",innerHTML:` Paragraph No. <span class="pill"># ${p.number}</span>`})
  );
  const move=elx("div",{className:"move-controls"});
  move.append(elx("label",{htmlFor:`move-${p.id}`,innerText:"Move to Paragraph No.:"}));
  const nc=elx("div",{className:"num-controls"});
  const num=elx("input",{type:"number",id:`move-${p.id}`,className:"num",min:1,max:total,step:1,value:p.number});
  const apply=elx("button",{type:"button",className:"applyReorder",innerText:"Apply"});
  nc.append(num,apply); move.append(nc);
  const del=elx("button",{type:"button",className:"del",innerText:"Remove paragraph"});
  const ins=elx("button",{type:"button",className:"insBelow",innerText:"Insert new paragraph below"});
  numWrap.append(move,del,ins); left.append(numWrap);

  // Middle (TipTap mount)
  const mid=elx("div",{className:"row-text"});
  mid.append(elx("label",{innerText:"Paragraph text"}));
  const toolbar=buildToolbar(p); const mount=elx("div");
  mid.append(toolbar, mount);

  createEditor(mount,p,labels);

  // Exhibit rail
  const strip=elx("div",{className:"exhibit-strip"});
  const addBtn=elx("button",{type:"button",className:"addExhibitsBtn",innerText:"+ Add exhibit(s)"});
  const file=elx("input",{type:"file",className:"fileMulti",accept:"application/pdf,image/*",multiple:true});
  file.hidden=true; strip.append(addBtn,file); mid.append(strip);

  function renderRail(){
    [...strip.querySelectorAll(".rail-chip")].forEach(n=>n.remove());
    (p.exhibits||[]).forEach((ex,idx)=>{
      const chip=elx("div",{className:"exhibit-chip rail-chip"});
      chip.dataset.exId = ex.id;

      const label = labels.get(ex.id) || "";
      // NOTE: Rail label unchanged (no parentheses), per request.
      const L = elx("span",{className:"pill exhibit-label", innerText: `exhibit "${label}"`, title:"Edit exhibit details"});
      const N = elx("span",{className:"exhibit-name", innerText: `• ${ex.name||"Exhibit"}`, title:"Edit exhibit details"});
      const open=()=>openDocMetaForFile(ex.fileId);
      L.classList.add("clickable"); N.classList.add("clickable");
      L.tabIndex=0; N.tabIndex=0;
      L.onclick=open; N.onclick=open;
      L.onkeydown=ev=>{if(ev.key==="Enter"||ev.key===" ")open();};
      N.onkeydown=L.onkeydown;

      const actions=elx("div",{className:"exhibit-actions"});
      const leftBtn=elx("button",{type:"button",className:"ex-left",innerText:"←",title:"Move exhibit left"});
      const rightBtn=elx("button",{type:"button",className:"ex-right",innerText:"→",title:"Move exhibit right"});
      const editBtn=elx("button",{type:"button",className:"ex-edit",innerText:"Edit",title:"Edit description/date/type"});
      const removeBtn=elx("button",{type:"button",className:"ex-remove",innerText:"Remove",title:"Remove exhibit from this paragraph"}); // NEW

      if(idx===0) leftBtn.disabled=true; if(idx===(p.exhibits.length-1)) rightBtn.disabled=true;
      leftBtn.onclick=()=>{moveExhibit(p.id,ex.id,-1); renderParagraphs();};
      rightBtn.onclick=()=>{moveExhibit(p.id,ex.id,+1); renderParagraphs();};
      editBtn.onclick=open;

      // Removal does NOT delete the file record; only unlinks from this paragraph and removes the chip.
      removeBtn.onclick=()=>{
        const ok = confirm("Remove this exhibit from this paragraph? The underlying file will remain available.");
        if(!ok) return;
        removeExhibit(p.id, ex.id);
        renderParagraphs(); // rebuild UI & relabel chips globally
      };

      actions.append(leftBtn,rightBtn,editBtn,removeBtn);
      chip.append(L,N,actions); strip.insertBefore(chip,addBtn);
    });
  }
  renderRail();

  // Handlers
  const want=()=>{let n=Math.round(Number(num.value)); if(!Number.isFinite(n)||n<1) n=1; if(n>total) n=total; return n; };
  const sync=()=>{ apply.disabled=(want()===p.number); };
  sync(); num.addEventListener("input",sync);
  apply.onclick=()=>{ const n=want(); if(n!==p.number){ moveToPos(p.id,n); renderParagraphs(); } };
  del.onclick=()=>{ if(confirm("Remove this paragraph?")){ removeParagraph(p.id); renderParagraphs(); } };
  ins.onclick=()=>{ histPush(); const list=loadParas().sort(byNo); const q=newPara(); const idx=p.number; list.splice(idx,0,q); saveParas(renumber(list)); renderParagraphs(); };

  // Add exhibits
  addBtn.onclick=()=>file.click();
  file.onchange=async ()=>{
    const files=Array.from(file.files||[]); if(!files.length) return;
    const bad=files.find(f=>!(f.type==="application/pdf"||f.type.startsWith("image/")));
    if(bad){ alert("Please attach PDF files or images only."); file.value=""; return; }
    try{
      const entries=[];
      for(const f of files){
        const fileId=await saveFileBlob(f);
        entries.push({fileId,name:f.name});
        _queue.push({fileId, defaults:{ shortDesc:f.name.replace(/\.(pdf|png|jpe?g|gif|webp|tiff?)$/i,""), docDate:(f.name.match(/\b(20\d{2}|19\d{2})[-_\.]?(0[1-9]|1[0-2])[-_\.]?(0[1-9]|[12]\d|3[01])\b/)||[])[0]?.replace(/[_.]/g,"-")||"" }});
      }
      addExhibits(p.id, entries);
      renderParagraphs();
      if(docMetaModal?.getAttribute("aria-hidden")!=="false" && _queue.length) openDocMeta(_queue.shift());
    }catch(e){ console.error("Exhibit save failed:",e); alert("Could not save one of the selected files. Please try again."); }
    file.value="";
  };

  // Right spacer
  const right=elx("div",{className:"row-file"});
  row.append(left, mid, right);
  return row;
}

/* ---------- List rendering ---------- */
function renderParagraphs(){
  const container=$("#paraList"); if(!container) return;

  // Make sure saved HTML chip text reflects current global labels before we rebuild editors
  relabelAllChips();

  for (const [,ed] of EDITORS){ try{ed.destroy();}catch{} }
  EDITORS.clear();

  const list=loadParas().sort(byNo).map(ensureRuns);
  const labels=computeLabels(list);

  container.innerHTML="";
  list.forEach(p=> container.appendChild(renderRow(p, list.length, labels)));

  // After rebuild, ensure all open editors show the current labels
  refreshAllEditorChipLabels();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{
  ensureAffidavitId();

  const back=$("#back"); if(back) back.onclick=()=>history.back();

  const toggle=$("#schemeToggle"), textEl=$("#schemeText");
  if(toggle){
    const cur=getExhibitScheme(); toggle.checked=(cur==="numbers"); if(textEl) textEl.textContent=toggle.checked?"Numbers":"Letters";
    toggle.addEventListener("change",()=>{ 
      const s=toggle.checked?"numbers":"letters"; 
      setExhibitScheme(s); 
      if(textEl) textEl.textContent=toggle.checked?"Numbers":"Letters";
      relabelAllChips();
      refreshAllEditorChipLabels();
      renderParagraphs(); 
    });
  }

  const ub=$("#undoBtn"), rb=$("#redoBtn"); if(ub) ub.onclick=undo; if(rb) rb.onclick=redo;

  docMetaModal=$("#docMetaModal");
  docMetaForm=$("#docMetaForm");
  docMetaErr=$("#docMetaErrors");
  docMetaSave=$("#docMetaSave");
  docMetaGuidance=$("#docMetaGuidance");
  if(docMetaModal){
    docMetaModal.addEventListener("click",(e)=>{
      if(e.target===docMetaModal){
        e.preventDefault();
        docMetaErr.textContent="Please complete the fields and click Save to continue.";
      }
    });
  }
  if(docMetaSave) docMetaSave.onclick=onMetaSave;

  await migrate();
  renderHeading();
  renderIntro();

  if(loadParas().length===0) addPara();
  renderParagraphs();

  renderJurat(); // show blank jurat card

  const addEnd=$("#addParaEnd"); if(addEnd) addEnd.onclick=()=>{ addPara(); renderParagraphs(); };

  if(UNDO.length===0) UNDO.push(snap());
  syncUndoUI();
});
