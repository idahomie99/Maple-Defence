// 🔥 1.0.49 버전 - 모험모드 멈춤 버그 해결, 오리지널 스킬 이펙트 복구, 밸런스 패치 완료
const GAME_VERSION = "1.0.49"; 

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, onValue, remove, onDisconnect, runTransaction, update } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

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

// ==========================================
// 1. 글로벌 변수
// ==========================================
let currentUserName = "이름없는 용사";
let currentUserUid = null;
let lastNicknameChange = 0; 
let userRankData = { rp: 1000, rankMoney: 0, bonusCoins: 0 };

let userInventory = { 
    coinPieces: 0, equipBoxes: 0,
    boxes: { '브론즈': 0, '실버': 0, '골드': 0, '플래티넘': 0, '다이아몬드': 0, '챌린저': 0 }
};
let userEquips = []; 
let userEquipped = { '뱃지': null, '엠블럼': null, '링': null }; 
let equipStats = { atk: 0, spd: 0, crit: 0 }; 

let raidState = {
    status: 'TITLE', active: false, time: 60, prepTime: 10, meso: 30,
    totalDmg: 0, pendingDmg: 0, lastTime: 0,
    bossHp: 7000000, maxHp: 7000000,
    gotLastHit: false, rewardClaimedForKills: [],
    units: [null, null, null], projectiles: [], vfx: [], dmgTexts: []
};
let raidReqId;

let state = {
    status: 'TITLE', meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 5, speed: 1, isBoss: false,
    upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} },
    tickets: [], isRank: false
};

let grid = []; let oppGrid = [];
let monsters = [], projectiles = [], towers = [];
let hitEffects = [], visualEffects = [], fumaList = [], damageTexts = [];
let lastTime = 0, waveTimer = 0, spawnTimer = 0;
let selectedUnitIdx = -1; let mainReqId; 

let pkState; let pkReqId;
let rankState = { active: false };
let oppState = { wave: 1, meso: 100, isDead: false, isBoss: false };
let oppMonsters = [], oppProjectiles = [], oppTowers = [];
let oppVisualEffects = [], oppFumaList = [], oppDamageTexts = [];
let oppWaveTimer = 0, oppSpawnTimer = 0;
let oppCardData = {}, oppSkillLevels = {};
let currentPath = [];

// ==========================================
// 2. DOM 요소 연결
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const oppCanvas = document.getElementById('oppCanvas');
const oppCtx = oppCanvas ? oppCanvas.getContext('2d') : null;
const gridContainer = document.getElementById('grid-container');

document.getElementById('version-display').innerText = `Beta v${GAME_VERSION}`;
let updateOverlay = document.getElementById('update-overlay');
if(updateOverlay) updateOverlay.style.display = 'none';

// ==========================================
// 3. 로컬 스토리지 데이터 로드 & 상수 정의
// ==========================================
let bestWaveStr = localStorage.getItem('mapleDefenseBestWave'); 
let bestWave = bestWaveStr ? parseInt(bestWaveStr) : 0; if (isNaN(bestWave)) bestWave = 0; 
document.getElementById('ui-best-wave').innerText = bestWave;

let cardData = JSON.parse(localStorage.getItem('mapleDefenseCards')) || {}; 
const CARD_REQ = [1, 2, 4, 8, 12, 16, 20, 24, 28, 32]; 
let spentCoins = parseInt(localStorage.getItem('mapleDefenseSpentCoins')) || 0;
let skillLevels = JSON.parse(localStorage.getItem('mapleDefenseSkills')) || { common_wind: 0, common_sharp: 0, common_rage: 0, war_final: 0, war_death: 0, mage_freeze: 0, mage_thunder: 0, thief_shadow: 0, thief_fuma: 0 };

const SKILL_INFO = {
    common_wind: { name: "윈드 부스트", max: 5, getDesc: (lv) => `공격 속도 ${lv * 20}%p 증가`, img: "image/windboost.png" },
    common_sharp: { name: "샤프 아이즈", max: 5, getDesc: (lv) => `치명타 ${lv * 5}%p 증가 (1.2배 피해)`, img: "image/sharpeyes.png" },
    common_rage: { name: "분노", max: 5, getDesc: (lv) => `최종 공격력 ${lv * 1}%p 증가`, img: "image/rage.png" },
    war_final: { name: "파이널 어택", max: 5, getDesc: (lv) => `${lv * 3}%p 확률로 2배 피해 (전사)`, img: "image/finalattack.png" },
    war_death: { name: "데스폴트", max: 5, getDesc: (lv) => `60초마다 전역 피해 ${500 + lv * 500}% (전사 5차↑)`, img: "image/despolt.png" },
    mage_freeze: { name: "프리즈", max: 5, getDesc: (lv) => `적 빙결 및 도트 피해 (${lv}단계)`, img: "image/freeze.png" },
    mage_thunder: { name: "썬더 브레이크", max: 5, getDesc: (lv) => `60초마다 전역 피해 ${500 + lv * 500}% (법사 5차↑)`, img: "image/thunderbreak.png" },
    thief_shadow: { name: "섀도우 파트너", max: 5, getDesc: (lv) => `${lv * 3}%p 확률로 투사체 추가 (도적)`, img: "image/shadowpartner.png" },
    thief_fuma: { name: "풍마 수리검", max: 5, getDesc: (lv) => `60초마다 맵 순회 수리검 ${500 + lv * 500}% (도적 5차↑)`, img: "image/fumashuriken.png" }
};

const bossImages = { "킹 슬라임": new Image(), "알리샤르": new Image(), "파풀라투스": new Image(), "피아누스": new Image(), "자쿰": new Image(), "혼테일": new Image(), "시그너스": new Image(), "반반": new Image(), "피에르": new Image(), "블러드퀸": new Image(), "벨룸": new Image(), "어둠의 늑대": new Image() };
bossImages["킹 슬라임"].src = "image/kingslime.png"; bossImages["알리샤르"].src = "image/alishar.png"; bossImages["파풀라투스"].src = "image/papulatus.png"; bossImages["피아누스"].src = "image/pianus.png"; bossImages["자쿰"].src = "image/zakum.png"; bossImages["혼테일"].src = "image/horntail.png"; bossImages["시그너스"].src = "image/signus.png"; bossImages["반반"].src = "image/banban.png"; bossImages["피에르"].src = "image/pierr.png"; bossImages["블러드퀸"].src = "image/bloodqueen.png"; bossImages["벨룸"].src = "image/velroom.png"; bossImages["어둠의 늑대"].src = "image/darkwolf.png";
const husooabiImg = new Image(); husooabiImg.src = "image/husooabi.png";
const projImages = { warrior1: new Image(), warrior2: new Image(), mage1: new Image(), mage2: new Image(), rogue1: new Image(), rogue2: new Image() };
projImages.warrior1.src = "image/warrior1.png"; projImages.warrior2.src = "image/warrior2.png"; projImages.mage1.src = "image/magician1.png"; projImages.mage2.src = "image/magician2.png"; projImages.rogue1.src = "image/rogue1.png"; projImages.rogue2.src = "image/rogue2.png";
const fumaImg = new Image(); fumaImg.src = "image/fumashurikenimage.png";

const GRADES = [
    { name: "초보자", prob: 50.0, sell: 3, mult: 1, rangeMul: 1 }, { name: "1차", prob: 33.1, sell: 6, mult: 2, rangeMul: 1 },
    { name: "2차", prob: 10.2, sell: 9, mult: 4, rangeMul: 1 }, { name: "3차", prob: 5.1, sell: 16, mult: 8, rangeMul: 1.2, speedMul: 0.8 },
    { name: "4차", prob: 0.8, sell: 30, mult: 16, rangeMul: 1.2 }, { name: "5차", prob: 0.5, sell: 0, mult: 32, rangeMul: 1.2, splash: true },
    { name: "6차", prob: 0.2, sell: 0, mult: 64, rangeMul: 4, splash: true }, { name: "제네시스", prob: 0.08, sell: 0, mult: 128, rangeMul: 4, splash: true },
    { name: "데스티니", prob: 0.019, sell: 0, mult: 256, rangeMul: 6, splash: true }
];

const CLASSES = {
    '전사': { type: '전사', icon: '🗡️', color: '#c62828', baseDmg: 26, range: 100, cd: 1000, splash: 40 },
    '법사': { type: '법사', icon: '🪄', color: '#1565c0', baseDmg: 10, range: 160, cd: 1000, splash: 60 },
    '도적': { type: '도적', icon: '✦', color: '#6a1b9a', baseDmg: 18, range: 200, cd: 800, splash: 0 }
};

const BOSS_WAVES = { 24: { hp: 10000, meso: 50, ticket: 3, name: "킹 슬라임" }, 37: { hp: 30000, meso: 50, ticket: 4, name: "알리샤르" }, 58: { hp: 100000, meso: 50, ticket: 4, name: "파풀라투스" }, 79: { hp: 300000, meso: 70, ticket: 5, name: "피아누스" }, 90: { hp: 800000, meso: 100, ticket: 5, name: "자쿰" }, 100: { name: "혼테일", meso: 100, ticket: 5 }, 110: { name: "시그너스", meso: 150, ticket: 5 }, 120: { name: "반반", meso: 150, ticket: 5 }, 130: { name: "피에르", meso: 150, ticket: 5 }, 140: { name: "블러드퀸", meso: 150, ticket: 5 }, 150: { name: "벨룸", meso: 150, ticket: 5 } };

// ==========================================
// 4. 유틸리티 및 인증 함수
// ==========================================
function showMessage(msg) { let ov = document.getElementById('msg-overlay'); if(!ov) return; ov.innerText = msg; ov.style.display = 'block'; setTimeout(() => { ov.style.display = 'none'; }, 2000); }

function calculateEquipStats() {
    equipStats = { atk: 0, spd: 0, crit: 0 };
    ['뱃지', '엠블럼', '링'].forEach(slot => { let item = userEquipped[slot]; if (item) { equipStats.atk += item.atk || 0; equipStats.spd += item.spd || 0; equipStats.crit += item.crit || 0; } });
}

window.syncToCloud = async () => {
    if (!currentUserUid) return;
    let cloudProfile = {
        save: localStorage.getItem('mapleDefenseSave') || null, cards: localStorage.getItem('mapleDefenseCards') || null, skills: localStorage.getItem('mapleDefenseSkills') || null, coins: localStorage.getItem('mapleDefenseSpentCoins') || null, bestWave: localStorage.getItem('mapleDefenseBestWave') || null,
        rp: userRankData.rp, rankMoney: userRankData.rankMoney, bonusCoins: userRankData.bonusCoins, raidDate: localStorage.getItem('mapleDefenseRaidDate') || null, inventory: userInventory, equips: userEquips, equipped: userEquipped
    };
    await set(ref(database, `users/${currentUserUid}/cloudData`), cloudProfile);
    calculateEquipStats();
};

window.checkSave = () => { let btn = document.getElementById('btn-continue'); if (btn) { if (localStorage.getItem('mapleDefenseSave')) btn.style.display = 'flex'; else btn.style.display = 'none'; } };

window.switchScreen = (screenId) => {
    ['login-screen', 'start-screen', 'game-container', 'pk-game', 'raid-game'].forEach(id => { let el = document.getElementById(id); if(el) el.style.display = 'none'; });
    let activeEl = document.getElementById(screenId); if(activeEl) activeEl.style.display = 'flex';
    if (screenId === 'start-screen') window.checkSave();
};

window.closeAllModals = () => { if (state.status === 'GAMEOVER') return; ['overlay', 'bulk-sell-modal', 'ticket-modal', 'book-modal', 'shop-modal', 'active-skills-modal'].forEach(id => { let el = document.getElementById(id); if(el) el.style.display = 'none'; }); };

