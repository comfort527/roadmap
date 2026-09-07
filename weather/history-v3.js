(function(){
  const originalRenderWeather = typeof renderWeather === 'function' ? renderWeather : null;
  if(!originalRenderWeather)return;
  let historyRequestId=0; const historyCache=new Map();
  const ARCHIVE_MIN_YEAR=1940;
  function requestedDates(){try{return enumerateDates(startInput.value,endInput.value)||[]}catch{return []}}
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
    if(note)note.textContent='歷史參考：高低溫＝去年同月同日；近年當日降雨率＝最多前10年間同日有雨（rain > 0.1 mm）的年份比例。1940 年以前無歷史資料時顯示「—」。';
    if(!document.getElementById('historyWeatherStyle')){const style=document.createElement('style');style.id='historyWeatherStyle';style.textContent=`
      .table-panel th,.table-panel td{padding-left:4px!important;padding-right:4px!important}
      .history-weather-note{padding:9px 8px;border-bottom:1px solid #d9e4d5;background:#f3f8f0;color:#60705b;font-size:11px;line-height:1.45}
      .history-head{background:#dfeeda!important;color:#38533b!important;white-space:nowrap;border-top:1px solid #c9ddc4!important;border-bottom:1px solid #c9ddc4!important;padding-left:4px!important;padding-right:4px!important}
      .history-head:first-of-type{border-left:3px solid #a9c79f!important}
      #weatherRows td:nth-child(n+7){background:#f3f8f0!important;border-bottom-color:#dce8d8!important;padding-left:4px!important;padding-right:4px!important}
      #weatherRows td:nth-child(7){border-left:3px solid #b8d0b0!important}
      .history-value{font-weight:800;white-space:nowrap;color:#405f48}.history-value.high{color:#a4513b}.history-value.low{color:#33738e}.history-value.rain{color:#487454}.history-loading{color:#8fa08b;font-weight:600}`;document.head.appendChild(style)}
  }
  function ensureHistoryCells(){const rows=[...document.querySelectorAll('#weatherRows tr')];rows.forEach(row=>{while(row.cells.length>9)row.deleteCell(row.cells.length-1);while(row.cells.length<9){const td=document.createElement('td');td.className='history-loading';td.textContent='…';row.appendChild(td)}});return rows}
  function cacheKey(loc,range){return `${Number(loc.latitude).toFixed(3)},${Number(loc.longitude).toFixed(3)}|${range.start}-${range.end}`}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  async function fetchJsonRetry(url,attempts=3){
    let lastError=null;
    for(let attempt=1;attempt<=attempts;attempt++){
      const controller=typeof AbortController!=='undefined'?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),15000):null;
      try{
        const response=await fetch(url,{cache:'no-store',signal:controller?.signal});
        if(timer)clearTimeout(timer);
        if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.reason||`歷史資料服務回應 ${response.status}`)}
        return await response.json();
      }catch(err){
        if(timer)clearTimeout(timer);
        lastError=err;
        if(attempt<attempts)await sleep(450*attempt);
      }
    }
    throw lastError||new Error('歷史資料暫時無法取得。');
  }
  function archiveURL(loc,startYear,endYear){
    const start=`${startYear}-01-01`,end=`${endYear}-12-31`;
    return `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`;
  }
  function emptyHistoryDaily(){return{time:[],temperature_2m_max:[],temperature_2m_min:[],rain_sum:[]}}
  function appendHistoryDaily(target,source){const times=source?.time||[];for(let i=0;i<times.length;i++){target.time.push(times[i]);target.temperature_2m_max.push(source.temperature_2m_max?.[i]??null);target.temperature_2m_min.push(source.temperature_2m_min?.[i]??null);target.rain_sum.push(source.rain_sum?.[i]??null)}}
  async function fetchHistorical(loc,dates){
    const range=historyRange(dates),key=cacheKey(loc,range);
    if(range.end<ARCHIVE_MIN_YEAR)return{range,daily:emptyHistoryDaily(),partial:true};
    if(historyCache.has(key))return historyCache.get(key);
    try{const stored=sessionStorage.getItem(`weatherHistory:${key}`);if(stored){const parsed=JSON.parse(stored);historyCache.set(key,parsed);return parsed}}catch{}
    let packed=null;
    try{
      const data=await fetchJsonRetry(archiveURL(loc,range.start,range.end),2);
      packed={range,daily:data.daily||emptyHistoryDaily(),partial:false};
    }catch(fullErr){
      const merged=emptyHistoryDaily();let failedChunks=0,successChunks=0;
      for(let y=range.start;y<=range.end;y+=4){
        const chunkEnd=Math.min(range.end,y+3);
        try{const data=await fetchJsonRetry(archiveURL(loc,y,chunkEnd),2);appendHistoryDaily(merged,data.daily);successChunks++}catch(err){failedChunks++}
      }
      if(!successChunks)throw fullErr;
      packed={range,daily:merged,partial:failedChunks>0};
    }
    historyCache.set(key,packed);
    try{sessionStorage.setItem(`weatherHistory:${key}`,JSON.stringify(packed))}catch{}
    return packed;
  }
  function validNumber(v){return Number.isFinite(Number(v))?Number(v):null}
  function buildDailyMap(daily){const map=new Map();(daily.time||[]).forEach((date,i)=>map.set(date,{high:validNumber(daily.temperature_2m_max?.[i]),low:validNumber(daily.temperature_2m_min?.[i]),rain:validNumber(daily.rain_sum?.[i])}));return map}
  function calcForTargetDate(targetISO,map){
    const y=Number(targetISO.slice(0,4)),md=targetISO.slice(5),last=map.get(`${y-1}-${md}`)||{},rains=[];
    for(let n=1;n<=10;n++){const yy=y-n;if(yy<ARCHIVE_MIN_YEAR)continue;const item=map.get(`${yy}-${md}`);if(item&&item.rain!==null&&item.rain!==undefined)rains.push(Number(item.rain))}
    return {high:validNumber(last.high),low:validNumber(last.low),rainRate:rains.length?Math.round(rains.filter(v=>v>0.1).length/rains.length*100):null,rainSamples:rains.length,lastYear:y-1,rainStart:Math.max(ARCHIVE_MIN_YEAR,y-10),rainEnd:y-1};
  }
  function fillCell(cell,value,type,suffix){cell.className=`history-value ${type}`;cell.textContent=value===null?'—':`${type==='rain'?Math.round(value):Number(value).toFixed(1)}${suffix}`}
  async function loadHistoricalColumns(loc){
    if(!loc||!Number.isFinite(Number(loc.latitude))||!Number.isFinite(Number(loc.longitude)))return;
    const dates=requestedDates();if(!dates.length)return;
    const requestId=++historyRequestId;ensureHistoryUI();const rows=ensureHistoryCells();
    rows.forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='…';row.cells[i].title='正在載入歷史資料'}});
    try{
      const packed=await fetchHistorical(loc,dates);if(requestId!==historyRequestId)return;
      const map=buildDailyMap(packed.daily),freshRows=ensureHistoryCells();
      freshRows.forEach((row,i)=>{
        const date=dates[i];if(!date)return;const stats=calcForTargetDate(date,map);
        fillCell(row.cells[6],stats.high,'high','°C');fillCell(row.cells[7],stats.low,'low','°C');fillCell(row.cells[8],stats.rainRate,'rain','%');
        row.cells[6].title=stats.lastYear<ARCHIVE_MIN_YEAR?'1940 年以前無歷史資料':`${stats.lastYear} 同月同日最高溫`;
        row.cells[7].title=stats.lastYear<ARCHIVE_MIN_YEAR?'1940 年以前無歷史資料':`${stats.lastYear} 同月同日最低溫`;
        row.cells[8].title=`${stats.rainStart}–${stats.rainEnd} 同月同日，實際可用樣本 ${stats.rainSamples} 年${packed.partial?'（部分歷史資料載入失敗）':''}`;
      });
    }catch(err){
      if(requestId!==historyRequestId)return;
      ensureHistoryCells().forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='—';row.cells[i].title=err.message||'歷史資料載入失敗'}})
    }
  }
  renderWeather=function(loc,data){const result=originalRenderWeather(loc,data);ensureHistoryUI();loadHistoricalColumns(loc);return result};
  ensureHistoryUI();if(typeof currentLocation!=='undefined'&&currentLocation&&document.getElementById('results')?.classList.contains('show'))loadHistoricalColumns(currentLocation);
})();
