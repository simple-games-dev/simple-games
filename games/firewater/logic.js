/* Fire & Water — rules (pure; used by the page and by the node solver test) */
(function(root){
  var LEVELS = [
    {name:'First steps', tip:'Fire and Water walk side by side. Reach your own doors.', map:[
      '#############',
      '#F.........f#',
      '#...~...^...#',
      '#...~...^...#',
      '#W.........w#',
      '#############']},
    {name:'Gems & pools', tip:'Water puts out Fire; lava burns Water. Collect your own gems if you like.', map:[
      '#############',
      '#F....#...r.#',
      '#...........#',
      '#..~~~^^^...#',
      '#.....#....f#',
      '#W..b.#....w#',
      '#############']},
    {name:'Hold the door', tip:'Stand on a button to open the matching door. Take turns holding it.', map:[
      '#############',
      '#F.....#...f#',
      '#W..1..A....#',
      '#......#....#',
      '#......#.1..#',
      '#......#...w#',
      '#############']},
    {name:'Swap places', tip:'Each button is guarded by a hazard only one of you can cross.', map:[
      '###############',
      '#F....#.......#',
      '#..^^1#..A....#',
      '#.....#.......#',
      '#W....A..2~~..#',
      '#.....#.......#',
      '#f....#......w#',
      '###############']},
    {name:'Two keys', tip:'Every door needs someone standing on a button. Leapfrog through!', map:[
      '###############',
      '#F...#.....#.f#',
      '#..1.A.....B..#',
      '#....#.1.2.#..#',
      '#W...#.....#.2#',
      '#....#..~~.#.w#',
      '###############']},
    {name:'The long way round', tip:'Goo hurts everybody. Think before you step.', map:[
      '#################',
      '#F...#.....#...f#',
      '#..1.A..^^.B....#',
      '#....#.1xx2#....#',
      '#W...#..~~.#..2.#',
      '#....#.....#...w#',
      '#################']}
  ];
  var DIRS = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]};
  function parse(i){
    var m = LEVELS[i].map, g = {w:m[0].length, h:m.length, cells:[], fire:null, water:null, gems:[]};
    m.forEach(function(row,y){ g.cells.push(row.split('')); });
    for(var y=0;y<g.h;y++) for(var x=0;x<g.w;x++){
      var c = g.cells[y][x];
      if(c==='F'){ g.fire = [x,y]; g.cells[y][x] = '.'; }
      else if(c==='W'){ g.water = [x,y]; g.cells[y][x] = '.'; }
      else if(c==='r' || c==='b'){ g.gems.push([x,y,c]); g.cells[y][x] = '.'; }
    }
    return g;
  }
  var CACHE = {};
  function level(i){ return CACHE[i] || (CACHE[i] = parse(i)); }
  function tile(L, x, y){ return (x<0||y<0||x>=L.w||y>=L.h) ? '#' : L.cells[y][x]; }
  // buttons currently held (digit chars) given both positions
  function pressed(L, f, w){
    var set = {};
    [f,w].forEach(function(p){ var c = tile(L,p[0],p[1]); if(c>='1' && c<='9') set[c] = true; });
    return set;
  }
  function doorOpen(c, pr){ return !!pr[String(c.charCodeAt(0)-64)]; }   // A->1, B->2, C->3
  function blocked(L, x, y, f, w){
    var c = tile(L,x,y);
    if(c==='#') return true;
    if(c>='A' && c<='C') return !doorOpen(c, pressed(L, f, w));
    return false;
  }
  function deadly(c, who){
    if(c==='x') return true;
    if(c==='~') return who==='fire';
    if(c==='^') return who==='water';
    return false;
  }
  function init(levelIdx, score){
    var L = level(levelIdx);
    return {level:levelIdx, fire:L.fire.slice(), water:L.water.slice(), got:[], score:score||0, deaths:0, moves:0, log:['Level '+(levelIdx+1)+': '+LEVELS[levelIdx].name], done:false};
  }
  // returns error string or undefined; mutates g
  function move(g, who, dir){
    if(g.done) return 'The game is over.';
    var L = level(g.level), d = DIRS[dir]; if(!d) return 'Bad move.';
    var me = g[who], other = g[who==='fire'?'water':'fire'];
    var nx = me[0]+d[0], ny = me[1]+d[1];
    var f = who==='fire' ? me : other, w = who==='water' ? me : other;
    if(blocked(L, nx, ny, f, w)) return 'Blocked.';
    if(nx===other[0] && ny===other[1]) return 'Your partner is there.';
    g[who] = [nx, ny]; g.moves++;
    var c = tile(L, nx, ny);
    if(deadly(c, who)){
      g.deaths++; g.log.push((who==='fire'?'🔥 Fire':'💧 Water')+' fell into '+(c==='x'?'goo':c==='~'?'water':'lava')+' — level restarted.');
      var fresh = init(g.level, g.score); g.fire = fresh.fire; g.water = fresh.water; g.got = []; return;
    }
    L.gems.forEach(function(gm,i){ if(gm[0]===nx && gm[1]===ny && g.got.indexOf(i)<0 && ((gm[2]==='r')===(who==='fire'))){ g.got.push(i); g.score += 10; } });
    var ff = tile(L,g.fire[0],g.fire[1])==='f', ww = tile(L,g.water[0],g.water[1])==='w';
    if(ff && ww){
      g.score += 50; g.log.push('Level '+(g.level+1)+' cleared!');
      if(g.level+1>=LEVELS.length){ g.done = true; return; }
      var n = init(g.level+1, g.score); n.deaths = g.deaths; n.moves = g.moves; n.log = g.log.concat(['Level '+(g.level+2)+': '+LEVELS[g.level+1].name]);
      Object.keys(n).forEach(function(k){ g[k] = n[k]; });
    }
  }
  // BFS over joint positions: can both reach their doors? returns step count or -1
  function solve(i){
    var L = level(i), start = [L.fire[0],L.fire[1],L.water[0],L.water[1]];
    var key = function(s){ return s.join(','); }, seen = {}, q = [[start,0]]; seen[key(start)] = 1;
    while(q.length){
      var cur = q.shift(), s = cur[0], dist = cur[1];
      if(tile(L,s[0],s[1])==='f' && tile(L,s[2],s[3])==='w') return dist;
      for(var who=0; who<2; who++) for(var dn in DIRS){
        var d = DIRS[dn], px = s[who*2], py = s[who*2+1], nx = px+d[0], ny = py+d[1];
        var f = who===0 ? [nx,ny] : [s[0],s[1]], w = who===1 ? [nx,ny] : [s[2],s[3]];
        var of = who===0 ? [s[2],s[3]] : [s[0],s[1]];
        if(blocked(L,nx,ny,[s[0],s[1]],[s[2],s[3]])) continue;
        if(nx===of[0] && ny===of[1]) continue;
        if(deadly(tile(L,nx,ny), who===0?'fire':'water')) continue;
        var ns = s.slice(); ns[who*2] = nx; ns[who*2+1] = ny;
        var k = key(ns); if(seen[k]) continue; seen[k] = 1; q.push([ns,dist+1]);
      }
    }
    return -1;
  }
  var API = {LEVELS:LEVELS, level:level, tile:tile, init:init, move:move, solve:solve, pressed:pressed, doorOpen:doorOpen, blocked:blocked};
  if(typeof module!=='undefined') module.exports = API; else root.FW = API;
})(this);