function gameOver(msg) { state.status = 'GAMEOVER'; localStorage.removeItem('mapleDefenseSave'); document.getElementById('gameover-msg').innerText = msg; document.getElementById('overlay').style.display = 'block'; document.getElementById('gameover-modal').style.display = 'block'; if (currentUserUid) window.syncToCloud(); }

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid; const dbRef = ref(database);
        const nickSnap = await get(child(dbRef, `users/${currentUserUid}/nickname`));
        if (nickSnap.exists()) {
            currentUserName = nickSnap.val(); document.getElementById('current-user-name').innerText = currentUserName;
            const changeSnap = await get(child(dbRef, `users/${currentUserUid}/lastNicknameChange`)); if (changeSnap.exists()) lastNicknameChange = changeSnap.val();
        } else { document.getElementById('nickname-overlay').style.display = 'block'; document.getElementById('nickname-modal').style.display = 'block'; }

        const cloudSnap = await get(child(dbRef, `users/${currentUserUid}/cloudData`));
        if (cloudSnap.exists()) {
            let cloud = cloudSnap.val();
            let localBestStr = localStorage.getItem('mapleDefenseBestWave'); let localBest = localBestStr ? parseInt(localBestStr) : 0; if (isNaN(localBest)) localBest = 0;
            let cloudBestStr = cloud.bestWave; let cloudBest = cloudBestStr ? parseInt(cloudBestStr) : 0; if (isNaN(cloudBest)) cloudBest = 0;
            
            let parsedRp = parseInt(cloud.rp); userRankData.rp = isNaN(parsedRp) ? 1000 : parsedRp;
            let parsedRankMoney = parseInt(cloud.rankMoney); userRankData.rankMoney = isNaN(parsedRankMoney) ? 0 : parsedRankMoney;
            let parsedBonusCoins = parseInt(cloud.bonusCoins); userRankData.bonusCoins = isNaN(parsedBonusCoins) ? 0 : parsedBonusCoins;

            userInventory = cloud.inventory || {}; userInventory.coinPieces = userInventory.coinPieces || 0; userInventory.equipBoxes = userInventory.equipBoxes || 0; userInventory.boxes = userInventory.boxes || { '브론즈': 0, '실버': 0, '골드': 0, '플래티넘': 0, '다이아몬드': 0, '챌린저': 0 };
            if(userInventory.boxes.gold !== undefined || userInventory.boxes.bronze !== undefined) {
                userInventory.boxes['브론즈'] = (userInventory.boxes['브론즈'] || 0) + (userInventory.boxes.bronze || 0); userInventory.boxes['실버'] = (userInventory.boxes['실버'] || 0) + (userInventory.boxes.silver || 0); userInventory.boxes['골드'] = (userInventory.boxes['골드'] || 0) + (userInventory.boxes.gold || 0); userInventory.boxes['플래티넘'] = (userInventory.boxes['플래티넘'] || 0) + (userInventory.boxes.platinum || 0); userInventory.boxes['다이아몬드'] = (userInventory.boxes['다이아몬드'] || 0) + (userInventory.boxes.diamond || 0); userInventory.boxes['챌린저'] = (userInventory.boxes['챌린저'] || 0) + (userInventory.boxes.challenger || 0);
                delete userInventory.boxes.bronze; delete userInventory.boxes.silver; delete userInventory.boxes.gold; delete userInventory.boxes.platinum; delete userInventory.boxes.diamond; delete userInventory.boxes.challenger;
            }
            if (cloud.monsterPieces && parseInt(cloud.monsterPieces) > 0) userInventory.coinPieces += parseInt(cloud.monsterPieces);

            userEquipped = cloud.equipped || {}; userEquipped['뱃지'] = userEquipped['뱃지'] || userEquipped.badge || null; userEquipped['엠블럼'] = userEquipped['엠블럼'] || userEquipped.emblem || null; userEquipped['링'] = userEquipped['링'] || userEquipped.ring || null;
            delete userEquipped.badge; delete userEquipped.emblem; delete userEquipped.ring;
            ['뱃지', '엠블럼', '링'].forEach(slot => { if (userEquipped[slot] && userEquipped[slot].type) { if (userEquipped[slot].type === 'badge') userEquipped[slot].type = '뱃지'; if (userEquipped[slot].type === 'emblem') userEquipped[slot].type = '엠블럼'; if (userEquipped[slot].type === 'ring') userEquipped[slot].type = '링'; } });
            
            if (cloud.equips) { let equipsArr = Array.isArray(cloud.equips) ? cloud.equips : Object.values(cloud.equips); userEquips = equipsArr.filter(eq => eq !== null && eq !== undefined).map(eq => { if(eq.type === 'badge') eq.type = '뱃지'; if(eq.type === 'emblem') eq.type = '엠블럼'; if(eq.type === 'ring') eq.type = '링'; return eq; }); } else { userEquips = []; }

            if (cloud.raidDate) localStorage.setItem('mapleDefenseRaidDate', cloud.raidDate);
            calculateEquipStats();

            if (cloudBest >= localBest || !localStorage.getItem('mapleDefenseSave')) {
                if (cloud.save) localStorage.setItem('mapleDefenseSave', cloud.save);
                if (cloud.cards) { localStorage.setItem('mapleDefenseCards', cloud.cards); cardData = JSON.parse(cloud.cards); }
                if (cloud.skills) { localStorage.setItem('mapleDefenseSkills', cloud.skills); skillLevels = JSON.parse(cloud.skills); }
                if (cloud.coins) { localStorage.setItem('mapleDefenseSpentCoins', cloud.coins); spentCoins = parseInt(cloud.coins); }
                bestWave = cloudBest; localStorage.setItem('mapleDefenseBestWave', bestWave); document.getElementById('ui-best-wave').innerText = bestWave;
            } else { window.syncToCloud(); }
        } else { window.syncToCloud(); }
        window.switchScreen('start-screen');
    } else { currentUserUid = null; window.switchScreen('login-screen'); }
});

window.submitNickname = async () => {
    let input = document.getElementById('nickname-input').value.trim();
    if (!input) { showMessage("닉네임을 입력해주세요."); return; }
    if (input.length > 10) { showMessage("닉네임은 10자 이하로 해주세요."); return; }
    try { const now = Date.now(); await update(ref(database, `users/${currentUserUid}`), { nickname: input, lastNicknameChange: now }); currentUserName = input; lastNicknameChange = now; document.getElementById('current-user-name').innerText = currentUserName; document.getElementById('nickname-overlay').style.display = 'none'; document.getElementById('nickname-modal').style.display = 'none'; window.switchScreen('start-screen'); } catch (e) { showMessage("닉네임 저장 중 오류가 발생했습니다."); }
};
window.openNicknameChangeModal = () => {
    if (!currentUserUid) return; const now = Date.now(); const daysSinceLastChange = (now - lastNicknameChange) / (1000 * 60 * 60 * 24);
    if (lastNicknameChange > 0 && daysSinceLastChange < 30) { const remainingDays = Math.ceil(30 - daysSinceLastChange); showMessage(`닉네임은 30일에 한 번만 변경 가능합니다. (${remainingDays}일 남음)`); return; }
    document.getElementById('nickname-change-input').value = ""; document.getElementById('nickname-change-overlay').style.display = 'block'; document.getElementById('nickname-change-modal').style.display = 'block';
};
window.closeNicknameChangeModal = () => { document.getElementById('nickname-change-overlay').style.display = 'none'; document.getElementById('nickname-change-modal').style.display = 'none'; };
window.submitNicknameChange = async () => {
    let input = document.getElementById('nickname-change-input').value.trim();
    if (!input) { showMessage("새로운 닉네임을 입력해주세요."); return; }
    if (input.length > 10) { showMessage("닉네임은 10자 이하로 해주세요."); return; }
    if (input === currentUserName) { showMessage("기존 닉네임과 동일합니다."); return; }
    try { const now = Date.now(); await update(ref(database, `users/${currentUserUid}`), { nickname: input, lastNicknameChange: now }); update(ref(database, `pk_rankings/${currentUserUid}`), { nickname: input }).catch(e => {}); currentUserName = input; lastNicknameChange = now; document.getElementById('current-user-name').innerText = currentUserName; window.closeNicknameChangeModal(); showMessage("닉네임이 성공적으로 변경되었습니다!"); } catch (e) { showMessage("닉네임 변경 중 오류가 발생했습니다."); }
};

window.loginWithGoogle = () => { const provider = new GoogleAuthProvider(); signInWithPopup(auth, provider).catch(error => showMessage("로그인 실패: " + error.message)); };
window.logout = () => { signOut(auth).then(() => { location.reload(); }); };

// ==========================================
// 5. 모험모드, 도감, 상점 기본 기능
// ==========================================
function getBossInfo(w) {
    if (w < 100 && BOSS_WAVES[w]) return BOSS_WAVES[w];
    if (w >= 100 && w % 5 === 0) { 
        let n = (w - 100) / 5; 
        let calculatedHp = 1200000 + (n * 300000) + (Math.pow(n, 2) * 50000); 
        let bName = BOSS_WAVES[w] ? BOSS_WAVES[w].name : (w % 10 === 5 ? "어둠의 늑대" : `심연의 보스 (${w}층)`); 
        let bMeso = BOSS_WAVES[w] ? BOSS_WAVES[w].meso : 150; 
        let bTicket = BOSS_WAVES[w] ? BOSS_WAVES[w].ticket : 5; 
        return { hp: Math.floor(calculatedHp), meso: bMeso, ticket: bTicket, name: bName }; 
    } 
    return null;
}

function setGridMode(mode) {
    let isRankGrid = (mode === 'RANK'); let canvasHeight = isRankGrid ? 290 : 500; let gridSize = isRankGrid ? 10 : 25;
    if(canvas) canvas.height = canvasHeight; document.getElementById('board-area').style.aspectRatio = isRankGrid ? "500/290" : "1/1";
    gridContainer.style.gridTemplateRows = isRankGrid ? "repeat(2, 1fr)" : "repeat(5, 1fr)"; gridContainer.style.top = isRankGrid ? "25.86%" : "15%"; gridContainer.style.height = isRankGrid ? "48.27%" : "70%";
    currentPath = isRankGrid ? [ {x:25,y:25}, {x:475,y:25}, {x:475,y:265}, {x:25,y:265} ] : [ {x:25,y:25}, {x:475,y:25}, {x:475,y:475}, {x:25,y:475} ];
    grid = new Array(gridSize).fill(null); oppGrid = new Array(gridSize).fill(null); gridContainer.innerHTML = '';
    let oppGridContainer = document.getElementById('opp-grid-container'); if(oppGridContainer) oppGridContainer.innerHTML = '';
    for(let i=0; i<gridSize; i++) {
        let cell = document.createElement('div'); cell.className = 'grid-cell'; cell.onclick = () => window.onCellClick(i); gridContainer.appendChild(cell);
        if (oppGridContainer) { let oppCell = document.createElement('div'); oppCell.className = 'grid-cell'; oppGridContainer.appendChild(oppCell); }
    }
}

window.saveGameData = () => {
    if (state.status === 'GAMEOVER' || state.status === 'TITLE' || state.isRank) return;
    let saveObj = { wave: state.wave, meso: state.meso, mp: state.mp, mpTotal: state.mpTotal, kills: state.kills, upgrades: state.upgrades, tickets: state.tickets, gridData: grid.map(u => u ? { idx: u.idx, gradeIdx: u.gradeIdx, clsName: u.cls.type } : null) };
    localStorage.setItem('mapleDefenseSave', JSON.stringify(saveObj)); if (currentUserUid) window.syncToCloud();
};

setInterval(() => { if((state.status === 'PLAY' || state.status === 'PREP') && !state.isRank) window.saveGameData(); }, 3000);

// 🔥 오류 수정 완료! 루프가 끊어지지 않도록 강제 매핑
window.startNewGame = () => {
    localStorage.removeItem('mapleDefenseSave'); setGridMode('ADVENTURE'); 
    state = { status: 'PREP', meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 5, speed: 1, isBoss: false, upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} }, tickets: [], isRank: false };
    document.getElementById('best-wave-container').style.display = 'block'; document.getElementById('btn-speed').innerText = "1배속"; document.getElementById('btn-speed').style.display = 'block'; document.getElementById('btn-exit').style.display = 'block'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'none'; document.getElementById('opp-board-wrapper').style.display = 'none';
    monsters = []; projectiles = []; towers = []; hitEffects = []; visualEffects = []; fumaList = []; damageTexts = []; waveTimer = 0; spawnTimer = 0; selectedUnitIdx = -1; bestWave = parseInt(localStorage.getItem('mapleDefenseBestWave')) || 0;
    if (currentUserUid) window.syncToCloud();
    renderGrid(); window.switchScreen('game-container'); lastTime = performance.now(); cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
};

window.loadAndStartGame = () => {
    let saved = JSON.parse(localStorage.getItem('mapleDefenseSave')); if(!saved) { window.startNewGame(); return; }
    setGridMode('ADVENTURE'); state.isRank = false; state.wave = saved.wave; state.meso = saved.meso; state.mp = saved.mp; state.mpTotal = saved.mpTotal; state.kills = saved.kills; state.upgrades = saved.upgrades; state.tickets = saved.tickets; state.speed = 1;
    document.getElementById('best-wave-container').style.display = 'block'; document.getElementById('btn-speed').innerText = "1배속"; document.getElementById('btn-speed').style.display = 'block'; document.getElementById('btn-exit').style.display = 'block'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'none'; document.getElementById('opp-board-wrapper').style.display = 'none';
    towers = []; if(saved.gridData && Array.isArray(saved.gridData)) { saved.gridData.forEach((u) => { if(u) window.addUnit(u.idx, u.gradeIdx, u.clsName, true); }); }
    window.switchScreen('game-container'); state.status = 'PREP'; state.time = 5; lastTime = performance.now(); state.isBoss = !!getBossInfo(state.wave);
    cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
};

window.goToLobby = () => { if(!state.isRank) window.saveGameData(); state.status = 'TITLE'; cancelAnimationFrame(mainReqId); let gameOverModal = document.getElementById('gameover-modal'); if(gameOverModal) gameOverModal.style.display = 'none'; window.closeAllModals(); document.getElementById('ui-best-wave').innerText = bestWave; window.switchScreen('start-screen'); if (currentUserUid) window.syncToCloud(); };
window.toggleSpeed = () => { if(state.isRank) return; if (state.speed === 1) state.speed = 10; else if (state.speed === 10) state.speed = 15; else state.speed = 1; document.getElementById('btn-speed').innerText = state.speed + "배속"; };

function getGradeByProb() { let rand = Math.random() * 100; let acc = 0; for(let i=0; i<GRADES.length; i++) { acc += GRADES[i].prob; if(rand <= acc) return i; } return 0; }

window.summonUnit = () => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return; if(state.meso < 10) { showMessage("메소가 부족합니다!"); return; }
    let emptyIdx = grid.findIndex(v => v === null); if(emptyIdx === -1) { showMessage("배치 공간이 부족합니다!"); return; }
    state.meso -= 10; let gradeIdx = getGradeByProb(); let clsNames = Object.keys(CLASSES); let clsName = clsNames[Math.floor(Math.random() * clsNames.length)]; window.addUnit(emptyIdx, gradeIdx, clsName);
    if (state.isRank) { let oppEmptyIdx = oppGrid.findIndex(v => v === null); if (oppEmptyIdx !== -1) { let oppGradeIdx = getGradeByProb(); let oppClsName = clsNames[Math.floor(Math.random() * clsNames.length)]; addUnitOpp(oppEmptyIdx, oppGradeIdx, oppClsName); } }
    window.updateUI();
};

function showSummonToast(gradeName, gradeIdx, clsName, color) { let toast = document.getElementById('summon-toast'); let fontSize = 16 + (gradeIdx * 2); toast.innerHTML = `<span style="color:${color}">${gradeName}</span> ${clsName}!`; toast.style.fontSize = fontSize + 'px'; toast.style.color = '#fff'; toast.className = 'toast-show'; setTimeout(() => { toast.className = ''; }, 1500); if (gradeIdx >= 5) { let container = document.getElementById('game-container'); container.classList.add('shake-active'); setTimeout(() => container.classList.remove('shake-active'), 400); } }
function showBossToast(name, isDrop = false) { let toast = document.getElementById('boss-toast'); if (isDrop) { toast.innerHTML = `🃏 ${name} 카드 획득! 🃏`; toast.style.color = '#ffca28'; } else { toast.innerHTML = `⚠️ 보스 출현: ${name} ⚠️`; toast.style.color = '#ff5252'; } toast.className = 'toast-show'; setTimeout(() => { toast.className = ''; }, 2500); }

