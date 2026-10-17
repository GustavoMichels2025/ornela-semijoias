const test = require('node:test');
const assert = require('node:assert/strict');
const { merge, copy } = require('../state-merge');
const baseline = () => ({ products: [{ _ornelaId:'p1', name:'Anel', price:'49,00', stock:5 }],
  resellers: [{ id:'r1', name:'Revendedora', inventory:[{ productKey:'p1', name:'Anel', qty:3 }], sales:[] }], ordersHistory:[], customers:[] });
test('Edição de produto preserva venda e estoque da revendedora atualizados', () => {
  const b=baseline(),l=copy(b),r=copy(b);
  l.products[0].name='Anel novo';l.resellers[0].inventory[0].name='Anel novo';
  r.resellers[0].inventory[0].qty=2;r.resellers[0].sales.push({id:'s1',qty:1,total:49});
  const result=merge(b,l,r);assert.deepEqual(result.conflicts,[]);
  assert.equal(result.value.products[0].name,'Anel novo');assert.equal(result.value.resellers[0].inventory[0].name,'Anel novo');
  assert.equal(result.value.resellers[0].inventory[0].qty,2);assert.equal(result.value.resellers[0].sales.length,1);
});
test('Mudança simultânea no mesmo saldo é identificada sem gravar automaticamente',()=>{
  const b=baseline(),l=copy(b),r=copy(b);l.resellers[0].inventory[0].qty=4;r.resellers[0].inventory[0].qty=2;
  assert.deepEqual(merge(b,l,r).conflicts,['resellers.r1.inventory.p1.qty']);
});
test('Pedidos novos e alterações de estoque coexistem com edição de preço',()=>{
  const b=baseline(),l=copy(b),r=copy(b);l.products[0].price='59,00';r.products[0].stock=4;r.ordersHistory.push({code:'O1',items:[]});
  const result=merge(b,l,r);assert.deepEqual(result.conflicts,[]);assert.equal(result.value.products[0].stock,4);assert.equal(result.value.products[0].price,'59,00');assert.equal(result.value.ordersHistory.length,1);
});
test('Texto digitado durante envio permanece, junto da atualização remota',()=>{
  const sent=baseline(),latest=copy(sent),saved=copy(sent);latest.products[0].name='Ainda editando';saved.resellers[0].inventory[0].qty=1;
  const result=merge(sent,latest,saved);assert.deepEqual(result.conflicts,[]);assert.equal(result.value.products[0].name,'Ainda editando');assert.equal(result.value.resellers[0].inventory[0].qty,1);
});
test('Estorno remoto não é apagado por painel desatualizado',()=>{
  const b=baseline();b.resellers[0].sales=[{id:'s1',total:49}];const l=copy(b),r=copy(b);l.products[0].price='69,00';r.resellers[0].sales[0].reversedAt='2026-10-17';
  const result=merge(b,l,r);assert.deepEqual(result.conflicts,[]);assert.equal(result.value.resellers[0].sales[0].reversedAt,'2026-10-17');
});
