(() => {
 'use strict';
 const cfg=window.REPORT_DRIVE||{},key='pr4:drive:'+window.COURSE.version;
 let busy=false,memory=null;
 function endpoint(){try{const u=new URL(cfg.webAppUrl);return u.protocol==='https:'&&u.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)?u:null;}catch{return null;}}
 function status(text,type=''){const retry=document.getElementById('save-drive');if(retry)retry.hidden=type!=='error';const el=document.getElementById('drive-status');if(el){el.textContent=text;el.className='email-status '+type;}}
 function record(){try{return JSON.parse(localStorage.getItem(key)||'null')||memory;}catch{return memory;}}
 function keep(value){memory=value;try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
 function button(value){busy=value;const el=document.getElementById('save-drive');if(el){el.disabled=value||!endpoint();el.textContent=value?'Збереження…':'Повторити збереження';}}
 async function fingerprint(s){const bytes=new TextEncoder().encode(s);if(crypto.subtle){const b=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}let n=2166136261;for(const b of bytes)n=Math.imul(n^b,16777619);return String(n>>>0);}
 function requestId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');}
 function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
 function receipt(id){
  return new Promise((resolve,reject)=>{
   const callback='__pr4Receipt_'+requestId(),script=document.createElement('script'),u=endpoint();
   if(!u){reject(Error('CONFIG'));return;}
   const cleanup=()=>{clearTimeout(timer);script.remove();delete window[callback];};
   window[callback]=value=>{cleanup();if(!value||value.requestId!==id||!['saved','pending','error'].includes(value.status)){reject(Error('RECEIPT'));return;}resolve(value);};
   script.onerror=()=>{cleanup();reject(Error('NETWORK'));};
   const timer=setTimeout(()=>{cleanup();reject(Error('TIMEOUT'));},8000);
   u.searchParams.set('action','status');u.searchParams.set('requestId',id);u.searchParams.set('callback',callback);u.searchParams.set('_',String(Date.now()));
   script.src=u.href;script.referrerPolicy='no-referrer';document.head.append(script);
  });
 }
 function errorText(code){return {SIZE:'Обсяг записів перевищує ліміт приймача. Збережіть HTML-звіт і передайте його викладачеві.',VALIDATION:'Приймач не прийняв структуру звіту. Перевірте заповнення та відповідність версії завдання.',ANSWERS:'Приймач не підтвердив усі фінальні відповіді. Повторно перевірте кроки.',BUSY:'Приймач зайнятий. Спробуйте ще раз — той самий номер здавання не створить дубліката.',CONFLICT:'Цей номер здавання пов’язаний з іншим вмістом. Повідомте викладача й завантажте звіт.',DAILY_LIMIT:'Сьогодні досягнуто ліміту приймача. Завантажте звіт і повідомте викладача.',STORAGE:'Не підтверджено доступ до папки. Викладачеві потрібно перевірити приймач.'}[code]||'Не вдалося підтвердити збереження. Завантажте звіт і повідомте викладача.';}
 async function submit(){
  if(busy||!endpoint())return;
  const api=window.PR_REPORT;if(!api||!api.ready())return;
  if(!api.identityReady()){status('Заповніть ПІБ і групу вгорі сторінки, потім повторіть збереження.','error');return;}
  button(true);
  try{
   const snapshot=JSON.parse(JSON.stringify(api.snapshot())),hash=await fingerprint(JSON.stringify(snapshot));
   let item=record();if(!item||item.hash!==hash){item={hash,requestId:requestId(),saved:false};keep(item);}
   // Повторна здача користується тим самим номером. Сервер перевіряє дублікати.
   const payload=JSON.stringify({protocol:'pr4-drive-v1',requestId:item.requestId,snapshot});
   if(payload.length>(cfg.maxRequestChars||200000)){status(errorText('SIZE'),'error');return;}
   status('Передаємо роботу й очікуємо підтвердження створення файла…');
   const controller=new AbortController(),postTimer=setTimeout(()=>controller.abort(),20000);
   // Opaque-відповідь не є підтвердженням. Після POST окремо читаємо квитанцію.
   fetch(endpoint().href,{method:'POST',mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',body:new URLSearchParams({payload}),signal:controller.signal}).catch(()=>{}).finally(()=>clearTimeout(postTimer));
   let result=null;
   for(let attempt=0;attempt<8;attempt++){
    await wait(attempt===0?1500:2500);
    try{const value=await receipt(item.requestId);if(value.status==='saved'||value.status==='error'){result=value;break;}}catch{}
   }
   if(result&&result.status==='saved'){
    item.saved=true;item.time=new Date().toISOString();keep(item);
    queueMicrotask(()=>document.dispatchEvent(new CustomEvent('pr:saved')));
    status('Роботу здано: створення файла на Google Диску підтверджено. Номер здавання: '+item.requestId+'. Власну копію звіту можна завантажити нижче.','success');
   }else if(result&&result.status==='error')status(errorText(result.code),'error');
   else status('Підтвердження поки не отримано. Файл міг зберегтися. Натисніть кнопку повторно: для цього вмісту використовується той самий номер здавання. Також можна завантажити HTML-звіт.','error');
  }catch{status('Не вдалося підтвердити збереження. Перевірте інтернет або завантажте звіт для викладача.','error');}
  finally{button(false);}
 }
 document.addEventListener('pr:summary',e=>{
  const summary=document.getElementById('summary-content'),panel=document.createElement('section');panel.className='email-panel';panel.setAttribute('aria-label','Здавання на Google Диск');
  const title=document.createElement('h3');title.textContent='Здати роботу викладачеві';panel.append(title);
  const p=document.createElement('p');p.textContent='Звіт зберігається у папці викладача. Інші студенти не отримують доступу до ваших відповідей.';panel.append(p);
  const feedback=document.createElement('p');feedback.id='drive-status';feedback.className='email-status';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');panel.append(feedback);
  const btn=document.createElement('button');btn.type='button';btn.id='save-drive';btn.className='button';btn.textContent='Повторити збереження';btn.hidden=true;btn.disabled=!endpoint()||busy;btn.addEventListener('click',submit);panel.append(btn);
  const note=document.createElement('p');note.className='hint';note.textContent='Під час здавання передаються ПІБ, група, 10 ваших записів і тестові відповіді. Прогрес до здавання зберігається лише у вашому браузері.';panel.append(note);
  summary.insertBefore(panel,summary.querySelector('.actions'));
  if(!endpoint()){status('Приймач ще не підключений викладачем. Завантажте звіт кнопкою нижче та передайте його викладачеві.');return;}
  if(busy){status('Збереження вже триває. Дочекайтеся підтвердження.');return;}
  if(e.detail.autoSend){submit();return;}
  const last=record();status(last&&last.saved?'Збереження останньої надісланої версії було підтверджено '+new Date(last.time).toLocaleString('uk-UA')+'. Відповіді зафіксовано.':'Очікуємо автоматичного збереження зафіксованої роботи.');
 });
})();
