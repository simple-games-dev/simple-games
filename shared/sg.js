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
      grid.innerHTML = '<div class="gif-loading">Searching…</div>';
      try{
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query||'board game')}&limit=16&rating=pg-13`;
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
      const i = $('gifSearchInput'); i.value = o.gifDefault || 'board game'; i.focus(); gifSearch(i.value);
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
})();
