(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const screens = { home: $("#homeScreen"), game: $("#gameScreen"), shop: $("#shopScreen"), about: $("#aboutScreen") };
  const holes = $$(".hole");

  const storage = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const THEME_INFO = {
    sunny:{name:"Sunny", free:true, cls:""}, moon:{name:"Moon", cls:"theme-moon"}, autumn:{name:"Autumn", cls:"theme-autumn"},
    sakura:{name:"Sakura", cls:"theme-sakura"}, ocean:{name:"Ocean", cls:"theme-ocean"}, lavender:{name:"Lavender", cls:"theme-lavender"},
    sunset:{name:"Sunset", cls:"theme-sunset"}, mystic:{name:"Mystic", cls:"theme-mystic"}
  };

  const state = {
    mode:"time", running:false, paused:false, score:0, combo:0, bestCombo:0, flowers:0,
    timeLeft:60, challengeTarget:25, challengeFlowers:0,
    fever:false, feverTimer:null, feverEnd:0, feverHits:0,
    active:new Map(), spawnTimer:null, gameTimer:null, bombEndTimer:null, countdownId:0,
    safeFlowers:0, milestones:new Set(),
    rareEvent:null, rareEventEnd:0, rareEventTimer:null, rareEventHits:0,
    feverBonusAwarded:false,
    sound:storage.get("flowerHuntSound",true), haptic:storage.get("flowerHuntHaptic",true),
    selectedTheme:storage.get("flowerHuntTheme","sunny"),
    lastRun:storage.get("flowerHuntLastRun",null),
    bestTime:storage.get("flowerHuntBestTime",0), bestSurvival:storage.get("flowerHuntBestSurvival",0), bestChallenge:storage.get("flowerHuntBestChallenge",0),
    xp:storage.get("flowerHuntXP",0), streak:storage.get("flowerHuntStreak",1), lastPlayed:storage.get("flowerHuntLastPlayed",""), level:storage.get("flowerHuntLevel",1),
    diamonds:storage.get("flowerHuntDiamonds",0), slowOwned:storage.get("flowerHuntSlowOwned",0), doubleOwned:storage.get("flowerHuntDoubleOwned",0),
    slowActive:false, doubleActive:false, slowEnd:0, doubleEnd:0,
    lastDailyClaim:storage.get("flowerHuntDailyClaim","")
  };
  let audioCtx=null;

  function showScreen(name){ Object.values(screens).forEach(s=>s.classList.remove("active")); screens[name].classList.add("active"); }
  function titleForLevel(level){if(level>=15)return"Garden Legend";if(level>=10)return"Flower Master";if(level>=7)return"Quick Tapper";if(level>=4)return"Flower Hunter";if(level>=2)return"Garden Apprentice";return"Garden Rookie";}
  function levelUnlock(level){if(level>=15)return"Legendary Garden Glow";if(level>=12)return"Mystic Garden Badge";if(level>=8)return"Fever Aura";if(level>=5)return"Combo Badge";if(level>=3)return"Garden Emblem";if(level>=2)return"Garden Apprentice";return"Garden Apprentice";}
  function levelBadge(level){if(level>=15)return"LEGEND";if(level>=12)return"MYSTIC";if(level>=8)return"FEVER";if(level>=5)return"COMBO";if(level>=3)return"BLOOM";if(level>=2)return"APPRENTICE";return"ROOKIE";}
  function xpForNext(){return 100+(state.level-1)*50;}
  function updateProgressUI(){const next=xpForNext(),pct=Math.min(100,state.xp/next*100);$("#levelHome").textContent=state.level;$("#titleHome").textContent=titleForLevel(state.level);$("#xpBarHome").style.width=pct+"%";$("#xpTextHome").textContent=`${state.xp} / ${next} XP`;$("#streakHome").textContent=state.streak;$("#nextUnlockHome").textContent=levelUnlock(state.level+1);$("#levelBadgeHome").textContent=levelBadge(state.level);}
  function addXP(amount){state.xp+=amount;while(state.xp>=xpForNext()){state.xp-=xpForNext();state.level++;popMessage(`⭐ LEVEL ${state.level}!`);tone(740,.09);setTimeout(()=>tone(980,.12),70);}storage.set("flowerHuntXP",state.xp);storage.set("flowerHuntLevel",state.level);updateProgressUI();}
  function updateStreak(){const today=new Date().toISOString().slice(0,10),prev=state.lastPlayed;if(!prev)state.streak=1;else if(prev!==today){const d=(new Date(today)-new Date(prev))/86400000;state.streak=d===1?state.streak+1:1;}state.lastPlayed=today;storage.set("flowerHuntStreak",state.streak);storage.set("flowerHuntLastPlayed",today);updateProgressUI();}
  function updateHome(){$("#timeBestHome").textContent=state.bestTime;$("#survivalBestHome").textContent=state.bestSurvival;updateProgressUI();updateLastRunCard();updateThemeLocks();updateShopUI();applyTheme(state.selectedTheme,false);}

  function ensureAudio(){if(!state.sound)return;if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch{}}if(audioCtx?.state==="suspended")audioCtx.resume();}
  function tone(freq,duration=.07,type="sine",volume=.035){if(!state.sound)return;ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}
  function successSound(){tone(520,.055);setTimeout(()=>tone(720,.075),45)}
  function bombSound(){tone(90,.24,"sawtooth",.055);setTimeout(()=>tone(52,.3,"square",.03),80)}
  function vibrate(p){if(state.haptic&&navigator.vibrate)try{navigator.vibrate(p)}catch{}}

  function ownedThemes(){const a=storage.get("flowerHuntOwnedThemes",["sunny"]);return Array.isArray(a)?a:["sunny"];}
  function saveOwnedThemes(v){storage.set("flowerHuntOwnedThemes",v);}
  function applyTheme(theme,save=true){const info=THEME_INFO[theme]||THEME_INFO.sunny,shell=$("#appShell");Object.values(THEME_INFO).forEach(t=>t.cls&&shell.classList.remove(t.cls));if(info.cls)shell.classList.add(info.cls);state.selectedTheme=theme;if(save)storage.set("flowerHuntTheme",theme);$$('.theme-shop-card').forEach(b=>b.classList.toggle('selected',b.dataset.theme===theme));}
  function updateThemeLocks(){let owned=ownedThemes();if(!owned.includes("sunny"))owned.unshift("sunny");if(!owned.includes(state.selectedTheme))state.selectedTheme="sunny";owned=[...new Set(owned)];saveOwnedThemes(owned);$$('.theme-shop-card').forEach(btn=>{const theme=btn.dataset.theme,isOwned=theme==="sunny"||owned.includes(theme),equipped=theme===state.selectedTheme;btn.classList.toggle("locked",!isOwned);btn.classList.toggle("owned",isOwned);btn.classList.toggle("selected",equipped);const action=btn.querySelector('.theme-action');if(action)action.textContent=equipped?"EQUIPPED ✓":(isOwned?"EQUIP":"💎 99");});applyTheme(state.selectedTheme,false);}
  function buyTheme(theme){if(theme==="sunny"){equipTheme(theme);return;}const owned=ownedThemes();if(owned.includes(theme)){equipTheme(theme);return;}if(state.diamonds<99){setShopMessage("Not enough diamonds for this theme 💎");return;}state.diamonds-=99;owned.push(theme);saveOwnedThemes([...new Set(owned)]);saveEconomy();updateShopUI();updateThemeLocks();setShopMessage(`${THEME_INFO[theme].name} purchased • now tap EQUIP.`);tone(900,.08);}
  function equipTheme(theme){const owned=ownedThemes();if(theme!=="sunny"&&!owned.includes(theme))return;applyTheme(theme);updateThemeLocks();setShopMessage(`${THEME_INFO[theme].name} equipped ✓`);tone(760,.07);}

  function saveEconomy(){storage.set("flowerHuntDiamonds",state.diamonds);storage.set("flowerHuntSlowOwned",state.slowOwned);storage.set("flowerHuntDoubleOwned",state.doubleOwned);storage.set("flowerHuntDailyClaim",state.lastDailyClaim);}
  function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function setShopMessage(msg){const el=$("#redeemMessage");if(el){el.textContent=msg;el.classList.add("show");clearTimeout(setShopMessage.t);setShopMessage.t=setTimeout(()=>el.classList.remove("show"),3200);}}
  function updateShopUI(){
    $("#shopDiamonds").textContent=state.diamonds;if($("#homeDiamonds"))$("#homeDiamonds").textContent=state.diamonds;
    $("#slowOwned").textContent=state.slowOwned;$("#doubleOwned").textContent=state.doubleOwned;
    $("#buySlowBtn").disabled=state.diamonds<20;$("#buyDoubleBtn").disabled=state.diamonds<30;
    const claimed=state.lastDailyClaim===todayKey();$("#dailyStatus").textContent=claimed?"CLAIMED ✓":"AVAILABLE";$("#dailyStatus").classList.toggle("claimed",claimed);$("#dailyClaimBtn").disabled=claimed;$("#dailyClaimBtn").textContent=claimed?"Claimed ✓":"Claim";
  }
  function buyPower(type){const cost=type==="slow"?20:30;if(state.diamonds<cost){setShopMessage("Not enough diamonds 💎");return;}if(type==="slow")state.slowOwned++;else state.doubleOwned++;state.diamonds-=cost;saveEconomy();updateShopUI();tone(700,.08);setShopMessage(type==="slow"?"⚡ Slow Bloom added to your inventory.":"✨ 2× Points added to your inventory.");}
  function redeemCode(){const input=$("#redeemInput"),code=input.value.trim().toUpperCase(),rewards={ADI7S:20000,SOMU34:34};if(!code){setShopMessage("Enter a redeem code.");return;}if(!(code in rewards)){setShopMessage("Invalid redeem code.");return;}const key=`flowerHuntCode_${code}`;if(localStorage.getItem(key)==="1"){setShopMessage("This code was already redeemed on this device.");return;}state.diamonds+=rewards[code];localStorage.setItem(key,"1");saveEconomy();updateShopUI();input.value="";setShopMessage(`Success! +${rewards[code].toLocaleString()} 💎 added.`);tone(880,.08);setTimeout(()=>tone(1100,.1),70);}
  function claimDaily(){if(state.lastDailyClaim===todayKey()){updateShopUI();return;}state.lastDailyClaim=todayKey();state.diamonds+=5;saveEconomy();updateShopUI();setShopMessage("🎁 Daily Reward • +5 💎");tone(620,.08);setTimeout(()=>tone(820,.08),70);}

  function updatePowerUI(){
    $("#slowPowerCount").textContent=state.slowOwned;$("#doublePowerCount").textContent=state.doubleOwned;
    const a=Math.max(0,Math.ceil((state.slowEnd-Date.now())/1000)),b=Math.max(0,Math.ceil((state.doubleEnd-Date.now())/1000));
    $("#slowPowerTimer").textContent=state.slowActive?`${a}s`:"";$("#doublePowerTimer").textContent=state.doubleActive?`${b}s`:"";
    $("#slowPowerBtn").classList.toggle("active",state.slowActive);$("#doublePowerBtn").classList.toggle("active",state.doubleActive);
    $("#slowPowerBtn").disabled=!state.running||state.paused||state.slowOwned<=0||state.slowActive;$("#doublePowerBtn").disabled=!state.running||state.paused||state.doubleOwned<=0||state.doubleActive;
  }
  function activatePower(type){if(!state.running||state.paused)return;if(type==="slow"){if(state.slowOwned<=0||state.slowActive)return;state.slowOwned--;state.slowActive=true;state.slowEnd=Date.now()+20000;setGameMessage("⚡ SLOW BLOOM • 20s");}else{if(state.doubleOwned<=0||state.doubleActive)return;state.doubleOwned--;state.doubleActive=true;state.doubleEnd=Date.now()+20000;setGameMessage("✨ 2× POINTS • 20s");}saveEconomy();updatePowerUI();successSound();restartSpawnLoop();}
  function powerTick(){let changed=false;if(state.slowActive&&Date.now()>=state.slowEnd){state.slowActive=false;state.slowEnd=0;changed=true;setGameMessage("⚡ SLOW BLOOM ENDED");restartSpawnLoop();}if(state.doubleActive&&Date.now()>=state.doubleEnd){state.doubleActive=false;state.doubleEnd=0;changed=true;setGameMessage("✨ 2× POINTS ENDED");}if(changed)saveEconomy();updatePowerUI();}

  function updateLastRunCard(){const r=state.lastRun,card=$("#lastRunCard");if(!r){card.classList.add("hidden-card");return;}card.classList.remove("hidden-card");$("#lastRunScore").textContent=r.score;$("#lastRunMode").textContent=r.mode==="time"?"⏱️ 1 MIN":r.mode==="survival"?"💣 SURVIVAL":"🎯 CHALLENGE";$("#lastRunCombo").textContent=`🔥 ${r.bestCombo}`;$("#lastRunFlowers").textContent=`🌻 ${r.flowers}`;}
  function formatTime(sec){sec=Math.max(0,Math.ceil(sec));return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;}
  function setHUD(){$("#score").textContent=state.score;$("#combo").textContent=state.combo;$("#timer").textContent=state.mode==="survival"?"∞":formatTime(state.timeLeft);$("#comboPill").classList.toggle("hot",state.combo>=5);$("#comboPill").classList.toggle("fever-combo",state.combo>=10);$("#timerPill").classList.toggle("warning",state.mode!=="survival"&&state.timeLeft<=10);updatePowerUI();}
  function clearBoard(){holes.forEach(h=>{h.classList.remove("active","hit","bomb-hit");const o=h.querySelector(".object");o.className="object";o.textContent="";});state.active.clear();}
  function randomHole(){const free=holes.filter(h=>!state.active.has(h.dataset.hole));return free.length?free[Math.floor(Math.random()*free.length)]:null;}

  function bombChance(){
    const progress=Math.min(.09,state.score/9000);
    let chance=state.mode==="survival"?.08+progress:state.mode==="challenge"?.075+progress*.75:.06+progress*.6;
    if(state.safeFlowers<3)chance=0;
    else if(state.safeFlowers>=9)chance=.72;
    else if(state.safeFlowers>=7)chance=Math.max(chance,.42);
    else if(state.safeFlowers>=5)chance=Math.max(chance,.20);
    if(state.fever)chance*=.72;
    return Math.min(.78,chance);
  }
  function chooseObject(){
    // Controlled randomization: safe opening, smooth difficulty, and rare-event protection.
    if(state.rareEvent?.name==="rain" && Math.random()<.28)return "flower";
    if(state.safeFlowers>=9 && state.rareEvent?.name!=="rain")return "bomb";
    if(Math.random()<bombChance() * (state.rareEvent?.name==="rain" ? .35 : 1))return "bomb";
    if(state.mode==="time"&&Math.random()<.10)return "clock";
    return "flower";
  }
  function flowerEmoji(){const r=Math.random();return r<.55?"🌻":r<.82?"🌼":"🌹";}

  function difficultyLevel(){
    const scoreFactor=Math.min(1,state.score/2400);
    const flowerFactor=Math.min(1,state.flowers/120);
    const comboFactor=Math.min(1,state.combo/25);
    return Math.min(1,scoreFactor*.55+flowerFactor*.25+comboFactor*.20);
  }
  function objectLife(type){
    const d=difficultyLevel();
    const base=state.mode==="challenge"?1320:state.mode==="survival"?1420:1480;
    const min=state.mode==="challenge"?820:state.mode==="survival"?900:920;
    let life=base-(base-min)*d;
    if(state.fever)life*=.94;
    if(state.rareEvent?.name==="wind")life*=.97;
    return Math.max(min,type==="bomb"?life+110:type==="clock"?life+70:life);
  }
  function spawnObject(forceType=null){
    if(!state.running||state.paused)return;
    const hole=randomHole();if(!hole)return;
    const type=forceType||chooseObject(),id=hole.dataset.hole,obj=hole.querySelector(".object");
    obj.className=`object ${type}`;obj.textContent=type==="flower"?flowerEmoji():type==="bomb"?"💣":"⏱️";
    hole.classList.remove("hit","bomb-hit");void hole.offsetWidth;hole.classList.add("active");
    if(type==="flower")state.safeFlowers++;else if(type==="bomb")state.safeFlowers=0;
    const life=objectLife(type),token={type,handled:false,timeout:null,expiresAt:Date.now()+life,remaining:0};
    token.timeout=setTimeout(()=>hideObject(hole,token),life);state.active.set(id,token);
  }
  function hideObject(hole,token){
    if(!hole)return;const id=hole.dataset.hole,e=state.active.get(id);if(!e||e!==token||e.handled)return;
    e.handled=true;state.active.delete(id);hole.classList.remove("active");const o=hole.querySelector(".object");o.className="object";o.textContent="";
    if(state.running&&token.type==="flower"){state.combo=0;setHUD();setGameMessage("MISS! COMBO LOST");}
  }
  function restartSpawnLoop(){clearTimeout(state.spawnTimer);state.spawnTimer=null;if(state.running&&!state.paused)spawnLoop();}
  function spawnLoop(){
    clearTimeout(state.spawnTimer);state.spawnTimer=null;if(!state.running||state.paused)return;
    spawnObject();
    if(state.rareEvent?.name==="rain")spawnObject("flower");
    const d=difficultyLevel();
    const start=state.mode==="challenge"?1030:state.mode==="survival"?1110:1160;
    const floor=state.mode==="challenge"?690:state.mode==="survival"?750:780;
    let speed=start-(start-floor)*d;
    if(state.fever)speed*=.86;
    if(state.slowActive)speed*=1.35;
    if(state.rareEvent?.name==="wind")speed*=.93;
    state.spawnTimer=setTimeout(spawnLoop,Math.max(floor,Math.round(speed)));
  }

  function setGameMessage(text){const el=$("#bonusMessage");el.textContent=text;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");}
  function popMessage(text){setGameMessage(text);}
  function createParticles(hole,emoji="✨",count=7){const rect=hole.getBoundingClientRect();for(let i=0;i<count;i++){const p=document.createElement("span");p.textContent=emoji;p.style.position="fixed";p.style.left=`${rect.left+rect.width/2}px`;p.style.top=`${rect.top+rect.height/2}px`;p.style.zIndex=40;p.style.pointerEvents="none";p.style.fontSize=`${10+Math.random()*8}px`;p.style.transition="transform .55s ease,opacity .55s ease";document.body.appendChild(p);requestAnimationFrame(()=>{p.style.transform=`translate(${(Math.random()-.5)*100}px,${-30-Math.random()*75}px) scale(.6)`;p.style.opacity=0;});setTimeout(()=>p.remove(),600);}}

  function enterFever(){
    if(state.fever)return;
    state.fever=true;state.feverHits=0;state.feverBonusAwarded=false;state.feverEnd=Date.now()+7000;
    $("#appShell").classList.add("fever-active");$("#gameHint").textContent="🔥 FEVER! 2× points • bonus at 5 hits";
    setGameMessage("🔥 FEVER MODE • GO CRAZY!");tone(420,.08,"triangle",.04);setTimeout(()=>tone(620,.08,"triangle",.04),80);setTimeout(()=>tone(900,.12,"triangle",.04),160);vibrate([30,30,60]);
    clearTimeout(state.feverTimer);state.feverTimer=setTimeout(exitFever,7000);restartSpawnLoop();
  }
  function exitFever(showMessage=true){
    const was=state.fever;clearTimeout(state.feverTimer);state.feverTimer=null;state.fever=false;state.feverEnd=0;state.feverBonusAwarded=false;
    $("#appShell").classList.remove("fever-active");
    if(state.running)$("#gameHint").textContent=state.mode==="time"?"Catch flowers • find the bonus clock":state.mode==="challenge"?"Catch 25 flowers in 30 seconds":"One bomb ends the run";
    if(was&&showMessage&&state.running)setGameMessage("🔥 FEVER ENDED");if(was)restartSpawnLoop();
  }
  function startRareEvent(){
    if(!state.running||state.paused||state.rareEvent)return;
    const roll=Math.random();
    if(roll>.16)return;
    const types=roll<.055?"rain":roll<.105?"wind":"butterfly";
    const info={
      rain:{name:"rain",title:"🌸 FLOWER RAIN!",hint:"More flowers • bombs reduced",duration:6000},
      wind:{name:"wind",title:"🍃 WINDY GARDEN!",hint:"Objects move faster",duration:6000},
      butterfly:{name:"butterfly",title:"🦋 BUTTERFLY BONUS!",hint:"Next 3 flowers get +10",duration:7000}
    }[types];
    state.rareEvent=info;state.rareEventEnd=Date.now()+info.duration;state.rareEventHits=0;$("#appShell").classList.add("rare-event-active");
    $("#eventBadge").textContent=info.title;$("#eventBadge").classList.add("show");
    setGameMessage(info.title);restartSpawnLoop();clearTimeout(state.rareEventTimer);state.rareEventTimer=setTimeout(endRareEvent,info.duration);
  }
  function endRareEvent(){
    if(!state.rareEvent)return;const name=state.rareEvent.name;clearTimeout(state.rareEventTimer);state.rareEventTimer=null;state.rareEvent=null;state.rareEventEnd=0;state.rareEventHits=0;$("#appShell").classList.remove("rare-event-active");$("#eventBadge").classList.remove("show");if(state.running)setGameMessage(`${name==="rain"?"🌸":name==="wind"?"🍃":"🦋"} EVENT ENDED`);restartSpawnLoop();
  }
  function rareEventTick(){
    if(!state.running||state.paused)return;
    if(state.rareEvent&&Date.now()>=state.rareEventEnd)endRareEvent();
    if(!state.rareEvent&&Math.random()<.045)startRareEvent();
  }

  function handleHoleTap(hole){
    if(!state.running||state.paused)return;const id=hole.dataset.hole,e=state.active.get(id);if(!e||e.handled)return;e.handled=true;clearTimeout(e.timeout);state.active.delete(id);hole.classList.remove("active");
    if(e.type==="flower"){
      state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);state.flowers++;if(state.mode==="challenge")state.challengeFlowers++;
      let points=state.combo>=5?15:10;if(state.fever)points*=2;if(state.doubleActive)points*=2;
      let bonus=0;
      if(state.rareEvent?.name==="butterfly" && state.rareEventHits<3){state.rareEventHits++;bonus=10;}
      if(state.fever){state.feverHits++;if(state.feverHits>=5&&!state.feverBonusAwarded){state.feverBonusAwarded=true;bonus+=25;setGameMessage("🔥 FEVER BONUS +25!");createParticles(hole,"✨",12);}}
      state.score+=points+bonus;hole.classList.add("hit");createParticles(hole,bonus?"✨":"🌼",bonus?11:7);successSound();vibrate(12);
      if(state.combo===3)setGameMessage("🔥 COMBO x3");else if(state.combo===5)setGameMessage("🔥 HOT STREAK x5");else if(state.combo===10){setGameMessage("🔥 FEVER MODE");enterFever();}else if(state.combo===20)setGameMessage("👑 LEGENDARY STREAK");else if(state.combo>=3)setGameMessage(`🔥 x${state.combo}  +${points}${bonus?` +${bonus}`:""}`);else setGameMessage(`+${points}${bonus?` +${bonus}`:""}`);
      if(state.mode==="challenge"&&state.challengeFlowers>=state.challengeTarget){endGame("challengeWin");return;}
    } else if(e.type==="clock"){
      const extra=9+Math.floor(Math.random()*2);state.timeLeft+=extra;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);let points=25;if(state.fever)points*=2;state.score+=points;hole.classList.add("hit");createParticles(hole,"✨");successSound();vibrate([15,25]);setGameMessage(`⏱️ +${extra} SEC!`);
    } else {
      hole.classList.add("bomb-hit");createParticles(hole,"💥",10);bombSound();vibrate([70,40,130]);state.combo=0;
      if(state.mode==="survival"){clearTimeout(state.bombEndTimer);state.bombEndTimer=setTimeout(()=>{state.bombEndTimer=null;endGame("bomb");},220);return;}
      state.score=Math.max(0,state.score-25);setGameMessage("💥 -25 • COMBO LOST");
    }
    setHUD();
  }

  function runCountdown(done){const overlay=$("#countdownOverlay"),text=$("#countdownText"),token=++state.countdownId;overlay.classList.remove("hidden");let n=3;const step=()=>{if(!state.running||token!==state.countdownId){overlay.classList.add("hidden");return;}text.textContent=n>0?n:"GO!";text.style.animation="none";void text.offsetWidth;text.style.animation="countdown .8s ease both";if(n===0)setTimeout(()=>{if(!state.running||token!==state.countdownId)return;overlay.classList.add("hidden");done();},650);else{n--;setTimeout(step,800);}};step();}

  function hideAllGameOverOverlays(){
    const ids=["gameOverOverlay","shareCardOverlay","pauseOverlay","countdownOverlay"];
    ids.forEach(id=>$("#"+id)?.classList.add("hidden"));
    const shareImg=$("#sharePreview");
    const shareModal=$("#shareCardOverlay");
    if(shareModal?.dataset.blobUrl){URL.revokeObjectURL(shareModal.dataset.blobUrl);shareModal.dataset.blobUrl="";}
    if(shareImg)shareImg.removeAttribute("src");
  }

  function startGame(mode){
    hideAllGameOverOverlays();
    ensureAudio();updateStreak();state.countdownId++;clearTimeout(state.bombEndTimer);state.bombEndTimer=null;state.mode=mode;state.running=true;state.paused=false;state.score=0;state.combo=0;state.bestCombo=0;state.flowers=0;state.challengeFlowers=0;state.timeLeft=mode==="challenge"?30:60;state.fever=false;state.safeFlowers=0;state.milestones=new Set();state.rareEvent=null;state.rareEventEnd=0;state.rareEventHits=0;clearTimeout(state.rareEventTimer);state.rareEventTimer=null;state.slowActive=false;state.doubleActive=false;state.slowEnd=0;state.doubleEnd=0;clearTimeout(state.feverTimer);clearInterval(state.gameTimer);clearTimeout(state.spawnTimer);state.spawnTimer=null;clearBoard();$("#appShell").classList.remove("fever-active","rare-event-active");
    $("#gameModeLabel").textContent=mode==="time"?"1 MINUTE":mode==="survival"?"SURVIVAL":"CHALLENGE";$("#gameHint").textContent=mode==="time"?"Catch flowers • find the bonus clock":mode==="survival"?"One bomb ends the run":"Catch 25 flowers in 30 seconds";$("#gameTip").textContent=mode==="time"?"🌻 +10/15 • 💣 -25 • ⏱️ +9/+10 sec":mode==="survival"?"🌻 Score points • 💣 = GAME OVER":"🎯 Catch 25 flowers • 💣 costs points";
    setHUD();showScreen("game");runCountdown(()=>{if(!state.running)return;spawnLoop();clearInterval(state._rareInterval);state._rareInterval=setInterval(rareEventTick,1000);if(mode!=="survival"){state.gameTimer=setInterval(()=>{if(!state.running||state.paused)return;state.timeLeft-=.1;if(state.timeLeft<=0){state.timeLeft=0;setHUD();endGame("time");}else setHUD();},100);}});
  }

  function endGame(reason){
    if(!state.running)return;state.running=false;state.paused=false;state.countdownId++;clearInterval(state.gameTimer);state.gameTimer=null;clearTimeout(state.spawnTimer);state.spawnTimer=null;clearTimeout(state.feverTimer);state.feverTimer=null;clearInterval(state._rareInterval);state._rareInterval=null;clearTimeout(state.rareEventTimer);state.rareEventTimer=null;state.rareEvent=null;$("#eventBadge").classList.remove("show");$("#appShell").classList.remove("rare-event-active");clearTimeout(state.bombEndTimer);state.bombEndTimer=null;exitFever(false);clearBoard();
    const key=state.mode==="time"?"bestTime":state.mode==="survival"?"bestSurvival":"bestChallenge",old=state[key],newBest=state.score>old;if(newBest){state[key]=state.score;storage.set(`flowerHunt${key.charAt(0).toUpperCase()+key.slice(1)}`,state.score);}
    state.lastRun={score:state.score,mode:state.mode,bestCombo:state.bestCombo,flowers:state.flowers,date:new Date().toISOString()};storage.set("flowerHuntLastRun",state.lastRun);saveEconomy();addXP(Math.max(10,Math.floor(state.score/5)+state.flowers));
    $("#gameOverIcon").textContent=reason==="bomb"?"💥":reason==="challengeWin"?"🎯":newBest?"🏆":"🌻";$("#gameOverTag").textContent=reason==="bomb"?"BOMB HIT!":reason==="challengeWin"?"CHALLENGE COMPLETE":newBest?"NEW BEST!":"TIME UP!";$("#gameOverTitle").textContent=reason==="bomb"?"Boom! Run Over":reason==="challengeWin"?"Challenge Cleared!":"Time's Up!";$("#finalScore").textContent=state.score;$("#finalBest").textContent=Math.max(state.score,old);$("#finalFlowers").textContent=state.flowers;$("#finalCombo").textContent=state.bestCombo;$("#gameOverOverlay").classList.remove("hidden");updateHome();
  }

  async function makeShareBlob(){
    const c=document.createElement("canvas");c.width=1080;c.height=1350;const x=c.getContext("2d");
    const g=x.createLinearGradient(0,0,1080,1350);g.addColorStop(0,"#82d9f4");g.addColorStop(.48,"#c9eda0");g.addColorStop(1,"#67b35b");x.fillStyle=g;x.fillRect(0,0,c.width,c.height);
    x.globalAlpha=.16;for(let i=0;i<24;i++){x.beginPath();x.arc(Math.random()*1080,Math.random()*1350,30+Math.random()*90,0,Math.PI*2);x.fillStyle="#fff";x.fill();}x.globalAlpha=1;
    x.fillStyle="rgba(255,255,255,.82)";x.beginPath();x.roundRect(90,80,900,1190,42);x.fill();
    x.textAlign="center";x.fillStyle="#244329";x.font="900 58px system-ui";x.fillText("🌻 FLOWER HUNT",540,175);x.font="800 25px system-ui";x.fillStyle="rgba(36,67,41,.62)";x.fillText("MY SCORE",540,270);
    x.font="1000 190px system-ui";x.fillStyle="#4d9148";x.fillText(String(state.score),540,500);
    x.font="800 32px system-ui";x.fillStyle="#244329";x.fillText(`🔥 ×${state.bestCombo} COMBO   •   🌻 ${state.flowers} FLOWERS`,540,610);
    x.font="700 28px system-ui";x.fillStyle="rgba(36,67,41,.72)";x.fillText(state.mode==="time"?"1 MINUTE MODE":state.mode==="survival"?"SURVIVAL MODE":"CHALLENGE MODE",540,685);
    if(state.score>=Math.max(state.bestTime,state.bestSurvival,state.bestChallenge)){
      x.font="900 38px system-ui";x.fillStyle="#9b741b";x.fillText("🏆 PERSONAL BEST",540,790);
    }
    x.font="900 44px system-ui";x.fillStyle="#376f35";x.fillText("Can you beat my score?",540,1035);x.font="800 30px system-ui";x.fillStyle="#244329";x.fillText("DESTIN STUDIOS",540,1170);x.font="22px system-ui";x.fillStyle="rgba(36,67,41,.65)";x.fillText("Flower Hunt • Tap • React • Survive",540,1215);
    return new Promise(res=>c.toBlob(res,"image/png",.95));
  }
  async function openShareCard(){
    // The share card is a replacement for Game Over, never a second modal behind it.
    $("#gameOverOverlay").classList.add("hidden");
    const modal=$("#shareCardOverlay"),img=$("#sharePreview");
    const blob=await makeShareBlob();if(!blob){setGameMessage("Could not create score card.");return;}
    img.src=URL.createObjectURL(blob);modal.classList.remove("hidden");modal.dataset.blobUrl=img.src;
  }
  function closeShareCard(){const modal=$("#shareCardOverlay"),img=$("#sharePreview");if(modal.dataset.blobUrl)URL.revokeObjectURL(modal.dataset.blobUrl);modal.dataset.blobUrl="";img.removeAttribute("src");modal.classList.add("hidden");}
  async function shareImage(){
    const blob=await makeShareBlob();if(!blob){setGameMessage("Could not create score image.");return;}const file=new File([blob],"flower-hunt-score.png",{type:"image/png"});
    const shareText=`🌻 I scored ${state.score} points in Flower Hunt! 🔥 Can you beat my score?`;
    if(navigator.share){
      try{
        if(navigator.canShare?.({files:[file]})){await navigator.share({title:"Flower Hunt Score",text:shareText,files:[file]});return;}
        await navigator.share({title:"Flower Hunt Score",text:shareText});return;
      }catch(e){if(e?.name==="AbortError")return;}
    }
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="flower-hunt-score.png";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);setGameMessage("🖼️ Score card saved. Share it from Gallery.");
  }
  async function shareFromCard(){closeShareCard();await shareImage();}
  async function downloadShareCard(){
    const blob=await makeShareBlob();if(!blob)return;const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="flower-hunt-score.png";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);setGameMessage("🖼️ Score card saved.");
  }

  function pauseGame(){if(!state.running||state.paused)return;state.paused=true;state._pauseStarted=Date.now();clearTimeout(state.spawnTimer);state.spawnTimer=null;state.active.forEach((e,id)=>{clearTimeout(e.timeout);e.timeout=null;e.remaining=Math.max(80,e.expiresAt-Date.now());});$("#pauseOverlay").classList.remove("hidden");updatePowerUI();}
  function resumeGame(){if(!state.running)return;const pausedFor=state._pauseStarted?Date.now()-state._pauseStarted:0;if(state.slowActive)state.slowEnd+=pausedFor;if(state.doubleActive)state.doubleEnd+=pausedFor;if(state.fever)state.feverEnd+=pausedFor;state.active.forEach((e,id)=>{if(!e.handled){e.expiresAt=Date.now()+(e.remaining||500);e.timeout=setTimeout(()=>hideObject(holes.find(h=>h.dataset.hole===id),e),e.remaining||500);}});state.paused=false;state._pauseStarted=0;$("#pauseOverlay").classList.add("hidden");updatePowerUI();restartSpawnLoop();}
  function quitToMenu(){
    closeShareCard();
    $("#gameOverOverlay").classList.add("hidden");
    state.running=false;state.paused=false;state.countdownId++;clearInterval(state.gameTimer);state.gameTimer=null;clearTimeout(state.spawnTimer);state.spawnTimer=null;clearTimeout(state.feverTimer);state.feverTimer=null;clearInterval(state._rareInterval);state._rareInterval=null;clearTimeout(state.rareEventTimer);state.rareEventTimer=null;state.rareEvent=null;$("#eventBadge").classList.remove("show");$("#appShell").classList.remove("rare-event-active");clearTimeout(state.bombEndTimer);state.bombEndTimer=null;exitFever(false);clearBoard();saveEconomy();$("#pauseOverlay").classList.add("hidden");$("#gameOverOverlay").classList.add("hidden");showScreen("home");updateHome();}
  function closeGameOver(){$("#gameOverOverlay").classList.add("hidden");}

  // Events: exactly one listener per control.
  $$(".mode-card").forEach(b=>b.addEventListener("click",()=>startGame(b.dataset.mode)));
  $("#aboutBtn").onclick=()=>showScreen("about");$("#aboutBackBtn").onclick=()=>showScreen("home");$("#aboutPlayBtn").onclick=()=>startGame("time");
  $("#backBtn").onclick=pauseGame;$("#pauseBtn").onclick=pauseGame;$("#resumeBtn").onclick=resumeGame;$("#quitBtn").onclick=quitToMenu;
  $("#againBtn").onclick=()=>{closeGameOver();startGame(state.mode);};$("#menuBtn").onclick=quitToMenu;$("#lastRunPlay").onclick=()=>startGame(state.lastRun?.mode||"time");
  $("#shopBtn").onclick=()=>{updateShopUI();updateThemeLocks();showScreen("shop");};$("#shopBackBtn").onclick=()=>showScreen("home");
  $("#buySlowBtn").onclick=()=>buyPower("slow");$("#buyDoubleBtn").onclick=()=>buyPower("double");$("#redeemBtn").onclick=redeemCode;$("#redeemInput").onkeydown=e=>{if(e.key==="Enter")redeemCode();};$("#dailyClaimBtn").onclick=claimDaily;
  $("#slowPowerBtn").onclick=()=>activatePower("slow");$("#doublePowerBtn").onclick=()=>activatePower("double");
  $("#soundBtn").onclick=()=>{state.sound=!state.sound;storage.set("flowerHuntSound",state.sound);$("#soundBtn").textContent=state.sound?"🔊":"🔇";if(state.sound){ensureAudio();tone(600,.07);}};
  $("#hapticBtn").onclick=()=>{state.haptic=!state.haptic;storage.set("flowerHuntHaptic",state.haptic);$("#hapticBtn").textContent=state.haptic?"📳":"📴";if(state.haptic)vibrate(18);};
  $("#shareScoreBtn").onclick=openShareCard;
  $("#shareNowBtn").onclick=shareFromCard;$("#downloadShareBtn").onclick=downloadShareCard;$("#closeShareBtn").onclick=closeShareCard;
  $$(".theme-shop-card").forEach(b=>b.addEventListener("click",()=>buyTheme(b.dataset.theme)));
  holes.forEach(h=>h.addEventListener("pointerdown",e=>{e.preventDefault();ensureAudio();handleHoleTap(h);}));
  $("#garden").addEventListener("contextmenu",e=>e.preventDefault());
  document.addEventListener("contextmenu",e=>{if(e.target.closest(".gameover-card,.garden,.power-bar,.game-header"))e.preventDefault();});
  setInterval(powerTick,250);

  $("#soundBtn").textContent=state.sound?"🔊":"🔇";$("#hapticBtn").textContent=state.haptic?"📳":"📴";updateHome();updateShopUI();updatePowerUI();
})();