window.addUnit = (idx, gradeIdx, clsName, isLoad = false) => { let grade = GRADES[gradeIdx]; let cls = CLASSES[clsName]; let unit = { idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls, x: 75 + (idx % 5) * 70 + 35, y: 75 + Math.floor(idx / 5) * 70 + 35, lastAttack: 0, bindCooldown: 0, globalCooldown: 0 }; grid[idx] = unit; towers.push(unit); if(!isLoad) showSummonToast(grade.name, gradeIdx, clsName, cls.color); renderGrid(); };
function addUnitOpp(idx, gradeIdx, clsName) { let grade = GRADES[gradeIdx]; let cls = CLASSES[clsName]; let unit = { idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls, x: 75 + (idx % 5) * 70 + 35, y: 75 + Math.floor(idx / 5) * 70 + 35, lastAttack: 0, bindCooldown: 0, globalCooldown: 0 }; oppGrid[idx] = unit; oppTowers.push(unit); renderOppGrid(); }

window.onCellClick = (idx) => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    if (selectedUnitIdx !== -1) {
        if (selectedUnitIdx === idx) { selectedUnitIdx = -1; } else { let target = grid[idx]; grid[idx] = grid[selectedUnitIdx]; if (grid[idx]) { grid[idx].idx = idx; grid[idx].x = 75 + (idx % 5) * 70 + 35; grid[idx].y = 75 + Math.floor(idx / 5) * 70 + 35; } grid[selectedUnitIdx] = target; if(target) { target.idx = selectedUnitIdx; target.x = 75 + (selectedUnitIdx % 5) * 70 + 35; target.y = 75 + Math.floor(selectedUnitIdx / 5) * 70 + 35; } selectedUnitIdx = -1; }
    } else { if (grid[idx]) selectedUnitIdx = idx; }
    renderGrid(); window.updateUI();
};

window.sellSelectedUnit = () => { if(selectedUnitIdx === -1) return; let u = grid[selectedUnitIdx]; if(u && u.grade.sell > 0) { state.meso += u.grade.sell; towers = towers.filter(t => t !== u); grid[selectedUnitIdx] = null; selectedUnitIdx = -1; renderGrid(); window.updateUI(); } };
window.openBulkSellModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('bulk-sell-modal').style.display = 'block'; };

window.executeBulkSell = (type, value) => {
    let soldCount = 0; let earnedMeso = 0;
    for(let i = 0; i < grid.length; i++) { let u = grid[i]; if(!u || u.grade.sell === 0) continue; let match = false; if(type === 'class' && u.cls.type === value) match = true; if(type === 'grade' && u.gradeIdx <= value) match = true; if(match) { earnedMeso += u.grade.sell; towers = towers.filter(t => t !== u); grid[i] = null; soldCount++; } }
    if(soldCount > 0) { state.meso += earnedMeso; showMessage(`${soldCount} 유닛 판매 (+${earnedMeso} 메소)`); selectedUnitIdx = -1; renderGrid(); window.updateUI(); } else { showMessage("조건에 맞는 유닛이 없습니다."); } window.closeAllModals();
};

function renderGrid() {
    let cells = gridContainer.children; if(!cells || cells.length === 0) return;
    for(let i=0; i<grid.length; i++) {
        let u = grid[i]; cells[i].className = 'grid-cell'; if (i === selectedUnitIdx) cells[i].classList.add('selected');
        if(u) {
            if (u.gradeIdx === 6) cells[i].classList.add('glow-6'); if (u.gradeIdx === 7) cells[i].classList.add('glow-7'); if (u.gradeIdx === 8) cells[i].classList.add('glow-8'); let barsHtml = '';
            if (u.gradeIdx === 6) { barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="bind-bar-${u.idx}" style="width: 0%; height: 100%; background: #00e5ff;"></div></div>`; }
            if (u.gradeIdx >= 5) { if ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) { let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc'); barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="global-bar-${u.idx}" style="width: 0%; height: 100%; background: ${color};"></div></div>`; } }
            cells[i].innerHTML = `<div style="font-size:20px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div><div style="color:${u.cls.color}; font-size:10px; margin-top:2px;">${u.grade.name}</div>${barsHtml}`;
        } else { cells[i].innerHTML = ''; }
    }
    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if(pkBarContainer && typeof pkState !== 'undefined' && pkState.active && pkState.unit) { let u = pkState.unit; if ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) { pkBarContainer.style.display = 'block'; let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc'); document.getElementById('pk-global-bar').style.background = color; } }
}

function renderOppGrid() {
    let oppGridContainer = document.getElementById('opp-grid-container'); if(!oppGridContainer) return; let cells = oppGridContainer.children; if(!cells || cells.length === 0) return;
    for(let i=0; i<oppGrid.length; i++) { let u = oppGrid[i]; cells[i].className = 'grid-cell'; if(u) { if (u.gradeIdx === 6) cells[i].classList.add('glow-6'); if (u.gradeIdx === 7) cells[i].classList.add('glow-7'); if (u.gradeIdx === 8) cells[i].classList.add('glow-8'); cells[i].innerHTML = `<div style="font-size:18px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div><div style="color:${u.cls.color}; font-size:9px; margin-top:2px;">${u.grade.name}</div>`; } else { cells[i].innerHTML = ''; } }
}

function spawnMonster() {
    let bInfo = getBossInfo(state.wave); let hpBase = bInfo ? bInfo.hp : Math.floor(state.wave * 60 + Math.pow(state.wave, 1.5) * 12);
    monsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: bInfo ? 25 : 50, isBoss: !!bInfo, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: bInfo ? bInfo.name : null, facingRight: true });
}
window.skipBossRound = () => { waveTimer = 150; document.getElementById('boss-skip-wrapper').style.display = 'none'; };

function updateWave(dt) {
    waveTimer += dt; spawnTimer += dt; let limit = state.isBoss ? 150 : 60; 
    if(waveTimer >= limit) { nextWave(); return; }
    if(!state.isBoss && spawnTimer >= 1.5) { spawnMonster(); spawnTimer = 0; }
    document.getElementById('ui-timer').innerText = Math.max(0, limit - Math.floor(waveTimer));
}

function nextWave() {
    document.getElementById('boss-skip-wrapper').style.display = 'none';
    if(state.isBoss && monsters.some(m => m.isBoss)) { if(state.isRank) return handleRankGameOver("보스 사냥 실패!"); else return gameOver("보스 처치 실패!"); }
    state.wave++; waveTimer = 0; spawnTimer = 0; let bInfo = getBossInfo(state.wave); state.isBoss = !!bInfo;
    if (!state.isRank && state.wave > bestWave) { bestWave = state.wave; localStorage.setItem('mapleDefenseBestWave', bestWave); document.getElementById('ui-best-wave').innerText = bestWave; if (currentUserUid) window.syncToCloud(); }
    if(state.isBoss) { showBossToast(bInfo.name); spawnMonster(); }
    window.updateUI();
}

function showUpgradeToast(idChar, amt) { let box = document.getElementById(`upg-${idChar}-box`); let floatEl = document.createElement('div'); floatEl.className = 'upgrade-toast'; floatEl.innerText = '+' + amt; box.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1000); }
window.upgrade = (type) => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return; let u = state.upgrades[type];
    if(state.mp >= u.cost) { state.mp -= u.cost; let amt = Math.floor(Math.random() * 6) + 1; u.val += amt; u.cost += Math.floor(u.cost * 0.2) + 3; let idChar = type === '전사' ? 'w' : (type === '법사' ? 'm' : 't'); showUpgradeToast(idChar, amt); document.getElementById(`upg-${idChar}-val`).innerText = u.val; document.getElementById(`upg-${idChar}-cost`).innerText = u.cost; window.updateUI(); } else { showMessage("메포가 부족합니다."); }
};

let currentTicketTier = 0;
window.openTicketModal = () => { if(state.tickets.length === 0) { showMessage("보유한 선택권이 없습니다."); return; } currentTicketTier = state.tickets[0]; document.getElementById('ticket-tier').innerText = currentTicketTier; document.getElementById('overlay').style.display = 'block'; document.getElementById('ticket-modal').style.display = 'block'; window.updateUI(); };
window.useTicket = (choice) => { let emptyIdx = grid.findIndex(v => v === null); if(emptyIdx === -1) { showMessage("공간 부족!"); return; } state.tickets.shift(); let tier = currentTicketTier; let cls = choice === '랜덤' ? Object.keys(CLASSES)[Math.floor(Math.random()*3)] : choice; if(choice === '랜덤' && Math.random() < 0.2) tier++; window.addUnit(emptyIdx, tier, cls); window.closeAllModals(); window.updateUI(); };

function getTotalGrade() { let tg = 0; for(let k in cardData) tg += cardData[k].grade; return tg; }
function getTotalCardBonus() { let bonus = 0; for(let k in cardData) { if(cardData[k].grade > 0) bonus += 1 + (cardData[k].grade - 1) * 0.5; } return bonus; }
function getAvailableCoins() { return getTotalGrade() + userRankData.bonusCoins - spentCoins; }

window.openBookModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('book-modal').style.display = 'block'; window.renderBook(); };
window.renderBook = () => {
    let list = document.getElementById('book-list'); list.innerHTML = '';
    const BOOK_ORDER = [ "킹 슬라임", "알리샤르", "파풀라투스", "피아누스", "자쿰", "혼테일", "어둠의 늑대", "시그너스", "반반", "피에르", "블러드퀸", "벨룸" ];
    let allBosses = [...BOOK_ORDER]; for(let k in cardData) { if(!allBosses.includes(k)) allBosses.push(k); }
    allBosses.forEach(bName => {
        let data = cardData[bName] || { owned: 0, grade: 0 }; let req = data.grade < 10 ? CARD_REQ[data.grade] : 'Max'; let canUpgrade = data.grade < 10 && data.owned >= req; let effectStr = data.grade > 0 ? `+${(1 + (data.grade-1)*0.5).toFixed(1)}%` : `0%`; let btnText = data.grade === 0 ? `등록 (${req})` : (data.grade === 10 ? 'MAX' : `강화 (${req})`);
        let imgSrc = bossImages[bName] ? bossImages[bName].src : ''; let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width: 40px; height: 40px; object-fit: contain; margin-right: 8px; flex-shrink: 0; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.4));">` : '';
        list.innerHTML += `<div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; text-align:left; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; overflow:hidden;">${imgHtml}<div style="overflow:hidden;"><div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${bName} (등급: ${data.grade})</div><div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">효과: ${effectStr} / 보유: <b style="color:#e65100">${data.owned}장</b></div></div></div><button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:65px;" onclick="upgradeCard('${bName}')">${btnText}</button></div>`;
    });
    document.getElementById('book-total-grade').innerHTML = `총 등급 합계: <span style="color:#c62828;">${getTotalGrade()}</span> (코인: <span style="color:#f57c00;">${getAvailableCoins()}</span>)`; document.getElementById('book-total-bonus').innerText = `총 보유 효과: 공격력 +${getTotalCardBonus().toFixed(1)}%`;
};
window.upgradeCard = (bName) => { let data = cardData[bName]; let req = CARD_REQ[data.grade]; if(data.grade < 10 && data.owned >= req) { data.owned -= req; data.grade++; localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); if (currentUserUid) window.syncToCloud(); window.renderBook(); } };
window.openShopModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('shop-modal').style.display = 'block'; window.renderShop('common'); };
window.renderShop = (category) => {
    document.getElementById('ui-shop-coins').innerText = getAvailableCoins(); let list = document.getElementById('shop-list'); list.innerHTML = ''; let prefix = category === 'common' ? 'common_' : (category === 'warrior' ? 'war_' : (category === 'mage' ? 'mage_' : 'thief_'));
    for(let key in SKILL_INFO) {
        if(key.startsWith(prefix)) {
            let info = SKILL_INFO[key]; let lvl = skillLevels[key]; let canUpgrade = lvl < info.max && getAvailableCoins() > 0; let btnText = lvl === info.max ? 'MAX' : `강화 (1코인)`; let displayLv = lvl === 0 ? 1 : lvl; 
            list.innerHTML += `<div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; overflow:hidden;"><img src="${info.img}" onerror="this.src='image/mepo.png'" style="width:30px; height:30px; object-fit:contain; margin-right:8px; flex-shrink:0;"><div style="overflow:hidden;"><div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${info.name} <span style="color:#c62828;">Lv.${lvl}</span></div><div style="font-size:10px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${info.getDesc(displayLv)}</div></div></div><button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:70px;" onclick="upgradeSkill('${key}', '${category}')">${btnText}</button></div>`;
        }
    }
};
window.upgradeSkill = (key, category) => { if(skillLevels[key] < SKILL_INFO[key].max && getAvailableCoins() > 0) { skillLevels[key]++; spentCoins++; localStorage.setItem('mapleDefenseSkills', JSON.stringify(skillLevels)); localStorage.setItem('mapleDefenseSpentCoins', spentCoins); if (currentUserUid) window.syncToCloud(); window.renderShop(category); renderGrid(); } };
window.openActiveSkillsModal = () => {
    document.getElementById('overlay').style.display = 'block'; document.getElementById('active-skills-modal').style.display = 'block'; let list = document.getElementById('active-skills-list'); list.innerHTML = ''; let hasSkill = false;
    for(let key in skillLevels) { if(skillLevels[key] > 0) { hasSkill = true; list.innerHTML += `<div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; align-items:center; overflow:hidden;"><img src="${SKILL_INFO[key].img}" onerror="this.src='image/mepo.png'" style="width:30px; height:30px; object-fit:contain; margin-right:8px; flex-shrink:0;"><div style="overflow:hidden;"><div style="font-weight:900; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].name} <span style="color:#c62828;">Lv.${skillLevels[key]}</span></div><div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].getDesc(skillLevels[key])}</div></div></div>`; } }
    if(!hasSkill) list.innerHTML = `<div style="text-align:center; padding: 20px; font-weight:bold; color:#666;">적용중인 스킬이 없습니다.</div>`;
};

