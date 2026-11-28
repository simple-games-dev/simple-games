/* Outbreak — a cooperative race to cure four diseases (rules; pure). */
(function(root){
  var DISEASES = [{n:'Crimson',h:'#F0614F'},{n:'Azure',h:'#5DADE2'},{n:'Amber',h:'#F5B342'},{n:'Violet',h:'#B98CE0'}];
  // name, disease, x, y
  var CITIES = [
    ['Aldor',1,10,20],['Brenn',1,28,12],['Cask',1,22,40],['Dunmere',1,44,28],
    ['Eskar',0,64,12],['Fenwick',0,82,22],['Garrow',0,70,42],['Hollis',0,92,46],
    ['Ilex',2,12,64],['Jorvik',2,32,76],['Kestrel',2,46,58],['Lund',2,18,90],
    ['Marrow',3,60,72],['Nesh',3,80,68],['Orin',3,90,88],['Pell',3,62,92]];
  var EDGES = [[0,1],[0,2],[1,3],[2,3],[1,4],[3,6],[3,10],[2,8],
    [4,5],[4,6],[5,6],[5,7],[6,7],[6,13],[7,13],
    [8,9],[8,11],[9,10],[9,11],[10,12],[8,10],
    [12,13],[12,15],[13,14],[14,15],[9,15],[12,6]];
  var ADJ = CITIES.map(function(){ return []; });
  EDGES.forEach(function(e){ ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
  var ROLES = [{id:'medic', n:'Medic', d:'Treat removes every cube of a colour. Cured diseases are treated for free where you stand.'},
               {id:'scientist', n:'Scientist', d:'Needs only 3 cards of a colour to find a cure.'},
               {id:'courier', n:'Courier', d:'Can hand any card to any teammate, wherever they are.'},
               {id:'scout', n:'Scout', d:'Walks up to 2 links for a single action.'}];
  var RATE = [2,2,2,3,3,4,4,4];
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function dist(a,b){ if(a===b) return 0; var seen = {}, q = [[a,0]]; seen[a] = 1; while(q.length){ var p = q.shift(); for(var i=0;i<ADJ[p[0]].length;i++){ var nb = ADJ[p[0]][i]; if(seen[nb]) continue; if(nb===b) return p[1]+1; seen[nb] = 1; q.push([nb,p[1]+1]); } } return 99; }

  function init(n, opts){
    opts = opts || {};
    var epis = +opts.epidemics || 4;
    var g = {n:n, roles:[], pos:[], hands:[], cubes:[], supply:[18,18,18,18], cured:[0,0,0,0], outbreaks:0, rate:0,
      pdeck:[], pdiscard:[], ideck:[], idiscard:[], turn:0, actions:4, phase:'actions', pending:false, log:['Four diseases are spreading. Find the cures!']};
    CITIES.forEach(function(){ g.cubes.push([0,0,0,0]); });
    var rl = shuffle(ROLES.map(function(r){ return r.id; }));
    for(var i=0;i<n;i++){ g.roles.push(rl[i]); g.pos.push(0); g.hands.push([]); }
    // infection deck + opening infections
    var inf = []; CITIES.forEach(function(c,i){ inf.push(i); }); shuffle(inf); g.ideck = inf;
    [3,3,3,2,2,2,1,1,1].forEach(function(amt){ var c = g.ideck.pop(); g.idiscard.push(c); for(var k=0;k<amt;k++){ g.cubes[c][CITIES[c][1]]++; g.supply[CITIES[c][1]]--; } });
    // player deck: two copies of each city; epidemics shuffled into equal piles
    var cards = []; CITIES.forEach(function(c,i){ cards.push(i); cards.push(i); }); shuffle(cards);
    var per = n===2 ? 4 : 3;
    for(i=0;i<n;i++) for(var k=0;k<per;k++) g.hands[i].push(cards.pop());
    g.hands.forEach(function(h){ h.sort(function(a,b){ return a-b; }); });
    var piles = [], size = Math.floor(cards.length/epis);
    for(i=0;i<epis;i++){ var pile = cards.splice(0, i===epis-1 ? cards.length : size); pile.push(-1); piles.push(shuffle(pile)); }
    g.pdeck = []; piles.reverse().forEach(function(p){ g.pdeck = g.pdeck.concat(p); });   // draw from the end
    return g;
  }
  function lose(g, why){ if(!g.over) g.over = {win:false, text:why}; }
  function addCube(g, city, color, chain){
    if(g.over) return;
    if(g.cubes[city][color]>=3){
      if(chain[city]) return; chain[city] = 1; g.outbreaks++;
      g.log.push('💥 Outbreak in '+CITIES[city][0]+'! ('+g.outbreaks+'/8)');
      if(g.outbreaks>=8){ lose(g, 'Eight outbreaks — the world is overwhelmed.'); return; }
      ADJ[city].forEach(function(nb){ addCube(g, nb, color, chain); });
    } else {
      if(g.supply[color]<=0){ lose(g, 'The '+DISEASES[color].n+' disease ran out of cubes — it has swallowed the map.'); return; }
      g.cubes[city][color]++; g.supply[color]--;
    }
  }
  function epidemic(g){
    g.rate = Math.min(g.rate+1, RATE.length-1);
    if(!g.ideck.length){ g.ideck = shuffle(g.idiscard); g.idiscard = []; }
    var c = g.ideck.shift(), col = CITIES[c][1];
    g.log.push('☣ EPIDEMIC in '+CITIES[c][0]+'!');
    if(g.cured[col]!==2){ for(var k=0;k<3 && !g.over;k++) addCube(g, c, col, {}); }
    g.idiscard.push(c); shuffle(g.idiscard); g.ideck = g.ideck.concat(g.idiscard); g.idiscard = [];
  }
  function infect(g){
    var n = RATE[g.rate];
    for(var i=0;i<n && !g.over;i++){
      if(!g.ideck.length){ g.ideck = shuffle(g.idiscard); g.idiscard = []; }
      var c = g.ideck.pop(), col = CITIES[c][1];
      g.idiscard.push(c);
      if(g.cured[col]===2) continue;
      addCube(g, c, col, {});
    }
  }
  function nextTurn(g){
    g.turn = (g.turn+1) % g.n; g.actions = 4; g.phase = 'actions';
    g.log.push('— '+'Player '+(g.turn+1)+'’s turn —');
  }
  function endActions(g){
    var s = g.turn;
    for(var i=0;i<2;i++){
      if(!g.pdeck.length){ lose(g, 'The player deck ran out — time is up.'); return; }
      var c = g.pdeck.pop();
      if(c===-1) epidemic(g); else g.hands[s].push(c);
      if(g.over) return;
    }
    g.hands[s].sort(function(a,b){ return a-b; });
    if(g.hands[s].length>7){ g.phase = 'discard'; g.pending = true; return; }
    infect(g); if(g.over) return; nextTurn(g);
  }
  function needFor(g, seat){ var base = g.n>=3 ? 3 : 4; return g.roles[seat]==='scientist' ? base-1 : base; }
  function spend(g){ g.actions--; if(g.actions<=0) endActions(g); }
  function hasCard(g, s, c){ return g.hands[s].indexOf(c)>=0; }
  function drop(g, s, c){ var i = g.hands[s].indexOf(c); if(i>=0){ g.hands[s].splice(i,1); g.pdiscard.push(c); } }
  function medicSweep(g){   // the Medic quietly cleans cured diseases from where they stand
    for(var s=0;s<g.n;s++) if(g.roles[s]==='medic'){ var p = g.pos[s]; for(var k=0;k<4;k++) if(g.cured[k] && g.cubes[p][k]){ g.supply[k] += g.cubes[p][k]; g.cubes[p][k] = 0; } }
  }
  function checkEradicate(g){ for(var k=0;k<4;k++){ if(g.cured[k]===1){ var left = 0; g.cubes.forEach(function(c){ left += c[k]; }); if(!left){ g.cured[k] = 2; g.log.push('✨ '+DISEASES[k].n+' is eradicated!'); } } } }
  function act(g, a, seat){
    if(g.over) return 'The game is over.';
    if(seat!==g.turn) return 'It is not your turn.';
    var p = g.pos[seat], me = g.roles[seat];
    if(g.phase==='discard'){
      if(a.t!=='discard' || !hasCard(g, seat, a.card)) return 'Discard a card first (hand limit 7).';
      drop(g, seat, a.card);
      if(g.hands[seat].length<=7){ g.pending = false; g.phase = 'actions'; infect(g); if(!g.over) nextTurn(g); }
      return;
    }
    if(a.t==='pass'){ g.log.push('Player '+(seat+1)+' ends the turn early.'); endActions(g); return; }
    if(a.t==='move'){
      var to = a.to, d = dist(p, to);
      if(to===p) return 'You are already there.';
      if(!(d===1 || (me==='scout' && d===2))) return 'You can only walk to a neighbouring city.';
      g.pos[seat] = to; g.log.push('P'+(seat+1)+' → '+CITIES[to][0]); medicSweep(g); checkEradicate(g); spend(g); return;
    }
    if(a.t==='direct'){
      if(!hasCard(g, seat, a.to) || a.to===p) return 'You need that city’s card.';
      drop(g, seat, a.to); g.pos[seat] = a.to; g.log.push('P'+(seat+1)+' flew to '+CITIES[a.to][0]); medicSweep(g); checkEradicate(g); spend(g); return;
    }
    if(a.t==='charter'){
      if(!hasCard(g, seat, p)) return 'You need the card of the city you are in.';
      if(a.to===p || !CITIES[a.to]) return 'Pick another city.';
      drop(g, seat, p); g.pos[seat] = a.to; g.log.push('P'+(seat+1)+' chartered a flight to '+CITIES[a.to][0]); medicSweep(g); checkEradicate(g); spend(g); return;
    }
    if(a.t==='treat'){
      var col = a.color!==undefined ? a.color : CITIES[p][1];
      var n = g.cubes[p][col]; if(!n) return 'Nothing to treat here.';
      var rem = (me==='medic' || g.cured[col]) ? n : 1;
      g.cubes[p][col] -= rem; g.supply[col] += rem;
      g.log.push('P'+(seat+1)+' treated '+DISEASES[col].n+' in '+CITIES[p][0]+' (−'+rem+')');
      checkEradicate(g); spend(g); return;
    }
    if(a.t==='share'){
      var other = a.with; if(other===seat || other<0 || other>=g.n) return 'Pick a teammate.';
      var giver = a.dir==='give' ? seat : other, taker = a.dir==='give' ? other : seat, card = a.card;
      if(!hasCard(g, giver, card)) return 'That card isn’t there.';
      var courier = g.roles[seat]==='courier' && a.dir==='give';
      if(!courier){
        if(g.pos[other]!==p) return 'You both need to be in the same city.';
        if(card!==p) return 'You can only share the card of the city you are standing in.';
      }
      g.hands[giver].splice(g.hands[giver].indexOf(card),1); g.hands[taker].push(card); g.hands[taker].sort(function(x,y){ return x-y; });
      g.log.push('P'+(giver+1)+' gave '+CITIES[card][0]+' to P'+(taker+1));
      if(g.hands[taker].length>7){   // the receiver must discard right away (lowest-value duplicate first)
        var h = g.hands[taker], di = 0; for(var i=0;i<h.length;i++){ if(h.indexOf(h[i])!==i){ di = i; break; } }
        g.pdiscard.push(h.splice(di,1)[0]);
      }
      spend(g); return;
    }
    if(a.t==='cure'){
      var need = needFor(g, seat), color = a.color;
      if(g.cured[color]) return 'Already cured.';
      var mine = g.hands[seat].filter(function(c){ return CITIES[c][1]===color; });
      if(mine.length<need) return 'You need '+need+' '+DISEASES[color].n+' cards.';
      if(a.cards && a.cards.length){ mine = a.cards.filter(function(c){ return hasCard(g, seat, c) && CITIES[c][1]===color; }); if(mine.length<need) return 'Pick '+need+' matching cards.'; }
      mine.slice(0, need).forEach(function(c){ drop(g, seat, c); });
      g.cured[color] = 1; g.log.push('🧪 '+DISEASES[color].n+' cure discovered!'); medicSweep(g); checkEradicate(g);
      if(g.cured.every(Boolean)){ g.over = {win:true, text:'All four diseases are cured with '+g.outbreaks+' outbreak'+(g.outbreaks===1?'':'s')+'. The world is saved!'}; return; }
      spend(g); return;
    }
    return 'Unknown action.';
  }
  var API = {needFor:needFor, DISEASES:DISEASES, CITIES:CITIES, EDGES:EDGES, ADJ:ADJ, ROLES:ROLES, RATE:RATE, init:init, act:act, dist:dist};
  if(typeof module!=='undefined') module.exports = API; else root.OB = API;
})(this);
