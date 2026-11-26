const test=require('node:test'),assert=require('node:assert/strict');
const labels=require('../catalog-labels');
test('Geração em massa respeita quantidade, preço de venda e não altera estoque',()=>{
  const products=[{_ornelaId:'a',code:'0001',name:'Nome editado',price:'89,00',promotionPrice:'69,00',stock:4},{_ornelaId:'b',code:'0002',name:'Brinco',price:'39,00',stock:0}];
  const before=JSON.stringify(products);
  const result=labels.collect(products,new Map([['a',81],['b',2]]),p=>p.promotionPrice||p.price);
  assert.equal(result.length,83);assert.equal(result[0].price,'69,00');assert.equal(result[0].name,'Nome editado');assert.equal(result[81].code,'0002');assert.equal(JSON.stringify(products),before);
  const html=labels.documentHtml(result);assert.equal((html.match(/class="sheet"/g)||[]).length,2);assert.equal((html.match(/class="label empty"/g)||[]).length,77);assert.ok(html.includes('217mm 280mm'));assert.ok(html.includes('R$ 69,00'));
});
test('Prévia escapa texto e não executa HTML de nomes e códigos',()=>{
  const html=labels.documentHtml([{code:'<img onerror="x">',name:'<script>alert(1)</script>',price:'49,00'}]);
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));
});
test('Quantidade inválida, seleção vazia ou produto removido não geram etiquetas',()=>{
  for(const qty of [0,-1,1.2,1001,NaN])assert.throws(()=>labels.collect([{_ornelaId:'a'}],new Map([['a',qty]]),()=>''));
  assert.throws(()=>labels.collect([],new Map(),()=>''));assert.throws(()=>labels.collect([],new Map([['removido',1]]),()=>''));
  assert.throws(()=>labels.collect([{_ornelaId:'a'},{_ornelaId:'b'},{_ornelaId:'c'}],new Map([['a',1000],['b',1000],['c',1000]]),()=>''),/2.400/);
});
