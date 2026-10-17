const { json, methodNotAllowed } = require('./utils/response');
const { getSql } = require('./utils/db');
const { requireAdmin } = require('./utils/auth');
const seedState = require('./seed-state.json');

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
      let rows = await sql`SELECT data,updated_at FROM public.app_state WHERE id = 1`;
      if (!rows.length) {
        const seed = sanitizeState(seedState);
        await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1, ${JSON.stringify(seed)}::jsonb, now()) ON CONFLICT (id) DO NOTHING`;
        rows = await sql`SELECT data,updated_at FROM public.app_state WHERE id = 1`;
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
    const payload = sanitizeState(incoming);
    const currentRows = await sql`SELECT data,updated_at FROM public.app_state WHERE id = 1`;
    if (!incoming.revision || String(incoming.revision) !== String(currentRows[0]?.updated_at)) {
      return json(409, { error: 'Os dados foram alterados por outra sessão ou revendedora. Atualize o painel antes de continuar para preservar as vendas e estoques recentes.' });
    }
    const currentOrders = Array.isArray(currentRows[0]?.data?.ordersHistory) ? currentRows[0].data.ordersHistory : [];
    payload.deletedOrderCodes = currentRows[0]?.data?.deletedOrderCodes || [];
    payload.ordersHistory = payload.ordersHistory.filter(order => !payload.deletedOrderCodes.includes(order.code));
    const payloadCodes = new Set(payload.ordersHistory.map(order => order.code));
    payload.ordersHistory = [
      ...payload.ordersHistory,
      ...currentOrders.filter(order => !payloadCodes.has(order.code))
    ];
    const changed = await sql`UPDATE public.app_state SET data=${JSON.stringify(payload)}::jsonb,updated_at=now() WHERE id=1 AND updated_at=${incoming.revision}::timestamptz RETURNING updated_at`;
    if (!changed.length) return json(409, { error: 'Outra operação atualizou o estoque. Atualize o painel e tente novamente.' });
    return json(200, { ...payload, revision: changed[0].updated_at });
  } catch (error) { return json(500, { error: 'Erro ao acessar o banco Neon.', detail: error.message }); }
};
