/* coop.js — the shared base for the cooperative games (Fire & Water, Sparkle, Lockdown, Blind Maze,
   Mindmeld, Outbreak). A game only describes its rules; this file brings everything around it:
   home screen, same-device play, online rooms and lobby, seats, sync, chat, reactions, game log,
   rematch, fireworks. Needs sg.js + sg-live.js (loaded by boot.js).

   Coop.register({
     id, title, tagline, accent, rooms,            // rooms = Firestore collection name
     min, max, options:[{key,label,choices:[[value,label],..],def}],
     init(n, opts) -> g                            // brand new game state (plain JSON)
     act(g, action, seat, n) -> error string|undefined   // mutates g; set g.over={win,text} to finish
     render(el, g, seat, send, ctx)                // draw the stage. send(action) performs an action
     status(g, seat) -> html                       // "what should I do" line
     role(g, i) -> text, myTurn(g, seat) -> bool, deadline(g) -> ms|null, hidden:true (pass-device cover),
     activeSeat(g) -> seat to hand the device to (same-device play), rules: html
   })
*/
(function(){
  var SG = window.SG, Coop = window.Coop = {};
  var $ = function(id){ return document.getElementById(id); }, esc = function(s){ return SG.escapeHtml(s); };
  var LS = function(k, v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(e){ return null; } };

  var css = document.createElement('style');
  css.textContent =
   '#coopRoot{width:100%; display:flex; justify-content:center;} .wrap{max-width:1040px;}'+
   '.cp-stage-col{flex:1 1 560px; max-width:620px; min-width:300px; display:flex; flex-direction:column; gap:14px;}'+
   '.cp-panel{flex:1 1 300px; max-width:340px;}'+
   '.cp-stage{padding:16px;} .cp-stage:empty{display:none;}'+
   '.cp-welcome{text-align:center; padding:34px 18px;} .cp-welcome .big{font-size:60px; line-height:1; margin-bottom:12px;}'+
   '.cp-welcome p{color:var(--paper-dim); line-height:1.6; max-width:420px; margin:8px auto 0; font-size:14px;}'+
   '.cp-btns{display:flex; flex-direction:column; gap:10px; margin-top:6px;}'+
   '.cp-opt{display:flex; flex-direction:column; gap:6px; margin-top:12px;} .cp-opt label{font-size:12.5px; color:var(--paper-dim);}'+
   '.cp-opt .row{display:flex; gap:6px; flex-wrap:wrap;} .cp-opt .row button{padding:8px 11px; font-size:13px; flex:1 1 auto;}'+
   '.cp-status{font-size:14px; line-height:1.55; margin:0;} .cp-status b{color:var(--accent);}'+
   '.cp-clock{display:inline-block; font-family:"Space Grotesk",sans-serif; font-weight:700; padding:3px 10px; border-radius:999px; background:var(--inset); border:1px solid var(--hair); margin-left:8px; font-size:13px;}'+
   '.cp-clock.low{background:#d8453b; color:#fff; animation:cpPulse .8s infinite;} @keyframes cpPulse{50%{transform:scale(1.08);}}'+
   '.cp-switch{display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:12.5px; color:var(--paper-dim);}'+
   '.cp-switch button{padding:6px 11px; font-size:12.5px;}'+
   '.cp-players{display:flex; flex-direction:column; gap:7px;}'+
   '.cp-prow{display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:10px; background:var(--raise); border:1px solid var(--hair); font-size:13.5px;}'+
   '.cp-prow.me{border-color:var(--accent);} .cp-prow .meta{margin-left:auto; color:var(--paper-dim); font-size:12px; text-align:right;}'+
   '.cp-prow .dot{width:12px; height:12px; border-radius:50%; flex:0 0 auto;}'+
   '.cp-cover{position:absolute; inset:0; z-index:5; border-radius:inherit; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; background:rgba(6,8,15,.96); text-align:center; padding:20px;}'+
   '.cp-toast{position:fixed; left:50%; top:16px; transform:translateX(-50%); z-index:120; background:rgba(14,21,39,.96); border:1px solid var(--danger); color:#fff; padding:10px 16px; border-radius:12px; font-size:13.5px; box-shadow:0 14px 40px -10px #000;}'+
   '.cp-log{max-height:200px;} .cp-over{text-align:center; padding:12px 6px;} .cp-over h3{font-family:"Space Grotesk",sans-serif; font-size:22px; margin:0 0 6px;}'+
   '.cp-over p{color:var(--paper-dim); margin:0 0 14px; font-size:14px;}'+
   '.cp-stage{position:relative;}';
  document.head.appendChild(css);

  Coop.register = function(def){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ boot(def); });
    else boot(def);
  };

  function boot(def){
    document.title = def.title;
    var root = $('coopRoot');
    var maxN = def.max || 4, minN = def.min || 2;
    root.innerHTML =
      '<div class="wrap"><header><div><h1>'+def.titleHtml+'</h1><p class="tagline">'+esc(def.tagline)+'</p></div><button class="secondary" id="cpNew">New game</button></header>'+
      '<main><div class="cp-stage-col"><div class="card cp-stage" id="cpStage"></div></div>'+
      '<div class="cp-panel"><div class="card" id="cpHome"></div>'+
      '<div class="card hidden" id="cpOnline"><h2>Play online</h2><div class="row-gap"><button id="cpCreate">Create a room</button>'+
        '<div class="inline-row"><input type="text" id="cpCode" placeholder="Room code" maxlength="6"><button class="secondary" id="cpJoin">Join</button></div></div>'+
        '<p id="cpNoFb" class="hidden" style="font-size:13px;color:var(--paper-dim);line-height:1.6;">Online play isn\'t set up in this copy yet (see FIREBASE_SETUP.md).</p>'+
        '<button class="secondary" id="cpBack1" style="margin-top:14px;">Back</button></div>'+
      '<div class="card hidden" id="cpLobby"><h2>Room lobby</h2><div class="room-code" id="cpRoomCode"></div>'+
        '<div class="inline-row" style="margin-bottom:12px;"><button class="secondary" id="cpCopy" style="flex:1;">Copy invite link</button></div>'+
        '<div class="row-gap" style="margin-top:0"><div class="inline-row"><input type="text" id="cpName" placeholder="Your name" maxlength="14"></div></div>'+
        '<div id="cpSeats" class="row-gap"></div><div id="cpOpts"></div>'+
        '<button id="cpStart" class="hidden" style="margin-top:12px;">Start game</button><p id="cpWait" class="hint-small" style="font-size:12px;color:var(--paper-dim);margin-top:10px;"></p></div>'+
      '<div class="card hidden" id="cpTurn"><h2>Now</h2><p class="cp-status" id="cpStatus"></p><div class="cp-switch hidden" id="cpSwitch"></div></div>'+
      '<div class="card hidden" id="cpPl"><h2>Team</h2><div class="cp-players" id="cpPlayers"></div></div>'+
      '<div class="card hidden" id="cpLogCard"><h2>Game log</h2><div class="log cp-log" id="cpLog"></div></div>'+
      '<div class="card"><details><summary>How to play</summary>'+def.rules+'</details></div></div></main></div>';

    var fbDb = SG.initFirestore();
    var dev = SG.getDeviceId();
    var mode = null, S = null, roomRef = null, roomCode = null, unsub = null, localSeat = 0, coverFor = -1, lastRound = -1, chat = null, clockFired = null;
    var onlinePanel = false, opts = {}; (def.options||[]).forEach(function(o){ opts[o.key] = o.def; });

    // ---------- helpers ----------
    function colorOf(i){ return (def.colors && def.colors[i]) || SG.PALETTE[[0,5,2,4,7,8][i % 6]]; }
    function mySeat(){
      if(mode==='local') return localSeat;
      if(mode==='online' && S && S.seats) return S.seats.indexOf(dev);
      return -1;
    }
    function nameOf(i){ return (S && S.names && S.names[i]) || ('Player '+(i+1)); }
    function toast(msg){
      var t = document.createElement('div'); t.className = 'cp-toast'; t.textContent = msg; document.body.appendChild(t);
      SG.sfx && SG.sfx.error && SG.sfx.error(); setTimeout(function(){ t.remove(); }, 2600);
    }
    function show(id, on){ $(id).classList.toggle('hidden', !on); }

    // ---------- starting ----------
    function newGameState(n, o, names, seats){
      return {phase:'playing', n:n, opts:o, names:names, seats:seats, g:def.init(n, o), round:(S&&S.round||0), chat:[], expireAt:null};
    }
    function startLocal(n){
      var names = [], seats = [];
      for(var i=0;i<n;i++){ names.push('Player '+(i+1)); seats.push('local'+i); }
      mode = 'local'; roomRef = null; S = newGameState(n, Object.assign({}, opts), names, seats);
      S.hostId = dev; S.log = []; localSeat = 0; coverFor = def.hidden ? 0 : -1; render();
    }
    function homeHtml(){
      var h = '<h2>Play</h2><div class="cp-btns">';
      if(minN<=1 || maxN>=1){
        var lo = Math.max(def.localMin||minN, 1), hi = def.localMax || maxN;
        for(var n=lo;n<=hi;n++) h += '<button data-local="'+n+'" class="'+(n===lo?'':'secondary')+'">'+(hi===lo ? 'Same device' : (n===1?'Solo':'Same device · '+n+' players'))+'</button>';
      }
      h += '<button class="secondary" id="cpGoOnline">Play online with friends</button></div>';
      (def.options||[]).forEach(function(o){
        h += '<div class="cp-opt"><label>'+esc(o.label)+'</label><div class="row">'+o.choices.map(function(c){
          return '<button type="button" class="'+(String(opts[o.key])===String(c[0])?'':'secondary')+'" data-opt="'+o.key+'" data-v="'+esc(c[0])+'">'+esc(c[1])+'</button>'; }).join('')+'</div></div>';
      });
      return h;
    }
    function bindHome(){
      var el = $('cpHome');
      el.innerHTML = homeHtml();
      el.querySelectorAll('[data-local]').forEach(function(b){ b.onclick = function(){ startLocal(+b.dataset.local); }; });
      el.querySelectorAll('[data-opt]').forEach(function(b){ b.onclick = function(){
        var o = def.options.filter(function(x){ return x.key===b.dataset.opt; })[0];
        opts[o.key] = (typeof o.def==='number') ? +b.dataset.v : b.dataset.v; bindHome();
      }; });
      $('cpGoOnline').onclick = function(){ onlinePanel = true; show('cpHome', false); show('cpOnline', true); $('cpNoFb').classList.toggle('hidden', !!fbDb); $('cpCreate').disabled = $('cpJoin').disabled = !fbDb; };
    }

    // ---------- online ----------
    function emptySeats(){ var a=[]; for(var i=0;i<maxN;i++) a.push(null); return a; }
    function createRoom(){
      if(!fbDb) return;
      SG.sweepOldRooms(def.rooms);
      roomCode = SG.genRoomCode(); roomRef = fbDb.collection(def.rooms).doc(roomCode); mode = 'online';
      var doc = {phase:'lobby', seats:emptySeats(), names:emptySeats(), hostId:dev, opts:Object.assign({}, opts), round:0, chat:[], log:[], g:null, expireAt:SG.expireTs()};
      roomRef.set(doc).then(function(){ subscribe(); setUrl(); });
    }
    function setUrl(){ try{ var u = new URL(location.href); u.searchParams.set('room', roomCode); history.replaceState(null,'',u.toString()); }catch(e){} }
    function joinRoom(code){
      if(!fbDb || !code) return;
      roomCode = code.trim().toUpperCase(); roomRef = fbDb.collection(def.rooms).doc(roomCode); mode = 'online';
      roomRef.get().then(function(snap){
        if(!snap.exists){ alert('No room with that code. Check it and try again.'); roomRef = null; roomCode = null; mode = null; render(); return; }
        setUrl(); subscribe();
      });
    }
    function subscribe(){
      if(unsub) unsub();
      unsub = roomRef.onSnapshot(function(snap){
        if(!snap.exists) return;
        S = snap.data(); S.chat = S.chat || []; S.log = S.log || [];
        if(S.g && S.g.log) S.log = S.g.log;
        render();
      }, function(err){ console.error('room listener', err); });
    }
    async function sitDown(i){
      var name = ($('cpName').value || '').trim().slice(0,14) || ('Player '+(i+1)); LS('sg_name', name);
      var err = await SG.mutateRoom(roomRef, ['seats','names'], function(s){
        if(s.phase!=='lobby') return 'The game already started.';
        if(s.seats[i] && s.seats[i]!==dev) return 'That seat was just taken.';
        var j = s.seats.indexOf(dev); if(j>=0){ s.seats[j] = null; s.names[j] = null; }
        s.seats[i] = dev; s.names[i] = name;
      });
      if(err) toast(err);
    }
    async function standUp(){
      await SG.mutateRoom(roomRef, ['seats','names'], function(s){ var j = s.seats.indexOf(dev); if(j>=0){ s.seats[j] = null; s.names[j] = null; } });
    }
    async function startOnline(){
      var err = await SG.mutateRoom(roomRef, ['phase','seats','names','n','g','opts','log','round'], function(s){
        if(s.hostId!==dev) return 'Only the host can start.';
        var ids = [], nm = [];
        s.seats.forEach(function(id,i){ if(id){ ids.push(id); nm.push(s.names[i] || ('Player '+(i+1))); } });
        if(ids.length<minN) return 'Need at least '+minN+' players.';
        s.seats = ids; s.names = nm; s.n = ids.length; s.phase = 'playing';
        s.g = def.init(ids.length, s.opts || {}); s.log = (s.g.log||[]);
      });
      if(err) toast(err);
    }
    async function backToLobby(){
      await SG.mutateRoom(roomRef, ['phase','seats','names','g','round','log'], function(s){
        var seats = s.seats.slice(), names = s.names.slice();
        while(seats.length<maxN){ seats.push(null); names.push(null); }
        s.seats = seats; s.names = names; s.phase = 'lobby'; s.g = null; s.round = (s.round||0)+1; s.log = [];
      });
    }

    // ---------- acting ----------
    var busy = false;
    function send(a){
      var seat = mySeat();
      if(seat<0){ toast(mode==='online' ? 'You are watching this game.' : 'No seat.'); return; }
      if(mode==='local'){
        var err = def.act(S.g, a, seat, S.n);
        if(err){ toast(err); return; }
        S.log = S.g.log || [];
        if(S.g.over) S.phase = 'over';
        if(def.hidden && def.activeSeat && !S.g.over){ var nx = def.activeSeat(S.g); if(nx!==undefined && nx!==null && nx!==localSeat){ localSeat = nx; coverFor = nx; } }
        render(); return;
      }
      // online: apply optimistically for responsiveness, then commit atomically
      SG.mutateRoom(roomRef, ['g','phase'], function(s){
        if(s.phase!=='playing') return 'The game is over.';
        var e = def.act(s.g, a, s.seats.indexOf(dev), s.n);
        if(e) return e;
        if(s.g.over) s.phase = 'over';
      }).then(function(e){ if(e) toast(e); });
    }

    // ---------- rendering ----------
    function renderLobby(){
      var me = S.seats.indexOf(dev), host = S.hostId===dev;
      if(!$('cpName').value) $('cpName').value = LS('sg_name') || '';
      $('cpRoomCode').textContent = roomCode;
      var h = '';
      S.seats.forEach(function(id,i){
        var mine = id===dev;
        h += '<div class="seat-row"><span class="chip" style="background:'+colorOf(i)+'"></span><span>'+(id ? esc(S.names[i]||('Player '+(i+1))) : '<i style="opacity:.6">Open seat</i>')+'</span>'+
          (mine ? '<span class="you">you</span><button class="secondary" data-stand style="margin-left:auto;padding:5px 10px;font-size:12px">Leave</button>' :
           (!id ? '<button class="secondary" data-sit="'+i+'" style="margin-left:auto;padding:5px 10px;font-size:12px">Join</button>' : '')) + '</div>';
      });
      $('cpSeats').innerHTML = h;
      $('cpSeats').querySelectorAll('[data-sit]').forEach(function(b){ b.onclick = function(){ sitDown(+b.dataset.sit); }; });
      var st = $('cpSeats').querySelector('[data-stand]'); if(st) st.onclick = standUp;
      var oh = '';
      if(host) (def.options||[]).forEach(function(o){
        var cur = S.opts ? S.opts[o.key] : o.def;
        oh += '<div class="cp-opt"><label>'+esc(o.label)+'</label><div class="row">'+o.choices.map(function(c){
          return '<button type="button" class="'+(String(cur)===String(c[0])?'':'secondary')+'" data-lo="'+o.key+'" data-v="'+esc(c[0])+'">'+esc(c[1])+'</button>'; }).join('')+'</div></div>';
      });
      $('cpOpts').innerHTML = oh;
      $('cpOpts').querySelectorAll('[data-lo]').forEach(function(b){ b.onclick = function(){
        var o = def.options.filter(function(x){ return x.key===b.dataset.lo; })[0], v = (typeof o.def==='number') ? +b.dataset.v : b.dataset.v;
        var upd = {}; upd['opts.'+o.key] = v; roomRef.update(upd);
      }; });
      var seated = S.seats.filter(Boolean).length;
      show('cpStart', host); $('cpStart').disabled = seated<minN;
      $('cpWait').textContent = host ? (seated<minN ? 'Waiting for '+(minN-seated)+' more player'+(minN-seated>1?'s':'')+'… share the code or invite link.' : 'Ready when you are.') : 'Waiting for the host to start…';
    }
    function renderPlayers(g, seat){
      var h = '';
      for(var i=0;i<S.n;i++){
        var r = def.role ? def.role(g, i) : '';
        h += '<div class="cp-prow'+(i===seat?' me':'')+'"><span class="dot" style="background:'+colorOf(i)+'"></span><span>'+esc(nameOf(i))+(i===seat?' (you)':'')+'</span><span class="meta">'+(r||'')+'</span></div>';
      }
      $('cpPlayers').innerHTML = h;
    }
    function renderSwitch(){
      var el = $('cpSwitch');
      if(mode!=='local' || S.n<2 && !def.switchSolo){ el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.innerHTML = '<span>'+(def.switchLabel||'Playing as')+':</span>'+Array.apply(null,Array(S.n)).map(function(_,i){
        var label = def.seatLabel ? def.seatLabel(i) : nameOf(i);
        return '<button class="'+(i===localSeat?'':'secondary')+'" data-ls="'+i+'">'+esc(label)+'</button>'; }).join('');
      el.querySelectorAll('[data-ls]').forEach(function(b){ b.onclick = function(){ localSeat = +b.dataset.ls; coverFor = def.hidden ? localSeat : -1; render(); }; });
    }
    function render(){
      var started = !!S && (S.phase==='playing' || S.phase==='over');
      var inRoom = mode==='online' && !!S;
      show('cpHome', !mode && !onlinePanel); show('cpOnline', !mode && onlinePanel);
      show('cpLobby', inRoom && S.phase==='lobby');
      show('cpTurn', started); show('cpPl', started); show('cpLogCard', started);
      $('cpNew').textContent = mode ? 'Leave' : 'New game';
      if(inRoom && S.phase==='lobby') renderLobby();
      var stage = $('cpStage');
      var seat = mySeat();
      if(!started){
        if(!stage.querySelector('.cp-welcome')) stage.innerHTML = '<div class="cp-welcome"><div class="big">'+def.icon+'</div><h2 style="justify-content:center">'+esc(def.title)+'</h2><p>'+esc(def.pitch||def.tagline)+'</p></div>';
        if(inRoom && S.phase==='lobby') stage.innerHTML = '<div class="cp-welcome"><div class="big">'+def.icon+'</div><h2 style="justify-content:center">Waiting room</h2><p>Share the code <b>'+roomCode+'</b> with your team. '+(def.min>1?'You need at least '+minN+' players.':'')+'</p></div>';
      } else {
        var g = S.g;
        var sw = $('cpStage');
        var wrap = sw.querySelector('.cp-inner');
        if(!wrap || wrap.dataset.round!==String(S.round)+':'+mode){ sw.innerHTML = '<div class="cp-inner" data-round="'+S.round+':'+mode+'"></div>'; wrap = sw.querySelector('.cp-inner'); }
        wrap.dataset.round = S.round+':'+mode;
        var ctx = {n:S.n, names:S.names, seats:S.seats, mode:mode, colorOf:colorOf, nameOf:nameOf, spectator: seat<0, over:S.phase==='over', toast:toast, opts:S.opts||{}};
        def.render(wrap, g, seat, send, ctx);
        var cover = sw.querySelector('.cp-cover');
        if(cover) cover.remove();
        if(mode==='local' && def.hidden && coverFor===localSeat && !g.over){
          cover = document.createElement('div'); cover.className = 'cp-cover';
          cover.innerHTML = '<div style="font-size:42px">🙈</div><h2 style="justify-content:center;margin:0">Pass to '+esc(nameOf(localSeat))+'</h2><p style="color:var(--paper-dim);margin:0">Only they should look. Tap when ready.</p><button>I\'m '+esc(nameOf(localSeat))+'</button>';
          cover.querySelector('button').onclick = function(){ coverFor = -1; cover.remove(); };
          sw.appendChild(cover);
        }
        if(S.phase==='over'){
          var o = g.over || {};
          var ov = document.createElement('div'); ov.className = 'cp-over';
          var again = mode==='local' ? '<button id="cpAgain">Play again</button>' : (S.hostId===dev ? '<button id="cpAgain">Back to lobby</button>' : '<p style="margin:0">Waiting for the host to set up another game…</p>');
          ov.innerHTML = '<h3>'+(o.win ? '🎉 You did it!' : '💥 Not this time')+'</h3><p>'+esc(o.text||'')+'</p>'+again;
          wrap.appendChild(ov);
          var ab = ov.querySelector('#cpAgain');
          if(ab) ab.onclick = function(){ if(mode==='local'){ S.round++; S.g = def.init(S.n, S.opts); S.log = S.g.log||[]; S.phase = 'playing'; coverFor = -1; render(); } else backToLobby(); };
        }
        $('cpStatus').innerHTML = S.phase==='over' ? esc((g.over||{}).text||'Game over') : (def.status ? def.status(g, seat, ctx) : '') + '<span class="cp-clock hidden" id="cpClock"></span>';
        renderPlayers(g, seat); renderSwitch();
        var lg = (g.log || []).slice(-40).reverse();
        $('cpLog').innerHTML = lg.map(function(t){ return '<div>'+esc(t)+'</div>'; }).join('');
        SG.celebrateOnce(S.phase==='over' && !!(g.over && g.over.win));
        tickClock();
      }
      if(mode==='online'){
        if(!chat) chat = SG.createChat({getState:function(){ return S; }, getRoomRef:function(){ return roomRef; }, isOnline:function(){ return mode==='online'; },
          deviceId:dev, mySeatName:function(){ var i = mySeat(); return i>=0 ? nameOf(i) : null; }, canChat:function(){ return true; }});
        chat.render();
      }
      var g2 = S && S.g;
      SG.live({online: mode==='online' && !!roomRef, roomRef:roomRef, reaction:S && S.reaction, active:!!S && S.phase==='playing',
        spectator: mode==='online' && !!S && S.phase!=='lobby' && seat<0,
        myTurn: mode==='online' && !!g2 && S.phase==='playing' && seat>=0 && (def.myTurn ? !!def.myTurn(g2, seat) : false),
        result:{game:def.id, over: mode==='online' && seat>=0 && !!S && S.phase==='over', won: g2 && g2.over ? !!g2.over.win : null, key: roomCode+':'+(S?S.round:0)}});
    }
    var homeBound = false;
    function bindHomeOnce(){ if(!homeBound){ homeBound = true; bindHome(); } }

    // ---------- shared countdown ----------
    function tickClock(){
      var el = $('cpClock'); if(!el || !S || !S.g || !def.deadline || S.phase!=='playing') return;
      var d = def.deadline(S.g); if(!d){ el.classList.add('hidden'); return; }
      var left = Math.max(0, Math.ceil((d - Date.now())/1000));
      el.classList.remove('hidden'); el.textContent = '⏱ '+Math.floor(left/60)+':'+('0'+(left%60)).slice(-2); el.classList.toggle('low', left<=30);
      if(left===0 && clockFired!==d){ clockFired = d; var sd = mySeat(); if(sd>=0 || mode==='local'){ send({t:'timeout'}); } }
      SG.renderTurnTimer && SG.renderTurnTimer(document.createElement('div'), d, true);
    }
    setInterval(tickClock, 500);

    // ---------- wiring ----------
    $('cpCreate').onclick = createRoom;
    $('cpJoin').onclick = function(){ joinRoom($('cpCode').value); };
    $('cpBack1').onclick = function(){ onlinePanel = false; show('cpOnline', false); show('cpHome', true); };
    $('cpStart').onclick = startOnline;
    $('cpCopy').onclick = function(){ SG.copyInviteLink($('cpCopy')); };
    $('cpNew').onclick = function(){
      if(mode){ if(unsub){ unsub(); unsub = null; } mode = null; S = null; roomRef = null; roomCode = null; chat = null;
        try{ var u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null,'',u.toString()); }catch(e){}
        $('cpStage').innerHTML = ''; onlinePanel = false; bindHome(); show('cpLobby', false); show('cpTurn', false); show('cpPl', false); show('cpLogCard', false);
        $('cpNew').textContent = 'New game'; render();
      }
    };
    bindHome();
    var m = /[?&]room=([A-Za-z0-9]+)/.exec(location.search);
    if(m && fbDb) joinRoom(m[1]);
    else render();
    window.__coop = {refresh:render, send:send, state:function(){ return S; }, start:startLocal, seat:function(){ return mySeat(); }, setSeat:function(i){ localSeat = i; render(); }};
  }
})();
