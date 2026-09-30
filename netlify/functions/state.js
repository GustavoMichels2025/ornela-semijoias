const { json, methodNotAllowed } = require('./utils/response');
const { getSql } = require('./utils/db');
const { requireAdmin } = require('./utils/auth');
const seedState = require('./seed-state.json');

const emptyState = { products: [], storeConfig: null, ordersHistory: [], resellers: [], cart: [], currentOrderId: '', orderCounter: 1 };
function sanitizeState(data) {
  return { products: Array.isArray(data.products) ? data.products : [], storeConfig: data.storeConfig || null,
    ordersHistory: Array.isArray(data.ordersHistory) ? data.ordersHistory : [], resellers: Array.isArray(data.resellers) ? data.resellers : [],
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
      return json(200, { ...emptyState, ...(rows[0]?.data || {}) });
    }
    if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });
    const payload = sanitizeState(JSON.parse(event.body || '{}'));
    await sql`INSERT INTO public.app_state (id,data,updated_at) VALUES (1, ${JSON.stringify(payload)}::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    return json(200, payload);
  } catch (error) { return json(500, { error: 'Erro ao acessar o banco Neon.', detail: error.message }); }
};
