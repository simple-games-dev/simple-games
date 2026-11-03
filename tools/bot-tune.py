"""Self-play tuner for the Gem Merchants computer player.

Opens games/merchants/index.html?botsonly in headless Chromium (Playwright), where the page exposes
window.__sim, and plays thousands of games between two weight sets with no drawing. A random hill-climb
perturbs 3 weights of the evaluation (the BW object in the game file) and keeps a candidate only if it
beats the current best >56% over G games AND again on a fresh confirmation run.

    pip install playwright && playwright install chromium
    python tools/bot-tune.py 240 60        # games per comparison, iterations
    python tools/bot-tune.py --compare     # easy / normal / hard ladder

Copy the printed weights into BW in games/merchants/index.html.
"""
import asyncio, json, random, sys, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAKE_FB = "(function(){const S={};const subs={};\nfunction ts(ms){return {__ts:ms,toMillis(){return ms;}};}\nconst FV={arrayUnion:v=>({__au:v})};\nfunction ref(p){return {id:p.split('/').pop(),\n get:async()=>({exists:!!S[p],data:()=>JSON.parse(JSON.stringify(S[p]||{}))}),\n set:async(d)=>{S[p]=JSON.parse(JSON.stringify(d));(subs[p]||[]).forEach(f=>f());},\n update:async(u)=>{const d=S[p]=S[p]||{};for(const k in u){const v=u[k];if(v&&v.__au)(d[k]=d[k]||[]).push(v.__au);else d[k]=v&&v.__ts?v:JSON.parse(JSON.stringify(v===undefined?null:v));}(subs[p]||[]).forEach(f=>f());},\n delete:async()=>{delete S[p];},\n onSnapshot:(f)=>{(subs[p]=subs[p]||[]).push(()=>f({exists:!!S[p],data:()=>JSON.parse(JSON.stringify(S[p]))}));setTimeout(()=>f({exists:!!S[p],data:()=>JSON.parse(JSON.stringify(S[p]||{}))}),0);return()=>{};}};}\nconst db={collection:c=>({doc:id=>ref(c+'/'+id),where:()=>({limit:()=>({get:async()=>({forEach(){}})})})}),\n runTransaction:async fn=>{const tx={get:async r=>r.get(),update:(r,u)=>r.update(u)};return fn(tx);}};\nwindow.firebase={initializeApp(){},firestore:Object.assign(()=>db,{FieldValue:FV,Timestamp:{fromMillis:ts,now:()=>ts(Date.now())}}),appCheck:()=>({})};\n})();"

EVAL = """([wa,wb,g,la,lb])=>{const S=window.__sim;let a=0,b=0,t=0;for(let i=0;i<g;i++){const f=i%2;
  S.setSeatW(f?[wb,wa]:[wa,wb]); const r=S.game(f?[lb,la]:[la,lb],2);
  if(!r.over||r.winners.length!==1){t++;continue;} const w=r.winners[0]; if((w===0)!==(f===1))a++;else b++;} S.setSeatW(null); return {a,b,t}}"""

async def open_page(browser):
    pg = await browser.new_page()
    async def route(r):
        u = r.request.url
        if u.startswith('file:'): await r.continue_()
        elif 'firebase-app-compat' in u: await r.fulfill(body=FAKE_FB, content_type='application/javascript')
        elif 'gstatic.com/firebasejs' in u: await r.fulfill(body='', content_type='application/javascript')
        else: await r.abort()
    await pg.route('**/*', route)
    await pg.goto((ROOT/'games'/'merchants'/'index.html').as_uri() + '?botsonly')
    await pg.wait_for_timeout(300)
    return pg

async def compare():
    async with async_playwright() as p:
        br = await p.chromium.launch(); pg = await open_page(br); w = await pg.evaluate('window.__sim.getW()')
        for a, b in [('normal','easy'), ('hard','normal'), ('hard','easy')]:
            print(a, 'vs', b, await pg.evaluate(EVAL, [w, w, 300, a, b]))
        await br.close()

async def tune(G, ITER):
    async with async_playwright() as p:
        br = await p.chromium.launch(); pg = await open_page(br)
        best = await pg.evaluate('window.__sim.getW()'); keys = [k for k in best if not k.startswith(('noiseH','slip','focus','deny'))]
        for it in range(ITER):
            cand = dict(best)
            for k in random.sample(keys, 3): cand[k] = round(best[k]*random.choice([0.6,0.8,0.9,1.1,1.25,1.5]), 3)
            r = await pg.evaluate(EVAL, [cand, best, G, 'normal', 'normal']); d = r['a']+r['b']
            rate = r['a']/d if d else 0
            print(it, {k: cand[k] for k in cand if cand[k] != best[k]}, r, round(rate,3), flush=True)
            if rate > 0.56:
                r2 = await pg.evaluate(EVAL, [cand, best, G, 'normal', 'normal']); d2 = r2['a']+r2['b']
                if d2 and r2['a']/d2 > 0.52: best = cand; print('  NEW BEST', json.dumps(best), flush=True)
        await br.close()

if __name__ == '__main__':
    if '--compare' in sys.argv: asyncio.run(compare())
    else: asyncio.run(tune(int(sys.argv[1]) if len(sys.argv)>1 else 240, int(sys.argv[2]) if len(sys.argv)>2 else 60))
