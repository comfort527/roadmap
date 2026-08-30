(function(){
  const originalRenderWeather = typeof renderWeather === 'function' ? renderWeather : null;
  if(!originalRenderWeather)return;

  let historyRequestId = 0;
  const historyCache = new Map();

  function currentHistoryYears(){
    const y = new Date().getFullYear();
    return {start:y-5,end:y-1};
  }

  function ensureHistoryUI(){
    const table=document.querySelector('.table-panel table');
    const headRow=table?.querySelector('thead tr');
    if(headRow && !headRow.querySelector('[data-history-head]')){
      const labels=['近5年最高溫','近5年最低溫','近5年降雨率'];
      labels.forEach((label,i)=>{
        const th=document.createElement('th');
        th.textContent=label;
        th.dataset.historyHead=String(i);
        th.className='history-head';
        headRow.appendChild(th);
      });
    }
    if(table && !document.getElementById('historyWeatherNote')){
      const years=currentHistoryYears();
      const note=document.createElement('div');
      note.id='historyWeatherNote';
      note.className='history-weather-note';
      note.textContent=`歷史參考：${years.start}–${years.end} 同月同日；降雨率＝5年間同日有雨（rain > 0.1 mm）的年份比例。`;
      table.parentElement?.parentElement?.insertBefore(note,table.parentElement);
    }
    if(!document.getElementById('historyWeatherStyle')){
      const style=document.createElement('style');
      style.id='historyWeatherStyle';
      style.textContent=`
        .history-weather-note{padding:9px 14px;border-bottom:1px solid #dfe9ef;background:#f8fbfd;color:#607487;font-size:11px;line-height:1.45}
        .history-head{background:#eef6fa!important;white-space:nowrap}
        .history-value{font-weight:800;white-space:nowrap;color:#405f72}
        .history-value.high{color:#a84d37}.history-value.low{color:#27739a}.history-value.rain{color:#27718f}
        .history-loading{color:#95a5af;font-weight:600}
      `;
      document.head.appendChild(style);
    }
  }

  function ensureHistoryCells(){
    const rows=[...document.querySelectorAll('#weatherRows tr')];
    rows.forEach(row=>{
      while(row.cells.length<9){
        const td=document.createElement('td');
        td.className='history-loading';
        td.textContent='…';
        row.appendChild(td);
      }
    });
    return rows;
  }

  function cacheKey(loc,years){
    return `${Number(loc.latitude).toFixed(3)},${Number(loc.longitude).toFixed(3)}|${years.start}-${years.end}`;
  }

  async function fetchHistoricalFiveYears(loc){
    const years=currentHistoryYears(),key=cacheKey(loc,years);
    if(historyCache.has(key))return historyCache.get(key);
    try{
      const stored=sessionStorage.getItem(`weatherHistory:${key}`);
      if(stored){
        const parsed=JSON.parse(stored);
        historyCache.set(key,parsed);
        return parsed;
      }
    }catch{}

    const start=`${years.start}-01-01`,end=`${years.end}-12-31`;
    const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`;
    const response=await fetch(url);
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      throw new Error(body.reason||'近5年歷史資料暫時無法取得。');
    }
    const data=await response.json();
    const daily=data.daily||{};
    const packed={years,daily};
    historyCache.set(key,packed);
    try{sessionStorage.setItem(`weatherHistory:${key}`,JSON.stringify(packed))}catch{}
    return packed;
  }

  function validNumber(v){return Number.isFinite(Number(v))?Number(v):null}

  function buildDailyMap(daily){
    const map=new Map();
    (daily.time||[]).forEach((date,i)=>map.set(date,{
      high:validNumber(daily.temperature_2m_max?.[i]),
      low:validNumber(daily.temperature_2m_min?.[i]),
      rain:validNumber(daily.rain_sum?.[i])
    }));
    return map;
  }

  function calcForTargetDate(targetISO,map,years){
    const md=targetISO.slice(5);
    const highs=[],lows=[],rains=[];
    for(let y=years.start;y<=years.end;y++){
      const item=map.get(`${y}-${md}`);
      if(!item)continue;
      if(item.high!==null)highs.push(item.high);
      if(item.low!==null)lows.push(item.low);
      if(item.rain!==null)rains.push(item.rain);
    }
    return {
      high:highs.length?Math.max(...highs):null,
      low:lows.length?Math.min(...lows):null,
      rainRate:rains.length?Math.round(rains.filter(v=>v>0.1).length/rains.length*100):null,
      samples:Math.max(highs.length,lows.length,rains.length)
    };
  }

  function fillCell(cell,value,type,suffix){
    cell.className=`history-value ${type}`;
    cell.textContent=value===null?'—':`${Math.round(value)}${suffix}`;
  }

  async function loadHistoricalColumns(loc){
    if(!loc||!Number.isFinite(Number(loc.latitude))||!Number.isFinite(Number(loc.longitude)))return;
    const requestId=++historyRequestId;
    ensureHistoryUI();
    const rows=ensureHistoryCells();
    rows.forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='…'}});
    try{
      const packed=await fetchHistoricalFiveYears(loc);
      if(requestId!==historyRequestId)return;
      const map=buildDailyMap(packed.daily);
      const dates=enumerateDates(startInput.value,endInput.value);
      const freshRows=ensureHistoryCells();
      freshRows.forEach((row,i)=>{
        const date=dates[i];
        if(!date)return;
        const stats=calcForTargetDate(date,map,packed.years);
        fillCell(row.cells[6],stats.high,'high','°C');
        fillCell(row.cells[7],stats.low,'low','°C');
        fillCell(row.cells[8],stats.rainRate,'rain','%');
        const tip=`${packed.years.start}–${packed.years.end} 同月同日，樣本 ${stats.samples} 年`;
        row.cells[6].title=tip;row.cells[7].title=tip;row.cells[8].title=tip;
      });
    }catch(err){
      if(requestId!==historyRequestId)return;
      ensureHistoryCells().forEach(row=>{for(let i=6;i<9;i++){row.cells[i].className='history-loading';row.cells[i].textContent='—';row.cells[i].title=err.message||'歷史資料載入失敗'}});
    }
  }

  renderWeather=function(loc,data){
    const result=originalRenderWeather(loc,data);
    ensureHistoryUI();
    loadHistoricalColumns(loc);
    return result;
  };

  ensureHistoryUI();
  if(typeof currentLocation!=='undefined' && currentLocation && document.getElementById('results')?.classList.contains('show')){
    loadHistoricalColumns(currentLocation);
  }
})();
