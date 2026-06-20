// === Modal helper ===
function __waFormatNumber(num){
  var d=String(num||'').replace(/[^0-9]/g,'');
  if(!d)return'';
  if(d.length>4)return'+'+d.slice(0,2)+' '+d.slice(2,5)+' '+d.slice(5);
  return'+'+d;
}
function showApplicationModal(opts){
  opts=opts||{};
  var isFast=!!opts.fast;
  var wa=String(opts.whatsapp||'').replace(/[^0-9]/g,'');
  var overlay=document.createElement('div');
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(14,26,46,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(3px);';
  var box=document.createElement('div');
  box.style.cssText='background:#fff;color:#0e1a2e;max-width:460px;width:100%;border-radius:16px;padding:32px;box-shadow:0 24px 60px -10px rgba(0,0,0,.3);font-family:inherit;position:relative;';
  var close=document.createElement('button');
  close.type='button';close.setAttribute('aria-label','Schließen');close.innerHTML='&times;';
  close.style.cssText='position:absolute;top:12px;right:16px;background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:#64748b;';
  close.onclick=function(){overlay.remove();};
  var icon=document.createElement('div');
  icon.style.cssText='width:48px;height:48px;border-radius:50%;background:#f5f3ff;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:22px;';
  icon.textContent='✅';
  var h=document.createElement('h3');
  h.textContent='Vielen Dank!';
  h.style.cssText='margin:0 0 8px;font-size:22px;font-weight:700;';
  var p=document.createElement('p');
  p.style.cssText='margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;';
  box.appendChild(close);box.appendChild(icon);box.appendChild(h);box.appendChild(p);
  if(isFast&&opts.redirectUrl){
    p.textContent='Ihre Anfrage wurde übermittelt. Sie werden gleich zum Portal weitergeleitet.';
    var goBtn=document.createElement('button');
    goBtn.type='button';goBtn.textContent='Jetzt zum Portal →';
    goBtn.style.cssText='display:block;width:100%;background:#7c3aed;color:#fff;border:0;padding:13px 18px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;margin-bottom:10px;';
    var info=document.createElement('p');
    info.style.cssText='margin:0 0 14px;font-size:13px;color:#94a3b8;';
    var secs=10;info.textContent='Automatische Weiterleitung in '+secs+' Sekunden …';
    box.appendChild(goBtn);box.appendChild(info);
    var redir=function(){window.location.href=opts.redirectUrl;};
    goBtn.onclick=redir;
    var tick=setInterval(function(){secs-=1;if(secs<=0){clearInterval(tick);redir();return;}info.textContent='Automatische Weiterleitung in '+secs+' Sekunden …';},1000);
  } else if(wa){
    p.textContent='Ihre Anfrage ist eingegangen. Wir melden uns in Kürze. Sie können uns auch direkt auf WhatsApp kontaktieren.';
    var card=document.createElement('div');
    card.style.cssText='background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px;';
    var lbl=document.createElement('div');lbl.textContent='SCHNELLER KONTAKT';
    lbl.style.cssText='font-size:11px;font-weight:700;letter-spacing:.08em;color:#7c3aed;margin-bottom:10px;';
    var wabtn=document.createElement('a');
    wabtn.href='https://wa.me/'+wa+'?text='+encodeURIComponent('Hallo, ich habe gerade eine Anfrage gestellt.');
    wabtn.target='_blank';wabtn.rel='noopener';
    wabtn.style.cssText='display:flex;align-items:center;justify-content:center;gap:8px;background:#22c55e;color:#fff;text-decoration:none;font-weight:600;padding:12px;border-radius:8px;font-size:15px;';
    wabtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>WhatsApp-Chat starten';
    card.appendChild(lbl);card.appendChild(wabtn);
    box.appendChild(card);
  } else {
    p.textContent='Ihre Anfrage ist eingegangen. Wir melden uns innerhalb von 1 Werktag bei Ihnen.';
  }
  var closeBtn=document.createElement('button');
  closeBtn.type='button';closeBtn.textContent='Schließen';
  closeBtn.style.cssText='background:#fff;border:1.5px solid #e2e8f0;color:#0e1a2e;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;';
  closeBtn.onclick=function(){overlay.remove();};
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
  document.body.appendChild(overlay);
}

(function(){
  // ── data-multiline: render newlines as <br> / <p> ──
  document.querySelectorAll('[data-multiline]').forEach(function(el){
    var raw=el.getAttribute('data-multiline')||'';
    var paras=raw.split(/\r?\n\r?\n/).filter(Boolean);
    if(paras.length>1){
      el.innerHTML=paras.map(function(p){return'<p>'+p.replace(/\r?\n/g,'<br/>')+'</p>';}).join('');
    } else {
      el.innerHTML=raw.replace(/\r?\n/g,'<br/>');
    }
  });

  // ── Form submission ──
  var form=document.getElementById('application-form');
  var status=document.getElementById('form-status');
  if(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      status.className='status';status.textContent='Wird gesendet…';
      var raw=Object.fromEntries(new FormData(form).entries());
      var first=(raw.first_name||'').toString().trim();
      var last=(raw.last_name||'').toString().trim();
      var data={
        first_name:first||null,last_name:last||null,
        full_name:(first+' '+last).trim()||raw.full_name||'',
        email:raw.email,phone:raw.phone||null,
        message:[raw.company?'Unternehmen: '+raw.company:'',raw.message||''].filter(Boolean).join('\n\n')||null,
      };
      data.domain=(window.location&&window.location.hostname?window.location.hostname:'').replace(/^www\./,'');
      data.flow_type=window.FLOW_TYPE||'classic';
      if(window.TENANT_ID)data.tenant_id=window.TENANT_ID;
      if(window.PORTAL_URL)data.portal_url=window.PORTAL_URL;
      if(window.SOURCE_SLUG)data.source_slug=window.SOURCE_SLUG;
      fetch(window.PORTAL_API,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
      })
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(res){
        form.reset();
        status.className='status success';status.textContent='Anfrage erfolgreich gesendet.';
        var isFast=(window.FLOW_TYPE||'classic')==='fast';
        showApplicationModal({fast:isFast,whatsapp:window.WHATSAPP_NUMBER||'',redirectUrl:(res&&res.redirect_url)||''});
      })
      .catch(function(){
        status.className='status error';status.textContent='Fehler beim Senden. Bitte später erneut versuchen.';
      });
    });
  }

  // ── Burger ──
  var burger=document.getElementById('burger');
  var nav=document.getElementById('nav-links');
  if(burger&&nav)burger.addEventListener('click',function(){nav.classList.toggle('open');});

  // ── Legal hash ──
  var LEGAL=['impressum','datenschutz'];
  function syncLegal(){
    var h=(location.hash||'').replace('#','');
    document.querySelectorAll('.legal').forEach(function(el){el.classList.remove('is-open');});
    if(LEGAL.indexOf(h)>=0){
      var el=document.getElementById(h);
      if(el){el.classList.add('is-open');el.scrollIntoView({behavior:'smooth',block:'start'});}
    }
  }
  window.addEventListener('hashchange',syncLegal);syncLegal();

  // ── Smooth scroll ──
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var id=a.getAttribute('href');
      if(!id||id.length<=1)return;
      var target=id.slice(1);
      if(LEGAL.indexOf(target)>=0)return;
      var el=document.querySelector(id);
      if(el){
        e.preventDefault();
        document.querySelectorAll('.legal').forEach(function(s){s.classList.remove('is-open');});
        if(location.hash)history.replaceState(null,'',location.pathname+location.search);
        el.scrollIntoView({behavior:'smooth'});
        if(nav)nav.classList.remove('open');
      }
    });
  });

  // ── Scroll-animate ──
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}});
    },{threshold:0.1});
    document.querySelectorAll('[data-animate]').forEach(function(el){io.observe(el);});
  } else {
    document.querySelectorAll('[data-animate]').forEach(function(el){el.classList.add('visible');});
  }
})();

