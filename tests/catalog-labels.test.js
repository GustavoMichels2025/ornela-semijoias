const test=require('node:test'),assert=require('node:assert/strict');
const labels=require('../catalog-labels');
test('Medidas editadas alteram folha, margens, grade e paginação no documento',()=>{
  const s=labels.settings({pageWidth:210,pageHeight:297,left:10,right:10,top:12,bottom:13,columns:3,rows:10,labelWidth:55,colGap:3,rowGap:2,offset:1});
  assert.equal(s.capacity,30);assert.equal(s.labelHeight,25.4);
  const html=labels.documentHtml(Array.from({length:31},()=>({name:'Teste',code:'001',price:'39,00'})),s);
  assert.equal((html.match(/class="sheet"/g)||[]).length,2);assert.ok(html.includes('grid-template-columns:repeat(3,55mm)'));assert.ok(html.includes('@page{size:210mm 297mm'));assert.ok(html.includes('padding:12mm 10mm 13mm 10mm'));
  assert.throws(()=>labels.settings({labelWidth:100}),/largura/);assert.throws(()=>labels.settings({rows:100}),/altura/);assert.throws(()=>labels.settings({columns:1.5}),/colunas/);assert.throws(()=>labels.settings({left:''}),/números/);
});
test('XML seleciona por código atual ou origem, soma linhas da nota sem alterar estoque',()=>{
  const products=[{_ornelaId:'a',code:'001',stock:3},{_ornelaId:'b',code:'002-0001',sourceCode:'002',stock:1},{_ornelaId:'c',code:'003-0001',sourceCode:'003'},{_ornelaId:'d',code:'003-0002',sourceCode:'003'}];
  const before=JSON.stringify(products), result=labels.matchXmlItems(products,[{code:'001',qty:2},{code:'001',qty:1},{code:'002',qty:4},{code:'003',qty:1},{code:'999',qty:1}]);
  assert.equal(result.selected.get('a'),3);assert.equal(result.selected.get('b'),4);assert.deepEqual(result.ambiguous,['003']);assert.deepEqual(result.missing,['999']);assert.equal(JSON.stringify(products),before);
  assert.throws(()=>labels.matchXmlItems(products,[{code:'001',qty:1.5}]),/inteira/);
});
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
