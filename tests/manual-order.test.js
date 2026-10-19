const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Pedido manual salva aberto, mantém estoque e baixa a peça correta ao finalizar',async()=>{
 const html=fs.readFileSync('index.html','utf8'),nodes={};
 const node=()=>({value:'',innerHTML:'',textContent:'',disabled:false,addEventListener(){},options:[]});
 const fields={};for(const key of ['customer','customerName','source','discount','search','product','qty','notes'])fields[key]=node();
 fields.qty.value='1';fields.discount.value='0';fields.source.value='Ligação';
 const form={elements:fields,querySelectorAll:()=>[]};
 const dialog={className:'',innerHTML:'',querySelector:key=>key==='form'?form:(nodes[key]||(nodes[key]=node())),showModal(){},close(){},remove(){},addEventListener(){}};
 let saves=0;
 const context={document:{createElement:()=>dialog,body:{appendChild(){}}},isAdminAuthenticated:()=>true,
 generateOrderCode:()=> 'TEST-MANUAL',customers:[{id:'c1',code:'00001',name:'Cliente teste',cpf:'123'}],products:[{_ornelaId:'p1',code:'1010',name:'Anel',stock:4,price:'49,00'},{_ornelaId:'p2',code:'2020',name:'Colar',stock:9,price:'99,00'}],ordersHistory:[],
 escapeHtml:v=>String(v||''),normalizeCatalogSearch:v=>String(v||'').toLowerCase(),normalizeCode:v=>String(v||'').toLowerCase(),normalizeCustomerCode:v=>v?String(v).padStart(5,'0'):'',sellingPrice:p=>p.price,
 numberToBR:n=>Number(n).toFixed(2).replace('.',','),brMoneyToNumber:v=>Number(String(v||0).replace(',','.')),
 saveAppStateNow:async()=>{saves++},renderOrdersHistory(){},orderSearch:{value:''},ordersList:{querySelectorAll:()=>[]},ordersRefreshStatus:{},confirm:()=>true,alert(){},renderCategories(){},renderProducts(){}};
 context.findProductByKey=id=>context.products.find(p=>p._ornelaId===id);
 vm.createContext(context);
 for(const [name,next] of [['recalcOrderTotal','updateOrderItemQuantity'],['findOrderItemProduct','openManualOrder'],['openManualOrder','addItemToOrder'],['finalizeOrder','askOrderDeletionQuestion']]){
  let start=html.indexOf('    function '+name+'(');if(start<0)start=html.indexOf('    async function '+name+'(');
  let end=html.indexOf('    function '+next+'(',start+1);if(end<0)end=html.indexOf('    async function '+next+'(',start+1);
  assert(start>=0&&end>start,name);vm.runInContext(html.slice(start,end),context);
 }
 context.openManualOrder();fields.customer.value='00001';fields.product.value='p1';fields.qty.value='2';fields.discount.value='10';fields.notes.value='Pedido recebido por telefone';
 nodes['[data-add]'].onclick();
 await form.onsubmit({preventDefault(){}});
 assert.equal(context.ordersHistory.length,1);const order=context.ordersHistory[0];
 assert.equal(order.status,'Aberto');assert.equal(order.customerName,'Cliente teste');assert.equal(order.source,'Ligação');assert.equal(order.total,'88,20');assert.equal(order.items[0].productKey,'p1');assert.equal(context.products[0].stock,4);
 context.products.reverse();await context.finalizeOrder(order.code);
 assert.equal(order.status,'Finalizado');assert.equal(context.findProductByKey('p1').stock,2);assert.equal(context.findProductByKey('p2').stock,9);assert.equal(saves,2);
});
