/* ==========================================================================
   Simple Games — shared code (window.SG)
   Used by every game: Firebase setup, device id, room helpers, turn-timer UI,
   chat widget (with GIFs), invite link, escapeHtml.
   Change something here once and every game gets it.
   ========================================================================== */
(function(){
  const SG = window.SG = {};

  // ---------- small helpers ----------
  SG.escapeHtml = function(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
  SG.newId = function(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); };
  SG.ROOM_TTL_MS = 60*60*1000;

  SG.getDeviceId = function(){
    let id = null;
    try{ id = localStorage.getItem('sg_device_id'); }catch(e){}
    if(!id){
      id = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try{ localStorage.setItem('sg_device_id', id); }catch(e){}
    }
    return id;
  };

  // ---------- Firebase ----------
  SG.db = null;
  SG.initFirestore = function(){
    if(SG.db) return SG.db;
    if(typeof FIREBASE_CONFIGURED==='undefined' || !FIREBASE_CONFIGURED || !window.firebase) return null;
    firebase.initializeApp(FIREBASE_CONFIG);
    try{
      if(typeof APP_CHECK_SITE_KEY!=='undefined' && APP_CHECK_SITE_KEY && firebase.appCheck){
        firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
      }
    }catch(e){ console.warn('App Check failed to start', e); }
    SG.db = firebase.firestore();
    return SG.db;
  };
  SG.expireTs = function(){ return firebase.firestore.Timestamp.fromMillis(Date.now() + SG.ROOM_TTL_MS); };
  SG.genRoomCode = function(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s='';
    for(let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  };
  // Delete a few expired rooms (called opportunistically when someone creates a room).
  SG.sweepOldRooms = function(collection, onEach){
    const db = SG.db; if(!db) return;
    db.collection(collection).where('expireAt','<',firebase.firestore.Timestamp.now()).limit(20).get()
      .then(snap=>{ snap.forEach(doc=>{ if(onEach) onEach(doc); doc.ref.delete().catch(()=>{}); }); })
      .catch(err=>console.error('room sweep failed', err));
  };

  // Partial write of selected state keys (never the whole document, so chat/seats can't be clobbered).
  SG.writeKeys = function(roomRef, state, keys){
    const upd = {expireAt: SG.expireTs()};
    keys.forEach(k=>{ upd[k] = state[k]===undefined ? null : state[k]; });
    return roomRef.update(upd).catch(err=>console.error('sync failed', err));
  };
  // Write every top-level key of `state` except the ones listed (used by games that keep their whole
  // state in one object): chat and seats are always left to their own safe writers.
  SG.writeState = function(roomRef, state, exclude){
    const upd = {expireAt: SG.expireTs()};
    Object.keys(state).forEach(k=>{
      if(k==='expireAt' || (exclude||[]).indexOf(k)!==-1) return;
      upd[k] = state[k]===undefined ? null : state[k];
    });
    return roomRef.update(upd).catch(err=>console.error('sync failed', err));
  };
  // Atomic read-modify-write. fn(s) mutates the fresh copy; return truthy to abort (value is returned).
  SG.mutateRoom = async function(roomRef, keys, fn){
    let result;
    try{
      await SG.db.runTransaction(async tx=>{
        result = undefined;
        const snap = await tx.get(roomRef);
        if(!snap.exists) return;
        const s = snap.data();
        const res = fn(s);
        if(res){ result = res; return; }
        const upd = {expireAt: SG.expireTs()};
        keys.forEach(k=>{ upd[k] = s[k]===undefined ? null : s[k]; });
        tx.update(roomRef, upd);
      });
    }catch(err){
      console.error('room update failed', err);
      return 'Could not reach the room — check your connection and try again.';
    }
    return result;
  };

  // ---------- turn timer (per-turn seconds) ----------
  SG.TIMER_PRESETS = [0, 10, 15, 20, 30, 45, 60];
  SG.renderTimerPicker = function(container, onPick, currentValue, labelText){
    container.innerHTML = '';
    const label = document.createElement('p');
    label.style.cssText = 'font-size:13px;color:var(--paper-dim);margin:0 0 6px;';
    label.textContent = labelText || 'Turn timer (per turn):';
    container.appendChild(label);
    const row = document.createElement('div');
    row.className = 'timer-preset-row';
    SG.TIMER_PRESETS.forEach(secs=>{
      const btn = document.createElement('button');
      btn.className = 'timer-preset-btn' + (currentValue===secs ? ' chosen' : '');
      btn.textContent = secs===0 ? 'Off' : secs+'s';
      btn.addEventListener('click', ()=> onPick(secs));
      row.appendChild(btn);
    });
    container.appendChild(row);
  };
  SG.deadlineFor = function(seconds){ return seconds>0 ? Date.now() + seconds*1000 : null; };
  // Fills the little countdown pill (#turnTimer). Returns seconds left or null.
  SG.renderTurnTimer = function(el, deadline, active){
    if(!el) return null;
    if(!deadline || !active){ el.classList.add('hidden'); return null; }
    const secs = Math.ceil(Math.max(0, deadline - Date.now())/1000);
    el.textContent = secs + 's';
    el.classList.remove('hidden');
    el.classList.toggle('low', secs<=5);
    return secs;
  };
  // 200ms ticker. tick() is called while running; the game decides what to do (timeout, repaint).
  SG.createTicker = function(tick){
    let h = null;
    return {
      start(){ if(!h) h = setInterval(tick, 200); },
      stop(){ if(h){ clearInterval(h); h = null; } }
    };
  };

  // ---------- invite link ----------
  SG.copyInviteLink = function(btn){
    navigator.clipboard.writeText(location.href).then(()=>{
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(()=>btn.textContent = old, 1500);
    }).catch(()=>{ alert(location.href); });
  };

  // ---------- chat widget ----------
  // opts: {getState, getRoomRef, isOnline, deviceId, mySeatName():string|null (null = not seated),
  //        canChat():bool, renderMessage(m)->html|undefined, preview(m)->{who,text}|undefined,
  //        onLogClick(e), getMessages() (override the list shown, e.g. chat + game feed), maxMessages}
  const CHAT_HTML = `
<button class="chat-fab hidden" id="chatFab" aria-label="Open chat">💬<span class="chat-badge hidden" id="chatBadge">0</span></button>
<div class="chat-panel hidden" id="chatPanel">
  <div class="chat-panel-header"><span>Chat</span><button class="chat-close" id="chatCloseBtn">✕</button></div>
  <div class="chat-log" id="chatLog"></div>
  <div class="gif-picker hidden" id="gifPicker">
    <div class="gif-picker-search"><input type="text" id="gifSearchInput" placeholder="Search GIFs…"><button class="secondary" id="gifBackBtn">✕</button></div>
    <div class="gif-grid" id="gifGrid"></div>
  </div>
  <div class="chat-input-row">
    <button class="secondary" id="gifBtn" title="Send a GIF">GIF</button>
    <input type="text" id="chatInput" placeholder="Say something…" maxlength="200">
    <button id="chatSendBtn">Send</button>
  </div>
</div>
<div class="chat-toast hidden" id="chatToast"><span class="who" id="chatToastWho"></span><span id="chatToastText"></span></div>`;

  SG.createChat = function(o){
    if(!document.getElementById('chatFab')){
      const wrap = document.createElement('div');
      wrap.innerHTML = CHAT_HTML;
      while(wrap.firstChild) document.body.appendChild(wrap.firstChild);
    }
    const $ = id=>document.getElementById(id);
    const esc = SG.escapeHtml;
    const gifOn = typeof GIPHY_API_KEY!=='undefined' && GIPHY_API_KEY && GIPHY_API_KEY!=='YOUR_GIPHY_KEY';
    if(!gifOn) $('gifBtn').classList.add('hidden');
    let open = false, lastSeen = 0, toastTimer = null;

    function msgs(){ if(o.getMessages) return o.getMessages() || []; const s = o.getState(); return (s && s.chat) ? s.chat : []; }
    function defaultHtml(m){
      if(m.type==='move') return `<div class="chat-msg move${m.win?' win':''}">${esc(m.text)}</div>`;
      const mine = m.from===o.deviceId;
      const body = m.type==='gif' ? `<img class="chat-gif" src="${esc(m.gifUrl)}" alt="gif">` : esc(m.text);
      return `<div class="chat-msg${mine?' me':''}"><span class="who">${esc(m.name||'?')}:</span>${body}</div>`;
    }
    function previewOf(m){
      const p = o.preview && o.preview(m);
      if(p) return p;
      if(m.type==='move') return {who:'', text:m.text};
      return {who: m.name||'?', text: m.type==='gif' ? 'sent a GIF' : m.text};
    }
    function renderLog(){
      const el = $('chatLog');
      el.innerHTML = msgs().map(m=>{
        const h = o.renderMessage && o.renderMessage(m);
        return h!==undefined && h!==null ? h : defaultHtml(m);
      }).join('');
      el.scrollTop = el.scrollHeight;
    }
    function closeGif(){ $('gifPicker').classList.add('hidden'); $('chatLog').classList.remove('hidden'); }
    function toggle(force){
      open = (force!==undefined) ? force : !open;
      $('chatPanel').classList.toggle('hidden', !open);
      closeGif();
      if(open){
        lastSeen = msgs().length;
        $('chatToast').classList.add('hidden');
        $('chatBadge').classList.add('hidden');
        renderLog();
        $('chatInput').focus();
      }
    }
    function render(){
      const s = o.getState(), ref = o.getRoomRef();
      const inRoom = o.isOnline() && !!s && !!ref;
      $('chatFab').classList.toggle('hidden', !inRoom);
      if(!inRoom){
        $('chatPanel').classList.add('hidden');
        $('chatToast').classList.add('hidden');
        open = false;
        return;
      }
      const can = o.canChat();
      $('chatSendBtn').disabled = !can;
      $('gifBtn').disabled = !can;
      const input = $('chatInput');
      input.disabled = !can;
      input.placeholder = can ? 'Say something…' : 'Take a seat to chat';
      const list = msgs();
      if(open){ renderLog(); lastSeen = list.length; return; }
      const unseen = list.length - lastSeen;
      if(unseen>0){
        const badge = $('chatBadge');
        badge.textContent = unseen>9 ? '9+' : String(unseen);
        badge.classList.remove('hidden');
        const newest = list[list.length-1];
        if(newest && newest.from!==o.deviceId){
          const p = previewOf(newest);
          $('chatToastWho').textContent = p.who ? p.who+':' : '';
          $('chatToastText').textContent = p.text;
          $('chatToast').classList.remove('hidden');
          if(toastTimer) clearTimeout(toastTimer);
          toastTimer = setTimeout(()=> $('chatToast').classList.add('hidden'), 5000);
        }
      } else $('chatBadge').classList.add('hidden');
    }
    // A brief message in the toast slot (also used by games for "can't do that" hints).
    function flash(msg, ms){
      $('chatToastWho').textContent = '';
      $('chatToastText').textContent = msg;
      $('chatToast').classList.remove('hidden');
      if(toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(()=> $('chatToast').classList.add('hidden'), ms||2500);
    }
    function sendMessage(extra){
      const ref = o.getRoomRef();
      if(!extra || !o.getState() || !o.isOnline() || !ref) return;
      const name = o.mySeatName() || 'Spectator';
      // arrayUnion: appends without ever overwriting other players' messages or moves
      ref.update({
        chat: firebase.firestore.FieldValue.arrayUnion(Object.assign({from:o.deviceId, name, ts:Date.now()}, extra)),
        expireAt: SG.expireTs()
      }).catch(err=>console.error('chat failed', err));
    }
    function send(text){
      text = (text||'').trim().slice(0,200);
      if(text) sendMessage({type:'text', text});
    }

    // ----- GIF picker (GIPHY) -----
    async function gifSearch(query){
      const grid = $('gifGrid');
      grid.innerHTML = '<div class="gif-loading">Loading…</div>';
      try{
        const url = query
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=16&rating=pg-13`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=16&rating=pg-13`;   // empty search = what's trending
        const res = await fetch(url); const data = await res.json();
        if(data.meta && data.meta.status !== 200){ grid.innerHTML = `<div class="gif-loading">GIPHY error: ${esc(data.meta.msg||'unknown')}</div>`; return; }
        if(!res.ok){ grid.innerHTML = `<div class="gif-loading">Request failed (HTTP ${res.status}).</div>`; return; }
        const items = data.data || [];
        if(!items.length){ grid.innerHTML = '<div class="gif-loading">No results.</div>'; return; }
        grid.innerHTML = '';
        items.forEach(g=>{
          const img = document.createElement('img');
          img.src = g.images.fixed_height_small.url; img.loading = 'lazy'; img.alt = g.title || 'gif';
          img.addEventListener('click', ()=>{ sendMessage({type:'gif', gifUrl:g.images.fixed_height.url}); closeGif(); });
          grid.appendChild(img);
        });
      }catch(err){ grid.innerHTML = `<div class="gif-loading">Couldn't load GIFs — ${esc(err.message||'network error')}.</div>`; }
    }
    let gifDebounce = null;
    $('gifBtn').addEventListener('click', ()=>{
      $('chatLog').classList.add('hidden'); $('gifPicker').classList.remove('hidden');
      const i = $('gifSearchInput'); i.value = ''; i.focus(); gifSearch('');
    });
    $('gifBackBtn').addEventListener('click', closeGif);
    $('gifSearchInput').addEventListener('input', e=>{
      clearTimeout(gifDebounce); gifDebounce = setTimeout(()=>gifSearch(e.target.value.trim()), 350);
    });

    // ----- wiring -----
    $('chatFab').addEventListener('click', ()=> toggle());
    $('chatCloseBtn').addEventListener('click', ()=> toggle(false));
    $('chatToast').addEventListener('click', ()=> toggle(true));
    $('chatSendBtn').addEventListener('click', ()=>{ const i=$('chatInput'); send(i.value); i.value=''; });
    $('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ const i=$('chatInput'); send(i.value); i.value=''; } });
    if(o.onLogClick) $('chatLog').addEventListener('click', o.onLogClick);

    return {render, toggle, send, sendMessage, flash, isOpen: ()=>open};
  };

  // ---------- "All games" link in every game header ----------
  SG.addHubLink = function(){
    const h = document.querySelector('header');
    if(!h || h.querySelector('.sg-hub')) return;
    const a = document.createElement('a');
    a.className = 'sg-hub'; a.href = '../../'; a.title = 'Back to all games';
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>All games';
    const box = h.querySelector('div') || h;
    box.insertBefore(a, box.firstChild);
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', SG.addHubLink);
  else SG.addHubLink();

  // =====================================================================
  // PLAYER COLOURS
  // Every seat has a colour. It is stored in the room as seatColors[] (one entry per seat),
  // chosen by the player sitting there. A game keeps its PLAYER_COLORS array and calls
  // colorizer.apply(state.seatColors) on every render, so all existing code that reads
  // PLAYER_COLORS[i] automatically gets the chosen colour.
  // =====================================================================
  SG.PALETTE = ['#F0614F','#FF8A3D','#F5B342','#C9E24D','#3FD9A0','#46D2F0','#5DADE2','#7B86FF','#B98CE0','#E077B0','#F4F2FF','#8A93A8'];
  SG.getPrefColor = function(){ try{ return localStorage.getItem('sg_color') || ''; }catch(e){ return ''; } };
  SG.setPrefColor = function(c){ try{ localStorage.setItem('sg_color', c); }catch(e){} };
  SG.colorizer = function(arr){
    const defaults = arr.slice();
    return {
      defaults,
      apply(sc){ for(let i=0;i<arr.length;i++) arr[i] = (sc && sc[i]) || defaults[i]; }
    };
  };
  // Pick a colour for a player who is sitting down: their remembered favourite, else the seat's
  // default, else the first free colour. Mutates s.seatColors.
  SG.assignSeatColor = function(s, idx, defaults){
    const sc = s.seatColors = Array.isArray(s.seatColors) ? s.seatColors : [];
    while(sc.length < defaults.length) sc.push(null);
    const used = sc.filter((c,i)=> c && i!==idx);
    const pref = SG.getPrefColor();
    sc[idx] = (pref && used.indexOf(pref)===-1) ? pref
            : (used.indexOf(defaults[idx])===-1 ? defaults[idx]
            : (SG.PALETTE.find(c=>used.indexOf(c)===-1) || defaults[idx]));
  };
  // Change my seat's colour (transaction, refuses a colour somebody else already has).
  SG.setSeatColor = async function(roomRef, idx, hex, len){
    const me = SG.getDeviceId();
    const res = await SG.mutateRoom(roomRef, ['seatColors'], s=>{
      if(!s.seats || s.seats[idx]!==me) return true;
      const sc = s.seatColors = Array.isArray(s.seatColors) ? s.seatColors : [];
      while(sc.length < len) sc.push(null);
      if(sc.some((c,i)=> i!==idx && c===hex)) return 'Someone else already has that colour.';
      sc[idx] = hex;
    });
    if(typeof res==='string') alert(res);
    else SG.setPrefColor(hex);
  };
  // Small popover with the palette. opts: {used:[hex], current:hex, onPick(hex)}
  SG.openColorMenu = function(anchor, opts){
    SG.closeColorMenu();
    const m = document.createElement('div'); m.className = 'sg-colormenu'; m.id = 'sgColorMenu';
    m.innerHTML = '<div class="cm-title">Pick your colour</div><div class="cm-grid"></div>';
    const grid = m.querySelector('.cm-grid');
    SG.PALETTE.forEach(hex=>{
      const b = document.createElement('button'); b.type='button'; b.className = 'cm-sw'; b.style.background = hex; b.setAttribute('aria-label', hex);
      const taken = (opts.used||[]).indexOf(hex)!==-1 && hex!==opts.current;
      if(hex===opts.current) b.classList.add('on');
      if(taken){ b.disabled = true; b.classList.add('taken'); b.title = 'Taken'; }
      b.addEventListener('click', ()=>{ SG.closeColorMenu(); if(hex!==opts.current) opts.onPick(hex); });
      grid.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let y = r.bottom + 8; if(y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    m.style.left = x+'px'; m.style.top = y+'px';
    setTimeout(()=>{
      document.addEventListener('pointerdown', SG._cmOutside = (e)=>{ if(!m.contains(e.target) && e.target!==anchor) SG.closeColorMenu(); });
      document.addEventListener('keydown', SG._cmKey = (e)=>{ if(e.key==='Escape') SG.closeColorMenu(); });
    }, 0);
  };
  SG.closeColorMenu = function(){
    const m = document.getElementById('sgColorMenu'); if(m) m.remove();
    if(SG._cmOutside){ document.removeEventListener('pointerdown', SG._cmOutside); SG._cmOutside = null; }
    if(SG._cmKey){ document.removeEventListener('keydown', SG._cmKey); SG._cmKey = null; }
  };
  // Make a lobby chip clickable when it is my own seat. opts: {mine, current, used:[hex], onPick}
  SG.colorChip = function(chip, opts){
    chip.style.background = opts.current;
    chip.classList.toggle('pick', !!opts.mine);
    if(!opts.mine) return;
    chip.title = 'Change your colour'; chip.setAttribute('role','button'); chip.tabIndex = 0;
    const open = ()=> SG.openColorMenu(chip, opts);
    chip.addEventListener('click', open);
    chip.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } });
  };
  // Same-device games: a row of colour chips shown before the game starts. Chosen colours live in SG.localColors.
  SG.localColors = null;
  SG.getLocalColors = function(defaults, n){
    if(!SG.localColors) SG.localColors = defaults.slice();
    while(SG.localColors.length < defaults.length) SG.localColors.push(defaults[SG.localColors.length]);
    return SG.localColors.slice(0, n || defaults.length);
  };
  SG.renderLocalColors = function(container, defaults, n){
    if(!container) return;
    const cols = SG.getLocalColors(defaults, defaults.length);
    container.innerHTML = '<div class="lc-label">Player colours <span>(tap to change)</span></div><div class="lc-row"></div>';
    const row = container.querySelector('.lc-row');
    for(let i=0;i<(n||defaults.length);i++){
      const w = document.createElement('div'); w.className = 'lc-item';
      const chip = document.createElement('div'); chip.className = 'chip';
      w.appendChild(chip); const t = document.createElement('span'); t.textContent = 'P'+(i+1); w.appendChild(t);
      SG.colorChip(chip, {mine:true, current:cols[i],
        used: cols.filter((c,j)=>j!==i && j<(n||defaults.length)),
        onPick: hex=>{ SG.localColors[i] = hex; SG.setPrefColor(hex); SG.renderLocalColors(container, defaults, n); }});
      row.appendChild(w);
    }
  };

  // =====================================================================
  // SIDES: random order the first game, then everybody moves up one seat every rematch.
  // s needs seats[], seatNames[] (and optionally seatColors[]) and a seated player count n.
  // =====================================================================
  SG.assignSides = function(s, n){
    const games = s.gamesPlayed || 0;
    let perm = [];                                  // perm[newSeat] = oldSeat
    for(let i=0;i<n;i++) perm.push(i);
    if(games===0){
      for(let i=n-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    } else {
      perm = perm.map((_,j)=> (j - 1 + n) % n);
    }
    ['seats','seatNames','seatColors'].forEach(k=>{
      if(!Array.isArray(s[k])) return;
      const old = s[k].slice();
      for(let j=0;j<n;j++) s[k][j] = old[perm[j]] === undefined ? null : old[perm[j]];
    });
    s.gamesPlayed = games + 1;
  };

  // =====================================================================
  // CELEBRATION: fireworks + confetti on a full-screen canvas (auto-removes itself)
  // =====================================================================
  SG.celebrate = function(opts){
    opts = opts || {};
    if(document.getElementById('sgCelebrate')) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = (opts.colors && opts.colors.length) ? opts.colors : [];
    const cols = base.concat(['#F5B342','#FF7A45','#FFFFFF','#46D2F0','#B98CE0','#3FD9A0']);
    const cv = document.createElement('canvas'); cv.id = 'sgCelebrate';
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:200;pointer-events:none;';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    function size(){ cv.width = innerWidth*dpr; cv.height = innerHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
    size(); addEventListener('resize', size);
    const R = (a,b)=> a + Math.random()*(b-a), pick = a=> a[Math.floor(Math.random()*a.length)];
    const rockets = [], sparks = [], conf = [];
    const DURATION = reduce ? 1800 : (opts.duration || 6500);
    let t0 = performance.now(), last = t0, nextRocket = 0;
    function burst(x, y){
      const c1 = pick(cols), c2 = pick(cols), n = 70 + Math.floor(Math.random()*40);
      for(let i=0;i<n;i++){
        const a = Math.random()*Math.PI*2, sp = R(1.5, 6.2) * (Math.random()<.25 ? .55 : 1);
        sparks.push({x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:1, decay:R(.011,.02), c: i%3 ? c1 : c2, r:R(1.4,2.8)});
      }
    }
    function addConfetti(n, fromTop){
      for(let i=0;i<n;i++) conf.push({x:R(0,innerWidth), y: fromTop ? R(-innerHeight*.5,-10) : R(-20, innerHeight*.3), vx:R(-1.2,1.2), vy:R(1.6,4.2),
        w:R(6,12), h:R(4,8), rot:R(0,6.28), vr:R(-.2,.2), sway:R(0,6.28), sv:R(.03,.08), c:pick(cols)});
    }
    addConfetti(reduce ? 60 : 160, true);
    function frame(now){
      const dt = Math.min(2.2, (now-last)/16.67); last = now;
      const el = now - t0;
      ctx.clearRect(0,0,innerWidth,innerHeight);
      if(!reduce && el < DURATION-1800 && now >= nextRocket){
        rockets.push({x:R(innerWidth*.15, innerWidth*.85), y:innerHeight+10, ty:R(innerHeight*.12, innerHeight*.5), vy:-R(8,11), c:pick(cols)});
        nextRocket = now + R(260, 640);
        if(Math.random()<.4) addConfetti(14, true);
      }
      for(let i=rockets.length-1;i>=0;i--){
        const r = rockets[i]; r.y += r.vy*dt; r.vy *= .985;
        ctx.globalAlpha = 1; ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, 6.283); ctx.fill();
        ctx.globalAlpha = .35; ctx.fillRect(r.x-1, r.y, 2, 14);
        if(r.y <= r.ty || r.vy > -1.2){ burst(r.x, r.y); rockets.splice(i,1); }
      }
      for(let i=sparks.length-1;i>=0;i--){
        const p = sparks[i]; p.vx *= .985; p.vy = p.vy*.985 + .06*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= p.decay*dt;
        if(p.life <= 0){ sparks.splice(i,1); continue; }
        ctx.globalAlpha = Math.max(0,p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r*(.5+p.life*.5), 0, 6.283); ctx.fill();
      }
      for(let i=conf.length-1;i>=0;i--){
        const p = conf[i]; p.sway += p.sv*dt; p.x += (p.vx + Math.sin(p.sway)*1.1)*dt; p.y += p.vy*dt; p.rot += p.vr*dt;
        if(p.y > innerHeight+20){ conf.splice(i,1); continue; }
        ctx.save(); ctx.globalAlpha = el > DURATION-1200 ? Math.max(0, (DURATION-el)/1200) : 1;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.sway*2)); ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
      }
      ctx.globalAlpha = 1;
      if(el < DURATION || sparks.length || rockets.length){ if(el < DURATION+2500){ requestAnimationFrame(frame); return; } }
      removeEventListener('resize', size); cv.remove();
    }
    requestAnimationFrame(frame);
  };
  // Call from render(): fires once when `active` turns true, re-arms when it goes false.
  SG._celState = false;
  SG.celebrateOnce = function(active, opts){
    if(active && !SG._celState){ SG._celState = true; SG.celebrate(opts); }
    else if(!active) SG._celState = false;
  };
})();