// ==========================================
// 6. 인벤토리 및 장비 시스템
// ==========================================
window.openInventoryModal = () => { document.getElementById('inventory-modal').style.display = 'block'; document.getElementById('overlay').style.display = 'block'; calculateEquipStats(); renderEquippedSlots(); renderInventoryTab('consumable'); };
window.closeInventoryModal = () => { document.getElementById('inventory-modal').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; };
function renderEquippedSlots() { ['뱃지', '엠블럼', '링'].forEach(slot => { let el = document.getElementById(`slot-${slot}`); let item = userEquipped[slot]; if (item) { el.className = `equip-slot equip-${item.grade.toLowerCase()}`; el.querySelector('.slot-item').innerHTML = getEquipIcon(slot); } else { el.className = `equip-slot`; el.querySelector('.slot-item').innerHTML = ''; } }); document.getElementById('equip-total-stats').innerText = `적용 능력치: 공 +${equipStats.atk}% / 공속 +${equipStats.spd}% / 크확 +${equipStats.crit}%`; }
function getEquipIcon(type) { let fileName = type === '뱃지' ? 'badge.png' : (type === '엠블럼' ? 'emblem.png' : 'ring.png'); let size = type === '링' ? '30px' : '36px'; return `<img src="image/${fileName}" style="width: ${size}; height: ${size}; object-fit: contain; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.4));">`; }

window.isCombiningCoin = false;
window.combineCoinPieces = () => {
    if (window.isCombiningCoin) return;
    if (userInventory.coinPieces >= 10) {
        if (confirm("코인 조각 10개를 스킬 코인 1개로 합치시겠습니까?")) { 
            window.isCombiningCoin = true; 
            userInventory.coinPieces -= 10; 
            userRankData.bonusCoins += 1; 
            window.syncToCloud().then(() => { 
                window.isCombiningCoin = false; 
                renderInventoryTab('consumable'); 
                showMessage("코인 1개를 획득했습니다!"); 
            }).catch((e) => {
                window.isCombiningCoin = false;
                showMessage("서버 통신 중 오류가 발생했습니다.");
            }); 
        }
    } else { showMessage("코인 조각이 부족합니다. (10개 필요)"); }
};
window.renderInventoryTab = (tab) => {
    let list = document.getElementById('inventory-list'); list.innerHTML = '';
    if (tab === 'consumable') {
        if(userInventory.coinPieces > 0) list.innerHTML += createInvBox('🧩', '코인 조각', userInventory.coinPieces, "combineCoinPieces()");
        if(userInventory.equipBoxes > 0) list.innerHTML += createInvBox('🎁', '장비 상자', userInventory.equipBoxes, "openBox('equipBoxes')");
        ['브론즈', '실버', '골드', '플래티넘', '다이아몬드', '챌린저'].forEach(tier => { if (userInventory.boxes[tier] > 0) { list.innerHTML += createInvBox('🧰', `${tier} 상자`, userInventory.boxes[tier], `openBox('${tier}')`); } });
    } else if (tab === 'equip') {
        userEquips.forEach((eq, idx) => {
            let el = document.createElement('div'); el.className = `inv-item-box equip-${eq.grade.toLowerCase()}`; let statStr = "";
            if (eq.atk > 0 && eq.spd > 0 && eq.crit > 0) statStr = `공${eq.atk}/속${eq.spd}/크${eq.crit}`; else if (eq.atk > 0) statStr = `공격력+${eq.atk}%`; else if (eq.spd > 0) statStr = `공속+${eq.spd}%`; else if (eq.crit > 0) statStr = `크확+${eq.crit}%`; else statStr = `옵션 없음`;
            el.innerHTML = `<div class="inv-item-icon">${getEquipIcon(eq.type)}</div><div style="font-size:10px; font-weight:bold; margin-top:4px; color:#37474f;">${statStr}</div>`; el.onclick = () => equipItem(idx); list.appendChild(el);
        });
    }
};
function createInvBox(icon, name, qty, onclickStr) { return `<div class="inv-item-box" onclick="${onclickStr}"><div class="inv-item-icon">${icon}</div><div class="inv-item-qty">${qty}</div><div style="font-size:10px; font-weight:bold; color:#546e7a; margin-top:2px; text-align:center;">${name}</div></div>`; }

window.openBox = (boxType) => {
    let tierProb = { '브론즈': { frag: [ [1, 0.6], [0, 0.4] ], equip: 0 }, '실버': { frag: [ [1, 0.666], [2, 0.333] ], equip: 0 }, '골드': { frag: [ [2, 0.45], [3, 0.35], [4, 0.15], [5, 0.05] ], equip: 0.05 }, '플래티넘': { frag: [ [3, 0.55], [4, 0.35], [5, 0.1] ], equip: 0.15 }, '다이아몬드': { frag: [ [4, 0.666], [5, 0.333] ], equip: 0.35 }, '챌린저': { frag: [ [5, 1.0] ], equip: 0.55 } };
    if (boxType === 'equipBoxes') { if (userInventory.equipBoxes <= 0) return; userInventory.equipBoxes--; generateEquipment(); } 
    else {
        if (!userInventory.boxes[boxType] || userInventory.boxes[boxType] <= 0) return; userInventory.boxes[boxType]--; let data = tierProb[boxType]; let r = Math.random(); let acc = 0; let getFrag = 0;
        for(let f of data.frag) { acc += f[1]; if(r <= acc) { getFrag = f[0]; break; } }
        userInventory.coinPieces += getFrag; let getEquipBox = Math.random() < data.equip ? 1 : 0; userInventory.equipBoxes += getEquipBox; showMessage(`${boxType} 개봉!\n조각 +${getFrag}, 장비상자 +${getEquipBox}`);
    }
    window.syncToCloud(); renderInventoryTab('consumable');
};
function generateEquipment() {
    let types = ['뱃지', '엠블럼', '링']; let type = types[Math.floor(Math.random() * 3)]; let r = Math.random(); let grade, min, max;
    if (r < 0.65) { grade = 'Rare'; min = 1; max = 3; } else if (r < 0.90) { grade = 'Epic'; min = 4; max = 8; } else if (r < 0.99) { grade = 'Unique'; min = 9; max = 15; } else { grade = 'Legendary'; min = 16; max = 25; }
    let atk = 0, spd = 0, crit = 0; let statType = Math.floor(Math.random() * 3); let val = Math.floor(Math.random() * (max - min + 1)) + min; let alertMsg = "";
    if (statType === 0) { atk = val; alertMsg = `공격력: +${val}%`; } else if (statType === 1) { spd = val; alertMsg = `공속: +${val}%`; } else { crit = val; alertMsg = `크확: +${val}%`; }
    userEquips.push({ type, grade, atk, spd, crit, id: Date.now() }); showMessage(`[${grade}] ${type} 획득!\n${alertMsg}`);
}
window.equipItem = (idx) => { let item = userEquips.splice(idx, 1)[0]; if (!item) return; if(userEquipped[item.type]) { userEquips.push(userEquipped[item.type]); } userEquipped[item.type] = item; calculateEquipStats(); window.syncToCloud(); renderEquippedSlots(); renderInventoryTab('equip'); };
window.unequipItem = (type) => { if(userEquipped[type]) { userEquips.push(userEquipped[type]); userEquipped[type] = null; calculateEquipStats(); window.syncToCloud(); renderEquippedSlots(); renderInventoryTab('equip'); } };

// ==========================================
// 7. 월드 보스 레이드 시스템
// ==========================================
window.openRaidMenu = () => {
    let today = new Date().toLocaleDateString(); let lastRaidDate = localStorage.getItem('mapleDefenseRaidDate');
    if (lastRaidDate === today) { showMessage('오늘 이미 월드 보스 토벌에 참여하셨습니다.'); return; }
    if (!currentUserUid) { showMessage("로그인이 필요한 서비스입니다."); return; }

    localStorage.setItem('mapleDefenseRaidDate', today); window.syncToCloud();
    document.getElementById('start-screen').style.display = 'none'; document.getElementById('raid-game').style.display = 'flex';
    
    raidState.status = 'PREP'; raidState.active = true; raidState.time = 60; raidState.prepTime = 10; raidState.meso = 30;
    raidState.totalDmg = 0; raidState.pendingDmg = 0; raidState.units = [null, null, null]; raidState.projectiles = []; raidState.vfx = []; raidState.lastTime = performance.now();
    raidState.gotLastHit = false; raidState.rewardClaimedForKills = [];

    document.getElementById('raid-prep-ui').style.display = 'flex'; document.getElementById('raid-prep-time').innerText = '10'; document.getElementById('raid-meso').innerText = '30'; renderRaidGrid();

    onValue(ref(database, 'worldBoss/hp'), (snap) => {
        if(snap.exists()) {
            raidState.bossHp = snap.val(); let percent = (raidState.bossHp / raidState.maxHp) * 100;
            document.getElementById('raid-boss-hp-bar').style.width = `${Math.max(0, percent)}%`; document.getElementById('raid-boss-hp-text').innerText = `${Math.max(0, Math.floor(raidState.bossHp)).toLocaleString()} / ${raidState.maxHp.toLocaleString()}`;
        }
    });
    raidLoop();
};

window.summonRaidUnit = () => {
    if(raidState.status !== 'PREP') return; if(raidState.meso < 10) { showMessage("메소가 부족합니다."); return; }
    let emptyIdx = raidState.units.findIndex(v => v === null); if(emptyIdx === -1) { showMessage("더 이상 배치할 수 없습니다."); return; }
    raidState.meso -= 10; document.getElementById('raid-meso').innerText = raidState.meso;
    let r = Math.random() * 100; let gradeIdx = r < 60 ? 5 : (r < 90 ? 6 : (r < 99 ? 7 : 8)); 
    let clsNames = Object.keys(CLASSES); let clsName = clsNames[Math.floor(Math.random() * clsNames.length)]; let cls = CLASSES[clsName]; let grade = GRADES[gradeIdx];
    
raidState.units[emptyIdx] = { cls: cls, grade: grade, gradeIdx: gradeIdx, x: 150 + (emptyIdx * 100), y: 360, lastAttack: 0, globalCooldown: 0 };
};

function renderRaidGrid() {
    let gridHtml = '';
    for(let i=0; i<3; i++) {
        let u = raidState.units[i];
        if (u) gridHtml += `<div class="grid-cell glow-${u.gradeIdx}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:24px;">${u.cls.icon}</div><div style="font-size:10px; color:${u.cls.color}; font-weight:bold;">${u.grade.name}</div></div>`;
        else gridHtml += `<div class="grid-cell" style="background:rgba(0,0,0,0.2); border:1px dashed #777;"></div>`;
    }
    document.getElementById('raid-grid-container').innerHTML = gridHtml;
}

setInterval(() => {
    if (raidState.active && raidState.pendingDmg > 0) {
        let dmgToApply = raidState.pendingDmg; 
        raidState.pendingDmg = 0;
        
        runTransaction(ref(database, 'worldBoss'), (bossData) => {
            if (!bossData) bossData = { hp: 7000000, killCount: 0, lastKillerUid: null };
            bossData.hp -= dmgToApply;
            if (bossData.hp <= 0) { bossData.hp = 7000000; bossData.killCount = (bossData.killCount || 0) + 1; bossData.lastKillerUid = currentUserUid; }
            return bossData;
        }).then(({committed, snapshot}) => {
            if(committed && snapshot.exists()) {
                let data = snapshot.val();
                if (data.lastKillerUid === currentUserUid && !raidState.rewardClaimedForKills.includes(data.killCount)) {
                    raidState.rewardClaimedForKills.push(data.killCount); raidState.gotLastHit = true; showBossToast("막타 달성! 챌린저 상자 확정!", true);
                }
            }
        }).catch(e => {
            raidState.pendingDmg += dmgToApply; 
            console.warn("데미지 전송 지연, 다음 틱에 재전송합니다.");
        });
    }
}, 1000);

function raidLoop() {
    if (!raidState.active) return;
    let now = performance.now(); let dtReal = (now - raidState.lastTime) / 1000; if (dtReal > 0.1) dtReal = 0.1; raidState.lastTime = now;
    if (raidState.status === 'PREP') {
        raidState.prepTime -= dtReal; document.getElementById('raid-prep-time').innerText = Math.ceil(Math.max(0, raidState.prepTime));
        if (raidState.prepTime <= 0) { raidState.status = 'PLAY'; document.getElementById('raid-prep-ui').style.display = 'none'; }
        drawRaid(); raidReqId = requestAnimationFrame(raidLoop); return;
    }
    let dt = dtReal * 4; if (dt > 0.4) dt = 0.4;
    raidState.time -= dt; document.getElementById('raid-time').innerText = Math.ceil(Math.max(0, raidState.time));
    if (raidState.time <= 0) { endRaidGame(); return; }

    let cardMulti = 1 + (getTotalCardBonus() / 100); let rageMulti = 1 + (skillLevels.common_rage * 0.01) + (equipStats.atk * 0.01); let sharpChance = (skillLevels.common_sharp * 0.05) + (equipStats.crit * 0.01); let windReduc = 1 + (skillLevels.common_wind * 0.2) + (equipStats.spd * 0.01);
    let bx = 250, by = 150;

    raidState.units.forEach(u => {
        if(!u) return; 

        if (u.gradeIdx >= 5 && ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0))) {
            u.globalCooldown -= dt * 1000;
            if (u.globalCooldown <= 0) {
                let baseDmg = 20 * u.grade.mult * cardMulti * rageMulti;
                let gdmg = 0;
                
                if (u.cls.type === '전사' && skillLevels.war_death > 0) gdmg = baseDmg * (5 + skillLevels.war_death * 5);
                else if (u.cls.type === '법사' && skillLevels.mage_thunder > 0) gdmg = baseDmg * (5 + skillLevels.mage_thunder * 5);
                else if (u.cls.type === '도적' && skillLevels.thief_fuma > 0) gdmg = baseDmg * (5 + skillLevels.thief_fuma * 5);
                
                if (gdmg > 0) {
                    raidState.totalDmg += gdmg; raidState.pendingDmg += gdmg;
                    document.getElementById('raid-total-dmg').innerText = Math.floor(raidState.totalDmg).toLocaleString();
                    let ox = (Math.random() - 0.5) * 50; let oy = (Math.random() - 0.5) * 50;
                    raidState.dmgTexts.push({ val: Math.floor(gdmg), x: bx + ox, y: by - 40 + oy, timer: 0.8, isCrit: true });
                }
                u.globalCooldown = 60000;
            }
        }

        u.lastAttack -= dt * 1000;
        if (u.lastAttack <= 0) {
            let dmg = 20 * u.grade.mult * cardMulti * rageMulti; 
            let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= 1.2;
            
            let isFinal = false; 
            if (u.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < (skillLevels.war_final * 0.03)) { 
                isFinal = true; dmg *= 2; 
            }

            raidState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: bx, ty: by, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, gradeIdx: u.gradeIdx, isFinal: isFinal }); 
            
            if (u.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < (skillLevels.thief_shadow * 0.03)) { 
                raidState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: bx, ty: by, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, gradeIdx: u.gradeIdx, isShadow: true }); 
            }

            u.lastAttack = (1000 * (u.grade.speedMul || 1)) / windReduc;
        }
    });

    for (let i = raidState.projectiles.length - 1; i >= 0; i--) {
        let p = raidState.projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 600 * dt;
        if (dist <= speed) {
            raidState.totalDmg += p.dmg; raidState.pendingDmg += p.dmg; document.getElementById('raid-total-dmg').innerText = Math.floor(raidState.totalDmg).toLocaleString();
            let ox = (Math.random() - 0.5) * 50; let oy = (Math.random() - 0.5) * 50; raidState.dmgTexts.push({ val: Math.floor(p.dmg), x: bx + ox, y: by + oy, timer: 0.6, isCrit: p.isCrit });
            raidState.projectiles.splice(i, 1);
        } else { 
            let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; 
            p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; 
        }
    }
    for (let i = raidState.dmgTexts.length - 1; i >= 0; i--) { raidState.dmgTexts[i].timer -= dtReal; raidState.dmgTexts[i].y -= dtReal * 60; if (raidState.dmgTexts[i].timer <= 0) raidState.dmgTexts.splice(i, 1); }
    drawRaid(); raidReqId = requestAnimationFrame(raidLoop);
}

