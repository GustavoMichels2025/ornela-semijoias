(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OrnelaPayments=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const methods=['Pix','Cartão de crédito'];
  function status(sale){if(sale.reversedAt)return 'Estornada';if(sale.paidAt||sale.paymentStatus==='paid'||methods.includes(sale.paymentMethod))return 'Pago';return sale.paymentMethod==='A pagar'?'A pagar':'Não informado';}
  function settle(sale,method,by,date=new Date().toISOString()){
    if(sale.reversedAt)throw Error('Uma venda estornada não pode ser quitada.');
    if(status(sale)==='Pago')return false;
    if(status(sale)!=='A pagar')throw Error('Esta venda não está marcada como A pagar.');
    if(!methods.includes(method))throw Error('Selecione Pix ou Cartão de crédito para a quitação.');
    sale.originalPaymentMethod=sale.originalPaymentMethod||'A pagar';sale.paymentMethod=method;sale.paymentStatus='paid';sale.paidAt=date;sale.paidBy=by;return true;
  }
  function chooseMethod(doc){return new Promise(resolve=>{
    const dialog=doc.createElement('dialog');dialog.style.cssText='margin:auto;padding:22px;border:1px solid #d9cbb6;border-radius:12px;width:380px;max-width:94vw;font:14px Montserrat,Arial,sans-serif';
    dialog.innerHTML='<h3 style="margin:0 0 12px">Marcar como pago</h3><p>Confirme apenas após receber o valor integral. Não haverá nova baixa no estoque.</p><form style="display:grid;gap:12px"><label>Forma de recebimento<select name="method" required style="display:block;width:100%;padding:10px;margin-top:6px"><option value="">Selecione</option><option value="Pix">Pix</option><option value="Cartão de crédito">Cartão de crédito</option></select></label><button type="submit" style="padding:10px">Confirmar quitação</button><button type="button" data-cancel style="padding:10px">Cancelar</button></form>';
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();finish(dialog.querySelector('select').value);};
    dialog.querySelector('[data-cancel]').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};doc.body.appendChild(dialog);dialog.showModal();
  });}
  return {status,settle,chooseMethod};
});
