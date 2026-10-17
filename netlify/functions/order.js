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
      const orderToDelete = state.ordersHistory.find(order => order.code === body.code);
      if (!orderToDelete) return json(404, { error: 'Pedido já excluído ou não encontrado. Atualize a lista.' });
      if (orderToDelete.status === 'Finalizado') {
        if (body.finalized !== true || typeof body.returnStock !== 'boolean') {
          return json(400, { error: 'Confirme a exclusão do pedido finalizado e a opção de devolução do estoque.' });
        }
        if (body.returnStock) {
          const returns = new Map();
          for (const item of orderToDelete.items || []) {
            const matches = state.products.filter(product => item.productKey
              ? product._ornelaId === item.productKey
              : String(product.code || '').trim() === String(item.code || '').trim());
            if (matches.length !== 1 || !Number.isInteger(Number(item.qty)) || Number(item.qty) <= 0) {
              return json(409, { error: `Não foi possível identificar com segurança o produto ${item.code || item.name} para devolver o saldo. O pedido não foi excluído.` });
            }
            const product = matches[0];
            returns.set(product, (returns.get(product) || 0) + Number(item.qty));
          }
          for (const [product, qty] of returns) {
            product.stock = Number(product.stock || 0) + qty;
            product.hidden = false;
          }
        }
      }
      state.ordersHistory = state.ordersHistory.filter(order => order.code !== body.code);
      state.deletedOrderCodes = [...new Set([...(state.deletedOrderCodes || []), body.code])];
      const changed = await sql`UPDATE public.app_state SET data=${JSON.stringify(state)}::jsonb, updated_at=now() WHERE id=1 AND data=${JSON.stringify(rows[0].data)}::jsonb RETURNING id`;
      if (!changed.length) return json(409, { error: 'Os dados foram atualizados em outra operação. Atualize a lista e tente novamente.' });
      return json(200, { ok: true });
    }

    const order = body.order;
    if (!order || !order.code || !Array.isArray(order.items)) return json(400,{error:'Pedido inválido.'});
    if ((state.deletedOrderCodes || []).includes(order.code)) return json(409, {error:'Este pedido foi excluído. Crie um novo pedido.'});
    const i = state.ordersHistory.findIndex(x => x.code === order.code);
    if (i >= 0) state.ordersHistory[i] = {...state.ordersHistory[i],...order,status:state.ordersHistory[i].status||order.status||'Aberto'};
    else state.ordersHistory.unshift({...order,status:order.status||'Aberto'});
    state.cart=[]; state.currentOrderId='';
    await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1,${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
    return json(200,{ok:true,order});
  } catch(error) { return json(500,{error:'Erro ao registrar pedido.',detail:error.message}); }
};