function drawRaid() {
    let canvas = document.getElementById('raidCanvas'); let ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    raidState.projectiles.forEach(p => { 
        ctx.save(); ctx.translate(p.x, p.y); 
        
        let dir = Math.atan2(p.ty - p.y, p.tx - p.x);
        let scale = 1.0; if (p.isFinal) scale *= 1.3; ctx.scale(scale, scale);
        if (p.isShadow) ctx.globalAlpha = 0.5;

        let img = null; let psize = 20;
        if (p.type === '전사') { img = p.gradeIdx >= 6 ? projImages.warrior2 : projImages.warrior1; ctx.rotate(dir + Math.PI); psize = p.gradeIdx >= 6 ? 30 : 20; }
        else if (p.type === '법사') { img = p.gradeIdx >= 6 ? projImages.mage2 : projImages.mage1; ctx.rotate(dir + (15 * Math.PI / 180)); psize = p.gradeIdx >= 6 ? 30 : 20; }
        else if (p.type === '도적') { img = p.gradeIdx >= 6 ? projImages.rogue2 : projImages.rogue1; ctx.rotate(p.angle); }

        if (img && img.complete) { 
            ctx.drawImage(img, -psize/2, -psize/2, psize, psize); 
        } else { 
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.gradeIdx >= 6 ? 8 : 5, 0, Math.PI*2); ctx.fill(); 
        }
        ctx.restore(); 
    });
    
    raidState.dmgTexts.forEach(d => { 
        ctx.save(); ctx.globalAlpha = Math.max(0, d.timer / 0.6); 
        ctx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; 
        ctx.font = d.isCrit ? "900 24px NanumSquare" : "bold 18px NanumSquare"; 
        ctx.shadowColor = d.isCrit ? "#c62828" : "#000"; ctx.shadowBlur = 4; 
        ctx.fillText(d.val, d.x - 20, d.y); ctx.restore(); 
    });
}

function endRaidGame() {
    raidState.active = false; cancelAnimationFrame(raidReqId);
    let finishProcess = () => {
        let percent = (raidState.totalDmg / 7000000) * 100; let rewardTier = '';
        if (percent <= 5) rewardTier = '브론즈'; else if (percent <= 10) rewardTier = '실버'; else if (percent <= 20) rewardTier = '골드'; else if (percent <= 30) rewardTier = '플래티넘'; else if (percent <= 50) rewardTier = '다이아몬드'; else rewardTier = '챌린저';
        let rewardMsg = "";
        
        if (!userInventory.boxes) userInventory.boxes = {};
        
        if (raidState.gotLastHit) { 
            userInventory.boxes['챌린저'] = (userInventory.boxes['챌린저'] || 0) + 1; 
            rewardMsg = `🎁 막타 보상: 챌린저 상자 1개 (기여도 보상 대체)`; 
        } else { 
            userInventory.boxes[rewardTier] = (userInventory.boxes[rewardTier] || 0) + 1; 
            rewardMsg = `🎁 기여도 보상: ${rewardTier} 상자 1개 지급 완료!`; 
        }
        
        window.syncToCloud();
        document.getElementById('raid-result-dmg').innerText = Math.floor(raidState.totalDmg).toLocaleString(); document.getElementById('raid-result-percent').innerText = percent.toFixed(2) + "%"; document.getElementById('raid-result-rewards').innerText = rewardMsg;
        document.getElementById('raid-result-overlay').style.display = 'block'; document.getElementById('raid-result-modal').style.display = 'block';
    };
    
    if (raidState.pendingDmg > 0) {
        let dmgToApply = raidState.pendingDmg; raidState.pendingDmg = 0;
        runTransaction(ref(database, 'worldBoss'), (bossData) => {
            if (!bossData) bossData = { hp: 7000000, killCount: 0, lastKillerUid: null }; bossData.hp -= dmgToApply;
            if (bossData.hp <= 0) { bossData.hp = 7000000; bossData.killCount = (bossData.killCount || 0) + 1; bossData.lastKillerUid = currentUserUid; }
            return bossData;
        }).then(({committed, snapshot}) => {
            if(committed && snapshot.exists()) { let data = snapshot.val(); if (data.lastKillerUid === currentUserUid && !raidState.rewardClaimedForKills.includes(data.killCount)) { raidState.rewardClaimedForKills.push(data.killCount); raidState.gotLastHit = true; } }
            finishProcess();
        }).catch(e => {
            console.warn("보스 데이터 통신 에러 발생:", e);
            finishProcess();
        });
    } else { finishProcess(); }
}

window.closeRaidResult = () => { document.getElementById('raid-result-overlay').style.display = 'none'; document.getElementById('raid-result-modal').style.display = 'none'; document.getElementById('raid-game').style.display = 'none'; document.getElementById('start-screen').style.display = 'flex'; };

// ==========================================
// 8. 랭크 게임 (AI 대전) 시스템
// ==========================================
window.openOnlineMenu = () => { if (!currentUserUid) { showMessage("로그인이 필요한 서비스입니다."); return; } document.getElementById('online-overlay').style.display = 'flex'; document.getElementById('online-menu-modal').style.display = 'block'; };
window.closeOnlineMenu = () => { document.getElementById('online-overlay').style.display = 'none'; };
window.openPkMenuFromOnline = () => { window.closeOnlineMenu(); window.openPkMenu(); };
window.openRankLobbyFromOnline = () => { window.closeOnlineMenu(); window.openRankLobby(); };

window.openRankLobby = () => { let today = new Date().toLocaleDateString(); let lastDate = localStorage.getItem('mapleDefenseRankDate'); let playCount = parseInt(localStorage.getItem('mapleDefenseRankCount')) || 0; if (lastDate !== today) { playCount = 0; localStorage.setItem('mapleDefenseRankDate', today); localStorage.setItem('mapleDefenseRankCount', 0); } document.getElementById('ui-rank-remains').innerText = `${Math.max(0, 10 - playCount)} / 10`; document.getElementById('rank-overlay').style.display = 'flex'; document.getElementById('rank-lobby-modal').style.display = 'block'; document.getElementById('ui-rank-rp').innerText = userRankData.rp + " 점"; document.getElementById('ui-rank-money').innerText = userRankData.rankMoney + " 원"; };
window.closeRankMenu = () => { document.getElementById('rank-overlay').style.display = 'none'; window.openOnlineMenu(); };
window.openRankShop = () => { document.getElementById('ui-shop-rank-money').innerText = userRankData.rankMoney; document.getElementById('ui-shop-pieces').innerText = userInventory.coinPieces; document.getElementById('rank-lobby-modal').style.display = 'none'; document.getElementById('rank-shop-modal').style.display = 'block'; };
window.closeRankShop = () => { document.getElementById('rank-shop-modal').style.display = 'none'; document.getElementById('rank-lobby-modal').style.display = 'block'; };
window.buyMonsterPiece = () => { if (userRankData.rankMoney >= 100) { userRankData.rankMoney -= 100; userInventory.coinPieces += 1; document.getElementById('ui-shop-rank-money').innerText = userRankData.rankMoney; document.getElementById('ui-shop-pieces').innerText = userInventory.coinPieces; document.getElementById('ui-rank-money').innerText = userRankData.rankMoney + " 원"; if (currentUserUid) window.syncToCloud(); } else { showMessage("랭크 머니가 부족합니다."); } };

function showMatchIntro(oppName, oppRp, callback) { let intro = document.getElementById('match-intro-overlay'); document.getElementById('intro-player').innerText = `${currentUserName} (${userRankData.rp} RP)`; document.getElementById('intro-opp').innerText = `${oppName} (${oppRp} RP)`; intro.style.display = 'flex'; void intro.offsetWidth; intro.style.opacity = '1'; setTimeout(() => { intro.style.opacity = '0'; setTimeout(() => { intro.style.display = 'none'; callback(); }, 500); }, 2000);  }

window.startRankMatchmaking = async () => {
    let playCount = parseInt(localStorage.getItem('mapleDefenseRankCount')) || 0; if (playCount >= 10) { showMessage("오늘의 랭크 게임 제한 횟수를 모두 소진했습니다!"); return; }
    document.getElementById('rank-lobby-modal').style.display = 'none'; document.getElementById('rank-waiting-modal').style.display = 'block';
    let oppName = "의문의 용사 (AI)"; let oppRp = userRankData.rp + Math.floor(Math.random() * 40 - 20); oppCardData = {}; oppSkillLevels = { ...skillLevels };
    try { const snap = await get(child(ref(database), `users`)); if (snap.exists()) { let users = []; snap.forEach(c => { let v = c.val(); if (v.cloudData && v.nickname && c.key !== currentUserUid) { let diff = Math.abs((parseInt(v.cloudData.rp)||1000) - userRankData.rp); users.push({ ...v, diff: diff }); } }); users.sort((a,b) => a.diff - b.diff); if(users.length > 0) { let aiUser = users[Math.floor(Math.random() * Math.min(3, users.length))]; oppName = aiUser.nickname + " (AI)"; oppRp = parseInt(aiUser.cloudData.rp) || 1000; if(aiUser.cloudData.cards) oppCardData = JSON.parse(aiUser.cloudData.cards); if(aiUser.cloudData.skills) oppSkillLevels = JSON.parse(aiUser.cloudData.skills); } } } catch(e) { console.log("AI Load Failed"); }
    setTimeout(() => { document.getElementById('rank-waiting-modal').style.display = 'none'; playCount++; localStorage.setItem('mapleDefenseRankCount', playCount); showMatchIntro(oppName, oppRp, () => { enterRankGameAI(oppName, oppRp); }); }, 1500);
};

function enterRankGameAI(oppName, oppRp) {
    document.getElementById('rank-overlay').style.display = 'none'; rankState.active = true; setGridMode('RANK'); 
    state = { status: 'PREP', meso: 100, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 5, speed: 15, isBoss: false, upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} }, tickets: [], isRank: true };
    monsters = []; projectiles = []; towers = []; hitEffects = []; visualEffects = []; fumaList = []; damageTexts = []; waveTimer = 0; spawnTimer = 0; selectedUnitIdx = -1;
    oppState = { wave: 1, meso: 100, isDead: false, isBoss: false }; oppMonsters = []; oppProjectiles = []; oppTowers = []; oppVisualEffects = []; oppFumaList = []; oppDamageTexts = []; oppWaveTimer = 0; oppSpawnTimer = 0;
    renderGrid(); window.switchScreen('game-container'); document.getElementById('btn-speed').style.display = 'none'; document.getElementById('btn-exit').style.display = 'none'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'block'; document.getElementById('opp-board-wrapper').style.display = 'flex'; document.getElementById('opp-name').innerText = oppName; document.getElementById('opp-wave').innerText = '1'; document.getElementById('opp-mobs').innerText = '0'; document.getElementById('best-wave-container').style.display = 'none';
    lastTime = performance.now(); cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
}

window.surrenderRankGame = () => { if (confirm("정말로 항복하시겠습니까? (즉시 패배 처리됩니다)")) { handleRankGameOver("항복했습니다."); } };

