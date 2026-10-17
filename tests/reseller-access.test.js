const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(conflict = false) {
  const state = { products: [{ _ornelaId: 'p1', name: 'Anel', stock: 8 }], customers: [{ cpf: 'privado' }], resellers: [
    { id: 'r1', name: 'Primeira', status: 'Ativa', cpf: 'privado', commission: 10, inventory: [{ productKey: 'p1', code: '1010', name: 'Anel', price: '49,00', qty: 3 }], sales: [] },
    { id: 'r2', name: 'Segunda', status: 'Ativa', inventory: [{ productKey: 'p1', qty: 20 }], sales: [] }
  ] };
  let written;
  const sql = async (strings, ...args) => {
    const query = strings.join('');
    if (query.includes('SELECT enabled,version')) return [{ enabled: true, version: 1 }];
    if (query.includes('SELECT data')) return [{ data: structuredClone(state) }];
    if (query.startsWith('UPDATE public.app_state')) {
      assert.equal(args[1], JSON.stringify(state), 'Comparação usa o estado anterior à venda');
      if (conflict) return [];
      written = JSON.parse(args[0]); return [{ id: 1 }];
    }
    throw Error('Consulta inesperada: ' + query);
  };
  const context = { exports: {}, Buffer, console, require: path => {
    if (path === './utils/db') return { getSql: () => sql };
    if (path === './utils/commission') return require('../netlify/functions/utils/commission');
    if (path === './utils/auth') return { requireAdmin: () => false, verify: token => token === 'valid' ? { role: 'reseller', resellerId: 'r1', version: 1 } : null };
    if (path === './utils/response') return { json: (statusCode, data) => ({ statusCode, body: JSON.stringify(data) }) };
    return require(path);
  } };
  vm.runInNewContext(fs.readFileSync('netlify/functions/reseller.js', 'utf8'), context);
  const request = (method, body, token = 'valid') => context.exports.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) });
  return { request, get written() { return written; } };
}
test('Revendedora só recebe dados próprios, sem dados pessoais ou de outra conta', async () => {
  const s = setup(); const response = await s.request('GET', { resellerId: 'r2' });
  assert.equal(response.statusCode, 200);
  const data = JSON.parse(response.body); assert.equal(data.name, 'Primeira');
  assert(!response.body.includes('Segunda')); assert(!response.body.includes('privado'));
});
test('Venda reduz somente estoque da identidade autenticada e mantém estoque da vitrine', async () => {
  const s = setup(); const response = await s.request('POST', { action: 'sale', resellerId: 'r2', productKey: 'p1', qty: 2, saleId: '12345678-1234-1234-1234-123456789abc' });
  assert.equal(response.statusCode, 200);
  assert.equal(s.written.resellers[0].inventory[0].qty, 1);
  assert.equal(s.written.resellers[1].inventory[0].qty, 20);
  assert.equal(s.written.products[0].stock, 8);
  assert.equal(s.written.resellers[0].sales[0].total, 98);
});
test('Quantidade excedente, token inválido e conflito não gravam venda', async () => {
  const s = setup();
  assert.equal((await s.request('GET', {}, 'invalid')).statusCode, 401);
  assert.equal((await s.request('POST', { action: 'sale', productKey: 'p1', qty: 4, saleId: '12345678-1234-1234-1234-123456789abc' })).statusCode, 409);
  assert.equal(s.written, undefined);
  const concurrent = setup(true);
  assert.equal((await concurrent.request('POST', { action: 'sale', productKey: 'p1', qty: 1, saleId: '12345678-1234-1234-1234-123456789abc' })).statusCode, 409);
  assert.equal(concurrent.written, undefined);
});
test('Comissão por faixa aplica percentual ao total e respeita centavos', () => {
  const { commissionSummary } = require('../netlify/functions/utils/commission');
  for (const [total, rate, amount] of [[0,25,0],[999.99,25,250],[1000,25,250],[1000.01,30,300],[1001,30,300.3],[2000,30,600]]) {
    const result = commissionSummary([{total}]);
    assert.equal(result.rate, rate);
    assert.equal(result.amount, amount);
  }
});
