/* Sparkle — a cooperative card game about building five fireworks in order (rules; pure). */
(function(root){
  var COLORS = [{n:'Ruby',h:'#F0614F',s:'●'},{n:'Amber',h:'#F5B342',s:'▲'},{n:'Jade',h:'#3FD9A0',s:'■'},{n:'Sapphire',h:'#5DADE2',s:'◆'},{n:'Pearl',h:'#ECEAF4',s:'★'}];
  var COUNTS = {1:3,2:2,3:2,4:2,5:1};
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function handSize(n){ return n<=3 ? 5 : 4; }
  function init(n){
    var deck = [];
    COLORS.forEach(function(c,ci){ for(var r=1;r<=5;r++) for(var k=0;k<COUNTS[r];k++) deck.push({c:ci, r:r}); });
    shuffle(deck);
    var g = {n:n, deck:deck, hands:[], know:[], played:[0,0,0,0,0], discard:[], clues:8, fuses:3, turn:0, endLeft:null, last:'', log:['A new show begins! Build all five fireworks from 1 to 5.']};
    for(var i=0;i<n;i++){ g.hands.push([]); g.know.push([]); }
    for(var h=0;h<handSize(n);h++) for(i=0;i<n;i++) draw(g, i);
    return g;
  }
  function draw(g, i){
    if(!g.deck.length) return;
    g.hands[i].push(g.deck.pop()); g.know[i].push({c:null, r:null, nc:[], nr:[]});
  }
  function score(g){ return g.played.reduce(function(a,b){ return a+b; }, 0); }
  function name(c){ return COLORS[c.c].n+' '+c.r; }
  function advance(g, nm){
    if(g.endLeft!==null){ g.endLeft--; if(g.endLeft<=0){ finish(g); return; } }
    else if(!g.deck.length) g.endLeft = g.n;
    g.turn = (g.turn+1) % g.n;
  }
  function finish(g){
    var s = score(g);
    var txt = s===25 ? 'A perfect show! All 25 points.' : 'Final score '+s+'/25 — '+(s>=24?'legendary.':s>=20?'the crowd goes wild.':s>=15?'excellent, the crowd loves it.':s>=10?'a respectable show.':'a few sparks in the sky.');
    g.over = {win: s>=15 || s===25, text: txt, score: s};
  }
  function act(g, a, seat, n){
    if(g.over) return 'The show is over.';
    if(seat!==g.turn) return 'Not your turn.';
    var who = seat, hand = g.hands[seat], nm = null;
    if(a.t==='play'){
      var c = hand[a.i]; if(!c) return 'No such card.';
      hand.splice(a.i,1); g.know[seat].splice(a.i,1);
      if(g.played[c.c]===c.r-1){
        g.played[c.c]++;
        g.log.push('Player '+(seat+1)+' played '+name(c)+' ✓');
        if(c.r===5 && g.clues<8){ g.clues++; g.log.push('A full firework! +1 clue.'); }
        g.last = 'P'+(seat+1)+' played '+name(c)+' ✓';
      } else {
        g.fuses--; g.discard.push(c);
        g.log.push('Player '+(seat+1)+' misfired '+name(c)+' 💥 ('+g.fuses+' fuses left)');
        g.last = 'P'+(seat+1)+' misfired '+name(c)+' 💥';
        if(g.fuses<=0){ g.over = {win:false, text:'The last fuse blew out. Final score '+score(g)+'/25.', score:score(g)}; return; }
      }
      draw(g, seat);
      if(score(g)===25){ finish(g); return; }
      advance(g);
    } else if(a.t==='discard'){
      if(g.clues>=8) return 'All clue tokens are already available — play or give a clue.';
      var d = hand[a.i]; if(!d) return 'No such card.';
      hand.splice(a.i,1); g.know[seat].splice(a.i,1); g.discard.push(d); g.clues++;
      g.log.push('Player '+(seat+1)+' discarded '+name(d)); g.last = 'P'+(seat+1)+' discarded '+name(d);
      draw(g, seat); advance(g);
    } else if(a.t==='clue'){
      if(g.clues<=0) return 'No clue tokens left — discard a card to get one back.';
      var t = a.to; if(t===seat || !g.hands[t]) return 'Pick a teammate.';
      var hit = 0, th = g.hands[t];
      th.forEach(function(card, i){
        var k = g.know[t][i], match = a.kind==='color' ? card.c===a.v : card.r===a.v;
        if(match){ hit++; if(a.kind==='color') k.c = a.v; else k.r = a.v; }
        else { if(a.kind==='color') { if(k.nc.indexOf(a.v)<0) k.nc.push(a.v); } else if(k.nr.indexOf(a.v)<0) k.nr.push(a.v); }
      });
      if(!hit) return 'A clue must point to at least one card.';
      g.clues--;
      var lab = a.kind==='color' ? COLORS[a.v].n : String(a.v);
      g.log.push('Player '+(seat+1)+' told Player '+(t+1)+': '+hit+' × '+lab); g.last = 'P'+(seat+1)+' → P'+(t+1)+': '+hit+' × '+lab;
      advance(g);
    } else return 'Unknown action.';
  }
  var API = {COLORS:COLORS, init:init, act:act, score:score, handSize:handSize};
  if(typeof module!=='undefined') module.exports = API; else root.SP = API;
})(this);
