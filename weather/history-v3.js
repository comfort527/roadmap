(function(){
  const originalRenderWeather = typeof renderWeather === 'function' ? renderWeather : null;
  if(!originalRenderWeather)return;
  let historyRequestId=0,historyController=null; const historyCache=new Map();
  const CACHE_TTL=24*60*60*1000;
  const ARCHIVE_MIN_YEAR=1940;
  const BASE_NOTE='歷史參考：高低溫＝去年同月同日；近年當日降雨率＝最多前10年間同日有雨（rain > 0.1 mm）的年份比例。1940 年以前無歷史資料時顯示「—」。';
  function enumerateHistoryDates(start,end){
    if(!start||!end||start>end)return[];
    const out=[],d=new Date(`${start}T12:00:00`),last=new Date(`${end}T12:00:00`);
    if(Number.isNaN(d.getTime())||Number.isNaN(last.getTime()))return[];
    while(d<=last){out.push(localISO(d));d.setDate(d.getDate()+1)}
    return out;
  }
  function requestedDates(request){return enumerateHistoryDates(request.start,request.end)}
  function historyRange(dates){
    const years=(dates||[]).map(d=>Number(String(d).slice(0,4))).filter(Number.isFinite);
    const targetMin=years.length?Math.min(...years):new Date().getFullYear();
    const targetMax=years.length?Math.max(...years):targetMin;
    return {start:Math.max(ARCHIVE_MIN_YEAR,targetMin-10),end:targetMax-1,requestedStart:targetMin-10};
  }
  function ensureHistoryUI(){
    const table=document.querySelector('.table-panel table'),headRow=table?.querySelector('thead tr');
    if(headRow){[...headRow.querySelectorAll('[data-history-head]')].forEach(el=>el.remove());['去年最高溫','去年最低溫','近年當日降雨率'].forEach((label,i)=>{const th=document.createElement('th');th.textContent=label;th.dataset.historyHead=String(i);th.className='history-head';headRow.appendChild(th)})}
    let note=document.getElementById('historyWeatherNote');if(table&&!note){note=document.createElement('div');note.id='historyWeatherNote';note.className='history-weather-note';table.parentElement?.parentElement?.insertBefore(note,table.parentElement)}
    if(note&&!note.dataset.historyStatus)note.textContent=BASE_NOTE;
    if(!document.getElementById('historyWeatherStyle')){const style=document.createElement('style');style.id='historyWeatherStyle';style.textContent=`
      .table-panel th,.table-panel td{padding-left:4px!important;padding-right:4px!important}
      .history-weather-note{padding:9px 8px;border-bottom:1px solid #d9e4d5;background:#f3f8f0;color:#60705b;font-size:11px;line-height:1.45}
      .history-weather-note[data-history-status="loading"]{background:#f5f8f3;color:#687762}
      .history-weather-note[data-history-status="success"]{background:#eef7eb;color:#486347}
      .history-weather-note[data-history-status="error"]{background:#fff2ee;color:#8b4037}
      .history-retry-btn{margin-left:6px;border:1px solid currentColor;border-radius:7px;background:#fff;padding:3px 7px;color:inherit;font-size:11px;font-weight:800;cursor:pointer}
      .history-head{background:#dfeeda!important;color:#38533b!important;white-space:nowrap;border-top:1px solid #c9ddc4!important;border-bottom:1px solid #c9ddc4!important;padding-left:4px!important;padding-right:4px!important}
      .history-head:first-of-type{border-left:3px solid #a9c79f!important}
      #weatherRows td:nth-child(n+7){background:#f3f8f0!important;border-bottom-color:#dce8d8!important;padding-left:4px!important;padding-right:4px!important}
      #weatherRows td:nth-child(7){border-left:3px solid #b8d0b0!important}
      .history-value{font-weight:800;white-space:nowrap;color:#405f48}.history-value.high{color:#a4513b}.history-value.low{color:#33738e}.history-value.rain{color:#487454}.history-loading{color:#8fa08b;font-weight:600}`;document.head.appendChild(style)}
  }
  function setHistoryNote(message,state='info',retry=null){
    ensureHistoryUI();const note=document.getElementById('historyWeatherNote');if(!note)return;
    note.dataset.historyStatus=state;note.textContent=message;
    if(retry){const btn=document.createElement('button');btn.type='button';btn.className='history-retry-btn';btn.textContent=retry.label;btn.addEventListener('click',retry.run);note.appendChild(btn)}
  }
  function ensureHistoryCells(){const rows=[...document.querySelectorAll('#weatherRows tr')];rows.forEach(row=>{while(row.cells.length>9)row.deleteCell(row.cells.length-1);while(row.cells.length<9){const td=document.createElement('td');td.className='history-loading';td.textContent='…';row.appendChild(td)}});return rows}
  function validNumber(value){
    return typeof value==='number'&&Number.isFinite(value)?value:null;
  }
  function cacheKey(loc,start,end){
    return `weatherHistory:v4:${Number(loc.latitude).toFixed(5)},${Number(loc.longitude).toFixed(5)}|${start}|${end}`;
  }
  function emptyHistoryDaily(){return{time:[],temperature_2m_max:[],temperature_2m_min:[],rain_sum:[]}}
  function appendHistoryDaily(target,source){
    for(let i=0;i<source.time.length;i++){
      target.time.push(source.time[i]);
      for(const field of ['temperature_2m_max','temperature_2m_min','rain_sum'])target[field].push(validNumber(source[field]?.[i]));
    }
  }
  function completeDaily(daily,start,end){
    if(!Array.isArray(daily?.time))return false;
    const expected=enumerateHistoryDates(start,end);
    return expected.length===daily.time.length&&expected.every((date,i)=>date===daily.time[i]&&
      ['temperature_2m_max','temperature_2m_min','rain_sum'].every(field=>validNumber(daily[field]?.[i])!==null));
  }
  function cachedChunk(key,start,end){
    let value=historyCache.get(key);
    if(!value){try{value=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}}
    if(!value||!Number.isFinite(value.savedAt)||Date.now()-value.savedAt<0||Date.now()-value.savedAt>CACHE_TTL||
      !completeDaily(value.daily,start,end)){
      historyCache.delete(key);try{sessionStorage.removeItem(key)}catch{}return null;
    }
    historyCache.set(key,value);return value;
  }
  async function fetchHistorical(loc,dates,{force=false,signal}={}){
    const range=historyRange(dates),chunks=[];
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const latest=localISO(yesterday);
    for(let year=range.start;year<=range.end;year+=4){
      const start=`${year}-01-01`,end=[`${Math.min(range.end,year+3)}-12-31`,latest].sort()[0];
      if(start<=end)chunks.push({start,end});
    }
    if(!chunks.length)return{range,daily:emptyHistoryDaily(),partial:false,unavailable:true};
    const parts=new Array(chunks.length);let next=0;
    async function worker(){
      while(next<chunks.length){
        WeatherRequests.check(signal);
        const index=next++,{start,end}=chunks[index],key=cacheKey(loc,start,end);
        if(force){historyCache.delete(key);try{sessionStorage.removeItem(key)}catch{}}
        const cached=cachedChunk(key,start,end);
        if(cached){parts[index]={...cached,complete:true};continue}
        const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`;
        try{
          const data=await WeatherRequests.json(url,{signal});
          WeatherRequests.check(signal);
          if(!Array.isArray(data?.daily?.time)||!data.daily.time.length)throw new Error('服務未回傳逐日歷史資料。');
          const complete=completeDaily(data.daily,start,end);
          const entry={daily:data.daily,savedAt:Date.now()};
          parts[index]={...entry,complete};
          // Only complete responses are reusable; partial years must be retried next time.
          if(complete){historyCache.set(key,entry);try{sessionStorage.setItem(key,JSON.stringify(entry))}catch{}}
        }catch(error){
          WeatherRequests.check(signal);
          parts[index]={error:error.message||'歷史資料載入失敗'};
        }
      }
    }
    await Promise.all([worker(),worker()]);
    WeatherRequests.check(signal);
    const merged=emptyHistoryDaily(),errors=[];let partial=false,success=0;
    for(const part of parts){
      if(part?.daily){appendHistoryDaily(merged,part.daily);success++;if(!part.complete)partial=true}
      else{partial=true;errors.push(part?.error||'歷史資料載入失敗')}
    }
    if(!success)throw new Error([...new Set(errors)].join(' '));
    return{range,daily:merged,partial,errors:[...new Set(errors)]};
  }
  function buildDailyMap(daily){
    const map=new Map();(daily.time||[]).forEach((date,i)=>map.set(date,{
      high:validNumber(daily.temperature_2m_max?.[i]),low:validNumber(daily.temperature_2m_min?.[i]),rain:validNumber(daily.rain_sum?.[i])
    }));return map;
  }
  function calcForTargetDate(targetISO,map){
    const year=Number(targetISO.slice(0,4)),md=targetISO.slice(5),last=map.get(`${year-1}-${md}`)||{},rains=[];
    for(let n=1;n<=10;n++){
      if(year-n<ARCHIVE_MIN_YEAR)continue;
      const rain=validNumber(map.get(`${year-n}-${md}`)?.rain);
      if(rain!==null)rains.push(rain);
    }
    return{high:validNumber(last.high),low:validNumber(last.low),
      rainRate:rains.length?Math.round(rains.filter(v=>v>0.1).length/rains.length*100):null,
      rainSamples:rains.length,lastYear:year-1,rainStart:Math.max(ARCHIVE_MIN_YEAR,year-10),rainEnd:year-1};
  }
  function fillCell(cell,value,type,suffix){
    cell.className=`history-value ${type}`;cell.textContent=value===null?'—':`${type==='rain'?Math.round(value):value.toFixed(1)}${suffix}`;
  }
  async function loadHistoricalColumns(loc,request,force=false){
    historyController?.abort();historyController=new AbortController();
    const signal=historyController.signal,requestId=++historyRequestId;
    ensureHistoryUI();
    if(!loc||validNumber(Number(loc.latitude))===null||validNumber(Number(loc.longitude))===null){
      setHistoryNote('歷史資料未載入：目前地點缺少有效座標。','error');return;
    }
    const dates=requestedDates(request);
    if(!dates.length){setHistoryNote('歷史資料未載入：查詢日期無效。','error');return}
    const retry=(label,refresh)=>({label,run:()=>loadHistoricalColumns(loc,request,refresh)});
    const rows=ensureHistoryCells();
    rows.forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='…';row.cells[i].title='正在載入歷史資料'}});
    setHistoryNote(force?'正在重新取得歷史資料…':'歷史資料載入中…','loading');
    try{
      const packed=await fetchHistorical(loc,dates,{force,signal});
      if(requestId!==historyRequestId||signal.aborted)return;
      const map=buildDailyMap(packed.daily);
      ensureHistoryCells().forEach((row,i)=>{
        if(!dates[i])return;const stats=calcForTargetDate(dates[i],map);
        fillCell(row.cells[6],stats.high,'high','°C');fillCell(row.cells[7],stats.low,'low','°C');fillCell(row.cells[8],stats.rainRate,'rain','%');
        row.cells[6].title=`${stats.lastYear} 同月同日最高溫`;row.cells[7].title=`${stats.lastYear} 同月同日最低溫`;
        row.cells[8].title=`${stats.rainStart}–${stats.rainEnd} 同月同日，實際可用樣本 ${stats.rainSamples} 年；缺值不計入統計`;
      });
      if(packed.unavailable){setHistoryNote(BASE_NOTE+' 此期間尚無可用的歷史參考資料。');return}
      const message=packed.partial?
        '部分年份或欄位尚未取得；已保留可用資料，可補抓缺漏資料。'+(packed.errors?.length?' 原因：'+packed.errors.join(' '):''):
        `歷史資料已載入（${packed.range.start}–${packed.range.end}）；缺值以「—」顯示。`;
      setHistoryNote(BASE_NOTE+' '+message,packed.partial?'info':'success',
        retry(packed.partial?'補抓缺漏資料':'更新歷史資料',!packed.partial));
    }catch(error){
      if(requestId!==historyRequestId||signal.aborted)return;
      ensureHistoryCells().forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='—';row.cells[i].title=error.message}});
      setHistoryNote('歷史資料載入失敗：'+(error.message||'無法連線至歷史資料服務。'),'error',retry('重試',false));
    }
  }
  window.addEventListener('weather-query-start',()=>{
    historyRequestId++;historyController?.abort();
    const note=document.getElementById('historyWeatherNote');
    if(note){note.textContent='等待新的查詢結果…';note.dataset.historyStatus='loading'}
  });
  renderWeather=function(loc,data){
    const result=originalRenderWeather(loc,data);
    const request={...(data._requested||{start:startInput.value,end:endInput.value})};
    loadHistoricalColumns({...loc},request);return result;
  };
  ensureHistoryUI();
  // A restored shared query can finish before this deferred file arrives.
  if(typeof currentLocation!=='undefined'&&currentLocation&&renderedQueryState&&document.getElementById('results')?.classList.contains('show')){
    loadHistoricalColumns({...currentLocation},{...renderedQueryState});
  }
})();
