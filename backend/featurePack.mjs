// Feature pack: search/filter, CSV/JSON export, deterministic domain insights.
// No provider calls: insights are computed locally over the app's own records.
export function displayValue(v){ if(v===false) return "false"; if(v===0) return "0"; if(v===""||v==null) return "(empty)"; return String(v); }
export function filterRecords(rows,{q="",status="",risk=""}={}){
  const needle=String(q).trim().toLowerCase();
  return (rows||[]).filter(r=>{
    if(status && String(r.status||r.state||"")!==status) return false;
    if(risk && String(r.risk||"")!==risk) return false;
    if(!needle) return true;
    const hay=[r.reference,r.title,r.subject,r.status,r.state,r.owner,r.risk,r.due_date,JSON.stringify(r.payload||{})].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
function csvCell(v){ const s=v==null?"":String(v); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; }
export function recordsToCsv(rows){
  const cols=["id","reference","title","status","owner","risk","due_date","amount"];
  const lines=[cols.join(",")];
  for(const r of rows||[]) lines.push(cols.map(c=>csvCell(r[c]??r[c==="title"?"subject":c]??(c==="status"?r.state:""))).join(","));
  return lines.join("\n")+"\n";
}
export function buildInsights(feature, rows){
  const list=rows||[];
  const total=list.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const high=list.filter(r=>["High","Critical"].includes(r.risk));
  const open=list.filter(r=>!["Closed","Approved"].includes(r.status||r.state));
  const top=[...list].sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0))[0]||null;
  const owners={}; for(const r of open) owners[r.owner||"(empty)"]=(owners[r.owner||"(empty)"]||0)+1;
  const topOwner=Object.entries(owners).sort((a,b)=>b[1]-a[1])[0]||["(empty)",0];
  const title=feature?.title||"Records";
  const mk=(id,name,summary,sections)=>({id,title:name,summary,aiGenerated:false,source:"deterministic-fallback",sections});
  return { aiGenerated:false, source:"deterministic-fallback", featureId:feature?.id||null, insights:[
    mk("value-concentration",`${title} — value concentration`, top?`Largest record ${top.reference} represents ${total?Math.round((Number(top.amount)||0)/total*100):0}% of represented value.`:"No records yet.",[
      {label:"Record count",value:list.length},{label:"Total value",value:total},{label:"Largest record",value:top?top.reference:"(empty)"},{label:"Has records",value:list.length>0}]),
    mk("risk-triage",`${title} — risk triage`, `${high.length} high/critical record(s) need review; not tax advice.`,[
      {label:"High or critical count",value:high.length},{label:"Open count",value:open.length},{label:"Has high risk",value:high.length>0},{label:"First high-risk reference",value:high[0]?.reference??""}]),
    mk("action-queue",`${title} — next-action queue`, `Busiest owner ${topOwner[0]} holds ${topOwner[1]} open record(s).`,[
      {label:"Busiest owner",value:topOwner[0]},{label:"Open for busiest owner",value:topOwner[1]},{label:"Oldest due date",value:[...open].sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))[0]?.due_date??""},{label:"All closed",value:open.length===0}]),
  ]};
}
export function mountFeaturePack(app,{pool,auth,featureById}){
  app.get("/api/features/:id/records/export", auth, async(req,res)=>{
    const feature=featureById(req.params.id);
    const rows=(await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC",[feature.id])).rows;
    const filtered=filterRecords(rows,{q:req.query.q||"",status:req.query.status||"",risk:req.query.risk||""});
    if(String(req.query.format||"json").toLowerCase()==="csv"){ res.setHeader("Content-Type","text/csv"); res.setHeader("Content-Disposition",`attachment; filename="${feature.id}-records.csv"`); return res.send(recordsToCsv(filtered)); }
    res.json({items:filtered,count:filtered.length});
  });
  app.get("/api/features/:id/insights", auth, async(req,res)=>{
    const feature=featureById(req.params.id);
    const rows=(await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC",[feature.id])).rows;
    res.json(buildInsights(feature, rows));
  });
}
