// Bakes 3D models (glTF/GLB) into isometric sprite sheets using headless Chromium + Three.js.
// Usage: node tools/bake/bake.cjs [key ...]      (no keys = bake everything)
// Requires: playwright (npm i -D playwright && npx playwright install chromium), tools/vendor/three, assets-src/ (see tools/fetch-assets.sh)
const fs=require('fs'),path=require('path'),http=require('http');
let chromium;try{({chromium}=require('playwright'));}catch(e){console.error('playwright 가 필요합니다: npm i -D playwright && npx playwright install chromium');process.exit(1);}
const ROOT=path.resolve(__dirname,'../..');
const OUT=path.join(ROOT,'assets/sprites');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png'};
function findFile(dir,name){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const r=findFile(p,name);if(r)return r;}else if(e.name===name)return p;}return null;}
(async()=>{
  const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
  for(const s of cfg.statics){
    const rel=s.file.startsWith('**/')?path.relative(ROOT,findFile(path.join(ROOT,cfg.staticRoot),s.file.slice(3))||''):path.join(cfg.staticRoot,s.file);
    if(!rel||!fs.existsSync(path.join(ROOT,rel))){console.warn('missing model',s.key,s.file);s.skip=true;}s.path=rel;
  }
  cfg.statics=cfg.statics.filter(s=>!s.skip);
  for(const ic of cfg.icons||[]){const f=findFile(path.join(ROOT,cfg.iconRoot),ic.file);if(!f){console.warn('missing icon model',ic.key);ic.skip=true;continue;}ic.path=path.relative(ROOT,f);}
  cfg.icons=(cfg.icons||[]).filter(i=>!i.skip);
  const srv=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}).listen(0,'127.0.0.1');
  await new Promise(r=>srv.once('listening',r));const port=srv.address().port;
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();page.on('pageerror',e=>console.error('page error:',e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/bake/bake.html`);await page.waitForFunction('window.READY');
  const only=process.argv.slice(2);
  const t0=Date.now();
  const res=await page.evaluate(([c,o])=>window.bakeAll(c,o.length?o:null),[cfg,only]);
  fs.mkdirSync(OUT,{recursive:true});
  const mfPath=path.join(OUT,'manifest.json');
  const mf=fs.existsSync(mfPath)?JSON.parse(fs.readFileSync(mfPath,'utf8')):{characters:{},statics:{}};
  mf.tileWidth=64;mf.tileHeight=32;mf.scale=0.5;
  const save=(name,url)=>fs.writeFileSync(path.join(OUT,name),Buffer.from(url.split(',')[1],'base64'));
  for(const c of res.characters){
    const entry={w:c.w,h:c.h,ax:c.ax,ay:c.ay,anims:{}};
    for(const [a,info] of Object.entries(c.anims)){if(info.missing){console.warn(`  ${c.key}: animation not found (${info.missing})`);continue;}const file=`${c.key}_${a}.png`;save(file,c.sheets[a]);entry.anims[a]={file,frames:info.frames,dur:info.dur,loop:info.loop};}
    mf.characters[c.key]=entry;console.log(`character ${c.key}: ${Object.keys(entry.anims).join(', ')}  (visible meshes: ${c.visible.join(', ')})`);
  }
  for(const s of res.statics){const file=`${s.key}.png`;save(file,s.png);mf.statics[s.key]={file,w:s.w,h:s.h,ax:s.ax,ay:s.ay,foot:s.foot,height:s.height};console.log(`static ${s.key}: ${s.w}x${s.h} foot ${s.foot.join('x')} h ${s.height}`);}
  mf.icons=mf.icons||{};for(const ic of res.icons||[]){const file=`icon_${ic.key}.png`;save(file,ic.png);mf.icons[ic.key]=file;console.log('icon',ic.key);}
  fs.writeFileSync(mfPath,JSON.stringify(mf,null,1));
  console.log(`done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  await browser.close();srv.close();
})().catch(e=>{console.error(e);process.exit(1);});
