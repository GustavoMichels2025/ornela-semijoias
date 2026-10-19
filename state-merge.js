(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OrnelaStateMerge=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
  const equal=(a,b)=>stable(a)===stable(b);
  function merge(base,local,remote){
    const conflicts=[];
    function visit(b,l,r,path){
      if(equal(l,b))return copy(r);
      if(equal(r,b)||equal(l,r))return copy(l);
      if(Array.isArray(l)&&Array.isArray(r)&&(Array.isArray(b)||b===undefined)){
        const original=b||[],name=path[path.length-1];
        if(['xmlImportHistory','deletedOrderCodes'].includes(name))return [...new Set([...r,...l])];
        const key={products:'_ornelaId',customers:'id',resellers:'id',ordersHistory:'code',inventory:'productKey',sales:'id',cycles:'id',movements:'id',opening:'productKey'}[name];
        if(key&&[original,l,r].every(list=>list.every(item=>item&&item[key])&&new Set(list.map(item=>item[key])).size===list.length)){
          const bm=new Map(original.map(item=>[item[key],item])),lm=new Map(l.map(item=>[item[key],item])),rm=new Map(r.map(item=>[item[key],item]));
          return [...new Set([...l.map(item=>item[key]),...r.map(item=>item[key]),...original.map(item=>item[key])])].map(id=>visit(bm.get(id),lm.get(id),rm.get(id),[...path,id])).filter(item=>item!==undefined);
        }
      }
      if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)&&(b===undefined||(b&&typeof b==='object'&&!Array.isArray(b)))){
        const result={};for(const key of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){const value=visit(b?.[key],l[key],r[key],[...path,key]);if(value!==undefined)result[key]=value;}return result;
      }
      conflicts.push(path.join('.'));return copy(l);
    }
    return {value:visit(base,local,remote,[]),conflicts};
  }
  return {merge,equal,copy};
});
