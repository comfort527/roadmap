(function(root){
  function dates(start,end){const list=[];let d=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');if(!Number.isFinite(+d)||!Number.isFinite(+last)||last<d)return list;for(;d<=last&&list.length<366;d.setUTCDate(d.getUTCDate()+1))list.push(d.toISOString().slice(0,10));return list}
  function key(e){return Number.isFinite(e.lat)&&Number.isFinite(e.lon)?`${e.lat.toFixed(3)},${e.lon.toFixed(3)}`:String(e.city||e.label).trim()}
  function model(project,team=''){
    const entries=[];for(const [t,items] of Object.entries(project?.teams||{}))if(!team||t===team)for(const e of items)entries.push({...e,team:t});
    if(!team)for(const e of project?.referenceLocations||[])entries.push({...e,team:'參考'});
    const cities=new Map(),days=new Set();for(const e of entries){const id=key(e);if(!cities.has(id))cities.set(id,{...e,key:id,assignments:new Map()});const city=cities.get(id);for(const d of dates(e.start,e.end)){days.add(d);if(!city.assignments.has(d))city.assignments.set(d,[]);if(!city.assignments.get(d).includes(e.team))city.assignments.get(d).push(e.team)}}
    const arr=[...days].sort();return{cities:[...cities.values()],dates:arr.length?dates(arr[0],arr[arr.length-1]):[]};
  }
  function shift(d,n){const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
  function ranges(start,end,today){const cut=shift(today,-7),far=shift(today,15),out=[];if(start<=cut)out.push({kind:'history',start,end:end<cut?end:cut});const begin=start>shift(cut,1)?start:shift(cut,1),finish=end<far?end:far;if(begin<=finish)out.push({kind:'forecast',start:begin,end:finish});return out}
  const api={dates,key,model,shift,ranges};if(typeof module!=='undefined')module.exports=api;else root.MatrixCore=api;
})(typeof window!=='undefined'?window:globalThis);