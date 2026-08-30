(function(){
  const select=document.getElementById('fixedShareSelect');
  const btn=document.getElementById('updateFixedShareBtn');
  if(!select||!btn)return;

  const OWNER='comfort527';
  const REPO='roadmap';
  const BRANCH='main';
  const TOKEN_KEY='weatherGithubWriteTokenV1';
  const FIXED={yh06:'永和6號',yh07:'永和7號'};

  function utf8ToBase64(text){
    const bytes=new TextEncoder().encode(text);
    let bin='';
    for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function exportProject(p,code){
    const n=normalizeProject(p),teams={};
    for(const team of activeTeams(n)){
      teams[team]=(n.teams[team]||[]).map(x=>({
        city:String(x.city||x.label||''),
        label:String(x.label||x.city||''),
        start:String(x.start||''),
        end:String(x.end||''),
        lat:Number.isFinite(Number(x.lat))?Number(x.lat):null,
        lon:Number.isFinite(Number(x.lon))?Number(x.lon):null
      }));
    }
    return {
      version:1,
      code,
      name:FIXED[code]||n.name,
      updatedAt:new Date().toISOString(),
      project:{
        name:n.name,
        teams,
        analysisReport:String(n.analysisReport||'')
      }
    };
  }

  function getToken(){
    let token='';
    try{token=sessionStorage.getItem(TOKEN_KEY)||''}catch{}
    if(token)return token;
    token=prompt('請輸入 GitHub Token（需對 comfort527/roadmap 具有 Contents 讀寫權限）。\nToken 只保留在目前瀏覽器分頁，不會寫入網站程式碼。')||'';
    token=token.trim();
    if(token){try{sessionStorage.setItem(TOKEN_KEY,token)}catch{}}
    return token;
  }

  async function github(path,token,options={}){
    const response=await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,{
      ...options,
      headers:{
        'Accept':'application/vnd.github+json',
        'Authorization':`Bearer ${token}`,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(options.headers||{})
      }
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const msg=data?.message||`GitHub API ${response.status}`;
      if(response.status===401||response.status===403){try{sessionStorage.removeItem(TOKEN_KEY)}catch{}}
      throw new Error(msg);
    }
    return data;
  }

  async function updateFixedShare(){
    if(isReadonly)return;
    const p=activeProject();
    if(!p){setStatus('請先建立或選擇一個專案。','error');return}
    const code=select.value;
    if(!FIXED[code]){setStatus('請選擇固定分享代號。','error');return}
    const token=getToken();
    if(!token){setStatus('未輸入 GitHub Token，已取消更新。','error');return}

    const oldText=btn.textContent;
    btn.disabled=true;
    select.disabled=true;
    btn.textContent='更新中…';
    setStatus(`正在更新 ${FIXED[code]}（${code}）固定分享…`,'info',true);
    try{
      const path=`weather/shared/${code}.json`;
      const current=await github(path,token,{method:'GET',cache:'no-store'});
      const payload=exportProject(p,code);
      const body={
        message:`Update fixed weather share ${code}`,
        content:utf8ToBase64(JSON.stringify(payload,null,2)+'\n'),
        sha:current.sha,
        branch:BRANCH
      };
      await github(path,token,{method:'PUT',body:JSON.stringify(body),'headers':{'Content-Type':'application/json'}});
      const fixedURL=`${location.href.split('#')[0].split('?')[0]}?s=${encodeURIComponent(code)}`;
      const copied=typeof copyText==='function'?await copyText(fixedURL):false;
      setStatus(`${FIXED[code]} 固定分享已更新${copied?'，固定網址也已複製':''}。`,'info');
    }catch(err){
      setStatus(`固定分享更新失敗：${err.message||'未知錯誤'}`,'error');
    }finally{
      btn.disabled=false;
      select.disabled=false;
      btn.textContent=oldText;
    }
  }

  btn.addEventListener('click',updateFixedShare);
})();
