import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJfYaeZGXyfIzxb0AlbPAv36ZWdMksolc",
    authDomain: "maple-defence.firebaseapp.com",
    databaseURL: "https://maple-defence-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "maple-defence",
    storageBucket: "maple-defence.firebasestorage.app",
    messagingSenderId: "507227611120",
    appId: "1:507227611120:web:0f18aebe3b350af3014735"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

let currentUserName = "이름없는 용사";
let currentUserUid = null;

window.checkSave = () => {
    let btn = document.getElementById('btn-continue');
    if (btn) {
        if (localStorage.getItem('mapleDefenseSave')) btn.style.display = 'block';
        else btn.style.display = 'none';
    }
};

window.switchScreen = (screenId) => {
    const screens = ['login-screen', 'start-screen', 'game-container', 'pk-game'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (screenId) {
        const activeEl = document.getElementById(screenId);
        if (activeEl) activeEl.style.display = 'flex';
        
        if (screenId === 'start-screen') window.checkSave();
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid;
        currentUserName = user.displayName || "용사";
        document.getElementById('current-user-name').innerText = currentUserName;
        
        if (document.getElementById('login-screen').style.display !== 'none') {
            window.switchScreen('start-screen');
        }
    } else {
        currentUserUid = null;
        window.switchScreen('login-screen');
    }
});

window.loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => alert("로그인 실패: " + error.message));
};

window.logout = () => { signOut(auth).then(() => { location.reload(); }); };

let bestWave = localStorage.getItem('mapleDefenseBestWave') || 0;
document.getElementById('best-record').innerText = `내 최고 기록: ${bestWave} 웨이브`;

let cardData = JSON.parse(localStorage.getItem('mapleDefenseCards')) || {};
const CARD_REQ = [1, 2, 4, 8, 12, 16, 20, 24, 28, 32]; 

let spentCoins = parseInt(localStorage.getItem('mapleDefenseSpentCoins')) || 0;
let skillLevels = JSON.parse(localStorage.getItem('mapleDefenseSkills')) || {
    common_wind: 0, common_sharp: 0, common_rage: 0,
    war_final: 0, war_death: 0,
    mage_freeze: 0, mage_thunder: 0,
    thief_shadow: 0, thief_fuma: 0
};

const SKILL_INFO = {
    common_wind: { name: "윈드 부스트", max: 5, desc: "공격 속도 20%p 증가", img: "image/windboost.png" },
    common_sharp: { name: "샤프 아이즈", max: 5, desc: "치명타 5%p 증가 (1.2배 피해)", img: "image/sharpeyes.png" },
    common_rage: { name: "분노", max: 5, desc: "최종 공격력 1%p 증가", img: "image/rage.png" },
    war_final: { name: "파이널 어택", max: 5, desc: "3%p 확률로 2배 피해 (전사)", img: "image/finalattack.png" },
    war_death: { name: "데스폴트", max: 5, desc: "60초마다 전역 피해 (전사 5차↑)", img: "image/despolt.png" },
    mage_freeze: { name: "프리즈", max: 5, desc: "적 빙결 및 도트 피해 (법사)", img: "image/freeze.png" },
    mage_thunder: { name: "썬더 브레이크", max: 5, desc: "60초마다 전역 피해 (법사 5차↑)", img: "image/thunderbreak.png" },
    thief_shadow: { name: "섀도우 파트너", max: 5, desc: "3%p 확률로 투사체 추가 (도적)", img: "image/shadowpartner.png" },
    thief_fuma: { name: "풍마 수리검", max: 5, desc: "60초마다 맵 순회 수리검 (도적 5차↑)", img: "image/fumashuriken.png" }
};

const bossImages = {
    "킹 슬라임": new Image(), "알리샤르": new Image(), "파풀라투스": new Image(),
    "피아누스": new Image(), "자쿰": new Image(), "혼테일": new Image(),
    "시그너스": new Image(), "반반": new Image(), "피에르": new Image(),
    "블러드퀸": new Image(), "벨룸": new Image()
};
bossImages["킹 슬라임"].src = "image/kingslime.png"; bossImages["알리샤르"].src = "image/alishar.png";
bossImages["파풀라투스"].src = "image/papulatus.png"; bossImages["피아누스"].src = "image/pianus.png";
bossImages["자쿰"].src = "image/zakum.png"; bossImages["혼테일"].src = "image/horntail.png";
bossImages["시그너스"].src = "image/signus.png"; bossImages["반반"].src = "image/banban.png";
bossImages["피에르"].src = "image/pierr.png"; bossImages["블러드퀸"].src = "image/bloodqueen.png";
bossImages["벨룸"].src = "image/velroom.png";

const husooabiImg = new Image();
husooabiImg.src = "image/husooabi.png";

const GRADES = [
    { name: "초보자", prob: 50.0, sell: 3, mult: 1, rangeMul: 1 },
    { name: "1차", prob: 33.1, sell: 6, mult: 2, rangeMul: 1 },
    { name: "2차", prob: 10.2, sell: 9, mult: 4, rangeMul: 1 },
    { name: "3차", prob: 5.1, sell: 16, mult: 8, rangeMul: 1.2, speedMul: 0.8 },
    { name: "4차", prob: 0.8, sell: 30, mult: 16, rangeMul: 1.2 },
    { name: "5차", prob: 0.5, sell: 0, mult: 32, rangeMul: 1.2, splash: true },
    { name: "6차", prob: 0.2, sell: 0, mult: 64, rangeMul: 4, splash: true },
    { name: "제네시스", prob: 0.08, sell: 0, mult: 128, rangeMul: 4, splash: true },
    { name: "데스티니", prob: 0.019, sell: 0, mult: 256, rangeMul: 6, splash: true }
];

const CLASSES = {
    '전사': { type: '전사', icon: '🗡️', color: '#c62828', baseDmg: 26, range: 100, cd: 1000, splash: 40 },
    '법사': { type: '법사', icon: '🪄', color: '#1565c0', baseDmg: 10, range: 160, cd: 1000, splash: 60 },
    '도적': { type: '도적', icon: '✦', color: '#6a1b9a', baseDmg: 18, range: 200, cd: 800, splash: 0 }
};

const BOSS_WAVES = {
    24: { hp: 10000, meso: 50, ticket: 3, name: "킹 슬라임" },
    37: { hp: 30000, meso: 50, ticket: 4, name: "알리샤르" },
    58: { hp: 100000, meso: 50, ticket: 4, name: "파풀라투스" },
    79: { hp: 300000, meso: 70, ticket: 5, name: "피아누스" },
    90: { hp: 1000000, meso: 100, ticket: 5, name: "자쿰" },
    100: { name: "혼테일", meso: 100, ticket: 5 },
    110: { name: "시그너스", meso: 150, ticket: 5 },
    120: { name: "반반", meso: 150, ticket: 5 },
    130: { name: "피에르", meso: 150, ticket: 5 },
    140: { name: "블러드퀸", meso: 150, ticket: 5 },
    150: { name: "벨룸", meso: 150, ticket: 5 }
};

function getBossInfo(w) {
    if (w < 100 && BOSS_WAVES[w]) return BOSS_WAVES[w];
    if (w >= 100 && w % 5 === 0) {
        let n = (w - 100) / 5;
        let calculatedHp = 2000000 + (n * 1000000) + (Math.pow(n, 2) * 150000);
        let bName = BOSS_WAVES[w] ? BOSS_WAVES[w].name : `심연의 보스 (${w}층)`;
        let bMeso = BOSS_WAVES[w] ? BOSS_WAVES[w].meso : 150;
        let bTicket = BOSS_WAVES[w] ? BOSS_WAVES[w].ticket : 5;
        return { hp: Math.floor(calculatedHp), meso: bMeso, ticket: bTicket, name: bName };
    }
    return null;
}

let state = {
    status: 'TITLE', meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 30, speed: 1, isBoss: false,
    upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} },
    tickets: []
};

