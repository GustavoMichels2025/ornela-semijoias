const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const { getSql } = require('./utils/db');
const { requireAdmin, sign, verify } = require('./utils/auth');
const { json } = require('./utils/response');
const { commissionSummary } = require('./utils/commission');
const cycles = require('../../reseller-cycles');

const reply = (status, body) => {
  const result = json(status, body);
  result.headers = { ...result.headers, 'Cache-Control': 'no-store' };
  return result;
};
function productPhoto(product) {
  return [product?.image, ...(Array.isArray(product?.images) ? product.images : [])]
    .find(value => typeof value === 'string' && /^(https?:\/\/|\/api\/image\?key=)/i.test(value)) || '';
}
exports.handler = async event => {
  if (!['GET', 'POST', 'PUT'].includes(event.httpMethod)) return reply(405, { error: 'Método não permitido.' });
  try {
    const sql = getSql();
    const body = JSON.parse(event.body || '{}');
    const admin = requireAdmin(event);
    if (admin) {
      const id = body.resellerId || event.queryStringParameters?.resellerId;
      if (!id) return reply(400, { error: 'Selecione uma revendedora.' });
      const rows = await sql`SELECT data FROM public.app_state WHERE id=1`;
      const reseller = rows[0]?.data?.resellers?.find(item => item.id === id);
      if (!reseller) return reply(404, { error: 'Revendedora não encontrada.' });
      const accounts = await sql`SELECT login, enabled FROM public.reseller_access WHERE reseller_id=${id}`;
      if (event.httpMethod === 'GET') return reply(200, { login: accounts[0]?.login || '', enabled: accounts[0]?.enabled || false });
      if (event.httpMethod !== 'PUT') return reply(405, { error: 'Método não permitido.' });
      const login = String(body.login || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[a-z0-9._@-]{3,80}$/.test(login)) return reply(400, { error: 'Use um login de 3 a 80 caracteres: letras, números, ponto, @, hífen ou sublinhado.' });
      if ((!accounts.length || password) && (password.length < 8 || password.length > 128)) return reply(400, { error: 'Defina uma senha de 8 a 128 caracteres.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = password ? (await scrypt(password, salt, 64)).toString('hex') : '';
      await sql`INSERT INTO public.reseller_access(reseller_id,login,password_hash,salt,enabled,version)
        VALUES(${id},${login},${hash},${salt},${body.enabled === true},1)
        ON CONFLICT(reseller_id) DO UPDATE SET login=EXCLUDED.login,
          password_hash=CASE WHEN ${Boolean(password)} THEN EXCLUDED.password_hash ELSE reseller_access.password_hash END,
          salt=CASE WHEN ${Boolean(password)} THEN EXCLUDED.salt ELSE reseller_access.salt END,
          enabled=EXCLUDED.enabled, version=reseller_access.version+1, failed_attempts=0, locked_until=NULL`;
      return reply(200, { ok: true });
    }
    if (body.action === 'login' && event.httpMethod === 'POST') {
      const login = String(body.login || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!login || password.length > 128) return reply(401, { error: 'Login ou senha inválidos.' });
      const accounts = await sql`SELECT * FROM public.reseller_access WHERE login=${login}`;
      const account = accounts[0];
      if (account?.locked_until && new Date(account.locked_until).getTime() > Date.now()) return reply(429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      const hash = await scrypt(password, account?.salt || 'ornela-unknown-account', 64);
      if (!account || !account.enabled || !crypto.timingSafeEqual(hash, Buffer.from(account.password_hash, 'hex'))) {
        if (account) await sql`UPDATE public.reseller_access SET failed_attempts=failed_attempts+1,
          locked_until=CASE WHEN failed_attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END WHERE reseller_id=${account.reseller_id}`;
        return reply(401, { error: 'Login ou senha inválidos.' });
      }
      const rows = await sql`SELECT data FROM public.app_state WHERE id=1`;
      if (!rows[0]?.data?.resellers?.some(r => r.id === account.reseller_id && r.status !== 'Inativa')) return reply(403, { error: 'Acesso desativado. Fale com a loja.' });
      await sql`UPDATE public.reseller_access SET failed_attempts=0,locked_until=NULL WHERE reseller_id=${account.reseller_id}`;
      return reply(200, { token: sign({ role: 'reseller', resellerId: account.reseller_id, version: account.version, exp: Date.now() + 8 * 60 * 60 * 1000 }) });
    }
    const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    const identity = verify(token);
    if (identity?.role !== 'reseller') return reply(401, { error: 'Entre novamente na área da revendedora.' });
    const accounts = await sql`SELECT enabled,version FROM public.reseller_access WHERE reseller_id=${identity.resellerId}`;
    if (!accounts[0]?.enabled || accounts[0].version !== identity.version) return reply(401, { error: 'Acesso alterado. Entre novamente ou fale com a loja.' });
    const rows = await sql`SELECT data FROM public.app_state WHERE id=1`;
    const state = rows[0]?.data;
    const originalState = JSON.stringify(state);
    const reseller = state?.resellers?.find(r => r.id === identity.resellerId && r.status !== 'Inativa');
    if (!reseller) return reply(403, { error: 'Acesso desativado.' });
    if (event.httpMethod === 'POST' && body.action === 'reverse-sale') {
      const sale = (reseller.sales || []).find(s => s.id === body.saleId);
      if (!sale) return reply(404, { error: 'Venda não encontrada na sua conta.' });
      if (sale.reversedAt) return reply(200, { ok: true, alreadyReversed: true });
      const item = (reseller.inventory || []).find(i => i.productKey === sale.productKey);
      const qty = Number(sale.qty);
      if (!item || !Number.isInteger(qty) || qty <= 0) return reply(409, { error: 'Não foi possível identificar o item para devolução. Solicite a conferência da loja.' });
      item.qty = Number(item.qty || 0) + qty;
      cycles.recordReversal(reseller,sale,crypto.randomUUID());
      sale.reversedAt = new Date().toISOString();
      sale.reversedBy = 'revendedora';
      const changed = await sql`UPDATE public.app_state SET data=${JSON.stringify(state)}::jsonb,updated_at=now() WHERE id=1 AND data=${originalState}::jsonb RETURNING id`;
      if (!changed.length) return reply(409, { error: 'O estoque mudou. Atualize e tente novamente.' });
      return reply(200, { ok: true });
    }
    if (event.httpMethod === 'POST' && body.action === 'sale') {
      const qty = Number(body.qty);
      const saleId = String(body.saleId || '');
      if (!Number.isInteger(qty) || qty <= 0 || !/^[a-zA-Z0-9-]{16,80}$/.test(saleId)) return reply(400, { error: 'Informe uma quantidade válida.' });
      reseller.sales = reseller.sales || [];
      if (reseller.sales.some(sale => sale.id === saleId)) return reply(200, { ok: true });
      const item = reseller.inventory?.find(i => i.productKey === body.productKey);
      if (!item || Number(item.qty) < qty) return reply(409, { error: 'Saldo insuficiente. Atualize seu estoque.' });
      const product = state.products?.find(p => p._ornelaId === item.productKey);
      const price = typeof item.price === 'number' ? item.price : Number(String(item.price || '0').replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(price) || price < 0) return reply(400, { error: 'Preço inválido. Fale com a loja.' });
      const cycle=cycles.ensure(reseller,crypto.randomUUID());
      item.qty = Number(item.qty) - qty;
      reseller.sales.unshift({ id: saleId, date: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), productKey: item.productKey,
        name: product?.name || item.name, code: product?.code || item.code || '', qty, unitPrice: item.price, total: price * qty, source: 'revendedora',cycleId:cycle.id });
      const changed = await sql`UPDATE public.app_state SET data=${JSON.stringify(state)}::jsonb,updated_at=now() WHERE id=1 AND data=${originalState}::jsonb RETURNING id`;
      if (!changed.length) return reply(409, { error: 'O estoque mudou. Atualize e tente novamente.' });
      return reply(200, { ok: true });
    }
    if (event.httpMethod !== 'GET') return reply(400, { error: 'Operação não permitida.' });
    const commission = commissionSummary(reseller.sales);
    const currentCycle=cycles.active(reseller);
    return reply(200, { name: reseller.name, commission: commission.rate, commissionSummary: commission, cycle:currentCycle?{name:currentCycle.name,startedAt:currentCycle.startedAt}:null,
      inventory: (reseller.inventory || []).map(item => {
        const product = state.products?.find(p => p._ornelaId === item.productKey);
        return { productKey: item.productKey, code: item.code, name: product?.name || item.name, image: productPhoto(product), description: product?.description || '', qty: Number(item.qty || 0), price: item.price };
      }),
      sales: (reseller.sales || []).map(s => ({ id:s.id,date:s.date,name:s.name,code:s.code,qty:s.qty,unitPrice:s.unitPrice,total:s.total,reversedAt:s.reversedAt || null,image:productPhoto(state.products?.find(p => p._ornelaId === s.productKey)) })) });
  } catch (error) {
    if (error.code === '23505') return reply(409, { error: 'Este login já está sendo usado.' });
    return reply(500, { error: 'Não foi possível concluir. Tente novamente ou fale com a loja.' });
  }
};
