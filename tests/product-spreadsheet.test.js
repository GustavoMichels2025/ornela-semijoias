const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../product-spreadsheet');
const XLSX = require('../assets/xlsx.full.min.js');
const row = (extra={}) => importer.headers.map((_,i) => ({code:'001010',name:'Anel de coração',description:'Peça delicada',category:'Anéis',costPrice:'9,50',price:'39,00',promotionPrice:'',stock:'2',tag:'Novidade',visible:'Sim',...extra})[['code','name','description','category','costPrice','price','promotionPrice','stock','tag','visible'][i]]);
test('Aceita destaque Black Friday em importação e atualização',()=>{
  const result=importer.validate([importer.headers,row({tag:'BLACK FRIDAY',promotionPrice:'29,00'})]);
  assert.equal(result.errors.length,0);assert.equal(result.records[0].tag,'Black Friday');assert.equal(result.records[0].promotionPrice,'29,00');
});
test('Importa dados sem foto e preserva código e acentos', () => {
  const result=importer.validate([importer.headers,row()]);
  assert.equal(result.errors.length,0);assert.equal(result.records[0].code,'001010');
  assert.equal(result.records[0].name,'Anel de coração');assert.equal(result.records[0].stock,2);
  assert.equal(result.records[0].costPrice,'9,50');assert.deepEqual(result.records[0].images,[]);
});
test('Modelo Excel volta ao leitor sem criar produtos fictícios e preserva zeros', () => {
  const workbook=importer.template(XLSX);
  const empty=importer.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),'xlsx',XLSX);
  assert.equal(importer.validate(empty).records.length,0);
  XLSX.utils.sheet_add_aoa(workbook.Sheets.Produtos,[row()],{origin:'A2'});
  const rows=importer.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),'xlsx',XLSX);
  assert.equal(importer.validate(rows).records[0].code,'001010');
});
test('CSV aceita aspas, ponto e vírgula, quebras e zeros iniciais', () => {
  const csv='\uFEFF'+importer.headers.join(';')+'\r\n'+row({description:'Dourado; delicado\nPara você'}).map(v=>'"'+v.replace(/"/g,'""')+'"').join(';');
  const result=importer.validate(importer.read(new TextEncoder().encode(csv),'csv',XLSX));
  assert.equal(result.errors.length,0);assert.equal(result.records[0].code,'001010');
  assert.equal(result.records[0].description,'Dourado; delicado\nPara você');
});
test('Códigos existentes são ignorados sem alterar cadastro ou saldo', () => {
  const existing=[{code:'001010',stock:17,name:'Nome editado',images:['foto']}];const before=JSON.stringify(existing);
  const result=importer.validate([importer.headers,row()],existing);
  assert.equal(result.records.length,0);assert.equal(result.skipped.length,1);assert.equal(JSON.stringify(existing),before);
});
test('Duplicados no arquivo e campos inválidos impedem confirmação', () => {
  assert.equal(importer.validate([importer.headers,row(),row()]).errors.length,1);
  for(const override of [{price:'abc'},{stock:'-1'},{stock:'1.5'},{promotionPrice:'45'},{visible:'talvez'},{name:''},{code:'1.234E+10'}]) assert.ok(importer.validate([importer.headers,row(override)]).errors.length,JSON.stringify(override));
  assert.throws(()=>importer.validate([['Código','Nome'],['123','Nome']]),/obrigatória/);
});
test('Estoque vazio é zero e valores decimais com ponto são aceitos',()=>{
  const result=importer.validate([importer.headers,row({stock:'',price:'49.90',visible:'Não'})]);
  assert.equal(result.records[0].stock,0);assert.equal(result.records[0].price,'49,90');assert.equal(result.records[0].hidden,true);
});
test('Fórmulas e formatos não suportados são recusados',()=>{
  const workbook=importer.template(XLSX);workbook.Sheets.Produtos.B2={t:'n',f:'1+1',v:2};
  assert.throws(()=>importer.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),'xlsx',XLSX),/fórmulas/);
  assert.throws(()=>importer.read(new Uint8Array(),'xls',XLSX),/\.xlsx/);
});
test('Modelos Excel e CSV incluem todo o cadastro, sem filtrar ocultos ou saldo zero',()=>{
  const products=[{code:'00012',name:'Nome editado',description:'Peça; com "aspas"\ne detalhes',category:'Anéis',price:'89,90',costPrice:'20,00',promotionPrice:'79,90',stock:2,tag:'Promoção',hidden:false}, {code:'00013',name:'Oculto',category:'Brincos',price:'39,00',stock:0,hidden:true}];
  const before=JSON.stringify(products);
  const workbook=importer.template(XLSX,products);
  const rows=importer.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),'xlsx',XLSX);
  assert.equal(rows[1][0],'00012');assert.equal(rows[1][1],'Nome editado');assert.equal(rows[1][6],'79,90');assert.equal(rows[2][0],'00013');assert.equal(rows[2][7],'0');assert.equal(rows[2][9],'Não');
  const csvRows=importer.read(new TextEncoder().encode(importer.csv(products)),'csv',XLSX);
  assert.equal(csvRows[1][2],products[0].description);assert.equal(csvRows[2][0],'00013');
  assert.equal(importer.validate(csvRows,products).skipped.length,2);assert.equal(JSON.stringify(products),before);
});
test('Atualiza somente existentes com confirmação sem duplicar, preservando fotos e ID',()=>{
  const current={_ornelaId:'id-1',code:'001010',name:'Nome antigo',description:'Texto antigo',category:'Anéis',price:'39,00',costPrice:'9,50',stock:4,images:['foto1','foto2'],image:'foto1',shareCode:'link123'};
  const before=JSON.stringify(current);
  const result=importer.validate([importer.headers,row({name:'Nome atualizado',price:'49,00',stock:'3'})],[current],{updateExisting:true});
  assert.equal(result.errors.length,0);assert.equal(result.records.length,0);assert.equal(result.updates.length,1);
  const update=result.updates[0];assert.equal(update.product._ornelaId,'id-1');assert.equal(update.product.shareCode,'link123');assert.deepEqual(update.product.images,['foto1','foto2']);assert.equal(update.product.stock,3);assert.equal(update.product.name,'Nome atualizado');assert.equal(JSON.stringify(current),before);
  assert.ok(!('images' in update.changes));assert.ok(!('code' in update.changes));
});
test('Arquivo sem diferenças não cria atualização e colunas ausentes não apagam dados',()=>{
  const p=importer.validate([importer.headers,row()]).records[0];
  const same=importer.validate([importer.headers,row()],[p],{updateExisting:true});assert.equal(same.updates.length,0);assert.equal(same.unchanged.length,1);
  const partial=importer.validate([['Código','Nome','Categoria','Preço'],['001010','Novo nome','Anéis','59,00']],[p],{updateExisting:true});
  assert.equal(partial.updates[0].product.stock,2);assert.equal(partial.updates[0].product.description,'Peça delicada');
  assert.ok(importer.validate([importer.headers,row({stock:'-1'})],[p],{updateExisting:true}).errors.length);
});