let grid = new Array(25).fill(null);
let monsters = [], projectiles = [], towers = [];
let hitEffects = []; let visualEffects = []; let fumaList = []; let damageTexts = [];
let lastTime = 0, waveTimer = 0, spawnTimer = 0;
let selectedUnitIdx = -1; 
let mainReqId; 

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridContainer = document.getElementById('grid-container');
const PATH = [ {x:25,y:25}, {x:475,y:25}, {x:475,y:475}, {x:25,y:475} ];

function initGrid() {
    gridContainer.innerHTML = '';
    for(let i=0; i<25; i++) {
        let cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.onclick = () => window.onCellClick(i);
        gridContainer.appendChild(cell);
    }
}
initGrid();

window.checkSave();

function saveGameData() {
    if (state.status === 'GAMEOVER' || state.status === 'TITLE') return;
    let saveObj = {
        wave: state.wave, meso: state.meso, mp: state.mp, mpTotal: state.mpTotal, kills: state.kills,
        upgrades: state.upgrades, tickets: state.tickets,
        gridData: grid.map(u => u ? { idx: u.idx, gradeIdx: u.gradeIdx, clsName: u.cls.type } : null)
    };
    localStorage.setItem('mapleDefenseSave', JSON.stringify(saveObj));
}

window.loadAndStartGame = () => {
    let saved = JSON.parse(localStorage.getItem('mapleDefenseSave'));
    if(!saved) { window.startNewGame(); return; }
    state.wave = saved.wave; state.meso = saved.meso; state.mp = saved.mp;
    state.mpTotal = saved.mpTotal; state.kills = saved.kills;
    state.upgrades = saved.upgrades; state.tickets = saved.tickets;
    
    state.speed = 1;
    document.getElementById('btn-speed').innerText = "1배속";
    
    grid = new Array(25).fill(null); towers = [];
    saved.gridData.forEach((u) => { if(u) window.addUnit(u.idx, u.gradeIdx, u.clsName, true); });
    
    window.switchScreen('game-container');
    state.status = 'PREP'; state.time = 5; 
    lastTime = performance.now(); state.isBoss = !!getBossInfo(state.wave);
    
    cancelAnimationFrame(mainReqId);
    updateUI(); mainReqId = requestAnimationFrame(loop);
};

window.startNewGame = () => {
    localStorage.removeItem('mapleDefenseSave');
    
    state = {
        status: 'PREP', meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 30, speed: 1, isBoss: false,
        upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} },
        tickets: []
    };
    
    document.getElementById('btn-speed').innerText = "1배속";
    
    grid = new Array(25).fill(null);
    monsters = []; projectiles = []; towers = [];
    hitEffects = []; visualEffects = []; fumaList = []; damageTexts = [];
    waveTimer = 0; spawnTimer = 0; selectedUnitIdx = -1;
    bestWave = localStorage.getItem('mapleDefenseBestWave') || 0;
    
    initGrid();
    window.switchScreen('game-container');
    lastTime = performance.now(); 
    
    cancelAnimationFrame(mainReqId);
    updateUI(); mainReqId = requestAnimationFrame(loop);
};

window.goToLobby = () => { 
    saveGameData(); 
    state.status = 'TITLE';
    cancelAnimationFrame(mainReqId);
    
    document.getElementById('gameover-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    window.closeAllModals();
    
    window.switchScreen('start-screen');
};

setInterval(() => { if(state.status === 'PLAY' || state.status === 'PREP') saveGameData(); }, 3000);

function getTotalGrade() {
    let tg = 0;
    for(let k in cardData) tg += cardData[k].grade;
    return tg;
}
function getTotalCardBonus() {
    let bonus = 0;
    for(let k in cardData) { if(cardData[k].grade > 0) bonus += 1 + (cardData[k].grade - 1) * 0.5; }
    return bonus;
}
function getAvailableCoins() {
    return Math.floor(getTotalGrade() / 2) - spentCoins;
}

window.openBookModal = () => {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('book-modal').style.display = 'flex';
    window.renderBook();
};

window.renderBook = () => {
    let list = document.getElementById('book-list');
    list.innerHTML = '';
    let allBosses = Object.keys(BOSS_WAVES).map(k => BOSS_WAVES[k].name);
    for(let k in cardData) { if(!allBosses.includes(k)) allBosses.push(k); }
    
    allBosses.forEach(bName => {
        let data = cardData[bName] || { owned: 0, grade: 0 };
        let req = data.grade < 10 ? CARD_REQ[data.grade] : 'Max';
        let canUpgrade = data.grade < 10 && data.owned >= req;
        let effectStr = data.grade > 0 ? `+${(1 + (data.grade-1)*0.5).toFixed(1)}%` : `0%`;
        let btnText = data.grade === 0 ? `등록 (${req})` : (data.grade === 10 ? 'MAX' : `강화 (${req})`);
        
        let imgSrc = bossImages[bName] ? bossImages[bName].src : '';
        let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width: 40px; height: 40px; object-fit: contain; margin-right: 8px; flex-shrink: 0; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.4));">` : '';

        list.innerHTML += `
        <div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; text-align:left; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; overflow:hidden;">
                ${imgHtml}
                <div style="overflow:hidden;">
                    <div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${bName} (등급: ${data.grade})</div>
                    <div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">효과: ${effectStr} / 보유: <b style="color:#e65100">${data.owned}장</b></div>
                </div>
            </div>
            <button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:65px;" onclick="upgradeCard('${bName}')">${btnText}</button>
        </div>`;
    });
    document.getElementById('book-total-grade').innerHTML = `총 등급 합계: <span style="color:#c62828;">${getTotalGrade()}</span> (코인: <span style="color:#f57c00;">${getAvailableCoins()}</span>)`;
    document.getElementById('book-total-bonus').innerText = `총 보유 효과: 공격력 +${getTotalCardBonus().toFixed(1)}%`;
};

window.upgradeCard = (bName) => {
    let data = cardData[bName];
    let req = CARD_REQ[data.grade];
    if(data.grade < 10 && data.owned >= req) {
        data.owned -= req; data.grade++;
        localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData));
        window.renderBook();
    }
};

window.openShopModal = () => {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('shop-modal').style.display = 'flex';
    window.renderShop('common');
};

window.renderShop = (category) => {
    document.getElementById('ui-shop-coins').innerText = getAvailableCoins();
    let list = document.getElementById('shop-list');
    list.innerHTML = '';
    let prefix = category === 'common' ? 'common_' : (category === 'warrior' ? 'war_' : (category === 'mage' ? 'mage_' : 'thief_'));
    
    for(let key in SKILL_INFO) {
        if(key.startsWith(prefix)) {
            let info = SKILL_INFO[key];
            let lvl = skillLevels[key];
            let canUpgrade = lvl < info.max && getAvailableCoins() > 0;
            let btnText = lvl === info.max ? 'MAX' : `강화 (1코인)`;
            
            list.innerHTML += `
            <div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; overflow:hidden;">
                    <img src="${info.img}" onerror="this.src='image/mepo.png'" style="width:30px; height:30px; object-fit:contain; margin-right:8px; flex-shrink:0;">
                    <div style="overflow:hidden;">
                        <div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${info.name} <span style="color:#c62828;">Lv.${lvl}</span></div>
                        <div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${info.desc}</div>
                    </div>
                </div>
                <button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:70px;" onclick="upgradeSkill('${key}', '${category}')">${btnText}</button>
            </div>`;
        }
    }
};

window.upgradeSkill = (key, category) => {
    if(skillLevels[key] < SKILL_INFO[key].max && getAvailableCoins() > 0) {
        skillLevels[key]++;
        spentCoins++;
        localStorage.setItem('mapleDefenseSkills', JSON.stringify(skillLevels));
        localStorage.setItem('mapleDefenseSpentCoins', spentCoins);
        window.renderShop(category);
        renderGrid(); 
    }
};

