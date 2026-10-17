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
test('Sincronização mantém a ordem das linhas locais e associa edição por ID',()=>{
  const b=baseline();b.products.push({_ornelaId:'p2',name:'Colar',price:'109,00',stock:1});
  const local=copy(b),remote=copy(b);remote.products.reverse();remote.resellers[0].inventory[0].qty=2;
  const result=merge(b,local,remote);
  // Sem alterações locais na lista, a ordem remota pode ser adotada; a edição deve usar ID.
  const row={dataset:{productId:'p2'}};
  const element={closest:()=>row};
  const products=result.value.products;
  const fs=require('node:fs'),vm=require('node:vm');
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('    function productIndexFromRow('),end=html.indexOf('    function renderBulkList(',start);
  const context={products};vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const index=context.productIndexFromRow(element);assert.equal(products[index]._ornelaId,'p2');
  products[index].name='Colar editado';assert.equal(products.find(p=>p._ornelaId==='p1').name,'Anel');
  local.products[0].name='Anel editado';const edited=merge(b,local,remote);
  assert.deepEqual(edited.conflicts,[]);assert.equal(edited.value.products[0]._ornelaId,'p1');assert.equal(edited.value.products[0].name,'Anel editado');
});
