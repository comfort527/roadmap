(function(){
  if(typeof normalizeProject!=='function'||typeof renderProject!=='function')return;
  const oldNormalize=normalizeProject;
  normalizeProject=function(p){const out=oldNormalize(p);if(out)out.analysisReport=String(p?.analysisReport||'');return out};
  const collapsedKey='weatherProjectCollapsedTeamsV1';
  const REPORT_SESSION_KEY='weatherAnalysisReportPageV1';
  function readCollapsed(){try{return JSON.parse(localStorage.getItem(collapsedKey)||'{}')}catch{return{}}}
  function writeCollapsed(v){try{localStorage.setItem(collapsedKey,JSON.stringify(v))}catch{}}
  function collapseId(projectId,team){return `${projectId||'none'}::${team}`}
  function openAnalysisReport(p){
    try{
      sessionStorage.setItem(REPORT_SESSION_KEY,JSON.stringify({
        projectId:p.id||'',
        projectName:p.name||'天氣專案',
        report:String(p.analysisReport||''),
        readonly:!!isReadonly,
        sourceUrl:location.href
      }));
    }catch(e){setStatus('無法開啟綜合分析報告。','error');return}
    window.location.href='./analysis-report.html';
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
      const list=items.length?items.map(x=>`<div class="project-entry"><button class="entry-main" type="button" data-open-team="${team}" data-open-id="${escapeAttr(x.id)}"><div class="entry-city">${escapeHTML(x.label||x.city)}</div><div class="entry-date">${escapeHTML(x.start)} ～ ${escapeHTML(x.end)}</div></button><button class="entry-remove owner-only" type="button" data-remove-entry-team="${team}" data-remove-id="${escapeAttr(x.id)}" title="刪除城市">×</button></div>`).join(''):'<div class="team-empty">尚未加入城市</div>';
      return `<div class="team-card${isCollapsed?' is-collapsed':''}" data-team-card="${team}"><div class="team-head"><h3>${team}</h3><div class="team-head-actions"><span class="team-count">${items.length} 個城市</span>${reportBtn}${toggleBtn}${removeTeamBtn}</div></div><div class="team-list">${list}</div></div>`;
    }).join('');
    projectGroups.querySelectorAll('[data-open-id]').forEach(b=>b.addEventListener('click',()=>openProjectEntry(b.dataset.openTeam,b.dataset.openId)));
    projectGroups.querySelectorAll('[data-remove-id]').forEach(b=>b.addEventListener('click',()=>removeProjectEntry(b.dataset.removeEntryTeam,b.dataset.removeId)));
    projectGroups.querySelectorAll('[data-remove-team-block]').forEach(b=>b.addEventListener('click',()=>removeTeam(b.dataset.removeTeamBlock)));
    projectGroups.querySelectorAll('[data-team-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const team=btn.dataset.teamToggle,card=btn.closest('[data-team-card]'),nowCollapsed=!card.classList.contains('is-collapsed');card.classList.toggle('is-collapsed',nowCollapsed);btn.textContent=nowCollapsed?'展開':'收合';btn.setAttribute('aria-expanded',String(!nowCollapsed));const state=readCollapsed();state[collapseId(p.id,team)]=nowCollapsed;writeCollapsed(state)}));
    projectGroups.querySelector('[data-analysis-open]')?.addEventListener('click',()=>openAnalysisReport(p));
    renderAddToProjectBar();
  };
  renderProject();
})();