window.openActiveSkillsModal = () => {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('active-skills-modal').style.display = 'flex';
    let list = document.getElementById('active-skills-list');
    list.innerHTML = '';
    let hasSkill = false;
    for(let key in skillLevels) {
        if(skillLevels[key] > 0) {
            hasSkill = true;
            list.innerHTML += `
            <div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; align-items:center; overflow:hidden;">
                <img src="${SKILL_INFO[key].img}" onerror="this.src='image/mepo.png'" style="width:30px; height:30px; object-fit:contain; margin-right:8px; flex-shrink:0;">
                <div style="overflow:hidden;">
                    <div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].name} <span style="color:#c62828;">Lv.${skillLevels[key]}</span></div>
                    <div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].desc}</div>
                </div>
            </div>`;
        }
    }
    if(!hasSkill) list.innerHTML = `<div style="text-align:center; padding: 20px; font-weight:bold; color:#666;">적용중인 스킬이 없습니다.</div>`;
};

function getGradeByProb() {
    let rand = Math.random() * 100; let acc = 0;
    for(let i=0; i<GRADES.length; i++) { acc += GRADES[i].prob; if(rand <= acc) return i; }
    return 0;
}

window.summonUnit = () => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    if(state.meso < 10) return;
    let emptyIdx = grid.findIndex(v => v === null);
    if(emptyIdx === -1) { showMessage("배치 공간이 부족합니다!"); return; }
    state.meso -= 10;
    let gradeIdx = getGradeByProb();
    let clsNames = Object.keys(CLASSES);
    let clsName = clsNames[Math.floor(Math.random() * clsNames.length)];
    window.addUnit(emptyIdx, gradeIdx, clsName);
    updateUI();
};

function showSummonToast(gradeName, gradeIdx, clsName, color) {
    let toast = document.getElementById('summon-toast');
    let fontSize = 16 + (gradeIdx * 2); 
    toast.innerHTML = `<span style="color:${color}">${gradeName}</span> ${clsName}!`;
    toast.style.fontSize = fontSize + 'px';
    toast.style.color = '#fff';
    toast.className = 'toast-show';
    setTimeout(() => { toast.className = ''; }, 1500);

    if (gradeIdx >= 5) {
        let container = document.getElementById('game-container');
        container.classList.add('shake-active');
        setTimeout(() => container.classList.remove('shake-active'), 400);
    }
}

function showBossToast(name, isDrop = false) {
    let toast = document.getElementById('boss-toast');
    if (isDrop) { toast.innerHTML = `🃏 ${name} 카드 획득! 🃏`; toast.style.color = '#ffca28'; } 
    else { toast.innerHTML = `⚠️ 보스 출현: ${name} ⚠️`; toast.style.color = '#ff5252'; }
    toast.className = 'toast-show';
    setTimeout(() => { toast.className = ''; }, 2500);
}

window.addUnit = (idx, gradeIdx, clsName, isLoad = false) => {
    let grade = GRADES[gradeIdx];
    let cls = CLASSES[clsName];
    let unit = {
        idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls,
        x: 75 + (idx % 5) * 70 + 35, y: 75 + Math.floor(idx / 5) * 70 + 35, lastAttack: 0, 
        bindCooldown: 0, globalCooldown: 0 
    };
    grid[idx] = unit;
    towers.push(unit);
    if(!isLoad) showSummonToast(grade.name, gradeIdx, clsName, cls.color);
    renderGrid();
};

window.onCellClick = (idx) => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    if (selectedUnitIdx !== -1) {
        if (selectedUnitIdx === idx) { selectedUnitIdx = -1; } 
        else {
            let target = grid[idx];
            grid[idx] = grid[selectedUnitIdx];
            grid[idx].idx = idx; grid[idx].x = 75 + (idx % 5) * 70 + 35; grid[idx].y = 75 + Math.floor(idx / 5) * 70 + 35;
            grid[selectedUnitIdx] = target;
            if(target) { target.idx = selectedUnitIdx; target.x = 75 + (selectedUnitIdx % 5) * 70 + 35; target.y = 75 + Math.floor(selectedUnitIdx / 5) * 70 + 35; }
            selectedUnitIdx = -1; 
        }
    } else { if (grid[idx]) selectedUnitIdx = idx; }
    renderGrid(); updateUI();
};

window.sellSelectedUnit = () => {
    if(selectedUnitIdx === -1) return;
    let u = grid[selectedUnitIdx];
    if(u && u.grade.sell > 0) {
        state.meso += u.grade.sell; towers = towers.filter(t => t !== u);
        grid[selectedUnitIdx] = null; selectedUnitIdx = -1; renderGrid(); updateUI();
    }
};

window.openBulkSellModal = () => {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('bulk-sell-modal').style.display = 'block';
};

window.executeBulkSell = (type, value) => {
    let soldCount = 0; let earnedMeso = 0;
    for(let i = 0; i < 25; i++) {
        let u = grid[i];
        if(!u || u.grade.sell === 0) continue; 
        let match = false;
        if(type === 'class' && u.cls.type === value) match = true;
        if(type === 'grade' && u.gradeIdx <= value) match = true;
        if(match) { earnedMeso += u.grade.sell; towers = towers.filter(t => t !== u); grid[i] = null; soldCount++; }
    }
    if(soldCount > 0) {
        state.meso += earnedMeso; showMessage(`${soldCount}마리 판매 (+${earnedMeso} 메소)`);
        selectedUnitIdx = -1; renderGrid(); updateUI();
    } else { showMessage("조건에 맞는 유닛이 없습니다."); }
    window.closeAllModals();
};

window.closeAllModals = () => {
    if (state.status === 'GAMEOVER') return; 
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('bulk-sell-modal').style.display = 'none';
    document.getElementById('ticket-modal').style.display = 'none';
    document.getElementById('book-modal').style.display = 'none';
    document.getElementById('shop-modal').style.display = 'none';
    document.getElementById('active-skills-modal').style.display = 'none';
};

function renderGrid() {
    let cells = gridContainer.children;
    for(let i=0; i<25; i++) {
        let u = grid[i];
        cells[i].className = 'grid-cell';
        if (i === selectedUnitIdx) cells[i].classList.add('selected');
        
        if(u) {
            if (u.gradeIdx === 6) cells[i].classList.add('glow-6');
            if (u.gradeIdx === 7) cells[i].classList.add('glow-7');
            if (u.gradeIdx === 8) cells[i].classList.add('glow-8');

            let barsHtml = '';
            if (u.gradeIdx === 6) {
                barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="bind-bar-${u.idx}" style="width: 0%; height: 100%; background: #00e5ff;"></div></div>`;
            }
            if (u.gradeIdx >= 5) {
                if ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
                    let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc');
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="global-bar-${u.idx}" style="width: 0%; height: 100%; background: ${color};"></div></div>`;
                }
            }

            cells[i].innerHTML = `
                <div style="font-size:20px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div>
                <div style="color:${u.cls.color}; font-size:10px; margin-top:2px;">${u.grade.name}</div>
                ${barsHtml}
            `;
        } else { cells[i].innerHTML = ''; }
    }
    
    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if(pkBarContainer && pkState && pkState.active && pkState.unit) {
        let u = pkState.unit;
        if ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
            pkBarContainer.style.display = 'block';
            let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc');
            document.getElementById('pk-global-bar').style.background = color;
        }
    }
}

function spawnMonster() {
    let bInfo = getBossInfo(state.wave);
    let hpBase = bInfo ? bInfo.hp : Math.floor(state.wave * 60 + Math.pow(state.wave, 1.5) * 12);
    monsters.push({
        hp: hpBase, maxHp: hpBase, x: PATH[0].x, y: PATH[0].y,
        targetNode: 1, speed: bInfo ? 25 : 50, isBoss: !!bInfo, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: bInfo ? bInfo.name : null, facingRight: true
    });
}

window.skipBossRound = () => {
    waveTimer = 150; 
    document.getElementById('boss-skip-wrapper').style.display = 'none';
};

