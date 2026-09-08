(function(){
  if(typeof fetchWeather!=='function'||!startInput||!endInput)return;
  startInput.min='1940-01-01';
  endInput.min='1940-01-01';

  const FORECAST_DAILY='temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset';
  const ARCHIVE_DAILY='temperature_2m_max,temperature_2m_min,rain_sum,sunrise,sunset';
  const HISTORICAL_FORECAST_START='2022-01-01';

  function isoAddDays(iso,days){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return localISO(d)}
  function minISO(a,b){return a<b?a:b}
  function maxISO(a,b){return a>b?a:b}
  function emptyDaily(){return{time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_probability_max:[],sunrise:[],sunset:[]}}
  function appendDaily(target,source,archive=false){const times=source?.time||[];for(let i=0;i<times.length;i++){
    target.time.push(times[i]);
    target.temperature_2m_max.push(source.temperature_2m_max?.[i]??null);
    target.temperature_2m_min.push(source.temperature_2m_min?.[i]??null);
    target.precipitation_probability_max.push(archive?null:(source.precipitation_probability_max?.[i]??null));
    target.sunrise.push(source.sunrise?.[i]??null);
    target.sunset.push(source.sunset?.[i]??null);
  }}
  function sortDaily(daily){const order=daily.time.map((d,i)=>[d,i]).sort((a,b)=>a[0].localeCompare(b[0]));const out=emptyDaily();for(const [,i] of order){out.time.push(daily.time[i]);out.temperature_2m_max.push(daily.temperature_2m_max[i]);out.temperature_2m_min.push(daily.temperature_2m_min[i]);out.precipitation_probability_max.push(daily.precipitation_probability_max[i]);out.sunrise.push(daily.sunrise[i]);out.sunset.push(daily.sunset[i])}return out}

  fetchWeather=async function(loc,query={}){
    const requestedStart=query.start||startInput.value,requestedEnd=query.end||endInput.value;
    const warnings=[];const signal=query.signal;
    const getJson=(url,attempts=2)=>WeatherRequests.json(url,{signal,attempts});
    const now=new Date();const horizon=new Date(now);horizon.setDate(horizon.getDate()+15);
    const todayISO=localISO(now),forecastEndISO=localISO(horizon);
    // Keep recent days on the live endpoint so crossing midnight does not switch
    // yesterday to a historical dataset that may still be catching up.
    const recentStartISO=isoAddDays(todayISO,-6),archiveEndISO=isoAddDays(recentStartISO,-1);
    const daily=emptyDaily();let timezone=loc.timezone||'auto',timezone_abbreviation='',partial=false;
    let requestedSegments=0,successfulSegments=0;
    function record(data,archive=false){
      if(!Array.isArray(data?.daily?.time)||!data.daily.time.length)throw new Error('服務未回傳此期間的逐日資料。');
      successfulSegments++;timezone=data.timezone||timezone;timezone_abbreviation=data.timezone_abbreviation||timezone_abbreviation;appendDaily(daily,data.daily,archive);
      if(data.daily.time.some((_,i)=>data.daily.temperature_2m_max?.[i]==null||data.daily.temperature_2m_min?.[i]==null)){partial=true;warnings.push('部分日期的溫度尚無資料，以「—」顯示。')}
    }
    function failed(err,label){WeatherRequests.check(signal);partial=true;warnings.push(`${label}：${err.message||'無法取得資料'}`)}

    if(requestedStart<=archiveEndISO){
      const pastEnd=minISO(requestedEnd,archiveEndISO);
      if(requestedStart<'2022-01-01'){
        const archiveEnd=minISO(pastEnd,'2021-12-31');
        if(requestedStart<=archiveEnd){
          const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${ARCHIVE_DAILY}&timezone=auto&start_date=${requestedStart}&end_date=${archiveEnd}`;
          requestedSegments++;try{record(await getJson(url),true)}catch(err){failed(err,'歷史天氣載入失敗')}
        }
      }
      const hfStart=maxISO(requestedStart,HISTORICAL_FORECAST_START);
      if(hfStart<=pastEnd){
        const hfUrl=`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${FORECAST_DAILY}&timezone=auto&start_date=${hfStart}&end_date=${pastEnd}`;
        requestedSegments++;try{
          record(await getJson(hfUrl));
        }catch(hfErr){
          WeatherRequests.check(signal);
          const fallbackUrl=`https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${ARCHIVE_DAILY}&timezone=auto&start_date=${hfStart}&end_date=${pastEnd}`;
          try{record(await getJson(fallbackUrl),true);partial=true;warnings.push('歷史預報暫時無法取得，已改用歷史天氣；此資料源不提供降雨機率。')}catch(archiveErr){failed(archiveErr,'歷史天氣及備援來源均載入失敗')}
        }
      }
    }

    if(requestedEnd>=recentStartISO&&requestedStart<=forecastEndISO){
      const forecastStart=maxISO(requestedStart,recentStartISO),forecastEnd=minISO(requestedEnd,forecastEndISO);
      if(forecastStart<=forecastEnd){
        const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${FORECAST_DAILY}&timezone=auto&start_date=${forecastStart}&end_date=${forecastEnd}`;
        requestedSegments++;try{record(await getJson(url))}catch(err){failed(err,'天氣預報載入失敗')}
      }
    }

    WeatherRequests.check(signal);
    if(requestedSegments&&!successfulSegments)throw new Error(warnings.join(' ')||'天氣資料載入失敗，請重試。');
    if(requestedEnd>forecastEndISO)warnings.push(`超出預報範圍的日期尚無天氣資料，目前可查至 ${forecastEndISO}。`);
    const sorted=sortDaily(daily);
    return{daily:sorted,_warnings:[...new Set(warnings)],timezone,timezone_abbreviation,_requested:{start:requestedStart,end:requestedEnd},_available:{start:'1940-01-01',end:forecastEndISO},_partial:partial||requestedStart<'1940-01-01'||requestedEnd>forecastEndISO};
  };
})();
