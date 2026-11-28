/* Mindmeld — play your cards in ascending order without talking (rules; pure). */
(function(root){
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  var MAX = {2:12, 3:10, 4:8, 5:7};
  function deal(g){
    var deck = []; for(var i=1;i<=100;i++) deck.push(i); shuffle(deck);
    g.hands = []; for(var s=0;s<g.n;s++){ g.hands.push(deck.splice(0, g.level).sort(function(a,b){ return a-b; })); }
    g.played = []; g.phase = 'ready'; g.ready = []; g.starVotes = []; for(var k=0;k<g.n;k++){ g.ready.push(false); g.starVotes.push(false); }
    g.startAt = 0;
  }
  function init(n, opts){
    var lives = n===2 ? 2 : n===3 ? 3 : n===4 ? 4 : 5;
    var g = {n:n, level:1, maxLevel:MAX[n]||8, lives:lives, stars:1, hands:[], played:[], phase:'ready', ready:[], starVotes:[], startAt:0, last:null, log:['Level 1 — one card each. Say nothing, feel the rhythm.']};
    deal(g); return g;
  }
  function empty(g){ return g.hands.every(function(h){ return !h.length; }); }
  function clear(g){
    g.log.push('✔ Level '+g.level+' cleared!');
    var reward = '';
    if(g.level===2 || g.level===5 || g.level===8){ g.lives++; reward = ' +1 ❤'; }
    if(g.level===3 || g.level===6 || g.level===9){ g.stars++; reward = ' +1 ⭐'; }
    if(reward) g.log.push('Reward:'+reward);
    if(g.level>=g.maxLevel){ g.over = {win:true, text:'All '+g.maxLevel+' levels done — your minds are one!'}; return; }
    g.level++; deal(g);
    g.log.push('Level '+g.level+' — '+g.level+' cards each.');
  }
  function purge(g, below){   // everybody drops the cards smaller than `below`; returns the dropped cards
    var dropped = [];
    g.hands.forEach(function(h, s){ while(h.length && h[0] < below){ dropped.push({c:h.shift(), by:s}); } });
    return dropped;
  }
  function act(g, a, seat){
    if(g.over) return 'The game is over.';
    if(a.t==='ready'){
      if(g.phase!=='ready') return 'Already started.';
      g.ready[seat] = true;
      if(g.ready.every(Boolean)){ g.phase = 'play'; g.startAt = Date.now()+2500; g.log.push('…go.'); }
      return;
    }
    if(g.phase!=='play') return 'Wait until everyone is ready.';
    if(a.t==='play'){
      if(Date.now() < g.startAt-300) return 'Wait for the countdown.';
      var h = g.hands[seat]; if(!h.length) return 'You have no cards left.';
      var card = h.shift(); g.played.push({c:card, by:seat}); g.last = {c:card, by:seat};
      var dropped = purge(g, card);
      if(dropped.length){
        g.lives--; g.log.push('💥 '+card+' came too late: '+dropped.map(function(d){ return d.c+' (P'+(d.by+1)+')'; }).join(', ')+' were smaller. −1 ❤');
        g.last = {c:card, by:seat, miss:dropped};
        if(g.lives<=0){ g.over = {win:false, text:'Out of lives on level '+g.level+'.'}; return; }
      }
      if(empty(g)) clear(g);
      return;
    }
    if(a.t==='star'){
      if(g.stars<=0) return 'No stars left.';
      g.starVotes[seat] = !g.starVotes[seat];
      if(g.starVotes.every(Boolean)){
        g.stars--; var out = [];
        g.hands.forEach(function(hh, s){ if(hh.length) out.push(hh.shift()+' (P'+(s+1)+')'); });
        g.starVotes = g.starVotes.map(function(){ return false; });
        g.log.push('⭐ Star used — everyone discarded their lowest: '+out.join(', ')+'.');
        var top = 0; // the dropped cards also count as played for ordering
        g.last = {star:true};
        if(empty(g)) clear(g);
      }
      return;
    }
    return 'Unknown action.';
  }
  var API = {init:init, act:act};
  if(typeof module!=='undefined') module.exports = API; else root.MM = API;
})(this);
