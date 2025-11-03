// affidavit-export.js — Inline N.+head, one-line list items, greedy merge of marker-only items, no dup chips
import { LS, loadJSON } from "./constants.js";

const $_ = (sel, el = document) => el.querySelector(sel);

/* ---------- Loaders ---------- */
const exLoadCase   = () => loadJSON(LS.CASE, {});
const exLoadOath   = () => loadJSON(LS.OATH, null);
const exLoadParas  = () => loadJSON(LS.PARAS, []);
const exLoadScheme = () =>
  localStorage.getItem(LS.EXHIBIT_SCHEME) ||
  localStorage.getItem("jf_exhibitScheme") ||
  "letters";

/* ---------- Utilities ---------- */
function exAlpha(n){let s="";while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;}
const byNo = (a,b)=>(a.number||0)-(b.number||0);

function computeExLabels(paras, scheme){
  const map=new Map(); let idx=1;
  paras.sort(byNo).forEach(p=>{
    (p.exhibits||[]).forEach(ex=>{
      map.set(ex.id, scheme==="numbers" ? String(idx) : exAlpha(idx));
      idx++;
    });
  });
  return map;
}

/* ---------- Heading ---------- */
function partyName(p){ if(!p) return ""; const co=(p.company||"").trim();
  const person=[p.first||"",p.last||""].map(s=>s.trim()).filter(Boolean).join(" ").trim();
  return co||person||""; }
const names=(arr)=>(Array.isArray(arr)?arr:[]).map(partyName).filter(Boolean);
const etAl=(xs,limit=3)=> xs.length<=limit?xs.join(", "):xs.slice(0,limit).join(", ")+", et al.";
function roleFor(side,count,isMotion,movingSide){
  const isPl=side==="plaintiff";
  const base=isPl?(count>1?"Plaintiffs":"Plaintiff"):(count>1?"Defendants":"Defendant");
  if(!isMotion) return base;
  const moving = movingSide === (isPl? "plaintiff" : "defendant");
  return base + (moving ? (count>1?"/Moving Parties":"/Moving Party")
                        : (count>1?"/Responding Parties":"/Responding Party"));
}
const fmtFile=(cf={})=>{const parts=[cf.year,cf.assign,cf.suffix].map(v=>(v||"").toString().trim()).filter(Boolean);return parts.length?("CV-"+parts.join("-")):"";};
function buildGH(c={}){
  const court=(c.courtName||"ONTARIO SUPERIOR COURT OF JUSTICE").trim();
  const file=fmtFile(c.courtFile||{});
  const plRaw=names(c.plaintiffs||[]), dfRaw=names(c.defendants||[]);
  const pl=plRaw.length?etAl(plRaw,3):"[Add plaintiffs in the General Heading form]";
  const df=dfRaw.length?etAl(dfRaw,3):"[Add defendants in the General Heading form]";
  const isMotion=!!(c.motion&&c.motion.isMotion); const moving=c.motion?c.motion.movingSide:null;
  return {
    l1: file?`Court File No. ${file}`:"Court File No.",
    l2: court, l3:"BETWEEN:", l4:pl, l5:roleFor("plaintiff", plRaw.length||1, isMotion, moving),
    l6:"-AND-", l7:df, l8:roleFor("defendant", dfRaw.length||1, isMotion, moving)
  };
}

/* ---------- TXT export core ---------- */
const ZWSP=/\u200B/g;
const collapse = (s)=>String(s||"").replace(ZWSP,"").replace(/[\t\r\n]+/g," ").replace(/ {2,}/g," ").trim();

function chipText(spanEl, labels){
  const id=spanEl.getAttribute("data-ex-id")||""; const lab=labels.get(id);
  return lab?`(exhibit "${lab}")`:`(exhibit "?")`;
}

