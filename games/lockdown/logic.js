/* Lockdown — an escape room where nobody sees the whole puzzle (rules; pure). */
(function(root){
  var GLYPHS = ['☾','✦','☀','❖','♣','⚓','✿','☂','♞','⚑'];
  var COLORS = [{n:'red',h:'#F0614F'},{n:'blue',h:'#5DADE2'},{n:'green',h:'#3FD9A0'},{n:'yellow',h:'#F5B342'}];
  var TYPES = ['cipher','wires','simon','dials'];
  function shuffle(a){ a = a.slice(); for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  function ri(n){ return Math.floor(Math.random()*n); }

  function cipher(){
    var gl = shuffle(GLYPHS).slice(0,8), digs = shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0,8), map = {};
    gl.forEach(function(g,i){ map[g] = digs[i]; });
    var code = []; for(var i=0;i<4;i++) code.push(pick(gl));
    return {type:'cipher', title:'The Cipher Lock', blurb:'The lock shows symbols. The manual says which digit each symbol means.',
      front:{symbols:code}, manual:gl.map(function(g){ return g+'  =  '+map[g]; }), answer: code.map(function(g){ return map[g]; }).join('')};
  }
  function wires(){
    var led = pick(COLORS).n, ws = []; for(var i=0;i<5;i++) ws.push(pick(COLORS).n);
    var rules = {}, manual = [];
    COLORS.forEach(function(c){
      var conds = [{k:'reds', t:'two or more RED wires', f:function(w){ return w.filter(function(x){ return x==='red'; }).length>=2; }},
                   {k:'blues', t:'no BLUE wire', f:function(w){ return w.indexOf('blue')<0; }},
                   {k:'first', t:'the 1st wire is YELLOW', f:function(w){ return w[0]==='yellow'; }},
                   {k:'last', t:'the last wire is GREEN', f:function(w){ return w[4]==='green'; }}];
      var cd = pick(conds), a = 1+ri(5), b = 1+ri(5); while(b===a) b = 1+ri(5);
      rules[c.n] = {cond:cd, a:a, b:b};
      manual.push('LED '+c.n.toUpperCase()+': if there are '+cd.t+', cut wire #'+a+' (from the top) — otherwise cut wire #'+b+'.');
    });
    var r = rules[led], ans = r.cond.f(ws) ? r.a : r.b;
    Object.keys(rules).forEach(function(k){ delete rules[k].cond.f; });
    return {type:'wires', title:'The Wire Panel', blurb:'Cut exactly one wire. The manual decides which, based on the LED colour.',
      front:{led:led, wires:ws}, manual:manual, answer:String(ans)};
  }
  function simon(){
    var cols = COLORS.map(function(c){ return c.n; }), gl = shuffle(GLYPHS).slice(0,7), map = {};
    cols.forEach(function(c,i){ map[c] = gl[i]; });
    var seq = []; for(var i=0;i<4;i++) seq.push(pick(cols));
    var buttons = shuffle(gl.slice(0,6));
    return {type:'simon', title:'The Light Show', blurb:'Press the symbols that match the flashing colours, in order. The manual translates colours to symbols.',
      front:{seq:seq, buttons:buttons}, manual:cols.map(function(c){ return c.toUpperCase()+'  →  '+map[c]; }), answer: seq.map(function(c){ return map[c]; }).join('')};
  }
  function dials(){
    var d = [ri(10),ri(10),ri(10)], fn = [], manual = [], ans = '';
    d.forEach(function(v,i){ var k = 1+ri(4), c = ri(10); fn.push({k:k,c:c}); manual.push('Dial '+(i+1)+':  (dial × '+k+' + '+c+') and keep only the last digit'); ans += String((v*k+c)%10); });
    return {type:'dials', title:'The Safe', blurb:'Three dials show numbers. The manual says what to type for each one.', front:{dials:d}, manual:manual, answer:ans};
  }
  var MAKE = {cipher:cipher, wires:wires, simon:simon, dials:dials};
  function init(n, opts){
    opts = opts || {};
    var count = +opts.rooms || 4, order = shuffle(TYPES).slice(0, count);
    var secs = +opts.time || 720;
    var rooms = order.map(function(t){ return MAKE[t](); });
    return {n:n, room:0, rooms:rooms, deadline:Date.now()+secs*1000, strikes:0, log:['The door locks behind you. '+count+' rooms to go — the clock is ticking.']};
  }
  function operator(g, room){ return (room===undefined ? g.room : room) % g.n; }
  // which manual lines a given seat sees (pages are split between the non-operators)
  function pageFor(g, seat){
    var op = operator(g), r = g.rooms[g.room];
    if(seat===op) return null;
    var readers = []; for(var i=0;i<g.n;i++) if(i!==op) readers.push(i);
    var idx = readers.indexOf(seat), pages = readers.length;
    return r.manual.filter(function(_,j){ return j % pages === idx; });
  }
  function act(g, a, seat){
    if(g.over) return 'The game is over.';
    if(a.t==='timeout'){
      if(Date.now() < g.deadline-800) return 'Not yet.';
      g.over = {win:false, text:'Time ran out in room '+(g.room+1)+' of '+g.rooms.length+'.'}; return;
    }
    if(a.t==='submit'){
      if(seat!==operator(g)) return 'Only the operator can enter the answer.';
      var r = g.rooms[g.room];
      if(String(a.ans)===r.answer){
        g.log.push('✔ '+r.title+' cracked!'); g.room++;
        if(g.room>=g.rooms.length){ g.over = {win:true, text:'You escaped with '+Math.max(0,Math.ceil((g.deadline-Date.now())/1000))+'s to spare and '+g.strikes+' wrong attempt'+(g.strikes===1?'':'s')+'!'}; return; }
        g.log.push('Next: '+g.rooms[g.room].title);
      } else {
        g.strikes++; g.deadline -= 20000; g.log.push('✖ Wrong answer in '+r.title+' (−20 seconds).');
        return 'Wrong code! −20 seconds.';
      }
      return;
    }
    return 'Unknown action.';
  }
  var API = {GLYPHS:GLYPHS, COLORS:COLORS, init:init, act:act, operator:operator, pageFor:pageFor};
  if(typeof module!=='undefined') module.exports = API; else root.LD = API;
})(this);
