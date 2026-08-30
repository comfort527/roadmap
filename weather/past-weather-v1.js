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
  async function getJson(url){const response=await fetch(url);if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.reason||'天氣服務暫時無法取得資料。')}return response.json()}
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

  fetchWeather=async function(loc){
    const requestedStart=startInput.value,requestedEnd=endInput.value;
    const todayISO=localISO(today),forecastEndISO=localISO(maxDate),yesterdayISO=isoAddDays(todayISO,-1);
    const daily=emptyDaily();let timezone=loc.timezone||'auto',timezone_abbreviation='';

    if(requestedStart<=yesterdayISO){
      const pastEnd=minISO(requestedEnd,yesterdayISO);
      if(requestedStart<'2022-01-01'){
        const archiveEnd=minISO(pastEnd,'2021-12-31');
        if(requestedStart<=archiveEnd){
          const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${ARCHIVE_DAILY}&timezone=auto&start_date=${requestedStart}&end_date=${archiveEnd}`;
          const data=await getJson(url);timezone=data.timezone||timezone;timezone_abbreviation=data.timezone_abbreviation||timezone_abbreviation;appendDaily(daily,data.daily,true);
        }
      }
      const hfStart=maxISO(requestedStart,HISTORICAL_FORECAST_START);
      if(hfStart<=pastEnd){
        const url=`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${FORECAST_DAILY}&timezone=auto&start_date=${hfStart}&end_date=${pastEnd}`;
        const data=await getJson(url);timezone=data.timezone||timezone;timezone_abbreviation=data.timezone_abbreviation||timezone_abbreviation;appendDaily(daily,data.daily,false);
      }
    }

    if(requestedEnd>=todayISO&&requestedStart<=forecastEndISO){
      const forecastStart=maxISO(requestedStart,todayISO),forecastEnd=minISO(requestedEnd,forecastEndISO);
      if(forecastStart<=forecastEnd){
        const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&daily=${FORECAST_DAILY}&timezone=auto&start_date=${forecastStart}&end_date=${forecastEnd}`;
        const data=await getJson(url);timezone=data.timezone||timezone;timezone_abbreviation=data.timezone_abbreviation||timezone_abbreviation;appendDaily(daily,data.daily,false);
      }
    }

    return{daily:sortDaily(daily),timezone,timezone_abbreviation,_requested:{start:requestedStart,end:requestedEnd},_available:{start:'1940-01-01',end:forecastEndISO},_partial:requestedStart<'1940-01-01'||requestedEnd>forecastEndISO};
  };
})();