function isOL(el){
  const tag=el.tagName?.toLowerCase()||"";
  if(tag==="ol") return true;
  const dt=el.getAttribute?.("data-type")||"";
  if(dt==="orderedList") return true;
  const cls=el.className||"";
  if(/\bordered[- ]?list\b/i.test(cls)) return true;
  const lt=el.getAttribute?.("data-list-type")||"";
  if(/alpha|decimal/i.test(lt)) return true;
  return false;
}
function isUL(el){
  const tag=el.tagName?.toLowerCase()||"";
  if(tag==="ul") return true;
  const dt=el.getAttribute?.("data-type")||"";
  if(dt==="bulletList") return true;
  const cls=el.className||"";
  if(/\bbullet[- ]?list\b/i.test(cls)) return true;
  return false;
}
function aIndex(idx){ let n=idx+1,s=""; while(n>0){ n--; s=String.fromCharCode(97+(n%26))+s; n=Math.floor(n/26);} return s; }

/* Collect inline text for a node, skipping nested lists (handled separately) */
function collectInlineNoLists(node, labels){
  if(node.nodeType===Node.TEXT_NODE) return collapse(node.nodeValue);
  if(node.nodeType!==Node.ELEMENT_NODE) return "";
  const el=node; const tag=el.tagName.toLowerCase();
  if(tag==="span" && el.classList.contains("exh-chip")) return chipText(el, labels);
  if(tag==="br") return " ";
  if(isOL(el)||isUL(el)) return "";
  let acc=[]; for(const ch of el.childNodes) acc.push(collectInlineNoLists(ch, labels));
  return collapse(acc.join(" "));
}

/* Serialize paragraph HTML → array of lines (chips preserved) */
function renderPara(p, labels){
  const html=(p.html||"").trim();

  // Fallback from runs[]
  if(!html){
    const runs=Array.isArray(p.runs)?p.runs:[{type:"text",text:p.text||""}, ...(p.exhibits||[]).map(ex=>({type:"exhibit",exId:ex.id}))];
    const s=collapse(runs.map(r=>{
      if(r.type==="text") return r.text||"";
      if(r.type==="exhibit"){ const lab=labels.get(r.exId); return lab?`(exhibit "${lab}")`:""; }
      return "";
    }).join(" "));
    return s?[s]:[];
  }

  const root=document.createElement("div");
  root.innerHTML=html;

  const out=[];

  const walk=(node, depth=0)=>{
    if(node.nodeType!==Node.ELEMENT_NODE) return;
    const el=node;

    if(isOL(el)||isUL(el)){
      const ordered=isOL(el);
      const start=ordered ? Math.max(parseInt(el.getAttribute?.("start")||"1",10)||1,1) : 1;
      let idx=start-1;

      for (const li of el.children){
        if (li.tagName.toLowerCase()!=="li") continue;
        const indent="  ".repeat(depth);
        const marker=ordered?`${aIndex(idx++)}. `:"• ";
        const text=collectInlineNoLists(li, labels);
        out.push(indent + marker + text);

        // nested lists
        for(const sub of li.children){
          if(isOL(sub)||isUL(sub)) walk(sub, depth+1);
        }
      }
      return;
    }

    // Non-list block: push its inline text (chips included)
    const tag=el.tagName.toLowerCase();
    if(tag==="p"||tag==="div"){
      const t=collectInlineNoLists(el, labels);
      if(t) out.push(t);
      for(const ch of el.childNodes) walk(ch, depth);
      return;
    }

    for(const ch of el.childNodes) walk(ch, depth);
  };

  walk(root);

  if(out.length===0){
    const t=collectInlineNoLists(root, labels);
    return t?[t]:[];
  }

  /* ---- Post-fixes inside this paragraph block ---- */

  // Greedy merge: if a line is only a list marker (•, a., b., aa.), keep
  // appending subsequent NON-marker lines (skipping blanks) until the next marker or end.
  const markerOnly   = /^\s*(?:•|[a-z]+\.|[a-z]{2,}\.)\s*$/i;
  const markerStart  = /^\s*(?:• |[a-z]+\. )/i;

  for (let i = 0; i < out.length; i++) {
    if (!markerOnly.test(out[i])) continue;

    // Pull in following non-marker lines
    let j = i + 1;
    // drop blanks
    while (j < out.length && out[j].trim() === "") out.splice(j, 1);

    while (j < out.length && !markerStart.test(out[j]) && out[j].trim() !== "") {
      out[i] = out[i].trimEnd() + " " + out[j].trimStart();
      out.splice(j, 1);
      // do not advance j; we just removed current j
    }
  }

  // Drop chip-only duplicate line if previous already includes it
  const chipLine=/^\(exhibit\s+"([^"]+)"\)$/i;
  for(let i=1;i<out.length;i++){
    const m=out[i].match(chipLine);
    if(m && out[i-1].includes(`(exhibit "${m[1]}")`)){
      out.splice(i,1); i--;
    }
  }

  // Deduplicate exact consecutive lines
  for(let i=1;i<out.length;i++){
    if(out[i]===out[i-1]){ out.splice(i,1); i--; }
  }

  return out;
}

