(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrnelaSpreadsheet = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const headers = ['Código', 'Nome', 'Descrição', 'Categoria', 'Custo', 'Preço', 'Preço promocional', 'Estoque', 'Destaque', 'Visível'];
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fields = ['code', 'name', 'description', 'category', 'costPrice', 'price', 'promotionPrice', 'stock', 'tag', 'visible'];
  const aliases = { codigo:'code', codigosku:'code', sku:'code', nome:'name', nomedoproduto:'name', descricao:'description', categoria:'category', custo:'costPrice', precocusto:'costPrice', precodecusto:'costPrice', preco:'price', precovenda:'price', precodevenda:'price', valor:'price', precopromocional:'promotionPrice', promocao:'promotionPrice', estoque:'stock', quantidade:'stock', destaque:'tag', visivel:'visible' };
  function money(value) {
    let text = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!text) return null;
    if (text.includes(',')) { if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return NaN; text = text.replace(/\./g, '').replace(',', '.'); }
    else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
    const number = Number(text); return Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
  }
  const formatMoney = value => Number(value).toFixed(2).replace('.', ',');
  function validate(rows, existing = []) {
    if (!rows.length) throw Error('A planilha está vazia.');
    const mapped = rows[0].map(h => aliases[normalize(h)] || null);
    for (const field of ['code','name','category','price']) if (!mapped.includes(field)) throw Error('Coluna obrigatória ausente: ' + headers[fields.indexOf(field)]);
    const repeated = mapped.filter((f, i) => f && mapped.indexOf(f) !== i);
    if (repeated.length) throw Error('Existem colunas repetidas no cabeçalho. Use o modelo do catálogo.');
    const known = new Set(existing.map(p => normalize(p.code)).filter(Boolean)), seen = new Set();
    const records = [], errors = [], skipped = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]; if (!row.some(v => String(v ?? '').trim())) continue;
      if (records.length + skipped.length + errors.length >= 5000) throw Error('Importe até 5.000 linhas por arquivo.');
      const data = {}; mapped.forEach((field, n) => { if(field) data[field] = String(row[n] ?? '').trim(); });
      const line = i + 1, fail = text => errors.push('Linha ' + line + ': ' + text);
      const code = normalize(data.code);
      if (!code || !data.name || !data.category) { fail('preencha Código, Nome e Categoria.'); continue; }
      if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(data.code)) { fail('o código está em notação científica. Formate a coluna Código como Texto.'); continue; }
      if (seen.has(code)) { fail('código repetido no arquivo: ' + data.code); continue; } seen.add(code);
      if (known.has(code)) { skipped.push({ line, code: data.code }); continue; }
      const price = money(data.price), cost = money(data.costPrice), promo = money(data.promotionPrice);
      if (price === null || !Number.isFinite(price) || price <= 0) { fail('Preço deve ser um valor maior que zero.'); continue; }
      if ((cost !== null && !Number.isFinite(cost)) || (promo !== null && (!Number.isFinite(promo) || promo <= 0 || promo >= price))) { fail('confira Custo e Preço promocional (a promoção deve ser menor que o preço normal).'); continue; }
      const stockText = data.stock || '0'; const stock = Number(stockText);
      if (!/^\d+$/.test(stockText) || !Number.isSafeInteger(stock)) { fail('Estoque deve ser um número inteiro a partir de zero.'); continue; }
      const visible = normalize(data.visible || 'sim');
      if (!['sim','nao','true','false','1','0'].includes(visible)) { fail('Visível deve ser Sim ou Não.'); continue; }
      const tags = {novidade:'Novidade',maisvendido:'Mais vendido',promocao:'Promoção'};
      const tag = normalize(data.tag); if (tag && !tags[tag]) { fail('Destaque deve ser Novidade, Mais vendido, Promoção ou vazio.'); continue; }
      records.push({code:data.code,name:data.name,description:data.description || '',category:data.category,price:formatMoney(price),costPrice:cost === null ? '' : formatMoney(cost),promotionPrice:promo === null ? '' : formatMoney(promo),stock,tag:tags[tag] || '',hidden:['nao','false','0'].includes(visible),image:'',images:[]});
    }
    return {records,errors,skipped};
  }
  function read(bytes, extension, XLSX) {
    if (!['xlsx','csv'].includes(extension)) throw Error('Escolha um arquivo .xlsx ou .csv. Arquivos .xls devem ser salvos como .xlsx.');
    if (bytes.byteLength > 10 * 1024 * 1024) throw Error('O arquivo deve ter no máximo 10 MB.');
    const options = {type:'array',cellFormula:true,sheetRows:5002};
    let input = bytes;
    if (extension === 'csv') {
      input = new TextDecoder('utf-8').decode(bytes);
      if (input.includes('\uFFFD')) input = new TextDecoder('windows-1252').decode(bytes);
      options.type = 'string'; options.raw = true;
    }
    const workbook = XLSX.read(input, options);
    const sheet = workbook.Sheets[workbook.SheetNames.find(n => normalize(n) === 'produtos') || workbook.SheetNames[0]];
    if (!sheet || !sheet['!ref']) throw Error('A aba de produtos está vazia.');
    for (const key of Object.keys(sheet)) if (!key.startsWith('!') && sheet[key].f) throw Error('A planilha contém fórmulas. Cole os resultados como valores antes de importar.');
    const rows = XLSX.utils.sheet_to_json(sheet, {header:1,defval:'',raw:false,blankrows:true});
    if (rows.length > 5001) throw Error('Importe até 5.000 linhas por arquivo.');
    return rows;
  }
  function productRows(products = []) {
    return products.map(p => [String(p.code ?? ''), String(p.name ?? ''), String(p.description ?? ''), String(p.category ?? ''), String(p.costPrice ?? ''), String(p.price ?? ''), String(p.promotionPrice ?? ''), Number(p.stock ?? 0), String(p.tag ?? ''), p.hidden ? 'Não' : 'Sim']);
  }
  function csv(products = []) {
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [headers, ...productRows(products)].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
  }
  function template(XLSX, products = []) {
    const workbook = XLSX.utils.book_new();
    const rows = productRows(products);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet['!cols'] = [22,40,65,22,15,15,22,12,20,12].map(wch => ({wch}));
    // Códigos devem permanecer texto, inclusive quando começam por zero.
    const last = Math.max(501, rows.length + 101);
    for(let row=2; row<=last; row++) sheet['A'+row] = {t:'s',v:rows[row-2]?.[0] || '',z:'@'};
    sheet['!ref'] = 'A1:J' + last; sheet['!autofilter'] = {ref:'A1:J' + Math.max(1, rows.length+1)};
    XLSX.utils.book_append_sheet(workbook, sheet, 'Produtos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['ORNELA — Instruções de importação'],
      ['Preencha apenas a aba Produtos, mantendo o cabeçalho na primeira linha.'],
      ['Este modelo inclui todos os produtos carregados no painel, inclusive ocultos e sem estoque. Adicione os novos nas linhas seguintes.'],
      ['Obrigatórios: Código, Nome, Categoria e Preço. Estoque vazio será zero.'],
      ['Código deve estar como Texto para preservar zeros iniciais. Não use fórmulas.'],
      ['Preço e Custo: 89,90 ou 89.90. Não use separador de milhares.'],
      ['Destaque: Novidade, Mais vendido, Promoção ou vazio.'],
      ['Visível: Sim ou Não. Vazio significa Sim.'],
      ['Códigos já cadastrados serão ignorados, sem alterar preços, descrições, fotos ou estoque.'],
      ['Códigos repetidos no mesmo arquivo devem ser corrigidos antes da importação.'],
      ['Limites: 5.000 produtos por arquivo e 10 MB.'],
      ['Fotos são opcionais: após importar, use Fotos para relacionar arquivos pelo código do produto.'],
      ['Para adicionar mais de 500 produtos, continue a preencher as linhas abaixo.']
    ]), 'Instruções');
    workbook.Sheets['Instruções']['!cols'] = [{wch:115}];
    return workbook;
  }
  return {headers,normalize,validate,read,template,productRows,csv};
});
