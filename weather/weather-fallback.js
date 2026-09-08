// Preserve successful values across refreshes without presenting them as fresh data.
(function(){
  const fetchCurrent=fetchWeather;
  const fields=['temperature_2m_max','temperature_2m_min','precipitation_probability_max','sunrise','sunset'];
  const lifetime=48*60*60*1000;
  const memory=new Map();
  function valid(field,value){
    return field==='sunrise'||field==='sunset'?
      typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value):
      typeof value==='number'&&Number.isFinite(value);
  }
  function read(key){
    if(memory.has(key))return memory.get(key);
    try{const value=JSON.parse(sessionStorage.getItem(key)||'null');if(value&&typeof value==='object'&&!Array.isArray(value))return value}catch{}
    return {};
  }
  fetchWeather=async function(loc,query={}){
    const start=query.start||startInput.value,end=query.end||endInput.value;
    const key=`weatherDailyFallback:v1:${Number(loc.latitude).toFixed(5)},${Number(loc.longitude).toFixed(5)}`;
    const saved=read(key),now=Date.now();let data,failure;
    try{data=await fetchCurrent(loc,query)}catch(error){WeatherRequests.check(query.signal);failure=error}
    WeatherRequests.check(query.signal);
    const fresh=data?.daily||{time:[]},index=new Map((fresh.time||[]).map((date,i)=>[date,i]));
    const merged={time:[],...Object.fromEntries(fields.map(field=>[field,[]]))};
    const previous={},warnings=[...(data?._warnings||[])];let oldValues=0,missingDays=0;
    for(const date of enumerateDates(start,end)){
      const i=index.get(date),previousFields={},record=saved[date]||{};let hasTemperature=false;
      merged.time.push(date);
      for(const field of fields){
        const freshValue=i===undefined?null:fresh[field]?.[i];let value=null;
        if(valid(field,freshValue)){
          value=freshValue;record[field]={value,at:now};
        }else{
          const cached=record[field];
          if(cached&&valid(field,cached.value)&&Number.isFinite(cached.at)&&cached.at<=now&&now-cached.at<=lifetime){
            value=cached.value;previousFields[field]=cached.at;oldValues++;
          }
        }
        if((field==='temperature_2m_max'||field==='temperature_2m_min')&&value!==null)hasTemperature=true;
        merged[field].push(value);
      }
      if(!hasTemperature)missingDays++;
      if(Object.keys(previousFields).length)previous[date]=previousFields;
      saved[date]=record;
    }
    if(failure&&!oldValues)throw failure;
    // Expire individual field timestamps and bound storage; fallback reuse never extends freshness.
    const retained=Object.fromEntries(Object.entries(saved).map(([date,record])=>[date,Object.fromEntries(
      Object.entries(record).filter(([field,cell])=>fields.includes(field)&&cell&&valid(field,cell.value)&&Number.isFinite(cell.at)&&cell.at<=now&&now-cell.at<=lifetime)
    )]).filter(([,record])=>Object.keys(record).length).sort(([a],[b])=>a.localeCompare(b)).slice(-3660));
    memory.set(key,retained);try{sessionStorage.setItem(key,JSON.stringify(retained))}catch{}
    if(failure)warnings.push(`本次更新失敗：${failure.message}`);
    if(oldValues)warnings.push('部分數值本次未取得，暫顯示上次成功資料（48 小時內），已逐項標示；請稍後重新查詢。');
    if(missingDays)warnings.push(`${missingDays} 個日期尚無溫度資料，以「—」顯示。`);
    return{...data,daily:merged,_requested:{start,end},_warnings:[...new Set(warnings)],
      _partial:!!data?._partial||!!failure||oldValues>0||missingDays>0,_previousValues:previous,
      _updateFailed:!!failure,timezone:data?.timezone||loc.timezone||'auto'};
  };
  const renderCurrent=renderWeather;
  renderWeather=function(loc,data){
    const result=renderCurrent(loc,data),rows=[...document.querySelectorAll('#weatherRows tr')];
    rows.forEach((row,i)=>{
      const date=data.daily?.time?.[i],previous=data._previousValues?.[date];
      if(!previous)return;
      const label=document.createElement('span');label.textContent='上次資料';label.className='previous-weather-label';
      row.cells[0]?.appendChild(label);
      fields.forEach((field,j)=>{
        if(!previous[field])return;const cell=row.cells[j+1];if(!cell)return;
        const time=new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(previous[field]));
        cell.classList.add('previous-weather-value');cell.title=`本次未取得；上次成功取得時間：${time}`;
      });
    });
    if(data._updateFailed)$('updated').textContent='本次更新未成功；目前顯示上次取得的資料';
    return result;
  };
})();