function updateWave(dt) {
    waveTimer += dt; spawnTimer += dt;
    let limit = state.isBoss ? 150 : 60; 
    if(waveTimer >= limit) { nextWave(); return; }
    if(!state.isBoss && spawnTimer >= 1.5) { spawnMonster(); spawnTimer = 0; }
    document.getElementById('ui-timer').innerText = Math.max(0, limit - Math.floor(waveTimer));
}

function nextWave() {
    document.getElementById('boss-skip-wrapper').style.display = 'none';
    if(state.isBoss && monsters.some(m => m.isBoss)) { gameOver("보스 처치 실패!"); return; }
    
    state.wave++; waveTimer = 0; spawnTimer = 0;
    let bInfo = getBossInfo(state.wave);
    state.isBoss = !!bInfo;
    
    if (state.wave > bestWave) {
        bestWave = state.wave; localStorage.setItem('mapleDefenseBestWave', bestWave);
    }
    
    if(state.isBoss) { showBossToast(bInfo.name); spawnMonster(); }
    updateUI();
}

function showUpgradeToast(idChar, amt) {
    let box = document.getElementById(`upg-${idChar}-box`);
    let floatEl = document.createElement('div');
    floatEl.className = 'upgrade-toast'; floatEl.innerText = '+' + amt;
    box.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1000);
}

window.upgrade = (type) => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    let u = state.upgrades[type];
    if(state.mp >= u.cost) {
        state.mp -= u.cost;
        let amt = Math.floor(Math.random() * 6) + 1; 
        u.val += amt; u.cost += Math.floor(u.cost * 0.2) + 3;
        let idChar = type === '전사' ? 'w' : (type === '법사' ? 'm' : 't');
        showUpgradeToast(idChar, amt);
        document.getElementById(`upg-${idChar}-val`).innerText = u.val;
        document.getElementById(`upg-${idChar}-cost`).innerText = u.cost;
        updateUI();
    } else { showMessage("메포가 부족합니다."); }
};

let currentTicketTier = 0;

window.openTicketModal = () => {
    if(state.tickets.length === 0) { showMessage("보유한 선택권이 없습니다."); return; }
    currentTicketTier = state.tickets[0]; 
    document.getElementById('ticket-tier').innerText = currentTicketTier;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('ticket-modal').style.display = 'block';
    updateUI();
};

window.useTicket = (choice) => {
    let emptyIdx = grid.findIndex(v => v === null);
    if(emptyIdx === -1) { showMessage("공간 부족!"); return; }
    state.tickets.shift(); 
    let tier = currentTicketTier;
    let cls = choice === '랜덤' ? Object.keys(CLASSES)[Math.floor(Math.random()*3)] : choice;
    if(choice === '랜덤' && Math.random() < 0.2) tier++;
    window.addUnit(emptyIdx, tier, cls); window.closeAllModals(); updateUI();
};

window.toggleSpeed = () => {
    if (state.speed === 1) state.speed = 4;
    else if (state.speed === 4) state.speed = 7;
    else state.speed = 1;
    document.getElementById('btn-speed').innerText = state.speed + "배속";
};