// ── Floating WhatsApp ──
document.addEventListener('DOMContentLoaded',function(){
  var wa=String(window.WHATSAPP_NUMBER||'').replace(/[^0-9]/g,'');
  if(!wa)return;
  if(document.getElementById('wa-float-btn'))return;
  var a=document.createElement('a');
  a.id='wa-float-btn';a.href='https://wa.me/'+wa;a.target='_blank';a.rel='noopener';
  a.setAttribute('aria-label','Kontaktieren Sie uns auf WhatsApp');
  a.style.cssText='position:fixed;bottom:22px;right:22px;z-index:9998;display:flex;align-items:center;gap:8px;background:#22c55e;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:999px;font-size:15px;font-family:system-ui,sans-serif;box-shadow:0 8px 24px rgba(34,197,94,.35);transition:transform .15s;';
  a.onmouseenter=function(){a.style.transform='translateY(-2px)';};
  a.onmouseleave=function(){a.style.transform='translateY(0)';};
  a.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg><span>WhatsApp</span>';
  document.body.appendChild(a);
  var mq=window.matchMedia('(max-width:540px)');
  function apply(){var s=a.querySelector('span');if(s)s.style.display=mq.matches?'none':'inline';}
  apply();mq.addEventListener?mq.addEventListener('change',apply):mq.addListener(apply);
});
