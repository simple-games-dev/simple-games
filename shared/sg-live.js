/* sg-live.js — the "alive" layer shared by every game: sound, haptics, "your turn" alerts,
   emoji reactions and the installable-app (PWA) wiring. Loaded by boot.js after sg.js. */
(function(){
  var SG = window.SG; if(!SG) return;
  var me = document.currentScript;
  var ROOT = me ? me.src.replace(/shared\/sg-live\.js.*$/, '') : '';
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  // ---------------- installable app ----------------
  function head(tag, attrs){ var el = document.createElement(tag); for(var k in attrs) el.setAttribute(k, attrs[k]); document.head.appendChild(el); }
  head('link', {rel:'manifest', href: ROOT+'manifest.webmanifest'});
  head('link', {rel:'apple-touch-icon', href: ROOT+'images/icon-192.png'});
  head('meta', {name:'theme-color', content:'#06080F'});
  head('meta', {name:'apple-mobile-web-app-capable', content:'yes'});
  head('meta', {name:'mobile-web-app-capable', content:'yes'});
  if('serviceWorker' in navigator && /^https?:/.test(location.protocol)){
    window.addEventListener('load', function(){ navigator.serviceWorker.register(ROOT+'sw.js').catch(function(){}); });
  }

  // ---------------- sound ----------------
  var ctx = null, muted = lsGet('sg_mute')==='1';
  function ac(){
    if(!ctx){ try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
    if(ctx.state==='suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, delay, slideTo){
    var c = ac(); if(!c || muted) return;
    var t = c.currentTime + (delay||0), o = c.createOscillator(), g = c.createGain();
    o.type = type||'sine'; o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t+dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol||0.08, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur+0.02);
  }
  var lastTick = 0;
  // block / silence: chat messages and quick reactions from other players (saved on this device)
  SG.mute = {chat: lsGet('sg_mute_chat')==='1', react: lsGet('sg_mute_react')==='1'};
  SG.sfx = {
    tick: function(){ var n=Date.now(); if(n-lastTick<40) return; lastTick=n; tone(620,0.06,'triangle',0.05,0,420); },
    turn: function(){ tone(660,0.14,'sine',0.09,0); tone(880,0.2,'sine',0.09,0.12); },
    react: function(){ tone(520,0.09,'sine',0.05,0,900); },
    error: function(){ tone(180,0.15,'sawtooth',0.05,0,120); },
    low30: function(){ tone(740,0.12,'sine',0.045,0); },
    low10: function(){ tone(1180,0.09,'square',0.05,0); tone(1180,0.09,'square',0.05,0.13); },
    win: function(){ [523,659,784,1047].forEach(function(f,i){ tone(f,0.28,'triangle',0.09,i*0.12); }); tone(1319,0.7,'sine',0.08,0.5); tone(1047,0.7,'sine',0.06,0.5); },
    get muted(){ return muted; },
    setMuted: function(m){ muted = !!m; lsSet('sg_mute', m?'1':'0'); paintTools(); }
  };
  SG.vibrate = function(p){ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} };
  // every button, token, card and chip makes a soft tick (this also unlocks audio on the first tap)
  document.addEventListener('pointerdown', function(e){
    if(e.target.closest && e.target.closest('button,.tok,.gcard,[role=button],.chip.pick,.cm-sw,.sg-react-btn')){ ac(); SG.sfx.tick(); }
  }, true);
  // fanfare with the fireworks
  var _cel = SG.celebrate;
  if(_cel) SG.celebrate = function(o){ if(!document.getElementById('sgCelebrate')){ SG.sfx.win(); SG.vibrate([60,40,60,40,120]); } return _cel.call(SG, o); };

  // ---------------- small tools: sound + alerts toggles ----------------
  var tools = document.createElement('div'); tools.className = 'sg-tools';
  tools.innerHTML = '<button type="button" class="sg-tool" id="sgSnd" aria-label="Sound"></button><button type="button" class="sg-tool" id="sgNote" aria-label="Turn alerts"></button><button type="button" class="sg-tool" id="sgMChat" aria-label="Silence chat"></button><button type="button" class="sg-tool" id="sgMReact" aria-label="Silence reactions"></button>';
  function notifState(){ return ('Notification' in window) ? Notification.permission : 'unsupported'; }
  function paintTools(){
    var s = document.getElementById('sgSnd'), n = document.getElementById('sgNote'); if(!s||!n) return;
    s.textContent = muted ? '🔇' : '🔊'; s.title = muted ? 'Sound off — tap to turn on' : 'Sound on — tap to mute';
    var mc = document.getElementById('sgMChat'), mr = document.getElementById('sgMReact');
    if(mc){ mc.textContent = SG.mute.chat ? '🙊' : '💬'; mc.classList.toggle('off', SG.mute.chat); mc.title = SG.mute.chat ? 'Chat silenced — tap to show messages again' : 'Tap to silence chat'; }
    if(mr){ mr.textContent = SG.mute.react ? '😶' : '😀'; mr.classList.toggle('off', SG.mute.react); mr.title = SG.mute.react ? 'Reactions silenced — tap to show them again' : 'Tap to silence reactions'; }
    var p = notifState(); n.style.display = p==='unsupported' ? 'none' : '';
    n.textContent = p==='granted' ? '🔔' : '🔕'; n.title = p==='granted' ? 'Turn alerts on' : p==='denied' ? 'Alerts are blocked in your browser settings' : 'Tap to get an alert when it is your turn';
  }
  function mountTools(){
    if(document.getElementById('sgSnd')) return;
    document.body.appendChild(tools); paintTools();
    document.getElementById('sgSnd').addEventListener('click', function(){ SG.sfx.setMuted(!muted); if(!muted) SG.sfx.turn(); });
    document.getElementById('sgMChat').addEventListener('click', function(){
      SG.mute.chat = !SG.mute.chat; lsSet('sg_mute_chat', SG.mute.chat?'1':'0'); paintTools();
      try{ window.dispatchEvent(new Event('sg-mute')); }catch(e){}
    });
    document.getElementById('sgMReact').addEventListener('click', function(){
      SG.mute.react = !SG.mute.react; lsSet('sg_mute_react', SG.mute.react?'1':'0'); paintTools(); paintReactMute();
    });
    document.getElementById('sgNote').addEventListener('click', function(){
      if(!('Notification' in window) || Notification.permission!=='default') return;
      Notification.requestPermission().then(paintTools).catch(function(){});
    });
  }

  // ---------------- turn alerts ----------------
  var wasMine, baseTitle = document.title, flashT = null;
  function stopFlash(){ if(flashT){ clearInterval(flashT); flashT = null; } document.title = baseTitle; }
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) stopFlash(); });
  window.addEventListener('focus', stopFlash);
  function yourTurn(){
    SG.sfx.turn(); SG.vibrate([70,50,70]);
    if(!document.hidden) return;
    var on = false; if(flashT) clearInterval(flashT);
    flashT = setInterval(function(){ on = !on; document.title = on ? '⏳ Your turn! — '+baseTitle : baseTitle; }, 900);
    try{ if('Notification' in window && Notification.permission==='granted') new Notification('Your turn!', {body: baseTitle, icon: ROOT+'images/icon-192.png', tag:'sg-turn'}); }catch(e){}
  }

  // ---------------- emoji reactions ----------------
  var EMOJIS = ['👏','😂','😮','🔥','🤔','😭'], lastK, lastSent = 0, reactRef = null;
  var fab = document.createElement('div'); fab.className = 'sg-react hidden';
  fab.innerHTML = '<div class="sg-react-tray hidden">'+EMOJIS.map(function(e){ return '<button type="button" class="sg-react-btn" data-e="'+e+'">'+e+'</button>'; }).join('')+'</div><button type="button" class="sg-react-btn sg-react-main" aria-label="Send a reaction"><span class="sg-react-face">😀</span><span class="sg-react-clock hidden"></span></button>';
  function paintReactMute(){ fab.classList.toggle('muted', SG.mute.react); var f = fab.querySelector('.sg-react-face'); if(f) f.textContent = SG.mute.react ? '😶' : '😀'; if(SG.mute.react) fab.querySelector('.sg-react-tray').classList.add('hidden'); }
  function send(e){
    var n = Date.now(); if(n-lastSent<1200 || !reactRef) return; lastSent = n;
    try{ reactRef.update({reaction:{e:e, by:SG.getDeviceId(), t:n, k:n+'-'+Math.random().toString(36).slice(2,6)}}); }catch(x){}
    float(e);   // instant local feedback
    fab.querySelector('.sg-react-tray').classList.add('hidden');
  }
  fab.addEventListener('click', function(ev){
    var b = ev.target.closest('.sg-react-btn'); if(!b) return;
    if(b.classList.contains('sg-react-main')){ if(SG.mute.react){ SG.mute.react = false; lsSet('sg_mute_react','0'); paintTools(); paintReactMute(); return; } }
    if(b.classList.contains('sg-react-main')) fab.querySelector('.sg-react-tray').classList.toggle('hidden');
    else send(b.dataset.e);
  });
  function float(e){
    var el = document.createElement('div'); el.className = 'sg-float'; el.textContent = e;
    el.style.left = (12 + Math.random()*70) + 'vw'; el.style.fontSize = (34 + Math.random()*26) + 'px';
    document.body.appendChild(el); SG.sfx.react(); setTimeout(function(){ el.remove(); }, 3200);
  }


  // ---------------- stats (kept on this device) ----------------
  SG.stats = {
    get: function(){ try{ return JSON.parse(lsGet('sg_stats')||'{}') || {}; }catch(e){ return {}; } },
    record: function(game, won, key){
      var seen; try{ seen = JSON.parse(lsGet('sg_stats_seen')||'[]'); }catch(e){ seen = []; }
      if(key && seen.indexOf(key)!==-1) return;
      if(key){ seen.push(key); lsSet('sg_stats_seen', JSON.stringify(seen.slice(-60))); }
      var all = SG.stats.get(), g = all[game] || {played:0, won:0, streak:0, best:0};
      g.played++;
      if(won===true){ g.won++; g.streak++; if(g.streak>g.best) g.best = g.streak; }
      else if(won===false) g.streak = 0;
      all[game] = g; lsSet('sg_stats', JSON.stringify(all));
    }
  };

  // ---------------- rematch vote ----------------
  // Everybody seated must tap "Play again" before the room resets (so one player can't yank a finished game
  // away from the others). Votes belong to a round, so old votes never carry into the next game.
  function rmVotes(c){ var v = c.votes || {}; return (c.ids||[]).filter(function(id){ return v[id]===c.round; }); }
  var votedAt = 0;
  SG.rematchGate = function(c){
    if(!c || !c.online || !c.roomRef) return true;                    // same-device games rematch at once
    var me = SG.getDeviceId();
    if((c.ids||[]).indexOf(me)===-1) return false;                    // spectators can't restart the room
    var got = rmVotes(c), mine = got.indexOf(me)!==-1;
    var others = (c.ids||[]).filter(function(id){ return id!==me; });
    var othersReady = others.every(function(id){ return got.indexOf(id)!==-1; });
    if(othersReady) return true;                                      // I'm the last one in: go
    if(mine) return Date.now()-votedAt > 4000;                        // already waiting; a later tap starts anyway
    var upd = {}; upd['rematchVotes.'+me] = c.round; votedAt = Date.now();
    try{ c.roomRef.update(upd); }catch(e){ return true; }
    if(c.votes) c.votes[me] = c.round;
    paintRematch(c);
    return false;
  };
  function paintRematch(c){
    var b = c.btn; if(!b) return;
    if(!b.dataset.base) b.dataset.base = b.textContent;
    var me = SG.getDeviceId();
    if(!c.online || !c.roomRef){ b.textContent = b.dataset.base; b.style.display=''; return; }
    if((c.ids||[]).indexOf(me)===-1){ b.style.display = 'none'; return; }
    b.style.display = '';
    var got = rmVotes(c), n = got.length, N = (c.ids||[]).length, mine = got.indexOf(me)!==-1;
    b.textContent = mine ? 'Waiting for the others… ('+n+'/'+N+')' : (n>0 ? b.dataset.base+' ('+n+'/'+N+' ready)' : b.dataset.base);
    b.title = mine ? 'Tap again after a few seconds to start anyway' : '';
  }


  // ---------------- computer players (shared plumbing; each game brings its own brain) ----------------
  // A bot owns a seat whose id starts with "bot". In an online room the first human's browser plays for it.
  SG.bots = {
    isBotId: function(id){ return typeof id==='string' && id.indexOf('bot')===0; },
    names: ['Ada 🤖','Turing 🤖','Hopper 🤖','Nova 🤖'],
    name: function(i){ return SG.bots.names[i % SG.bots.names.length]; },
    levels: [[null,'Humans'],['easy','Easy'],['normal','Normal'],['hard','Hard']],
    // Easy / Normal / Hard chooser. onPick(levelOrNull)
    picker: function(el, level, onPick, label){
      if(!el) return;
      el.className = (el.className||'').replace(/\bsg-botpick\b/,'') + ' sg-botpick';
      el.innerHTML = '<p class="sg-bp-label">'+label+': <b>'+(level?'computer':'people only')+'</b></p><div class="sg-bp-row">'+
        SG.bots.levels.map(function(o){ return '<button type="button" class="'+((o[0]||null)===(level||null)?'':'secondary')+'" data-bot="'+(o[0]||'')+'">'+o[1]+'</button>'; }).join('')+'</div>';
      el.querySelectorAll('button[data-bot]').forEach(function(b){ b.addEventListener('click', function(){ onPick(b.dataset.bot || null); }); });
    },
    // Schedules one computer move at a time, after a short "thinking" pause.
    //   cfg = {active(): bool (it is a bot's turn and I'm the host), key(): string that changes every turn, play(): runs the move}
    driver: function(cfg){
      var timer = null, last = null;
      return { tick: function(){
        if(cfg.paused && cfg.paused()) return;
        if(!cfg.active()){ return; }
        var k = cfg.key();
        if(timer && last===k) return;
        if(timer) clearTimeout(timer);
        last = k;
        timer = setTimeout(function(){
          timer = null;
          if(!cfg.active() || cfg.key()!==k) return;
          Promise.resolve().then(cfg.play).catch(function(e){ console.error('bot failed', e); });
        }, (cfg.min||900) + Math.random()*(cfg.spread||700));
      }};
    }
  };

  // ---------------- one call from each game's render() ----------------
  // ---------------- turn clock on the reaction button + low-time sounds ----------------
  var myTurnNow = false, lowDl = null, low30Done = false, lastLow = -1;
  var _rtt = SG.renderTurnTimer;
  if(_rtt) SG.renderTurnTimer = function(el, deadline, active){
    var secs = _rtt.call(SG, el, deadline, active);
    var ck = fab.querySelector('.sg-react-clock');
    if(secs===null || secs===undefined){ if(ck) ck.classList.add('hidden'); return secs; }
    if(ck){ ck.textContent = secs; ck.classList.remove('hidden'); ck.classList.toggle('low', secs<=10); }
    if(deadline!==lowDl){ lowDl = deadline; low30Done = false; lastLow = -1; }
    if(myTurnNow && active){
      if(secs<=30 && secs>10 && !low30Done){ low30Done = true; SG.sfx.low30(); }
      else if(secs<=10 && secs>0 && secs!==lastLow){ lastLow = secs; if(secs===10) low30Done = true; SG.sfx.low10(); SG.vibrate(30); }
    }
    return secs;
  };

  // SG.live({online, roomRef, reaction, active, myTurn})
  //   active = a game is in progress for this viewer; myTurn = it is this device's turn
  SG.live = function(o){
    mountTools();
    var showFab = !!(o.online && o.roomRef);
    reactRef = showFab ? o.roomRef : null;
    if(!fab.parentNode) document.body.appendChild(fab);
    fab.classList.toggle('hidden', !showFab);
    var r = o.reaction;
    if(r && r.k){
      if(r.k!==lastK){                                            // each reaction shows once; old ones (page load) are skipped by age
        lastK = r.k;
        if(r.by!==SG.getDeviceId() && !SG.mute.react && Math.abs(Date.now()-(r.t||0))<30000) float(r.e);
      }
    }
    if(o.rematch) paintRematch(o.rematch);
    if(o.result && o.result.over && o.result.game) SG.stats.record(o.result.game, o.result.won, o.result.key);
    var sp = document.getElementById('sgSpectate');
    if(o.spectator){
      if(!sp){ sp = document.createElement('div'); sp.id = 'sgSpectate'; sp.className = 'sg-spectate'; sp.textContent = '👀 Spectating — you can watch and react'; document.body.appendChild(sp); }
    } else if(sp) sp.remove();
    paintReactMute();
    var mine = !!(o.online && o.active && o.myTurn);
    myTurnNow = mine;
    if(wasMine===undefined){ wasMine = mine; }
    else { if(mine && !wasMine) yourTurn(); wasMine = mine; }
  };

  var css = document.createElement('style');
  css.textContent =
   '.sg-botpick{margin-top:10px; text-align:center;} .sg-bp-label{font-size:13px; opacity:.75; margin:0 0 6px;} .sg-bp-row{display:flex; gap:6px;} .sg-bp-row button{flex:1 1 0; padding:9px 6px; font-size:13px;}'+
   '.sg-tools{position:fixed; top:10px; right:10px; z-index:70; display:flex; gap:6px;}'+
   '.sg-tool{width:34px; height:34px; border-radius:50%; padding:0; font-size:15px; line-height:1; cursor:pointer; color:#fff;'+
     'background:rgba(20,24,40,.7); border:1px solid rgba(255,255,255,.14); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);}'+
   '.sg-tool:hover{border-color:rgba(245,179,66,.6);}'+
   '.sg-react{position:fixed; right:90px; bottom:29px; z-index:59; display:flex; flex-direction:row; align-items:center; gap:8px;}'+
   '.sg-react-main{position:relative;} .sg-react-clock{position:absolute; top:-7px; left:-7px; min-width:22px; height:18px; padding:0 4px; border-radius:9px; font:700 11px/18px "Space Grotesk",sans-serif; color:#fff; background:#2a3150; border:1px solid rgba(255,255,255,.2); text-align:center;} .sg-react-clock.low{background:#d8453b; animation:sgPulse .8s infinite;} @keyframes sgPulse{50%{transform:scale(1.18);}}'+
   '.sg-react.muted .sg-react-main{opacity:.55;} .sg-tool.off{opacity:.6; border-color:rgba(224,72,62,.6);}'+
   '.sg-react.hidden,.sg-react-tray.hidden{display:none !important;}'+
   '.sg-react-main{width:44px; height:44px; border-radius:50%; padding:0; font-size:20px; cursor:pointer; background:rgba(20,24,40,.8); border:1px solid rgba(255,255,255,.16); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);}'+
   '.sg-react-tray{display:flex; gap:4px; padding:6px; border-radius:26px; background:rgba(14,18,32,.92); border:1px solid rgba(255,255,255,.14); box-shadow:0 12px 30px -8px rgba(0,0,0,.8);}'+
   '.sg-react-tray .sg-react-btn{width:38px; height:38px; border-radius:50%; padding:0; font-size:20px; cursor:pointer; background:transparent; border:0;}'+
   '.sg-react-tray .sg-react-btn:hover{background:rgba(255,255,255,.1); transform:scale(1.15);}'+
   '.sg-float{position:fixed; bottom:-60px; z-index:90; pointer-events:none; animation:sgFloat 3.1s ease-out forwards; filter:drop-shadow(0 6px 10px rgba(0,0,0,.5));}'+
   '@keyframes sgFloat{0%{transform:translateY(0) scale(.6); opacity:0;} 12%{opacity:1; transform:translateY(-12vh) scale(1.1);} 100%{transform:translateY(-82vh) translateX(18px) scale(1); opacity:0;}}'+
   '.sg-spectate{position:fixed; left:50%; bottom:14px; transform:translateX(-50%); z-index:57; padding:8px 14px; border-radius:999px; font-size:12px; font-weight:600; color:#fff; white-space:nowrap; background:rgba(20,24,40,.85); border:1px solid rgba(70,210,240,.45); box-shadow:0 0 18px -4px rgba(70,210,240,.6); backdrop-filter:blur(10px);}'+
   '@media (max-width:820px){.sg-react{right:84px; bottom:23px;} .sg-spectate{bottom:84px; font-size:11px;}}'+
   '@media (prefers-reduced-motion: reduce){.sg-float{animation-duration:1.4s;}}';
  document.head.appendChild(css);
})();
