const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivateAddress(address) {
  if (!address) return true;
  address = address.toLowerCase();
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7));
  if (address.startsWith('2001:db8:')) return true;

  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224;
  }

  return false;
}

async function validatePublicUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use um link iniciado por http:// ou https://.');
  if (url.username || url.password) throw new Error('Links com usuário ou senha não são permitidos.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Endereço não permitido.');

  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('O endereço informado não é público.');
  return url;
}

async function readLimited(response, maxBytes) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('O arquivo remoto é maior que o limite permitido.');

  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());

  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('O arquivo remoto é maior que o limite permitido.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function safeFetchBuffer(rawUrl, { maxBytes = 2 * 1024 * 1024, accept = '*/*', redirects = 3 } = {}) {
  let url = await validatePublicUrl(rawUrl);

  for (let attempt = 0; attempt <= redirects; attempt++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'Accept': accept,
        'User-Agent': 'Mozilla/5.0 (compatible; OrnelaCatalogo/1.0)'
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || attempt === redirects) throw new Error('O site redirecionou vezes demais.');
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) throw new Error(`O site respondeu com erro ${response.status}.`);
    return { response, buffer: await readLimited(response, maxBytes), finalUrl: url };
  }

  throw new Error('Não foi possível acessar o endereço informado.');
}

module.exports = { safeFetchBuffer };

