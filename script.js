(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const screens = { home: $("#homeScreen"), game: $("#gameScreen"), shop: $("#shopScreen"), about: $("#aboutScreen") };
  const holes = $$(".hole");

  const storage = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const state = {
    mode: "time", running:false, paused:false, score:0, combo:0, bestCombo:0, flowers:0,
    timeLeft:60, challengeTarget:25, challengeFlowers:0, fever:false, feverHits:0,
    active:new Map(), spawnTimer:null, gameTimer:null, feverTimer:null,
    sound: storage.get("flowerHuntSound", true), haptic: storage.get("flowerHuntHaptic", true),
    selectedTheme: storage.get("flowerHuntTheme", "sunny"),
    lastRun: storage.get("flowerHuntLastRun", null),
    bestTime: storage.get("flowerHuntBestTime", 0), bestSurvival: storage.get("flowerHuntBestSurvival", 0),
    bestChallenge: storage.get("flowerHuntBestChallenge", 0),
    xp: storage.get("flowerHuntXP", 0), streak: storage.get("flowerHuntStreak", 1),
    lastPlayed: storage.get("flowerHuntLastPlayed", ""),
    level: storage.get("flowerHuntLevel", 1),
    diamonds: storage.get("flowerHuntDiamonds", 0),
    slowOwned: storage.get("flowerHuntSlowOwned", 0),
    doubleOwned: storage.get("flowerHuntDoubleOwned", 0),
    slowActive: false, doubleActive: false, slowEnd: 0, doubleEnd: 0,
    lastDailyReward: storage.get("flowerHuntDailyReward", "")
  };
  let audioCtx = null;

  function showScreen(name) { Object.values(screens).forEach(s=>s.classList.remove("active")); screens[name].classList.add("active"); }
  function titleForLevel(level) {
    if (level >= 15) return "Garden Legend"; if (level >= 10) return "Flower Master"; if (level >= 7) return "Quick Tapper";
    if (level >= 4) return "Flower Hunter"; if (level >= 2) return "Garden Apprentice"; return "Garden Rookie";
  }
  function xpForNext() { return 100 + (state.level-1)*50; }
  function updateProgressUI() {
    const next=xpForNext(), pct=Math.min(100, state.xp/next*100);
    $("#levelHome").textContent=state.level; $("#titleHome").textContent=titleForLevel(state.level);
    $("#xpBarHome").style.width=pct+"%"; $("#xpTextHome").textContent=`${state.xp} / ${next} XP`; $("#streakHome").textContent=state.streak;
  }
  function addXP(amount) {
    state.xp += amount;
    while (state.xp >= xpForNext()) { state.xp -= xpForNext(); state.level++; popMessage(`⭐ LEVEL ${state.level}!`); tone(740,.09); setTimeout(()=>tone(980,.12),70); }
    storage.set("flowerHuntXP",state.xp); storage.set("flowerHuntLevel",state.level); updateProgressUI();
  }
  function updateStreak() {
    const today=new Date().toISOString().slice(0,10), prev=state.lastPlayed;
    if (!prev) state.streak=1;
    else if (prev !== today) {
      const d=(new Date(today)-new Date(prev))/86400000;
      state.streak = d === 1 ? state.streak+1 : 1;
    }
    state.lastPlayed=today; storage.set("flowerHuntStreak",state.streak); storage.set("flowerHuntLastPlayed",today); updateProgressUI();
  }
  function updateHome() {
    $("#timeBestHome").textContent=state.bestTime; $("#survivalBestHome").textContent=state.bestSurvival;
    updateProgressUI(); updateLastRunCard(); updateThemeLocks(); applyTheme(state.selectedTheme, false); updateShopUI();
  }
  function ensureAudio(){ if(!state.sound)return; if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch{}} if(audioCtx?.state==='suspended')audioCtx.resume(); }
  function tone(freq,duration=.07,type="sine",volume=.035){ if(!state.sound)return; ensureAudio(); if(!audioCtx)return; const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration); }
  function successSound(){tone(520,.055);setTimeout(()=>tone(720,.075),45)}
  function bombSound(){tone(90,.24,"sawtooth",.055);setTimeout(()=>tone(52,.3,"square",.03),80)}
  function vibrate(p){if(state.haptic&&navigator.vibrate)try{navigator.vibrate(p)}catch{}}

  const THEME_INFO = {
    sunny:{name:"Sunny", free:true, cls:""}, moon:{name:"Moon", cls:"theme-moon"}, autumn:{name:"Autumn", cls:"theme-autumn"},
    sakura:{name:"Sakura", cls:"theme-sakura"}, ocean:{name:"Ocean", cls:"theme-ocean"}, lavender:{name:"Lavender", cls:"theme-lavender"},
    sunset:{name:"Sunset", cls:"theme-sunset"}, mystic:{name:"Mystic", cls:"theme-mystic"}
  };
  function ownedThemes(){ return storage.get("flowerHuntOwnedThemes", ["sunny"]); }
  function saveOwnedThemes(v){ storage.set("flowerHuntOwnedThemes", v); }
  function applyTheme(theme, save=true){
    const info=THEME_INFO[theme]||THEME_INFO.sunny, shell=$("#appShell");
    Object.values(THEME_INFO).forEach(t=>t.cls && shell.classList.remove(t.cls));
    if(info.cls) shell.classList.add(info.cls); state.selectedTheme=theme;
    if(save) storage.set("flowerHuntTheme",theme);
    $$(".theme-shop-card").forEach(b=>b.classList.toggle("selected",b.dataset.theme===theme));
  }
  function updateThemeLocks(){
    const owned=ownedThemes();
    $$(".theme-shop-card").forEach(btn=>{ const free=btn.dataset.theme==="sunny", isOwned=owned.includes(btn.dataset.theme); btn.classList.toggle("locked",!free&&!isOwned); btn.classList.toggle("owned",isOwned); });
    if(!owned.includes(state.selectedTheme)) state.selectedTheme="sunny";
    applyTheme(state.selectedTheme,false);
  }
  function buyTheme(theme){
    if(theme==="sunny") return applyTheme("sunny");
    const owned=ownedThemes();
    if(owned.includes(theme)) return applyTheme(theme);
    if(state.diamonds<99){ $("#redeemMessage").textContent="Not enough diamonds for this theme 💎"; return; }
    state.diamonds-=99; owned.push(theme); saveOwnedThemes(owned); saveEconomy(); updateShopUI(); updateThemeLocks(); applyTheme(theme); popMessage(`🎨 ${THEME_INFO[theme].name} unlocked!`); tone(900,.08);
  }
  function saveEconomy(){ storage.set("flowerHuntDiamonds",state.diamonds); storage.set("flowerHuntSlowOwned",state.slowOwned); storage.set("flowerHuntDoubleOwned",state.doubleOwned); storage.set("flowerHuntDailyReward",state.lastDailyReward); }
  function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function updateShopUI(){
    $("#shopDiamonds").textContent=state.diamonds; if($("#homeDiamonds")) $("#homeDiamonds").textContent=state.diamonds; $("#slowOwned").textContent=state.slowOwned; $("#doubleOwned").textContent=state.doubleOwned;
    $("#buySlowBtn").disabled=state.diamonds<20; $("#buyDoubleBtn").disabled=state.diamonds<30;
    const claimed=state.lastDailyReward===todayKey(); $("#dailyStatus").textContent=claimed?"Claimed ✓":"Available"; $("#dailyStatus").classList.toggle("claimed",claimed);
  }
  function buyPower(type){ const cost=type==="slow"?20:30; if(state.diamonds<cost){$("#redeemMessage").textContent="Not enough diamonds 💎";return;} state.diamonds-=cost; type==="slow"?state.slowOwned++:state.doubleOwned++; saveEconomy(); updateShopUI(); tone(700,.08); }
  function redeemCode(){
    const code=$("#redeemInput").value.trim().toUpperCase(), rewards={ADI7S:20000,SOMU34:34};
    if(!code){$("#redeemMessage").textContent="Enter a redeem code.";return;} if(!(code in rewards)){$("#redeemMessage").textContent="Invalid code.";return;}
    const key=`flowerHuntCode_${code}`; if(localStorage.getItem(key)==="1"){$("#redeemMessage").textContent="This code was already redeemed on this device.";return;}
    state.diamonds+=rewards[code]; localStorage.setItem(key,"1"); saveEconomy(); updateShopUI(); $("#redeemInput").value=""; $("#redeemMessage").textContent=`Success! +${rewards[code].toLocaleString()} 💎 added.`; tone(880,.08);
  }
  function updatePowerUI(){
    $("#slowPowerCount").textContent=state.slowOwned; $("#doublePowerCount").textContent=state.doubleOwned;
    const a=Math.max(0,Math.ceil((state.slowEnd-Date.now())/1000)), b=Math.max(0,Math.ceil((state.doubleEnd-Date.now())/1000));
    $("#slowPowerTimer").textContent=state.slowActive?`${a}s`:""; $("#doublePowerTimer").textContent=state.doubleActive?`${b}s`:"";
    $("#slowPowerBtn").classList.toggle("active",state.slowActive); $("#doublePowerBtn").classList.toggle("active",state.doubleActive);
    $("#slowPowerBtn").disabled=!state.running||state.slowOwned<=0||state.slowActive; $("#doublePowerBtn").disabled=!state.running||state.doubleOwned<=0||state.doubleActive;
  }
  function activatePower(type){
    if(!state.running||state.paused)return; if(type==="slow"){if(!state.slowOwned||state.slowActive)return;state.slowOwned--;state.slowActive=true;state.slowEnd=Date.now()+20000;popMessage("⚡ SLOW BLOOM • 20s");}else{if(!state.doubleOwned||state.doubleActive)return;state.doubleOwned--;state.doubleActive=true;state.doubleEnd=Date.now()+20000;popMessage("✨ 2× POINTS • 20s");} saveEconomy(); updatePowerUI(); successSound(); spawnLoop();
  }
  function powerTick(){ if(state.slowActive&&Date.now()>=state.slowEnd){state.slowActive=false;state.slowEnd=0;spawnLoop();} if(state.doubleActive&&Date.now()>=state.doubleEnd){state.doubleActive=false;state.doubleEnd=0;} updatePowerUI(); }
  function awardDailyReward(){ if(state.lastDailyReward===todayKey())return; state.diamonds+=5; state.lastDailyReward=todayKey(); saveEconomy(); popMessage("🎁 DAILY REWARD • +5 💎"); }
  function updateLastRunCard(){const r=state.lastRun,card=$("#lastRunCard");if(!r){card.classList.add("hidden-card");return;}card.classList.remove("hidden-card");$("#lastRunScore").textContent=r.score;$("#lastRunMode").textContent=r.mode==="time"?"⏱️ 1 MIN":r.mode==="survival"?"💣 SURVIVAL":"🎯 CHALLENGE";$("#lastRunCombo").textContent=`🔥 ${r.bestCombo}`;$("#lastRunFlowers").textContent=`🌻 ${r.flowers}`;}
  function formatTime(sec){sec=Math.max(0,Math.ceil(sec));return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;}
  function setHUD(){$("#score").textContent=state.score;$("#combo").textContent=state.combo;$("#timer").textContent=state.mode==="survival"?"∞":formatTime(state.timeLeft);$("#comboPill").classList.toggle("hot",state.combo>=5);$("#timerPill").classList.toggle("warning",state.mode!=="survival"&&state.timeLeft<=10);}
  function clearBoard(){holes.forEach(h=>{h.classList.remove("active","hit","bomb-hit");const o=h.querySelector(".object");o.className="object";o.textContent="";});state.active.clear();}
  function randomHole(){const free=holes.filter(h=>!state.active.has(h.dataset.hole));return free.length?free[Math.floor(Math.random()*free.length)]:null;}
  function chooseObject(){
    const r=Math.random();
    if(state.mode==="survival"||state.mode==="challenge") return r < Math.min(.18,.09+state.score/4000) ? "bomb" : "flower";
    if(r<.13)return "bomb"; if(r<.20)return "clock"; return "flower";
  }
  function flowerEmoji(){const r=Math.random();return r<.64?"🌻":r<.87?"🌼":"🌹";}
  function spawnObject(){
    if(!state.running||state.paused)return; const hole=randomHole();if(!hole)return; const type=chooseObject(),id=hole.dataset.hole;
    // Deliberately slower and fairer than the previous version.
    const life=type==="bomb"?Math.max(1050,1450-Math.floor(state.score/180)*30):Math.max(1000,1350-Math.floor(state.score/180)*25);
    const obj=hole.querySelector(".object"); obj.className=`object ${type}`; obj.textContent=type==="flower"?flowerEmoji():""; hole.classList.remove("hit","bomb-hit");void hole.offsetWidth;hole.classList.add("active");
    state.active.set(id,{type,timeout:setTimeout(()=>hideObject(hole),life)});
  }
  function hideObject(hole){const id=hole.dataset.hole,e=state.active.get(id);if(e?.timeout)clearTimeout(e.timeout);state.active.delete(id);hole.classList.remove("active");}
  function spawnLoop(){clearTimeout(state.spawnTimer);if(!state.running||state.paused)return;spawnObject();
    // Much gentler speed curve. Challenge is faster but still readable.
    const floor=state.mode==="challenge"?720:state.mode==="survival"?800:850;
    const baseSpeed=Math.max(floor,1250-Math.floor(state.score/180)*25);
    const speed=state.slowActive?Math.floor(baseSpeed*1.45):baseSpeed;
    state.spawnTimer=setTimeout(spawnLoop,speed);
  }
  function popMessage(text){const el=$("#bonusMessage");el.textContent=text;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");}
  function createParticles(hole,emoji="✨",count=7){const rect=hole.getBoundingClientRect();for(let i=0;i<count;i++){const p=document.createElement("span");p.textContent=emoji;p.style.position="fixed";p.style.left=`${rect.left+rect.width/2}px`;p.style.top=`${rect.top+rect.height/2}px`;p.style.zIndex=40;p.style.pointerEvents="none";p.style.fontSize=`${10+Math.random()*8}px`;p.style.transition="transform .55s ease, opacity .55s ease";document.body.appendChild(p);requestAnimationFrame(()=>{p.style.transform=`translate(${(Math.random()-.5)*100}px,${-30-Math.random()*75}px) scale(.6)`;p.style.opacity=0});setTimeout(()=>p.remove(),600);}}

  function enterFever(){
    if(state.fever)return; state.fever=true; state.feverHits=0; $("#appShell").classList.add("fever-active"); $("#gameHint").textContent="🔥 FEVER! Double points for 7 seconds"; popMessage("🔥 FEVER MODE!"); tone(420,.08,"triangle",.04);setTimeout(()=>tone(620,.08,"triangle",.04),80);setTimeout(()=>tone(900,.12,"triangle",.04),160); vibrate([30,30,60]);
    clearTimeout(state.feverTimer); state.feverTimer=setTimeout(()=>exitFever(),7000);
  }
  function exitFever(){state.fever=false;$("#appShell").classList.remove("fever-active");if(state.running)$("#gameHint").textContent=state.mode==="time"?"Catch flowers • find the bonus clock":state.mode==="challenge"?"Catch 25 flowers in 30 seconds":"One bomb ends the run";}

  function handleHoleTap(hole){
    if(!state.running||state.paused)return;const id=hole.dataset.hole,e=state.active.get(id);if(!e)return;clearTimeout(e.timeout);state.active.delete(id);
    if(e.type==="flower"){
      state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);state.flowers++;if(state.mode==="challenge")state.challengeFlowers++;
      let points=state.combo>=5?15:10;if(state.fever)points*=2;if(state.doubleActive)points*=2;state.score+=points;state.diamonds+=1;hole.classList.add("hit");createParticles(hole,"🌼");successSound();vibrate(12);
      if(state.combo===10||state.combo===20)enterFever(); else if(state.combo>=3)popMessage(`🔥 x${state.combo}  +${points}`); else popMessage(`+${points}`);
      if(state.mode==="challenge"&&state.challengeFlowers>=state.challengeTarget){endGame("challengeWin");return;}
    } else if(e.type==="clock"){
      const extra=9+Math.floor(Math.random()*2);state.timeLeft+=extra;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);state.score+=(state.doubleActive?50:25);state.diamonds+=2;hole.classList.add("hit");createParticles(hole,"✨");successSound();vibrate([15,25]);popMessage(`⏱️ +${extra} SEC!`);
    } else {
      hole.classList.add("bomb-hit");createParticles(hole,"💥",10);bombSound();vibrate([70,40,130]);state.combo=0;
      if(state.mode==="survival"){setTimeout(()=>endGame("bomb"),220);return;}
      state.score=Math.max(0,state.score-25);popMessage("💥 -25 • COMBO LOST");
    }
    setHUD();
  }

  function runCountdown(done){const overlay=$("#countdownOverlay"),text=$("#countdownText");overlay.classList.remove("hidden");let n=3;const step=()=>{if(!state.running){overlay.classList.add("hidden");return;}text.textContent=n>0?n:"GO!";text.style.animation="none";void text.offsetWidth;text.style.animation="countdown .8s ease both";if(n===0)setTimeout(()=>{overlay.classList.add("hidden");done()},650);else{n--;setTimeout(step,800)}};step();}

  function startGame(mode){
    ensureAudio();updateStreak();state.mode=mode;state.running=true;state.paused=false;state.score=0;state.combo=0;state.bestCombo=0;state.flowers=0;state.challengeFlowers=0;state.timeLeft=mode==="challenge"?30:60;state.fever=false;state.slowActive=false;state.doubleActive=false;state.slowEnd=0;state.doubleEnd=0;$("#appShell").classList.remove("fever-active");clearTimeout(state.feverTimer);clearInterval(state.gameTimer);clearTimeout(state.spawnTimer);clearBoard();
    $("#gameModeLabel").textContent=mode==="time"?"1 MINUTE":mode==="survival"?"SURVIVAL":"CHALLENGE";
    $("#gameHint").textContent=mode==="time"?"Catch flowers • find the bonus clock":mode==="survival"?"One bomb ends the run":"Catch 25 flowers in 30 seconds";
    $("#gameTip").textContent=mode==="time"?"🌻 +10/15 • 💣 -25 • ⏱️ +9/+10 sec":mode==="survival"?"🌻 Score points • 💣 = GAME OVER":"🎯 Catch 25 flowers • 💣 costs points";
    setHUD();updatePowerUI();showScreen("game");runCountdown(()=>{if(!state.running)return;spawnLoop();if(mode!=="survival"){state.gameTimer=setInterval(()=>{if(!state.running||state.paused)return;state.timeLeft-=.1;if(state.timeLeft<=0){state.timeLeft=0;setHUD();endGame("time")}else setHUD()},100)}});
  }

  function endGame(reason){
    if(!state.running)return;state.running=false;state.paused=false;clearInterval(state.gameTimer);clearTimeout(state.spawnTimer);clearTimeout(state.feverTimer);exitFever();clearBoard();
    const key=state.mode==="time"?"bestTime":state.mode==="survival"?"bestSurvival":"bestChallenge",old=state[key],newBest=state.score>old;if(newBest){state[key]=state.score;storage.set(`flowerHunt${key.charAt(0).toUpperCase()+key.slice(1)}`,state.score)}
    state.lastRun={score:state.score,mode:state.mode,bestCombo:state.bestCombo,flowers:state.flowers,date:new Date().toISOString()};storage.set("flowerHuntLastRun",state.lastRun);awardDailyReward();saveEconomy();addXP(Math.max(10,Math.floor(state.score/5)+state.flowers));
    $("#gameOverIcon").textContent=reason==="bomb"?"💥":reason==="challengeWin"?"🎯":newBest?"🏆":"🌻";
    $("#gameOverTag").textContent=reason==="bomb"?"BOMB HIT!":reason==="challengeWin"?"CHALLENGE COMPLETE":newBest?"NEW BEST!":"TIME UP!";
    $("#gameOverTitle").textContent=reason==="bomb"?"Boom! Run Over":reason==="challengeWin"?"Challenge Cleared!":"Time's Up!";
    $("#finalScore").textContent=state.score;$("#finalBest").textContent=Math.max(state.score,old);$("#finalFlowers").textContent=state.flowers;$("#finalCombo").textContent=state.bestCombo;
    $("#gameOverOverlay").classList.remove("hidden");updateHome();
  }

  // Image share: builds a real PNG card locally, then uses Web Share API when available.
  function makeShareCanvas(){
    const c=document.createElement("canvas");c.width=1080;c.height=1350;const x=c.getContext("2d");
    const g=x.createLinearGradient(0,0,1080,1350);g.addColorStop(0,"#82d9f4");g.addColorStop(.48,"#c7ed9b");g.addColorStop(1,"#62ae55");x.fillStyle=g;x.fillRect(0,0,c.width,c.height);
    x.globalAlpha=.16;for(let i=0;i<18;i++){x.beginPath();x.arc(Math.random()*1080,Math.random()*1350,30+Math.random()*90,0,Math.PI*2);x.fillStyle="#fff";x.fill()};x.globalAlpha=1;
    x.textAlign="center";x.fillStyle="#244329";x.font="900 52px system-ui";x.fillText("🌻 FLOWER HUNT",540,150);
    x.font="800 24px system-ui";x.fillStyle="rgba(36,67,41,.65)";x.fillText("MY SCORE",540,245);
    x.font="1000 190px system-ui";x.fillStyle="#fff8d4";x.fillText(String(state.score),540,470);
    x.font="800 32px system-ui";x.fillStyle="#244329";x.fillText(`🔥 ×${state.bestCombo} COMBO   •   🌻 ${state.flowers} FLOWERS`,540,575);
    x.font="700 27px system-ui";x.fillStyle="rgba(36,67,41,.72)";x.fillText(state.mode==="time"?"1 MINUTE MODE":state.mode==="survival"?"SURVIVAL MODE":"CHALLENGE MODE",540,660);
    x.font="900 42px system-ui";x.fillStyle="#fff";x.fillText("Can you beat my score?",540,1050);
    x.font="800 28px system-ui";x.fillStyle="rgba(255,255,255,.9)";x.fillText("DESTIN STUDIOS",540,1190);
    x.font="22px system-ui";x.fillStyle="rgba(255,255,255,.78)";x.fillText("Flower Hunt • Tap • React • Survive",540,1230);
    return new Promise(res=>c.toBlob(b=>res(b),"image/png",.95));
  }
  async function shareImage(){
    const blob=await makeShareCanvas(),file=new File([blob],"flower-hunt-score.png",{type:"image/png"});
    try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:"Flower Hunt Score",text:"",files:[file]});return;}}catch(e){if(e.name==="AbortError")return;}
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="flower-hunt-score.png";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function openShare(){ $("#shareScoreBig").textContent=state.score;$("#shareMeta").textContent=`🔥 ×${state.bestCombo} COMBO  •  🌻 ${state.flowers} FLOWERS`;$("#shareOverlay").classList.remove("hidden"); }

  // UI events
  $$(".mode-card").forEach(b=>b.addEventListener("click",()=>startGame(b.dataset.mode)));
  $("#aboutBtn").onclick=()=>showScreen("about");$("#aboutBackBtn").onclick=()=>showScreen("home");$("#aboutPlayBtn").onclick=()=>startGame("time");
  $("#backBtn").onclick=()=>pauseGame();$("#pauseBtn").onclick=()=>pauseGame();$("#resumeBtn").onclick=()=>resumeGame();$("#quitBtn").onclick=quitToMenu;
  $("#againBtn").onclick=()=>{closeGameOver();startGame(state.mode)};$("#menuBtn").onclick=quitToMenu;$("#lastRunPlay").onclick=()=>startGame(state.lastRun?.mode||"time");
  $("#shopBtn").onclick=()=>{updateShopUI();showScreen("shop");};
  $("#shopBackBtn").onclick=()=>showScreen("home");
  $("#buySlowBtn").onclick=()=>buyPower("slow"); $("#buyDoubleBtn").onclick=()=>buyPower("double");
  $("#redeemBtn").onclick=redeemCode; $("#redeemInput").onkeydown=e=>{if(e.key==="Enter")redeemCode();};
  $("#slowPowerBtn").onclick=()=>activatePower("slow"); $("#doublePowerBtn").onclick=()=>activatePower("double");
  setInterval(powerTick,250);
  $("#soundBtn").onclick=()=>{state.sound=!state.sound;storage.set("flowerHuntSound",state.sound);$("#soundBtn").textContent=state.sound?"🔊":"🔇";if(state.sound){ensureAudio();tone(600,.07)}};
  $("#hapticBtn").onclick=()=>{state.haptic=!state.haptic;storage.set("flowerHuntHaptic",state.haptic);$("#hapticBtn").textContent=state.haptic?"📳":"📴";if(state.haptic)vibrate(18)};
  $("#closeShareBtn").onclick=()=>$("#shareOverlay").classList.add("hidden");$("#nativeShareBtn").onclick=shareImage;$("#saveShareBtn").onclick=shareImage;
  $("#gameOverOverlay").insertAdjacentHTML("beforeend",'<button id="shareScoreBtn" class="secondary-btn share-score-btn">📤 Share Score as Image</button>');$("#shareScoreBtn").onclick=openShare;
  $$(".theme-shop-card").forEach(b=>b.addEventListener("click",()=>buyTheme(b.dataset.theme)));
  holes.forEach(h=>h.addEventListener("pointerdown",e=>{e.preventDefault();ensureAudio();handleHoleTap(h)}));
  $("#garden").addEventListener("contextmenu",e=>e.preventDefault());

  function pauseGame(){if(!state.running)return;state.paused=true;clearTimeout(state.spawnTimer);$("#pauseOverlay").classList.remove("hidden")}
  function resumeGame(){if(!state.running)return;state.paused=false;$("#pauseOverlay").classList.add("hidden");spawnLoop()}
  function quitToMenu(){state.running=false;state.paused=false;clearInterval(state.gameTimer);clearTimeout(state.spawnTimer);clearTimeout(state.feverTimer);exitFever();clearBoard();saveEconomy();$("#pauseOverlay").classList.add("hidden");$("#gameOverOverlay").classList.add("hidden");$("#shareOverlay").classList.add("hidden");showScreen("home");updateHome()}
  function closeGameOver(){$("#gameOverOverlay").classList.add("hidden")}

  $("#soundBtn").textContent=state.sound?"🔊":"🔇";$("#hapticBtn").textContent=state.haptic?"📳":"📴";updateHome();updateShopUI();updatePowerUI();
})();
