const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('    document.getElementById("registerResellerSale").addEventListener');
const script=html.slice(start,html.indexOf('    reportReseller.addEventListener',start));
function register(payment){
  let callback;const item={productKey:'p1',name:'Anel',code:'001',qty:3,price:'49,00'};
  const reseller={id:'r1',inventory:[item],sales:[]}, fields={saleQty:{value:'1'},saleCustomerName:{value:' Ana Maria '},salePaymentMethod:{value:payment,focus(){}},registerResellerSale:{addEventListener(_,fn){callback=fn;}}};
  const sandbox={document:{getElementById:id=>fields[id]},resellers:[reseller],saleReseller:{value:'r1'},saleProduct:{value:'p1'},OrnelaCycles:require('../reseller-cycles'),makeId:prefix=>prefix+'-teste',brMoneyToNumber:value=>Number(value.replace(',','.')),renderResellers(){},alert(){}};
  vm.runInNewContext(script,sandbox);callback();return {reseller,item,fields};
}
test('Registro administrativo preserva método escolhido e baixa estoque uma vez',()=>{
  for(const method of ['Pix','Cartão de crédito','A pagar']){
    const {reseller,item,fields}=register(method);assert.equal(item.qty,2);assert.equal(reseller.sales[0].paymentMethod,method);assert.equal(reseller.sales[0].customerName,'Ana Maria');assert.equal(reseller.sales[0].total,49);assert.equal(fields.salePaymentMethod.value,'');assert.equal(fields.saleCustomerName.value,'');
  }
});
test('Pagamento vazio ou inválido não registra venda nem altera estoque',()=>{
  for(const method of ['', 'invalido']){const {reseller,item}=register(method);assert.equal(item.qty,3);assert.equal(reseller.sales.length,0);}
});
