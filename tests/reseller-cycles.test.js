const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../reseller-cycles');
const fixture=()=>({inventory:[{productKey:'p1',code:'1010',name:'Anel',price:'49,00',qty:3}],sales:[{id:'old',productKey:'p1',qty:8,total:392}]});
test('Saldo anterior é registrado sem alterar estoque nem incluir vendas antigas',()=>{
 const r=fixture(),before=JSON.stringify(r.inventory),cycle=c.ensure(r,'c1');
 assert.equal(JSON.stringify(r.inventory),before);assert.equal(c.report(r,cycle).totals.opening,3);assert.equal(c.report(r,cycle).totals.sold,0);
 assert.equal(c.ensure(r,'outro').id,'c1');
});
test('Ciclo contabiliza envio, venda, devolução e estorno sem duplicar movimentação',()=>{
 const r=fixture(),cycle=c.ensure(r,'c1');c.movement(cycle,'m1','sent',r.inventory[0],2);c.movement(cycle,'m1','sent',r.inventory[0],2);
 r.sales.push({id:'s1',cycleId:'c1',productKey:'p1',name:'Anel',qty:2,total:98});c.movement(cycle,'m2','return',r.inventory[0],1);
 let t=c.report(r,cycle).totals;assert.equal(t.opening,3);assert.equal(t.sent,2);assert.equal(t.sold,2);assert.equal(t.returned,1);assert.equal(t.remaining,2);assert.equal(t.conversion,40);assert.equal(t.value,98);
 r.sales[1].reversedAt='2026-10-19T12:00:00Z';c.recordReversal(r,r.sales[1],'rev1');t=c.report(r,cycle).totals;assert.equal(t.remaining,4);assert.equal(t.sold,0);assert.equal(t.adjustments,0);
});
test('Encerramento preserva resultado e próximo ciclo carrega saldo sem movimento físico',()=>{
 const r=fixture(),cycle=c.ensure(r,'c1','2026-10-19T10:00:00Z');r.sales.push({id:'s1',cycleId:'c1',productKey:'p1',qty:1,total:49});r.inventory[0].qty=2;
 c.close(r,cycle,'2026-10-19T12:00:00Z');assert.equal(r.inventory[0].qty,2);assert.equal(c.report(r,cycle).totals.remaining,2);
 const next=c.ensure(r,'c2','2026-10-19T13:00:00Z');assert.equal(c.report(r,next).totals.opening,2);assert.equal(c.report(r,next).totals.sold,0);
 r.sales[1].reversedAt='2026-10-19T14:00:00Z';r.inventory[0].qty++;c.recordReversal(r,r.sales[1],'rev1','2026-10-19T14:00:00Z');
 assert.equal(c.report(r,next).totals.remaining,3);assert.equal(c.report(r,next).totals.adjustments,1);assert.equal(c.report(r,cycle).totals.sold,1);assert.equal(c.report(r,cycle).lateReversals.length,1);
});
