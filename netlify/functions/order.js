const { json, methodNotAllowed } = require('./utils/response');
const { getSql } = require('./utils/db');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();
  try {
    const order = JSON.parse(event.body || '{}').order;
    if (!order || !order.code || !Array.isArray(order.items)) return json(400,{error:'Pedido inválido.'});
    const sql = getSql();
    const rows = await sql`SELECT data FROM public.app_state WHERE id=1`;
    const state = {products:[],storeConfig:null,ordersHistory:[],resellers:[],orderCounter:1,...(rows[0]?.data||{})};
    const i = state.ordersHistory.findIndex(x => x.code === order.code);
    if (i >= 0) state.ordersHistory[i] = {...state.ordersHistory[i],...order,status:state.ordersHistory[i].status||order.status||'Aberto'};
    else state.ordersHistory.unshift({...order,status:order.status||'Aberto'});
    state.cart=[]; state.currentOrderId='';
    await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1,${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
    return json(200,{ok:true,order});
  } catch(error) { return json(500,{error:'Erro ao registrar pedido.',detail:error.message}); }
};