function processOpponentTick(dt) {
    if(oppState.isDead) return;
    oppWaveTimer += dt; oppSpawnTimer += dt; let limit = oppState.isBoss ? 150 : 60; 
    if(oppWaveTimer >= limit) { 
        if(oppState.isBoss && oppMonsters.some(m => m.isBoss)) { oppState.isDead = true; state.status = 'GAMEOVER'; processRankResult('WIN', '상대방이 보스 사냥에 실패했습니다!'); return; }
        oppState.wave++; oppWaveTimer = 0; oppSpawnTimer = 0; let bInfo = getBossInfo(oppState.wave); oppState.isBoss = !!bInfo;
        if(oppState.isBoss) { let hpBase = bInfo.hp; oppMonsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: bInfo.name, facingRight: true }); }
    } else if(!oppState.isBoss && oppSpawnTimer >= 1.5) { 
        let hpBase = Math.floor(oppState.wave * 60 + Math.pow(oppState.wave, 1.5) * 12); oppMonsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 50, isBoss: false, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: null, facingRight: true }); oppSpawnTimer = 0; 
    }
    for (let i = oppVisualEffects.length - 1; i >= 0; i--) { oppVisualEffects[i].timer -= dt; if (oppVisualEffects[i].timer <= 0) { let v = oppVisualEffects[i]; if (v.type === 'death' || v.type === 'thunder') oppMonsters.forEach(m => m.hp -= v.dmg); oppVisualEffects.splice(i, 1); } }
    for (let i = oppDamageTexts.length - 1; i >= 0; i--) { oppDamageTexts[i].timer -= dt; oppDamageTexts[i].y -= dt * 30; if (oppDamageTexts[i].timer <= 0) oppDamageTexts.splice(i, 1); }
    for(let i=oppMonsters.length-1; i>=0; i--) {
        let m = oppMonsters[i];
        if (m.freezeTimer > 0) { m.freezeTimer -= dt; m.freezeTickTimer -= dt; if (m.freezeTickTimer <= 0) { m.hp -= m.freezeDmgVal; m.freezeTickTimer = 1; } }
        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; } if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }
        let t = currentPath[m.targetNode]; let dx = t.x - m.x, dy = t.y - m.y; let dist = Math.hypot(dx, dy); let currentSpeed = m.speed; if (m.freezeTimer > 0) currentSpeed *= 0.5; let move = currentSpeed * dt;
        if (dx > 0) m.facingRight = true; else if (dx < 0) m.facingRight = false;
        if(dist <= move) { m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % currentPath.length; } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    if(oppMonsters.length >= 25) { oppState.isDead = true; state.status = 'GAMEOVER'; processRankResult('WIN', '상대방의 몹이 25마리 쌓여 패배했습니다!'); return; }
    let oppCardBonus = 0; for(let k in oppCardData) { if(oppCardData[k].grade > 0) oppCardBonus += 1 + (oppCardData[k].grade - 1) * 0.5; }
    let cardMulti = 1 + (oppCardBonus / 100); let rageMulti = 1 + ((oppSkillLevels.common_rage || 0) * 0.01); let sharpChance = (oppSkillLevels.common_sharp || 0) * 0.05; let windReduc = 1 + ((oppSkillLevels.common_wind || 0) * 0.2);
    oppTowers.forEach(t => {
        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && oppSkillLevels.war_death > 0) || (t.cls.type === '법사' && oppSkillLevels.mage_thunder > 0) || (t.cls.type === '도적' && oppSkillLevels.thief_fuma > 0)) {
                t.globalCooldown -= dt * 1000;
                if (t.globalCooldown <= 0 && oppMonsters.length > 0) {
                    let baseDmg = t.cls.baseDmg * t.grade.mult * cardMulti * rageMulti;
                    if (t.cls.type === '전사' && oppSkillLevels.war_death > 0) { let gdmg = baseDmg * (5 + oppSkillLevels.war_death * 5); oppVisualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg }); t.globalCooldown = 60000; }
                    else if (t.cls.type === '법사' && oppSkillLevels.mage_thunder > 0) { let gdmg = baseDmg * (5 + oppSkillLevels.mage_thunder * 5); oppVisualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); t.globalCooldown = 60000; }
                    else if (t.cls.type === '도적' && oppSkillLevels.thief_fuma > 0) { let gdmg = baseDmg * (5 + oppSkillLevels.thief_fuma * 5); oppFumaList.push({ x: t.x, y: t.y, targetNode: 0, nodesVisited: 0, dmg: gdmg, hitSet: new Set(), angle: 0 }); t.globalCooldown = 60000; }
                }
            }
        }
        t.lastAttack -= dt * 1000;
        if(t.lastAttack <= 0) {
            let range = t.cls.range * t.grade.rangeMul; let target = null;
            for(let m of oppMonsters) { if(Math.hypot(m.x - t.x, m.y - t.y) <= range) { target = m; break; } }
            if(target) {
                let dmg = t.cls.baseDmg * t.grade.mult * cardMulti * rageMulti; let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= 1.2; let isFinal = false; if (t.cls.type === '전사' && oppSkillLevels.war_final > 0 && Math.random() < (oppSkillLevels.war_final * 0.03)) { isFinal = true; dmg *= 2; }
                oppProjectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg });
                if (t.cls.type === '도적' && oppSkillLevels.thief_shadow > 0 && Math.random() < (oppSkillLevels.thief_shadow * 0.03)) { oppProjectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true }); }
                t.lastAttack = (t.cls.cd * (t.grade.speedMul || 1)) / windReduc;
            }
        }
    });
    for(let i=oppFumaList.length-1; i>=0; i--) {
        let f = oppFumaList[i]; f.angle += 15 * dt; let t_node = currentPath[f.targetNode]; let dx = t_node.x - f.x, dy = t_node.y - f.y; let dist = Math.hypot(dx, dy); let move = 300 * dt; 
        oppMonsters.forEach(m => { if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 50) { m.hp -= f.dmg; f.hitSet.add(m); } });
        if(dist <= move) { f.x = t_node.x; f.y = t_node.y; f.targetNode++; f.nodesVisited++; if (f.targetNode >= currentPath.length) f.targetNode = 0; if (f.nodesVisited > currentPath.length) oppFumaList.splice(i, 1); } else { f.x += (dx/dist)*move; f.y += (dy/dist)*move; }
    }
    for(let i=oppProjectiles.length-1; i>=0; i--) {
        let p = oppProjectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt; if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            if(oppMonsters.includes(p.target)) {
                let hitDmg = p.dmg; if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5; p.target.hp -= hitDmg;
                if (p.isCrit) oppDamageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 15, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                if (p.type === '법사' && oppSkillLevels.mage_freeze > 0 && Math.random() < ((10 + oppSkillLevels.mage_freeze * 2) / 100)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][oppSkillLevels.mage_freeze - 1]; } }
            }
            if(p.splash > 0) {
                oppMonsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg; if (p.type === '전사' && m.isBoss) splashDmg *= 1.5; m.hp -= splashDmg;
                        if (p.isCrit) oppDamageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 15, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && oppSkillLevels.mage_freeze > 0 && Math.random() < ((10 + oppSkillLevels.mage_freeze * 2) / 100)) { if (m.freezeTimer <= 0) { m.freezeTimer = 3; m.freezeTickTimer = 1; m.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][oppSkillLevels.mage_freeze - 1]; } }
                    }
                });
            }
            oppProjectiles.splice(i, 1);
        } else { let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; }
    }
    for(let i=oppMonsters.length-1; i>=0; i--) { if(oppMonsters[i].hp <= 0) oppMonsters.splice(i, 1); }
}

function handleRankGameOver(msg) { state.status = 'GAMEOVER'; processRankResult('LOSE', msg); }
async function processRankResult(result, desc) {
    if(!rankState.active) return; rankState.active = false;
    document.getElementById('rank-result-title').innerText = result === 'WIN' ? "🏆 승리! 🏆" : "💀 패배... 💀"; document.getElementById('rank-result-title').style.color = result === 'WIN' ? "#3b82f6" : "#ef4444";
    let rpChange = result === 'WIN' ? 10 : -10; let moneyChange = result === 'WIN' ? 100 : 20; userRankData.rp = Math.max(0, userRankData.rp + rpChange); userRankData.rankMoney += moneyChange;
    document.getElementById('rank-result-rp').innerText = (rpChange > 0 ? "+" : "") + rpChange; document.getElementById('rank-result-rp').style.color = rpChange > 0 ? "#3b82f6" : "#ef4444"; document.getElementById('rank-result-money').innerText = "+" + moneyChange;
    await window.syncToCloud(); document.getElementById('rank-result-overlay').style.display = 'block'; document.getElementById('rank-result-modal').style.display = 'block';
}
window.exitRankGame = () => { document.getElementById('rank-result-overlay').style.display = 'none'; document.getElementById('rank-result-modal').style.display = 'none'; rankState = { active: false }; state.status = 'TITLE'; window.switchScreen('start-screen'); };

// ==========================================
// 9. 월드 펀치킹 시스템
// ==========================================
window.loadPkLiveRanking = async () => {
    let list = document.getElementById('pk-live-ranking-list'); if(!list) return;
    try {
        const snap = await get(child(ref(database), `pk_rankings`));
        if (snap.exists()) {
            let ranks = []; snap.forEach(c => ranks.push(c.val())); ranks.sort((a, b) => b.score - a.score); ranks = ranks.slice(0, 10); list.innerHTML = '';
            ranks.forEach((entry, idx) => { let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:6px 10px; border-radius:4px; color:${color}; font-weight:bold;"><span>${idx + 1}. ${entry.nickname} <span style="font-size:10px; color:#aaa;">(${entry.class})</span></span><span>${entry.score.toLocaleString()}점</span></div>`; });
        } else { list.innerHTML = '<div style="text-align:center; color:#ccc;">아직 등록된 랭킹이 없습니다.</div>'; }
    } catch(e) { list.innerHTML = '<div style="text-align:center; color:#ff5252;">랭킹 서버 연결 실패.</div>'; }
};
window.openPkMenu = () => { document.getElementById('pk-overlay').style.display = 'flex'; document.getElementById('pk-menu').style.display = 'block'; document.getElementById('pk-class-select').style.display = 'none'; document.getElementById('pk-ranking').style.display = 'none'; document.getElementById('pk-result-modal').style.display = 'none'; document.getElementById('pk-result-overlay').style.display = 'none'; };
window.closePk = () => { document.getElementById('pk-overlay').style.display = 'none'; pkState.active = false; cancelAnimationFrame(pkReqId); window.openOnlineMenu(); };
window.showPkClassSelect = () => { if (!currentUserUid) { showMessage("로그인이 필요한 서비스입니다."); return; } document.getElementById('pk-menu').style.display = 'none'; document.getElementById('pk-class-select').style.display = 'block'; };
window.showPkRanking = async () => {
    document.getElementById('pk-menu').style.display = 'none'; document.getElementById('pk-class-select').style.display = 'none'; document.getElementById('pk-overlay').style.display = 'flex'; document.getElementById('pk-ranking').style.display = 'flex';
    let list = document.getElementById('pk-ranking-list'); list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">서버에서 랭킹을 불러오는 중...</div>';
    try {
        const snap = await get(child(ref(database), `pk_rankings`));
        if (snap.exists()) {
            let ranks = []; snap.forEach(c => ranks.push(c.val())); ranks.sort((a, b) => b.score - a.score); ranks = ranks.slice(0, 10); list.innerHTML = '';
            ranks.forEach((entry, idx) => { let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; color:${color}; font-weight:bold;"><span>${idx + 1}위 - ${entry.nickname} (${entry.class})</span><span>${entry.score.toLocaleString()}점 <span style="font-size:10px; color:#aaa;">(${entry.date})</span></span></div>`; });
        } else list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">아직 등록된 랭킹이 없습니다.</div>';
    } catch(e) { list.innerHTML = '<div style="text-align:center; color:#ff5252;">랭킹 서버 연결 실패.</div>'; }
};
window.togglePkSpeed = () => { if (pkState.speed === 1) pkState.speed = 10; else if (pkState.speed === 10) pkState.speed = 15; else pkState.speed = 1; document.getElementById('pk-btn-speed').innerText = pkState.speed + "배속"; };

window.startPkGame = async (clsName) => {
    document.getElementById('pk-overlay').style.display = 'none'; window.switchScreen('pk-game'); window.loadPkLiveRanking();
    let grade = GRADES[8]; let cls = CLASSES[clsName]; document.getElementById('pk-unit-icon').innerText = cls.icon; document.getElementById('pk-unit-name').style.color = cls.color;
    let bestScore = 0; if (currentUserUid) { try { let snap = await get(child(ref(database), `pk_rankings/${currentUserUid}`)); if(snap.exists()) bestScore = snap.val().score; } catch(e) {} }
    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if (pkBarContainer) {
        if ((cls.type === '전사' && skillLevels.war_death > 0) || (cls.type === '법사' && skillLevels.mage_thunder > 0) || (cls.type === '도적' && skillLevels.thief_fuma > 0)) { pkBarContainer.style.display = 'block'; document.getElementById('pk-global-bar').style.background = cls.type === '전사' ? '#ffeb3b' : (cls.type === '법사' ? '#00e5ff' : '#ab47bc'); document.getElementById('pk-global-bar').style.width = '0%'; } else pkBarContainer.style.display = 'none';
    }
    pkState = { active: true, time: 60, score: 0, lastTime: performance.now(), speed: 1, bestScore: bestScore, unit: { cls: cls, grade: grade, gradeIdx: 8, x: 110, y: 250, lastAttack: 0, globalCooldown: 0 }, scarecrow: { x: 390, y: 250, size: 20, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0 }, projectiles: [], dmgTexts: [], vfx: [] };
    document.getElementById('pk-score').innerText = '0'; document.getElementById('pk-time').innerText = '60'; document.getElementById('pk-btn-speed').innerText = "1배속"; pkLoop();
};

function pkLoop() { 
    if (!pkState.active) return;
    let now = performance.now(); 
    if (!pkState.lastTime) pkState.lastTime = now;
    let dtReal = (now - pkState.lastTime) / 1000;
    if (dtReal > 0.1) dtReal = 0.1;
    if (dtReal < 0) dtReal = 0.016;
    
    let dt = dtReal * (pkState.speed || 1); 
    pkState.lastTime = now;

    pkState.time -= dt; 
    document.getElementById('pk-time').innerText = Math.ceil(Math.max(0, pkState.time));
    if (pkState.time <= 0) {
        pkState.active = false; cancelAnimationFrame(pkReqId);
        let finalScore = Math.floor(pkState.score); let scoreHtml = finalScore.toLocaleString(); if (finalScore > pkState.bestScore && finalScore > 0) { scoreHtml += ' <span style="font-size:16px; color:#ffeb3b; text-shadow:1px 1px 2px #000;">(신기록!)</span>'; }
        document.getElementById('pk-final-score').innerHTML = scoreHtml; document.getElementById('pk-result-overlay').style.display = 'block'; document.getElementById('pk-result-modal').style.display = 'block'; return; 
    }
    let u = pkState.unit; let target = pkState.scarecrow;
    if (target.freezeTimer > 0) { target.freezeTimer -= dt; target.freezeTickTimer -= dt; if (target.freezeTickTimer <= 0) { pkApplyDmg(target.freezeDmgVal, false); target.freezeTickTimer = 1; } }
    let cardMulti = 1 + (getTotalCardBonus() / 100); let rageMulti = 1 + (skillLevels.common_rage * 0.01) + (equipStats.atk * 0.01); let sharpChance = (skillLevels.common_sharp * 0.05) + (equipStats.crit * 0.01); let windReduc = 1 + (skillLevels.common_wind * 0.2) + (equipStats.spd * 0.01);
    let pkBaseDmg = 20; let pkBaseCd = 1000;
    if ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
        u.globalCooldown -= dt * 1000; let pbar = document.getElementById('pk-global-bar'); if (pbar) pbar.style.width = Math.max(0, Math.min(100, ((60000 - u.globalCooldown) / 60000) * 100)) + '%';
        if (u.globalCooldown <= 0) {
            let baseDmg = pkBaseDmg * u.grade.mult * cardMulti * rageMulti; 
            if (u.cls.type === '전사' && skillLevels.war_death > 0) { let gdmg = baseDmg * (5 + skillLevels.war_death * 5); pkState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg }); u.globalCooldown = 60000; } 
            else if (u.cls.type === '법사' && skillLevels.mage_thunder > 0) { let gdmg = baseDmg * (5 + skillLevels.mage_thunder * 5); pkState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); u.globalCooldown = 60000; } 
            else if (u.cls.type === '도적' && skillLevels.thief_fuma > 0) { let gdmg = baseDmg * (5 + skillLevels.thief_fuma * 5); pkApplyDmg(gdmg, false); pkState.vfx.push({ type: 'fuma', timer: 0.5 }); u.globalCooldown = 60000; }
        }
    }
    u.lastAttack -= dt * 1000;
    if (u.lastAttack <= 0) {
        let dmg = pkBaseDmg * u.grade.mult * cardMulti * rageMulti; let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= 1.2; let isFinal = false; if (u.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < (skillLevels.war_final * 0.03)) { isFinal = true; dmg *= 2; }
        pkState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg });
        if (u.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < (skillLevels.thief_shadow * 0.03)) { pkState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, isFinal: false, isShadow: true }); }
        u.lastAttack = (pkBaseCd * (u.grade.speedMul || 1)) / windReduc;
    }
    for (let i = pkState.projectiles.length - 1; i >= 0; i--) {
        let p = pkState.projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt; if (p.type === '도적') p.angle += 15 * dt;
        if (dist <= speed) {
            pkApplyDmg(p.dmg, p.isCrit);
            if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) { if (target.freezeTimer <= 0) { target.freezeTimer = 3; target.freezeTickTimer = 1; target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1]; } }
            pkState.projectiles.splice(i, 1);
        } else { let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; }
    }
    for (let i = pkState.dmgTexts.length - 1; i >= 0; i--) { pkState.dmgTexts[i].timer -= dt; pkState.dmgTexts[i].y -= dt * 30; if (pkState.dmgTexts[i].timer <= 0) pkState.dmgTexts.splice(i, 1); }
    for (let i = pkState.vfx.length - 1; i >= 0; i--) {
        pkState.vfx[i].timer -= dt;
        if (pkState.vfx[i].timer <= 0) { let v = pkState.vfx[i]; if (v.type === 'death') { pkApplyDmg(v.dmg, false); let container = document.getElementById('pk-game'); if(container) { container.classList.add('mild-shake-active'); setTimeout(() => container.classList.remove('mild-shake-active'), 300); } } else if (v.type === 'thunder') { pkApplyDmg(v.dmg, false); } pkState.vfx.splice(i, 1); }
    }
    drawPk(); pkReqId = requestAnimationFrame(pkLoop);
}

