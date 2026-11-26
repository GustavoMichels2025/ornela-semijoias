const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../product-spreadsheet');
const XLSX = require('../assets/xlsx.full.min.js');
const row = (extra={}) => importer.headers.map((_,i) => ({code:'001010',name:'Anel de coração',description:'Peça delicada',category:'Anéis',costPrice:'9,50',price:'39,00',promotionPrice:'',stock:'2',tag:'Novidade',visible:'Sim',...extra})[['code','name','description','category','costPrice','price','promotionPrice','stock','tag','visible'][i]]);
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