function buildAffidavitText(){
  const c=exLoadCase();
  const d=c.deponent||{};
  const oath=(exLoadOath()||"").toLowerCase();
  const paras=exLoadParas().sort(byNo);

  const scheme=exLoadScheme();
  const labels=computeExLabels(paras, scheme);
  const gh=buildGH(c);

  const lines=[];
  lines.push(gh.l1, gh.l2, gh.l3, gh.l4, gh.l5, gh.l6, gh.l7, gh.l8, "");

  const nameOf=(x)=>[x?.first,x?.last].filter(Boolean).join(" ").trim();
  const role=(d.role||"").toLowerCase();
  let title=nameOf(d);
  if(!title){
    if(role==="plaintiff" && c.plaintiffs?.[0]) title=nameOf(c.plaintiffs[0]);
    if(role==="defendant" && c.defendants?.[0]) title=nameOf(c.defendants[0]);
  }
  lines.push(`Affidavit of ${title||""}`, "");

  const city=d.city?`of the City of ${d.city}`:"";
  const prov=d.prov?`in the Province of ${d.prov}`:"";
  let cap="";
  switch(role){
    case "plaintiff":
    case "defendant": cap=`the ${role}`; break;
    case "lawyer": cap="the lawyer for a party"; break;
    case "officer":
    case "employee": cap=d.roleDetail?`the ${d.roleDetail} of a party`:`an ${role} of a party`; break;
    default: cap=d.role?`the ${d.role}`:"";
  }
  const oathText=oath==="swear"?"MAKE OATH AND SAY:":"AFFIRM:";
  const opening=[title?`I, ${title}`:"I,", city, prov, cap||null].filter(Boolean).join(", ");
  lines.push(`${opening}, ${oathText}`, "");

  // Paragraphs: render N. + head inline; list items below
  paras.forEach(p=>{
    const paraLines=renderPara(p, labels);

    // split into head (non-list lines until first list line) and list block
    const listStart=/^\s*(?:• |[a-z]+\. )/i;
    const head=[]; const list=[];
    let inList=false;
    for(const ln of paraLines){
      if(!inList && listStart.test(ln)) inList = true;
      (inList ? list : head).push(ln);
    }

    if(head.length===0 && list.length===0){
      lines.push(`${p.number}.`);
      return;
    }

    // render N. + head[0] inline; subsequent head lines indented
    if(head.length){
      lines.push(`${p.number}. ${head[0]}`);
      for(let i=1;i<head.length;i++) lines.push(`   ${head[i]}`);
    }else{
      lines.push(`${p.number}.`);
    }

    // render list block, indented
    for(const ln of list) lines.push(`   ${ln}`);
  });

  return lines.join("\n");
}

/* ---------- Wire buttons ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  const btnTxt=$_("#exportTxt");
  const btnPdf=$_("#exportPdf");

  if(btnTxt){
    btnTxt.onclick=()=>{
      const txt=buildAffidavitText();
      const a=document.createElement("a");
      a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));
      a.download="Affidavit.txt";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    };
  }

  if(btnPdf){
    btnPdf.onclick=()=>{
      alert("PDF export stub — TXT export updated.");
    };
  }
});
