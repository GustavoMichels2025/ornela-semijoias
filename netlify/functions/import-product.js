const { json, methodNotAllowed } = require('./utils/response');
const { requireAdmin } = require('./utils/auth');
const { safeFetchBuffer } = require('./utils/safe-fetch');

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ').trim();
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function metadata(html) {
  const values = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content) (values[key] ||= []).push(attrs.content);
  }
  return values;
}

function findProduct(value) {
  if (!value || typeof value !== 'object') return null;
  const type = value['@type'];
  if ((Array.isArray(type) ? type : [type]).some(item => String(item).toLowerCase() === 'product')) return value;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findProduct(item); if (found) return found; }
  } else {
    for (const item of Object.values(value)) { const found = findProduct(item); if (found) return found; }
  }
  return null;
}

function jsonLdProduct(html) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findProduct(JSON.parse(match[1].trim()));
      if (found) return found;
    } catch {}
  }
  return {};
}

function first(...values) {
  return values.flat(Infinity).find(value => value !== undefined && value !== null && String(value).trim()) || '';
}

function imageValues(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map(item => typeof item === 'string' ? item : item?.url || item?.contentUrl).filter(Boolean);
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();
  if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });

  try {
    const { url } = JSON.parse(event.body || '{}');
    const fetched = await safeFetchBuffer(url, { maxBytes: 2 * 1024 * 1024, accept: 'text/html,application/xhtml+xml' });
    const contentType = fetched.response.headers.get('content-type') || '';
    if (!contentType.includes('html')) return json(400, { error: 'O link não aponta para uma página de produto.' });

    const html = fetched.buffer.toString('utf8');
    const meta = metadata(html);
    const product = jsonLdProduct(html);
    const offers = Array.isArray(product.offers) ? product.offers[0] || {} : product.offers || {};
    const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const resolveImage = image => {
      try { return new URL(image, fetched.finalUrl).toString(); } catch { return ''; }
    };

    const images = [...new Set([
      ...imageValues(product.image),
      ...(meta['og:image'] || []),
      ...(meta['twitter:image'] || []),
      ...(meta['twitter:image:src'] || [])
    ].map(resolveImage).filter(Boolean))].slice(0, 3);

    return json(200, {
      sourceUrl: fetched.finalUrl.toString(),
      name: decodeHtml(first(product.name, meta['og:title'], meta['twitter:title'], title)),
      code: decodeHtml(first(product.sku, product.mpn, product.productID, meta['product:retailer_item_id'])),
      description: decodeHtml(first(product.description, meta['og:description'], meta.description)),
      category: decodeHtml(first(product.category, meta['product:category'])),
      price: String(first(offers.price, offers.lowPrice, meta['product:price:amount'], meta['og:price:amount'])),
      currency: String(first(offers.priceCurrency, meta['product:price:currency'])),
      images
    });
  } catch (error) {
    return json(400, { error: 'Não foi possível importar esse produto.', detail: error.message });
  }
};

