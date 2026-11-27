(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OrnelaLabels=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults={pageWidth:217,pageHeight:280,top:14,bottom:14,left:15,right:15,columns:4,rows:20,labelWidth:44,rowGap:1,colGap:3,offset:1};
  function settings(input={}) {
    const s={...defaults};
    for(const key of Object.keys(s)){
      const value=input[key]??s[key];
      if(String(value).trim()===''||!Number.isFinite(Number(value)))throw Error('Preencha todas as medidas com números válidos.');
      s[key]=Number(value);
    }
    if(s.pageWidth<50||s.pageHeight<50||s.pageWidth>1000||s.pageHeight>1000)throw Error('A folha deve medir entre 50 e 1.000 mm por lado.');
    if(!Number.isInteger(s.columns)||s.columns<1||s.columns>12||!Number.isInteger(s.rows)||s.rows<1||s.rows>100)throw Error('Informe de 1 a 12 colunas e de 1 a 100 linhas.');
    if(['top','bottom','left','right','rowGap','colGap','offset'].some(k=>s[k]<0))throw Error('Margens, espaços e deslocamento não podem ser negativos.');
    if(s.labelWidth<25||s.columns*s.labelWidth+(s.columns-1)*s.colGap+s.offset>s.pageWidth-s.left-s.right+0.001)throw Error('As etiquetas não cabem na largura da folha. Ajuste largura, colunas, margens ou espaços.');
    s.labelHeight=(s.pageHeight-s.top-s.bottom-(s.rows-1)*s.rowGap)/s.rows;
    if(s.labelHeight<8)throw Error('As etiquetas precisam ter ao menos 8 mm de altura. Reduza linhas, margens ou espaço vertical.');
    s.capacity=s.columns*s.rows;return s;
  }
  function collect(products, selected, price) {
    const labels=[];
    for(const [id, quantity] of selected) {
      const product=products.find(p=>p._ornelaId===id);
      if(!product)throw Error('Um produto selecionado não está mais no catálogo. Atualize a seleção.');
      if(!Number.isInteger(quantity)||quantity<1||quantity>1000)throw Error('Informe de 1 a 1.000 etiquetas por produto.');
      if(labels.length+quantity>2400)throw Error('Gere até 2.400 etiquetas por vez. Reduza a seleção ou as quantidades.');
      for(let i=0;i<quantity;i++)labels.push({code:product.code||'',name:product.name||'',price:price(product)});
    }
    if(!labels.length)throw Error('Selecione ao menos um produto para gerar as etiquetas.');
    return labels;
  }
  function documentHtml(labels, configuration={}) {
    const s=settings(configuration);
    let pages='';const count=Math.ceil(labels.length/s.capacity);
    for(let page=0;page<count;page++){
      let cells='';
      for(let i=0;i<s.capacity;i++){
        const label=labels[page*s.capacity+i];
        cells+=label?`<div class="label"><div class="brand" contenteditable="true">ORNELA SEMIJOIAS</div><div class="desc" contenteditable="true">${escape(label.name)}</div><div class="bottom"><div class="code" contenteditable="true">COD: ${escape(label.code)}</div><div class="price" contenteditable="true">R$ ${escape(label.price)}</div></div></div>`:'<div class="label empty"></div>';
      }
      pages+=`<section class="page"><p class="hint">Folha ${page+1} de ${count} — clique no texto para ajustar apenas esta impressão</p><div class="sheet">${cells}</div></section>`;
    }
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiquetas Ornela</title><style>
      *{box-sizing:border-box}body{margin:0;background:#ece7df;color:#111;font-family:Arial,Helvetica,sans-serif}.page{padding:12px}.hint{font-size:12px;margin:0 0 8px}.sheet{width:217mm;height:280mm;padding:14mm 15mm;background:white;display:grid;grid-template-columns:repeat(4,44mm);grid-template-rows:repeat(20,calc((280mm - 28mm - 19mm)/20));column-gap:3mm;row-gap:1mm;overflow:hidden}.label{position:relative;width:44mm;height:calc((280mm - 28mm - 19mm)/20);overflow:hidden;padding:1mm 1.1mm .9mm;font-size:7pt;line-height:1.05}.label:nth-child(4n){transform:translateX(1mm)}.brand{text-align:center;font-weight:700;font-size:7.2pt;letter-spacing:.2px}.desc{margin-top:.8mm;font-size:6.3pt}.brand,.desc,.code,.price{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bottom{position:absolute;left:1.1mm;right:1.1mm;bottom:.9mm;display:grid;grid-template-columns:minmax(0,1fr) 14mm;align-items:end;gap:1mm}.code{min-width:0;font-size:6pt}.price{width:14mm;text-align:right;font-weight:700;font-size:6.8pt}[contenteditable]:focus{outline:1px dashed #888}@page{size:217mm 280mm;margin:0}@media print{body{background:white}.page{padding:0;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.hint{display:none}.sheet{margin:0}[contenteditable]:focus{outline:none}}
      </style><style>.sheet{width:${s.pageWidth}mm;height:${s.pageHeight}mm;padding:${s.top}mm ${s.right}mm ${s.bottom}mm ${s.left}mm;grid-template-columns:repeat(${s.columns},${s.labelWidth}mm);grid-template-rows:repeat(${s.rows},${s.labelHeight}mm);column-gap:${s.colGap}mm;row-gap:${s.rowGap}mm}.label{width:${s.labelWidth}mm;height:${s.labelHeight}mm}.label:nth-child(4n){transform:none}.label:nth-child(${s.columns}n){transform:translateX(${s.offset}mm)}@page{size:${s.pageWidth}mm ${s.pageHeight}mm;margin:0}</style></head><body>${pages}</body></html>`;
  }
  function matchXmlItems(products, entries) {
    const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const selected=new Map(),missing=[],ambiguous=[];
    for(const entry of entries){
      const code=key(entry.code), qty=entry.qty;
      if(!code)throw Error('Um item da nota está sem código. Confira o XML.');
      if(!Number.isInteger(qty)||qty<1)throw Error('Quantidade inválida para etiquetas no código '+entry.code+'. Use quantidade inteira.');
      const exact=products.filter(p=>key(p.code)===code);
      const matches=exact.length?exact:products.filter(p=>key(p.sourceCode)===code);
      if(!matches.length){missing.push(entry.code);continue;}
      if(matches.length!==1){ambiguous.push(entry.code);continue;}
      const id=matches[0]._ornelaId, amount=(selected.get(id)||0)+qty;
      if(amount>1000)throw Error('O código '+entry.code+' excede 1.000 etiquetas. Divida a impressão em lotes.');
      selected.set(id,amount);
    }
    if([...selected.values()].reduce((sum,n)=>sum+n,0)>2400)throw Error('A nota excede 2.400 etiquetas. Selecione e gere os produtos em lotes menores.');
    return {selected,missing:[...new Set(missing)],ambiguous:[...new Set(ambiguous)]};
  }
  return {collect,documentHtml,matchXmlItems,defaults,settings};
});
