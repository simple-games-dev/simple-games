/* Blind Maze — three views of one maze (rules; pure). Walls: N=1 E=2 S=4 W=8 mean "open passage". */
(function(root){
  var N=1, E=2, S=4, W=8, DX={1:0,2:1,4:0,8:-1}, DY={1:-1,2:0,4:1,8:0}, OPP={1:4,2:8,4:1,8:2};
  var DIRS = {up:N, right:E, down:S, left:W};
  var SIZES = [7,9,11], TRAPS = [5,9,14];
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function carve(n){
    var c = []; for(var y=0;y<n;y++){ c.push([]); for(var x=0;x<n;x++) c[y].push(0); }
    var seen = {}, st = [[0,0]]; seen['0,0'] = 1;
    while(st.length){
      var cur = st[st.length-1], ds = shuffle([N,E,S,W]), moved = false;
      for(var i=0;i<4;i++){
        var d = ds[i], nx = cur[0]+DX[d], ny = cur[1]+DY[d];
        if(nx<0||ny<0||nx>=n||ny>=n||seen[nx+','+ny]) continue;
        c[cur[1]][cur[0]] |= d; c[ny][nx] |= OPP[d]; seen[nx+','+ny] = 1; st.push([nx,ny]); moved = true; break;
      }
      if(!moved) st.pop();
    }
    // knock out a few extra walls so there are loops (less tedious)
    for(var k=0;k<Math.floor(n*n/9);k++){
      var x = Math.floor(Math.random()*(n-1)), y = Math.floor(Math.random()*(n-1));
      if(Math.random()<.5){ c[y][x] |= E; c[y][x+1] |= W; } else { c[y][x] |= S; c[y+1][x] |= N; }
    }
    return c;
  }
  function reachable(c, traps, n){
    var bad = {}; traps.forEach(function(t){ bad[t[0]+','+t[1]] = 1; });
    var seen = {'0,0':1}, q = [[0,0]];
    while(q.length){ var p = q.shift(); if(p[0]===n-1 && p[1]===n-1) return true;
      [N,E,S,W].forEach(function(d){ if(!(c[p[1]][p[0]] & d)) return; var nx = p[0]+DX[d], ny = p[1]+DY[d], k = nx+','+ny; if(seen[k] || bad[k]) return; seen[k]=1; q.push([nx,ny]); }); }
    return false;
  }
  function solution(c, n){
    var prev = {'0,0':null}, q = [[0,0]];
    while(q.length){ var p = q.shift(); if(p[0]===n-1 && p[1]===n-1) break;
      [N,E,S,W].forEach(function(d){ if(!(c[p[1]][p[0]] & d)) return; var nx = p[0]+DX[d], ny = p[1]+DY[d], k = nx+','+ny; if(k in prev) return; prev[k] = p[0]+','+p[1]; q.push([nx,ny]); }); }
    var path = {}, cur = (n-1)+','+(n-1); while(cur){ path[cur] = 1; cur = prev[cur]; }
    return path;
  }
  function makeLevel(li){
    var n = SIZES[li], c = carve(n), sol = solution(c, n), cand = [];
    for(var y=0;y<n;y++) for(var x=0;x<n;x++) if(!sol[x+','+y] && x+y>1) cand.push([x,y]);
    shuffle(cand);
    return {n:n, cells:c, traps:cand.slice(0, Math.min(TRAPS[li], cand.length))};   // the shortest route is always trap-free
  }
  function reveal(g){
    var L = g.maze, p = g.pos, r = 1;
    for(var y=p[1]-r;y<=p[1]+r;y++) for(var x=p[0]-r;x<=p[0]+r;x++) if(x>=0&&y>=0&&x<L.n&&y<L.n){ var k = y*L.n+x; if(g.seen.indexOf(k)<0) g.seen.push(k); }
  }
  function roles(g){
    var n = g.n, walker = g.level % n, guide = (walker+1) % n, carto = [];
    for(var i=0;i<n;i++) if(i!==walker && i!==guide) carto.push(i);
    return {walker:walker, guide:guide, carto:carto};
  }
  function setup(g){ g.maze = makeLevel(g.level); g.pos = [0,0]; g.seen = []; g.found = []; reveal(g); }
  function init(n, opts){
    var g = {n:n, level:0, lives:+(opts&&opts.lives)||5, steps:0, log:['Level 1: the maze begins.']};
    setup(g); return g;
  }
  function label(p){ return String.fromCharCode(65+p[0])+(p[1]+1); }
  function act(g, a, seat){
    if(g.over) return 'The game is over.';
    var rl = roles(g);
    if(a.t==='move'){
      if(seat!==rl.walker) return 'Only the walker can move.';
      var d = DIRS[a.dir]; if(!d) return 'Bad move.';
      var c = g.maze.cells[g.pos[1]][g.pos[0]];
      if(!(c & d)) return 'A wall is in the way.';
      g.pos = [g.pos[0]+DX[d], g.pos[1]+DY[d]]; g.steps++;
      reveal(g);
      var hit = g.maze.traps.some(function(t){ return t[0]===g.pos[0] && t[1]===g.pos[1]; });
      if(hit){
        g.lives--; g.found.push(g.pos.slice()); g.log.push('💥 Trap at '+label(g.pos)+'! Back to the start. '+g.lives+' li'+(g.lives===1?'fe':'ves')+' left.');
        g.pos = [0,0];
        if(g.lives<=0) g.over = {win:false, text:'The team ran out of lives on level '+(g.level+1)+'.'};
        return;
      }
      if(g.pos[0]===g.maze.n-1 && g.pos[1]===g.maze.n-1){
        g.log.push('🏁 Level '+(g.level+1)+' cleared!');
        g.level++;
        if(g.level>=SIZES.length){ g.over = {win:true, text:'Out of all '+SIZES.length+' mazes with '+g.lives+' li'+(g.lives===1?'fe':'ves')+' to spare.'}; return; }
        setup(g); g.log.push('Level '+(g.level+1)+' — roles rotate.');
      }
      return;
    }
    return 'Unknown action.';
  }
  var API = {init:init, act:act, roles:roles, label:label, DIRS:DIRS, N:N, E:E, S:S, W:W, SIZES:SIZES};
  if(typeof module!=='undefined') module.exports = API; else root.BM = API;
})(this);