function loop() {
    if(state.status === 'GAMEOVER' || state.status === 'TITLE') return;
    
    let now = performance.now();
    let dt = ((now - lastTime) / 1000) * state.speed;
    if (dt > 0.1) dt = 0.1;
    lastTime = now;
    
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        hitEffects[i].timer -= dt;
        if (hitEffects[i].timer <= 0) hitEffects.splice(i, 1);
    }

    for (let i = visualEffects.length - 1; i >= 0; i--) {
        visualEffects[i].timer -= dt;
        if (visualEffects[i].timer <= 0) {
            let v = visualEffects[i];
            if (v.type === 'death') {
                monsters.forEach(m => m.hp -= v.dmg);
                let container = document.getElementById('game-container');
                if (container) {
                    container.classList.add('mild-shake-active');
                    setTimeout(() => container.classList.remove('mild-shake-active'), 300);
                }
            } else if (v.type === 'thunder') {
                monsters.forEach(m => m.hp -= v.dmg);
            }
            visualEffects.splice(i, 1);
        }
    }

    for (let i = damageTexts.length - 1; i >= 0; i--) {
        damageTexts[i].timer -= dt;
        damageTexts[i].y -= dt * 30; 
        if (damageTexts[i].timer <= 0) damageTexts.splice(i, 1);
    }
    
    if (state.status === 'PREP') {
        state.time -= dt;
        document.getElementById('ui-timer').innerText = Math.ceil(state.time);
        if (state.time <= 0) {
            state.status = 'PLAY'; state.wave = state.wave || 1; waveTimer = 0; spawnTimer = 0;
            showMessage(state.wave + "웨이브 시작!"); updateUI();
        }
        draw(); mainReqId = requestAnimationFrame(loop); return;
    }
    
    updateWave(dt);
    
    for(let i=monsters.length-1; i>=0; i--) {
        let m = monsters[i];
        
        if (m.freezeTimer > 0) {
            m.freezeTimer -= dt;
            m.freezeTickTimer -= dt;
            if (m.freezeTickTimer <= 0) {
                m.hp -= m.freezeDmgVal;
                m.freezeTickTimer = 1; 
            }
        }

        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; }
        if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }

        let t = PATH[m.targetNode];
        let dx = t.x - m.x, dy = t.y - m.y;
        let dist = Math.hypot(dx, dy);
        
        let currentSpeed = m.speed;
        if (m.freezeTimer > 0) currentSpeed *= 0.5;

        let move = currentSpeed * dt;
        
        if (dx > 0) m.facingRight = true;
        else if (dx < 0) m.facingRight = false;
        
        if(dist <= move) {
            m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % PATH.length;
        } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    
    if(monsters.length >= 50) { gameOver("몬스터 50마리 초과! 게임 오버"); return; }
    
    let cardMulti = 1 + (getTotalCardBonus() / 100);
    let rageMulti = 1 + (skillLevels.common_rage * 0.01);
    let sharpChance = skillLevels.common_sharp * 0.05;
    let windReduc = 1 + (skillLevels.common_wind * 0.2);

    towers.forEach(t => {
        if (t.gradeIdx === 6) {
            t.bindCooldown -= dt * 1000;
            let bar = document.getElementById(`bind-bar-${t.idx}`);
            if (bar) bar.style.width = Math.max(0, Math.min(100, ((75000 - t.bindCooldown) / 75000) * 100)) + '%';
            if (t.bindCooldown <= 0 && monsters.length > 0) {
                let target = null;
                for (let m of monsters) { if (m.bindTimer <= 0) { target = m; break; } }
                if (!target) target = monsters[0]; 
                if (target) { target.bindTimer = 10; t.bindCooldown = 75000; }
            }
        }

        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && skillLevels.war_death > 0) || (t.cls.type === '법사' && skillLevels.mage_thunder > 0) || (t.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
                t.globalCooldown -= dt * 1000;
                let gbar = document.getElementById(`global-bar-${t.idx}`);
                if (gbar) gbar.style.width = Math.max(0, Math.min(100, ((60000 - t.globalCooldown) / 60000) * 100)) + '%';
                
                if (t.globalCooldown <= 0 && monsters.length > 0) {
                    let baseDmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15)) * t.grade.mult * cardMulti * rageMulti;
                    
                    if (t.cls.type === '전사' && skillLevels.war_death > 0) {
                        let gdmg = baseDmg * (1 + skillLevels.war_death * 0.1);
                        visualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg });
                        t.globalCooldown = 60000;
                    }
                    else if (t.cls.type === '법사' && skillLevels.mage_thunder > 0) {
                        let gdmg = baseDmg * (1 + skillLevels.mage_thunder * 0.1);
                        visualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg });
                        t.globalCooldown = 60000;
                    }
                    else if (t.cls.type === '도적' && skillLevels.thief_fuma > 0) {
                        let gdmg = baseDmg * (1 + skillLevels.thief_fuma * 0.1);
                        fumaList.push({ x: PATH[0].x, y: PATH[0].y, targetNode: 1, dmg: gdmg, hitSet: new Set(), angle: 0 });
                        t.globalCooldown = 60000;
                    }
                }
            }
        }

        t.lastAttack -= dt * 1000;
        if(t.lastAttack <= 0) {
            let range = t.cls.range * t.grade.rangeMul;
            let target = null, minDist = range;
            for(let m of monsters) {
                let d = Math.hypot(m.x - t.x, m.y - t.y);
                if(d <= minDist) { minDist = d; target = m; }
            }
            if(target) {
                let dmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15)) * t.grade.mult * cardMulti * rageMulti;
                
                let isCrit = Math.random() < sharpChance;
                if (isCrit) dmg *= 1.2;

                let isFinal = false;
                if (t.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < (skillLevels.war_final * 0.03)) {
                    isFinal = true; dmg *= 2;
                }

                projectiles.push({
                    type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y,
                    dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash,
                    color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg
                });

                if (t.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < (skillLevels.thief_shadow * 0.03)) {
                    projectiles.push({
                        type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y,
                        dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash,
                        color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true
                    });
                }

                t.lastAttack = (t.cls.cd * (t.grade.speedMul || 1)) / windReduc;
            }
        }
    });
    
    for(let i=fumaList.length-1; i>=0; i--) {
        let f = fumaList[i];
        f.angle += 10 * dt; 
        let t = PATH[f.targetNode];
        let dx = t.x - f.x, dy = t.y - f.y;
        let dist = Math.hypot(dx, dy);
        let move = 300 * dt; 
        
        monsters.forEach(m => {
            if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 40) {
                m.hp -= f.dmg; f.hitSet.add(m);
            }
        });

        if(dist <= move) {
            f.x = t.x; f.y = t.y; 
            f.targetNode++;
            if (f.targetNode >= PATH.length) f.targetNode = 0;
            if (f.targetNode === 1 && f.hitSet.size > 0) fumaList.splice(i, 1);
        } else {
            f.x += (dx/dist)*move; f.y += (dy/dist)*move;
        }
    }

    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i];
        let dx = p.tx - p.x, dy = p.ty - p.y;
        let dist = Math.hypot(dx, dy);
        let speed = 400 * dt;
        
        if(p.type === '도적') p.angle += 15 * dt; 
        
        if(dist <= speed) {
            if (p.gradeIdx >= 6) {
                hitEffects.push({ x: p.tx, y: p.ty, timer: 0.2, color: p.color });
            }

            if(monsters.includes(p.target)) {
                let hitDmg = p.dmg;
                if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5;
                p.target.hp -= hitDmg;
                if (p.isCrit) damageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 15, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                
                if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) {
                    if (p.target.freezeTimer <= 0) {
                        p.target.freezeTimer = 3; p.target.freezeTickTimer = 1;
                        p.target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1];
                    }
                }
            }
            
            if(p.splash > 0) {
                monsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg;
                        if (p.type === '전사' && m.isBoss) splashDmg *= 1.5;
                        m.hp -= splashDmg;
                        if (p.isCrit) damageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 15, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) {
                            if (m.freezeTimer <= 0) { m.freezeTimer = 3; m.freezeTickTimer = 1; m.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1]; }
                        }
                    }
                });
            }
            projectiles.splice(i, 1);
        } else {
            let moveAmt = speed;
            if (p.isShadow) moveAmt *= 0.85; 
            p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt;
        }
    }
    
    for(let i=monsters.length-1; i>=0; i--) {
        if(monsters[i].hp <= 0) {
            state.kills++; state.mp++; state.mpTotal++;
            if(state.mpTotal >= 10) { state.meso += 5; state.mpTotal -= 10; }
            
            if(monsters[i].isBoss) {
                let bInfo = getBossInfo(state.wave);
                state.meso += bInfo.meso; state.tickets.push(bInfo.ticket);
                showMessage(`${state.wave}라운드 보스 처치!`);
                
                if (Math.random() * 100 <= 20) {
                    cardData[bInfo.name] = cardData[bInfo.name] || { owned: 0, grade: 0 };
                    cardData[bInfo.name].owned++;
                    localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData));
                    showBossToast(bInfo.name, true);
                }
            }
            monsters.splice(i, 1);
            updateUI();
        }
    }
    
    draw();
    document.getElementById('ui-mobs').innerText = `${monsters.length} / 50`;
    mainReqId = requestAnimationFrame(loop);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "rgba(188, 170, 164, 0.2)";
    ctx.lineWidth = 35;
    ctx.lineJoin = "round";
    ctx.beginPath(); ctx.rect(25, 25, 450, 450); ctx.stroke();
    
    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx]) {
        let u = grid[selectedUnitIdx];
        let range = u.cls.range * u.grade.rangeMul;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath(); ctx.arc(u.x, u.y, range, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1; ctx.stroke();
    }
    
    visualEffects.forEach(v => {
        ctx.save();
        if (v.type === 'death') {
            let elapsed = 1.2 - v.timer;
            let progress = Math.min(1, elapsed / 0.2); 

            ctx.strokeStyle = "#ffeb3b"; 
            ctx.lineWidth = 8; 
            ctx.lineCap = "round";
            ctx.shadowColor = "#f57f17";
            ctx.shadowBlur = 10;

            let startX = -50, startY = 450;
            let endX = 550, endY = 50;

            let currentX = startX + (endX - startX) * progress;
            let currentY = startY + (endY - startY) * progress;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            ctx.strokeStyle = "#fff"; 
            ctx.lineWidth = 2; 
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
        } else if (v.type === 'thunder') {
            ctx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; ctx.fillRect(0,0,500,500);
            ctx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; ctx.lineWidth = 15;
            ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(200,250); ctx.lineTo(300,250); ctx.lineTo(250,500); ctx.stroke();
        }
        ctx.restore();
    });

    fumaList.forEach(f => {
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        ctx.fillStyle = "#4a148c"; ctx.shadowColor = "#ea80fc"; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -30); ctx.lineTo(8, -8); ctx.lineTo(30, 0); ctx.lineTo(8, 8);
        ctx.lineTo(0, 30); ctx.lineTo(-8, 8); ctx.lineTo(-30, 0); ctx.lineTo(-8, -8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    });
    
    monsters.forEach(m => {
        let size = m.isBoss ? 16 : 10; 
        
        if (m.isBoss && bossImages[m.name] && bossImages[m.name].complete && bossImages[m.name].naturalWidth > 0) {
            ctx.save();
            ctx.translate(m.x, m.y);
            if (m.facingRight) ctx.scale(-1, 1);
            
            if (m.freezeTimer > 0) {
                ctx.globalAlpha = 0.5; ctx.fillStyle = "#81d4fa";
                ctx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
                ctx.globalAlpha = 1.0;
            }
            ctx.drawImage(bossImages[m.name], -size * 1.5, -size * 1.5, size * 3, size * 3);
            ctx.restore();
        } else {
            if (!m.isBoss) {
                ctx.fillStyle = m.freezeTimer > 0 ? "#81d4fa" : "#81c784";
                ctx.beginPath(); ctx.arc(m.x, m.y + 2, size, Math.PI, 0);
                ctx.fillRect(m.x - size, m.y + 2, size*2, size/2); ctx.fill();
            } else {
                ctx.fillStyle = m.freezeTimer > 0 ? "#81d4fa" : "#ff8a65"; 
                ctx.beginPath(); ctx.arc(m.x, m.y - 2, size, Math.PI, 0); ctx.fill();
                ctx.fillStyle = m.freezeTimer > 0 ? "#b3e5fc" : "#ffe0b2"; ctx.fillRect(m.x - size/2, m.y - 2, size, size - 2);
            }
        }
        
        if (m.bindTimer > 0) {
            ctx.fillStyle = "rgba(0, 200, 255, 0.5)"; 
            ctx.fillRect(m.x - size - 4, m.y - size - 4, (size + 4) * 2, (size + 4) * 2);
            ctx.fillStyle = "#fff"; ctx.font = "12px NanumSquare";
            ctx.fillText("❄️", m.x - 7, m.y + 4); 
        }

        if (m.stunTimer > 0) {
            ctx.fillStyle = "#fff"; ctx.font = "14px NanumSquare";
            ctx.fillText("💫", m.x - 7, m.y - size - 12); 
        }

        ctx.fillStyle = "#000"; ctx.fillRect(m.x-10, m.y-size-8, 20, 3);
        ctx.fillStyle = "#4caf50"; ctx.fillRect(m.x-10, m.y-size-8, 20 * (m.hp/m.maxHp), 3);
    });
    
    projectiles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        let dx = p.tx - p.x; let dy = p.ty - p.y;
        let dir = Math.atan2(dy, dx);
        
        let scale = p.gradeIdx >= 6 ? 1.5 : 1;
        if (p.isFinal) { scale *= 1.3; ctx.globalAlpha = 1.0; }
        else ctx.globalAlpha = 0.8;
        
        ctx.scale(scale, scale);

        if (p.type === '전사') {
            ctx.rotate(dir); ctx.fillStyle = p.isFinal ? "#b71c1c" : "rgba(229, 57, 53, 0.8)";
            ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI/2, Math.PI/2);
            ctx.arc(6, 0, 15, Math.PI/2, -Math.PI/2, true); ctx.fill();
        } else if (p.type === '법사') {
            ctx.rotate(dir); ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = p.isFinal ? 5 : 3;
            ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-6, -6);
            ctx.lineTo(0, 6); ctx.lineTo(6, -6); ctx.lineTo(12, 0); ctx.stroke();
        } else if (p.type === '도적') {
            ctx.rotate(p.angle); ctx.fillStyle = "#4a148c"; ctx.beginPath();
            ctx.moveTo(0, -10); ctx.lineTo(3, -3); ctx.lineTo(10, 0); ctx.lineTo(3, 3);
            ctx.lineTo(0, 10); ctx.lineTo(-3, 3); ctx.lineTo(-10, 0); ctx.lineTo(-3, -3);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    });

    hitEffects.forEach(h => {
        let alpha = h.timer / 0.2; 
        let radius = 5 + (0.2 - h.timer) * 100; 
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = h.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });

    damageTexts.forEach(d => {
        ctx.save();
        ctx.globalAlpha = d.timer / 0.8;
        ctx.fillStyle = "#ffeb3b"; ctx.font = "bold 16px NanumSquare";
        ctx.shadowColor = "#c62828"; ctx.shadowBlur = 4;
        ctx.fillText(d.val, d.x - 10, d.y);
        ctx.restore();
    });
}

