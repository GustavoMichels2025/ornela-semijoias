(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OrnelaCycles=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const number=v=>typeof v==='number'?v:Number(String(v||'0').replace(/\./g,'').replace(',','.'))||0;
  function active(reseller){return (reseller.cycles||[]).find(c=>c.status==='open')||null;}
  function ensure(reseller,id,date=new Date().toISOString(),name){
    let cycle=active(reseller);if(cycle)return cycle;
    reseller.cycles=reseller.cycles||[];
    cycle={id,name:name||'Ciclo '+String(reseller.cycles.length+1).padStart(3,'0'),status:'open',startedAt:date,
      opening:(reseller.inventory||[]).filter(i=>Number(i.qty)>0).map(i=>({productKey:i.productKey,name:i.name,code:i.code,price:i.price,qty:Number(i.qty)})),movements:[]};
    reseller.cycles.push(cycle);return cycle;
  }
  function movement(cycle,id,type,item,qty,date=new Date().toISOString()){
    if(!cycle||cycle.status!=='open')throw Error('Não existe ciclo aberto.');
    if(!Number.isInteger(Number(qty))||Number(qty)<=0)throw Error('Quantidade inválida no ciclo.');
    cycle.movements=cycle.movements||[];
    if(!cycle.movements.some(m=>m.id===id))cycle.movements.push({id,type,productKey:item.productKey,name:item.name,code:item.code,price:item.price,qty:Number(qty),date});
  }
  function report(reseller,cycle,live=false){
    if(!cycle)return null;
    if(cycle.closing&&!live){const result=clone(cycle.closing);result.lateReversals=(reseller.sales||[]).filter(s=>s.cycleId===cycle.id&&s.reversedAt&&s.reversedAt>cycle.closedAt).map(s=>({name:s.name,code:s.code,qty:s.qty,total:s.total,reversedAt:s.reversedAt}));return result;}
    const rows=new Map();
    function row(item){if(!rows.has(item.productKey))rows.set(item.productKey,{productKey:item.productKey,name:item.name||item.code||'Produto',code:item.code||'',opening:0,sent:0,sold:0,returned:0,adjustments:0,remaining:0,value:0});return rows.get(item.productKey);}
    for(const item of cycle.opening||[])row(item).opening+=Number(item.qty||0);
    for(const m of cycle.movements||[]){const r=row(m);if(m.type==='sent')r.sent+=Number(m.qty);if(m.type==='return')r.returned+=Number(m.qty);if(m.type==='adjustment')r.adjustments+=Number(m.qty);}
    for(const sale of reseller.sales||[]){if(sale.cycleId!==cycle.id||sale.reversedAt)continue;const r=row(sale);r.sold+=Number(sale.qty||0);r.value+=Number(sale.total||0);}
    const items=[...rows.values()].map(r=>{r.available=r.opening+r.sent+r.adjustments;r.remaining=r.available-r.sold-r.returned;r.conversion=r.available?Math.round(r.sold/r.available*1000)/10:0;r.value=Math.round(r.value*100)/100;return r;}).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const totals=items.reduce((sum,r)=>{for(const field of ['opening','sent','sold','returned','adjustments','remaining','available','value'])sum[field]+=r[field];return sum;},{opening:0,sent:0,sold:0,returned:0,adjustments:0,remaining:0,available:0,value:0});
    totals.value=Math.round(totals.value*100)/100;totals.conversion=totals.available?Math.round(totals.sold/totals.available*1000)/10:0;
    return {rows:items,totals,lateReversals:[]};
  }
  function close(reseller,cycle,date=new Date().toISOString()){
    if(!cycle||cycle.status!=='open')throw Error('Este ciclo já está encerrado.');
    cycle.closing=report(reseller,cycle,true);cycle.closedAt=date;cycle.status='closed';return cycle;
  }
  function recordReversal(reseller,sale,id,date=new Date().toISOString()){
    if(sale.cycleId&&active(reseller)?.id===sale.cycleId)return;
    const current=active(reseller);if(current)movement(current,id,'adjustment',{productKey:sale.productKey,name:sale.name,code:sale.code,price:sale.unitPrice},sale.qty,date);
  }
  return {active,ensure,movement,report,close,recordReversal};
});
