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
      let rows = await sql`SELECT data FROM public.app_state WHERE id = 1`;
      if (!rows.length) {
        const seed = sanitizeState(seedState);
        await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1, ${JSON.stringify(seed)}::jsonb, now()) ON CONFLICT (id) DO NOTHING`;
        rows = await sql`SELECT data FROM public.app_state WHERE id = 1`;
      }
      const stored = { ...emptyState, ...(rows[0]?.data || {}) };
      if (requireAdmin(event)) return json(200, stored);
      return json(200, {
        products: stored.products,
        storeConfig: stored.storeConfig,
        cart: [],
        currentOrderId: '',
        orderCounter: stored.orderCounter
      });
    }
    if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });
    const payload = sanitizeState(JSON.parse(event.body || '{}'));
    const currentRows = await sql`SELECT data FROM public.app_state WHERE id = 1`;
    const currentOrders = Array.isArray(currentRows[0]?.data?.ordersHistory) ? currentRows[0].data.ordersHistory : [];
    const payloadCodes = new Set(payload.ordersHistory.map(order => order.code));
    payload.ordersHistory = [
      ...payload.ordersHistory,
      ...currentOrders.filter(order => !payloadCodes.has(order.code))
    ];
    await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1, ${JSON.stringify(payload)}::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    return json(200, payload);
  } catch (error) { return json(500, { error: 'Erro ao acessar o banco Neon.', detail: error.message }); }
};