function updateUI() {
    document.getElementById('ui-meso').innerText = state.meso;
    document.getElementById('ui-mp').innerText = state.mp;
    document.getElementById('ui-wave').innerText = state.wave;
    document.getElementById('ui-kills').innerText = state.kills.toLocaleString();
    document.getElementById('ui-tickets').innerText = state.tickets.length;
    document.getElementById('btn-summon').disabled = (state.meso < 10);
    
    let sellBtn = document.getElementById('btn-sell-single');
    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx] && grid[selectedUnitIdx].grade.sell > 0) {
        sellBtn.disabled = false;
    } else { sellBtn.disabled = true; }
    
    let skipWrapper = document.getElementById('boss-skip-wrapper');
    if (state.isBoss && monsters.length === 0 && waveTimer > 0) skipWrapper.style.display = 'flex';
    else skipWrapper.style.display = 'none';

    if (state.upgrades) {
        document.getElementById('upg-w-val').innerText = state.upgrades['전사'].val;
        document.getElementById('upg-w-cost').innerText = state.upgrades['전사'].cost;
        document.getElementById('upg-m-val').innerText = state.upgrades['법사'].val;
        document.getElementById('upg-m-cost').innerText = state.upgrades['법사'].cost;
        document.getElementById('upg-t-val').innerText = state.upgrades['도적'].val;
        document.getElementById('upg-t-cost').innerText = state.upgrades['도적'].cost;
    }
}

function showMessage(msg) {
    let ov = document.getElementById('msg-overlay');
    ov.innerText = msg; ov.style.display = 'block';
    setTimeout(() => { ov.style.display = 'none'; }, 2000);
}

function gameOver(msg) {
    state.status = 'GAMEOVER';
    localStorage.removeItem('mapleDefenseSave'); 
    document.getElementById('gameover-msg').innerText = msg;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('gameover-modal').style.display = 'block';
}


// ==========================================
// 월드 펀치킹 시스템 (서버 연동 & 완전 평준화)
// ==========================================
let pkReqId;
let pkState = {
    active: false, time: 60, score: 0, lastTime: 0, speed: 1, bestScore: 0,
    unit: null, scarecrow: { x: 390, y: 250, size: 20, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0 },
    projectiles: [], dmgTexts: [], vfx: []
};

window.loadPkLiveRanking = async () => {
    let list = document.getElementById('pk-live-ranking-list');
    if(!list) return;
    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `pk_rankings`));
        if (snapshot.exists()) {
            let ranks = [];
            snapshot.forEach(childSnap => { ranks.push(childSnap.val()); });
            ranks.sort((a, b) => b.score - a.score);
            ranks = ranks.slice(0, 10);
            
            list.innerHTML = '';
            ranks.forEach((entry, idx) => {
                let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff'));
                list.innerHTML += `
                <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:6px 10px; border-radius:4px; color:${color}; font-weight:bold;">
                    <span>${idx + 1}. ${entry.nickname} <span style="font-size:10px; color:#aaa;">(${entry.class})</span></span>
                    <span>${entry.score.toLocaleString()}점</span>
                </div>`;
            });
        } else {
            list.innerHTML = '<div style="text-align:center; color:#ccc;">아직 등록된 랭킹이 없습니다.</div>';
        }
    } catch(e) {
        list.innerHTML = '<div style="text-align:center; color:#ff5252;">랭킹 서버 연결 실패.</div>';
    }
};

window.openPkMenu = () => {
    document.getElementById('pk-overlay').style.display = 'flex';
    document.getElementById('pk-menu').style.display = 'block';
    document.getElementById('pk-class-select').style.display = 'none';
    document.getElementById('pk-ranking').style.display = 'none';
    document.getElementById('pk-result-modal').style.display = 'none';
    document.getElementById('pk-result-overlay').style.display = 'none';
};

window.closePk = () => {
    document.getElementById('pk-overlay').style.display = 'none';
    pkState.active = false;
    cancelAnimationFrame(pkReqId);
};

window.showPkClassSelect = () => {
    if (!currentUserUid) {
        alert("로그인이 필요한 서비스입니다.");
        return;
    }
    document.getElementById('pk-menu').style.display = 'none';
    document.getElementById('pk-class-select').style.display = 'block';
};

// 메인 랭킹 보드 보기
window.showPkRanking = async () => {
    document.getElementById('pk-menu').style.display = 'none';
    document.getElementById('pk-class-select').style.display = 'none';
    document.getElementById('pk-result-modal').style.display = 'none';
    document.getElementById('pk-result-overlay').style.display = 'none';
    
    document.getElementById('pk-overlay').style.display = 'flex';
    document.getElementById('pk-ranking').style.display = 'flex';
    
    let list = document.getElementById('pk-ranking-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">서버에서 랭킹을 불러오는 중...</div>';
    
    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `pk_rankings`));
        if (snapshot.exists()) {
            let ranks = [];
            snapshot.forEach(childSnap => { ranks.push(childSnap.val()); });
            ranks.sort((a, b) => b.score - a.score);
            ranks = ranks.slice(0, 10);
            
            list.innerHTML = '';
            ranks.forEach((entry, idx) => {
                let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff'));
                list.innerHTML += `
                <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; color:${color}; font-weight:bold;">
                    <span>${idx + 1}위 - ${entry.nickname} (${entry.class})</span>
                    <span>${entry.score.toLocaleString()}점 <span style="font-size:10px; color:#aaa;">(${entry.date})</span></span>
                </div>`;
            });
        } else {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">아직 등록된 랭킹이 없습니다. 첫 랭커에 도전하세요!</div>';
        }
    } catch(e) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#ff5252;">랭킹 서버와 연결할 수 없습니다.</div>';
    }
};

