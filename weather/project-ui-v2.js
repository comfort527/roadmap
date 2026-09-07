(function(){
  if(typeof normalizeProject!=='function'||typeof renderProject!=='function')return;
  const oldNormalize=normalizeProject;
  normalizeProject=function(p){const out=oldNormalize(p);if(out)out.analysisReport=String(p?.analysisReport||'');return out};
  const collapsedKey='weatherProjectCollapsedTeamsV1';
  const REPORT_KEY_PREFIX='weatherAnalysisReportTabV3:';
  function readCollapsed(){try{return JSON.parse(localStorage.getItem(collapsedKey)||'{}')}catch{return{}}}
  function writeCollapsed(v){try{localStorage.setItem(collapsedKey,JSON.stringify(v))}catch{}}
  function collapseId(projectId,team){return `${projectId||'none'}::${team}`}
  function openReadonlyReport(p){
    const key=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const payload={projectId:p.id||'',projectName:p.name||'天氣專案',report:String(p.analysisReport||''),editable:false,sourceUrl:location.href,createdAt:Date.now()};
    try{localStorage.setItem(REPORT_KEY_PREFIX+key,JSON.stringify(payload))}catch(e){setStatus('無法開啟綜合分析報告。','error');return}
    const tab=window.open(`./analysis-report.html?k=${encodeURIComponent(key)}`,'_blank');
    if(!tab){try{localStorage.removeItem(REPORT_KEY_PREFIX+key)}catch{}setStatus('瀏覽器阻擋了新分頁，請允許此網站開啟分頁後再試一次。','error')}
  }
  function openAnalysisReport(p){
    if(isReadonly){openReadonlyReport(p);return}
    const card=projectGroups.querySelector('[data-analysis-editor-card]');
    const textarea=projectGroups.querySelector('[data-analysis-inline-text]');
    if(!card||!textarea)return;
    card.hidden=false;
    textarea.value=String(p.analysisReport||'');
    textarea.focus();
    textarea.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function renameProjectEntry(team,id){
    if(isReadonly)return;
    const p=activeProject();
    if(!p||!Array.isArray(p.teams?.[team]))return;
    const x=p.teams[team].find(v=>String(v.id)===String(id));
    if(!x)return;
    let dialog=document.getElementById('entryRenameDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='entryRenameDialog';dialog.className='entry-rename-dialog';
      dialog.setAttribute('aria-labelledby','entryRenameTitle');
      dialog.innerHTML='<form id="entryRenameForm"><h2 id="entryRenameTitle">修改地點名稱</h2><label for="entryRenameInput">地點名稱</label><input id="entryRenameInput" type="text" autocomplete="off" required><p class="entry-rename-note">修改名稱後，仍會查詢原本選取的位置。</p><p id="entryRenameError" class="entry-rename-error" role="alert"></p><div class="entry-rename-actions"><button type="button" class="project-btn" id="entryRenameCancel">取消</button><button type="submit" class="project-btn primary-lite">儲存名稱</button></div></form>';
      document.body.appendChild(dialog);
      dialog.querySelector('#entryRenameCancel').addEventListener('click',()=>dialog.close());
    }
    const input=dialog.querySelector('#entryRenameInput'),error=dialog.querySelector('#entryRenameError');
    input.value=String(x.label||x.city||'');error.textContent='';
    dialog.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      const name=input.value.trim();
      if(!name){error.textContent='請輸入地點名稱。';input.focus();return}
      if(isReadonly||activeProject()!==p||!p.teams?.[team]?.includes(x)){
        error.textContent='專案內容已變更，請關閉視窗後重新選取地點。';return;
      }
      const previous=x.label;x.label=name;
      try{writeProjects()}catch(err){x.label=previous;error.textContent='名稱無法儲存，請確認瀏覽器儲存空間後重試。';return}
      dialog.close();renderProject();
      setStatus(`地點名稱已改為「${name}」。`,'info');
      const button=[...projectGroups.querySelectorAll('[data-rename-id]')].find(b=>b.dataset.renameEntryTeam===team&&b.dataset.renameId===String(id));
      button?.focus();
    };
    if(!dialog.open)dialog.showModal();input.focus();input.select();
  }
  function enableEntrySorting(p){
    if(isReadonly)return;
    projectGroups.querySelectorAll('.team-list').forEach(list=>{
      const team=list.closest('[data-team-card]')?.dataset.teamCard;
      if(!team||!Array.isArray(p.teams?.[team]))return;
      let dragging=null;
      list.querySelectorAll('.project-entry[data-sort-id]').forEach(row=>{
        row.draggable=true;
        row.addEventListener('dragstart',e=>{
          if(e.target.closest('.entry-edit,.entry-remove')){e.preventDefault();return}
          dragging=row;
          row.classList.add('is-dragging');
          if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.dataset.sortId||'')}
        });
        row.addEventListener('dragend',()=>{
          if(!dragging)return;
          dragging.classList.remove('is-dragging');
          list.querySelectorAll('.project-entry').forEach(x=>x.classList.remove('drag-over'));
          const order=[...list.querySelectorAll('.project-entry[data-sort-id]')].map(x=>x.dataset.sortId);
          const byId=new Map((p.teams[team]||[]).map(x=>[String(x.id),x]));
          p.teams[team]=order.map(id=>byId.get(String(id))).filter(Boolean);
          writeProjects();
          setStatus(`${team} 排序已儲存。`,'info');
          dragging=null;
        });
      });
      list.addEventListener('dragover',e=>{
        if(!dragging||dragging.closest('.team-list')!==list)return;
        e.preventDefault();
        if(e.dataTransfer)e.dataTransfer.dropEffect='move';
        const rows=[...list.querySelectorAll('.project-entry[data-sort-id]:not(.is-dragging)')];
        const target=rows.find(row=>e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);
        rows.forEach(x=>x.classList.remove('drag-over'));
        if(target){target.classList.add('drag-over');list.insertBefore(dragging,target)}else{list.appendChild(dragging)}
      });
      list.addEventListener('drop',e=>e.preventDefault());
    });
  }
  renderProject=function(){
    const p=activeProject();document.body.classList.toggle('readonly',isReadonly);renderProjectSwitcher();
    if(!p){projectDisplayName.textContent='天氣專案';projectMode.textContent=isReadonly?'唯讀分享':'尚未建立';projectGroups.innerHTML='<div class="team-empty">尚未建立專案。輸入專案名稱後按「建立專案」。</div>';renderAddToProjectBar();return}
    projectDisplayName.textContent=p.name;projectMode.textContent=isReadonly?'唯讀分享':'我的專案';if(!isReadonly)projectNameInput.value=p.name;
    const collapsed=readCollapsed();
    projectGroups.innerHTML=activeTeams(p).map(team=>{
      const items=p.teams?.[team]||[],isCollapsed=!!collapsed[collapseId(p.id,team)];
      const removeTeamBtn=(!isReadonly&&team!=='本隊')?`<button class="team-remove owner-only" type="button" data-remove-team-block="${team}">刪除${team}</button>`:'';
      const reportBtn=(team==='本隊'&&(!isReadonly||p.analysisReport))?`<button class="analysis-report-btn${isReadonly?'':' owner-only'}" type="button" data-analysis-open>綜合分析報告</button>`:'';
      const toggleBtn=`<button class="team-toggle" type="button" data-team-toggle="${team}" aria-expanded="${!isCollapsed}">${isCollapsed?'展開':'收合'}</button>`;
      const list=items.length?items.map(x=>`<div class="project-entry${isReadonly?'':' sortable'}" data-sort-id="${escapeAttr(x.id)}"><button class="entry-main" type="button" data-open-team="${team}" data-open-id="${escapeAttr(x.id)}"><div class="entry-city">${escapeHTML(x.label||x.city)}</div><div class="entry-date">${escapeHTML(x.start)} ～ ${escapeHTML(x.end)}</div></button><button class="entry-edit owner-only" type="button" data-rename-entry-team="${team}" data-rename-id="${escapeAttr(x.id)}" title="修改地點名稱" aria-label="修改地點名稱">✎</button><button class="entry-remove owner-only" type="button" data-remove-entry-team="${team}" data-remove-id="${escapeAttr(x.id)}" title="刪除城市">×</button></div>`).join(''):'<div class="team-empty">尚未加入城市</div>';
      const editor=(team==='本隊'&&!isReadonly)?`<div class="analysis-inline-card" data-analysis-editor-card hidden><div class="analysis-inline-head"><strong>綜合分析報告</strong><button type="button" class="analysis-inline-close" data-analysis-inline-close>收合</button></div><textarea class="analysis-inline-text" data-analysis-inline-text placeholder="可直接在這裡輸入或貼上綜合分析報告…">${escapeHTML(p.analysisReport||'')}</textarea><div class="analysis-inline-note" data-analysis-inline-note>內容會自動儲存。</div></div>`:'';
      return `<div class="team-card${isCollapsed?' is-collapsed':''}" data-team-card="${team}"><div class="team-head"><h3>${team}</h3><div class="team-head-actions"><span class="team-count">${items.length} 個城市</span>${reportBtn}${toggleBtn}${removeTeamBtn}</div></div><div class="team-list">${list}</div>${editor}</div>`;
    }).join('');
    projectGroups.querySelectorAll('[data-open-id]').forEach(b=>b.addEventListener('click',()=>openProjectEntry(b.dataset.openTeam,b.dataset.openId)));
    projectGroups.querySelectorAll('[data-rename-id]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();renameProjectEntry(b.dataset.renameEntryTeam,b.dataset.renameId)}));
    projectGroups.querySelectorAll('[data-remove-id]').forEach(b=>b.addEventListener('click',()=>removeProjectEntry(b.dataset.removeEntryTeam,b.dataset.removeId)));
    projectGroups.querySelectorAll('[data-remove-team-block]').forEach(b=>b.addEventListener('click',()=>removeTeam(b.dataset.removeTeamBlock)));
    projectGroups.querySelectorAll('[data-team-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const team=btn.dataset.teamToggle,card=btn.closest('[data-team-card]'),nowCollapsed=!card.classList.contains('is-collapsed');card.classList.toggle('is-collapsed',nowCollapsed);btn.textContent=nowCollapsed?'展開':'收合';btn.setAttribute('aria-expanded',String(!nowCollapsed));const state=readCollapsed();state[collapseId(p.id,team)]=nowCollapsed;writeCollapsed(state)}));
    projectGroups.querySelector('[data-analysis-open]')?.addEventListener('click',()=>openAnalysisReport(p));
    const textarea=projectGroups.querySelector('[data-analysis-inline-text]'),note=projectGroups.querySelector('[data-analysis-inline-note]'),editorCard=projectGroups.querySelector('[data-analysis-editor-card]');
    let saveTimer=null;
    function saveInline(){if(!textarea||isReadonly)return;p.analysisReport=textarea.value;writeProjects();if(note)note.textContent='已儲存。'}
    textarea?.addEventListener('input',()=>{if(note)note.textContent='編輯中…';clearTimeout(saveTimer);saveTimer=setTimeout(saveInline,300)});
    textarea?.addEventListener('blur',saveInline);
    projectGroups.querySelector('[data-analysis-inline-close]')?.addEventListener('click',()=>{saveInline();if(editorCard)editorCard.hidden=true});
    enableEntrySorting(p);
    renderAddToProjectBar();
  };
  renderProject();
})();
