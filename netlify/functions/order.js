const { json, methodNotAllowed } = require('./utils/response');
const { getSql } = require('./utils/db');
const { requireAdmin } = require('./utils/auth');
exports.handler = async (event) => {
  if (!['GET', 'POST', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed();
  try {
    const sql = getSql();
    const rows = await sql`SELECT data FROM public.app_state WHERE id=1`;
    const state = {products:[],storeConfig:null,ordersHistory:[],resellers:[],orderCounter:1,...(rows[0]?.data||{})};

    if (event.httpMethod === 'GET') {
      if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });
      return json(200, { ordersHistory: state.ordersHistory });
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'DELETE') {
      if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });
      if (!body.code) return json(400, { error: 'Código do pedido não informado.' });
      state.ordersHistory = state.ordersHistory.filter(order => order.code !== body.code);
      await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1,${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
      return json(200, { ok: true });
    }

    const order = body.order;
    if (!order || !order.code || !Array.isArray(order.items)) return json(400,{error:'Pedido inválido.'});
    const i = state.ordersHistory.findIndex(x => x.code === order.code);
    if (i >= 0) state.ordersHistory[i] = {...state.ordersHistory[i],...order,status:state.ordersHistory[i].status||order.status||'Aberto'};
    else state.ordersHistory.unshift({...order,status:order.status||'Aberto'});
    state.cart=[]; state.currentOrderId='';
    await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1,${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
    return json(200,{ok:true,order});
  } catch(error) { return json(500,{error:'Erro ao registrar pedido.',detail:error.message}); }
};

