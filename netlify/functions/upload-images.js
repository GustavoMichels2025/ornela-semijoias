const { HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { json, methodNotAllowed } = require('./utils/response');
const { requireAdmin } = require('./utils/auth');
const { getStorageClient } = require('./utils/storage');
const { safeFetchBuffer } = require('./utils/safe-fetch');

function safeName(value) {
  return String(value || 'imagem')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Imagem inválida. Selecione novamente o arquivo.');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function imageToBuffer(image) {
  if (image.dataUrl) return dataUrlToBuffer(image.dataUrl);
  if (!image.sourceUrl) throw new Error('Imagem inválida. Selecione novamente o arquivo.');

  const fetched = await safeFetchBuffer(image.sourceUrl, { maxBytes: 5 * 1024 * 1024, accept: 'image/*' });
  const mime = String(fetched.response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mime.startsWith('image/')) throw new Error('O endereço informado não retornou uma imagem válida.');
  return { mime, buffer: fetched.buffer };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();
  if (!requireAdmin(event)) return json(401, { error: 'Acesso administrativo necessário.' });

  try {
    const request = JSON.parse(event.body || '{}');
    const images = Array.isArray(request.images) ? request.images : [];
    const { client, config } = getStorageClient();

    if (!images.length) {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return json(200, { uploaded: [], storage: 'ready', bucket: config.bucket });
    }

    const uploaded = [];
    for (const image of images) {
      const { mime, buffer } = await imageToBuffer(image);
      if (!buffer.length) throw new Error('A imagem selecionada está vazia.');
      if (buffer.length > 5 * 1024 * 1024) throw new Error('Imagem maior que 5 MB.');

      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
      const baseName = safeName(image.code || image.name || image.productKey || 'produto');
      const key = `produtos/${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable'
      }));

      uploaded.push({
        productKey: image.productKey,
        code: image.code,
        name: image.name,
        key,
        url: `/api/image?key=${encodeURIComponent(key)}`
      });
    }

    return json(200, { uploaded });
  } catch (error) {
    return json(500, {
      error: 'Erro ao enviar imagem para o Neon Storage.',
      detail: error.message
    });
  }
};

