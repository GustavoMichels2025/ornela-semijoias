const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sync=require('../state-merge');
const initial=()=>({products:[{_ornelaId:'p1',name:'Anel',image:'',images:[],stock:5}],storeConfig:{},customers:[{id:'c1'}],resellers:[{id:'r1',inventory:[{productKey:'p1',qty:3}],sales:[]}],ordersHistory:[],xmlImportHistory:[],cart:[],currentOrderId:'',orderCounter:1,deletedOrderCodes:[]});
function setup(race=false){
 let stored=initial(),writes=0;
 const sql=async(strings,...values)=>{
  const query=strings.join('');
  if(query.startsWith('SELECT'))return [{data:structuredClone(stored),updated_at:'2026-10-17 11:48:58.070068+00'}];
  assert(query.includes('AND data='),'A comparação não deve depender da precisão do timestamp');
  if(race&&writes++===0){stored.resellers[0].inventory[0].qty=2;stored.resellers[0].sales.push({id:'s1',total:49,qty:1});return []}
  assert.deepEqual(JSON.parse(values[1]),stored);stored=JSON.parse(values[0]);return [{updated_at:'2026-10-17 11:49:00.123456+00'}];
 };
 const context={exports:{},require:path=>path==='./utils/db'?{getSql:()=>sql}:path==='./utils/auth'?{requireAdmin:()=>true}:path==='./utils/response'?{json:(statusCode,body)=>({statusCode,body}),methodNotAllowed:()=>({statusCode:405})}:path==='../../state-merge'?sync:{}};
 vm.runInNewContext(fs.readFileSync('netlify/functions/state.js','utf8'),context);
 return {save:body=>context.exports.handler({httpMethod:'PUT',body:JSON.stringify(body)}),get data(){return stored}};
}
for(const race of [false,true])test('Foto é salva e cadastros preservados '+(race?'com venda simultânea':'com timestamp de seis casas'),async()=>{
 const server=setup(race),base=initial(),edited=structuredClone(base);edited.products[0].image='/api/image?key=photo';edited.products[0].images=['/api/image?key=photo'];
 const result=await server.save({...edited,revision:'2026-10-17T11:48:58.070Z',baseState:base});
 assert.equal(result.statusCode,200);assert.equal(server.data.products[0].image,'/api/image?key=photo');assert.equal(server.data.customers.length,1);
 assert.equal(server.data.resellers[0].inventory[0].qty,race?2:3);assert.equal(server.data.resellers[0].sales.length,race?1:0);
});