window.togglePkSpeed = () => {
    if (pkState.speed === 1) pkState.speed = 4;
    else if (pkState.speed === 4) pkState.speed = 7;
    else pkState.speed = 1;
    document.getElementById('pk-btn-speed').innerText = pkState.speed + "배속";
};

window.startPkGame = async (clsName) => {
    document.getElementById('pk-overlay').style.display = 'none'; 
    window.switchScreen('pk-game');
    window.loadPkLiveRanking();
    
    let grade = GRADES[8]; 
    let cls = CLASSES[clsName];
    
    document.getElementById('pk-unit-icon').innerText = cls.icon;
    document.getElementById('pk-unit-name').style.color = cls.color;
    
    let bestScore = 0;
    if (currentUserUid) {
        try {
            let snapshot = await get(child(ref(database), `pk_rankings/${currentUserUid}`));
            if(snapshot.exists()) bestScore = snapshot.val().score;
        } catch(e) {}
    }

    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if (pkBarContainer) {
        if ((cls.type === '전사' && skillLevels.war_death > 0) || (cls.type === '법사' && skillLevels.mage_thunder > 0) || (cls.type === '도적' && skillLevels.thief_fuma > 0)) {
            pkBarContainer.style.display = 'block';
            let color = cls.type === '전사' ? '#ffeb3b' : (cls.type === '법사' ? '#00e5ff' : '#ab47bc');
            document.getElementById('pk-global-bar').style.background = color;
            document.getElementById('pk-global-bar').style.width = '0%';
        } else {
            pkBarContainer.style.display = 'none';
        }
    }
    
    pkState = {
        active: true, time: 60, score: 0, lastTime: performance.now(), speed: 1, bestScore: bestScore,
        unit: { cls: cls, grade: grade, gradeIdx: 8, x: 110, y: 250, lastAttack: 0, globalCooldown: 0 },
        scarecrow: { x: 390, y: 250, size: 20, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0 },
        projectiles: [], dmgTexts: [], vfx: []
    };
    
    document.getElementById('pk-score').innerText = '0';
    document.getElementById('pk-time').innerText = '60';
    document.getElementById('pk-btn-speed').innerText = "1배속";
    
    pkLoop();
};

function pkLoop() {
    if (!pkState.active) return;
    
    let now = performance.now();
    let dt = ((now - pkState.lastTime) / 1000) * pkState.speed;
    if (dt > 0.1) dt = 0.1;
    pkState.lastTime = now;
    
    pkState.time -= dt; 
    document.getElementById('pk-time').innerText = Math.ceil(Math.max(0, pkState.time));
    
    if (pkState.time <= 0) {
        pkState.active = false;
        cancelAnimationFrame(pkReqId);
        
        let finalScore = Math.floor(pkState.score);
        let scoreHtml = finalScore.toLocaleString();
        
        if (finalScore > pkState.bestScore && finalScore > 0) {
            scoreHtml += ' <span style="font-size:16px; color:#ffeb3b; text-shadow:1px 1px 2px #000;">(신기록!)</span>';
        }
        
        document.getElementById('pk-final-score').innerHTML = scoreHtml;
        document.getElementById('pk-result-overlay').style.display = 'block';
        document.getElementById('pk-result-modal').style.display = 'block';
        return; 
    }
    
    let u = pkState.unit;
    let target = pkState.scarecrow;
    
    if (target.freezeTimer > 0) {
        target.freezeTimer -= dt;
        target.freezeTickTimer -= dt;
        if (target.freezeTickTimer <= 0) {
            pkApplyDmg(target.freezeDmgVal, false);
            target.freezeTickTimer = 1; 
        }
    }

    let cardMulti = 1 + (getTotalCardBonus() / 100);
    let rageMulti = 1 + (skillLevels.common_rage * 0.01);
    let sharpChance = skillLevels.common_sharp * 0.05;
    let windReduc = 1 + (skillLevels.common_wind * 0.2);
    
    let pkBaseDmg = 20; 
    let pkBaseCd = 1000;
    
    if ((u.cls.type === '전사' && skillLevels.war_death > 0) || 
        (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || 
        (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
        
        u.globalCooldown -= dt * 1000;
        let pbar = document.getElementById('pk-global-bar');
        if (pbar) pbar.style.width = Math.max(0, Math.min(100, ((60000 - u.globalCooldown) / 60000) * 100)) + '%';
        
        if (u.globalCooldown <= 0) {
            let baseDmg = pkBaseDmg * u.grade.mult * cardMulti * rageMulti; 
            if (u.cls.type === '전사' && skillLevels.war_death > 0) {
                let gdmg = baseDmg * (1 + skillLevels.war_death * 0.1);
                pkState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg });
                u.globalCooldown = 60000;
            } else if (u.cls.type === '법사' && skillLevels.mage_thunder > 0) {
                let gdmg = baseDmg * (1 + skillLevels.mage_thunder * 0.1);
                pkState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg });
                u.globalCooldown = 60000;
            } else if (u.cls.type === '도적' && skillLevels.thief_fuma > 0) {
                let gdmg = baseDmg * (1 + skillLevels.thief_fuma * 0.1);
                pkApplyDmg(gdmg, false); pkState.vfx.push({ type: 'fuma', timer: 0.5 }); u.globalCooldown = 60000;
            }
        }
    }
    
    u.lastAttack -= dt * 1000;
    if (u.lastAttack <= 0) {
        let dmg = pkBaseDmg * u.grade.mult * cardMulti * rageMulti;
        let isCrit = Math.random() < sharpChance;
        if (isCrit) dmg *= 1.2;
        
        let isFinal = false;
        if (u.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < (skillLevels.war_final * 0.03)) {
            isFinal = true; dmg *= 2;
        }
        
        pkState.projectiles.push({
            type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y,
            dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg
        });
        
        if (u.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < (skillLevels.thief_shadow * 0.03)) {
            pkState.projectiles.push({
                type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y,
                dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, isFinal: false, isShadow: true
            });
        }
        
        u.lastAttack = (pkBaseCd * (u.grade.speedMul || 1)) / windReduc;
    }
    
    for (let i = pkState.projectiles.length - 1; i >= 0; i--) {
        let p = pkState.projectiles[i];
        let dx = p.tx - p.x, dy = p.ty - p.y;
        let dist = Math.hypot(dx, dy);
        let speed = 400 * dt;
        
        if (p.type === '도적') p.angle += 15 * dt;
        
        if (dist <= speed) {
            pkApplyDmg(p.dmg, p.isCrit);
            
            if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) {
                if (target.freezeTimer <= 0) {
                    target.freezeTimer = 3; target.freezeTickTimer = 1;
                    target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1];
                }
            }
            
            pkState.projectiles.splice(i, 1);
        } else {
            let moveAmt = speed;
            if (p.isShadow) moveAmt *= 0.85;
            p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt;
        }
    }
    
    for (let i = pkState.dmgTexts.length - 1; i >= 0; i--) {
        pkState.dmgTexts[i].timer -= dt;
        pkState.dmgTexts[i].y -= dt * 30; 
        if (pkState.dmgTexts[i].timer <= 0) pkState.dmgTexts.splice(i, 1);
    }
    
    for (let i = pkState.vfx.length - 1; i >= 0; i--) {
        pkState.vfx[i].timer -= dt;
        if (pkState.vfx[i].timer <= 0) {
            let v = pkState.vfx[i];
            if (v.type === 'death') {
                pkApplyDmg(v.dmg, false);
                let container = document.getElementById('pk-game');
                if(container) {
                    container.classList.add('mild-shake-active');
                    setTimeout(() => container.classList.remove('mild-shake-active'), 300);
                }
            } else if (v.type === 'thunder') {
                pkApplyDmg(v.dmg, false);
            }
            pkState.vfx.splice(i, 1);
        }
    }
    
    drawPk();
    pkReqId = requestAnimationFrame(pkLoop);
}

