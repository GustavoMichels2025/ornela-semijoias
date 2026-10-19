const { json, methodNotAllowed } = require('./utils/response');
const { getSql } = require('./utils/db');
const { requireAdmin } = require('./utils/auth');
const seedState = require('./seed-state.json');
const { merge, equal } = require('../../state-merge');
const cycles = require('../../reseller-cycles');

const emptyState = { products: [], storeConfig: null, ordersHistory: [], customers: [], resellers: [], cart: [], currentOrderId: '', orderCounter: 1 };
function sanitizeState(data) {
  return { products: Array.isArray(data.products) ? data.products : [], storeConfig: data.storeConfig || null,
    ordersHistory: Array.isArray(data.ordersHistory) ? data.ordersHistory : [], customers: Array.isArray(data.customers) ? data.customers : [],
    resellers: Array.isArray(data.resellers) ? data.resellers : [],
    xmlImportHistory: Array.isArray(data.xmlImportHistory) ? data.xmlImportHistory : [], cart: [], currentOrderId: '',
    orderCounter: Number.isFinite(data.orderCounter) ? data.orderCounter : 1 };
}
exports.handler = async (event) => {
  if (!['GET','PUT'].includes(event.httpMethod)) return methodNotAllowed();
  try {
    const sql = getSql();
    if (event.httpMethod === 'GET') {
      let rows = await sql`SELECT data,updated_at::text AS updated_at FROM public.app_state WHERE id = 1`;
      if (!rows.length) {
        const seed = sanitizeState(seedState);
        await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1, ${JSON.stringify(seed)}::jsonb, now()) ON CONFLICT (id) DO NOTHING`;
        rows = await sql`SELECT data,updated_at::text AS updated_at FROM public.app_state WHERE id = 1`;
      }
      const stored = { ...emptyState, ...(rows[0]?.data || {}) };
      if (requireAdmin(event)) return json(200, { ...stored, revision: rows[0].updated_at });
      return json(200, {
        products: stored.products.map(({ costPrice, unitCost, cost, ...product }) => product),
        storeConfig: stored.storeConfig,
        cart: [],
        currentOrderId: '',
        orderCounter: stored.orderCounter
      });
    }
    if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });
    const incoming = JSON.parse(event.body || '{}');
    if (![incoming.products, incoming.customers, incoming.resellers, incoming.ordersHistory].every(Array.isArray)) {
      return json(400, { error: 'Carregue os dados completos do painel antes de salvar. Nenhum cadastro foi alterado.' });
    }
    const requested = sanitizeState(incoming);
    for (let attempt = 0; attempt < 3; attempt++) {
    const currentRows = await sql`SELECT data,updated_at::text AS updated_at FROM public.app_state WHERE id = 1`;
    const current = currentRows[0];
    let payload = requested;
    if (incoming.baseState) {
      const result = merge(sanitizeState(incoming.baseState), requested, sanitizeState(current.data));
      if (result.conflicts.length) return json(409, { error: 'O mesmo campo foi alterado em outra sessão. Suas alterações continuam neste navegador. Confira o conflito antes de atualizar.', conflicts: result.conflicts });
      payload = result.value;
    } else if (!incoming.revision || String(incoming.revision) !== String(current?.updated_at)) {
      return json(409, { error: 'Atualize a página uma vez para ativar o novo salvamento sincronizado. Suas alterações locais foram preservadas.' });
    }
    const currentOrders = Array.isArray(currentRows[0]?.data?.ordersHistory) ? currentRows[0].data.ordersHistory : [];
    payload.deletedOrderCodes = currentRows[0]?.data?.deletedOrderCodes || [];
    payload.ordersHistory = payload.ordersHistory.filter(order => !payload.deletedOrderCodes.includes(order.code));
    const payloadCodes = new Set(payload.ordersHistory.map(order => order.code));
    payload.ordersHistory = [
      ...payload.ordersHistory,
      ...currentOrders.filter(order => !payloadCodes.has(order.code))
    ];
    for(const reseller of payload.resellers){
      const open=(reseller.cycles||[]).filter(c=>c.status==='open');
      if(open.length>1)return json(409,{error:'Há dois ciclos abertos para a mesma revendedora. Atualize o painel e selecione o ciclo atual.'});
      const stored=current.data.resellers?.find(r=>r.id===reseller.id);
      for(const cycle of reseller.cycles||[]){
        const previous=stored?.cycles?.find(c=>c.id===cycle.id);
        if(cycle.status==='closed'&&previous?.status!=='closed')cycle.closing=cycles.report(reseller,cycle,true);
      }
    }
    if (equal(payload, current.data)) return json(200, { ...payload, revision: current.updated_at });
    const changed = await sql`UPDATE public.app_state SET data=${JSON.stringify(payload)}::jsonb,updated_at=now() WHERE id=1 AND data=${JSON.stringify(current.data)}::jsonb RETURNING updated_at::text AS updated_at`;
    if (!changed.length) continue;
    return json(200, { ...payload, revision: changed[0].updated_at });
    }
    return json(409, { error: 'O banco está recebendo outras atualizações. Suas alterações foram preservadas; tente salvar novamente.' });
  } catch (error) { return json(500, { error: 'Erro ao acessar o banco Neon.', detail: error.message }); }
};