function pkApplyDmg(dmg, isCrit) { pkState.score += (dmg / 10000); document.getElementById('pk-score').innerText = Math.floor(pkState.score).toLocaleString(); let ox = (Math.random() - 0.5) * 15; let oy = (Math.random() - 0.5) * 15; pkState.dmgTexts.push({ val: Math.floor(dmg), x: pkState.scarecrow.x + ox, y: pkState.scarecrow.y - 40 + oy, timer: 0.6, isCrit: isCrit }); }

window.submitPkScore = async () => {
    let finalScore = Math.floor(pkState.score); let className = pkState.unit.cls.type;
    if (!currentUserUid) { alert("로그인이 끊어졌습니다."); window.switchScreen('start-screen'); return; }
    const btnSubmit = document.getElementById('btn-submit-pk'); if(btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerText = "서버에 저장 중..."; }
    try {
        const snap = await get(child(ref(database), `pk_rankings/${currentUserUid}`));
        if (snap.exists()) { const data = snap.val(); if (finalScore > data.score) { await set(ref(database, `pk_rankings/${currentUserUid}`), { nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString() }); } } 
        else { await set(ref(database, `pk_rankings/${currentUserUid}`), { nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString() }); }
    } catch(e) { alert("서버 통신 중 오류가 발생했습니다."); }
    if(btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerText = "랭킹 등록하고 로비로"; }
    document.getElementById('pk-result-overlay').style.display = 'none'; document.getElementById('pk-result-modal').style.display = 'none'; window.switchScreen('start-screen'); window.loadPkLiveRanking(); 
};

window.endPkGame = (isGiveUp) => { pkState.active = false; cancelAnimationFrame(pkReqId); if (isGiveUp) { window.switchScreen('start-screen'); } };

function drawPk() {
    let pkCanvas = document.getElementById('pkCanvas'); let pkCtx = pkCanvas.getContext('2d'); pkCtx.clearRect(0, 0, pkCanvas.width, pkCanvas.height); pkCtx.setLineDash([]); pkCtx.strokeStyle = "rgba(188, 170, 164, 0.2)"; pkCtx.lineWidth = 35; pkCtx.lineJoin = "round"; pkCtx.beginPath(); pkCtx.rect(25, 25, 450, 450); pkCtx.stroke();
    let m = pkState.scarecrow; let size = 25; 
    if (husooabiImg && husooabiImg.complete && husooabiImg.naturalWidth > 0) { pkCtx.save(); pkCtx.translate(m.x, m.y); if (m.freezeTimer > 0) { pkCtx.globalAlpha = 0.5; pkCtx.fillStyle = "#81d4fa"; pkCtx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3); pkCtx.globalAlpha = 1.0; } pkCtx.drawImage(husooabiImg, -size * 1.5, -size * 1.5, size * 3, size * 3); pkCtx.restore(); } 
    else { pkCtx.font = "40px NanumSquare"; pkCtx.textAlign = "center"; pkCtx.textBaseline = "middle"; pkCtx.fillText("🎃", m.x, m.y);  }
    if (m.freezeTimer > 0) { pkCtx.fillStyle = "rgba(0, 200, 255, 0.5)"; pkCtx.fillRect(m.x - 20, m.y - 20, 40, 40); pkCtx.fillStyle = "#fff"; pkCtx.font = "16px NanumSquare"; pkCtx.fillText("❄️", m.x + 15, m.y - 15); }
    
    // 🔥 펀치킹 화면에도 오리지널 스킬 이펙트 복구 완료!
    pkState.vfx.forEach(v => { 
        if (v.type === 'fuma') { 
            pkCtx.save(); pkCtx.translate(m.x, m.y); pkCtx.rotate((0.5 - v.timer) * 30); if (fumaImg && fumaImg.complete) { let fsize = 80; pkCtx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); } pkCtx.restore(); 
        } else {
            pkCtx.save();
            if (v.type === 'death') {
                let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
                pkCtx.strokeStyle = "#ffeb3b"; pkCtx.lineWidth = 12; pkCtx.lineCap = "round"; pkCtx.shadowColor = "#f57f17"; pkCtx.shadowBlur = 15;
                let currentX = -50 + (600) * progress; let currentY = 550 + (-600) * progress;
                pkCtx.beginPath(); pkCtx.moveTo(-50, 550); pkCtx.lineTo(currentX, currentY); pkCtx.stroke();
            } else if (v.type === 'thunder') {
                pkCtx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; pkCtx.fillRect(0,0,500,500);
                pkCtx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; pkCtx.lineWidth = 20;
                pkCtx.beginPath(); pkCtx.moveTo(250,0); pkCtx.lineTo(150,250); pkCtx.lineTo(350,250); pkCtx.lineTo(250,500); pkCtx.stroke();
            }
            pkCtx.restore();
        }
    });

    pkState.projectiles.forEach(p => {
        pkCtx.save(); pkCtx.translate(p.x, p.y); let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let scale = 1.5; if (p.isFinal) scale *= 1.3; pkCtx.scale(scale, scale); if (p.isShadow) pkCtx.globalAlpha = 0.5;
        let img = null; let psize = 35; 
        if (p.type === '전사') { img = projImages.warrior2; pkCtx.rotate(dir + Math.PI); } else if (p.type === '법사') { img = projImages.mage2; pkCtx.rotate(dir + (15 * Math.PI / 180)); } else if (p.type === '도적') { img = projImages.rogue2; psize = 25; pkCtx.rotate(p.angle); }
        if (img && img.complete) { pkCtx.drawImage(img, -psize/2, -psize/2, psize, psize); } pkCtx.restore();
    });
    pkState.dmgTexts.forEach(d => { pkCtx.save(); pkCtx.globalAlpha = Math.max(0, d.timer / 0.6); pkCtx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; pkCtx.font = d.isCrit ? "900 24px NanumSquare" : "bold 18px NanumSquare"; pkCtx.shadowColor = d.isCrit ? "#c62828" : "#000"; pkCtx.shadowBlur = 4; pkCtx.fillText(d.val, d.x, d.y); pkCtx.restore(); });
}

// 🔥 핵심: window 영역에 확실하게 연결
window.updateUI = () => {
    let skipWrapper = document.getElementById('boss-skip-wrapper'); if (state.isBoss && monsters.length === 0 && waveTimer > 0 && !state.isRank) skipWrapper.style.display = 'flex'; else skipWrapper.style.display = 'none';
    document.getElementById('ui-meso').innerText = state.meso; document.getElementById('ui-mp').innerText = state.mp; document.getElementById('ui-wave').innerText = state.wave; document.getElementById('ui-kills').innerText = state.kills.toLocaleString(); document.getElementById('ui-tickets').innerText = state.tickets.length; document.getElementById('btn-summon').disabled = (state.meso < 10);
    
    document.getElementById('ui-mobs').innerText = `${monsters.length} / ${state.isRank ? 25 : 50}`; 
    
    if (state.isRank) { document.getElementById('opp-wave').innerText = oppState.wave; document.getElementById('opp-mobs').innerText = oppMonsters.length; }
    let sellBtn = document.getElementById('btn-sell-single'); if (selectedUnitIdx !== -1 && grid[selectedUnitIdx] && grid[selectedUnitIdx].grade.sell > 0) { sellBtn.disabled = false; } else { sellBtn.disabled = true; }
    if (state.upgrades) { document.getElementById('upg-w-val').innerText = state.upgrades['전사'].val; document.getElementById('upg-w-cost').innerText = state.upgrades['전사'].cost; document.getElementById('upg-m-val').innerText = state.upgrades['법사'].val; document.getElementById('upg-m-cost').innerText = state.upgrades['법사'].cost; document.getElementById('upg-t-val').innerText = state.upgrades['도적'].val; document.getElementById('upg-t-cost').innerText = state.upgrades['도적'].cost; }
};

window.draw = () => {
    if(!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(188, 170, 164, 0.4)"; ctx.lineWidth = 35; ctx.lineJoin = "round"; ctx.beginPath();
    ctx.moveTo(currentPath[0].x, currentPath[0].y);
    for(let i=1; i<currentPath.length; i++) ctx.lineTo(currentPath[i].x, currentPath[i].y);
    ctx.closePath(); ctx.stroke();

    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx]) {
        let u = grid[selectedUnitIdx];
        let attackRange = u.cls.range * u.grade.rangeMul;
        ctx.save();
        ctx.beginPath();
        ctx.arc(u.x, u.y, attackRange, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 235, 59, 0.6)";
        ctx.stroke();
        ctx.restore();
    }

    monsters.forEach(m => {
        let size = m.isBoss ? 25 : 12;
        ctx.save(); ctx.translate(m.x, m.y);
        
        if (m.facingRight) ctx.scale(-1, 1);
        
        if (m.isBoss && bossImages[m.name] && bossImages[m.name].complete) {
            ctx.drawImage(bossImages[m.name], -size*1.5, -size*1.5, size*3, size*3);
        } else {
            ctx.fillStyle = m.isBoss ? "#ef5350" : "#ffca28";
            ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill();
        }
        
        if (m.freezeTimer > 0) {
            ctx.fillStyle = "rgba(0, 200, 255, 0.4)"; ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = "#333"; ctx.fillRect(m.x - size, m.y - size - 10, size * 2, 4);
        ctx.fillStyle = m.isBoss ? "#ff5252" : "#4caf50"; ctx.fillRect(m.x - size, m.y - size - 10, (size * 2) * (m.hp / m.maxHp), 4);
    });

    // 🔥 메인 게임 화면에 오리지널 스킬 이펙트 복구 완료!
    visualEffects.forEach(v => {
        ctx.save();
        if (v.type === 'death') {
            let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
            ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.shadowColor = "#f57f17"; ctx.shadowBlur = 15;
            let currentX = -50 + (600) * progress; let currentY = 550 + (-600) * progress;
            ctx.beginPath(); ctx.moveTo(-50, 550); ctx.lineTo(currentX, currentY); ctx.stroke();
        } else if (v.type === 'thunder') {
            ctx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; ctx.fillRect(0,0,500,500);
            ctx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; ctx.lineWidth = 20;
            ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(150,250); ctx.lineTo(350,250); ctx.lineTo(250,500); ctx.stroke();
        }
        ctx.restore();
    });

    fumaList.forEach(f => {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        if (fumaImg && fumaImg.complete) { let fsize = 60; ctx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); }
        ctx.restore();
    });

    projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y);
        let dir = Math.atan2(p.ty - p.y, p.tx - p.x);
        let scale = 1.0; if (p.isFinal) scale *= 1.3; ctx.scale(scale, scale);
        if (p.isShadow) ctx.globalAlpha = 0.5;

        let img = null; let psize = 20;
        if (p.type === '전사') { img = p.gradeIdx >= 6 ? projImages.warrior2 : projImages.warrior1; ctx.rotate(dir + Math.PI); psize = p.gradeIdx >= 6 ? 30 : 20; }
        else if (p.type === '법사') { img = p.gradeIdx >= 6 ? projImages.mage2 : projImages.mage1; ctx.rotate(dir + (15 * Math.PI / 180)); psize = p.gradeIdx >= 6 ? 30 : 20; }
        else if (p.type === '도적') { img = p.gradeIdx >= 6 ? projImages.rogue2 : projImages.rogue1; ctx.rotate(p.angle); }

        if (img && img.complete) { ctx.drawImage(img, -psize/2, -psize/2, psize, psize); }
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
    });

    hitEffects.forEach(h => {
        ctx.save(); ctx.globalAlpha = h.timer / 0.2; ctx.fillStyle = h.color;
        ctx.beginPath(); ctx.arc(h.x, h.y, 15, 0, Math.PI*2); ctx.fill(); ctx.restore();
    });

    damageTexts.forEach(d => {
        ctx.save(); ctx.globalAlpha = Math.max(0, d.timer / 0.8);
        ctx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff";
        ctx.font = d.isCrit ? "900 16px NanumSquare" : "bold 12px NanumSquare";
        ctx.shadowColor = d.isCrit ? "#c62828" : "#000"; ctx.shadowBlur = 3;
        ctx.fillText(d.val, d.x, d.y); ctx.restore();
    });
};

