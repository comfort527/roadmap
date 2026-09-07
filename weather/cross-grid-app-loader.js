(function(){
  var files=['cross-grid-app-part1.txt','cross-grid-app-part2.txt','cross-grid-app-part3.txt','cross-grid-app-part4.txt'];
  Promise.all(files.map(function(name){return fetch('./'+name+'?v=20260907f',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(name+' '+r.status);return r.text()})}))
    .then(function(parts){(0,eval)(parts.join(''))})
    .catch(function(e){var s=document.getElementById('status');if(s)s.textContent='主程式載入失敗：'+(e&&e.message?e.message:String(e));console.error(e)});
})();