function pkApplyDmg(dmg, isCrit) {
    pkState.score += (dmg / 10000);
    document.getElementById('pk-score').innerText = Math.floor(pkState.score).toLocaleString();
    
    let ox = (Math.random() - 0.5) * 15; 
    let oy = (Math.random() - 0.5) * 15; 
    pkState.dmgTexts.push({ val: Math.floor(dmg), x: pkState.scarecrow.x + ox, y: pkState.scarecrow.y - 40 + oy, timer: 0.6, isCrit: isCrit });
}

window.submitPkScore = async () => {
    let finalScore = Math.floor(pkState.score);
    let className = pkState.unit.cls.type;
    
    if (!currentUserUid) {
        alert("로그인이 끊어졌습니다.");
        window.switchScreen('start-screen');
        return;
    }

    const btnSubmit = document.getElementById('btn-submit-pk');
    if(btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerText = "서버에 저장 중..."; }

    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `pk_rankings/${currentUserUid}`));
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (finalScore > data.score) {
                await set(ref(database, `pk_rankings/${currentUserUid}`), {
                    nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString()
                });
            }
        } else {
            await set(ref(database, `pk_rankings/${currentUserUid}`), {
                nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString()
            });
        }
    } catch(e) {
        console.error(e);
        alert("서버 통신 중 오류가 발생했습니다.");
    }
    
    if(btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerText = "랭킹 등록하고 로비로"; }
    
    document.getElementById('pk-result-overlay').style.display = 'none';
    document.getElementById('pk-result-modal').style.display = 'none';
    window.switchScreen('start-screen');
    window.loadPkLiveRanking(); 
};

window.endPkGame = (isGiveUp) => {
    pkState.active = false;
    cancelAnimationFrame(pkReqId);
    if (isGiveUp) { 
        window.switchScreen('start-screen'); 
    }
};

function drawPk() {
    let pkCanvas = document.getElementById('pkCanvas');
    let pkCtx = pkCanvas.getContext('2d');
    pkCtx.clearRect(0, 0, pkCanvas.width, pkCanvas.height);
    
    pkCtx.strokeStyle = "rgba(188, 170, 164, 0.2)";
    pkCtx.lineWidth = 35;
    pkCtx.lineJoin = "round";
    pkCtx.beginPath(); pkCtx.rect(25, 25, 450, 450); pkCtx.stroke();
    
    let m = pkState.scarecrow;
    let size = 25; 
    
    if (husooabiImg && husooabiImg.complete && husooabiImg.naturalWidth > 0) {
        pkCtx.save();
        pkCtx.translate(m.x, m.y);
        if (m.freezeTimer > 0) {
            pkCtx.globalAlpha = 0.5; pkCtx.fillStyle = "#81d4fa";
            pkCtx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
            pkCtx.globalAlpha = 1.0;
        }
        pkCtx.drawImage(husooabiImg, -size * 1.5, -size * 1.5, size * 3, size * 3);
        pkCtx.restore();
    } else {
        pkCtx.font = "40px NanumSquare";
        pkCtx.textAlign = "center";
        pkCtx.textBaseline = "middle";
        pkCtx.fillText("🎃", m.x, m.y); 
    }
    
    if (m.freezeTimer > 0) {
        pkCtx.fillStyle = "rgba(0, 200, 255, 0.5)"; 
        pkCtx.fillRect(m.x - 20, m.y - 20, 40, 40);
        pkCtx.fillStyle = "#fff"; pkCtx.font = "16px NanumSquare";
        pkCtx.fillText("❄️", m.x + 15, m.y - 15); 
    }
    
    pkState.projectiles.forEach(p => {
        pkCtx.save();
        pkCtx.translate(p.x, p.y);
        let dir = Math.atan2(p.ty - p.y, p.tx - p.x);
        let scale = 1.5;
        if (p.isFinal) { scale *= 1.3; pkCtx.globalAlpha = 1.0; }
        else pkCtx.globalAlpha = 0.8;
        
        pkCtx.scale(scale, scale);
        if (p.type === '전사') {
            pkCtx.rotate(dir); pkCtx.fillStyle = p.isFinal ? "#b71c1c" : "rgba(229, 57, 53, 0.8)";
            pkCtx.beginPath(); pkCtx.arc(0, 0, 15, -Math.PI/2, Math.PI/2);
            pkCtx.arc(6, 0, 15, Math.PI/2, -Math.PI/2, true); pkCtx.fill();
        } else if (p.type === '법사') {
            pkCtx.rotate(dir); pkCtx.strokeStyle = "#00e5ff"; pkCtx.lineWidth = p.isFinal ? 5 : 3;
            pkCtx.beginPath(); pkCtx.moveTo(-12, 0); pkCtx.lineTo(-6, -6);
            pkCtx.lineTo(0, 6); pkCtx.lineTo(6, -6); pkCtx.lineTo(12, 0); pkCtx.stroke();
        } else if (p.type === '도적') {
            pkCtx.rotate(p.angle); pkCtx.fillStyle = "#4a148c"; pkCtx.beginPath();
            pkCtx.moveTo(0, -10); pkCtx.lineTo(3, -3); pkCtx.lineTo(10, 0); pkCtx.lineTo(3, 3);
            pkCtx.lineTo(0, 10); pkCtx.lineTo(-3, 3); pkCtx.lineTo(-10, 0); pkCtx.lineTo(-3, -3);
            pkCtx.closePath(); pkCtx.fill();
        }
        pkCtx.restore();
    });
    
    pkState.dmgTexts.forEach(d => {
        pkCtx.save();
        pkCtx.globalAlpha = Math.max(0, d.timer / 0.6);
        pkCtx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff";
        pkCtx.font = d.isCrit ? "900 24px NanumSquare" : "bold 18px NanumSquare";
        pkCtx.shadowColor = d.isCrit ? "#c62828" : "#000"; 
        pkCtx.shadowBlur = 4;
        pkCtx.fillText(d.val, d.x, d.y);
        pkCtx.restore();
    });
    
    pkState.vfx.forEach(v => {
        pkCtx.save();
        if (v.type === 'death') {
            let elapsed = 1.2 - v.timer;
            let progress = Math.min(1, elapsed / 0.2); 

            pkCtx.strokeStyle = "#ffeb3b"; 
            pkCtx.lineWidth = 8; 
            pkCtx.lineCap = "round";
            pkCtx.shadowColor = "#f57f17";
            pkCtx.shadowBlur = 10;

            let startX = -50, startY = 450;
            let endX = 550, endY = 50;

            let currentX = startX + (endX - startX) * progress;
            let currentY = startY + (endY - startY) * progress;

            pkCtx.beginPath();
            pkCtx.moveTo(startX, startY);
            pkCtx.lineTo(currentX, currentY);
            pkCtx.stroke();

            pkCtx.strokeStyle = "#fff"; 
            pkCtx.lineWidth = 2; 
            pkCtx.beginPath();
            pkCtx.moveTo(startX, startY);
            pkCtx.lineTo(currentX, currentY);
            pkCtx.stroke();
        } else if (v.type === 'thunder') {
            pkCtx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; pkCtx.fillRect(0,0,500,500);
            pkCtx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; pkCtx.lineWidth = 15;
            pkCtx.beginPath(); pkCtx.moveTo(250,0); pkCtx.lineTo(200,250); pkCtx.lineTo(300,250); pkCtx.lineTo(250,500); pkCtx.stroke();
        } else if (v.type === 'fuma') {
            pkCtx.fillStyle = `rgba(171, 71, 188, ${v.timer})`; pkCtx.fillRect(0,0,500,500);
        }
        pkCtx.restore();
    });
}