window.drawOpp = () => {
    if(!oppCtx) return;
    oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);
    
    oppCtx.setLineDash([]); oppCtx.strokeStyle = "rgba(188, 170, 164, 0.4)"; oppCtx.lineWidth = 20; oppCtx.lineJoin = "round"; oppCtx.beginPath();
    oppCtx.moveTo(currentPath[0].x, currentPath[0].y);
    for(let i=1; i<currentPath.length; i++) oppCtx.lineTo(currentPath[i].x, currentPath[i].y);
    oppCtx.closePath(); oppCtx.stroke();

    oppMonsters.forEach(m => {
        let size = m.isBoss ? 15 : 8;
        oppCtx.save(); oppCtx.translate(m.x, m.y);
        
        if (m.facingRight) oppCtx.scale(-1, 1);
        
        if (m.isBoss && bossImages[m.name] && bossImages[m.name].complete) {
            oppCtx.drawImage(bossImages[m.name], -size*1.5, -size*1.5, size*3, size*3);
        } else {
            oppCtx.fillStyle = m.isBoss ? "#ef5350" : "#ffca28";
            oppCtx.beginPath(); oppCtx.arc(0, 0, size, 0, Math.PI*2); oppCtx.fill();
        }
        oppCtx.restore();

        oppCtx.fillStyle = "#333"; oppCtx.fillRect(m.x - size, m.y - size - 6, size * 2, 3);
        oppCtx.fillStyle = m.isBoss ? "#ff5252" : "#4caf50"; oppCtx.fillRect(m.x - size, m.y - size - 6, (size * 2) * (m.hp / m.maxHp), 3);
    });

    // 🔥 랭겜 상대방 화면에도 오리지널 스킬 이펙트 복구 완료!
    oppVisualEffects.forEach(v => {
        oppCtx.save();
        if (v.type === 'death') {
            let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
            oppCtx.strokeStyle = "#ffeb3b"; oppCtx.lineWidth = 8; oppCtx.lineCap = "round"; oppCtx.shadowColor = "#f57f17"; oppCtx.shadowBlur = 10;
            let currentX = -50 + (600) * progress; let currentY = 450 + (-400) * progress;
            oppCtx.beginPath(); oppCtx.moveTo(-50, 450); oppCtx.lineTo(currentX, currentY); oppCtx.stroke();
        } else if (v.type === 'thunder') {
            oppCtx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; oppCtx.fillRect(0,0,500,500);
            oppCtx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; oppCtx.lineWidth = 15;
            oppCtx.beginPath(); oppCtx.moveTo(250,0); oppCtx.lineTo(200,250); oppCtx.lineTo(300,250); oppCtx.lineTo(250,500); oppCtx.stroke();
        }
        oppCtx.restore();
    });

    oppProjectiles.forEach(p => {
        oppCtx.save(); oppCtx.translate(p.x, p.y);
        let dir = Math.atan2(p.ty - p.y, p.tx - p.x);
        let img = null; let psize = 12;
        if (p.type === '전사') { img = p.gradeIdx >= 6 ? projImages.warrior2 : projImages.warrior1; oppCtx.rotate(dir + Math.PI); }
        else if (p.type === '법사') { img = p.gradeIdx >= 6 ? projImages.mage2 : projImages.mage1; oppCtx.rotate(dir + (15 * Math.PI / 180)); }
        else if (p.type === '도적') { img = p.gradeIdx >= 6 ? projImages.rogue2 : projImages.rogue1; oppCtx.rotate(p.angle); }
        
        if (img && img.complete) oppCtx.drawImage(img, -psize/2, -psize/2, psize, psize);
        else { oppCtx.fillStyle = p.color; oppCtx.beginPath(); oppCtx.arc(0, 0, 3, 0, Math.PI*2); oppCtx.fill(); }
        oppCtx.restore();
    });

    oppDamageTexts.forEach(d => {
        oppCtx.save(); oppCtx.globalAlpha = Math.max(0, d.timer / 0.8);
        oppCtx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff";
        oppCtx.font = "bold 10px NanumSquare";
        oppCtx.shadowColor = "#000"; oppCtx.shadowBlur = 2;
        oppCtx.fillText(d.val, d.x, d.y); oppCtx.restore();
    });
};

window.loop = () => {
    if(state.status === 'GAMEOVER' || state.status === 'TITLE') return;
    let now = performance.now(); 
    
    if (!lastTime) lastTime = now;
    let dtReal = (now - lastTime) / 1000;
    if (dtReal > 0.1) dtReal = 0.1; 
    if (dtReal < 0) dtReal = 0.016; 
    
    let dt = dtReal * (state.speed || 1); 
    lastTime = now;
    
    for (let i = hitEffects.length - 1; i >= 0; i--) { hitEffects[i].timer -= dt; if (hitEffects[i].timer <= 0) hitEffects.splice(i, 1); }
    for (let i = visualEffects.length - 1; i >= 0; i--) {
        visualEffects[i].timer -= dt;
        if (visualEffects[i].timer <= 0) {
            let v = visualEffects[i];
            if (v.type === 'death') { monsters.forEach(m => m.hp -= v.dmg); let container = document.getElementById('game-container'); if (container) { container.classList.add('mild-shake-active'); setTimeout(() => container.classList.remove('mild-shake-active'), 300); } } else if (v.type === 'thunder') { monsters.forEach(m => m.hp -= v.dmg); }
            visualEffects.splice(i, 1);
        }
    }
    for (let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].timer -= dt; damageTexts[i].y -= dt * 30; if (damageTexts[i].timer <= 0) damageTexts.splice(i, 1); }
    
    if (state.status === 'PREP') {
        state.time -= dtReal; 
        document.getElementById('ui-timer').innerText = Math.ceil(Math.max(0, state.time));
        if (state.time <= 0) { state.status = 'PLAY'; state.wave = state.wave || 1; waveTimer = 0; spawnTimer = 0; showMessage(state.wave + "웨이브 시작!"); window.updateUI(); }
        window.draw(); if(state.isRank) window.drawOpp(); mainReqId = requestAnimationFrame(window.loop); return;
    }
    
    updateWave(dt); if(state.isRank) processOpponentTick(dt);
    
    for(let i=monsters.length-1; i>=0; i--) {
        let m = monsters[i];
        if (m.freezeTimer > 0) { m.freezeTimer -= dt; m.freezeTickTimer -= dt; if (m.freezeTickTimer <= 0) { m.hp -= m.freezeDmgVal; m.freezeTickTimer = 1; } }
        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; } if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }
        let t = currentPath[m.targetNode]; let dx = t.x - m.x, dy = t.y - m.y; let dist = Math.hypot(dx, dy); let currentSpeed = m.speed; if (m.freezeTimer > 0) currentSpeed *= 0.5; let move = currentSpeed * dt;
        if (dx > 0) m.facingRight = true; else if (dx < 0) m.facingRight = false;
        if(dist <= move) { m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % currentPath.length; } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    
    if(state.isRank && monsters.length >= 25) return handleRankGameOver("몹 25마리 초과!");
    if(!state.isRank && monsters.length >= 50) return gameOver("몬스터 50마리 초과! 게임 오버");
    
    let cardMulti = 1 + (getTotalCardBonus() / 100);
    let rageMulti = 1 + (skillLevels.common_rage * 0.01) + (equipStats.atk * 0.01);
    let sharpChance = (skillLevels.common_sharp * 0.05) + (equipStats.crit * 0.01);
    let windReduc = 1 + (skillLevels.common_wind * 0.2) + (equipStats.spd * 0.01);

    towers.forEach(t => {
        if (t.gradeIdx === 6) {
            t.bindCooldown -= dt * 1000; let bar = document.getElementById(`bind-bar-${t.idx}`); if (bar) bar.style.width = Math.max(0, Math.min(100, ((75000 - t.bindCooldown) / 75000) * 100)) + '%';
            if (t.bindCooldown <= 0 && monsters.length > 0) { let target = null; for (let m of monsters) { if (m.bindTimer <= 0) { target = m; break; } } if (!target) target = monsters[0]; if (target) { target.bindTimer = 10; t.bindCooldown = 75000; } }
        }
        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && skillLevels.war_death > 0) || (t.cls.type === '법사' && skillLevels.mage_thunder > 0) || (t.cls.type === '도적' && skillLevels.thief_fuma > 0)) {
                t.globalCooldown -= dt * 1000; let gbar = document.getElementById(`global-bar-${t.idx}`); if (gbar) gbar.style.width = Math.max(0, Math.min(100, ((60000 - t.globalCooldown) / 60000) * 100)) + '%';
                if (t.globalCooldown <= 0 && monsters.length > 0) {
                    let baseDmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15)) * t.grade.mult * cardMulti * rageMulti;
                    if (t.cls.type === '전사' && skillLevels.war_death > 0) { let gdmg = baseDmg * (5 + skillLevels.war_death * 5); visualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg }); t.globalCooldown = 60000; if(state.isRank && state.isBoss) rankState.myBossDamage += gdmg; }
                    else if (t.cls.type === '법사' && skillLevels.mage_thunder > 0) { let gdmg = baseDmg * (5 + skillLevels.mage_thunder * 5); visualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); t.globalCooldown = 60000; if(state.isRank && state.isBoss) rankState.myBossDamage += gdmg; }
                    else if (t.cls.type === '도적' && skillLevels.thief_fuma > 0) { let gdmg = baseDmg * (5 + skillLevels.thief_fuma * 5); fumaList.push({ x: t.x, y: t.y, targetNode: 0, nodesVisited: 0, dmg: gdmg, hitSet: new Set(), angle: 0 }); t.globalCooldown = 60000; }
                }
            }
        }
        t.lastAttack -= dt * 1000;
        if(t.lastAttack <= 0) {
            let range = t.cls.range * t.grade.rangeMul; let target = null;
            for(let m of monsters) { let d = Math.hypot(m.x - t.x, m.y - t.y); if(d <= range) { target = m; break; } }
            if(target) {
                let dmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15)) * t.grade.mult * cardMulti * rageMulti; let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= 1.2;
                let isFinal = false; if (t.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < (skillLevels.war_final * 0.03)) { isFinal = true; dmg *= 2; }
                projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg });
                if (t.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < (skillLevels.thief_shadow * 0.03)) { projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true }); }
                t.lastAttack = (t.cls.cd * (t.grade.speedMul || 1)) / windReduc;
            }
        }
    });
    
    for(let i=fumaList.length-1; i>=0; i--) {
        let f = fumaList[i]; f.angle += 15 * dt; let t_node = currentPath[f.targetNode]; let dx = t_node.x - f.x, dy = t_node.y - f.y; let dist = Math.hypot(dx, dy); let move = 300 * dt; 
        monsters.forEach(m => { if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 50) { m.hp -= f.dmg; f.hitSet.add(m); if(state.isRank && m.isBoss) rankState.myBossDamage += f.dmg; } });
        if(dist <= move) { f.x = t_node.x; f.y = t_node.y; f.targetNode++; f.nodesVisited++; if (f.targetNode >= currentPath.length) f.targetNode = 0; if (f.nodesVisited > currentPath.length) fumaList.splice(i, 1); } else { f.x += (dx/dist)*move; f.y += (dy/dist)*move; }
    }

    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt;
        if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            if (p.gradeIdx >= 6) { hitEffects.push({ x: p.tx, y: p.ty, timer: 0.2, color: p.color }); }
            if(monsters.includes(p.target)) {
                let hitDmg = p.dmg; if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5; p.target.hp -= hitDmg; if(state.isRank && p.target.isBoss) rankState.myBossDamage += hitDmg;
                if (p.isCrit) damageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 15, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1]; } }
            }
            if(p.splash > 0) {
                monsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg; if (p.type === '전사' && m.isBoss) splashDmg *= 1.5; m.hp -= splashDmg; if(state.isRank && m.isBoss) rankState.myBossDamage += splashDmg;
                        if (p.isCrit) damageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 15, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < ((10 + skillLevels.mage_freeze * 2) / 100)) { if (m.freezeTimer <= 0) { m.freezeTimer = 3; m.freezeTickTimer = 1; m.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][skillLevels.mage_freeze - 1]; } }
                    }
                });
            }
            projectiles.splice(i, 1);
        } else { let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; }
    }
    for(let i=monsters.length-1; i>=0; i--) {
        if(monsters[i].hp <= 0) {
            state.kills++;
            if (!state.isRank) {
                state.mp++; state.mpTotal++; if(state.mpTotal >= 10) { state.meso += 5; state.mpTotal -= 10; }
                if(monsters[i].isBoss) {
                    let bInfo = getBossInfo(state.wave); state.meso += bInfo.meso; state.tickets.push(bInfo.ticket);
                    if (Math.random() * 100 <= 20) { cardData[bInfo.name] = cardData[bInfo.name] || { owned: 0, grade: 0 }; cardData[bInfo.name].owned++; localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); if (currentUserUid) window.syncToCloud(); showBossToast(bInfo.name, true); }
                }
            }
            if(monsters[i].isBoss) showMessage(`${state.wave}라운드 보스 처치!`);
            monsters.splice(i, 1); window.updateUI();
        }
    }
    
    window.draw(); if(state.isRank) window.drawOpp(); 
    mainReqId = requestAnimationFrame(window.loop);
};