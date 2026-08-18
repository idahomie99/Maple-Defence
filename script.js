// 🔥 1.0.77 버전 - 레디투다이 45초 쿨타임, 신규 이펙트 추가, 보스 반격 로직 수정 및 힐 스킬 6차 조정
const GAME_VERSION = "1.0.77"; 

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
// 1. 글로벌 변수 및 신규 시스템 설정
// ==========================================
let currentUserName = "이름없는 용사";
let currentUserUid = null;
let lastNicknameChange = 0; 
let userRankData = { rp: 1000, rankMoney: 0, bonusCoins: 0 };

let userInventory = { 
    coinPieces: 0, equipBoxes: 0, starPieces: 0,
    boxes: { '브론즈': 0, '실버': 0, '골드': 0, '플래티넘': 0, '다이아몬드': 0, '챌린저': 0 }
};
let userEquips = []; 
let userEquipped = { '뱃지': null, '엠블럼': null, '링': null }; 

let equipStats = { atk: 0, spd: 0, crit: 0, cdmg: 0, pen: 0, flatAtk: 0, unpenetratedRate: 1.0 }; 
const STARFORCE_BONUS = { 'Rare': 2, 'Epic': 4, 'Unique': 6, 'Legendary': 8 };

// 🔥 [신규] 코어 젬스톤 시스템 전역 변수 및 슬롯 계산 함수
let highestMulungFloor = 0; // 무릉 최고 층수 캐싱
let userCores = { 
    gemstones: 0, // 미개봉 코어 젬스톤 갯수
    items: {},    // 보유 및 강화 중인 코어 데이터 (예: { war_final: { level: 1, dupes: 0 } })
    equipped: []  // 현재 장착 중인 코어 리스트
};

window.getUnlockedCoreSlots = () => {
    let maxFloor = highestMulungFloor || 0;
    // 기본 4칸 + 무릉 60층마다 2칸씩 추가 해금 (최대 9칸)
    let unlockedSlots = 4 + Math.floor(maxFloor / 60) * 2;
    return Math.min(unlockedSlots, 9); 
};

const OPTION_RANGES = {
    'Rare': { atk: [1, 3], spd: [1, 3], crit: [1, 3], pen: [2, 5], cdmg: [1, 3] },
    'Epic': { atk: [4, 8], spd: [4, 8], crit: [4, 8], pen: [6, 12], cdmg: [3, 6] },
    'Unique': { atk: [9, 15], spd: [9, 15], crit: [9, 15], pen: [13, 20], cdmg: [6, 10] },
    'Legendary': { atk: [16, 25], spd: [16, 25], crit: [16, 25], pen: [21, 30], cdmg: [10, 15] }
};
const OPTION_TYPES = ['atk', 'spd', 'crit', 'pen', 'cdmg'];

let raidState = {
    status: 'TITLE', active: false, time: 60, prepTime: 5, meso: 30,
    totalDmg: 0, pendingDmg: 0, lastTime: 0,
    bossHp: 15000000, maxHp: 15000000, bossThreatTimer: 0,
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
let rankState = { active: false, wolfSentBlocks: {}, oppWolfSentBlocks: {}, myBossDamage: 0 };
let oppState = { wave: 1, meso: 50, isDead: false, isBoss: false };
let oppMonsters = [], oppProjectiles = [], oppTowers = [];
let oppVisualEffects = [], oppFumaList = [], oppDamageTexts = [];
let oppWaveTimer = 0, oppSpawnTimer = 0;
let oppCardData = {}, oppSkillLevels = {};
let oppEquipStats = { atk: 0, spd: 0, crit: 0, cdmg: 0, pen: 0, flatAtk: 0, unpenetratedRate: 1.0 }; 
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

// ==========================================
// 3. 이미지 및 데이터 로드 (신규 이펙트 추가)
// ==========================================
let bestWaveStr = localStorage.getItem('mapleDefenseBestWave'); 
let bestWave = bestWaveStr ? parseInt(bestWaveStr) : 0; if (isNaN(bestWave)) bestWave = 0; 
document.getElementById('ui-best-wave').innerText = bestWave;

let cardData = JSON.parse(localStorage.getItem('mapleDefenseCards')) || {}; 
const CARD_REQ = [1, 2, 4, 8, 12, 16, 20, 24, 28, 32]; 
let spentCoins = parseInt(localStorage.getItem('mapleDefenseSpentCoins')) || 0;

const DEFAULT_SKILLS = { common_wind: 0, common_sharp: 0, common_rage: 0, war_final: 0, war_death: 0, mage_freeze: 0, mage_thunder: 0, thief_shadow: 0, thief_fuma: 0, war_threat: 0, mage_heal: 0, thief_overload: 0 };
let skillLevels = JSON.parse(localStorage.getItem('mapleDefenseSkills')) || {};
skillLevels = { ...DEFAULT_SKILLS, ...skillLevels };

// 🔥 스킬 만렙(10) 확장용 헬퍼 함수
const getSkillValue = (key, lv) => {
    if (!lv) return 0;
    if (key === 'common_wind') return lv <= 5 ? lv * 0.2 : 1.0 + (lv - 5) * 0.1;
    if (key === 'common_sharp') return lv <= 5 ? lv * 0.05 : 0.25 + (lv - 5) * 0.025;
    if (key === 'common_rage') return lv <= 5 ? lv * 0.01 : 0.05 + (lv - 5) * 0.005;
    if (key === 'war_final') return lv <= 5 ? lv * 0.03 : 0.15 + (lv - 5) * 0.015;
    if (key === 'thief_shadow') return lv <= 5 ? lv * 0.03 : 0.15 + (lv - 5) * 0.015;
    return 0;
};
const getFreezeChance = (lv) => (!lv ? 0 : (lv <= 5 ? 0.1 + lv * 0.02 : 0.2 + (lv - 5) * 0.01));
const getFreezeDmg = (lv) => [0, 0.02, 0.03, 0.03, 0.04, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075][lv] || 0;

// 🔥 모험 모드 UI 완벽 복구 함수
window.restoreAdventureUI = () => {
    let resourceRow = document.querySelector('.resource-row');
    if (resourceRow) {
        resourceRow.innerHTML = `
            <div class="meso-box"><img src="image/meso.png" alt="Meso" style="height: 16px; vertical-align: middle; margin-right: 4px;">메소 <span id="ui-meso">${state.meso}</span></div>
            <div class="mp-box"><img src="image/mepo.png" alt="Mepo" style="height: 16px; vertical-align: middle; margin-right: 4px;">메포 <span id="ui-mp">${state.mp}</span></div>
        `;
    }
    let controlsPanel = document.getElementById('controls');
    if (controlsPanel) {
        controlsPanel.innerHTML = `
            <div style="display: flex; gap: 4px; margin-bottom: 15px;">
                <button id="btn-summon" class="ingame-btn premium-green" style="flex: 1.5; padding: 16px; font-size: 16px;" onclick="summonUnit()">소환 (10)</button>
                <button class="ingame-btn premium-purple" style="flex: 1; font-size: 13px; padding: 0 5px;" onclick="autoMerge()">✨일괄합성</button>
                <button id="btn-sell-single" class="ingame-btn premium-orange" style="flex: 0.8; font-size: 13px; padding: 0 5px;" onclick="sellSelectedUnit()" disabled>선택판매</button>
                <button class="ingame-btn premium-dark" style="flex: 0.8; font-size: 13px; padding: 0 5px;" onclick="openBulkSellModal()">조건판매</button>
            </div>
            <div style="text-align:center; font-weight:bold; font-size:14px; color:#5a3c22; margin-bottom: 5px; border-top: 1px dashed #8b5a2b; padding-top: 5px;">
                <img src="image/chaosscroll.png" style="height: 20px; vertical-align: middle;"> 혼돈의 주문서 강화 <img src="image/chaosscroll.png" style="height: 20px; vertical-align: middle;">
            </div>
            <div class="upgrade-container">
                <div class="upgrade-box" id="upg-w-box" onclick="upgrade('전사')"><div class="job-title warrior">전사 (+<span id="upg-w-val">${state.upgrades['전사'].val}</span>)</div><div class="cost"><span id="upg-w-cost">${state.upgrades['전사'].cost}</span> 메포</div></div>
                <div class="upgrade-box" id="upg-m-box" onclick="upgrade('법사')"><div class="job-title mage">법사 (+<span id="upg-m-val">${state.upgrades['법사'].val}</span>)</div><div class="cost"><span id="upg-m-cost">${state.upgrades['법사'].cost}</span> 메포</div></div>
                <div class="upgrade-box" id="upg-t-box" onclick="upgrade('도적')"><div class="job-title thief">도적 (+<span id="upg-t-val">${state.upgrades['도적'].val}</span>)</div><div class="cost"><span id="upg-t-cost">${state.upgrades['도적'].cost}</span> 메포</div></div>
            </div>
            <div class="ticket-row" style="margin-top: 15px;">
                <span>선택권: <span id="ui-tickets" class="highlight">${state.tickets.length}</span>장</span>
                <button class="ingame-btn premium-blue" style="padding: 8px 15px;" onclick="openTicketModal()">사용하기</button>
            </div>
        `;
    }
};

const SKILL_INFO = {
    common_wind: { name: "윈드 부스트", max: 10, getDesc: (lv) => `공격 속도 ${lv <= 5 ? lv * 20 : 100 + (lv-5)*10}%p 증가`, img: "image/windboost.png" },
    common_sharp: { name: "샤프 아이즈", max: 10, getDesc: (lv) => `치명타 ${lv <= 5 ? lv * 5 : 25 + (lv-5)*2.5}%p 증가 (1.2배 피해)`, img: "image/sharpeyes.png" },
    common_rage: { name: "분노", max: 10, getDesc: (lv) => `최종 공격력 ${lv <= 5 ? lv * 1 : 5 + (lv-5)*0.5}%p 증가`, img: "image/rage.png" },
    war_final: { name: "파이널 어택", max: 10, getDesc: (lv) => `${lv <= 5 ? lv * 3 : 15 + (lv-5)*1.5}%p 확률로 2배 피해 (전사)`, img: "image/finalattack.png" },
    war_death: { name: "데스폴트", max: 5, getDesc: (lv) => `60초마다 전역 피해 ${300 + lv * 150}% (전사 5차↑)`, img: "image/despolt.png" },
    mage_freeze: { name: "프리즈", max: 10, getDesc: (lv) => `적 빙결 및 도트 피해 (${lv}단계)`, img: "image/freeze.png" },
    mage_thunder: { name: "썬더 브레이크", max: 5, getDesc: (lv) => `60초마다 전역 피해 ${300 + lv * 150}% (법사 5차↑)`, img: "image/thunderbreak.png" },
    thief_shadow: { name: "섀도 파트너", max: 10, getDesc: (lv) => `${lv <= 5 ? lv * 3 : 15 + (lv-5)*1.5}%p 확률로 투사체 추가 (도적)`, img: "image/shadowpartner.png" },
    thief_fuma: { name: "풍마 수리검", max: 5, getDesc: (lv) => `60초마다 맵 순회 수리검 ${300 + lv * 150}% (도적 5차↑)`, img: "image/fumashuriken.png" },
    war_threat: { name: "위협", max: 5, getDesc: (lv) => `25초마다 단일 적 위협. 최종 딜 1.3배 & 방관 10% 부여, ${lv * 2}초 유지 (제네시스↑)`, img: "image/threat.png" },
    mage_heal: { name: "힐", max: 5, getDesc: (lv) => `${70 - lv*10}초마다 주위 1칸 아군 체력 1 회복 (6차↑)`, img: "image/heal.png" },
    thief_overload: { name: "레디투다이", max: 5, getDesc: (lv) => `45초마다 공속 2배 딜 후 기절. 버프 ${lv===5?15:6+lv*2}초/기절 ${lv===1?6:5}초 (제네시스↑)`, img: "image/readytodie.png" }
};

const bossImages = { "킹 슬라임": new Image(), "알리샤르": new Image(), "파풀라투스": new Image(), "피아누스": new Image(), "자쿰": new Image(), "혼테일": new Image(), "시그너스": new Image(), "반반": new Image(), "피에르": new Image(), "블러드퀸": new Image(), "벨룸": new Image(), "어둠의 늑대": new Image(), "스우": new Image(), "데미안": new Image(), "루시드": new Image(), "윌": new Image(), "가디언엔젤슬라임": new Image() };
bossImages["킹 슬라임"].src = "image/kingslime.png"; bossImages["알리샤르"].src = "image/alishar.png"; bossImages["파풀라투스"].src = "image/papulatus.png"; bossImages["피아누스"].src = "image/pianus.png"; bossImages["자쿰"].src = "image/zakum.png"; bossImages["혼테일"].src = "image/horntail.png"; bossImages["시그너스"].src = "image/signus.png"; bossImages["반반"].src = "image/banban.png"; bossImages["피에르"].src = "image/pierr.png"; bossImages["블러드퀸"].src = "image/bloodqueen.png"; bossImages["벨룸"].src = "image/velroom.png"; bossImages["어둠의 늑대"].src = "image/darkwolf.png";
bossImages["스우"].src = "image/swoo.png"; bossImages["데미안"].src = "image/demian.png"; bossImages["루시드"].src = "image/lucid.png"; bossImages["윌"].src = "image/will.png"; bossImages["가디언엔젤슬라임"].src = "image/guardianangelslime.png";

const husooabiImg = new Image(); husooabiImg.src = "image/husooabi.png";
const projImages = { warrior1: new Image(), warrior2: new Image(), mage1: new Image(), mage2: new Image(), rogue1: new Image(), rogue2: new Image() };
projImages.warrior1.src = "image/warrior1.png"; projImages.warrior2.src = "image/warrior2.png"; projImages.mage1.src = "image/magician1.png"; projImages.mage2.src = "image/magician2.png"; projImages.rogue1.src = "image/rogue1.png"; projImages.rogue2.src = "image/rogue2.png";
const fumaImg = new Image(); fumaImg.src = "image/fumashurikenimage.png";
const mobImg = new Image(); mobImg.src = "image/mob.png"; 

// 🔥 신규 이펙트 이미지 4종 추가
const healEffectImg = new Image(); healEffectImg.src = "image/healeffect.png";
const threatEffect1Img = new Image(); threatEffect1Img.src = "image/threateffect1.png";
const threatEffect2Img = new Image(); threatEffect2Img.src = "image/threateffect2.png";
const rtdEffectImg = new Image(); rtdEffectImg.src = "image/readytodieeffect.png";

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

const BOSS_WAVES = { 
    24: { hp: 10000, meso: 50, tier: 3, count: 1, name: "킹 슬라임" }, 
    37: { hp: 30000, meso: 50, tier: 4, count: 1, name: "알리샤르" }, 
    58: { hp: 100000, meso: 50, tier: 4, count: 1, name: "파풀라투스" }, 
    79: { hp: 300000, meso: 70, tier: 4, count: 1, name: "피아누스" }, 
    90: { hp: 800000, meso: 100, tier: 5, count: 1, name: "자쿰" }, 
    100: { name: "혼테일", meso: 100, tier: 5, count: 1 }, 
    110: { name: "시그너스", meso: 120, tier: 5, count: 1 }, 
    120: { name: "반반", meso: 120, tier: 5, count: 1 }, 
    130: { name: "피에르", meso: 120, tier: 5, count: 1 }, 
    140: { name: "블러드퀸", meso: 120, tier: 5, count: 1 }, 
    150: { name: "벨룸", meso: 150, tier: 5, count: 1 }, 
    160: { name: "스우", meso: 180, tier: 5, count: 1 }, 
    170: { name: "데미안", meso: 180, tier: 5, count: 1 }, 
    180: { name: "루시드", meso: 200, tier: 5, count: 1 }, 
    190: { name: "윌", meso: 200, tier: 5, count: 1 }, 
    200: { name: "가디언엔젤슬라임", meso: 250, tier: 5, count: 2 } 
};

// ==========================================
// 4. 유틸리티 및 인증 함수
// ==========================================
window.showMessage = (msg) => { 
    let ov = document.getElementById('msg-overlay'); 
    if(!ov) return; 
    ov.innerHTML = msg; 
    ov.style.zIndex = '9999'; 
    ov.style.display = 'block'; 
    setTimeout(() => { ov.style.display = 'none'; }, 2000); 
};

window.showLootPopup = (drops) => {
    document.getElementById('overlay').style.display = 'block';
    let modal = document.getElementById('loot-popup-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'loot-popup-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:4500; width:85%; max-width:300px; background:#fff; border:2px solid #546e7a; padding:15px; border-radius:8px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    let dropHtml = drops.map(d => {
        if (d.type === 'equip') return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:10px; background:#f1f8e9; padding:10px; border-radius:8px; border:1px solid #c5e1a5;"><img src="image/equipbox.png" style="width:24px; height:24px;"><span style="font-weight:bold; color:#2e7d32; font-size:15px;">장비 상자 1개</span></div>`;
        else if (d.type === 'card') { let imgSrc = bossImages[d.name] ? bossImages[d.name].src : ''; return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:10px; background:#fff8e1; padding:10px; border-radius:8px; border:1px solid #ffe082;"><img src="${imgSrc}" style="width:30px; height:30px; object-fit:contain;"><span style="font-weight:bold; color:#f57f17; font-size:15px;">${d.name} 카드 1장</span></div>`; }
        // 🔥 신규 추가: 코어 젬스톤 획득 팝업 UI
        else if (d.type === 'gemstone') { return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:10px; background:#f3e5f5; padding:10px; border-radius:8px; border:1px solid #ce93d8;"><div style="font-size:24px;">💎</div><span style="font-weight:bold; color:#6a1b9a; font-size:15px;">코어 젬스톤 ${d.count}개</span></div>`; }
    }).join('');
    modal.innerHTML = `<h3 style="color:#e65100; margin-top:0;">✨ 전리품 획득!</h3><p style="font-size:13px; color:#555; margin-bottom:15px;">보스를 처치하고 다음 아이템을 얻었습니다.</p>${dropHtml}<button class="ingame-btn premium-blue" style="width:100%; padding:12px; margin-top:10px;" onclick="closeLootPopup()">확인</button>`;
    modal.style.display = 'block';
};

window.closeLootPopup = () => {
    let modal = document.getElementById('loot-popup-modal'); if(modal) modal.style.display = 'none';
    let eqModal = document.getElementById('equip-detail-modal'); let invModal = document.getElementById('inventory-modal');
    if ((!eqModal || eqModal.style.display === 'none') && (!invModal || invModal.style.display === 'none')) document.getElementById('overlay').style.display = 'none';
};

function calculateEquipStats() {
    equipStats = { atk: 0, spd: 0, crit: 0, cdmg: 0, pen: 0, flatAtk: 0, unpenetratedRate: 1.0 };
    ['뱃지', '엠블럼', '링'].forEach(slot => { 
        let item = userEquipped[slot]; 
        if (item) { 
            if (item.options && Array.isArray(item.options)) {
                item.options.forEach(opt => {
                    if (opt.type === 'atk') equipStats.atk += opt.value;
                    else if (opt.type === 'spd') equipStats.spd += opt.value;
                    else if (opt.type === 'crit') equipStats.crit += opt.value;
                    else if (opt.type === 'cdmg') equipStats.cdmg += opt.value;
                    else if (opt.type === 'pen') equipStats.unpenetratedRate *= (1 - (opt.value / 100));
                });
            } else {
                equipStats.atk += item.atk || 0; equipStats.spd += item.spd || 0; equipStats.crit += item.crit || 0;
            }

            let star = item.star || 0;
            if (star > 0) { 
                let perStar = STARFORCE_BONUS[item.grade] || 0; 
                item.attack = (item.baseAttack || 0) + (star * perStar);
                equipStats.flatAtk += star * perStar; 
            }
        } 
    });
    equipStats.pen = Math.round((1 - equipStats.unpenetratedRate) * 100);
}

window.syncToCloud = async () => {
    if (!currentUserUid) return;
    let cloudProfile = { save: localStorage.getItem('mapleDefenseSave') || null, cards: localStorage.getItem('mapleDefenseCards') || null, skills: localStorage.getItem('mapleDefenseSkills') || null, coins: localStorage.getItem('mapleDefenseSpentCoins') || null, bestWave: localStorage.getItem('mapleDefenseBestWave') || null, rp: userRankData.rp, rankMoney: userRankData.rankMoney, bonusCoins: userRankData.bonusCoins, raidDate: localStorage.getItem('mapleDefenseRaidDate') || null, inventory: userInventory, equips: userEquips, equipped: userEquipped };
    await set(ref(database, `users/${currentUserUid}/cloudData`), cloudProfile);
    calculateEquipStats();
};

window.checkSave = () => { let btn = document.getElementById('btn-continue'); if (btn) { if (localStorage.getItem('mapleDefenseSave')) btn.style.display = 'flex'; else btn.style.display = 'none'; } };

window.switchScreen = (screenId) => {
    ['login-screen', 'start-screen', 'game-container', 'pk-game', 'raid-game'].forEach(id => { let el = document.getElementById(id); if(el) el.style.display = 'none'; });
    let activeEl = document.getElementById(screenId); if(activeEl) activeEl.style.display = 'flex';
    if (screenId === 'start-screen') window.checkSave();
};

window.closeAllModals = () => { 
    if (state.status === 'GAMEOVER') return; 
    let sfModal = document.getElementById('starforce-modal');
    if (sfModal && sfModal.style.display === 'block') { sfModal.style.display = 'none'; let eqModal = document.getElementById('equip-detail-modal'); if (eqModal) eqModal.style.display = 'block'; return; }
    let eqModal = document.getElementById('equip-detail-modal');
    if (eqModal && eqModal.style.display === 'block') { eqModal.style.display = 'none'; return; }
    ['overlay', 'bulk-sell-modal', 'ticket-modal', 'book-modal', 'shop-modal', 'skill-detail-modal', 'active-skills-modal', 'inventory-modal', 'equip-detail-modal', 'starforce-modal', 'loot-popup-modal', 'raid-lobby-overlay'].forEach(id => { let el = document.getElementById(id); if(el) el.style.display = 'none'; }); 
};

function gameOver(msg) { state.status = 'GAMEOVER'; localStorage.removeItem('mapleDefenseSave'); document.getElementById('gameover-msg').innerText = msg; document.getElementById('overlay').style.display = 'block'; document.getElementById('gameover-modal').style.display = 'block'; if (currentUserUid) window.syncToCloud(); }

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid; const dbRef = ref(database);
        const nickSnap = await get(child(dbRef, `users/${currentUserUid}/nickname`));
        if (nickSnap.exists()) { currentUserName = nickSnap.val(); document.getElementById('current-user-name').innerText = currentUserName; const changeSnap = await get(child(dbRef, `users/${currentUserUid}/lastNicknameChange`)); if (changeSnap.exists()) lastNicknameChange = changeSnap.val(); } 
        else { document.getElementById('nickname-overlay').style.display = 'block'; document.getElementById('nickname-modal').style.display = 'block'; }

        // 🔥 신규 추가: 로그인 시 무릉도장 최고 층수를 불러와서 코어 슬롯 계산에 활용
        const mulungSnap = await get(child(dbRef, `mulung_rankings/${currentUserUid}/floor`));
        if (mulungSnap.exists()) highestMulungFloor = mulungSnap.val();

        const cloudSnap = await get(child(dbRef, `users/${currentUserUid}/cloudData`));
        if (cloudSnap.exists()) {
            let cloud = cloudSnap.val();
            let localBestStr = localStorage.getItem('mapleDefenseBestWave'); let localBest = localBestStr ? parseInt(localBestStr) : 0; if (isNaN(localBest)) localBest = 0;
            let cloudBestStr = cloud.bestWave; let cloudBest = cloudBestStr ? parseInt(cloudBestStr) : 0; if (isNaN(cloudBest)) cloudBest = 0;
            
            let parsedRp = parseInt(cloud.rp); userRankData.rp = isNaN(parsedRp) ? 1000 : parsedRp;
            let parsedRankMoney = parseInt(cloud.rankMoney); userRankData.rankMoney = isNaN(parsedRankMoney) ? 0 : parsedRankMoney;
            let parsedBonusCoins = parseInt(cloud.bonusCoins); userRankData.bonusCoins = isNaN(parsedBonusCoins) ? 0 : parsedBonusCoins;

            userInventory = cloud.inventory || {}; 
            userInventory.coinPieces = userInventory.coinPieces || 0; userInventory.equipBoxes = userInventory.equipBoxes || 0; userInventory.starPieces = userInventory.starPieces || 0; 
            userInventory.boxes = userInventory.boxes || { '브론즈': 0, '실버': 0, '골드': 0, '플래티넘': 0, '다이아몬드': 0, '챌린저': 0 };
            
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
            
            // 🔥 신규 추가: 클라우드에서 내 코어 젬스톤 및 장착 정보 불러오기
            userCores = cloud.coreData || { gemstones: 0, items: {}, equipped: [] };

            calculateEquipStats();

            if (cloud.skills) { localStorage.setItem('mapleDefenseSkills', cloud.skills); skillLevels = { ...DEFAULT_SKILLS, ...JSON.parse(cloud.skills) }; }
            if (cloud.cards) { 
                localStorage.setItem('mapleDefenseCards', cloud.cards); 
                cardData = JSON.parse(cloud.cards); 
                const bossMigrationMap = { "심연의 보스 (160층)": "스우", "심연의 보스 (170층)": "데미안", "심연의 보스 (180층)": "루시드", "심연의 보스 (190층)": "윌", "심연의 보스 (200층)": "가디언엔젤슬라임" };
                let migrated = false;
                for (let oldName in bossMigrationMap) {
                    if (cardData[oldName]) {
                        let newName = bossMigrationMap[oldName];
                        if (!cardData[newName]) { cardData[newName] = { ...cardData[oldName] }; } 
                        else { 
                            cardData[newName].owned += cardData[oldName].owned; 
                            cardData[newName].grade = Math.max(cardData[newName].grade, cardData[oldName].grade); 
                        }
                        delete cardData[oldName]; migrated = true;
                    }
                }
                if (migrated) { localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); window.syncToCloud(); }
            }
            if (cloud.coins) { localStorage.setItem('mapleDefenseSpentCoins', cloud.coins); spentCoins = parseInt(cloud.coins); }
            
            if (cloudBest >= localBest || !localStorage.getItem('mapleDefenseSave')) {
                if (cloud.save) localStorage.setItem('mapleDefenseSave', cloud.save);
                bestWave = cloudBest; localStorage.setItem('mapleDefenseBestWave', bestWave); document.getElementById('ui-best-wave').innerText = bestWave;
            } else { window.syncToCloud(); }
        } else { window.syncToCloud(); }
        window.switchScreen('start-screen');

        const rewardRef = ref(database, `users/${currentUserUid}/pendingBossReward`);
        onValue(rewardRef, (snap) => {
            if (snap.exists()) {
                let rewards = snap.val();
                let earned = [];
                for (let key in rewards) {
                    let r = rewards[key];
                    userInventory.boxes[r.tier] = (userInventory.boxes[r.tier] || 0) + 1;
                    earned.push(`👑 ${r.rank}위: ${r.tier} 상자 1개`);
                }
                remove(rewardRef);
                window.syncToCloud();
                window.showBossRewardPopup(earned);
            }
        });

    } else { currentUserUid = null; window.switchScreen('login-screen'); }
});

window.submitNickname = async () => { let input = document.getElementById('nickname-input').value.trim(); if (!input) { window.showMessage("닉네임을 입력해주세요."); return; } if (input.length > 10) { window.showMessage("닉네임은 10자 이하로 해주세요."); return; } try { const now = Date.now(); await update(ref(database, `users/${currentUserUid}`), { nickname: input, lastNicknameChange: now }); currentUserName = input; lastNicknameChange = now; document.getElementById('current-user-name').innerText = currentUserName; document.getElementById('nickname-overlay').style.display = 'none'; document.getElementById('nickname-modal').style.display = 'none'; window.switchScreen('start-screen'); } catch (e) { window.showMessage("닉네임 저장 중 오류가 발생했습니다."); } };
window.openNicknameChangeModal = () => { if (!currentUserUid) return; const now = Date.now(); const daysSinceLastChange = (now - lastNicknameChange) / (1000 * 60 * 60 * 24); if (lastNicknameChange > 0 && daysSinceLastChange < 30) { const remainingDays = Math.ceil(30 - daysSinceLastChange); window.showMessage(`닉네임은 30일에 한 번만 변경 가능합니다. (${remainingDays}일 남음)`); return; } document.getElementById('nickname-change-input').value = ""; document.getElementById('nickname-change-overlay').style.display = 'block'; document.getElementById('nickname-change-modal').style.display = 'block'; };
window.closeNicknameChangeModal = () => { document.getElementById('nickname-change-overlay').style.display = 'none'; document.getElementById('nickname-change-modal').style.display = 'none'; };
window.submitNicknameChange = async () => { let input = document.getElementById('nickname-change-input').value.trim(); if (!input) { window.showMessage("새로운 닉네임을 입력해주세요."); return; } if (input.length > 10) { window.showMessage("닉네임은 10자 이하로 해주세요."); return; } if (input === currentUserName) { window.showMessage("기존 닉네임과 동일합니다."); return; } try { const now = Date.now(); await update(ref(database, `users/${currentUserUid}`), { nickname: input, lastNicknameChange: now }); update(ref(database, `pk_rankings/${currentUserUid}`), { nickname: input }).catch(e => {}); currentUserName = input; lastNicknameChange = now; document.getElementById('current-user-name').innerText = currentUserName; window.closeNicknameChangeModal(); window.showMessage("닉네임이 성공적으로 변경되었습니다!"); } catch (e) { window.showMessage("닉네임 변경 중 오류가 발생했습니다."); } };
window.loginWithGoogle = () => { const provider = new GoogleAuthProvider(); signInWithPopup(auth, provider).catch(error => window.showMessage("로그인 실패: " + error.message)); };
window.logout = () => { signOut(auth).then(() => { location.reload(); }); };

window.showBossRewardPopup = (earned) => {
    document.getElementById('overlay').style.display = 'block';
    let modal = document.getElementById('boss-reward-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'boss-reward-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:4600; width:85%; max-width:300px; background:#fff; border:2px solid #fbc02d; padding:15px; border-radius:8px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    let html = `<h3 style="color:#f57f17; margin-top:0;">🏆 월드 보스 랭킹 보상!</h3><p style="font-size:13px; color:#555; margin-bottom:15px;">이전 세대 보스 토벌 랭킹에 입성하여 보상이 지급되었습니다.</p>`;
    earned.forEach(msg => { html += `<div style="background:#fff8e1; border:1px solid #ffe082; padding:10px; border-radius:8px; margin-bottom:10px; font-weight:bold; color:#e65100; font-size:14px;">${msg}</div>`; });
    html += `<button class="ingame-btn premium-orange" style="width:100%; padding:12px; margin-top:10px;" onclick="closeBossRewardPopup()">보상 받기</button>`;
    modal.innerHTML = html;
    modal.style.display = 'block';
};

window.closeBossRewardPopup = () => {
    let modal = document.getElementById('boss-reward-modal'); if(modal) modal.style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
};

window.distributeBossRankRewards = async () => {
    try {
        const snap = await get(child(ref(database), `worldBoss_rankings`));
        if (snap.exists()) {
            let ranks = []; 
            snap.forEach(c => { let v = c.val(); if(typeof v.damage === 'number' && !isNaN(v.damage)) ranks.push({ uid: c.key, ...v }); });
            ranks.sort((a, b) => b.damage - a.damage);
            
            for (let i = 0; i < Math.min(3, ranks.length); i++) {
                let rTier = i === 0 ? '다이아몬드' : (i === 1 ? '플래티넘' : '골드');
                await set(ref(database, `users/${ranks[i].uid}/pendingBossReward/${Date.now() + i}`), {
                    rank: i + 1, tier: rTier
                });
            }
            
            // 🔥 핵심 추가: 보상 분배가 모두 끝나면 랭킹판을 통째로 삭제(초기화)하여 새 보스 경쟁을 시작합니다!
            await remove(ref(database, `worldBoss_rankings`));
        }
    } catch(e) { console.warn("랭킹 보상 분배 오류:", e); }
};
function getBossInfo(w) {
    if (w < 100 && BOSS_WAVES[w]) return BOSS_WAVES[w];
    if (w >= 100 && w % 5 === 0) { 
        let n = (w - 100) / 5; 
        let calculatedHp = 1200000 + (n * 300000) + (Math.pow(n, 2) * 55000); 
        if (w > 150) {
            let overN = (w - 150) / 5;
            calculatedHp = calculatedHp * Math.pow(1.07, overN); 
        }
        let bName = BOSS_WAVES[w] ? BOSS_WAVES[w].name : (w % 10 === 5 ? "어둠의 늑대" : `심연의 보스 (${w}층)`); 
        let bMeso = BOSS_WAVES[w] ? BOSS_WAVES[w].meso : (w >= 160 ? 200 : 150); 
        let bTier = BOSS_WAVES[w] ? BOSS_WAVES[w].tier : 5; 
        let bCount = BOSS_WAVES[w] ? BOSS_WAVES[w].count : 1; 
        
        return { hp: Math.floor(calculatedHp), meso: bMeso, tier: bTier, count: bCount, name: bName }; 
    } 
    return null;
}

// 🔥 1. UI 모드 세팅 (랭크 게임 5칸 원래대로 완벽 복구!)
function setGridMode(mode) {
    let isRankGrid = (mode === 'RANK'); 
    let isMulung = (mode === 'MULUNG'); 
    let canvasHeight = isRankGrid ? 290 : 500; 
    let gridSize = (isRankGrid || isMulung) ? 5 : 25; 
    
    if(canvas) canvas.height = canvasHeight; 
    document.getElementById('board-area').style.aspectRatio = isRankGrid ? "500/290" : "1/1";
    
    gridContainer.style.gridTemplateColumns = "repeat(5, 1fr)"; 
    gridContainer.style.gridTemplateRows = (isRankGrid || isMulung) ? "repeat(1, 1fr)" : "repeat(5, 1fr)"; 
    gridContainer.style.gap = (isRankGrid || isMulung) ? "0px" : "2px";
    
    if (isMulung) {
        gridContainer.style.top = "65%"; 
        gridContainer.style.height = "14%";
    } else if (isRankGrid) {
        gridContainer.style.top = "37.93%"; 
        gridContainer.style.height = "24.13%";
    } else {
        gridContainer.style.top = "15%"; 
        gridContainer.style.height = "70%";
    }
    
    let gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        if (isMulung) {
            gameContainer.style.backgroundImage = "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('image/mulung.png')";
            gameContainer.style.backgroundSize = "cover";
            gameContainer.style.backgroundPosition = "center";
        } else {
            gameContainer.style.backgroundImage = ""; 
        }
    }
    
    // 🔥 길을 10px 더 내림 (Y: 235) - 몬스터가 길 위에 완벽히 걸치도록 수정
    currentPath = isRankGrid ? [ {x:25,y:25}, {x:475,y:25}, {x:475,y:265}, {x:25,y:265} ] : 
                  (isMulung ? [{x: -50, y: 235}, {x: 550, y: 235}] : [ {x:25,y:25}, {x:475,y:25}, {x:475,y:475}, {x:25,y:475} ]);
                  
    grid = new Array(gridSize).fill(null); 
    oppGrid = new Array(gridSize).fill(null); 
    gridContainer.innerHTML = ''; 
    
    let oppGridContainer = document.getElementById('opp-grid-container'); 
    if(oppGridContainer) {
        oppGridContainer.innerHTML = '';
        oppGridContainer.style.gap = (isRankGrid || isMulung) ? "0px" : "2px";
        oppGridContainer.style.pointerEvents = "auto";
        oppGridContainer.style.gridTemplateColumns = "repeat(5, 1fr)";
        oppGridContainer.style.gridTemplateRows = (isRankGrid || isMulung) ? "repeat(1, 1fr)" : "repeat(5, 1fr)";

        if (isMulung) {
            document.getElementById('board-area').appendChild(oppGridContainer);
            oppGridContainer.style.display = 'grid';
            oppGridContainer.style.position = 'absolute';
            oppGridContainer.style.width = '70%'; 
            oppGridContainer.style.left = '15%'; 
            oppGridContainer.style.top = "15%";
            oppGridContainer.style.height = "14%";
        } else if (isRankGrid) {
            let oppCanvasParent = document.getElementById('oppCanvas').parentNode;
            if(oppCanvasParent) {
                oppCanvasParent.appendChild(oppGridContainer);
            }
            oppGridContainer.style.display = 'grid';
            oppGridContainer.style.position = 'absolute';
            oppGridContainer.style.width = '70%';
            oppGridContainer.style.left = '15%';
            oppGridContainer.style.top = "37.93%";
            oppGridContainer.style.height = "24.13%"; 
        } else {
            oppGridContainer.style.display = 'none';
        }
    }
    
    for(let i=0; i<gridSize; i++) { 
        let cell = document.createElement('div'); cell.className = 'grid-cell'; 
        let idx = i;
        cell.onclick = () => window.onCellClick(idx); 
        gridContainer.appendChild(cell); 
        
        if (oppGridContainer) { 
            let oppCell = document.createElement('div'); oppCell.className = 'grid-cell'; 
            oppCell.onclick = () => { if (typeof window.onOppCellClick === 'function') window.onOppCellClick(idx); };
            oppGridContainer.appendChild(oppCell); 
        } 
    }
}

window.saveGameData = () => { if (state.status === 'GAMEOVER' || state.status === 'TITLE' || state.isRank) return; let saveObj = { wave: state.wave, meso: state.meso, mp: state.mp, mpTotal: state.mpTotal, kills: state.kills, upgrades: state.upgrades, tickets: state.tickets, gridData: grid.map(u => u ? { idx: u.idx, gradeIdx: u.gradeIdx, clsName: u.cls.type } : null) }; localStorage.setItem('mapleDefenseSave', JSON.stringify(saveObj)); if (currentUserUid) window.syncToCloud(); };
setInterval(() => { if((state.status === 'PLAY' || state.status === 'PREP') && !state.isRank) window.saveGameData(); }, 3000);

window.startNewGame = () => {
    localStorage.removeItem('mapleDefenseSave'); setGridMode('ADVENTURE'); 
    state = { status: 'PREP', meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 5, speed: 1, isBoss: false, upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} }, tickets: [], isRank: false };
    document.getElementById('best-wave-container').style.display = 'block'; document.getElementById('btn-speed').innerText = "1배속"; document.getElementById('btn-speed').style.display = 'block'; document.getElementById('btn-exit').style.display = 'block'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'none'; document.getElementById('opp-board-wrapper').style.display = 'none';
    monsters = []; projectiles = []; towers = []; hitEffects = []; visualEffects = []; fumaList = []; damageTexts = []; waveTimer = 0; spawnTimer = 0; selectedUnitIdx = -1; bestWave = parseInt(localStorage.getItem('mapleDefenseBestWave')) || 0;
    
    // 🔥 모험 모드 UI 강제 복구 호출
    window.restoreAdventureUI();

    if (currentUserUid) window.syncToCloud(); renderGrid(); window.switchScreen('game-container'); lastTime = performance.now(); cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
};

window.loadAndStartGame = () => {
    let saved = JSON.parse(localStorage.getItem('mapleDefenseSave')); if(!saved) { window.startNewGame(); return; } setGridMode('ADVENTURE'); state.isRank = false; state.wave = saved.wave; state.meso = saved.meso; state.mp = saved.mp; state.mpTotal = saved.mpTotal; state.kills = saved.kills; state.upgrades = saved.upgrades; state.tickets = saved.tickets; state.speed = 1;
    document.getElementById('best-wave-container').style.display = 'block'; document.getElementById('btn-speed').innerText = "1배속"; document.getElementById('btn-speed').style.display = 'block'; document.getElementById('btn-exit').style.display = 'block'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'none'; document.getElementById('opp-board-wrapper').style.display = 'none';
    towers = []; if(saved.gridData && Array.isArray(saved.gridData)) { saved.gridData.forEach((u) => { if(u) window.addUnit(u.idx, u.gradeIdx, u.clsName, true); }); }
    window.switchScreen('game-container'); state.status = 'PREP'; state.time = 5; lastTime = performance.now(); state.isBoss = !!getBossInfo(state.wave); cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
};

window.goToLobby = () => { 
    if(!state.isRank) window.saveGameData(); 
    state.status = 'TITLE'; 
    cancelAnimationFrame(mainReqId); 
    cancelAnimationFrame(mulungReqId); 
    
    if (typeof mulungState !== 'undefined') mulungState.active = false;
    if (typeof isMulungLoopRunning !== 'undefined') isMulungLoopRunning = false;
    let mUI = document.getElementById('mulung-ui'); if (mUI) mUI.style.display = 'none';
    document.getElementById('grid-container').style.display = 'grid';

    let resourceRow = document.querySelector('.resource-row');
    if (resourceRow) {
        resourceRow.innerHTML = `
            <div class="meso-box"><img src="image/meso.png" alt="Meso" style="height: 16px; vertical-align: middle; margin-right: 4px;">메소 <span id="ui-meso">25</span></div>
            <div class="mp-box"><img src="image/mepo.png" alt="Mepo" style="height: 16px; vertical-align: middle; margin-right: 4px;">메포 <span id="ui-mp">0</span></div>
        `;
    }
    let controlsPanel = document.getElementById('controls');
    if (controlsPanel) {
        controlsPanel.innerHTML = `
            <div style="display: flex; gap: 4px; margin-bottom: 15px;">
                <button id="btn-summon" class="ingame-btn premium-green" style="flex: 1.5; padding: 16px; font-size: 16px;" onclick="summonUnit()">소환 (10)</button>
                <button class="ingame-btn premium-purple" style="flex: 1; font-size: 13px; padding: 0 5px;" onclick="autoMerge()">✨일괄합성</button>
                <button id="btn-sell-single" class="ingame-btn premium-orange" style="flex: 0.8; font-size: 13px; padding: 0 5px;" onclick="sellSelectedUnit()" disabled>선택판매</button>
                <button class="ingame-btn premium-dark" style="flex: 0.8; font-size: 13px; padding: 0 5px;" onclick="openBulkSellModal()">조건판매</button>
            </div>
            <div style="text-align:center; font-weight:bold; font-size:14px; color:#5a3c22; margin-bottom: 5px; border-top: 1px dashed #8b5a2b; padding-top: 5px;">
                <img src="image/chaosscroll.png" style="height: 20px; vertical-align: middle;"> 혼돈의 주문서 강화 <img src="image/chaosscroll.png" style="height: 20px; vertical-align: middle;">
            </div>
            <div class="upgrade-container">
                <div class="upgrade-box" id="upg-w-box" onclick="upgrade('전사')"><div class="job-title warrior">전사 (+<span id="upg-w-val">0</span>)</div><div class="cost"><span id="upg-w-cost">10</span> 메포</div></div>
                <div class="upgrade-box" id="upg-m-box" onclick="upgrade('법사')"><div class="job-title mage">법사 (+<span id="upg-m-val">0</span>)</div><div class="cost"><span id="upg-m-cost">10</span> 메포</div></div>
                <div class="upgrade-box" id="upg-t-box" onclick="upgrade('도적')"><div class="job-title thief">도적 (+<span id="upg-t-val">0</span>)</div><div class="cost"><span id="upg-t-cost">10</span> 메포</div></div>
            </div>
            <div class="ticket-row" style="margin-top: 15px;">
                <span>선택권: <span id="ui-tickets" class="highlight">0</span>장</span>
                <button class="ingame-btn premium-blue" style="padding: 8px 15px;" onclick="openTicketModal()">사용하기</button>
            </div>
        `;
    }
    let gameOverModal = document.getElementById('gameover-modal'); if(gameOverModal) gameOverModal.style.display = 'none'; 
    window.closeAllModals(); 
    document.getElementById('ui-best-wave').innerText = bestWave; 
    window.switchScreen('start-screen'); 
    if (currentUserUid) window.syncToCloud(); 
};

window.toggleSpeed = () => { 
    if(state.isRank) return; 
    if (typeof mulungState !== 'undefined' && mulungState.active) {
        if (state.speed === 1) state.speed = 10;
        else state.speed = 1;
    } else {
        if (state.speed === 1) state.speed = 10; 
        else if (state.speed === 10) state.speed = 15; 
        else state.speed = 1; 
    }
    document.getElementById('btn-speed').innerText = state.speed + "배속"; 
};
function getGradeByProb() { let rand = Math.random() * 100; let acc = 0; for(let i=0; i<GRADES.length; i++) { acc += GRADES[i].prob; if(rand <= acc) return i; } return 0; }

window.summonUnit = () => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return; if(state.meso < 10) { window.showMessage("메소가 부족합니다!"); return; }
    let emptyIdx = grid.findIndex(v => v === null); if(emptyIdx === -1) { window.showMessage("배치 공간이 부족합니다!"); return; } state.meso -= 10; let gradeIdx = getGradeByProb(); let clsNames = Object.keys(CLASSES); let clsName = clsNames[Math.floor(Math.random() * clsNames.length)]; window.addUnit(emptyIdx, gradeIdx, clsName);
    if (state.isRank) { let oppEmptyIdx = oppGrid.findIndex(v => v === null); if (oppEmptyIdx !== -1) { let oppGradeIdx = getGradeByProb(); let oppClsName = clsNames[Math.floor(Math.random() * clsNames.length)]; addUnitOpp(oppEmptyIdx, oppGradeIdx, oppClsName); } } window.updateUI();
};

window.autoMerge = () => {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    if(state.isRank) { window.showMessage("랭크 게임에서는 합성할 수 없습니다."); return; } 
    let merged = true; let mergeLogs = {}; 
    while(merged) {
        merged = false; let counts = {};
        for(let i = 0; i < grid.length; i++) { if(!grid[i]) continue; let key = grid[i].cls.type + '_' + grid[i].gradeIdx; if(!counts[key]) counts[key] = []; counts[key].push(i); }
        for(let key in counts) {
            let parts = key.split('_'); let type = parts[0]; let gIdx = parseInt(parts[1]); if (gIdx >= 8) continue; 
            
            let req = 5; 
            if (gIdx >= 4) req = 4; 
            
            if (counts[key].length >= req) {
                let toMerge = counts[key].slice(0, req); let targetIdx = toMerge[0];
                for(let j = 1; j < req; j++) { let idx = toMerge[j]; towers = towers.filter(t => t !== grid[idx]); grid[idx] = null; }
                towers = towers.filter(t => t !== grid[targetIdx]); let newGrade = gIdx + 1; grid[targetIdx] = null;
                window.addUnit(targetIdx, newGrade, type, true); 
                let logKey = `${type}_${gIdx}_${req}`; mergeLogs[logKey] = (mergeLogs[logKey] || 0) + 1; merged = true; break; 
            }
        }
    }
    if (Object.keys(mergeLogs).length > 0) {
        let msg = "";
        for (let k in mergeLogs) { let parts = k.split('_'); let type = parts[0]; let gIdx = parseInt(parts[1]); let req = parseInt(parts[2]); let cls = CLASSES[type]; let oldGrade = GRADES[gIdx].name; let newGrade = GRADES[gIdx+1].name; msg += `${cls.icon} ${type} ${oldGrade} ${req}유닛을 통해 ${type} ${newGrade} 유닛으로 합성하였습니다.<br>`; }
        window.showMessage(msg); renderGrid(); window.updateUI();
    } else { window.showMessage("합성 가능한 유닛이 없습니다."); }
};

function showSummonToast(gradeName, gradeIdx, clsName, color) { let toast = document.getElementById('summon-toast'); let fontSize = 16 + (gradeIdx * 2); toast.innerHTML = `<span style="color:${color}">${gradeName}</span> ${clsName}!`; toast.style.fontSize = fontSize + 'px'; toast.style.color = '#fff'; toast.className = 'toast-show'; setTimeout(() => { toast.className = ''; }, 1500); if (gradeIdx >= 5) { let container = document.getElementById('game-container'); container.classList.add('shake-active'); setTimeout(() => container.classList.remove('shake-active'), 400); } }

// 🔥 발사 위치 좌표 Y축 145로 완벽 매핑
window.addUnit = (idx, gradeIdx, clsName, isLoad = false) => { 
    let grade = GRADES[gradeIdx]; let cls = CLASSES[clsName]; 
    let isMulung = (typeof mulungState !== 'undefined' && mulungState.active);
    let yPos = state.isRank ? 145 : (110 + Math.floor(idx / 5) * 70);
    if (isMulung) yPos = 362.5;

    let unit = { 
        idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls, 
        x: 110 + (idx % 5) * 70, y: yPos, 
        lastAttack: 0, bindCooldown: 0, globalCooldown: 0,
        hp: 5, maxHp: 5, damageDealt: 0, threatCooldown: 0, healCooldown: 0, overloadTimer: 0, unitStunTimer: 0, rtdCooldown: 0
    }; 
    grid[idx] = unit; towers.push(unit); 
    if(!isLoad) showSummonToast(grade.name, gradeIdx, clsName, cls.color); renderGrid(); 
};

function addUnitOpp(idx, gradeIdx, clsName) { 
    let grade = GRADES[gradeIdx]; let cls = CLASSES[clsName]; 
    let isMulung = (typeof mulungState !== 'undefined' && mulungState.active);
    let yPos = state.isRank ? 145 : (110 + Math.floor(idx / 5) * 70);
    if (isMulung) yPos = 112.5;

    let unit = { 
        idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls, 
        x: 110 + (idx % 5) * 70, y: yPos, 
        lastAttack: 0, bindCooldown: 0, globalCooldown: 0, threatCooldown: 0, healCooldown: 0, overloadTimer: 0, unitStunTimer: 0, rtdCooldown: 0 
    }; 
    oppGrid[idx] = unit; oppTowers.push(unit); renderOppGrid(); 
}

window.onCellClick = (idx) => { 
    if(state.status !== 'PREP' && state.status !== 'PLAY' && (!mulungState || !mulungState.active)) return; 
    let isMulung = (typeof mulungState !== 'undefined' && mulungState.active);
    
    if (selectedUnitIdx !== -1) { 
        if (selectedUnitIdx === idx) { 
            selectedUnitIdx = -1; 
        } else { 
            let target = grid[idx]; 
            grid[idx] = grid[selectedUnitIdx]; 
            if (grid[idx]) { 
                grid[idx].idx = idx; 
                grid[idx].x = 110 + (idx % 5) * 70;
                if (isMulung) grid[idx].y = 362.5;
                else if (state.isRank) grid[idx].y = 145;
                else grid[idx].y = 110 + Math.floor(idx / 5) * 70;
            } 
            grid[selectedUnitIdx] = target; 
            if(target) { 
                target.idx = selectedUnitIdx; 
                target.x = 110 + (selectedUnitIdx % 5) * 70;
                if (isMulung) target.y = 362.5;
                else if (state.isRank) target.y = 145;
                else target.y = 110 + Math.floor(selectedUnitIdx / 5) * 70;
            } 
            selectedUnitIdx = -1; 
        } 
    } else { 
        if (grid[idx]) selectedUnitIdx = idx; 
    } 
    renderGrid(); 
    if (!isMulung) window.updateUI(); 
};

window.onOppCellClick = (idx) => {
    if(!mulungState || !mulungState.active) return; 
    
    if (selectedOppUnitIdx !== -1) { 
        if (selectedOppUnitIdx === idx) { 
            selectedOppUnitIdx = -1; 
        } else { 
            let target = oppGrid[idx]; 
            oppGrid[idx] = oppGrid[selectedOppUnitIdx]; 
            if (oppGrid[idx]) { 
                oppGrid[idx].idx = idx; 
                oppGrid[idx].x = 110 + (idx % 5) * 70; oppGrid[idx].y = 112.5; 
            } 
            oppGrid[selectedOppUnitIdx] = target; 
            if(target) { 
                target.idx = selectedOppUnitIdx; 
                target.x = 110 + (selectedOppUnitIdx % 5) * 70; target.y = 112.5; 
            } 
            selectedOppUnitIdx = -1; 
        } 
    } else { 
        if (oppGrid[idx]) selectedOppUnitIdx = idx; 
    } 
    renderOppGrid(); 
};

window.renderOppGrid = function() {
    let oppGridContainer = document.getElementById('opp-grid-container'); 
    if(!oppGridContainer) return; 
    let cells = oppGridContainer.children; 
    if(!cells || cells.length === 0) return; 
    for(let i=0; i<oppGrid.length; i++) { 
        let u = oppGrid[i]; 
        cells[i].className = 'grid-cell'; 
        if (typeof selectedOppUnitIdx !== 'undefined' && i === selectedOppUnitIdx) cells[i].classList.add('selected'); 
        if(u) { 
            if (u.gradeIdx === 6) cells[i].classList.add('glow-6'); 
            if (u.gradeIdx === 7) cells[i].classList.add('glow-7'); 
            if (u.gradeIdx === 8) cells[i].classList.add('glow-8'); 
            cells[i].innerHTML = `<div style="font-size:18px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div><div style="color:${u.cls.color}; font-size:9px; margin-top:2px;">${u.grade.name}</div>`; 
        } else { cells[i].innerHTML = ''; } 
    }
};

window.sellSelectedUnit = () => { if(selectedUnitIdx === -1) return; let u = grid[selectedUnitIdx]; if(u && u.grade.sell > 0) { state.meso += u.grade.sell; towers = towers.filter(t => t !== u); grid[selectedUnitIdx] = null; selectedUnitIdx = -1; renderGrid(); window.updateUI(); } };
window.openBulkSellModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('bulk-sell-modal').style.display = 'block'; };
window.executeBulkSell = (type, value) => { let soldCount = 0; let earnedMeso = 0; for(let i = 0; i < grid.length; i++) { let u = grid[i]; if(!u || u.grade.sell === 0) continue; let match = false; if(type === 'class' && u.cls.type === value) match = true; if(type === 'grade' && u.gradeIdx <= value) match = true; if(match) { earnedMeso += u.grade.sell; towers = towers.filter(t => t !== u); grid[i] = null; soldCount++; } } if(soldCount > 0) { state.meso += earnedMeso; window.showMessage(`${soldCount} 유닛 판매 (+${earnedMeso} 메소)`); selectedUnitIdx = -1; renderGrid(); window.updateUI(); } else { window.showMessage("조건에 맞는 유닛이 없습니다."); } window.closeAllModals(); };

function renderGrid() {
    let cells = gridContainer.children; if(!cells || cells.length === 0) return;
    for(let i=0; i<grid.length; i++) {
        let u = grid[i]; cells[i].className = 'grid-cell'; if (i === selectedUnitIdx) cells[i].classList.add('selected');
        
        if (u && u.overloadTimer > 0) {
            cells[i].style.border = "2px solid #ff1744"; cells[i].style.boxShadow = "0 0 8px #ff1744";
        } else {
            cells[i].style.border = ""; cells[i].style.boxShadow = "";
        }

        if(u) {
            if (u.gradeIdx === 6) cells[i].classList.add('glow-6'); if (u.gradeIdx === 7) cells[i].classList.add('glow-7'); if (u.gradeIdx === 8) cells[i].classList.add('glow-8'); let barsHtml = '';
            
            // 🔥 6차 법사만 바인드 쿨타임 바 제외
            if (u.gradeIdx === 6 && u.cls.type !== '법사') { 
                barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="bind-bar-${u.idx}" style="width: 0%; height: 100%; background: #00e5ff;"></div></div>`; 
            }
            
            if (u.gradeIdx >= 6) {
                if (u.cls.type === '법사' && skillLevels.mage_heal > 0) {
                    let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
                    let cdPercent = Math.max(0, Math.min(100, ((maxHealCd - (u.healCooldown || 0)) / maxHealCd) * 100));
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="heal-bar-${u.idx}" style="width: ${cdPercent}%; height: 100%; background: #00e676;"></div></div>`;
                }
            }
            
            if (u.gradeIdx >= 5) { 
                if ((u.cls.type === '전사' && (skillLevels.war_death||0) > 0) || (u.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) || (u.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0)) { let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc'); barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="global-bar-${u.idx}" style="width: 0%; height: 100%; background: ${color};"></div></div>`; } 
            }
            
            if (u.gradeIdx >= 7) {
                if (u.cls.type === '전사' && skillLevels.war_threat > 0) {
                    let cdPercent = Math.max(0, Math.min(100, ((25000 - (u.threatCooldown || 0)) / 25000) * 100));
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="threat-bar-${u.idx}" style="width: ${cdPercent}%; height: 100%; background: #ff9100;"></div></div>`;
                } else if (u.cls.type === '도적' && skillLevels.thief_overload > 0) {
                    let rtdPercent = Math.max(0, Math.min(100, ((45000 - (u.rtdCooldown || 0)) / 45000) * 100));
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="rtd-bar-${u.idx}" style="width: ${rtdPercent}%; height: 100%; background: #d50000;"></div></div>`;
                }
            }

            let hpBarHtml = '';
            if (u.hp < u.maxHp) {
                let hpPercent = Math.max(0, (u.hp / u.maxHp) * 100);
                // 🔥 체력바 id 추가 (반격 에러 방지)
                hpBarHtml = `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius:1.5px; border: 1px solid #111; overflow:hidden;"><div id="hp-bar-${u.idx}" style="width: ${hpPercent}%; height: 100%; background: #00e676;"></div></div>`;
            }

            cells[i].innerHTML = `<div style="font-size:20px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div><div style="color:${u.cls.color}; font-size:10px; margin-top:2px;">${u.grade.name}</div>${barsHtml}${hpBarHtml}`;
        } else { cells[i].innerHTML = ''; }
    }
    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if(pkBarContainer && typeof pkState !== 'undefined' && pkState.active && pkState.unit) { /* 펀치킹 전용 로직 우회 */ }
}

function renderOppGrid() { let oppGridContainer = document.getElementById('opp-grid-container'); if(!oppGridContainer) return; let cells = oppGridContainer.children; if(!cells || cells.length === 0) return; for(let i=0; i<oppGrid.length; i++) { let u = oppGrid[i]; cells[i].className = 'grid-cell'; if(u) { if (u.gradeIdx === 6) cells[i].classList.add('glow-6'); if (u.gradeIdx === 7) cells[i].classList.add('glow-7'); if (u.gradeIdx === 8) cells[i].classList.add('glow-8'); cells[i].innerHTML = `<div style="font-size:18px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div><div style="color:${u.cls.color}; font-size:9px; margin-top:2px;">${u.grade.name}</div>`; } else { cells[i].innerHTML = ''; } } }
function spawnMonster() { let bInfo = getBossInfo(state.wave); let hpBase = bInfo ? bInfo.hp : Math.floor(state.wave * 60 + Math.pow(state.wave, 1.5) * 12); monsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: bInfo ? 25 : 50, isBoss: !!bInfo, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: bInfo ? bInfo.name : null, facingRight: true, threatTimer: 0, counterTimer: 5 }); }
window.skipBossRound = () => { waveTimer = 150; if (state.isRank) { oppWaveTimer = 150; } document.getElementById('boss-skip-wrapper').style.display = 'none'; };
function updateWave(dt) { waveTimer += dt; spawnTimer += dt; let limit = state.isBoss ? 150 : 60; if(waveTimer >= limit) { nextWave(); return; } if(!state.isBoss && spawnTimer >= 1.5) { spawnMonster(); spawnTimer = 0; } document.getElementById('ui-timer').innerText = Math.max(0, limit - Math.floor(waveTimer)); }
function nextWave() { document.getElementById('boss-skip-wrapper').style.display = 'none'; if(state.isBoss && monsters.some(m => m.isBoss)) { if(state.isRank) return handleRankGameOver("보스 사냥 실패!"); else return gameOver("보스 처치 실패!"); } state.wave++; waveTimer = 0; spawnTimer = 0; let bInfo = getBossInfo(state.wave); state.isBoss = !!bInfo; if (!state.isRank && state.wave > bestWave) { bestWave = state.wave; localStorage.setItem('mapleDefenseBestWave', bestWave); document.getElementById('ui-best-wave').innerText = bestWave; if (currentUserUid) window.syncToCloud(); } if(state.isBoss) { spawnMonster(); } window.updateUI(); }
function showUpgradeToast(idChar, amt) { let box = document.getElementById(`upg-${idChar}-box`); let floatEl = document.createElement('div'); floatEl.className = 'upgrade-toast'; floatEl.innerText = '+' + amt; box.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1000); }
window.upgrade = (type) => { if(state.status !== 'PREP' && state.status !== 'PLAY') return; let u = state.upgrades[type]; if(state.mp >= u.cost) { state.mp -= u.cost; let amt = Math.floor(Math.random() * 6) + 1; u.val += amt; u.cost += Math.floor(u.cost * 0.2) + 3; let idChar = type === '전사' ? 'w' : (type === '법사' ? 'm' : 't'); showUpgradeToast(idChar, amt); document.getElementById(`upg-${idChar}-val`).innerText = u.val; document.getElementById(`upg-${idChar}-cost`).innerText = u.cost; window.updateUI(); } else { window.showMessage("메포가 부족합니다."); } };

window.openTicketModal = () => { 
    if(state.tickets.length === 0) { window.showMessage("보유한 선택권이 없습니다."); return; } 
    
    let counts = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0 };
    state.tickets.forEach(t => counts[t] = (counts[t] || 0) + 1);
    
    let modal = document.getElementById('ticket-modal');
    if(!modal) return;
    
    let html = `<h3 style="color:#263238; margin-top:0; text-align:center;">🎫 선택권 사용</h3>`;
    html += `<div style="max-height: 350px; overflow-y: auto;">`; 
    
    let hasTickets = false;
    for(let tier=1; tier<=8; tier++) {
        if(counts[tier] > 0) {
            hasTickets = true;
            html += `
            <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #cfd8dc; border-radius: 6px; background: #f8fdff;">
                <div style="font-weight: bold; margin-bottom: 8px; color: #0277bd; font-size: 14px;">${tier}차 선택권 <span style="font-size:12px; color:#555;">(보유: <b style="color:#d32f2f">${counts[tier]}</b>개)</span></div>
                <div style="display:flex; gap:5px;">
                    <button class="ingame-btn" style="flex:1; padding:8px 0; font-size:13px;" onclick="useTicketTier(${tier}, '전사')">전사</button>
                    <button class="ingame-btn" style="flex:1; padding:8px 0; font-size:13px;" onclick="useTicketTier(${tier}, '법사')">법사</button>
                    <button class="ingame-btn" style="flex:1; padding:8px 0; font-size:13px;" onclick="useTicketTier(${tier}, '도적')">도적</button>
                    <button class="ingame-btn premium-blue" style="flex:1.2; padding:8px 0; font-size:13px;" onclick="useTicketTier(${tier}, '랜덤')">🎲 랜덤</button>
                </div>
            </div>`;
        }
    }
    html += `</div>`;
    if(!hasTickets) { html = `<h3 style="color:#263238; margin-top:0;">🎫 선택권 사용</h3><p style="color:#666; font-size:13px;">보유한 선택권이 없습니다.</p>`; }
    
    html += `<button class="ingame-btn premium-white" style="width:100%; padding:12px; margin-top:10px;" onclick="closeAllModals()">닫기</button>`;
    
    modal.innerHTML = html;
    document.getElementById('overlay').style.display = 'block'; 
    modal.style.display = 'block'; 
};

window.useTicketTier = (tier, choice) => { 
    let emptyIdx = grid.findIndex(v => v === null); 
    if(emptyIdx === -1) { window.showMessage("공간 부족!"); return; } 
    
    let tIdx = state.tickets.indexOf(tier);
    if(tIdx !== -1) state.tickets.splice(tIdx, 1);
    else return; 
    
    let finalTier = tier; 
    let cls = choice === '랜덤' ? Object.keys(CLASSES)[Math.floor(Math.random()*3)] : choice; 
    if(choice === '랜덤' && Math.random() < 0.2) finalTier++; 
    
    window.addUnit(emptyIdx, finalTier, cls); 
    
    if(state.tickets.length > 0) { window.openTicketModal(); } 
    else { window.closeAllModals(); }
    window.updateUI(); 
};

function getTotalGrade() { let tg = 0; for(let k in cardData) tg += cardData[k].grade; return tg; }
function getTotalCardBonus() { let bonus = 0; for(let k in cardData) { if(cardData[k].grade > 0) bonus += 1 + (cardData[k].grade - 1) * 0.5; } return bonus; }
function getAvailableCoins() { return getTotalGrade() + userRankData.bonusCoins - spentCoins; }

window.openBookModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('book-modal').style.display = 'block'; window.renderBook(); };
window.renderBook = () => { 
    let list = document.getElementById('book-list'); list.innerHTML = ''; 
    const BOOK_ORDER = [ "킹 슬라임", "알리샤르", "파풀라투스", "피아누스", "자쿰", "혼테일", "어둠의 늑대", "시그너스", "반반", "피에르", "블러드퀸", "벨룸", "스우", "데미안", "루시드", "윌", "가디언엔젤슬라임" ]; 
    let allBosses = [...BOOK_ORDER]; 
    for(let k in cardData) { if(!allBosses.includes(k)) allBosses.push(k); } 
    allBosses.forEach(bName => { 
        let data = cardData[bName] || { owned: 0, grade: 0 }; let req = data.grade < 10 ? CARD_REQ[data.grade] : 'Max'; let canUpgrade = data.grade < 10 && data.owned >= req; let effectStr = data.grade > 0 ? `+${(1 + (data.grade-1)*0.5).toFixed(1)}%` : `0%`; let btnText = data.grade === 0 ? `등록 (${req})` : (data.grade === 10 ? 'MAX' : `강화 (${req})`); let imgSrc = bossImages[bName] ? bossImages[bName].src : ''; let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width: 40px; height: 40px; object-fit: contain; margin-right: 8px; flex-shrink: 0; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.4));">` : ''; 
        list.innerHTML += `<div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; text-align:left; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; overflow:hidden;">${imgHtml}<div style="overflow:hidden;"><div style="font-weight:800; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${bName} (등급: ${data.grade})</div><div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">효과: ${effectStr} / 보유: <b style="color:#e65100">${data.owned}장</b></div></div></div><button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:65px;" onclick="upgradeCard('${bName}')">${btnText}</button></div>`; 
    }); 
    document.getElementById('book-total-grade').innerHTML = `총 등급 합계: <span style="color:#c62828;">${getTotalGrade()}</span> (코인: <span style="color:#f57c00;">${getAvailableCoins()}</span>)`; document.getElementById('book-total-bonus').innerText = `총 보유 효과: 공격력 +${getTotalCardBonus().toFixed(1)}%`; 
};

window.upgradeCard = (bName) => { let data = cardData[bName]; let req = CARD_REQ[data.grade]; if(data.grade < 10 && data.owned >= req) { data.owned -= req; data.grade++; localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); if (currentUserUid) window.syncToCloud(); window.renderBook(); } };

window.openShopModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('shop-modal').style.display = 'block'; window.renderShop('common'); };
window.renderShop = (category) => { 
    document.getElementById('ui-shop-coins').innerText = getAvailableCoins(); 
    let list = document.getElementById('shop-list'); list.innerHTML = ''; 
    let prefix = category === 'common' ? 'common_' : (category === 'warrior' ? 'war_' : (category === 'mage' ? 'mage_' : 'thief_')); 
    
    for(let key in SKILL_INFO) { 
        if(key.startsWith(prefix)) { 
            let info = SKILL_INFO[key]; let lvl = skillLevels[key] || 0; let canUpgrade = lvl < info.max && getAvailableCoins() > 0; 
            let btnText = lvl === info.max ? 'MAX' : `강화 (1코인)`; let displayLv = lvl === 0 ? 1 : lvl; 
            
            list.innerHTML += `
            <div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                <div style="display:flex; align-items:center; overflow:hidden; flex:1; cursor:pointer;" onclick="openSkillDetail('${key}')">
                    <div style="width:40px; height:40px; border:1px solid #ccc; border-radius:4px; display:flex; justify-content:center; align-items:center; margin-right:10px; background:#f5f5f5; flex-shrink:0;">
                        <img src="${info.img}" onerror="this.src='image/mepo.png'" style="max-width:32px; max-height:32px; object-fit:contain;">
                    </div>
                    <div style="overflow:hidden; text-align:left;">
                        <div style="font-weight:800; color:#3e2723; font-size:14px; white-space:nowrap; text-overflow:ellipsis;">${info.name} <span style="color:#c62828;">Lv.${lvl}</span></div>
                        <div style="font-size:11px; color:#666; margin-top:3px; white-space:nowrap; text-overflow:ellipsis;">${info.getDesc(displayLv)}</div>
                    </div>
                </div>
                <button class="maple-btn small ${canUpgrade ? 'primary' : ''}" ${!canUpgrade ? 'disabled' : ''} style="white-space:nowrap; flex-shrink:0; margin-left:5px; min-width:65px; padding:6px 0;" onclick="upgradeSkill('${key}', '${category}')">${btnText}</button>
            </div>`; 
        } 
    } 
};

window.openSkillDetail = (key) => {
    let info = SKILL_INFO[key]; let lvl = skillLevels[key] || 0; let displayLv = lvl === 0 ? 1 : lvl;
    let modal = document.getElementById('skill-detail-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'skill-detail-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:4700; width:85%; max-width:300px; background:#fff; border:2px solid #546e7a; padding:15px; border-radius:8px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    modal.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:15px;">
            <div style="width:60px; height:60px; border:1px solid #ccc; border-radius:4px; display:flex; justify-content:center; align-items:center; background:#f5f5f5; margin-bottom:10px;">
                <img src="${info.img}" onerror="this.src='image/mepo.png'" style="max-width:50px; max-height:50px; object-fit:contain;">
            </div>
            <h3 style="margin:0; color:#3e2723;">${info.name} <span style="color:#c62828;">Lv.${lvl}</span></h3>
        </div>
        <div style="background:#f1f8e9; border:1px solid #c5e1a5; padding:10px; border-radius:6px; color:#333; font-size:13px; line-height:1.5; text-align:left; word-break:keep-all; margin-bottom:15px;">
            ${info.getDesc(displayLv)}
        </div>
        <button class="ingame-btn premium-blue" style="width:100%; padding:10px;" onclick="document.getElementById('skill-detail-modal').style.display='none'">닫기</button>
    `;
    modal.style.display = 'block';
};

window.upgradeSkill = (key, category) => { if((skillLevels[key] || 0) < SKILL_INFO[key].max && getAvailableCoins() > 0) { skillLevels[key] = (skillLevels[key] || 0) + 1; spentCoins++; localStorage.setItem('mapleDefenseSkills', JSON.stringify(skillLevels)); localStorage.setItem('mapleDefenseSpentCoins', spentCoins); if (currentUserUid) window.syncToCloud(); window.renderShop(category); renderGrid(); } };
window.openActiveSkillsModal = () => { document.getElementById('overlay').style.display = 'block'; document.getElementById('active-skills-modal').style.display = 'block'; let list = document.getElementById('active-skills-list'); list.innerHTML = ''; let hasSkill = false; for(let key in skillLevels) { if(skillLevels[key] > 0) { hasSkill = true; list.innerHTML += `<div style="background:#fff; border:2px solid #8d6e63; border-radius:6px; padding:6px 8px; display:flex; align-items:center; overflow:hidden;"><img src="${SKILL_INFO[key].img}" onerror="this.src='image/mepo.png'" style="width:30px; height:30px; object-fit:contain; margin-right:8px; flex-shrink:0;"><div style="overflow:hidden;"><div style="font-weight:800; color:#3e2723; font-size:13px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].name} <span style="color:#c62828;">Lv.${skillLevels[key]}</span></div><div style="font-size:10.5px; color:#666; margin-top:2px; white-space:nowrap; text-overflow:ellipsis; letter-spacing:-0.5px;">${SKILL_INFO[key].getDesc(skillLevels[key])}</div></div></div>`; } } if(!hasSkill) list.innerHTML = `<div style="text-align:center; padding: 20px; font-weight:bold; color:#666;">적용중인 스킬이 없습니다.</div>`; };

window.openInventoryModal = () => { document.getElementById('inventory-modal').style.display = 'block'; document.getElementById('overlay').style.display = 'block'; calculateEquipStats(); renderEquippedSlots(); renderInventoryTab('consumable'); };
window.closeInventoryModal = () => { document.getElementById('inventory-modal').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; };

function renderEquippedSlots() { 
    ['뱃지', '엠블럼', '링'].forEach(slot => { 
        let el = document.getElementById(`slot-${slot}`); el.style.position = 'relative'; el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.justifyContent = 'space-between'; el.style.alignItems = 'center'; el.style.height = '60px'; el.style.padding = '5px 0'; el.style.boxSizing = 'border-box';
        let item = userEquipped[slot]; 
        if (item) { el.className = `equip-slot equip-${item.grade.toLowerCase()}`; el.innerHTML = `<div class="slot-item" style="position:relative; transform:translateY(-2px);">${getEquipIcon(slot)}</div><div class="slot-name" style="font-size:11px; font-weight:bold; color:#333; margin:0; line-height:1;">${slot}</div>`; el.onclick = () => openEquipDetailModal(item, slot, true); } 
        else { el.className = `equip-slot`; el.innerHTML = `<div class="slot-item" style="flex:1;"></div><div class="slot-name" style="font-size:11px; font-weight:bold; color:#888; margin:0; line-height:1;">${slot}</div>`; el.onclick = null; } 
    }); 
    document.getElementById('equip-total-stats').innerText = `적용 스탯: 공+${equipStats.atk}% / 공속+${equipStats.spd}% / 크확+${equipStats.crit}% / 치피+${equipStats.cdmg}% / 방관 ${equipStats.pen}% (추가공 +${equipStats.flatAtk})`; 
}

function getEquipIcon(type) { let fileName = type === '뱃지' ? 'emblem.png' : (type === '엠블럼' ? 'badge.png' : 'ring.png'); let size = type === '링' ? '30px' : '36px'; return `<img src="image/${fileName}" style="width: ${size}; height: ${size}; object-fit: contain; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.4));">`; }
window.isCombiningCoin = false;
window.combineCoinPieces = () => { if (window.isCombiningCoin) return; if (userInventory.coinPieces >= 10) { if (confirm("코인 조각 10개를 스킬 코인 1개로 합치시겠습니까?")) { window.isCombiningCoin = true; userInventory.coinPieces -= 10; userRankData.bonusCoins += 1; window.syncToCloud().then(() => { window.isCombiningCoin = false; renderInventoryTab('consumable'); window.showMessage("코인 1개를 획득했습니다!"); }).catch((e) => { window.isCombiningCoin = false; window.showMessage("서버 통신 중 오류가 발생했습니다."); }); } } else { window.showMessage("코인 조각이 부족합니다. (10개 필요)"); } };

window.renderInventoryTab = (tab) => {
    let list = document.getElementById('inventory-list'); list.innerHTML = '';
    if (tab === 'consumable') {
        if(userInventory.coinPieces > 0) list.innerHTML += createInvBox('🧩', '코인 조각', userInventory.coinPieces, "combineCoinPieces()");
        
        // 🔥 장비상자를 이미지로 교체
        if(userInventory.equipBoxes > 0) list.innerHTML += createInvBox('<img src="image/equipbox.png" style="width:24px; height:24px; object-fit:contain;">', '장비 상자', userInventory.equipBoxes, "openBox('equipBoxes')");
        
        list.innerHTML += createInvBox('🌟', '별 기운', userInventory.starPieces || 0, ""); 
        
        if((userRankData.mulungCoins || 0) > 0) list.innerHTML += createInvBox('🐼', '무릉 코인', userRankData.mulungCoins, "openMulungShop()");
        
        // 🔥 인벤토리에 블랙 큐브 이미지와 함께 표시
        if((userInventory.blackCubes || 0) > 0) list.innerHTML += createInvBox('<img src="image/blackcube.png" style="width:24px; height:24px; object-fit:contain;">', '블랙 큐브', userInventory.blackCubes, "");
        
        ['브론즈', '실버', '골드', '플래티넘', '다이아몬드', '챌린저'].forEach(tier => { if (userInventory.boxes[tier] > 0) { list.innerHTML += createInvBox('🧰', `${tier} 상자`, userInventory.boxes[tier], `openBox('${tier}')`); } });
    } else if (tab === 'equip') {
        userEquips.forEach((eq, idx) => {
            let el = document.createElement('div'); el.className = `inv-item-box equip-${eq.grade.toLowerCase()}`;
            let statStr = "";
            if (eq.options && Array.isArray(eq.options)) {
                statStr = eq.options.map(o => {
                    let label = o.type === 'atk' ? '공' : (o.type === 'spd' ? '속' : (o.type === 'crit' ? '크' : (o.type === 'cdmg' ? '치피' : '방관')));
                    return `${label}+${o.value}%`;
                }).join('<br>');
            } else {
                if (eq.atk > 0) statStr = `공+${eq.atk}%`; else if (eq.spd > 0) statStr = `속+${eq.spd}%`; else if (eq.crit > 0) statStr = `크+${eq.crit}%`;
            }
            el.innerHTML = `<div style="display:flex; flex-direction:column; justify-content:space-between; align-items:center; height:100%; width:100%;"><div style="position:relative; display:inline-block; margin-top:2px;">${getEquipIcon(eq.type)}</div><div style="font-size:9px; font-weight:bold; color:#37474f; text-align:center; line-height:1.2; margin-bottom:2px;">${statStr}</div></div>`; 
            el.onclick = () => openEquipDetailModal(eq, idx, false); list.appendChild(el);
        });
    }
};
function createInvBox(icon, name, qty, onclickStr) { let clickAttr = onclickStr ? `onclick="${onclickStr}"` : ''; return `<div class="inv-item-box" ${clickAttr}><div class="inv-item-icon">${icon}</div><div class="inv-item-qty">${qty}</div><div style="font-size:10px; font-weight:bold; color:#546e7a; margin-top:2px; text-align:center;">${name}</div></div>`; }

window.openBox = (boxType) => {
    let tierProb = { '브론즈': { frag: [ [1, 0.6], [0, 0.4] ], equip: 0 }, '실버': { frag: [ [1, 0.666], [2, 0.333] ], equip: 0 }, '골드': { frag: [ [2, 0.45], [3, 0.35], [4, 0.15], [5, 0.05] ], equip: 0.05 }, '플래티넘': { frag: [ [3, 0.55], [4, 0.35], [5, 0.1] ], equip: 0.15 }, '다이아몬드': { frag: [ [4, 0.666], [5, 0.333] ], equip: 0.35 }, '챌린저': { frag: [ [5, 1.0] ], equip: 0.55 } };
    if (boxType === 'equipBoxes') { if (userInventory.equipBoxes <= 0) return; userInventory.equipBoxes--; generateEquipment(); } 
    else {
        if (!userInventory.boxes[boxType] || userInventory.boxes[boxType] <= 0) return; userInventory.boxes[boxType]--; let data = tierProb[boxType]; let r = Math.random(); let acc = 0; let getFrag = 0;
        for(let f of data.frag) { acc += f[1]; if(r <= acc) { getFrag = f[0]; break; } }
        userInventory.coinPieces += getFrag; let getEquipBox = Math.random() < data.equip ? 1 : 0; userInventory.equipBoxes += getEquipBox; window.showMessage(`${boxType} 개봉!\n조각 +${getFrag}, 장비상자 +${getEquipBox}`);
    }
    window.syncToCloud(); renderInventoryTab('consumable');
};

function generateEquipment() {
    let types = ['뱃지', '엠블럼', '링']; let type = types[Math.floor(Math.random() * 3)]; let r = Math.random(); let grade;
    if (r < 0.65) grade = 'Rare'; else if (r < 0.90) grade = 'Epic'; else if (r < 0.99) grade = 'Unique'; else grade = 'Legendary';
    
    let options = [];
    let optionCount = Math.random() < 0.30 ? 2 : 1; 
    let availableTypes = [...OPTION_TYPES].sort(() => 0.5 - Math.random());

    for (let i = 0; i < optionCount; i++) {
        let optType = availableTypes.pop();
        let range = OPTION_RANGES[grade][optType];
        let val = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        options.push({ type: optType, value: val });
    }

    let alertMsg = options.map(o => {
        let name = o.type === 'atk' ? '공격력' : (o.type === 'spd' ? '공속' : (o.type === 'crit' ? '크확' : (o.type === 'cdmg' ? '치명타 피해' : '방어력 관통')));
        return `${name}: +${o.value}%`;
    }).join('\n');

    userEquips.push({ type, grade, options, baseAttack: 0, attack: 0, star: 0, totalSpentStar: 0, id: Date.now() }); 
    window.showMessage(`[${grade}] ${type} 획득! (${options.length}줄)\n${alertMsg}`);
}

let activeEquipTarget = null; let activeEquipIndex = null; let activeIsEquipped = false; 
window.openEquipDetailModal = (eq, targetIdx, isEquipped) => {
    activeEquipTarget = eq; activeEquipIndex = targetIdx; activeIsEquipped = isEquipped;
    let modal = document.getElementById('equip-detail-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'equip-detail-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:3600; width:85%; max-width:300px; background:#fff; border:2px solid #546e7a; padding:15px; border-radius:8px;";
        mDiv.innerHTML = `<h3 id='modal-eq-title' style="color:#263238; margin-top:0; text-align:center;">장비 정보</h3><div id='modal-eq-body' style="background:#eceff1; padding:10px; border-radius:6px; font-size:13px; color:#37474f; font-weight:bold; margin-bottom:15px; line-height:1.6; text-align:center;"></div><div style="display:flex; flex-direction:column; gap:8px;"><button class="ingame-btn premium-orange" style="width:100%; padding:12px; font-size:15px;" onclick="openStarForceModal()">🌟 스타포스 강화</button><div style="display:flex; gap:6px;"><button id='modal-btn-equip' class="ingame-btn premium-blue" style="flex:1; padding:10px; font-size:13px;" onclick="modalActionEquip()">장착</button><button class="ingame-btn premium-red" style="flex:1; padding:10px; font-size:13px;" onclick="modalActionDisassemble()">분해하기</button></div><button class="ingame-btn premium-white" style="width:100%; padding:10px;" onclick="closeEquipModalOnly()">취소</button></div>`;
        document.body.appendChild(mDiv); modal = mDiv;
    }
    modal.style.display = 'block';
    let gradeColor = eq.grade === 'Rare' ? '#1e88e5' : (eq.grade === 'Epic' ? '#8e24aa' : (eq.grade === 'Unique' ? '#fb8c00' : '#76ff03'));
    let starStr = eq.star > 0 ? ` <span style="color:#fbc02d;">★${eq.star}</span>` : '';
    document.getElementById('modal-eq-title').innerHTML = `<span style="color:${gradeColor}">${eq.grade} ${eq.type}</span>${starStr}`;
    
    let baseOpt = "";
    if (eq.options && Array.isArray(eq.options)) {
        baseOpt = eq.options.map(o => {
            let name = o.type === 'atk' ? '공격력' : (o.type === 'spd' ? '공속' : (o.type === 'crit' ? '크확' : (o.type === 'cdmg' ? '치피' : '방관')));
            return `${name} +${o.value}%`;
        }).join('<br>');
    } else {
        baseOpt = eq.atk > 0 ? `기본 옵션: 공격력 +${eq.atk}%` : (eq.spd > 0 ? `기본 옵션: 공속 +${eq.spd}%` : `기본 옵션: 크확 +${eq.crit}%`);
    }

    let perStar = STARFORCE_BONUS[eq.grade] || 0;
    let flatAtkVal = (eq.star || 0) * perStar;
    let starOpt = flatAtkVal > 0 ? `<br><span style="color:#e65100;">스타포스 추가 공격력: +${flatAtkVal}</span>` : `<br><span style="color:#777;">스타포스 강화 없음</span>`;
    document.getElementById('modal-eq-body').innerHTML = `${baseOpt}<br>${starOpt}<br><div style="font-size:11px; color:#555; margin-top:5px;">현재 보유 별의 기운: <b style="color:#d32f2f;">${userInventory.starPieces || 0}개</b></div>`;
    let btnEquip = document.getElementById('modal-btn-equip');
    if (isEquipped) { btnEquip.innerText = "장비 해제"; btnEquip.className = "ingame-btn premium-dark"; } else { btnEquip.innerText = "착용하기"; btnEquip.className = "ingame-btn premium-blue"; }
};

window.closeEquipModalOnly = () => { let modal = document.getElementById('equip-detail-modal'); if (modal) modal.style.display = 'none'; };
window.closeStarForceModalOnly = () => { let modal = document.getElementById('starforce-modal'); if (modal) modal.style.display = 'none'; let eqModal = document.getElementById('equip-detail-modal'); if (eqModal) eqModal.style.display = 'block'; };

window.modalActionEquip = () => {
    if (activeIsEquipped) { userEquips.push(activeEquipTarget); userEquipped[activeEquipTarget.type] = null; } 
    else { let old = userEquipped[activeEquipTarget.type]; if (old) userEquips.push(old); userEquipped[activeEquipTarget.type] = activeEquipTarget; userEquips.splice(activeEquipIndex, 1); }
    calculateEquipStats(); window.syncToCloud(); window.closeEquipModalOnly(); renderEquippedSlots(); renderInventoryTab('equip'); window.showMessage("장비 상태가 변경되었습니다.");
};

window.modalActionDisassemble = () => {
    let eq = activeEquipTarget; let baseReward = eq.grade === 'Rare' ? 5 : (eq.grade === 'Epic' ? 10 : (eq.grade === 'Unique' ? 15 : 20)); let refundReward = Math.round((eq.totalSpentStar || 0) * 0.7); let totalGet = baseReward + refundReward;
    if (!confirm(`정말로 이 장비를 분해하시겠습니까?\n🎁 획득할 별의 기운: ${totalGet}개 (기본 ${baseReward} + 페이백 ${refundReward})`)) return;
    if (activeIsEquipped) { userEquipped[eq.type] = null; } else { userEquips.splice(activeEquipIndex, 1); }
    userInventory.starPieces = (userInventory.starPieces || 0) + totalGet; calculateEquipStats(); window.syncToCloud(); window.closeEquipModalOnly(); renderEquippedSlots(); renderInventoryTab('consumable'); renderInventoryTab('equip'); window.showMessage(`장비 분해 완료! 별의 기운 +${totalGet}개 획득`);
};

// ==========================================
// 🌟 스타포스 강화 팝업 및 로직 
// ==========================================
const SF_TABLE = [ {cost:2,succ:100,keep:0,drop:0}, {cost:4,succ:95,keep:5,drop:0}, {cost:6,succ:85,keep:15,drop:0}, {cost:8,succ:75,keep:25,drop:0}, {cost:10,succ:65,keep:35,drop:0}, {cost:15,succ:55,keep:45,drop:0}, {cost:20,succ:45,keep:45,drop:10}, {cost:25,succ:35,keep:45,drop:20}, {cost:30,succ:25,keep:45,drop:30}, {cost:40,succ:15,keep:45,drop:40} ];

window.openStarForceModal = () => {
    let eqModal = document.getElementById('equip-detail-modal'); if (eqModal) eqModal.style.display = 'none';
    let modal = document.getElementById('starforce-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'starforce-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:3700; width:90%; max-width:320px; background:#fff; border:2px solid #b71c1c; padding:15px; border-radius:8px;";
        mDiv.innerHTML = `<h3 style="color:#b71c1c; margin-top:0; text-align:center;">🌟 스타포스 강화</h3><div id='sf-modal-info' style="background:#ffebee; padding:12px; border-radius:6px; font-size:13px; color:#b71c1c; font-weight:bold; margin-bottom:15px; line-height:1.6; text-align:center;"></div><div style="display:flex; flex-direction:column; gap:8px;"><button class="ingame-btn premium-red" style="width:100%; padding:14px; font-size:16px;" onclick="executeStarForce()">강화 시도하기</button><button class="ingame-btn premium-white" style="width:100%;" onclick="closeStarForceModalOnly()">뒤로 가기</button></div>`;
        document.body.appendChild(mDiv); modal = mDiv;
    }
    modal.style.display = 'block'; updateStarForceUI();
};

function updateStarForceUI() {
    let eq = activeEquipTarget; let curStar = eq.star || 0;
    if (curStar >= 10) { document.getElementById('sf-modal-info').innerHTML = `현재 <span style="color:#f57f17;">★${curStar}성</span> (최고 성급 달성 완료!)<br>더 이상 강화할 수 없습니다.`; return; }
    let info = SF_TABLE[curStar]; let perStar = STARFORCE_BONUS[eq.grade] || 0; let nextFlatAtk = (curStar + 1) * perStar;
    document.getElementById('sf-modal-info').innerHTML = `현재 성급: <span style="font-size:16px;">★${curStar}성 ➔ ★${curStar+1}성</span><br>소모 비용: <b style="color:#d32f2f;">별의 기운 ${info.cost}개</b> (보유: ${userInventory.starPieces || 0}개)<br>성공 확률: <b style="color:#2e7d32;">${info.succ}%</b> | 유지: ${info.keep}% | 하락: <span style="color:#c62828;">${info.drop}%</span><br>강화 성공 시 추가 공격력: +${nextFlatAtk}`;
}

window.executeStarForce = () => {
    let eq = activeEquipTarget; let curStar = eq.star || 0; if (curStar >= 10) return;
    let info = SF_TABLE[curStar]; let userStarPieces = userInventory.starPieces || 0;
    if (userStarPieces < info.cost) { window.showMessage("별의 기운이 부족합니다!"); return; }
    userInventory.starPieces -= info.cost; let rand = Math.random() * 100;
    if (rand < info.succ) { eq.totalSpentStar = (eq.totalSpentStar || 0) + info.cost; eq.star = curStar + 1; window.showMessage(`🎉 스타포스 강화 성공! (★${eq.star})`); } 
    else if (rand < info.succ + info.keep) { window.showMessage(`💬 강화 실패... 성급이 유지됩니다.`); } 
    else { eq.star = Math.max(0, curStar - 1); window.showMessage(`💥 강화 실패... 성급이 1성 하락했습니다! (★${eq.star})`); }
    calculateEquipStats(); window.syncToCloud(); updateStarForceUI();
};

window.openRaidLobby = () => {
    if (!currentUserUid) { window.showMessage("로그인이 필요한 서비스입니다."); return; }
    document.getElementById('raid-lobby-overlay').style.display = 'flex';
    document.getElementById('raid-lobby-modal').style.display = 'block';
    document.getElementById('raid-ranking-modal').style.display = 'none';
    
    let hpText = document.getElementById('lobby-raid-boss-hp-text');
    let hpBar = document.getElementById('lobby-raid-boss-hp-bar');
    if(hpText) hpText.innerText = "불러오는 중...";
    
    onValue(ref(database, 'worldBoss'), (snap) => {
        let baseMaxHp = 15000000;
        if(snap.exists()) {
            let val = snap.val();
            let dbMax = (val && val.maxHp) ? val.maxHp : baseMaxHp;
            let currentMaxHp = dbMax < baseMaxHp ? baseMaxHp : dbMax;
            
            let hp = typeof val === 'number' ? val : (val.hp !== undefined ? val.hp : currentMaxHp);
            if(isNaN(hp)) hp = currentMaxHp;
            
            let percent = (hp / currentMaxHp) * 100;
            if(hpBar) hpBar.style.width = `${Math.max(0, percent)}%`;
            if(hpText) hpText.innerText = `${Math.round(hp).toLocaleString()} / ${currentMaxHp.toLocaleString()}`;
        } else {
            if(hpBar) hpBar.style.width = `100%`;
            if(hpText) hpText.innerText = `${baseMaxHp.toLocaleString()} / ${baseMaxHp.toLocaleString()}`;
        }
    });
};

window.openRaidMenu = window.openRaidLobby;
window.closeRaidLobby = () => { document.getElementById('raid-lobby-overlay').style.display = 'none'; };

window.startRaidGame = () => {
    let today = new Date().toLocaleDateString(); let lastRaidDate = localStorage.getItem('mapleDefenseRaidDate');
    if (lastRaidDate === today) { window.showMessage('오늘 이미 월드 보스 토벌에 참여하셨습니다.'); return; }

    window.closeRaidLobby(); localStorage.setItem('mapleDefenseRaidDate', today); window.syncToCloud();
    document.getElementById('start-screen').style.display = 'none'; document.getElementById('raid-game').style.display = 'flex';
    
    raidState.status = 'PREP'; raidState.active = true; raidState.time = 60; raidState.prepTime = 5; raidState.meso = 30;
    raidState.totalDmg = 0; raidState.pendingDmg = 0; raidState.lastTime = performance.now();
    raidState.gotLastHit = false; raidState.rewardClaimedForKills = [];
    raidState.bossThreatTimer = 0; 
    raidState.units = [null, null, null]; raidState.projectiles = []; raidState.vfx = []; raidState.dmgTexts = [];

    document.getElementById('raid-prep-ui').style.display = 'flex'; document.getElementById('raid-prep-time').innerText = '5'; document.getElementById('raid-meso').innerText = '30'; renderRaidGrid();

    onValue(ref(database, 'worldBoss'), (snap) => {
        let baseMaxHp = 15000000;
        if(snap.exists()) {
            let val = snap.val();
            let dbMax = (val && val.maxHp) ? val.maxHp : baseMaxHp;
            let currentMaxHp = dbMax < baseMaxHp ? baseMaxHp : dbMax;
            
            raidState.maxHp = currentMaxHp; 
            raidState.bossHp = typeof val === 'number' ? val : (val.hp !== undefined ? val.hp : currentMaxHp);
            if(isNaN(raidState.bossHp)) raidState.bossHp = currentMaxHp;
            
            let percent = (raidState.bossHp / raidState.maxHp) * 100;
            document.getElementById('raid-boss-hp-bar').style.width = `${Math.max(0, percent)}%`; 
            document.getElementById('raid-boss-hp-text').innerText = `${Math.max(0, Math.round(raidState.bossHp)).toLocaleString()} / ${currentMaxHp.toLocaleString()}`;
        } else {
            raidState.maxHp = baseMaxHp; raidState.bossHp = baseMaxHp;
        }
    });
    raidLoop();
};

window.showRaidRanking = async () => {
    document.getElementById('raid-lobby-modal').style.display = 'none'; document.getElementById('raid-ranking-modal').style.display = 'flex';
    let list = document.getElementById('raid-ranking-list'); list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">순위를 불러오는 중...</div>';
    try {
        const snap = await get(child(ref(database), `worldBoss_rankings`));
        if (snap.exists()) {
            let ranks = []; snap.forEach(c => { let v = c.val(); if(typeof v.damage === 'number' && !isNaN(v.damage)) ranks.push(v); }); 
            ranks.sort((a, b) => b.damage - a.damage); ranks = ranks.slice(0, 50); list.innerHTML = '';
            ranks.forEach((entry, idx) => { 
                let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); 
                list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; color:${color}; font-weight:bold;"><span>${idx + 1}위 - ${entry.nickname}</span><span>${Math.round(entry.damage).toLocaleString()} <span style="font-size:10px; color:#aaa;">(${entry.date})</span></span></div>`; 
            });
        } else list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">아직 등록된 순위가 없습니다.</div>';
    } catch(e) { list.innerHTML = '<div style="text-align:center; color:#ff5252;">서버 연결 실패.</div>'; }
};

window.closeRaidRanking = () => { document.getElementById('raid-ranking-modal').style.display = 'none'; document.getElementById('raid-lobby-modal').style.display = 'block'; };

window.summonRaidUnit = () => {
    if(raidState.status !== 'PREP') return; if(raidState.meso < 10) { window.showMessage("메소가 부족합니다."); return; }
    let emptyIdx = raidState.units.findIndex(v => v === null); if(emptyIdx === -1) { window.showMessage("더 이상 배치할 수 매치 공간이 없습니다."); return; }
    raidState.meso -= 10; document.getElementById('raid-meso').innerText = raidState.meso;
    let r = Math.random() * 100; let gradeIdx = r < 60 ? 5 : (r < 90 ? 6 : (r < 99 ? 7 : 8)); 
    let clsNames = Object.keys(CLASSES); let clsName = clsNames[Math.floor(Math.random() * clsNames.length)]; let cls = CLASSES[clsName]; let grade = GRADES[gradeIdx];
    raidState.units[emptyIdx] = { cls: cls, grade: grade, gradeIdx: gradeIdx, x: 150 + (emptyIdx * 100), y: 360, lastAttack: 0, globalCooldown: 0, rtdCooldown: 0 }; renderRaidGrid(); 
};

function renderRaidGrid() {
    let gridHtml = '';
    for(let i=0; i<3; i++) {
        let u = raidState.units[i];
        if (u) {
            let barsHtml = '';
            
            if (u.gradeIdx >= 6) {
                if (u.cls.type === '법사' && skillLevels.mage_heal > 0) {
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="raid-heal-bar-${i}" style="width: 0%; height: 100%; background: #00e676;"></div></div>`;
                }
            }
            
            if (u.gradeIdx >= 5) {
                if ((u.cls.type === '전사' && (skillLevels.war_death || 0) > 0) || (u.cls.type === '법사' && (skillLevels.mage_thunder || 0) > 0) || (u.cls.type === '도적' && (skillLevels.thief_fuma || 0) > 0)) {
                    let color = u.cls.type === '전사' ? '#ffeb3b' : (u.cls.type === '법사' ? '#00e5ff' : '#ab47bc');
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="raid-global-bar-${i}" style="width: 0%; height: 100%; background: ${color};"></div></div>`;
                }
            }
            if (u.gradeIdx >= 7) {
                if (u.cls.type === '전사' && skillLevels.war_threat > 0) {
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="raid-threat-bar-${i}" style="width: 0%; height: 100%; background: #ff9100;"></div></div>`;
                } else if (u.cls.type === '도적' && skillLevels.thief_overload > 0) {
                    let rtdPercent = Math.max(0, Math.min(100, ((45000 - (u.rtdCooldown || 0)) / 45000) * 100));
                    barsHtml += `<div style="width: 80%; height: 3px; background: #333; margin-top: 2px; border-radius: 1.5px; overflow: hidden; border: 1px solid #111;"><div id="raid-rtd-bar-${i}" style="width: ${rtdPercent}%; height: 100%; background: #d50000;"></div></div>`;
                }
            }
            gridHtml += `<div id="raid-unit-box-${i}" class="grid-cell glow-${u.gradeIdx}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:36px;">${u.cls.icon}</div><div style="font-size:10px; color:${u.cls.color}; font-weight:bold;">${u.grade.name}</div>${barsHtml}</div>`;
        }
        else gridHtml += `<div class="grid-cell" style="background:rgba(0,0,0,0.2); border:1px dashed #777;"></div>`;
    }
    document.getElementById('raid-grid-container').innerHTML = gridHtml;
}

setInterval(() => {
    if (raidState.active && raidState.pendingDmg > 0 && !isNaN(raidState.pendingDmg)) {
        let dmgToApply = raidState.pendingDmg; 
        raidState.pendingDmg = 0;
        
        runTransaction(ref(database, 'worldBoss'), (data) => {
            let bossData = data;
            if (typeof bossData === 'number') bossData = { hp: bossData, maxHp: 15000000, killCount: 0, lastKillerUid: null };
            if (!bossData || typeof bossData !== 'object') bossData = { hp: 15000000, maxHp: 15000000, killCount: 0, lastKillerUid: null };
            
            let currentMax = bossData.maxHp || 15000000;
            if (typeof bossData.hp !== 'number' || isNaN(bossData.hp)) bossData.hp = currentMax;
            let dmg = (typeof dmgToApply === 'number' && !isNaN(dmgToApply)) ? Math.round(dmgToApply) : 0;
            
            bossData.hp -= dmg;
            
            if (bossData.hp <= 0) { 
                bossData.killCount = (bossData.killCount || 0) + 1; 
                let nextMaxHp = Math.floor(15000000 * Math.pow(1.1, bossData.killCount));
                bossData.maxHp = nextMaxHp;
                bossData.hp = nextMaxHp; 
                bossData.lastKillerUid = currentUserUid; 
            }
            return bossData;
        }).catch(e => {
            raidState.pendingDmg += dmgToApply; 
            if (e.message && e.message.toLowerCase().includes('permission_denied')) {
                window.showMessage("파이어베이스 보안 규칙(Rules) 설정이 필요합니다!");
            }
        });
    }
}, 1000);

// 🔥 [코어 도우미 함수] 장착된 코어의 레벨을 가져옵니다.
window.getCoreLv = (key) => {
    if (!userCores || !userCores.equipped || !userCores.equipped.includes(key)) return 0;
    if (!userCores.items || !userCores.items[key]) return 0;
    return userCores.items[key].level;
};

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
    
    if (raidState.time <= 0 || raidState.bossHp <= 0) { 
        if(raidState.bossHp <= 0) raidState.gotLastHit = true;
        endRaidGame(); 
        return; 
    }

    if (raidState.bossThreatTimer > 0) raidState.bossThreatTimer -= dt;

    let cardMulti = 1 + (getTotalCardBonus() / 100); 
    let rageMulti = 1 + ((skillLevels.common_rage || 0) * 0.01) + (equipStats.atk * 0.01); 
    let sharpChance = ((skillLevels.common_sharp || 0) * 0.05) + (equipStats.crit * 0.01); 
    
    // ✨ [코어 적용] 전사 2번: 위협 코어 (위협 상태 시 파티 전체 크확 보정)
    let threatCoreLv = window.getCoreLv('war_threat');
    if (raidState.bossThreatTimer > 0 && threatCoreLv > 0) {
        sharpChance += (threatCoreLv * 0.01); // 레벨당 1% 증가
    }

    let windReduc = 1 + ((skillLevels.common_wind || 0) * 0.2) + (equipStats.spd * 0.01);
    let bx = 250, by = 150;

    let myUnpen = equipStats.unpenetratedRate;
    if (raidState.bossThreatTimer > 0) myUnpen *= 0.9;
    let appliedArmor = 0.50 * myUnpen;

    raidState.units.forEach((u, idx) => {
        if(!u) return; 

        // ✨ [코어 적용] 도적 8번: 레디투다이 코어 (오버로드 지속 중 크피 증가)
        let overloadMult = 1;
        let thiefCdmgBonus = 0;
        if (u.overloadTimer > 0) {
            u.overloadTimer -= dt; overloadMult = 2;
            let overloadCoreLv = window.getCoreLv('thief_overload');
            if (overloadCoreLv > 0) thiefCdmgBonus = (overloadCoreLv * 0.02); // 레벨당 2% 증가
            
            let unitBox = document.getElementById(`raid-unit-box-${idx}`);
            if (unitBox) { unitBox.style.border = "2px solid #ff1744"; unitBox.style.boxShadow = "0 0 8px #ff1744"; }
            if (u.overloadTimer <= 0) u.unitStunTimer = skillLevels.thief_overload === 1 ? 6 : 5;
        } else {
            let unitBox = document.getElementById(`raid-unit-box-${idx}`);
            if (unitBox) { unitBox.style.border = ""; unitBox.style.boxShadow = ""; }
        }
        
        if (u.unitStunTimer > 0) u.unitStunTimer -= dt;
        let isStunned = (u.unitStunTimer > 0);

        // ✨ [코어 적용] 법사 4번: 힐 코어 (버프를 받은 유닛의 공격속도 펌핑)
        let localWindReduc = windReduc;
        if (u.healCoreBuffTimer > 0) {
            u.healCoreBuffTimer -= dtReal;
            localWindReduc += u.healCoreBuffAmt;
        }

        if (u.gradeIdx >= 6) {
            if (u.cls.type === '법사' && skillLevels.mage_heal > 0) {
                if (u.healCooldown === undefined) u.healCooldown = 0;
                u.healCooldown -= dt * 1000;
                let hbar = document.getElementById(`raid-heal-bar-${idx}`);
                let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
                if (hbar) hbar.style.width = Math.max(0, Math.min(100, ((maxHealCd - u.healCooldown) / maxHealCd) * 100)) + '%';
                
                if (u.healCooldown <= 0 && !isStunned) {
                    u.healCooldown += maxHealCd;
                    raidState.vfx.push({ type: 'heal', x: 150 + (idx * 100), y: 360, timer: 1.0 });

                    // 힐 코어 발동: 가장 강한 유닛(등급이 높은 유닛)을 찾아 공속 버프 부여
                    let healCoreLv = window.getCoreLv('mage_heal');
                    if (healCoreLv > 0) {
                        let bestUnit = u; let bestScore = -1;
                        raidState.units.forEach(tu => { if (tu && tu.gradeIdx > bestScore) { bestScore = tu.gradeIdx; bestUnit = tu; } });
                        bestUnit.healCoreBuffTimer = 3.0; // 3초 지속
                        bestUnit.healCoreBuffAmt = (healCoreLv * 0.02); // 레벨당 공속 2% 증가
                    }
                }
            }
        }

        if (u.gradeIdx >= 7) {
            if (u.cls.type === '전사' && skillLevels.war_threat > 0) {
                if (u.threatCooldown === undefined) u.threatCooldown = 0;
                u.threatCooldown -= dt * 1000;
                let tbar = document.getElementById(`raid-threat-bar-${idx}`);
                if (tbar) tbar.style.width = Math.max(0, Math.min(100, ((25000 - u.threatCooldown) / 25000) * 100)) + '%';
                
                if (u.threatCooldown <= 0 && !isStunned) {
                    raidState.bossThreatTimer = skillLevels.war_threat * 2;
                    u.threatCooldown += 25000;
                    raidState.vfx.push({ type: 'threat1', x: 150 + (idx * 100), y: 360, timer: 1.0 });
                }
            }
            if (u.cls.type === '도적' && skillLevels.thief_overload > 0) {
                if (u.rtdCooldown === undefined) u.rtdCooldown = 0;
                u.rtdCooldown -= dt * 1000;
                let rtdBar = document.getElementById(`raid-rtd-bar-${idx}`);
                if (rtdBar) rtdBar.style.width = Math.max(0, Math.min(100, ((45000 - u.rtdCooldown) / 45000) * 100)) + '%';

                if (u.rtdCooldown <= 0 && (u.overloadTimer||0) <= 0 && !isStunned) {
                    u.overloadTimer = skillLevels.thief_overload === 5 ? 15 : 6 + (skillLevels.thief_overload * 2);
                    u.rtdCooldown += 45000;
                    raidState.vfx.push({ type: 'rtd', x: 150 + (idx * 100), y: 360, timer: 1.0 });
                }
            }
        }

        if (u.gradeIdx >= 5 && ((u.cls.type === '전사' && (skillLevels.war_death || 0) > 0) || (u.cls.type === '법사' && (skillLevels.mage_thunder || 0) > 0) || (u.cls.type === '도적' && (skillLevels.thief_fuma || 0) > 0))) {
            u.globalCooldown -= dt * 1000;
            let rbar = document.getElementById(`raid-global-bar-${idx}`);
            if (rbar) rbar.style.width = Math.max(0, Math.min(100, ((60000 - u.globalCooldown) / 60000) * 100)) + '%';

            if (u.globalCooldown <= 0 && !isStunned) {
                let baseDmg = (20 + equipStats.flatAtk) * u.grade.mult * cardMulti * rageMulti;
                baseDmg *= (1 - appliedArmor); 
                if (raidState.bossThreatTimer > 0) baseDmg *= 1.3; 

                let gdmg = 0;
                let trueDmg = 0; // 코어용 고정 피해(트루뎀)

                if (u.cls.type === '전사' && (skillLevels.war_death || 0) > 0) { 
                    gdmg = baseDmg * (1.5 + (skillLevels.war_death || 0) * 1.5); 
                    let dLv = window.getCoreLv('war_death'); // ✨ 전사 3번: 데스폴트 코어
                    if (dLv > 0) trueDmg = gdmg * (dLv * 0.02);
                    raidState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg + trueDmg }); 
                }
                else if (u.cls.type === '법사' && (skillLevels.mage_thunder || 0) > 0) { 
                    gdmg = baseDmg * (1.5 + (skillLevels.mage_thunder || 0) * 1.5); 
                    let tLv = window.getCoreLv('mage_thunder'); // ✨ 법사 5번: 썬더 코어
                    if (tLv > 0) trueDmg = gdmg * (tLv * 0.02);
                    raidState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg + trueDmg }); 
                }
                else if (u.cls.type === '도적' && (skillLevels.thief_fuma || 0) > 0) { 
                    gdmg = baseDmg * (1.5 + (skillLevels.thief_fuma || 0) * 1.5); 
                    let fLv = window.getCoreLv('thief_fuma'); // ✨ 도적 9번: 풍마수리검 코어 (처형)
                    if (fLv > 0) {
                        let lostHpPercent = ((raidState.maxHp - raidState.bossHp) / raidState.maxHp) * 100;
                        let ampMultiplier = lostHpPercent * (fLv * 0.0003); // 레벨당 0.03% 증폭
                        gdmg *= (1 + ampMultiplier);
                    }
                    raidState.vfx.push({ type: 'fuma', timer: 0.5 }); 
                }
                
                let totalHit = gdmg + trueDmg;
                if (totalHit > 0 && !isNaN(totalHit)) {
                    raidState.totalDmg += totalHit; raidState.pendingDmg += totalHit;
                    document.getElementById('raid-total-dmg').innerText = Math.round(raidState.totalDmg).toLocaleString();
                    
                    raidState.bossHp = Math.max(0, raidState.bossHp - totalHit);
                    let percent = (raidState.bossHp / raidState.maxHp) * 100;
                    document.getElementById('raid-boss-hp-bar').style.width = `${Math.max(0, percent)}%`;
                    document.getElementById('raid-boss-hp-text').innerText = `${Math.max(0, Math.round(raidState.bossHp)).toLocaleString()} / ${raidState.maxHp.toLocaleString()}`;

                    let ox = (Math.random() - 0.5) * 50; let oy = (Math.random() - 0.5) * 50;
                    raidState.dmgTexts.push({ val: Math.round(totalHit), x: bx + ox, y: by - 80 + oy, timer: 0.8, isCrit: true });
                }
                u.globalCooldown += 60000;
            }
        }

        u.lastAttack -= dt * 1000;
        let attackCd = (1000 * (u.grade.speedMul || 1)) / (localWindReduc * overloadMult);
        while (u.lastAttack <= 0) {
            if (isStunned) { u.lastAttack = 0; break; }
            let dmg = (20 + equipStats.flatAtk) * u.grade.mult * cardMulti * rageMulti; 
            if (raidState.bossThreatTimer > 0) dmg *= 1.3;
            let isCrit = Math.random() < sharpChance; 
            if (isCrit) dmg *= (1.2 + (equipStats.cdmg / 100) + thiefCdmgBonus);
            dmg *= (1 - appliedArmor);

            let isFinal = false; 
            if (u.cls.type === '전사' && (skillLevels.war_final || 0) > 0 && Math.random() < ((skillLevels.war_final || 0) * 0.03)) { 
                isFinal = true; dmg *= 2; 
            }

            // ✨ [코어 적용] 전사 1번: 파이널 어택 코어 (더블 어택 발동)
            if (isFinal) {
                let faLv = window.getCoreLv('war_final');
                if (faLv > 0 && Math.random() < (faLv * 0.02)) {
                    raidState.projectiles.push({ type: u.cls.type, x: 150 + (idx * 100), y: 360, tx: bx, ty: by, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, gradeIdx: u.gradeIdx, isFinal: true }); 
                }
            }

            raidState.projectiles.push({ type: u.cls.type, x: 150 + (idx * 100), y: 360, tx: bx, ty: by, dmg: dmg, color: u.cls.color, angle: 0, isCrit: isCrit, gradeIdx: u.gradeIdx, isFinal: isFinal }); 
            
            // ✨ [코어 적용] 도적 7번: 섀도 파트너 코어 (추가 방관 부여)
            if (u.cls.type === '도적' && (skillLevels.thief_shadow || 0) > 0 && Math.random() < ((skillLevels.thief_shadow || 0) * 0.03)) { 
                let shadowDmg = dmg;
                let spLv = window.getCoreLv('thief_shadow');
                if (spLv > 0) {
                    let extraPen = spLv * 0.02; // 레벨당 2% 방관 추가
                    let newArmor = 0.50 * Math.max(0, myUnpen - extraPen); 
                    shadowDmg = (dmg / (1 - appliedArmor)) * (1 - newArmor); // 깎인 방어력만큼 데미지 복구
                }
                raidState.projectiles.push({ type: u.cls.type, x: 150 + (idx * 100), y: 360, tx: bx, ty: by, dmg: shadowDmg, color: u.cls.color, angle: 0, isCrit: isCrit, gradeIdx: u.gradeIdx, isShadow: true }); 
            }
            u.lastAttack += attackCd;
        }
    });

    for (let i = raidState.projectiles.length - 1; i >= 0; i--) {
        let p = raidState.projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 600 * dt;
        if (dist <= speed) {
            if (!isNaN(p.dmg)) {
                raidState.totalDmg += p.dmg; raidState.pendingDmg += p.dmg; 
                document.getElementById('raid-total-dmg').innerText = Math.round(raidState.totalDmg).toLocaleString();
                
                raidState.bossHp = Math.max(0, raidState.bossHp - p.dmg);
                let percent = (raidState.bossHp / raidState.maxHp) * 100;
                document.getElementById('raid-boss-hp-bar').style.width = `${Math.max(0, percent)}%`;
                document.getElementById('raid-boss-hp-text').innerText = `${Math.max(0, Math.round(raidState.bossHp)).toLocaleString()} / ${raidState.maxHp.toLocaleString()}`;

                let ox = (Math.random() - 0.5) * 50; let oy = (Math.random() - 0.5) * 50; 
                raidState.dmgTexts.push({ val: Math.round(p.dmg), x: bx + ox, y: by + oy - 80, timer: 0.6, isCrit: p.isCrit });
            }
            raidState.projectiles.splice(i, 1);
        } else { 
            let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; 
            p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; 
        }
    }
    for (let i = raidState.dmgTexts.length - 1; i >= 0; i--) { raidState.dmgTexts[i].timer -= dtReal; raidState.dmgTexts[i].y -= dtReal * 60; if (raidState.dmgTexts[i].timer <= 0) raidState.dmgTexts.splice(i, 1); }
    for (let i = raidState.vfx.length - 1; i >= 0; i--) { raidState.vfx[i].timer -= dt; if (raidState.vfx[i].timer <= 0) { raidState.vfx.splice(i, 1); } }
    drawRaid(); raidReqId = requestAnimationFrame(raidLoop);
}

function drawRaid() {
    let canvas = document.getElementById('raidCanvas'); let ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    raidState.vfx.forEach(v => { 
        if (v.type === 'fuma') { 
            ctx.save(); ctx.translate(250, 150); ctx.rotate((0.5 - v.timer) * 30); if (fumaImg && fumaImg.complete) { let fsize = 80; ctx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); } ctx.restore(); 
        } else if (v.type === 'heal' && healEffectImg.complete) {
            ctx.save(); ctx.translate(v.x, v.y); let hSize = 50; let progress = 1 - (v.timer / 1.0); ctx.beginPath();
            if (progress < 0.5) { let p2 = progress * 2; ctx.rect(-hSize/2, hSize/2 - hSize*p2 - 25, hSize, hSize*p2); } 
            else { let p2 = (progress - 0.5) * 2; ctx.rect(-hSize/2, -hSize/2 + hSize*p2 - 25, hSize, hSize*(1-p2)); }
            ctx.clip(); ctx.drawImage(healEffectImg, -hSize/2, -hSize/2 - 25, hSize, hSize); ctx.restore();
        } else if (v.type === 'threat1' && threatEffect1Img.complete) {
            ctx.save(); ctx.translate(v.x, v.y); ctx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); ctx.drawImage(threatEffect1Img, -25, -60, 50, 50); ctx.restore();
        } else if (v.type === 'rtd' && rtdEffectImg.complete) {
            ctx.save(); ctx.translate(v.x, v.y); ctx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); ctx.drawImage(rtdEffectImg, -30, -70, 60, 60); ctx.restore();
        } else {
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
        }
    });

    raidState.projectiles.forEach(p => { 
        ctx.save(); ctx.translate(p.x, p.y); 
        let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let scale = 1.0; if (p.isFinal) scale *= 1.3; ctx.scale(scale, scale); if (p.isShadow) ctx.globalAlpha = 0.5;
        let img = null; let psize = 20;
        if (p.type === '전사') { img = p.gradeIdx >= 5 ? projImages.warrior2 : projImages.warrior1; ctx.rotate(dir + Math.PI); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '법사') { img = p.gradeIdx >= 5 ? projImages.mage2 : projImages.mage1; ctx.rotate(dir + (15 * Math.PI / 180)); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '도적') { img = p.gradeIdx >= 5 ? projImages.rogue2 : projImages.rogue1; ctx.rotate(p.angle); }
        if (img && img.complete) { ctx.drawImage(img, -psize/2, -psize/2, psize, psize); } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.gradeIdx >= 5 ? 8 : 5, 0, Math.PI*2); ctx.fill(); }
        ctx.restore(); 
    });
    
    if (raidState.bossThreatTimer > 0) {
        if (threatEffect2Img && threatEffect2Img.complete) {
            ctx.drawImage(threatEffect2Img, 230, 20, 40, 40); 
        } else {
            ctx.font = "bold 24px Arial"; ctx.fillStyle = "#ff1744"; ctx.textAlign = "center"; ctx.fillText("💢", 250, 40); 
        }
    }

    raidState.units.forEach((u, idx) => {
        if (u && u.unitStunTimer > 0) {
            let ux = 150 + (idx * 100); let uy = 360;
            ctx.font = "bold 20px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", ux, uy - 40);
        }
    });

    if (raidState.units.some(u => u && u.cls.type === '전사')) {
        let hasStun = raidState.projectiles.some(p => p.type === '전사' && p.isFinal); 
        if (hasStun) {
            ctx.font = "bold 18px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", 250, 100);
        }
    }

    raidState.dmgTexts.forEach(d => { 
        ctx.save(); ctx.globalAlpha = Math.max(0, d.timer / 0.6); 
        ctx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; 
        ctx.font = d.isCrit ? "800 24px NanumSquare" : "bold 18px NanumSquare"; 
        ctx.shadowColor = d.isCrit ? "#c62828" : "#000"; ctx.shadowBlur = 4; 
        ctx.fillText(d.val, d.x - 20, d.y); ctx.restore(); 
    });
}

function endRaidGame() {
    if (!raidState.active) return; 
    raidState.active = false; 
    cancelAnimationFrame(raidReqId);

    let percent = (raidState.totalDmg / raidState.maxHp) * 100; 
    let rewardTier = '';
    if (percent <= 5) rewardTier = '브론즈'; 
    else if (percent <= 10) rewardTier = '실버'; 
    else if (percent <= 20) rewardTier = '골드'; 
    else if (percent <= 30) rewardTier = '플래티넘'; 
    else if (percent <= 50) rewardTier = '다이아몬드'; 
    else rewardTier = '챌린저';
    
    let rewardMsg = ""; 
    if (!userInventory.boxes) userInventory.boxes = {};
    
    if (raidState.gotLastHit) { 
        userInventory.boxes['챌린저'] = (userInventory.boxes['챌린저'] || 0) + 1; 
        rewardMsg = `🎁 막타 보상: 챌린저 상자 1개 (기여도 보상 대체)`; 
    } else { 
        userInventory.boxes[rewardTier] = (userInventory.boxes[rewardTier] || 0) + 1; 
        rewardMsg = `🎁 기여도 보상: ${rewardTier} 상자 1개 지급 완료!`; 
    }

    document.getElementById('raid-result-dmg').innerText = Math.round(raidState.totalDmg || 0).toLocaleString(); 
    document.getElementById('raid-result-percent').innerText = (percent || 0).toFixed(2) + "%"; 
    document.getElementById('raid-result-rewards').innerText = rewardMsg;
    document.getElementById('raid-result-overlay').style.display = 'block'; 
    document.getElementById('raid-result-modal').style.display = 'block';

    window.syncToCloud();
    
    if (currentUserUid) {
        let myRankRef = ref(database, `worldBoss_rankings/${currentUserUid}`);
        runTransaction(myRankRef, (rankData) => {
            let accDmg = (typeof raidState.totalDmg === 'number' && !isNaN(raidState.totalDmg)) ? raidState.totalDmg : 0;
            if (rankData && typeof rankData.damage === 'number' && !isNaN(rankData.damage)) {
                accDmg += rankData.damage;
            }
            return {
                nickname: currentUserName,
                damage: Math.round(accDmg),
                date: new Date().toLocaleDateString()
            };
        }).then(() => {
            if (raidState.gotLastHit) {
                window.distributeBossRankRewards();
            }
        }).catch(e => console.warn("랭킹 저장 오류:", e));
    }

    if (raidState.pendingDmg > 0 && !isNaN(raidState.pendingDmg)) {
        let dmgToApply = raidState.pendingDmg; 
        raidState.pendingDmg = 0;
        runTransaction(ref(database, 'worldBoss'), (data) => {
            let bossData = data;
            if (typeof bossData === 'number') bossData = { hp: bossData, maxHp: 15000000, killCount: 0, lastKillerUid: null };
            if (!bossData || typeof bossData !== 'object') bossData = { hp: 15000000, maxHp: 15000000, killCount: 0, lastKillerUid: null };
            
            let currentMax = bossData.maxHp || 15000000;
            if (typeof bossData.hp !== 'number' || isNaN(bossData.hp)) bossData.hp = currentMax;
            let dmg = (typeof dmgToApply === 'number' && !isNaN(dmgToApply)) ? Math.round(dmgToApply) : 0;
            
            bossData.hp -= dmg;
            if (bossData.hp <= 0) { 
                bossData.killCount = (bossData.killCount || 0) + 1; 
                let nextMaxHp = Math.floor(15000000 * Math.pow(1.1, bossData.killCount));
                bossData.maxHp = nextMaxHp;
                bossData.hp = nextMaxHp; 
                bossData.lastKillerUid = currentUserUid; 
            }
            return bossData;
        }).catch(e => console.warn("잔여 데미지 전송 오류:", e));
    }
}

window.closeRaidResult = () => { 
    raidState.status = 'TITLE';
    document.getElementById('raid-result-overlay').style.display = 'none'; 
    document.getElementById('raid-result-modal').style.display = 'none'; 
    window.switchScreen('start-screen'); 
};

// ==========================================
// 8. 랭크 게임 (AI 대전) 시스템
// ==========================================
window.openOnlineMenu = () => { 
    if (!currentUserUid) { window.showMessage("로그인이 필요한 서비스입니다."); return; } 
    document.getElementById('online-overlay').style.display = 'flex'; 
    document.getElementById('online-menu-modal').style.display = 'block'; 
    
    // 🔥 무릉도장 팝업이 켜져있다면 강제로 꺼줌 (겹침 버그 방지)
    let mlLobby = document.getElementById('mulung-lobby-modal');
    if (mlLobby) mlLobby.style.display = 'none';
};
window.closeOnlineMenu = () => { document.getElementById('online-overlay').style.display = 'none'; };
window.openPkMenuFromOnline = () => { window.closeOnlineMenu(); window.openPkMenu(); };
window.openRankLobbyFromOnline = () => { window.closeOnlineMenu(); window.openRankLobby(); };

window.openRankLobby = () => { let today = new Date().toLocaleDateString(); let lastDate = localStorage.getItem('mapleDefenseRankDate'); let playCount = parseInt(localStorage.getItem('mapleDefenseRankCount')) || 0; if (lastDate !== today) { playCount = 0; localStorage.setItem('mapleDefenseRankDate', today); localStorage.setItem('mapleDefenseRankCount', 0); } document.getElementById('ui-rank-remains').innerText = `${Math.max(0, 10 - playCount)} / 10`; document.getElementById('rank-overlay').style.display = 'flex'; document.getElementById('rank-lobby-modal').style.display = 'block'; document.getElementById('ui-rank-rp').innerText = userRankData.rp + " 점"; document.getElementById('ui-rank-money').innerText = userRankData.rankMoney + " 원"; };
window.closeRankMenu = () => { document.getElementById('rank-overlay').style.display = 'none'; window.openOnlineMenu(); };

window.openRankShop = () => { document.getElementById('ui-shop-rank-money').innerText = userRankData.rankMoney; let starUi = document.getElementById('ui-shop-star-pieces'); if (starUi) starUi.innerText = userInventory.starPieces || 0; document.getElementById('rank-lobby-modal').style.display = 'none'; document.getElementById('rank-shop-modal').style.display = 'block'; };
window.closeRankShop = () => { document.getElementById('rank-shop-modal').style.display = 'none'; document.getElementById('rank-lobby-modal').style.display = 'block'; };

window.buyMonsterPiece = () => { if (userRankData.rankMoney >= 100) { userRankData.rankMoney -= 100; userInventory.coinPieces += 1; document.getElementById('ui-shop-rank-money').innerText = userRankData.rankMoney; document.getElementById('ui-shop-pieces').innerText = userInventory.coinPieces; document.getElementById('ui-rank-money').innerText = userRankData.rankMoney + " 원"; if (currentUserUid) window.syncToCloud(); window.showMessage("코인 조각 1개 구매 완료!"); } else { window.showMessage("랭크 머니가 부족합니다."); } };
window.buyStarPiece = () => { if (userRankData.rankMoney >= 50) { userRankData.rankMoney -= 50; userInventory.starPieces = (userInventory.starPieces || 0) + 1; document.getElementById('ui-shop-rank-money').innerText = userRankData.rankMoney; let starUi = document.getElementById('ui-shop-star-pieces'); if (starUi) starUi.innerText = userInventory.starPieces; document.getElementById('ui-rank-money').innerText = userRankData.rankMoney + " 원"; if (currentUserUid) window.syncToCloud(); window.showMessage("별의 기운 1개 구매 완료!"); } else { window.showMessage("랭크 머니가 부족합니다. (50원 필요)"); } };

function showMatchIntro(oppName, oppRp, callback) { 
    let intro = document.getElementById('match-intro-overlay'); 
    document.getElementById('intro-player').innerText = `${currentUserName} (${userRankData.rp} RP)`; 
    document.getElementById('intro-opp').innerText = `${oppName} (${oppRp} RP)`; 
    
    // 🔥 화면을 띄우고 서서히 나타나게 함 (Fade-in)
    intro.style.display = 'flex'; 
    void intro.offsetWidth; 
    intro.style.opacity = '1'; 
    
    // 🔥 5초(5000ms) 대기 후 Fade-out
    setTimeout(() => { 
        intro.style.opacity = '0'; 
        setTimeout(() => { 
            intro.style.display = 'none'; 
            callback(); 
        }, 500); 
    }, 5000);  
}

window.startRankMatchmaking = async () => {
    let playCount = parseInt(localStorage.getItem('mapleDefenseRankCount')) || 0; if (playCount >= 10) { window.showMessage("오늘의 랭크 게임 제한 횟수를 모두 소진했습니다!"); return; }
    document.getElementById('rank-lobby-modal').style.display = 'none'; document.getElementById('rank-waiting-modal').style.display = 'block';
    let oppName = "의문의 용사 (AI)"; let oppRp = userRankData.rp + Math.floor(Math.random() * 40 - 20); oppCardData = {}; oppSkillLevels = { ...DEFAULT_SKILLS }; oppEquipStats = { atk: 0, spd: 0, crit: 0, cdmg: 0, pen: 0, flatAtk: 0, unpenetratedRate: 1.0 }; 
    try { 
        const snap = await get(child(ref(database), `users`)); 
        if (snap.exists()) { 
            let users = []; snap.forEach(c => { let v = c.val(); if (v.cloudData && v.nickname && c.key !== currentUserUid) { let diff = Math.abs((parseInt(v.cloudData.rp)||1000) - userRankData.rp); users.push({ ...v, diff: diff }); } }); users.sort((a,b) => a.diff - b.diff); 
            if(users.length > 0) { 
                let aiUser = users[Math.floor(Math.random() * Math.min(3, users.length))]; oppName = aiUser.nickname + " (AI)"; oppRp = parseInt(aiUser.cloudData.rp) || 1000; 
                if(aiUser.cloudData.cards) oppCardData = JSON.parse(aiUser.cloudData.cards); 
                if(aiUser.cloudData.skills) oppSkillLevels = { ...DEFAULT_SKILLS, ...JSON.parse(aiUser.cloudData.skills) }; 
                if(aiUser.cloudData.equipped) { 
                    ['뱃지', '엠블럼', '링'].forEach(slot => { 
                        let item = aiUser.cloudData.equipped[slot]; 
                        if (item) { 
                            if (item.options) {
                                item.options.forEach(o => {
                                    if(o.type==='atk') oppEquipStats.atk += o.value;
                                    else if(o.type==='spd') oppEquipStats.spd += o.value;
                                    else if(o.type==='crit') oppEquipStats.crit += o.value;
                                    else if(o.type==='cdmg') oppEquipStats.cdmg += o.value;
                                    else if(o.type==='pen') oppEquipStats.unpenetratedRate *= (1 - (o.value / 100));
                                });
                            } else {
                                oppEquipStats.atk += item.atk || 0; oppEquipStats.spd += item.spd || 0; oppEquipStats.crit += item.crit || 0; 
                            }
                            let star = item.star || 0; if (star > 0) { let perStar = STARFORCE_BONUS[item.grade] || 0; oppEquipStats.flatAtk += star * perStar; } 
                        } 
                    }); 
                }
            } 
        } 
    } catch(e) { console.log("AI Load Failed"); }
    setTimeout(() => { document.getElementById('rank-waiting-modal').style.display = 'none'; playCount++; localStorage.setItem('mapleDefenseRankCount', playCount); showMatchIntro(oppName, oppRp, () => { enterRankGameAI(oppName, oppRp); }); }, 1500);
};

function enterRankGameAI(oppName, oppRp) {
    document.getElementById('rank-overlay').style.display = 'none'; 
    rankState = { active: true, blockWinner: {}, myBossDamage: 0 };
    setGridMode('RANK');
    
    state = { status: 'PREP', meso: 50, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 5, speed: 15, isBoss: false, upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} }, tickets: [], isRank: true };
    monsters = []; projectiles = []; towers = []; hitEffects = []; visualEffects = []; fumaList = []; damageTexts = []; waveTimer = 0; spawnTimer = 0; selectedUnitIdx = -1;
    oppState = { wave: 1, meso: 50, isDead: false, isBoss: false }; oppMonsters = []; oppProjectiles = []; oppTowers = []; oppVisualEffects = []; oppFumaList = []; oppDamageTexts = []; oppWaveTimer = 0; oppSpawnTimer = 0;
    
    renderGrid(); window.switchScreen('game-container'); document.getElementById('btn-speed').style.display = 'none'; document.getElementById('btn-exit').style.display = 'none'; let surrenderBtn = document.getElementById('btn-rank-surrender'); if (surrenderBtn) surrenderBtn.style.display = 'block'; document.getElementById('opp-board-wrapper').style.display = 'flex'; document.getElementById('opp-name').innerText = oppName; document.getElementById('opp-wave').innerText = '1'; document.getElementById('opp-mobs').innerText = '0'; document.getElementById('best-wave-container').style.display = 'none'; lastTime = performance.now(); cancelAnimationFrame(mainReqId); window.updateUI(); mainReqId = requestAnimationFrame(window.loop);
}

window.surrenderRankGame = () => { if (confirm("정말로 항복하시겠습니까? (즉시 패배 처리됩니다)")) { handleRankGameOver("항복했습니다."); } };

function processOpponentTick(dt) {
    if(oppState.isDead) return; oppWaveTimer += dt; oppSpawnTimer += dt; let limit = oppState.isBoss ? 150 : 60; 
    if(oppWaveTimer >= limit) { 
        if(oppState.isBoss && oppMonsters.some(m => m.isBoss)) { oppState.isDead = true; state.status = 'GAMEOVER'; processRankResult('WIN', '상대방이 보스 사냥에 실패했습니다!'); return; }
        oppState.wave++; oppWaveTimer = 0; oppSpawnTimer = 0; let bInfo = getBossInfo(oppState.wave); oppState.isBoss = !!bInfo;
        if(oppState.isBoss) { let hpBase = bInfo.hp; oppMonsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: bInfo.name, facingRight: true, threatTimer: 0, counterTimer: 5 }); }
    } else if(!oppState.isBoss && oppSpawnTimer >= 1.5) { 
        let hpBase = Math.floor(oppState.wave * 60 + Math.pow(oppState.wave, 1.5) * 12); oppMonsters.push({ hp: hpBase, maxHp: hpBase, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 50, isBoss: false, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: null, facingRight: true, threatTimer: 0, counterTimer: 5 }); oppSpawnTimer = 0; 
    }
    
    for (let i = oppVisualEffects.length - 1; i >= 0; i--) { 
        oppVisualEffects[i].timer -= dt; 
        if (oppVisualEffects[i].timer <= 0) { 
            let v = oppVisualEffects[i]; 
            if (v.type === 'death' || v.type === 'thunder') {
                oppMonsters.forEach(m => {
                    let armor = 0;
                    if (m.isBoss) {
                        if (oppState.wave >= 310) armor = 0.50;
                        else if (oppState.wave >= 210) armor = 0.30;
                        else if (oppState.wave >= 160) armor = 0.10;
                    }
                    let unpen = oppEquipStats.unpenetratedRate;
                    if (m.threatTimer > 0) unpen *= 0.9;
                    let actualDmg = v.dmg * (1 - (armor * unpen));
                    if (m.threatTimer > 0) actualDmg *= 1.3;
                    m.hp -= actualDmg;
                });
            }
            oppVisualEffects.splice(i, 1); 
        } 
    }
    
    for (let i = oppDamageTexts.length - 1; i >= 0; i--) { oppDamageTexts[i].timer -= dt; oppDamageTexts[i].y -= dt * 30; if (oppDamageTexts[i].timer <= 0) oppDamageTexts.splice(i, 1); }
    
    for(let i=oppMonsters.length-1; i>=0; i--) {
        let m = oppMonsters[i];
        if (m.freezeTimer > 0) { m.freezeTimer -= dt; m.freezeTickTimer -= dt; if (m.freezeTickTimer <= 0) { m.hp -= m.freezeDmgVal; m.freezeTickTimer = 1; } }
        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; } if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }
        if (m.threatTimer > 0) { m.threatTimer -= dt; }

        let t = currentPath[m.targetNode]; let dx = t.x - m.x, dy = t.y - m.y; let dist = Math.hypot(dx, dy); let currentSpeed = m.speed; if (m.freezeTimer > 0) currentSpeed *= 0.5; let move = currentSpeed * dt;
        if (dx > 0) m.facingRight = true; else if (dx < 0) m.facingRight = false;
        if(dist <= move) { m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % currentPath.length; } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    
    if(oppMonsters.length >= 25) { oppState.isDead = true; state.status = 'GAMEOVER'; processRankResult('WIN', '상대방의 몹이 25마리 쌓여 패배했습니다!'); return; }
    
    let oppCardBonus = 0; for(let k in oppCardData) { if(oppCardData[k].grade > 0) oppCardBonus += 1 + (oppCardData[k].grade - 1) * 0.5; }
    let cardMulti = 1 + (oppCardBonus / 100); let rageMulti = 1 + ((oppSkillLevels.common_rage || 0) * 0.01) + (oppEquipStats.atk * 0.01); let sharpChance = ((oppSkillLevels.common_sharp || 0) * 0.05) + (oppEquipStats.crit * 0.01); let windReduc = 1 + ((oppSkillLevels.common_wind || 0) * 0.2) + (oppEquipStats.spd * 0.01);
    
    oppTowers.forEach(t => {
        if (t.gradeIdx >= 6) {
            if (t.cls.type === '법사' && oppSkillLevels.mage_heal > 0) {
                if (t.healCooldown === undefined) t.healCooldown = 0;
                t.healCooldown -= dt * 1000;
                let maxHealCd = (70 - oppSkillLevels.mage_heal * 10) * 1000;
                if (t.healCooldown <= 0) {
                    let gridWidth = 5; let tCol = t.idx % gridWidth; let tRow = Math.floor(t.idx / gridWidth);
                    let injured = oppTowers.filter(u => {
                        if (u.hp >= u.maxHp) return false;
                        let uCol = u.idx % gridWidth; let uRow = Math.floor(u.idx / gridWidth);
                        return Math.abs(uCol - tCol) <= 1 && Math.abs(uRow - tRow) <= 1;
                    });
                    if (injured.length > 0) {
                        injured.forEach(u => { u.hp = Math.min(u.maxHp, u.hp + 1); oppVisualEffects.push({ type: 'heal', x: u.x, y: u.y, timer: 1.0 }); });
                        t.healCooldown += maxHealCd;
                        oppVisualEffects.push({ type: 'heal', x: t.x, y: t.y, timer: 1.0 });
                    } else { t.healCooldown = 0; }
                }
            }
        }

        if (t.gradeIdx >= 7) {
            if (t.cls.type === '전사' && oppSkillLevels.war_threat > 0) {
                if (t.threatCooldown === undefined) t.threatCooldown = 0;
                t.threatCooldown -= dt * 1000;
                if (t.threatCooldown <= 0 && oppMonsters.length > 0) {
                    oppMonsters[0].threatTimer = oppSkillLevels.war_threat * 2;
                    t.threatCooldown += 25000;
                    oppVisualEffects.push({ type: 'threat1', x: t.x, y: t.y, timer: 1.0 });
                }
            }
            if (t.cls.type === '도적' && oppSkillLevels.thief_overload > 0) {
                if (t.rtdCooldown === undefined) t.rtdCooldown = 0;
                t.rtdCooldown -= dt * 1000;
                if (t.rtdCooldown <= 0 && (t.overloadTimer || 0) <= 0 && (t.unitStunTimer || 0) <= 0) {
                    t.overloadTimer = oppSkillLevels.thief_overload === 5 ? 15 : 6 + (oppSkillLevels.thief_overload * 2);
                    t.rtdCooldown += 45000;
                    oppVisualEffects.push({ type: 'rtd', x: t.x, y: t.y, timer: 1.0 });
                }
            }
        }

        let overloadMult = 1;
        if (t.overloadTimer > 0) {
            t.overloadTimer -= dt;
            overloadMult = 2;
            if (t.overloadTimer <= 0) t.unitStunTimer = oppSkillLevels.thief_overload === 1 ? 6 : 5;
        }

        if (t.unitStunTimer > 0) {
            t.unitStunTimer -= dt;
            return;
        }

        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && oppSkillLevels.war_death > 0) || (t.cls.type === '법사' && oppSkillLevels.mage_thunder > 0) || (t.cls.type === '도적' && oppSkillLevels.thief_fuma > 0)) {
                t.globalCooldown -= dt * 1000;
                if (t.globalCooldown <= 0) {
                    if (oppMonsters.length > 0) {
                        let baseDmg = (t.cls.baseDmg + oppEquipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti;
                        if (t.cls.type === '전사' && oppSkillLevels.war_death > 0) { let gdmg = baseDmg * (1.5 + oppSkillLevels.war_death * 1.5); oppVisualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '법사' && oppSkillLevels.mage_thunder > 0) { let gdmg = baseDmg * (1.5 + oppSkillLevels.mage_thunder * 1.5); oppVisualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '도적' && oppSkillLevels.thief_fuma > 0) { let gdmg = baseDmg * (1.5 + oppSkillLevels.thief_fuma * 1.5); oppFumaList.push({ x: t.x, y: t.y, targetNode: 0, nodesVisited: 0, dmg: gdmg, hitSet: new Set(), angle: 0 }); t.globalCooldown += 60000; }
                    } else {
                        t.globalCooldown = 0;
                    }
                }
            }
        }
        t.lastAttack -= dt * 1000; let attackCd = (t.cls.cd * (t.grade.speedMul || 1)) / (windReduc * overloadMult);
        while(t.lastAttack <= 0) {
            let range = t.cls.range * t.grade.rangeMul; let target = null;
            for(let m of oppMonsters) { if(Math.hypot(m.x - t.x, m.y - t.y) <= range) { target = m; break; } }
            if(target) {
                let dmg = (t.cls.baseDmg + oppEquipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti; 
                if (target.threatTimer > 0) dmg *= 1.3;
                let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= (1.2 + (oppEquipStats.cdmg / 100)); 
                let isFinal = false; if (t.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < getSkillValue('war_final', skillLevels.war_final)) { isFinal = true; dmg *= 2; }
                oppProjectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg });
                if (t.cls.type === '도적' && oppSkillLevels.thief_shadow > 0 && Math.random() < (oppSkillLevels.thief_shadow * 0.03)) { oppProjectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true }); }
                t.lastAttack += attackCd;
            } else {
                t.lastAttack = 0;
                break;
            }
        }
    });

    for(let i=oppFumaList.length-1; i>=0; i--) {
        let f = oppFumaList[i]; f.angle += 15 * dt; let t_node = currentPath[f.targetNode]; let dx = t_node.x - f.x, dy = t_node.y - f.y; let dist = Math.hypot(dx, dy); let move = 300 * dt; 
        oppMonsters.forEach(m => { 
            if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 50) { 
                let armor = 0;
                if (m.isBoss) {
                    if (oppState.wave >= 310) armor = 0.50;
                    else if (oppState.wave >= 210) armor = 0.30;
                    else if (oppState.wave >= 160) armor = 0.10;
                }
                let unpen = oppEquipStats.unpenetratedRate;
                if (m.threatTimer > 0) unpen *= 0.9;
                let actualDmg = f.dmg * (1 - (armor * unpen));
                if (m.threatTimer > 0) actualDmg *= 1.3;
                
                m.hp -= actualDmg; 
                f.hitSet.add(m); 
            } 
        });
        if(dist <= move) { f.x = t_node.x; f.y = t_node.y; f.targetNode++; f.nodesVisited++; if (f.targetNode >= currentPath.length) f.targetNode = 0; if (f.nodesVisited > currentPath.length) oppFumaList.splice(i, 1); } else { f.x += (dx/dist)*move; f.y += (dy/dist)*move; }
    }
    for(let i=oppProjectiles.length-1; i>=0; i--) {
        let p = oppProjectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt; if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            if (p.gradeIdx >= 6) { oppVisualEffects.push({ type: 'hit', x: p.tx, y: p.ty, timer: 0.2, color: p.color }); }
            if(oppMonsters.includes(p.target)) {
                let hitDmg = p.dmg; if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5; 
                
                let bossArmor = 0;
                if (p.target.isBoss) {
                    if (oppState.wave >= 310) bossArmor = 0.50;
                    else if (oppState.wave >= 210) bossArmor = 0.30;
                    else if (oppState.wave >= 160) bossArmor = 0.10;
                }
                let myUnpen = oppEquipStats.unpenetratedRate;
                if (p.target.threatTimer > 0) myUnpen *= 0.9;
                let appliedArmor = bossArmor * myUnpen;
                hitDmg *= (1 - appliedArmor);

                p.target.hp -= hitDmg;
                if (p.isCrit) oppDamageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 35, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                if (p.type === '법사' && oppSkillLevels.mage_freeze > 0 && Math.random() < ((10 + oppSkillLevels.mage_freeze * 2) / 100)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][oppSkillLevels.mage_freeze - 1]; } }
            }
            if(p.splash > 0) {
                oppMonsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg; if (p.type === '전사' && m.isBoss) splashDmg *= 1.5; 
                        
                        let bossArmor = 0;
                        if (m.isBoss) {
                            if (oppState.wave >= 310) bossArmor = 0.50;
                            else if (oppState.wave >= 210) bossArmor = 0.30;
                            else if (oppState.wave >= 160) bossArmor = 0.10;
                        }
                        let myUnpen = oppEquipStats.unpenetratedRate;
                        if (m.threatTimer > 0) myUnpen *= 0.9;
                        let appliedArmor = bossArmor * myUnpen;
                        splashDmg *= (1 - appliedArmor);

                        m.hp -= splashDmg;
                        if (p.isCrit) oppDamageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 35, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && oppSkillLevels.mage_freeze > 0 && Math.random() < ((10 + oppSkillLevels.mage_freeze * 2) / 100)) { if (m.freezeTimer <= 0) { m.freezeTimer = 3; m.freezeTickTimer = 1; m.freezeDmgVal = p.baseDmgToPass * [0.02, 0.03, 0.03, 0.04, 0.05][oppSkillLevels.mage_freeze - 1]; } }
                    }
                });
            }
            oppProjectiles.splice(i, 1);
        } else { let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; }
    }
    
    for(let i=oppMonsters.length-1; i>=0; i--) { 
        if(oppMonsters[i].hp <= 0) {
            oppMonsters.splice(i, 1); 
        } 
    }
    
    if (oppMonsters.length === 0) {
        let oppClearedBlock = 0;
        if (oppState.wave % 10 === 0 && oppWaveTimer >= 58.5) {
            oppClearedBlock = oppState.wave / 10;
        } else if (oppState.wave % 10 !== 0) {
            oppClearedBlock = Math.floor((oppState.wave - 1) / 10);
        }

        if (oppClearedBlock > 0) {
            if (!rankState.blockWinner) rankState.blockWinner = {};
            if (!rankState.blockWinner[oppClearedBlock]) {
                rankState.blockWinner[oppClearedBlock] = 'opp'; 
                let wolfHp = Math.floor(100000 * Math.pow(1.5, oppClearedBlock)); 
                monsters.push({ hp: wolfHp, maxHp: wolfHp, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: "어둠의 늑대", facingRight: true, threatTimer: 0, counterTimer: 5 });
                window.showMessage(`☠️ 상대방이 ${oppClearedBlock * 10}웨이브를 먼저 클리어하여 늑대가 난입했습니다!`);
            }
        }
    }
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
            let ranks = []; snap.forEach(c => { let v = c.val(); if(typeof v.score === 'number') ranks.push(v); }); 
            ranks.sort((a, b) => b.score - a.score); ranks = ranks.slice(0, 10); list.innerHTML = '';
            ranks.forEach((entry, idx) => { let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:6px 10px; border-radius:4px; color:${color}; font-weight:bold;"><span>${idx + 1}. ${entry.nickname} <span style="font-size:10px; color:#aaa;">(${entry.class})</span></span><span>${entry.score.toLocaleString()}점</span></div>`; });
        } else { list.innerHTML = '<div style="text-align:center; color:#ccc;">아직 등록된 랭킹이 없습니다.</div>'; }
    } catch(e) { list.innerHTML = '<div style="text-align:center; color:#ff5252;">랭킹 서버 연결 실패.</div>'; }
};

window.openPkMenu = () => { document.getElementById('pk-overlay').style.display = 'flex'; document.getElementById('pk-menu').style.display = 'block'; document.getElementById('pk-class-select').style.display = 'none'; document.getElementById('pk-ranking').style.display = 'none'; document.getElementById('pk-result-modal').style.display = 'none'; document.getElementById('pk-result-overlay').style.display = 'none'; };
window.closePk = () => { document.getElementById('pk-overlay').style.display = 'none'; pkState.active = false; cancelAnimationFrame(pkReqId); window.openOnlineMenu(); };
window.showPkClassSelect = () => { if (!currentUserUid) { window.showMessage("로그인이 필요한 서비스입니다."); return; } document.getElementById('pk-menu').style.display = 'none'; document.getElementById('pk-class-select').style.display = 'block'; };

window.showPkRanking = async () => {
    document.getElementById('pk-menu').style.display = 'none'; document.getElementById('pk-class-select').style.display = 'none'; document.getElementById('pk-overlay').style.display = 'flex'; document.getElementById('pk-ranking').style.display = 'flex';
    let list = document.getElementById('pk-ranking-list'); list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">서버에서 랭킹을 불러오는 중...</div>';
    try {
        const snap = await get(child(ref(database), `pk_rankings`));
        if (snap.exists()) {
            let ranks = []; snap.forEach(c => { let v = c.val(); if(typeof v.score === 'number') ranks.push(v); }); 
            ranks.sort((a, b) => b.score - a.score); ranks = ranks.slice(0, 10); list.innerHTML = '';
            ranks.forEach((entry, idx) => { let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; color:${color}; font-weight:bold;"><span>${idx + 1}위 - ${entry.nickname} (${entry.class})</span><span>${entry.score.toLocaleString()}점 <span style="font-size:10px; color:#aaa;">(${entry.date})</span></span></div>`; });
        } else list.innerHTML = '<div style="text-align:center; padding:20px; color:#fff;">아직 등록된 랭킹이 없습니다.</div>';
    } catch(e) { list.innerHTML = '<div style="text-align:center; color:#ff5252;">랭킹 서버 연결 실패.</div>'; }
};
window.togglePkSpeed = () => { if (pkState.speed === 1) pkState.speed = 10; else if (pkState.speed === 10) pkState.speed = 15; else pkState.speed = 1; document.getElementById('pk-btn-speed').innerText = pkState.speed + "배속"; };

window.startPkGame = async (clsName) => {
    document.getElementById('pk-overlay').style.display = 'none'; window.switchScreen('pk-game'); window.loadPkLiveRanking();
    let grade = GRADES[8]; let cls = CLASSES[clsName]; document.getElementById('pk-unit-icon').innerText = cls.icon; document.getElementById('pk-unit-name').style.color = cls.color;
    let bestScore = 0; if (currentUserUid) { try { let snap = await get(child(ref(database), `pk_rankings/${currentUserUid}`)); if(snap.exists()) bestScore = snap.val().score; } catch(e) {} }
    
    // 🔥 펀치킹 제네시스 스킬(위협, 힐, 레투다) 쿨타임 바 동적 생성
    let pkBarContainer = document.getElementById('pk-global-bar-container');
    if (pkBarContainer) {
        pkBarContainer.innerHTML = '';
        pkBarContainer.style.display = 'flex';
        pkBarContainer.style.flexDirection = 'column';
        pkBarContainer.style.gap = '3px';

        if ((cls.type === '전사' && skillLevels.war_death > 0) || (cls.type === '법사' && skillLevels.mage_thunder > 0) || (cls.type === '도적' && skillLevels.thief_fuma > 0)) { 
            let color = cls.type === '전사' ? '#ffeb3b' : (cls.type === '법사' ? '#00e5ff' : '#ab47bc'); 
            pkBarContainer.innerHTML += `<div style="width:100%; height:6px; background:#333; border:1px solid #111; border-radius:3px; overflow:hidden;"><div id="pk-global-bar" style="width:0%; height:100%; background:${color};"></div></div>`;
        }
        if (cls.type === '법사' && skillLevels.mage_heal > 0) {
            pkBarContainer.innerHTML += `<div style="width:100%; height:6px; background:#333; border:1px solid #111; border-radius:3px; overflow:hidden;"><div id="pk-heal-bar" style="width:0%; height:100%; background:#00e676;"></div></div>`;
        }
        if (cls.type === '전사' && skillLevels.war_threat > 0) {
            pkBarContainer.innerHTML += `<div style="width:100%; height:6px; background:#333; border:1px solid #111; border-radius:3px; overflow:hidden;"><div id="pk-threat-bar" style="width:0%; height:100%; background:#ff9100;"></div></div>`;
        }
        if (cls.type === '도적' && skillLevels.thief_overload > 0) {
            pkBarContainer.innerHTML += `<div style="width:100%; height:6px; background:#333; border:1px solid #111; border-radius:3px; overflow:hidden;"><div id="pk-rtd-bar" style="width:0%; height:100%; background:#d50000;"></div></div>`;
        }
    }
    
    pkState = { active: true, time: 60, score: 0, lastTime: performance.now(), speed: 1, bestScore: bestScore, unit: { cls: cls, grade: grade, gradeIdx: 8, x: 110, y: 250, lastAttack: 0, globalCooldown: 0, threatCooldown: 0, overloadTimer: 0, unitStunTimer: 0, rtdCooldown: 0 }, scarecrow: { x: 390, y: 250, size: 20, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, threatTimer: 0 }, projectiles: [], dmgTexts: [], vfx: [] };
    document.getElementById('pk-score').innerText = '0'; document.getElementById('pk-time').innerText = '60'; document.getElementById('pk-btn-speed').innerText = "1배속"; pkLoop();
};

function pkLoop() { 
    if (!pkState.active) return; let now = performance.now(); if (!pkState.lastTime) pkState.lastTime = now; let dtReal = (now - pkState.lastTime) / 1000; if (dtReal > 0.1) dtReal = 0.1; if (dtReal < 0) dtReal = 0.016;
    let dt = dtReal * (pkState.speed || 1); pkState.lastTime = now;
    pkState.time -= dt; document.getElementById('pk-time').innerText = Math.ceil(Math.max(0, pkState.time));
    if (pkState.time <= 0) {
        pkState.active = false; cancelAnimationFrame(pkReqId);
        let finalScore = Math.floor(pkState.score); let scoreHtml = finalScore.toLocaleString(); if (finalScore > pkState.bestScore && finalScore > 0) { scoreHtml += ' <span style="font-size:16px; color:#ffeb3b; text-shadow:1px 1px 2px #000;">(신기록!)</span>'; }
        document.getElementById('pk-final-score').innerHTML = scoreHtml; document.getElementById('pk-result-overlay').style.display = 'block'; document.getElementById('pk-result-modal').style.display = 'block'; return; 
    }
    let u = pkState.unit; let target = pkState.scarecrow;

    if (target.threatTimer > 0) target.threatTimer -= dt;
    if (target.freezeTimer > 0) { target.freezeTimer -= dt; target.freezeTickTimer -= dt; if (target.freezeTickTimer <= 0) { pkApplyDmg(target.freezeDmgVal, false); target.freezeTickTimer = 1; } }
    
    let overloadMult = 1;
    if (u.overloadTimer > 0) {
        u.overloadTimer -= dt; overloadMult = 2;
        if (u.overloadTimer <= 0) u.unitStunTimer = skillLevels.thief_overload === 1 ? 6 : 5;
    }
    if (u.unitStunTimer > 0) u.unitStunTimer -= dt;
    let isStunned = (u.unitStunTimer > 0);

    if (u.gradeIdx >= 6) {
        if (u.cls.type === '법사' && skillLevels.mage_heal > 0) {
            if (u.healCooldown === undefined) u.healCooldown = 0;
            u.healCooldown -= dt * 1000;
            let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
            let hbar = document.getElementById('pk-heal-bar');
            if (hbar) hbar.style.width = Math.max(0, Math.min(100, ((maxHealCd - u.healCooldown) / maxHealCd) * 100)) + '%';
            
            if (u.healCooldown <= 0 && !isStunned) {
                u.healCooldown += maxHealCd;
                pkState.vfx.push({ type: 'heal', x: u.x, y: u.y, timer: 1.0 });
            }
        }
    }

    if (u.gradeIdx >= 7) {
        if (u.cls.type === '전사' && skillLevels.war_threat > 0) {
            if (u.threatCooldown === undefined) u.threatCooldown = 0;
            u.threatCooldown -= dt * 1000;
            let tbar = document.getElementById('pk-threat-bar');
            if (tbar) tbar.style.width = Math.max(0, Math.min(100, ((25000 - u.threatCooldown) / 25000) * 100)) + '%';
            
            if (u.threatCooldown <= 0 && !isStunned) {
                target.threatTimer = skillLevels.war_threat * 2;
                u.threatCooldown += 25000;
                pkState.vfx.push({ type: 'threat1', x: u.x, y: u.y, timer: 1.0 });
            }
        }
        if (u.cls.type === '도적' && skillLevels.thief_overload > 0) {
            if (u.rtdCooldown === undefined) u.rtdCooldown = 0;
            u.rtdCooldown -= dt * 1000;
            let rbar = document.getElementById('pk-rtd-bar');
            if (rbar) rbar.style.width = Math.max(0, Math.min(100, ((45000 - u.rtdCooldown) / 45000) * 100)) + '%';

            if (u.rtdCooldown <= 0 && (u.overloadTimer||0) <= 0 && !isStunned) {
                u.overloadTimer = skillLevels.thief_overload === 5 ? 15 : 6 + (skillLevels.thief_overload * 2);
                u.rtdCooldown += 45000;
                pkState.vfx.push({ type: 'rtd', x: u.x, y: u.y, timer: 1.0 });
            }
        }
    }

    let cardMulti = 1 + (getTotalCardBonus() / 100); let rageMulti = 1 + (skillLevels.common_rage * 0.01) + (equipStats.atk * 0.01); let sharpChance = (skillLevels.common_sharp * 0.05) + (equipStats.crit * 0.01); let windReduc = 1 + (skillLevels.common_wind * 0.2) + (equipStats.spd * 0.01);
    let pkBaseDmg = 20; let pkBaseCd = 1000;
    
    if (u.gradeIdx >= 5 && ((u.cls.type === '전사' && skillLevels.war_death > 0) || (u.cls.type === '법사' && skillLevels.mage_thunder > 0) || (u.cls.type === '도적' && skillLevels.thief_fuma > 0))) {
        u.globalCooldown -= dt * 1000; let pbar = document.getElementById('pk-global-bar'); if (pbar) pbar.style.width = Math.max(0, Math.min(100, ((60000 - u.globalCooldown) / 60000) * 100)) + '%';
        if (u.globalCooldown <= 0 && !isStunned) {
            let baseDmg = (pkBaseDmg + equipStats.flatAtk) * u.grade.mult * cardMulti * rageMulti; 
            if (target.threatTimer > 0) baseDmg *= 1.3; 
            
            if (u.cls.type === '전사' && skillLevels.war_death > 0) { let gdmg = baseDmg * (1.5 + skillLevels.war_death * 1.5); pkState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg }); u.globalCooldown += 60000; } 
            else if (u.cls.type === '법사' && skillLevels.mage_thunder > 0) { let gdmg = baseDmg * (1.5 + skillLevels.mage_thunder * 1.5); pkState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); u.globalCooldown += 60000; } 
            else if (u.cls.type === '도적' && skillLevels.thief_fuma > 0) { let gdmg = baseDmg * (1.5 + skillLevels.thief_fuma * 1.5); pkApplyDmg(gdmg, false); pkState.vfx.push({ type: 'fuma', timer: 0.5 }); u.globalCooldown += 60000; }
        }
    }
    
    u.lastAttack -= dt * 1000; let attackCd = (pkBaseCd * (u.grade.speedMul || 1)) / (windReduc * overloadMult);
    while (u.lastAttack <= 0) {
        if (isStunned) { u.lastAttack = 0; break; }
        let dmg = (pkBaseDmg + equipStats.flatAtk) * u.grade.mult * cardMulti * rageMulti; 
        if (target.threatTimer > 0) dmg *= 1.3;
        let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= (1.2 + (equipStats.cdmg / 100)); 
        let isFinal = false; if (u.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < getSkillValue('war_final', skillLevels.war_final)) { isFinal = true; dmg *= 2; }
        pkState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y, dmg: dmg, color: u.cls.color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg });
        if (u.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < getSkillValue('thief_shadow', skillLevels.thief_shadow)) { projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: target.x, ty: target.y, dmg: dmg, color: u.cls.color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true }); }
        u.lastAttack += attackCd;
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

function pkApplyDmg(dmg, isCrit) { pkState.score += (dmg / 10000); document.getElementById('pk-score').innerText = Math.floor(pkState.score).toLocaleString(); let ox = (Math.random() - 0.5) * 15; let oy = (Math.random() - 0.5) * 15; pkState.dmgTexts.push({ val: Math.floor(dmg), x: pkState.scarecrow.x + ox, y: pkState.scarecrow.y - 70 + oy, timer: 0.6, isCrit: isCrit }); }

window.submitPkScore = async () => {
    let finalScore = Math.floor(pkState.score); let className = pkState.unit.cls.type;
    if (!currentUserUid) { window.showMessage("로그인이 끊어졌습니다."); window.switchScreen('start-screen'); return; }
    const btnSubmit = document.getElementById('btn-submit-pk'); if(btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerText = "서버에 저장 중..."; }
    try {
        const snap = await get(child(ref(database), `pk_rankings/${currentUserUid}`));
        if (snap.exists()) { const data = snap.val(); if (finalScore > data.score) { await set(ref(database, `pk_rankings/${currentUserUid}`), { nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString() }); } } 
        else { await set(ref(database, `pk_rankings/${currentUserUid}`), { nickname: currentUserName, class: className, score: finalScore, date: new Date().toLocaleDateString() }); }
    } catch(e) { window.showMessage("서버 통신 중 오류가 발생했습니다."); }
    if(btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerText = "랭킹 등록하고 로비로"; }
    document.getElementById('pk-result-overlay').style.display = 'none'; document.getElementById('pk-result-modal').style.display = 'none'; window.switchScreen('start-screen'); window.loadPkLiveRanking(); 
};

window.endPkGame = (isGiveUp) => { pkState.active = false; cancelAnimationFrame(pkReqId); if (isGiveUp) { window.switchScreen('start-screen'); } };

function drawPk() {
    let pkCtx = document.getElementById('pkCanvas').getContext('2d'); pkCtx.clearRect(0, 0, 500, 500); pkCtx.setLineDash([]); pkCtx.strokeStyle = "rgba(188, 170, 164, 0.2)"; pkCtx.lineWidth = 35; pkCtx.lineJoin = "round"; pkCtx.beginPath(); pkCtx.rect(25, 25, 450, 450); pkCtx.stroke();
    let m = pkState.scarecrow; let size = 25; 
    if (husooabiImg && husooabiImg.complete && husooabiImg.naturalWidth > 0) { pkCtx.save(); pkCtx.translate(m.x, m.y); if (m.freezeTimer > 0) { pkCtx.globalAlpha = 0.5; pkCtx.fillStyle = "#81d4fa"; pkCtx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3); pkCtx.globalAlpha = 1.0; } pkCtx.drawImage(husooabiImg, -size * 1.5, -size * 1.5, size * 3, size * 3); pkCtx.restore(); } 
    else { pkCtx.font = "40px NanumSquare"; pkCtx.textAlign = "center"; pkCtx.textBaseline = "middle"; pkCtx.fillText("🎃", m.x, m.y);  }
    
    if (m.freezeTimer > 0) { pkCtx.fillStyle = "rgba(0, 200, 255, 0.5)"; pkCtx.fillRect(m.x - 20, m.y - 20, 40, 40); pkCtx.fillStyle = "#fff"; pkCtx.font = "16px NanumSquare"; pkCtx.fillText("❄️", m.x + 15, m.y - 15); }
    
    if (m.threatTimer > 0) { 
        if (threatEffect2Img && threatEffect2Img.complete) {
            pkCtx.drawImage(threatEffect2Img, m.x - 15, m.y - 65, 30, 30);
        } else {
            pkCtx.font = "bold 24px Arial"; pkCtx.fillStyle = "#ff1744"; pkCtx.textAlign = "center"; pkCtx.fillText("💢", m.x, m.y - 45); 
        }
    }
    
    pkState.vfx.forEach(v => { 
        if (v.type === 'fuma') { pkCtx.save(); pkCtx.translate(m.x, m.y); pkCtx.rotate((0.5 - v.timer) * 30); if (fumaImg && fumaImg.complete) { let fsize = 80; pkCtx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); } pkCtx.restore(); } 
        else if (v.type === 'heal' && healEffectImg.complete) {
            pkCtx.save(); pkCtx.translate(v.x, v.y); let hSize = 50; let progress = 1 - (v.timer / 1.0); pkCtx.beginPath();
            if (progress < 0.5) { let p2 = progress * 2; pkCtx.rect(-hSize/2, hSize/2 - hSize*p2 - 25, hSize, hSize*p2); } 
            else { let p2 = (progress - 0.5) * 2; pkCtx.rect(-hSize/2, -hSize/2 + hSize*p2 - 25, hSize, hSize*(1-p2)); }
            pkCtx.clip(); pkCtx.drawImage(healEffectImg, -hSize/2, -hSize/2 - 25, hSize, hSize); pkCtx.restore();
        }
        else if (v.type === 'threat1' && threatEffect1Img.complete) {
            pkCtx.save(); pkCtx.translate(v.x, v.y); pkCtx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); pkCtx.drawImage(threatEffect1Img, -25, -60, 50, 50); pkCtx.restore();
        } else if (v.type === 'rtd' && rtdEffectImg.complete) {
            pkCtx.save(); pkCtx.translate(v.x, v.y); pkCtx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); pkCtx.drawImage(rtdEffectImg, -30, -70, 60, 60); pkCtx.restore();
        }
        else { pkCtx.save(); if (v.type === 'death') { let progress = Math.min(1, (1.2 - v.timer) / 0.2); pkCtx.strokeStyle = "#ffeb3b"; pkCtx.lineWidth = 12; pkCtx.lineCap = "round"; pkCtx.shadowColor = "#f57f17"; pkCtx.shadowBlur = 15; let currentX = -50 + (600) * progress; let currentY = 550 + (-600) * progress; pkCtx.beginPath(); pkCtx.moveTo(-50, 550); pkCtx.lineTo(currentX, currentY); pkCtx.stroke(); } else if (v.type === 'thunder') { pkCtx.fillStyle = `rgba(0, 229, 255, ${v.timer})`; pkCtx.fillRect(0,0,500,500); pkCtx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 2})`; pkCtx.lineWidth = 20; pkCtx.beginPath(); pkCtx.moveTo(250,0); pkCtx.lineTo(150,250); pkCtx.lineTo(350,250); pkCtx.lineTo(250,500); pkCtx.stroke(); } pkCtx.restore(); }
    });

    if (pkState.unit.overloadTimer > 0) {
        pkCtx.save(); pkCtx.strokeStyle = "#ff1744"; pkCtx.shadowColor = "#ff1744"; pkCtx.shadowBlur = 10; pkCtx.lineWidth = 3;
        pkCtx.strokeRect(pkState.unit.x - 30, pkState.unit.y - 30, 60, 60); pkCtx.restore();
    }
    if (pkState.unit.unitStunTimer > 0) {
        pkCtx.font = "bold 20px Arial"; pkCtx.fillStyle = "yellow"; pkCtx.textAlign = "center"; pkCtx.fillText("💫", pkState.unit.x, pkState.unit.y - 25); 
    }

    pkState.projectiles.forEach(p => {
        pkCtx.save(); pkCtx.translate(p.x, p.y); let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let scale = 1.5; if (p.isFinal) scale *= 1.3; pkCtx.scale(scale, scale); if (p.isShadow) pkCtx.globalAlpha = 0.5;
        let img = null; let psize = 35; 
        if (p.type === '전사') { img = p.gradeIdx >= 5 ? projImages.warrior2 : projImages.warrior1; pkCtx.rotate(dir + Math.PI); } else if (p.type === '법사') { img = p.gradeIdx >= 5 ? projImages.mage2 : projImages.mage1; pkCtx.rotate(dir + (15 * Math.PI / 180)); } else if (p.type === '도적') { img = p.gradeIdx >= 5 ? projImages.rogue2 : projImages.rogue1; psize = 25; pkCtx.rotate(p.angle); }
        if (img && img.complete) { pkCtx.drawImage(img, -psize/2, -psize/2, psize, psize); } pkCtx.restore();
    });
    pkState.dmgTexts.forEach(d => { pkCtx.save(); pkCtx.globalAlpha = Math.max(0, d.timer / 0.6); pkCtx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; pkCtx.font = d.isCrit ? "800 24px NanumSquare" : "bold 18px NanumSquare"; pkCtx.shadowColor = d.isCrit ? "#c62828" : "#000"; pkCtx.shadowBlur = 4; pkCtx.fillText(d.val, d.x, d.y); pkCtx.restore(); });
}

window.updateUI = () => {
    let skipWrapper = document.getElementById('boss-skip-wrapper'); 
    if (state.isBoss && monsters.length === 0 && waveTimer > 0 && (!state.isRank || (state.isRank && oppMonsters.length === 0))) { skipWrapper.style.display = 'flex'; } else { skipWrapper.style.display = 'none'; }
    document.getElementById('ui-meso').innerText = state.meso; document.getElementById('ui-mp').innerText = state.mp; document.getElementById('ui-wave').innerText = state.wave; document.getElementById('ui-kills').innerText = state.kills.toLocaleString(); 
    document.getElementById('ui-tickets').innerText = state.tickets.length; document.getElementById('btn-summon').disabled = (state.meso < 10);
    let guideEl = document.getElementById('early-guide'); if (guideEl) { if (state.wave <= 10 && !state.isRank) guideEl.style.display = 'block'; else guideEl.style.display = 'none'; }
    document.getElementById('ui-mobs').innerText = `${monsters.length} / ${state.isRank ? 25 : 50}`; 
    if (state.isRank) { document.getElementById('opp-wave').innerText = oppState.wave; document.getElementById('opp-mobs').innerText = oppMonsters.length; }
    let sellBtn = document.getElementById('btn-sell-single'); if (selectedUnitIdx !== -1 && grid[selectedUnitIdx] && grid[selectedUnitIdx].grade.sell > 0) { sellBtn.disabled = false; } else { sellBtn.disabled = true; }
    if (state.upgrades) { document.getElementById('upg-w-val').innerText = state.upgrades['전사'].val; document.getElementById('upg-w-cost').innerText = state.upgrades['전사'].cost; document.getElementById('upg-m-val').innerText = state.upgrades['법사'].val; document.getElementById('upg-m-cost').innerText = state.upgrades['법사'].cost; document.getElementById('upg-t-val').innerText = state.upgrades['도적'].val; document.getElementById('upg-t-cost').innerText = state.upgrades['도적'].cost; }
};

window.draw = () => {
    if(!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. 트랙 길 그리기
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(188, 170, 164, 0.4)"; ctx.lineWidth = 35; ctx.lineJoin = "round"; ctx.beginPath();
    ctx.moveTo(currentPath[0].x, currentPath[0].y);
    for(let i=1; i<currentPath.length; i++) ctx.lineTo(currentPath[i].x, currentPath[i].y);
    ctx.closePath(); ctx.stroke();

    // 2. 사거리 표시
    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx]) { let u = grid[selectedUnitIdx]; let attackRange = u.cls.range * u.grade.rangeMul; ctx.save(); ctx.beginPath(); ctx.arc(u.x, u.y, attackRange, 0, Math.PI * 2); ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 235, 59, 0.6)"; ctx.stroke(); ctx.restore(); }

    // 3. 타워 및 기절 표시
    towers.forEach(t => {
        if (t.unitStunTimer > 0) {
            ctx.save(); ctx.font = "bold 20px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", t.x, t.y - 25); ctx.restore();
        }
    });

    // 4. 🔥 시각 이펙트들을 몬스터보다 먼저 그립니다 (레이어 하단 배치)
    visualEffects.forEach(v => {
        ctx.save();
        if (v.type === 'death') { 
            let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
            ctx.globalAlpha = 0.5; // 🔥 데스폴트 연하게
            ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.shadowColor = "#f57f17"; ctx.shadowBlur = 15; 
            let currentX = -50 + (600) * progress; let currentY = 550 + (-600) * progress; ctx.beginPath(); ctx.moveTo(-50, 550); ctx.lineTo(currentX, currentY); ctx.stroke(); 
        } 
        else if (v.type === 'thunder') { 
            ctx.fillStyle = `rgba(0, 229, 255, ${v.timer * 0.3})`; // 🔥 썬더브레이크 연하게
            ctx.fillRect(0,0,500,500); 
            ctx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 1.5})`; ctx.lineWidth = 20; 
            ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(150,250); ctx.lineTo(350,250); ctx.lineTo(250,500); ctx.stroke(); 
        }
        else if (v.type === 'heal' && healEffectImg.complete) {
            ctx.translate(v.x, v.y); let hSize = 50; let progress = 1 - (v.timer / 1.0); ctx.beginPath();
            if (progress < 0.5) { let p2 = progress * 2; ctx.rect(-hSize/2, hSize/2 - hSize*p2 - 25, hSize, hSize*p2); } 
            else { let p2 = (progress - 0.5) * 2; ctx.rect(-hSize/2, -hSize/2 + hSize*p2 - 25, hSize, hSize*(1-p2)); }
            ctx.clip(); ctx.drawImage(healEffectImg, -hSize/2, -hSize/2 - 25, hSize, hSize);
        }
        else if (v.type === 'threat1' && threatEffect1Img.complete) {
            ctx.translate(v.x, v.y); ctx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); ctx.drawImage(threatEffect1Img, -25, -60, 50, 50);
        }
        else if (v.type === 'rtd' && rtdEffectImg.complete) {
            ctx.translate(v.x, v.y); ctx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); ctx.drawImage(rtdEffectImg, -30, -70, 60, 60);
        }
        ctx.restore();
    });

    // 5. 수리검 및 투사체 그리기
    fumaList.forEach(f => { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle); if (fumaImg && fumaImg.complete) { let fsize = 60; ctx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); } ctx.restore(); });

    projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let scale = 1.0; if (p.isFinal) scale *= 1.3; ctx.scale(scale, scale); if (p.isShadow) ctx.globalAlpha = 0.5;
        let img = null; let psize = 20;
        if (p.type === '전사') { img = p.gradeIdx >= 5 ? projImages.warrior2 : projImages.warrior1; ctx.rotate(dir + Math.PI); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '법사') { img = p.gradeIdx >= 5 ? projImages.mage2 : projImages.mage1; ctx.rotate(dir + (15 * Math.PI / 180)); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '도적') { img = p.gradeIdx >= 5 ? projImages.rogue2 : projImages.rogue1; ctx.rotate(p.angle); }
        if (img && img.complete) { ctx.drawImage(img, -psize/2, -psize/2, psize, psize); } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
    });

    // 6. 🔥 타격 동그라미 이펙트 연하게 변경
    hitEffects.forEach(h => { ctx.save(); ctx.globalAlpha = (h.timer / 0.2) * 0.4; ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(h.x, h.y, 15, 0, Math.PI*2); ctx.fill(); ctx.restore(); });

    // 7. 🔥 몬스터 & 보스 체력바를 가장 마지막에 그립니다 (최상단 레이어)
    monsters.forEach(m => {
        let size = m.isBoss ? 25 : 12; ctx.save(); ctx.translate(m.x, m.y); if (m.facingRight) ctx.scale(-1, 1);
        if (m.isBoss && bossImages[m.name] && bossImages[m.name].complete) { ctx.drawImage(bossImages[m.name], -size*1.5, -size*1.5, size*3, size*3); } 
        else if (!m.isBoss && mobImg && mobImg.complete && mobImg.naturalWidth > 0) { ctx.drawImage(mobImg, -size*1.5, -size*1.5, size*3, size*3); } 
        else { ctx.fillStyle = m.isBoss ? "#ef5350" : "#ffca28"; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill(); }
        if (m.freezeTimer > 0) { ctx.fillStyle = "rgba(0, 200, 255, 0.4)"; ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2); ctx.fill(); }
        if (m.stunTimer > 0) { ctx.font = "bold 16px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", 0, -size - 10); }
        
        if (m.threatTimer > 0) { 
            if (threatEffect2Img && threatEffect2Img.complete) {
                ctx.drawImage(threatEffect2Img, -15, -size - 30, 30, 30);
            } else {
                ctx.font = "bold 16px Arial"; ctx.fillStyle = "#ff1744"; ctx.textAlign = "center"; ctx.fillText("💢", 0, -size - 22); 
            }
        } 
        
        ctx.restore();
        ctx.fillStyle = "#333"; ctx.fillRect(m.x - size, m.y - size - 10, size * 2, 4);
        ctx.fillStyle = m.isBoss ? "#ff5252" : "#4caf50"; ctx.fillRect(m.x - size, m.y - size - 10, (size * 2) * (m.hp / m.maxHp), 4);
    });

    // 8. 데미지 텍스트 출력
    damageTexts.forEach(d => { ctx.save(); ctx.globalAlpha = Math.max(0, d.timer / 0.8); ctx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; ctx.font = d.isCrit ? "800 16px NanumSquare" : "bold 12px NanumSquare"; ctx.shadowColor = d.isCrit ? "#c62828" : "#000"; ctx.shadowBlur = 3; ctx.fillText(d.val, d.x, d.y); ctx.restore(); });
};

window.drawOpp = () => {
    if(!oppCtx) return;
    oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);
    
    oppCtx.setLineDash([]); oppCtx.strokeStyle = "rgba(188, 170, 164, 0.4)"; oppCtx.lineWidth = 20; oppCtx.lineJoin = "round"; oppCtx.beginPath();
    oppCtx.moveTo(currentPath[0].x, currentPath[0].y);
    for(let i=1; i<currentPath.length; i++) oppCtx.lineTo(currentPath[i].x, currentPath[i].y);
    oppCtx.closePath(); oppCtx.stroke();

    oppTowers.forEach(t => {
        if (t.unitStunTimer > 0) {
            oppCtx.save(); oppCtx.font = "bold 16px Arial"; oppCtx.fillStyle = "yellow"; oppCtx.textAlign = "center"; oppCtx.fillText("💫", t.x, t.y - 20); oppCtx.restore();
        }
    });

    oppMonsters.forEach(m => {
        let size = m.isBoss ? 15 : 8; oppCtx.save(); oppCtx.translate(m.x, m.y); if (m.facingRight) oppCtx.scale(-1, 1);
        if (m.isBoss && bossImages[m.name] && bossImages[m.name].complete) { oppCtx.drawImage(bossImages[m.name], -size*1.5, -size*1.5, size*3, size*3); } 
        else if (!m.isBoss && mobImg && mobImg.complete && mobImg.naturalWidth > 0) { oppCtx.drawImage(mobImg, -size*1.5, -size*1.5, size*3, size*3); } 
        else { oppCtx.fillStyle = m.isBoss ? "#ef5350" : "#ffca28"; oppCtx.beginPath(); oppCtx.arc(0, 0, size, 0, Math.PI*2); oppCtx.fill(); }
        if (m.stunTimer > 0) { oppCtx.font = "bold 10px Arial"; oppCtx.fillStyle = "yellow"; oppCtx.textAlign = "center"; oppCtx.fillText("💫", 0, -size - 5); }
        
        if (m.threatTimer > 0) { 
            if (threatEffect2Img && threatEffect2Img.complete) {
                oppCtx.drawImage(threatEffect2Img, -10, -size - 20, 20, 20);
            } else {
                oppCtx.font = "bold 10px Arial"; oppCtx.fillStyle = "#ff1744"; oppCtx.textAlign = "center"; oppCtx.fillText("💢", 0, -size - 15);
            }
        }
        oppCtx.restore();
        oppCtx.fillStyle = "#333"; oppCtx.fillRect(m.x - size, m.y - size - 6, size * 2, 3);
        oppCtx.fillStyle = m.isBoss ? "#ff5252" : "#4caf50"; oppCtx.fillRect(m.x - size, m.y - size - 6, (size * 2) * (m.hp / m.maxHp), 3);
    });

    oppVisualEffects.forEach(v => {
        oppCtx.save();
        if (v.type === 'death') { 
            let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
            oppCtx.globalAlpha = 0.5; // 🔥 투명도 적용
            oppCtx.strokeStyle = "#ffeb3b"; oppCtx.lineWidth = 8; oppCtx.lineCap = "round"; oppCtx.shadowColor = "#f57f17"; oppCtx.shadowBlur = 10; 
            let currentX = -50 + (600) * progress; let currentY = 450 + (-400) * progress; oppCtx.beginPath(); oppCtx.moveTo(-50, 450); oppCtx.lineTo(currentX, currentY); oppCtx.stroke(); 
        } 
        else if (v.type === 'thunder') { 
            oppCtx.fillStyle = `rgba(0, 229, 255, ${v.timer * 0.3})`; // 🔥 썬더 연하게
            oppCtx.fillRect(0,0,500,500); 
            oppCtx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 1.5})`; oppCtx.lineWidth = 15; 
            oppCtx.beginPath(); oppCtx.moveTo(250,0); oppCtx.lineTo(200,250); oppCtx.lineTo(300,250); oppCtx.lineTo(250,500); oppCtx.stroke(); 
        }
        else if (v.type === 'heal' && healEffectImg.complete) {
            oppCtx.translate(v.x, v.y); let hSize = 30; let progress = 1 - (v.timer / 1.0); oppCtx.beginPath();
            if (progress < 0.5) { let p2 = progress * 2; oppCtx.rect(-hSize/2, hSize/2 - hSize*p2 - 15, hSize, hSize*p2); } 
            else { let p2 = (progress - 0.5) * 2; oppCtx.rect(-hSize/2, -hSize/2 + hSize*p2 - 15, hSize, hSize*(1-p2)); }
            oppCtx.clip(); oppCtx.drawImage(healEffectImg, -hSize/2, -hSize/2 - 15, hSize, hSize);
        }
        else if (v.type === 'threat1' && threatEffect1Img.complete) {
            oppCtx.translate(v.x, v.y); oppCtx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); oppCtx.drawImage(threatEffect1Img, -15, -40, 30, 30);
        }
        else if (v.type === 'rtd' && rtdEffectImg.complete) {
            oppCtx.translate(v.x, v.y); oppCtx.globalAlpha = Math.sin((1 - (v.timer / 1.0)) * Math.PI); oppCtx.drawImage(rtdEffectImg, -20, -50, 40, 40);
        }
        oppCtx.restore();
    });

    oppProjectiles.forEach(p => {
        oppCtx.save(); oppCtx.translate(p.x, p.y); let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let img = null; let psize = 12;
        if (p.type === '전사') { img = p.gradeIdx >= 5 ? projImages.warrior2 : projImages.warrior1; oppCtx.rotate(dir + Math.PI); }
        else if (p.type === '법사') { img = p.gradeIdx >= 5 ? projImages.mage2 : projImages.mage1; oppCtx.rotate(dir + (15 * Math.PI / 180)); }
        else if (p.type === '도적') { img = p.gradeIdx >= 5 ? projImages.rogue2 : projImages.rogue1; oppCtx.rotate(p.angle); }
        if (img && img.complete) oppCtx.drawImage(img, -psize/2, -psize/2, psize, psize); else { oppCtx.fillStyle = p.color; oppCtx.beginPath(); oppCtx.arc(0, 0, 3, 0, Math.PI*2); oppCtx.fill(); }
        oppCtx.restore();
    });

    oppDamageTexts.forEach(d => { oppCtx.save(); oppCtx.globalAlpha = Math.max(0, d.timer / 0.8); oppCtx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; oppCtx.font = "bold 10px NanumSquare"; oppCtx.shadowColor = "#000"; oppCtx.shadowBlur = 2; oppCtx.fillText(d.val, d.x, d.y); oppCtx.restore(); });
};

window.loop = () => {
    // 🔥 모험 모드의 메인 루프에 무릉도장 진입 시 동작 금지 예외처리 100% 추가!!
    if(state.status === 'GAMEOVER' || state.status === 'TITLE' || state.status === 'MULUNG') return;
    let now = performance.now(); if (!lastTime) lastTime = now; let dtReal = (now - lastTime) / 1000; if (dtReal > 0.1) dtReal = 0.1; if (dtReal < 0) dtReal = 0.016; 
    let dt = dtReal * (state.speed || 1); lastTime = now;
    
    for (let i = hitEffects.length - 1; i >= 0; i--) { hitEffects[i].timer -= dt; if (hitEffects[i].timer <= 0) hitEffects.splice(i, 1); }
    
    for (let i = visualEffects.length - 1; i >= 0; i--) { 
        visualEffects[i].timer -= dt; 
        if (visualEffects[i].timer <= 0) { 
            let v = visualEffects[i]; 
            if (v.type === 'death' || v.type === 'thunder') { 
                monsters.forEach(m => { 
                    let armor = 0;
                    if (m.isBoss) {
                        if (state.wave >= 310) armor = 0.50;
                        else if (state.wave >= 210) armor = 0.30;
                        else if (state.wave >= 160) armor = 0.10;
                    }
                    let unpen = equipStats.unpenetratedRate;
                    if (m.threatTimer > 0) unpen *= 0.9;
                    let actualDmg = v.dmg * (1 - (armor * unpen));
                    if (m.threatTimer > 0) actualDmg *= 1.3;
                    
                    m.hp -= actualDmg; 
                }); 
                let container = document.getElementById('game-container'); 
                if (container && v.type === 'death') { container.classList.add('mild-shake-active'); setTimeout(() => container.classList.remove('mild-shake-active'), 300); } 
            } 
            visualEffects.splice(i, 1); 
        } 
    }
    
    for (let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].timer -= dt; damageTexts[i].y -= dt * 30; if (damageTexts[i].timer <= 0) damageTexts.splice(i, 1); }
    
    if (state.status === 'PREP') { state.time -= dtReal; document.getElementById('ui-timer').innerText = Math.ceil(Math.max(0, state.time)); if (state.time <= 0) { state.status = 'PLAY'; state.wave = state.wave || 1; waveTimer = 0; spawnTimer = 0; window.showMessage(state.wave + "웨이브 시작!"); window.updateUI(); } window.draw(); if(state.isRank) window.drawOpp(); mainReqId = requestAnimationFrame(window.loop); return; }
    
    updateWave(dt); if(state.isRank) processOpponentTick(dt);
    
    for(let i=monsters.length-1; i>=0; i--) {
        let m = monsters[i];
        if (m.freezeTimer > 0) { m.freezeTimer -= dt; m.freezeTickTimer -= dt; if (m.freezeTickTimer <= 0) { m.hp -= m.freezeDmgVal; m.freezeTickTimer = 1; } }

        // 🔥 반격 로직을 바인드/기절 체크 '위'로 이동!
        if (state.wave >= 160 && m.isBoss && m.name !== "어둠의 늑대" && !state.isRank) {
            if (m.counterTimer === undefined) m.counterTimer = 5; 
            m.counterTimer -= dt;
            if (m.counterTimer <= 0) {
                let targetTower = null; let maxDmg = -1;
                towers.forEach(t => { if (t.hp > 0 && t.damageDealt > maxDmg) { maxDmg = t.damageDealt; targetTower = t; } });
                if (targetTower) {
                    let dmgTaken = (targetTower.overloadTimer > 0) ? 2 : 1; 
                    targetTower.hp -= dmgTaken;
                    hitEffects.push({ x: targetTower.x, y: targetTower.y, timer: 0.5, color: '#ff0000' });
                    if (targetTower.hp <= 0) {
                        towers = towers.filter(tw => tw !== targetTower);
                        grid[targetTower.idx] = null;
                        window.showMessage("보스의 공격으로 유닛이 파괴되었습니다!");
                    }
                }
                m.counterTimer = 10; 
            }
        }

        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; }  // 바인드면 이동 중지
        if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }  // 스턴이면 이동 중지
        if (m.threatTimer > 0) { m.threatTimer -= dt; }

        let t = currentPath[m.targetNode]; let dx = t.x - m.x, dy = t.y - m.y; let dist = Math.hypot(dx, dy); let currentSpeed = m.speed; if (m.freezeTimer > 0) currentSpeed *= 0.5; let move = currentSpeed * dt;
        if (dx > 0) m.facingRight = true; else if (dx < 0) m.facingRight = false;
        if(dist <= move) { m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % currentPath.length; } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    if(state.isRank && monsters.length >= 25) return handleRankGameOver("몹 25마리 초과!");
    if(!state.isRank && monsters.length >= 50) return gameOver("몬스터 50마리 초과! 게임 오버");
    
    let cardMulti = 1 + (getTotalCardBonus() / 100); 
    let rageMulti = 1 + getSkillValue('common_rage', skillLevels.common_rage) + (equipStats.atk * 0.01); 
let sharpChance = getSkillValue('common_sharp', skillLevels.common_sharp) + (equipStats.crit * 0.01); 
let windReduc = 1 + getSkillValue('common_wind', skillLevels.common_wind) + (equipStats.spd * 0.01);

    towers.forEach(t => {
        // 🔥 1. 상태 이상 및 쿨타임 계산 (기절 중에도 쿨타임은 흐름)
        let overloadMult = 1;
        if (t.overloadTimer > 0) {
            t.overloadTimer -= dt; overloadMult = 2;
            if (t.overloadTimer <= 0) t.unitStunTimer = skillLevels.thief_overload === 1 ? 6 : 5;
        }
        if (t.unitStunTimer > 0) t.unitStunTimer -= dt;
        let isStunned = (t.unitStunTimer > 0);

        // 🔥 2. 스킬 발동 로직 (!isStunned 일 때만 스킬이 나감)
        if (t.gradeIdx >= 6 && t.cls.type === '법사' && skillLevels.mage_heal > 0) {
            if (t.healCooldown === undefined) t.healCooldown = 0;
            t.healCooldown -= dt * 1000;
            let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
            let hbar = document.getElementById(`heal-bar-${t.idx}`);
            if (hbar) hbar.style.width = Math.max(0, Math.min(100, ((maxHealCd - t.healCooldown) / maxHealCd) * 100)) + '%';
            
            if (t.healCooldown <= 0 && !isStunned) {
                let gridWidth = state.isRank ? 5 : 5;
                let tCol = t.idx % gridWidth; let tRow = Math.floor(t.idx / gridWidth);
                let injured = towers.filter(u => u.hp < u.maxHp && Math.abs((u.idx % gridWidth) - tCol) <= 1 && Math.abs(Math.floor(u.idx / gridWidth) - tRow) <= 1);
                if (injured.length > 0) {
                    injured.forEach(u => { u.hp = Math.min(u.maxHp, u.hp + 1); visualEffects.push({ type: 'heal', x: u.x, y: u.y, timer: 1.0 }); });
                    t.healCooldown += maxHealCd;
                    visualEffects.push({ type: 'heal', x: t.x, y: t.y, timer: 1.0 });
                } else { t.healCooldown = 0; }
            }
        }

        if (t.gradeIdx >= 7) {
            if (t.cls.type === '전사' && skillLevels.war_threat > 0) {
                if (t.threatCooldown === undefined) t.threatCooldown = 0;
                t.threatCooldown -= dt * 1000;
                let tbar = document.getElementById(`threat-bar-${t.idx}`);
                if (tbar) tbar.style.width = Math.max(0, Math.min(100, ((25000 - t.threatCooldown) / 25000) * 100)) + '%';
                
                if (t.threatCooldown <= 0 && !isStunned && monsters.length > 0) {
                    monsters[0].threatTimer = skillLevels.war_threat * 2;
                    t.threatCooldown += 25000;
                    visualEffects.push({ type: 'threat1', x: t.x, y: t.y, timer: 1.0 }); 
                }
            }
            if (t.cls.type === '도적' && skillLevels.thief_overload > 0) {
                if (t.rtdCooldown === undefined) t.rtdCooldown = 0;
                t.rtdCooldown -= dt * 1000;
                let rbar = document.getElementById(`rtd-bar-${t.idx}`);
                if (rbar) rbar.style.width = Math.max(0, Math.min(100, ((45000 - t.rtdCooldown) / 45000) * 100)) + '%';

                if (t.rtdCooldown <= 0 && (t.overloadTimer||0) <= 0 && !isStunned) {
                    t.overloadTimer = skillLevels.thief_overload === 5 ? 15 : 6 + (skillLevels.thief_overload * 2);
                    t.rtdCooldown += 45000;
                    visualEffects.push({ type: 'rtd', x: t.x, y: t.y, timer: 1.0 });
                }
            }
        }

        if (t.gradeIdx === 6 && t.cls.type !== '법사') {
            t.bindCooldown -= dt * 1000; 
            let bar = document.getElementById(`bind-bar-${t.idx}`); 
            if (bar) bar.style.width = Math.max(0, Math.min(100, ((75000 - t.bindCooldown) / 75000) * 100)) + '%';
            if (t.bindCooldown <= 0 && !isStunned) { 
                if (monsters.length > 0) { 
                    let target = null; for (let m of monsters) { if (m.bindTimer <= 0) { target = m; break; } } 
                    if (!target) target = monsters[0]; 
                    if (target) { target.bindTimer = 10; t.bindCooldown += 75000; } 
                } else { t.bindCooldown = 0; } 
            }
        }
        
        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && (skillLevels.war_death||0) > 0) || (t.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) || (t.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0)) {
                t.globalCooldown -= dt * 1000; 
                let gbar = document.getElementById(`global-bar-${t.idx}`); 
                if (gbar) gbar.style.width = Math.max(0, Math.min(100, ((60000 - t.globalCooldown) / 60000) * 100)) + '%';
                
                if (t.globalCooldown <= 0 && !isStunned) {
                    if (monsters.length > 0) {
                        let baseDmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15) + equipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti; 
                        if (t.cls.type === '전사' && (skillLevels.war_death||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.war_death||0) * 1.5); visualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.mage_thunder||0) * 1.5); visualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.thief_fuma||0) * 1.5); fumaList.push({ x: t.x, y: t.y, targetNode: 0, nodesVisited: 0, dmg: gdmg, hitSet: new Set(), angle: 0 }); t.globalCooldown += 60000; }
                    } else { t.globalCooldown = 0; }
                }
            }
        }
        
        t.lastAttack -= dt * 1000; 
        let attackCd = (t.cls.cd * (t.grade.speedMul || 1)) / (windReduc * overloadMult); 
        while(t.lastAttack <= 0) {
            if (isStunned) { t.lastAttack = 0; break; } // 스턴 중이면 공격 무시
            let range = t.cls.range * t.grade.rangeMul; let target = null;
            for(let m of monsters) { let d = Math.hypot(m.x - t.x, m.y - t.y); if(d <= range) { target = m; break; } }
            if(target) {
                let dmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15) + equipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti; 
                if (target.threatTimer > 0) dmg *= 1.3; 
                let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= (1.2 + (equipStats.cdmg / 100)); 
                let isFinal = false; if (t.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < getSkillValue('war_final', skillLevels.war_final)) { isFinal = true; dmg *= 2; }
                
                projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg, sourceTower: t });
                if (t.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < getSkillValue('thief_shadow', skillLevels.thief_shadow)) { projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true, sourceTower: t }); }
                
                t.lastAttack += attackCd;
            } else { t.lastAttack = 0; break; }
        }
    });
    
    for(let i=fumaList.length-1; i>=0; i--) {
        let f = fumaList[i]; f.angle += 15 * dt; let t_node = currentPath[f.targetNode]; let dx = t_node.x - f.x, dy = t_node.y - f.y; let dist = Math.hypot(dx, dy); let move = 300 * dt; 
        monsters.forEach(m => { 
            if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 50) { 
                let armor = 0;
                if (m.isBoss) {
                    if (state.wave >= 310) armor = 0.50;
                    else if (state.wave >= 210) armor = 0.30;
                    else if (state.wave >= 160) armor = 0.10;
                }
                let unpen = equipStats.unpenetratedRate;
                if (m.threatTimer > 0) unpen *= 0.9;
                let actualDmg = f.dmg * (1 - (armor * unpen));
                if (m.threatTimer > 0) actualDmg *= 1.3;
                
                m.hp -= actualDmg; 
                f.hitSet.add(m); 
                if(state.isRank && m.isBoss) rankState.myBossDamage += actualDmg; 
            } 
        });
        if(dist <= move) { f.x = t_node.x; f.y = t_node.y; f.targetNode++; f.nodesVisited++; if (f.targetNode >= currentPath.length) f.targetNode = 0; if (f.nodesVisited > currentPath.length) fumaList.splice(i, 1); } else { f.x += (dx/dist)*move; f.y += (dy/dist)*move; }
    }

    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt;
        if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            if (p.gradeIdx >= 6) { hitEffects.push({ x: p.tx, y: p.ty, timer: 0.2, color: p.color }); }
            if(monsters.includes(p.target)) {
                let hitDmg = p.dmg; if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5; 
                
                let bossArmor = 0;
                if (p.target.isBoss) {
                    if (state.wave >= 310) bossArmor = 0.50;
                    else if (state.wave >= 210) bossArmor = 0.30;
                    else if (state.wave >= 160) bossArmor = 0.10;
                }

                let myUnpen = equipStats.unpenetratedRate;
                if (p.target.threatTimer > 0) myUnpen *= 0.9;

                let appliedArmor = bossArmor * myUnpen;
                hitDmg *= (1 - appliedArmor);

                p.target.hp -= hitDmg; p.sourceTower.damageDealt += hitDmg; 
                if(state.isRank && p.target.isBoss) rankState.myBossDamage += hitDmg;
                if (p.isCrit) damageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 35, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < getFreezeChance(skillLevels.mage_freeze)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * getFreezeDmg(skillLevels.mage_freeze); } }
            }
            if(p.splash > 0) {
                monsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg; if (p.type === '전사' && m.isBoss) splashDmg *= 1.5; 
                        
                        let bossArmor = 0;
                        if (m.isBoss) {
                            if (state.wave >= 310) bossArmor = 0.50;
                            else if (state.wave >= 210) bossArmor = 0.30;
                            else if (state.wave >= 160) bossArmor = 0.10;
                        }
                        let myUnpen = equipStats.unpenetratedRate;
                        if (m.threatTimer > 0) myUnpen *= 0.9;
                        let appliedArmor = bossArmor * myUnpen;
                        splashDmg *= (1 - appliedArmor);

                        m.hp -= splashDmg; p.sourceTower.damageDealt += splashDmg;
                        if(state.isRank && m.isBoss) rankState.myBossDamage += splashDmg;
                        if (p.isCrit) damageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 35, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < getFreezeChance(skillLevels.mage_freeze)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * getFreezeDmg(skillLevels.mage_freeze); } }
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
                    let bInfo = getBossInfo(state.wave); 
                    state.meso += bInfo.meso; 
                    
                    let tCount = bInfo.count || 1;
                    let tTier = bInfo.tier || 5; 
                    for (let t = 0; t < tCount; t++) {
                        state.tickets.push(tTier);
                    }
                    
                    let drops = [];
                    if (Math.random() * 100 <= 5) { userInventory.equipBoxes = (userInventory.equipBoxes || 0) + 1; drops.push({ type: 'equip' }); }
                    if (Math.random() * 100 <= 20) { cardData[bInfo.name] = cardData[bInfo.name] || { owned: 0, grade: 0 }; cardData[bInfo.name].owned++; localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); if (currentUserUid) window.syncToCloud(); drops.push({ type: 'card', name: bInfo.name }); }
                    if (drops.length > 0) { window.showLootPopup(drops); } else { window.showMessage(`${state.wave}라운드 보스 처치!`); }
                }
            }
            monsters.splice(i, 1); window.updateUI();
        }
    }

    for(let i=oppMonsters.length-1; i>=0; i--) { 
        if(oppMonsters[i].hp <= 0) {
            oppMonsters.splice(i, 1); 
        } 
    }
    
    if (oppMonsters.length === 0) {
        let oppClearedBlock = 0;
        if (oppState.wave % 10 === 0 && oppWaveTimer >= 58.5) {
            oppClearedBlock = oppState.wave / 10;
        } else if (oppState.wave % 10 !== 0) {
            oppClearedBlock = Math.floor((oppState.wave - 1) / 10);
        }

        if (oppClearedBlock > 0) {
            if (!rankState.blockWinner) rankState.blockWinner = {};
            if (!rankState.blockWinner[oppClearedBlock]) {
                rankState.blockWinner[oppClearedBlock] = 'opp'; 
                let wolfHp = Math.floor(100000 * Math.pow(1.5, oppClearedBlock)); 
                monsters.push({ hp: wolfHp, maxHp: wolfHp, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: "어둠의 늑대", facingRight: true, threatTimer: 0, counterTimer: 5 });
                window.showMessage(`☠️ 상대방이 ${oppClearedBlock * 10}웨이브를 먼저 클리어하여 늑대가 난입했습니다!`);
            }
        }
    }

    if (state.isRank && monsters.length === 0) {
        let clearedBlock = 0;
        if (state.wave % 10 === 0 && waveTimer >= 58.5) {
            clearedBlock = state.wave / 10;
        } else if (state.wave % 10 !== 0) {
            clearedBlock = Math.floor((state.wave - 1) / 10);
        }

        if (clearedBlock > 0) {
            if (!rankState.blockWinner) rankState.blockWinner = {};
            if (!rankState.blockWinner[clearedBlock]) { 
                rankState.blockWinner[clearedBlock] = 'player'; 
                let wolfHp = Math.floor(100000 * Math.pow(1.5, clearedBlock)); 
                oppMonsters.push({ hp: wolfHp, maxHp: wolfHp, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: "어둠의 늑대", facingRight: true, threatTimer: 0, counterTimer: 5 });
                window.showMessage(`🔥 ${clearedBlock * 10}웨이브 클리어! 상대에게 어둠의 늑대를 보냈습니다!`);
            }
        }
    }
    
    window.draw(); if(state.isRank) window.drawOpp(); 
    mainReqId = requestAnimationFrame(window.loop);
};

// ==========================================
// 10. 협동 무릉도장 시스템 (매칭, UI, 상점, 블랙 큐브)
// ==========================================

// 🔥 서버 저장 로직 오버라이드 (무릉 코인이 증발하지 않고 영구 저장됨!)
let originalSyncToCloud = window.syncToCloud;
window.syncToCloud = async () => {
    if (!currentUserUid) return;
    let cloudProfile = { 
        save: localStorage.getItem('mapleDefenseSave') || null, 
        cards: localStorage.getItem('mapleDefenseCards') || null, 
        skills: localStorage.getItem('mapleDefenseSkills') || null, 
        coins: localStorage.getItem('mapleDefenseSpentCoins') || null, 
        bestWave: localStorage.getItem('mapleDefenseBestWave') || null, 
        rp: userRankData.rp, 
        rankMoney: userRankData.rankMoney, 
        bonusCoins: userRankData.bonusCoins, 
        mulungCoins: userRankData.mulungCoins || 0, 
        coreData: userCores, // 🔥 신규 추가: 유저의 코어 인벤토리 및 장착 정보 저장
        raidDate: localStorage.getItem('mapleDefenseRaidDate') || null, 
        inventory: userInventory, 
        equips: userEquips, 
        equipped: userEquipped 
    };
    try { await set(ref(database, `users/${currentUserUid}/cloudData`), cloudProfile); } catch(e){}
    calculateEquipStats();
};

userRankData.mulungCoins = userRankData.mulungCoins || 0;
userInventory.blackCubes = userInventory.blackCubes || 0;

let mulungReqId;
let isMulungLoopRunning = false; // 🔥 좀비 루프 방지 철벽 가드
let isMulungMatchmaking = false; // 🔥 매칭 버튼 연타 방지 가드

let mulungState = {
    active: false, status: 'PREP', wave: 1, bossHp: 0, maxHp: 0, coins: 0,
    bossName: "", time: 0, isDead: false,
    myUnits: [null, null, null], oppUnits: [null, null, null],
    projectiles: [], vfx: [], dmgTexts: [], fumaList: [], roundTime: 60
};

let cubeTempOptions = null;
let cubeTargetEq = null;
let cubeTargetIndex = -1;
let cubeIsEquipped = false;
let selectedOppUnitIdx = -1; 

window.openMulungShop = () => {
    document.getElementById('overlay').style.display = 'block';
    let modal = document.getElementById('mulung-shop-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'mulung-shop-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:4800; width:85%; max-width:320px; background:#fff; border:2px solid #004d40; padding:15px; border-radius:8px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    
    let html = `<h3 style="color:#004d40; margin-top:0;">🐼 무릉도장 상점</h3>
                <div style="font-size:13px; color:#555; margin-bottom:15px; font-weight:bold;">보유 무릉 코인: <span style="color:#e65100;">${userRankData.mulungCoins}</span>개</div>
                
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#e0f2f1; padding:10px; border-radius:6px; border:1px solid #b2dfdb;">
                        <span style="font-weight:bold; font-size:14px;">🧩 코인 조각</span>
                        <button class="ingame-btn premium-dark" style="width:80px; padding:6px 0; font-size:12px;" onclick="buyMulungItem('piece')">20 코인</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#e0f2f1; padding:10px; border-radius:6px; border:1px solid #b2dfdb;">
                        <span style="font-weight:bold; font-size:14px;">🌟 별의 기운</span>
                        <button class="ingame-btn premium-dark" style="width:80px; padding:6px 0; font-size:12px;" onclick="buyMulungItem('star')">10 코인</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#e0f2f1; padding:10px; border-radius:6px; border:1px solid #b2dfdb;">
                        <span style="font-weight:bold; font-size:14px;"><img src="image/equipbox.png" style="width:18px; vertical-align:middle; margin-right:4px;">장비 상자</span>
                        <button class="ingame-btn premium-dark" style="width:80px; padding:6px 0; font-size:12px;" onclick="buyMulungItem('equipBox')">100 코인</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#e0f2f1; padding:10px; border-radius:6px; border:1px solid #b2dfdb;">
                        <span style="font-weight:bold; font-size:14px;"><img src="image/blackcube.png" style="width:18px; vertical-align:middle; margin-right:4px;">블랙 큐브</span>
                        <button class="ingame-btn premium-dark" style="width:80px; padding:6px 0; font-size:12px;" onclick="buyMulungItem('cube')">200 코인</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f3e5f5; padding:10px; border-radius:6px; border:1px solid #ce93d8;">
                        <span style="font-weight:bold; font-size:14px;">💎 코어 젬스톤</span>
                        <button class="ingame-btn premium-dark" style="width:80px; padding:6px 0; font-size:12px;" onclick="buyMulungItem('gemstone')">500 코인</button>
                    </div>
                </div>
                <button class="ingame-btn premium-white" style="width:100%; padding:10px; margin-top:10px;" onclick="closeMulungShop()">닫기</button>`;
    modal.innerHTML = html;
    modal.style.display = 'block';
};

window.closeMulungShop = () => {
    document.getElementById('mulung-shop-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('online-overlay').style.display = 'flex';
    document.getElementById('online-menu-modal').style.display = 'none';
    let mlLobby = document.getElementById('mulung-lobby-modal');
    if(mlLobby) mlLobby.style.display = 'block';
    window.loadMulungRanking();
};

window.buyMulungItem = (type) => {
    let cost = { 'piece': 20, 'star': 10, 'equipBox': 100, 'cube': 200, 'gemstone': 500 }[type];
    if (userRankData.mulungCoins < cost) return window.showMessage("무릉 코인이 부족합니다.");
    userRankData.mulungCoins -= cost;
    if (type === 'piece') userInventory.coinPieces += 1;
    else if (type === 'star') userInventory.starPieces = (userInventory.starPieces || 0) + 1;
    else if (type === 'equipBox') userInventory.equipBoxes += 1;
    else if (type === 'cube') userInventory.blackCubes += 1;
    else if (type === 'gemstone') userCores.gemstones += 1; // 🔥 젬스톤 구매
    window.syncToCloud(); window.openMulungShop(); window.showMessage("구매를 완료했습니다!");
};

let originalOpenEquipDetailModal = window.openEquipDetailModal;
window.openEquipDetailModal = (eq, targetIdx, isEquipped) => {
    originalOpenEquipDetailModal(eq, targetIdx, isEquipped);
    let modal = document.getElementById('equip-detail-modal');
    if (modal && eq.options && eq.options.length > 0) {
        let btnContainer = modal.querySelector('div[style*="flex-direction:column; gap:8px;"]');
        if (btnContainer && !document.getElementById('btn-black-cube')) {
            let cubeBtn = document.createElement('button');
            cubeBtn.id = 'btn-black-cube';
            cubeBtn.className = "ingame-btn premium-dark";
            cubeBtn.style.cssText = "width:100%; padding:10px; font-size:13px; margin-bottom:5px;";
            cubeBtn.innerHTML = `<img src="image/blackcube.png" style="width:16px; vertical-align:middle; margin-right:4px;"> 블랙 큐브 사용 (보유: ${userInventory.blackCubes || 0}개)`;
            cubeBtn.onclick = () => window.useBlackCube(eq, targetIdx, isEquipped);
            btnContainer.insertBefore(cubeBtn, btnContainer.children[1]);
        }
    }
};

window.useBlackCube = (eq, targetIdx, isEquipped) => {
    if ((userInventory.blackCubes || 0) <= 0) return window.showMessage("블랙 큐브가 부족합니다.");
    let modal = document.getElementById('cube-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'cube-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:3800; width:90%; max-width:320px; background:#fff; border:2px solid #212121; padding:15px; border-radius:8px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    userInventory.blackCubes--; cubeTargetEq = eq; cubeTargetIndex = targetIdx; cubeIsEquipped = isEquipped;
    let optCount = eq.options.length; let availableTypes = [...OPTION_TYPES].sort(() => 0.5 - Math.random());
    cubeTempOptions = [];
    for (let i = 0; i < optCount; i++) {
        let optType = availableTypes.pop();
        let range = OPTION_RANGES[eq.grade][optType];
        let val = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        cubeTempOptions.push({ type: optType, value: val });
    }
    let beforeHtml = eq.options.map(o => `${o.type === 'atk' ? '공' : (o.type === 'spd' ? '속' : (o.type === 'crit' ? '크' : (o.type === 'cdmg' ? '치피' : '방관')))}+${o.value}%`).join('<br>');
    let afterHtml = cubeTempOptions.map(o => `${o.type === 'atk' ? '공' : (o.type === 'spd' ? '속' : (o.type === 'crit' ? '크' : (o.type === 'cdmg' ? '치피' : '방관')))}+${o.value}%`).join('<br>');

    modal.innerHTML = `
        <h3 style="color:#212121; margin-top:0;"><img src="image/blackcube.png" style="width:24px; vertical-align:middle; margin-right:4px;"> 블랙 큐브 결과</h3>
        <div style="display:flex; justify-content:space-around; align-items:center; background:#eceff1; padding:10px; border-radius:6px; margin-bottom:15px;">
            <div style="text-align:center; flex:1;"><div style="font-size:11px; color:#777; margin-bottom:5px;">기존 옵션</div><div style="font-size:13px; font-weight:bold; color:#546e7a;">${beforeHtml}</div></div>
            <div style="font-size:20px; color:#424242;">➔</div>
            <div style="text-align:center; flex:1;"><div style="font-size:11px; color:#d32f2f; margin-bottom:5px;">신규 옵션</div><div style="font-size:13px; font-weight:bold; color:#c62828;">${afterHtml}</div></div>
        </div>
        <div style="display:flex; gap:8px;">
            <button class="ingame-btn premium-blue" style="flex:1; padding:12px;" onclick="applyCubeResult(true)">신규 적용</button>
            <button class="ingame-btn premium-white" style="flex:1; padding:12px;" onclick="applyCubeResult(false)">기존 유지</button>
        </div>`;
    modal.style.display = 'block'; window.syncToCloud(); 
};

window.applyCubeResult = (applyNew) => {
    if (applyNew) { cubeTargetEq.options = cubeTempOptions; if (cubeIsEquipped) calculateEquipStats(); window.showMessage("신규 옵션이 적용되었습니다!"); } 
    else { window.showMessage("기존 옵션을 유지합니다."); }
    document.getElementById('cube-modal').style.display = 'none'; window.syncToCloud(); window.openEquipDetailModal(cubeTargetEq, cubeTargetIndex, cubeIsEquipped);
};

// 🔥 레전더리 색상 연두색(#76ff03)으로 완벽 교체
function getGradeColor(grade) {
    if(grade === 'Legendary') return '#76ff03'; 
    if(grade === 'Unique') return '#fb8c00';
    if(grade === 'Epic') return '#8e24aa';
    if(grade === 'Rare') return '#1e88e5';
    return '#9e9e9e';
}

function getEquipHtml(eqObj, type) {
    if(!eqObj) return `<div style="width:40px; height:40px; border:2px dashed #777; border-radius:4px;"></div>`;
    let fileName = type === '뱃지' ? 'emblem.png' : (type === '엠블럼' ? 'badge.png' : 'ring.png');
    let borderColor = getGradeColor(eqObj.grade);
    return `<div style="width:40px; height:40px; border:2px solid ${borderColor}; border-radius:4px; background:#fff; display:flex; justify-content:center; align-items:center; box-shadow:0 0 5px ${borderColor};"><img src="image/${fileName}" style="max-width:30px; max-height:30px;"></div>`;
}

window.startMulungMatchmaking = async () => {
    if (isMulungMatchmaking) return; // 🔥 다중 매칭 방지 가드!
    isMulungMatchmaking = true;

    window.closeAllModals();
    let mlLobby = document.getElementById('mulung-lobby-modal'); if (mlLobby) mlLobby.style.display = 'none';
    let onlineOv = document.getElementById('online-overlay'); if (onlineOv) onlineOv.style.display = 'none';
    
    let oppName = "의문의 동료 (AI)"; 
    let oppCardTotal = 50 + Math.floor(Math.random()*50);
    let oppStarTotal = 0;
    let oppEquipData = { '뱃지': null, '엠블럼': null, '링': null };

    oppCardData = {}; oppSkillLevels = { ...DEFAULT_SKILLS }; oppEquipStats = { atk: 0, spd: 0, crit: 0, cdmg: 0, pen: 0, flatAtk: 0, unpenetratedRate: 1.0 };

    try { 
        const snap = await get(child(ref(database), `users`)); 
        if (snap.exists()) { 
            let validUsers = []; 
            let allUsers = [];
            snap.forEach(c => { 
                let v = c.val(); 
                if (v.cloudData && v.nickname && c.key !== currentUserUid) {
                    allUsers.push(v);
                    let cTotal = 0;
                    if(v.cloudData.cards) {
                        try {
                            let parsedCards = JSON.parse(v.cloudData.cards);
                            cTotal = Object.values(parsedCards).reduce((sum, card) => sum + (card.grade||0), 0);
                        } catch(e){}
                    }
                    if (cTotal >= 5) validUsers.push(v);
                } 
            }); 
            
            let matchPool = validUsers.length > 0 ? validUsers : allUsers;
            
            if(matchPool.length > 0) { 
                let aiUser = matchPool[Math.floor(Math.random() * matchPool.length)]; 
                oppName = aiUser.nickname;
                if(aiUser.cloudData.cards) {
                    let parsedCards = JSON.parse(aiUser.cloudData.cards);
                    oppCardData = parsedCards;
                    oppCardTotal = Object.values(parsedCards).reduce((sum, c) => sum + (c.grade||0), 0);
                }
                if(aiUser.cloudData.skills) { oppSkillLevels = { ...DEFAULT_SKILLS, ...JSON.parse(aiUser.cloudData.skills) }; }
                if(aiUser.cloudData.equipped) {
                    ['뱃지', '엠블럼', '링'].forEach(slot => {
                        let item = aiUser.cloudData.equipped[slot] || aiUser.cloudData.equipped[slot==='뱃지'?'badge':(slot==='엠블럼'?'emblem':'ring')];
                        if(item) {
                            oppEquipData[slot] = item; oppStarTotal += (item.star || 0);
                            if (item.options && Array.isArray(item.options)) {
                                item.options.forEach(o => {
                                    if(o.type==='atk') oppEquipStats.atk += o.value; else if(o.type==='spd') oppEquipStats.spd += o.value; else if(o.type==='crit') oppEquipStats.crit += o.value; else if(o.type==='cdmg') oppEquipStats.cdmg += o.value; else if(o.type==='pen') oppEquipStats.unpenetratedRate *= (1 - (o.value / 100));
                                });
                            } else { oppEquipStats.atk += item.atk || 0; oppEquipStats.spd += item.spd || 0; oppEquipStats.crit += item.crit || 0; }
                            let star = item.star || 0; if (star > 0) { let perStar = STARFORCE_BONUS[item.grade] || 0; oppEquipStats.flatAtk += star * perStar; }
                        }
                    });
                }
            } 
        } 
    } catch(e) {}

    let myCardTotal = getTotalGrade();
    let myStarTotal = ['뱃지', '엠블럼', '링'].reduce((sum, slot) => sum + (userEquipped[slot] ? (userEquipped[slot].star || 0) : 0), 0);

    let intro = document.getElementById('mulung-intro-overlay');
    if (!intro) {
        let mDiv = document.createElement('div'); mDiv.id = 'mulung-intro-overlay';
        mDiv.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9000; align-items:center; justify-content:center;";
        document.body.appendChild(mDiv); intro = mDiv;
    }

    intro.innerHTML = `
        <div style="display:flex; flex-direction:column; width:85%; max-width:320px; gap:10px; align-items:center;">
            <div style="width:100%; background:linear-gradient(135deg, #b71c1c, #4a148c); border:2px solid #ffcdd2; border-radius:10px; padding:15px; text-align:center; color:#fff; box-shadow:0 8px 20px rgba(0,0,0,0.6); box-sizing:border-box;">
                <h3 style="margin:0 0 5px 0; color:#ff8a80; font-size:14px;">동료의 스펙</h3>
                <div style="font-size:18px; font-weight:900; margin-bottom:10px; letter-spacing:-0.5px;">${oppName}</div>
                <div style="display:flex; justify-content:center; gap:15px; font-size:12px; margin-bottom:12px; background:rgba(0,0,0,0.3); padding:6px; border-radius:6px;">
                    <span>📕 도감: Lv.<b style="color:#ffeb3b">${oppCardTotal}</b></span><span>⭐ 스타포스: <b style="color:#ffeb3b">${oppStarTotal}</b>성</span>
                </div>
                <div style="display:flex; justify-content:center; gap:12px;">${getEquipHtml(oppEquipData['뱃지'], '뱃지')}${getEquipHtml(oppEquipData['엠블럼'], '엠블럼')}${getEquipHtml(oppEquipData['링'], '링')}</div>
            </div>
            
            <div style="font-size:26px; font-weight:900; color:#ffeb3b; text-shadow:0 0 10px #ff1744, 2px 2px 0px #000; font-style:italic;">WITH</div>
            
            <div style="width:100%; background:linear-gradient(135deg, #1e3c72, #004d40); border:2px solid #b2dfdb; border-radius:10px; padding:15px; text-align:center; color:#fff; box-shadow:0 8px 20px rgba(0,0,0,0.6); box-sizing:border-box;">
                <h3 style="margin:0 0 5px 0; color:#80cbc4; font-size:14px;">나의 스펙</h3>
                <div style="font-size:18px; font-weight:900; margin-bottom:10px; letter-spacing:-0.5px;">${currentUserName}</div>
                <div style="display:flex; justify-content:center; gap:15px; font-size:12px; margin-bottom:12px; background:rgba(0,0,0,0.3); padding:6px; border-radius:6px;">
                    <span>📕 도감: Lv.<b style="color:#ffeb3b">${myCardTotal}</b></span><span>⭐ 스타포스: <b style="color:#ffeb3b">${myStarTotal}</b>성</span>
                </div>
                <div style="display:flex; justify-content:center; gap:12px;">${getEquipHtml(userEquipped['뱃지'], '뱃지')}${getEquipHtml(userEquipped['엠블럼'], '엠블럼')}${getEquipHtml(userEquipped['링'], '링')}</div>
            </div>
        </div>`;
    
    intro.style.display = 'flex'; intro.style.opacity = '1';
    setTimeout(() => { 
        intro.style.opacity = '0'; 
        setTimeout(() => { 
            intro.style.display = 'none'; 
            isMulungMatchmaking = false; // 🔥 타이머 끝난 후 매칭 가드 해제!
            window.startMulungGame(oppName, oppEquipData, oppCardTotal, oppStarTotal); 
            window.showMessage("무릉도장 진입 완료!"); 
        }, 500); 
    }, 5000);
};

window.startMulungGame = (oppName, oppEquipData, oppCardTotal, oppStarTotal) => {
    state.status = 'MULUNG'; 
    isMulungLoopRunning = false; 
    cancelAnimationFrame(mainReqId);
    if (typeof mulungReqId !== 'undefined') cancelAnimationFrame(mulungReqId);
    
    // 🔥 글로벌 데이터까지 완벽 초기화 (전판 데이터 간섭 100% 차단)
    state.wave = 1;
    waveTimer = 0;
    spawnTimer = 0;
    
    monsters = []; towers = []; projectiles = []; hitEffects = []; visualEffects = []; fumaList = []; damageTexts = [];
    oppMonsters = []; oppTowers = []; oppProjectiles = []; oppVisualEffects = []; oppFumaList = []; oppDamageTexts = [];
    selectedUnitIdx = -1; selectedOppUnitIdx = -1;

    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (oppCtx) oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);

    window.switchScreen('game-container');
    
    setGridMode('MULUNG');
    document.getElementById('grid-container').style.display = 'grid';
    
    let oppBoardWrapper = document.getElementById('opp-board-wrapper');
    if (oppBoardWrapper) oppBoardWrapper.style.display = 'none'; 
    
    let oppGridEl = document.getElementById('opp-grid-container');
    if(oppGridEl) oppGridEl.style.display = 'grid';
    
    document.getElementById('boss-skip-wrapper').style.display = 'none';
    document.getElementById('best-wave-container').style.display = 'none';
    document.getElementById('btn-summon').style.display = 'none';
    
    let speedBtn = document.getElementById('btn-speed');
    if (speedBtn) { speedBtn.style.display = 'block'; state.speed = 1; speedBtn.innerText = "1배속"; }
    
    // 🔥 텍스트 강제 고정 (30층 등 이전 텍스트 덮어씌움)
    document.getElementById('ui-wave').innerText = "준비 중...";
    let timerEl = document.getElementById('ui-timer');
    if (timerEl) { timerEl.innerText = "10"; if (timerEl.nextSibling && timerEl.nextSibling.nodeType === 3 && !timerEl.nextSibling.textContent.includes('초')) { timerEl.nextSibling.textContent = '초'; } }
    
    try { let uiKills = document.getElementById('ui-kills'); if (uiKills && uiKills.parentElement) uiKills.parentElement.style.display = 'none'; let uiMobs = document.getElementById('ui-mobs'); if (uiMobs && uiMobs.parentElement) uiMobs.parentElement.style.display = 'none'; } catch(e) {}
    
    let guideEl = document.getElementById('early-guide');
    if (guideEl) { guideEl.style.display = 'block'; guideEl.innerHTML = `💡 가이드: 하단 유닛 승급을 통해 높은 층에 도달하세요!`; }
    
    let resourceRow = document.querySelector('.resource-row');
    if (resourceRow) {
        resourceRow.innerHTML = `
            <div style="display: flex; width: 100%; gap: 10px; justify-content:space-between;">
                <div class="meso-box" style="flex: 1; color: #e65100; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 5px;"><div style="font-size:11px;">🪙 코인</div><div id="ui-mulung-coins" style="font-weight:bold; font-size:14px;">0</div></div>
                <div class="mp-box" style="flex: 1.5; color: #333; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2; padding: 5px;"><div id="mulung-boss-name" style="font-weight:bold; font-size:13px; color:#d32f2f;">보스 등장 대기중</div><div id="mulung-boss-armor" style="font-size:11px; color:#555;">방어력 0%</div></div>
                <div style="flex: 1; display:flex; align-items:center; justify-content:center;"><button class="ingame-btn premium-blue" style="padding:8px 0; font-size:12px; width:100%; box-sizing:border-box; box-shadow:0 2px 5px rgba(0,0,0,0.5);" onclick="showMulungOppInfo()">🔍 동료 정보</button></div>
            </div>`;
    }

    let controlsPanel = document.getElementById('controls');
    if (controlsPanel) {
        controlsPanel.innerHTML = `<div style="text-align:center; font-weight:bold; font-size:14px; color:#004d40; margin-bottom: 5px; border-top: 1px dashed #00796b; padding-top: 5px;">🐼 무릉도장 유닛 승급 🐼</div><div class="upgrade-container" id="mulung-upgrade-buttons" style="display:flex; justify-content:center; gap:5px; padding-bottom: 10px;"></div>`;
    }

    mulungState = {
        active: true, status: 'SELECTING', prepTime: 10, wave: 1, coins: 0, oppCoins: 0,
        boss: null, lastTime: performance.now(),
        oppName: oppName, oppEquipData: oppEquipData, oppCardTotal: oppCardTotal, oppStarTotal: oppStarTotal,
        projectiles: [], vfx: [], dmgTexts: [], fumaList: [], roundTime: 60
    };

    window.showMulungClassSelect();
    
    // 🔥 철벽 가드: 새로 진입할 때 무조건 루프 재가동
    isMulungLoopRunning = true;
    mulungReqId = requestAnimationFrame(mulungLoop);
};

window.showMulungClassSelect = () => {
    let modal = document.getElementById('mulung-class-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'mulung-class-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:5000; width:85%; max-width:320px; background:#fff; border:2px solid #546e7a; padding:20px; border-radius:10px; text-align:center;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    
    modal.innerHTML = `
        <h3 style="margin-top:0; color:#263238;">직업 선택</h3>
        <p style="font-size:13px; color:#555; margin-bottom:15px; font-weight:bold;">무릉도장에서 활약할 직업을 골라주세요!</p>
        <div style="display:flex; gap:10px;">
            <button class="ingame-btn premium-red" style="flex:1; padding:15px 0; font-size:16px;" onclick="selectMulungClass('전사')">🗡️ 전사</button>
            <button class="ingame-btn premium-blue" style="flex:1; padding:15px 0; font-size:16px;" onclick="selectMulungClass('법사')">🪄 법사</button>
            <button class="ingame-btn premium-purple" style="flex:1; padding:15px 0; font-size:16px;" onclick="selectMulungClass('도적')">✦ 도적</button>
        </div>
    `;
    document.getElementById('overlay').style.display = 'block';
    modal.style.display = 'block';
};

window.selectMulungClass = (clsName) => {
    document.getElementById('mulung-class-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    
    grid[2] = { 
        idx: 2, type: clsName, cls: CLASSES[clsName], gradeIdx: 0, grade: GRADES[0], 
        x: 110 + 140, y: 362.5, 
        hp: 5, maxHp: 5, lastAttack: 0, globalCooldown: 0, threatCooldown: 0, rtdCooldown: 0, overloadTimer: 0, unitStunTimer: 0, damageDealt: 0, bindCooldown: 0, healCooldown: 0 
    };
    
    oppGrid[2] = { 
        idx: 2, type: clsName, cls: CLASSES[clsName], gradeIdx: 0, grade: GRADES[0], 
        x: 110 + 140, y: 112.5, 
        hp: 5, maxHp: 5, lastAttack: 0, globalCooldown: 0, threatCooldown: 0, rtdCooldown: 0, overloadTimer: 0, unitStunTimer: 0, bindCooldown: 0, healCooldown: 0 
    };
    
    renderGrid();
    renderOppGrid();
    updateMulungUI();
    
    mulungState.status = 'PREP';
    mulungState.lastTime = performance.now();
};

function spawnMulungBoss() {
    let w = mulungState.wave;
    let stage = ((w - 1) % 5) + 1; 
    document.getElementById('ui-wave').innerText = `${w}층 (${stage}/5)`;
    let hp = Math.floor(5000 * Math.pow(1.15, w)); 
    let armor = Math.floor((w - 1) / 30) * 0.10; 
    if(armor > 0.9) armor = 0.9;
    let bossNames = Object.keys(bossImages);
    let bName = bossNames[Math.floor((w - 1) / 5) % bossNames.length];

    mulungState.roundTime = 60; 

    mulungState.boss = {
        name: bName, hp: hp, maxHp: hp, armor: armor,
        x: -50, y: 225, speed: 10, // 🔥 보스 Y좌표를 225로 내려 발끝을 길 상단에 위치시킴
        threatTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0,
        stunTimer: 0, counterTimer: 5, bindTimer: 0, stage: stage
    };

    let bNameEl = document.getElementById('mulung-boss-name');
    let bArmorEl = document.getElementById('mulung-boss-armor');
    if (bNameEl) bNameEl.innerText = `${bName} (${stage}/5)`;
    if (bArmorEl) bArmorEl.innerText = `방어력 ${Math.round(armor*100)}%`;
}

function updateMulungUI() {
    let coinSpan = document.getElementById('ui-mulung-coins');
    if (coinSpan) coinSpan.innerText = mulungState.coins;

    let upgradeContainer = document.getElementById('mulung-upgrade-buttons');
    if(!upgradeContainer) return;

    let clsNames = ['전사', '법사', '도적'];
    upgradeContainer.innerHTML = clsNames.map((clsName) => {
        let u = grid.find(unit => unit && unit.cls.type === clsName);
        let cost, actionLabel, borderColor;
        
        if (u) {
            cost = u.gradeIdx >= 8 ? 'MAX' : (u.gradeIdx + 2);
            borderColor = u.gradeIdx >= 8 ? '#424242' : '#ff9800';
            let nextGradeName = u.gradeIdx >= 8 ? 'MAX' : GRADES[u.gradeIdx + 1].name;
            actionLabel = `${nextGradeName} 레벨업`;
        } else {
            cost = 1;
            borderColor = '#9e9e9e';
            actionLabel = `유닛 생성`;
        }
        
        let canAfford = mulungState.coins >= (cost === 'MAX' ? Infinity : cost);
        let btnOpacity = canAfford ? '1.0' : '0.6';

        return `
        <div class="upgrade-box" onclick="upgradeMulungUnit('${clsName}')" style="cursor:pointer; flex: 1; padding: 10px 5px; border: 2px solid ${borderColor}; border-radius: 8px; background: #fffdf7; opacity: ${btnOpacity}; text-align:center;">
            <div style="font-size:22px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${CLASSES[clsName].icon}</div>
            <div class="job-title" style="color:${CLASSES[clsName].color}; font-size:13px; margin-top:2px;">${clsName}</div>
            <div style="font-size:11px; font-weight:bold; color:#333; margin:5px 0;">${actionLabel}</div>
            <div class="cost" style="color:#d32f2f; font-size:12px; font-weight:900;">${cost} 코인</div>
        </div>`;
    }).join('');
}

window.upgradeMulungUnit = (clsName) => {
    if (mulungState.status === 'PREP' || mulungState.status === 'SELECTING') return window.showMessage("전투가 시작되어야 강화가 가능합니다!");
    
    let u = grid.find(unit => unit && unit.cls.type === clsName);
    
    if (u) {
        if(u.gradeIdx >= 8) return window.showMessage("최대 등급입니다.");
        let cost = u.gradeIdx + 2; 
        if(mulungState.coins < cost) return window.showMessage(`코인이 부족합니다. (${cost}개 필요)`);
        mulungState.coins -= cost;
        u.gradeIdx++;
        u.grade = GRADES[u.gradeIdx]; 
        u.hp = u.maxHp = 5; 
        
        if (u.gradeIdx >= 5) {
            let container = document.getElementById('game-container'); 
            if(container) { container.classList.add('shake-active'); setTimeout(() => container.classList.remove('shake-active'), 400); }
        }
    } else {
        let currentCount = grid.filter(v => v !== null).length;
        if (currentCount >= 3) return window.showMessage("최대 3유닛까지만 배치 가능합니다.");
        
        let cost = 1; 
        if(mulungState.coins < cost) return window.showMessage(`코인이 부족합니다. (${cost}개 필요)`);
        mulungState.coins -= cost;
        
        let emptyIdx = grid.findIndex(v => v === null);
        grid[emptyIdx] = { 
            idx: emptyIdx, type: clsName, cls: CLASSES[clsName], gradeIdx: 0, grade: GRADES[0], 
            x: 110 + (emptyIdx % 5) * 70, y: 362.5, 
            hp: 5, maxHp: 5, lastAttack: 0, globalCooldown: 0, threatCooldown: 0, rtdCooldown: 0, overloadTimer: 0, unitStunTimer: 0, damageDealt: 0, bindCooldown: 0, healCooldown: 0 
        };
    }
    
    renderGrid();
    updateMulungUI();
};

function mulungLoop() {
    // 🔥 게임 종료 시 확실하게 무릉 루프를 죽이는 구조
    if (!mulungState.active) {
        isMulungLoopRunning = false;
        return;
    }
    
    let now = performance.now(); let dtReal = (now - mulungState.lastTime) / 1000; 
    if (dtReal > 0.1) dtReal = 0.1; if (dtReal < 0) dtReal = 0.016; 
    
    let dt = dtReal * (state.speed || 1); 
    mulungState.lastTime = now;

    if (mulungState.status === 'SELECTING') {
        drawMulung();
        mulungReqId = requestAnimationFrame(mulungLoop);
        return;
    }

    if (mulungState.status === 'PREP') {
        mulungState.prepTime -= dtReal; 
        document.getElementById('ui-timer').innerText = Math.ceil(Math.max(0, mulungState.prepTime));
        
        if (mulungState.prepTime <= 0) {
            mulungState.status = 'PLAY';
            let timerEl = document.getElementById('ui-timer');
            if (timerEl) { timerEl.innerText = "60"; if (timerEl.nextSibling && timerEl.nextSibling.nodeType === 3 && !timerEl.nextSibling.textContent.includes('초')) { timerEl.nextSibling.textContent = '초'; } }
            spawnMulungBoss(); 
        }
        drawMulung();
        mulungReqId = requestAnimationFrame(mulungLoop);
        return;
    }

    let b = mulungState.boss;
    if (!b) { drawMulung(); mulungReqId = requestAnimationFrame(mulungLoop); return; }

    mulungState.roundTime -= dt;
    let timerEl = document.getElementById('ui-timer');
    if (timerEl) { timerEl.innerText = Math.ceil(Math.max(0, mulungState.roundTime)); }

    if (mulungState.roundTime <= 0 || b.x > 550) return endMulungGame();

    if (b.freezeTimer > 0) { b.freezeTimer -= dt; b.freezeTickTimer -= dt; if (b.freezeTickTimer <= 0) { b.hp -= b.freezeDmgVal; b.freezeTickTimer = 1; } }
    if (b.threatTimer > 0) b.threatTimer -= dt;
    
    let canMove = true;
    if (b.bindTimer > 0) { b.bindTimer -= dt; canMove = false; }
    if (b.stunTimer > 0) { b.stunTimer -= dt; canMove = false; }

    if (canMove) {
        let currentSpeed = b.speed;
        if (b.freezeTimer > 0) currentSpeed *= 0.5;
        b.x += currentSpeed * dt;
    }

    if (mulungState.wave >= 60) {
        b.counterTimer -= dt;
        if (b.counterTimer <= 0) {
            let target = null; let maxDmg = -1;
            grid.forEach(u => { if (u && u.hp > 0 && u.damageDealt > maxDmg) { maxDmg = u.damageDealt; target = u; } });
            
            if (target) {
                target.hp -= 1;
                mulungState.vfx.push({ type: 'hit', x: target.x, y: target.y, timer: 0.5, color: '#ff0000' });
                
                if (target.hp <= 0) {
                    let oldGrade = GRADES[target.gradeIdx].name;
                    target.gradeIdx = Math.max(0, target.gradeIdx - 2);
                    target.grade = GRADES[target.gradeIdx]; 
                    target.hp = target.maxHp = 5;
                    target.damageDealt = 0; 
                    window.showMessage(`☠️ 보스 반격! [${target.type}] ${oldGrade} ➔ ${GRADES[target.gradeIdx].name} 강등!`);
                    renderGrid();
                    updateMulungUI();
                } else {
                    let hpBar = document.getElementById(`hp-bar-${target.idx}`);
                    if (hpBar) hpBar.style.width = Math.max(0, (target.hp / target.maxHp) * 100) + '%';
                    else renderGrid();
                }
            }
            b.counterTimer = 5; 
        }
    }

    let cardMulti = 1 + (getTotalCardBonus() / 100); 
    let rageMulti = 1 + getSkillValue('common_rage', skillLevels.common_rage) + (equipStats.atk * 0.01); 
let sharpChance = getSkillValue('common_sharp', skillLevels.common_sharp) + (equipStats.crit * 0.01); 
let windReduc = 1 + getSkillValue('common_wind', skillLevels.common_wind) + (equipStats.spd * 0.01);
    let myUnpen = equipStats.unpenetratedRate;
    if (b.threatTimer > 0) myUnpen *= 0.9;
    let appliedArmor = b.armor * myUnpen;

    grid.forEach((u) => {
        if (!u) return; 
        
        if (u.globalCooldown === undefined) u.globalCooldown = 0;
        if (u.bindCooldown === undefined) u.bindCooldown = 0;
        if (u.healCooldown === undefined) u.healCooldown = 0;
        if (u.threatCooldown === undefined) u.threatCooldown = 0;
        if (u.rtdCooldown === undefined) u.rtdCooldown = 0;

        let overloadMult = 1;
        if (u.overloadTimer > 0) {
            u.overloadTimer -= dt; overloadMult = 2;
            if (u.overloadTimer <= 0) u.unitStunTimer = skillLevels.thief_overload === 1 ? 6 : 5;
        }
        if (u.unitStunTimer > 0) u.unitStunTimer -= dt;
        let isStunned = (u.unitStunTimer > 0);

        if (u.gradeIdx >= 6 && u.cls.type === '법사' && skillLevels.mage_heal > 0) {
            u.healCooldown -= dt * 1000;
            let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
            let hbar = document.getElementById(`heal-bar-${u.idx}`);
            if (hbar) hbar.style.width = Math.max(0, Math.min(100, ((maxHealCd - u.healCooldown) / maxHealCd) * 100)) + '%';
            
            if (u.healCooldown <= 0 && !isStunned) {
                grid.forEach(tu => { 
                    if(!tu) return;
                    tu.hp = Math.min(tu.maxHp, tu.hp + 1); 
                    mulungState.vfx.push({ type: 'heal', x: tu.x, y: tu.y, timer: 1.0 }); 
                    let hpBar = document.getElementById(`hp-bar-${tu.idx}`);
                    if (hpBar) hpBar.style.width = Math.max(0, (tu.hp / tu.maxHp) * 100) + '%';
                });
                u.healCooldown += maxHealCd;
            }
        }
        if (u.gradeIdx >= 7) {
            if (u.cls.type === '전사' && skillLevels.war_threat > 0) {
                u.threatCooldown -= dt * 1000;
                let tbar = document.getElementById(`threat-bar-${u.idx}`);
                if (tbar) tbar.style.width = Math.max(0, Math.min(100, ((25000 - u.threatCooldown) / 25000) * 100)) + '%';
                
                if (u.threatCooldown <= 0 && !isStunned) { b.threatTimer = skillLevels.war_threat * 2; u.threatCooldown += 25000; mulungState.vfx.push({ type: 'threat1', x: u.x, y: u.y, timer: 1.0 }); }
            }
            if (u.cls.type === '도적' && skillLevels.thief_overload > 0) {
                u.rtdCooldown -= dt * 1000;
                let rbar = document.getElementById(`rtd-bar-${u.idx}`);
                if (rbar) rbar.style.width = Math.max(0, Math.min(100, ((45000 - u.rtdCooldown) / 45000) * 100)) + '%';

                if (u.rtdCooldown <= 0 && (u.overloadTimer||0) <= 0 && !isStunned) { u.overloadTimer = skillLevels.thief_overload === 5 ? 15 : 6 + (skillLevels.thief_overload * 2); u.rtdCooldown += 45000; mulungState.vfx.push({ type: 'rtd', x: u.x, y: u.y, timer: 1.0 }); }
            }
        }
        
        if (u.gradeIdx === 6 && u.cls.type !== '법사') {
            u.bindCooldown -= dt * 1000;
            let bar = document.getElementById(`bind-bar-${u.idx}`); 
            if (bar) bar.style.width = Math.max(0, Math.min(100, ((75000 - u.bindCooldown) / 75000) * 100)) + '%';

            if (u.bindCooldown <= 0 && b.bindTimer <= 0 && !isStunned) { b.bindTimer = 10; u.bindCooldown += 75000; }
        }

        if (u.gradeIdx >= 5) {
            if ((u.cls.type === '전사' && (skillLevels.war_death||0) > 0) || (u.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) || (u.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0)) {
                u.globalCooldown -= dt * 1000;
                let gbar = document.getElementById(`global-bar-${u.idx}`);
                if (gbar) gbar.style.width = Math.max(0, Math.min(100, ((60000 - u.globalCooldown) / 60000) * 100)) + '%';

                if (u.globalCooldown <= 0 && !isStunned) {
                    let baseDmg = (CLASSES[u.cls.type].baseDmg + equipStats.flatAtk) * GRADES[u.gradeIdx].mult * cardMulti * rageMulti; 
                    if (u.cls.type === '전사' && (skillLevels.war_death||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.war_death||0) * 1.5); mulungState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg, isOpp: false }); u.globalCooldown += 60000; }
                    else if (u.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.mage_thunder||0) * 1.5); mulungState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg, isOpp: false }); u.globalCooldown += 60000; }
                    else if (u.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0) { 
                        let gdmg = baseDmg * (1.5 + (skillLevels.thief_fuma||0) * 1.5); 
                        // 🔥 풍마수리검 Y좌표도 225로 동기화
                        mulungState.fumaList.push({ x: u.x, y: 225, dmg: gdmg, hitSet: new Set(), angle: 0, isOpp: false }); 
                        u.globalCooldown += 60000; 
                    }
                }
            }
        }
        
        u.lastAttack -= dt * 1000; 
        let attackCd = (CLASSES[u.cls.type].cd * (GRADES[u.gradeIdx].speedMul || 1)) / (windReduc * overloadMult); 
        while(u.lastAttack <= 0) {
            if (isStunned) { u.lastAttack = 0; break; }
            let attackRange = (CLASSES[u.cls.type].range || 150) * u.grade.rangeMul * 1.5; 
            if (Math.hypot(b.x - u.x, b.y - u.y) <= attackRange) {
                let dmg = (CLASSES[u.cls.type].baseDmg + equipStats.flatAtk) * GRADES[u.gradeIdx].mult * cardMulti * rageMulti; 
                if (b.threatTimer > 0) dmg *= 1.3; 
                let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= (1.2 + (equipStats.cdmg / 100)); 
                let isFinal = false; if (u.cls.type === '전사' && (skillLevels.war_final||0) > 0 && Math.random() < ((skillLevels.war_final||0) * 0.03)) { isFinal = true; dmg *= 2; }
                
                mulungState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: b.x, ty: b.y, dmg: dmg, color: CLASSES[u.cls.type].color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg, sourceTower: u, isMine: true });
                if (u.cls.type === '도적' && (skillLevels.thief_shadow||0) > 0 && Math.random() < ((skillLevels.thief_shadow||0) * 0.03)) { mulungState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: b.x, ty: b.y, dmg: dmg, color: CLASSES[u.cls.type].color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: false, baseDmgToPass: dmg, isMine: true, isShadow: true }); }
                u.lastAttack += attackCd;
            } else {
                u.lastAttack = 0; break;
            }
        }
    });

    let oppCardBonus = oppCardData ? Object.values(oppCardData).reduce((sum, c) => sum + (c.grade||0)*0.5, 0) : 0;
    let oppCardMulti = 1 + (oppCardBonus / 100); 
    let oppRageMulti = 1 + getSkillValue('common_rage', oppSkillLevels.common_rage) + (oppEquipStats.atk * 0.01);
    let oppSharpChance = getSkillValue('common_sharp', oppSkillLevels.common_sharp) + (oppEquipStats.crit * 0.01); 
    let oppWindReduc = 1 + getSkillValue('common_wind', oppSkillLevels.common_wind) + (oppEquipStats.spd * 0.01);
    let oppUnpen = oppEquipStats.unpenetratedRate;
    if (b.threatTimer > 0) oppUnpen *= 0.9;
    let oppAppliedArmor = b.armor * oppUnpen;

    oppGrid.forEach((u) => {
        if (!u) return;

        if (u.globalCooldown === undefined) u.globalCooldown = 0;
        if (u.bindCooldown === undefined) u.bindCooldown = 0;
        if (u.healCooldown === undefined) u.healCooldown = 0;
        if (u.threatCooldown === undefined) u.threatCooldown = 0;
        if (u.rtdCooldown === undefined) u.rtdCooldown = 0;

        let overloadMult = 1;
        if (u.overloadTimer > 0) {
            u.overloadTimer -= dt; overloadMult = 2;
            if (u.overloadTimer <= 0) u.unitStunTimer = oppSkillLevels.thief_overload === 1 ? 6 : 5;
        }
        if (u.unitStunTimer > 0) u.unitStunTimer -= dt;
        let isStunned = (u.unitStunTimer > 0);

        if (u.gradeIdx >= 6 && u.cls.type === '법사' && oppSkillLevels.mage_heal > 0) {
            u.healCooldown -= dt * 1000;
            if (u.healCooldown <= 0 && !isStunned) {
                oppGrid.forEach(tu => { 
                    if(!tu) return;
                    tu.hp = Math.min(tu.maxHp, tu.hp + 1); 
                    mulungState.vfx.push({ type: 'heal', x: tu.x, y: tu.y, timer: 1.0 }); 
                });
                u.healCooldown += (70 - oppSkillLevels.mage_heal * 10) * 1000;
            }
        }
        if (u.gradeIdx >= 7) {
            if (u.cls.type === '전사' && oppSkillLevels.war_threat > 0) {
                u.threatCooldown -= dt * 1000;
                if (u.threatCooldown <= 0 && !isStunned) { b.threatTimer = oppSkillLevels.war_threat * 2; u.threatCooldown += 25000; mulungState.vfx.push({ type: 'threat1', x: u.x, y: u.y, timer: 1.0 }); }
            }
            if (u.cls.type === '도적' && oppSkillLevels.thief_overload > 0) {
                u.rtdCooldown -= dt * 1000;
                if (u.rtdCooldown <= 0 && (u.overloadTimer||0) <= 0 && !isStunned) { u.overloadTimer = oppSkillLevels.thief_overload === 5 ? 15 : 6 + (oppSkillLevels.thief_overload * 2); u.rtdCooldown += 45000; mulungState.vfx.push({ type: 'rtd', x: u.x, y: u.y, timer: 1.0 }); }
            }
        }
        if (u.gradeIdx === 6 && u.cls.type !== '법사') {
            u.bindCooldown -= dt * 1000;
            if (u.bindCooldown <= 0 && b.bindTimer <= 0 && !isStunned) { b.bindTimer = 10; u.bindCooldown += 75000; }
        }

        if (u.gradeIdx >= 5) {
            if ((u.cls.type === '전사' && (oppSkillLevels.war_death||0) > 0) || (u.cls.type === '법사' && (oppSkillLevels.mage_thunder||0) > 0) || (u.cls.type === '도적' && (oppSkillLevels.thief_fuma||0) > 0)) {
                u.globalCooldown -= dt * 1000;
                if (u.globalCooldown <= 0 && !isStunned) {
                    let baseDmg = (CLASSES[u.cls.type].baseDmg + oppEquipStats.flatAtk) * GRADES[u.gradeIdx].mult * oppCardMulti * oppRageMulti; 
                    if (u.cls.type === '전사' && (oppSkillLevels.war_death||0) > 0) { let gdmg = baseDmg * (1.5 + (oppSkillLevels.war_death||0) * 1.5); mulungState.vfx.push({ type: 'death', timer: 1.2, dmg: gdmg, isOpp: true }); u.globalCooldown += 60000; }
                    else if (u.cls.type === '법사' && (oppSkillLevels.mage_thunder||0) > 0) { let gdmg = baseDmg * (1.5 + (oppSkillLevels.mage_thunder||0) * 1.5); mulungState.vfx.push({ type: 'thunder', timer: 0.5, dmg: gdmg, isOpp: true }); u.globalCooldown += 60000; }
                    else if (u.cls.type === '도적' && (oppSkillLevels.thief_fuma||0) > 0) { 
                        let gdmg = baseDmg * (1.5 + (oppSkillLevels.thief_fuma||0) * 1.5); 
                        mulungState.fumaList.push({ x: u.x, y: 225, dmg: gdmg, hitSet: new Set(), angle: 0, isOpp: true }); 
                        u.globalCooldown += 60000; 
                    }
                }
            }
        }

        u.lastAttack -= dt * 1000; 
        let attackCd = (CLASSES[u.cls.type].cd * (GRADES[u.gradeIdx].speedMul || 1)) / (oppWindReduc * overloadMult); 
        while(u.lastAttack <= 0) {
            if (isStunned) { u.lastAttack = 0; break; }
            let attackRange = (CLASSES[u.cls.type].range || 150) * u.grade.rangeMul * 1.5; 
            if (Math.hypot(b.x - u.x, b.y - u.y) <= attackRange) {
                let dmg = (CLASSES[u.cls.type].baseDmg + oppEquipStats.flatAtk) * GRADES[u.gradeIdx].mult * oppCardMulti * oppRageMulti; 
                if (b.threatTimer > 0) dmg *= 1.3; 
                let isCrit = Math.random() < oppSharpChance; if (isCrit) dmg *= (1.2 + (oppEquipStats.cdmg / 100)); 
                let isFinal = false; if (u.cls.type === '전사' && oppSkillLevels.war_final > 0 && Math.random() < getSkillValue('war_final', oppSkillLevels.war_final)) { isFinal = true; dmg *= 2; }
                
                mulungState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: b.x, ty: b.y, dmg: dmg, color: CLASSES[u.cls.type].color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg, isMine: false, appliedArmor: oppAppliedArmor });
                if (u.cls.type === '도적' && (oppSkillLevels.thief_shadow||0) > 0 && Math.random() < ((oppSkillLevels.thief_shadow||0) * 0.03)) { mulungState.projectiles.push({ type: u.cls.type, x: u.x, y: u.y, tx: b.x, ty: b.y, dmg: dmg, color: CLASSES[u.cls.type].color, angle: 0, gradeIdx: u.gradeIdx, isCrit: isCrit, isFinal: false, baseDmgToPass: dmg, isMine: false, appliedArmor: oppAppliedArmor, isShadow: true }); }
                u.lastAttack += attackCd;
            } else {
                u.lastAttack = 0; break;
            }
        }
    });

    for(let i=mulungState.fumaList.length-1; i>=0; i--) {
        let f = mulungState.fumaList[i]; f.angle += 15 * dt; 
        f.x += 300 * dt; 
        
        if (b && b.hp > 0 && !f.hitSet.has(b.stage) && Math.hypot(b.x - f.x, b.y - f.y) <= 80) {
            let finalArmor = f.isOpp ? oppAppliedArmor : appliedArmor;
            let actualDmg = f.dmg * (1 - finalArmor);
            if (b.threatTimer > 0) actualDmg *= 1.3;
            b.hp -= actualDmg;
            f.hitSet.add(b.stage); 
            mulungState.dmgTexts.push({ val: Math.floor(actualDmg), x: b.x + (Math.random()-0.5)*30, y: b.y - 40 + (Math.random()-0.5)*30, timer: 0.6, isCrit: true });
        }
        if (f.x > 600) mulungState.fumaList.splice(i, 1);
    }

    for(let i=mulungState.projectiles.length-1; i>=0; i--) {
        let p = mulungState.projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 600 * dt;
        if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            let hitDmg = p.dmg; 
            if (p.type === '전사') hitDmg *= 1.5;
            
            if (p.isMine !== undefined && p.isMine === false) { hitDmg *= (1 - p.appliedArmor); }
            else { hitDmg *= (1 - appliedArmor); }

            b.hp -= hitDmg;
            if (p.isMine && p.sourceTower) p.sourceTower.damageDealt += hitDmg;

            mulungState.dmgTexts.push({ val: Math.floor(hitDmg), x: b.x + (Math.random()-0.5)*30, y: b.y - 40 + (Math.random()-0.5)*30, timer: 0.6, isCrit: p.isCrit });
            
            mulungState.projectiles.splice(i, 1);
        } else { let moveAmt = speed; if (p.isShadow) moveAmt *= 0.85; p.x += (dx/dist)*moveAmt; p.y += (dy/dist)*moveAmt; }
    }
    
    for (let i = mulungState.vfx.length - 1; i >= 0; i--) { 
        mulungState.vfx[i].timer -= dt; 
        if (mulungState.vfx[i].timer <= 0) { 
            let v = mulungState.vfx[i];
            if (v.type === 'death' || v.type === 'thunder') {
                if (b && b.hp > 0) {
                    let finalArmor = v.isOpp ? oppAppliedArmor : appliedArmor;
                    let actualDmg = v.dmg * (1 - finalArmor);
                    if (b.threatTimer > 0) actualDmg *= 1.3;
                    b.hp -= actualDmg;
                    mulungState.dmgTexts.push({ val: Math.floor(actualDmg), x: b.x + (Math.random()-0.5)*30, y: b.y - 40 + (Math.random()-0.5)*30, timer: 0.6, isCrit: true });
                }
            }
            mulungState.vfx.splice(i, 1); 
        } 
    }
    for (let i = mulungState.dmgTexts.length - 1; i >= 0; i--) { mulungState.dmgTexts[i].timer -= dtReal; mulungState.dmgTexts[i].y -= dtReal * 60; if (mulungState.dmgTexts[i].timer <= 0) mulungState.dmgTexts.splice(i, 1); }

    if (b.hp <= 0) {
        let rewardCoins = (mulungState.wave % 5 === 0) ? 5 : 0;
        mulungState.coins += rewardCoins;
        mulungState.oppCoins += rewardCoins;
        
        let minGrade = 99; let targetAiIdx = -1;
        oppGrid.forEach((u, idx) => { if (u && u.gradeIdx < 8 && u.gradeIdx < minGrade) { minGrade = u.gradeIdx; targetAiIdx = idx; } });
        
        if (targetAiIdx !== -1 && mulungState.oppCoins >= (minGrade + 2)) {
            mulungState.oppCoins -= (minGrade + 2);
            oppGrid[targetAiIdx].gradeIdx++;
            oppGrid[targetAiIdx].grade = GRADES[oppGrid[targetAiIdx].gradeIdx];
        } else if (oppGrid.filter(u => u !== null).length < 3 && mulungState.oppCoins >= 1) {
            mulungState.oppCoins -= 1;
            let aiEmptyIdx = oppGrid.findIndex(v => v === null);
            let clsNames = Object.keys(CLASSES);
            let currentAiTypes = [];
            for (let j=0; j<5; j++) if(oppGrid[j]) currentAiTypes.push(oppGrid[j].type);
            
            let availableAiClasses = clsNames.filter(c => !currentAiTypes.includes(c));
            if (availableAiClasses.length > 0) {
                let aiClsName = availableAiClasses[Math.floor(Math.random() * availableAiClasses.length)];
                oppGrid[aiEmptyIdx] = { 
                    idx: aiEmptyIdx, type: aiClsName, cls: CLASSES[aiClsName], gradeIdx: 0, grade: GRADES[0], 
                    x: 110 + (aiEmptyIdx % 5) * 70, y: 112.5, 
                    hp: 5, maxHp: 5, lastAttack: 0, globalCooldown: 0, threatCooldown: 0, rtdCooldown: 0, overloadTimer: 0, unitStunTimer: 0, bindCooldown: 0, healCooldown: 0 
                };
            }
        }

        mulungState.wave++;
        renderOppGrid();
        updateMulungUI();
        spawnMulungBoss();
    }

    drawMulung();
    mulungReqId = requestAnimationFrame(mulungLoop);
}

function drawMulung() {
    if(!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(188, 170, 164, 0.5)"; ctx.lineWidth = 40; ctx.lineJoin = "round"; ctx.beginPath();
    ctx.moveTo(0, 235); ctx.lineTo(500, 235); ctx.stroke(); 

    // 🔥 폰트 굵기 800으로 설정
    ctx.font = "800 18px NanumSquare"; 
    ctx.fillStyle = "#ffffff"; 
    ctx.textAlign = "center";

    // 🔥 검은색 그림자를 진하게 넣어서 글씨를 배경과 분리 (선명도 UP)
    ctx.shadowColor = "#000000"; 
    ctx.shadowBlur = 4; 
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillText(mulungState.oppName, 250, 40);
    ctx.fillText(currentUserName, 250, 480);

    // 🔥 그림자 설정 초기화 (다른 유닛이나 이펙트 그릴 때 영향 안 가게)
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    let b = mulungState.boss;
    
    grid.forEach(u => {
        if (u && u.unitStunTimer > 0) { ctx.font = "bold 20px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", u.x, u.y - 25); }
    });
    oppGrid.forEach(u => {
        if (u && u.unitStunTimer > 0) { ctx.font = "bold 20px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText("💫", u.x, u.y - 25); }
    });

    mulungState.vfx.forEach(v => {
        ctx.save(); 
        if (v.type === 'death') {
            let progress = Math.min(1, (1.2 - v.timer) / 0.2); 
            ctx.globalAlpha = 0.5; 
            ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.shadowColor = "#f57f17"; ctx.shadowBlur = 15; 
            let currentX = -50 + (600) * progress; let currentY = 550 + (-600) * progress; ctx.beginPath(); ctx.moveTo(-50, 550); ctx.lineTo(currentX, currentY); ctx.stroke(); 
        }
        else if (v.type === 'thunder') {
            ctx.fillStyle = `rgba(0, 229, 255, ${v.timer * 0.3})`; 
            ctx.fillRect(0,0,500,500); 
            ctx.strokeStyle = `rgba(255, 255, 255, ${v.timer * 1.5})`; ctx.lineWidth = 20; 
            ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(150,250); ctx.lineTo(350,250); ctx.lineTo(250,500); ctx.stroke(); 
        }
        else {
            ctx.translate(v.x, v.y);
            if (v.type === 'hit') { ctx.globalAlpha = (v.timer / 0.5); ctx.fillStyle = v.color; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill(); }
            else if (v.type === 'heal' && healEffectImg.complete) { let hSize = 40; let p2 = 1 - v.timer; ctx.beginPath(); ctx.rect(-hSize/2, hSize/2 - hSize*p2 - 20, hSize, hSize*p2); ctx.clip(); ctx.drawImage(healEffectImg, -hSize/2, -hSize/2 - 20, hSize, hSize); }
            else if (v.type === 'threat1' && threatEffect1Img.complete) { ctx.globalAlpha = Math.sin((1 - v.timer) * Math.PI); ctx.drawImage(threatEffect1Img, -20, -50, 40, 40); }
            else if (v.type === 'rtd' && rtdEffectImg.complete) { ctx.globalAlpha = Math.sin((1 - v.timer) * Math.PI); ctx.drawImage(rtdEffectImg, -25, -60, 50, 50); }
        }
        ctx.restore();
    });
    
    mulungState.fumaList.forEach(f => {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
        if (fumaImg && fumaImg.complete) { let fsize = 80; ctx.drawImage(fumaImg, -fsize/2, -fsize/2, fsize, fsize); }
        ctx.restore();
    });

    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx]) { 
        let u = grid[selectedUnitIdx]; let attackRange = (CLASSES[u.cls.type].range || 150) * u.grade.rangeMul * 1.5; 
        ctx.save(); ctx.beginPath(); ctx.arc(u.x, u.y, attackRange, 0, Math.PI * 2); 
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 235, 59, 0.6)"; ctx.stroke(); ctx.restore(); 
    }
    if (typeof selectedOppUnitIdx !== 'undefined' && selectedOppUnitIdx !== -1 && oppGrid[selectedOppUnitIdx]) { 
        let u = oppGrid[selectedOppUnitIdx]; let attackRange = (CLASSES[u.cls.type].range || 150) * u.grade.rangeMul * 1.5; 
        ctx.save(); ctx.beginPath(); ctx.arc(u.x, u.y, attackRange, 0, Math.PI * 2); 
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 235, 59, 0.6)"; ctx.stroke(); ctx.restore(); 
    }

    mulungState.projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); let dir = Math.atan2(p.ty - p.y, p.tx - p.x); let scale = p.isFinal ? 1.3 : 1.0; ctx.scale(scale, scale);
        let img = null; let psize = 20;
        if (p.type === '전사') { img = p.gradeIdx >= 5 ? projImages.warrior2 : projImages.warrior1; ctx.rotate(dir + Math.PI); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '법사') { img = p.gradeIdx >= 5 ? projImages.mage2 : projImages.mage1; ctx.rotate(dir + (15 * Math.PI / 180)); psize = p.gradeIdx >= 5 ? 30 : 20; }
        else if (p.type === '도적') { img = p.gradeIdx >= 5 ? projImages.rogue2 : projImages.rogue1; ctx.rotate(p.angle); }
        if (img && img.complete) { ctx.drawImage(img, -psize/2, -psize/2, psize, psize); } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
    });

    if (b) {
        let size = 30; ctx.save(); 
        ctx.translate(b.x, b.y); 
        ctx.scale(-1, 1);
        if (bossImages[b.name] && bossImages[b.name].complete) { ctx.drawImage(bossImages[b.name], -size*1.5, -size*1.5, size*3, size*3); } 
        else { ctx.fillStyle = "#ef5350"; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill(); }
        
        if (b.freezeTimer > 0) { ctx.fillStyle = "rgba(0, 200, 255, 0.4)"; ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2); ctx.fill(); }
        if (b.stunTimer > 0 || b.bindTimer > 0) { ctx.font = "bold 20px Arial"; ctx.fillStyle = "yellow"; ctx.textAlign = "center"; ctx.fillText(b.bindTimer > 0 ? "⛓️" : "💫", 0, -size - 15); }
        if (b.threatTimer > 0) { 
            if (threatEffect2Img && threatEffect2Img.complete) { ctx.drawImage(threatEffect2Img, -15, -size - 40, 30, 30); } 
            else { ctx.font = "bold 20px Arial"; ctx.fillStyle = "#ff1744"; ctx.textAlign = "center"; ctx.fillText("💢", 0, -size - 25); }
        } 
        ctx.restore();
        
        ctx.fillStyle = "#111"; ctx.fillRect(b.x - 30, b.y - size - 15, 60, 6);
        ctx.fillStyle = "#ff1744"; ctx.fillRect(b.x - 30, b.y - size - 15, 60 * (b.hp / b.maxHp), 6);
    }

    mulungState.dmgTexts.forEach(d => { ctx.save(); ctx.globalAlpha = Math.max(0, d.timer / 0.6); ctx.fillStyle = d.isCrit ? "#ffeb3b" : "#fff"; ctx.font = d.isCrit ? "800 20px NanumSquare" : "bold 14px NanumSquare"; ctx.shadowColor = d.isCrit ? "#c62828" : "#000"; ctx.shadowBlur = 4; ctx.fillText(d.val, d.x, d.y); ctx.restore(); });
}

async function endMulungGame() {
    mulungState.active = false;
    isMulungLoopRunning = false; // 🔥 죽을 때 루프 완전히 해제
    cancelAnimationFrame(mulungReqId);
    
    let clearedWave = mulungState.wave - 1;
    let reward = Math.floor(clearedWave / 5) * 5;
    
    if (reward > 0) {
        userRankData.mulungCoins += reward;
        window.syncToCloud();
    }

    if (currentUserUid) {
        try {
            await runTransaction(ref(database, `mulung_rankings/${currentUserUid}`), (rankData) => {
                let bestFloor = (rankData && typeof rankData.floor === 'number') ? rankData.floor : 0;
                if (clearedWave > bestFloor) {
                    return { nickname: currentUserName, floor: clearedWave, date: new Date().toLocaleDateString() };
                }
                return undefined; 
            });
        } catch(e) { console.warn("무릉 랭킹 저장 실패", e); }
    }
    
    try {
        let uiKills = document.getElementById('ui-kills');
        if (uiKills && uiKills.parentElement) uiKills.parentElement.style.display = 'inline-block';
        let uiMobs = document.getElementById('ui-mobs');
        if (uiMobs && uiMobs.parentElement) uiMobs.parentElement.style.display = 'inline-block';
        
        let hiddenStatsRow = document.getElementById('mulung-hidden-stats-row'); 
        if (hiddenStatsRow) { hiddenStatsRow.style.display = 'flex'; hiddenStatsRow.id = ''; }

        let oppBoardWrapper = document.getElementById('opp-board-wrapper');
        let oppGridEl = document.getElementById('opp-grid-container');
        if (oppBoardWrapper && oppGridEl) {
            oppBoardWrapper.appendChild(oppGridEl); 
        }
    } catch(e) {}
    
    let resultModal = document.getElementById('mulung-result-modal');
    if (!resultModal) {
        let mDiv = document.createElement('div'); mDiv.id = 'mulung-result-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:5000; width:85%; max-width:300px; background:#fff; border:2px solid #004d40; padding:20px; border-radius:10px; text-align:center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);";
        document.body.appendChild(mDiv); resultModal = mDiv;
    }
    resultModal.innerHTML = `
        <h2 style="color:#d32f2f; margin-top:0; font-size:24px;">☠️ 도전 종료!</h2>
        <div style="font-size:16px; font-weight:bold; margin:15px 0; color:#333;">도달 층수: <span style="color:#1e88e5; font-size:20px;">${clearedWave}층</span></div>
        <div style="font-size:14px; color:#555; margin-bottom:20px; padding:10px; background:#f1f8e9; border-radius:6px; border:1px solid #c5e1a5;">
            획득 무릉 코인: <b style="color:#e65100; font-size:16px;">${reward}개</b>
        </div>
        <button class="ingame-btn premium-blue" style="width:100%; padding:12px; font-size:16px;" onclick="closeMulungResult()">마을로 돌아가기</button>
    `;
    document.getElementById('overlay').style.display = 'block';
    resultModal.style.display = 'block';
}

window.closeMulungResult = () => {
    document.getElementById('mulung-result-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    
    // 🔥 게임 종료 시 확실하게 상태값 완전 초기화 (루프 꼬임 방지)
    state.status = 'TITLE';
    state.wave = 1;
    waveTimer = 0;
    if (typeof mulungState !== 'undefined') mulungState.active = false;
    isMulungLoopRunning = false;
    cancelAnimationFrame(mulungReqId);

    // 🔥 모험 모드 UI 강제 복구 (무릉 UI 찌꺼기 방지)
    window.restoreAdventureUI();
    window.switchScreen('start-screen');
};

window.openMulungLobby = () => {
    document.getElementById('online-menu-modal').style.display = 'none';
    document.getElementById('mulung-lobby-modal').style.display = 'block';
    window.loadMulungRanking();
    
    // 🔥 로비 열 때 코인 동기화 한 번 더 안전하게 불러오기!
    if (currentUserUid) {
        get(child(ref(database), `users/${currentUserUid}/cloudData/mulungCoins`)).then(snap => {
            if (snap.exists()) {
                userRankData.mulungCoins = snap.val() || 0;
            }
        });
    }
};

window.closeMulungLobby = () => {
    document.getElementById('mulung-lobby-modal').style.display = 'none';
    document.getElementById('online-menu-modal').style.display = 'block';
};

window.openMulungShopFromLobby = () => {
    document.getElementById('online-overlay').style.display = 'none'; 
    window.openMulungShop();
};

window.loadMulungRanking = async () => {
    let list = document.getElementById('mulung-live-ranking-list');
    if(!list) return;
    try {
        const snap = await get(child(ref(database), `mulung_rankings`));
        if (snap.exists()) {
            let ranks = []; 
            snap.forEach(c => { 
                let v = c.val(); 
                if(typeof v.floor === 'number') ranks.push(v); 
            }); 
            ranks.sort((a, b) => b.floor - a.floor); 
            ranks = ranks.slice(0, 10); 
            list.innerHTML = '';
            
            ranks.forEach((entry, idx) => { 
                let color = idx === 0 ? '#ffd700' : (idx === 1 ? '#e0e0e0' : (idx === 2 ? '#cd7f32' : '#fff')); 
                list.innerHTML += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.1); padding:6px 10px; border-radius:4px; color:${color}; font-weight:bold;"><span>${idx + 1}. ${entry.nickname}</span><span>${entry.floor}층</span></div>`; 
            });
        } else { 
            list.innerHTML = '<div style="text-align:center; color:#ccc;">아직 등록된 랭킹이 없습니다.</div>'; 
        }
    } catch(e) { 
        list.innerHTML = '<div style="text-align:center; color:#ff5252;">서버 연결 실패.</div>'; 
    }
};

window.showMulungOppInfo = () => {
    if (!mulungState || !mulungState.active) return;
    
    let modal = document.getElementById('mulung-opp-info-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'mulung-opp-info-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9500; width:85%; max-width:320px; background:#fff; border:2px solid #4a148c; padding:20px; border-radius:10px; text-align:center; box-shadow: 0 10px 30px rgba(0,0,0,0.6);";
        document.body.appendChild(mDiv); modal = mDiv;
    }

    let equipHtml = ['뱃지', '엠블럼', '링'].map(slot => {
        let item = mulungState.oppEquipData[slot];
        let border = item ? (item.grade === 'Legendary' ? '#76ff03' : (item.grade === 'Unique' ? '#fb8c00' : (item.grade === 'Epic' ? '#8e24aa' : '#1e88e5'))) : '#777';
        let img = item ? `<img src="image/${slot === '뱃지' ? 'emblem.png' : (slot === '엠블럼' ? 'badge.png' : 'ring.png')}" style="max-width:30px; max-height:30px;">` : '';
        return `<div onclick="showOppEquipDetail('${slot}')" style="cursor:pointer; width:50px; height:50px; border:2px solid ${border}; border-radius:6px; background:#fff; display:flex; justify-content:center; align-items:center; box-shadow:0 0 5px ${border};">${img}</div>`;
    }).join('');

    modal.innerHTML = `
        <h3 style="margin:0 0 15px 0; color:#4a148c;">동료 스펙 정보</h3>
        <div style="font-size:18px; font-weight:900; margin-bottom:10px; color:#333;">${mulungState.oppName}</div>
        <div style="display:flex; justify-content:center; gap:15px; font-size:13px; margin-bottom:15px; background:#f3e5f5; padding:8px; border-radius:6px; color:#4a148c; font-weight:bold;">
            <span>📕 도감: Lv.<b style="color:#d32f2f">${mulungState.oppCardTotal}</b></span>
            <span>⭐ 스타포스: <b style="color:#d32f2f">${mulungState.oppStarTotal}</b>성</span>
        </div>
        <div style="font-size:11px; color:#777; margin-bottom:5px;">아이콘을 누르면 장비 옵션을 볼 수 있습니다.</div>
        <div style="display:flex; justify-content:center; gap:15px; margin-bottom:20px;">
            ${equipHtml}
        </div>
        <button class="ingame-btn premium-blue" style="width:100%; padding:12px; font-size:15px;" onclick="document.getElementById('mulung-opp-info-modal').style.display='none'">닫기</button>
    `;
    
    modal.style.display = 'block';
};

window.showOppEquipDetail = (slot) => {
    let item = mulungState.oppEquipData[slot];
    if (!item) return window.showMessage("장착된 장비가 없습니다.");

    let modal = document.getElementById('opp-equip-detail-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'opp-equip-detail-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9600; width:80%; max-width:280px; background:#fff; border:2px solid #546e7a; padding:15px; border-radius:8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);";
        document.body.appendChild(mDiv); modal = mDiv;
    }

    let gradeColor = item.grade === 'Rare' ? '#1e88e5' : (item.grade === 'Epic' ? '#8e24aa' : (item.grade === 'Unique' ? '#fb8c00' : '#76ff03'));
    let starStr = item.star > 0 ? ` <span style="color:#fbc02d;">★${item.star}</span>` : '';
    
    let baseOpt = "";
    if (item.options && Array.isArray(item.options)) {
        baseOpt = item.options.map(o => {
            let name = o.type === 'atk' ? '공격력' : (o.type === 'spd' ? '공속' : (o.type === 'crit' ? '크확' : (o.type === 'cdmg' ? '치피' : '방관')));
            return `${name} +${o.value}%`;
        }).join('<br>');
    } else {
        baseOpt = item.atk > 0 ? `기본 옵션: 공격력 +${item.atk}%` : (item.spd > 0 ? `기본 옵션: 공속 +${item.spd}%` : `기본 옵션: 크확 +${item.crit}%`);
    }

    let perStar = STARFORCE_BONUS[item.grade] || 0;
    let flatAtkVal = (item.star || 0) * perStar;
    let starOpt = flatAtkVal > 0 ? `<br><span style="color:#e65100;">스타포스 추가 공격력: +${flatAtkVal}</span>` : `<br><span style="color:#777;">스타포스 강화 없음</span>`;

    modal.innerHTML = `
        <h3 style="margin-top:0; text-align:center;"><span style="color:${gradeColor}">${item.grade} ${item.type}</span>${starStr}</h3>
        <div style="background:#eceff1; padding:10px; border-radius:6px; font-size:13px; color:#37474f; font-weight:bold; margin-bottom:15px; line-height:1.6; text-align:center;">
            ${baseOpt}<br>${starOpt}
        </div>
        <button class="ingame-btn premium-dark" style="width:100%; padding:10px;" onclick="document.getElementById('opp-equip-detail-modal').style.display='none'">닫기</button>
    `;
    modal.style.display = 'block';
};

// 🔥 모험 모드의 메인 루프 (여기에 안전장치 추가)
window.loop = () => {
    if(state.status === 'GAMEOVER' || state.status === 'TITLE' || state.status === 'MULUNG') return;
    let now = performance.now(); if (!lastTime) lastTime = now; let dtReal = (now - lastTime) / 1000; if (dtReal > 0.1) dtReal = 0.1; if (dtReal < 0) dtReal = 0.016; 
    let dt = dtReal * (state.speed || 1); lastTime = now;
    
    for (let i = hitEffects.length - 1; i >= 0; i--) { hitEffects[i].timer -= dt; if (hitEffects[i].timer <= 0) hitEffects.splice(i, 1); }
    
    for (let i = visualEffects.length - 1; i >= 0; i--) { 
        visualEffects[i].timer -= dt; 
        if (visualEffects[i].timer <= 0) { 
            let v = visualEffects[i]; 
            if (v.type === 'death' || v.type === 'thunder') { 
                monsters.forEach(m => { 
                    let armor = 0;
                    if (m.isBoss) {
                        if (state.wave >= 310) armor = 0.50;
                        else if (state.wave >= 210) armor = 0.30;
                        else if (state.wave >= 160) armor = 0.10;
                    }
                    let unpen = equipStats.unpenetratedRate;
                    if (m.threatTimer > 0) unpen *= 0.9;
                    let actualDmg = v.dmg * (1 - (armor * unpen));
                    if (m.threatTimer > 0) actualDmg *= 1.3;
                    
                    m.hp -= actualDmg; 
                }); 
                let container = document.getElementById('game-container'); 
                if (container && v.type === 'death') { container.classList.add('mild-shake-active'); setTimeout(() => container.classList.remove('mild-shake-active'), 300); } 
            } 
            visualEffects.splice(i, 1); 
        } 
    }
    
    for (let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].timer -= dt; damageTexts[i].y -= dt * 30; if (damageTexts[i].timer <= 0) damageTexts.splice(i, 1); }
    
    if (state.status === 'PREP') { state.time -= dtReal; document.getElementById('ui-timer').innerText = Math.ceil(Math.max(0, state.time)); if (state.time <= 0) { state.status = 'PLAY'; state.wave = state.wave || 1; waveTimer = 0; spawnTimer = 0; window.showMessage(state.wave + "웨이브 시작!"); window.updateUI(); } window.draw(); if(state.isRank) window.drawOpp(); mainReqId = requestAnimationFrame(window.loop); return; }
    
    updateWave(dt); if(state.isRank) processOpponentTick(dt);
    
    for(let i=monsters.length-1; i>=0; i--) {
        let m = monsters[i];
        if (m.freezeTimer > 0) { m.freezeTimer -= dt; m.freezeTickTimer -= dt; if (m.freezeTickTimer <= 0) { m.hp -= m.freezeDmgVal; m.freezeTickTimer = 1; } }

        if (state.wave >= 160 && m.isBoss && m.name !== "어둠의 늑대" && !state.isRank) {
            if (m.counterTimer === undefined) m.counterTimer = 5; 
            m.counterTimer -= dt;
            if (m.counterTimer <= 0) {
                let targetTower = null; let maxDmg = -1;
                towers.forEach(t => { if (t.hp > 0 && t.damageDealt > maxDmg) { maxDmg = t.damageDealt; targetTower = t; } });
                if (targetTower) {
                    let dmgTaken = (targetTower.overloadTimer > 0) ? 2 : 1; 
                    targetTower.hp -= dmgTaken;
                    hitEffects.push({ x: targetTower.x, y: targetTower.y, timer: 0.5, color: '#ff0000' });
                    if (targetTower.hp <= 0) {
                        towers = towers.filter(tw => tw !== targetTower);
                        grid[targetTower.idx] = null;
                        window.showMessage("보스의 공격으로 유닛이 파괴되었습니다!");
                    }
                }
                m.counterTimer = 10; 
            }
        }

        if (m.bindTimer > 0) { m.bindTimer -= dt; continue; } 
        if (m.stunTimer > 0) { m.stunTimer -= dt; continue; }  
        if (m.threatTimer > 0) { m.threatTimer -= dt; }

        let t = currentPath[m.targetNode]; let dx = t.x - m.x, dy = t.y - m.y; let dist = Math.hypot(dx, dy); let currentSpeed = m.speed; if (m.freezeTimer > 0) currentSpeed *= 0.5; let move = currentSpeed * dt;
        if (dx > 0) m.facingRight = true; else if (dx < 0) m.facingRight = false;
        if(dist <= move) { m.x = t.x; m.y = t.y; m.targetNode = (m.targetNode + 1) % currentPath.length; } else { m.x += (dx/dist)*move; m.y += (dy/dist)*move; }
    }
    if(state.isRank && monsters.length >= 25) return handleRankGameOver("몹 25마리 초과!");
    if(!state.isRank && monsters.length >= 50) return gameOver("몬스터 50마리 초과! 게임 오버");
    
    let cardMulti = 1 + (getTotalCardBonus() / 100); 
    let rageMulti = 1 + getSkillValue('common_rage', skillLevels.common_rage) + (equipStats.atk * 0.01); 
let sharpChance = getSkillValue('common_sharp', skillLevels.common_sharp) + (equipStats.crit * 0.01); 
let windReduc = 1 + getSkillValue('common_wind', skillLevels.common_wind) + (equipStats.spd * 0.01);

    towers.forEach(t => {
        let overloadMult = 1;
        if (t.overloadTimer > 0) {
            t.overloadTimer -= dt; overloadMult = 2;
            if (t.overloadTimer <= 0) t.unitStunTimer = skillLevels.thief_overload === 1 ? 6 : 5;
        }
        if (t.unitStunTimer > 0) t.unitStunTimer -= dt;
        let isStunned = (t.unitStunTimer > 0);

        if (t.gradeIdx >= 6 && t.cls.type === '법사' && skillLevels.mage_heal > 0) {
            if (t.healCooldown === undefined) t.healCooldown = 0;
            t.healCooldown -= dt * 1000;
            let maxHealCd = (70 - skillLevels.mage_heal * 10) * 1000;
            let hbar = document.getElementById(`heal-bar-${t.idx}`);
            if (hbar) hbar.style.width = Math.max(0, Math.min(100, ((maxHealCd - t.healCooldown) / maxHealCd) * 100)) + '%';
            
            if (t.healCooldown <= 0 && !isStunned) {
                let gridWidth = state.isRank ? 5 : 5;
                let tCol = t.idx % gridWidth; let tRow = Math.floor(t.idx / gridWidth);
                let injured = towers.filter(u => u.hp < u.maxHp && Math.abs((u.idx % gridWidth) - tCol) <= 1 && Math.abs(Math.floor(u.idx / gridWidth) - tRow) <= 1);
                if (injured.length > 0) {
                    injured.forEach(u => { u.hp = Math.min(u.maxHp, u.hp + 1); visualEffects.push({ type: 'heal', x: u.x, y: u.y, timer: 1.0 }); });
                    t.healCooldown += maxHealCd;
                    visualEffects.push({ type: 'heal', x: t.x, y: t.y, timer: 1.0 });
                } else { t.healCooldown = 0; }
            }
        }

        if (t.gradeIdx >= 7) {
            if (t.cls.type === '전사' && skillLevels.war_threat > 0) {
                if (t.threatCooldown === undefined) t.threatCooldown = 0;
                t.threatCooldown -= dt * 1000;
                let tbar = document.getElementById(`threat-bar-${t.idx}`);
                if (tbar) tbar.style.width = Math.max(0, Math.min(100, ((25000 - t.threatCooldown) / 25000) * 100)) + '%';
                
                if (t.threatCooldown <= 0 && !isStunned && monsters.length > 0) {
                    monsters[0].threatTimer = skillLevels.war_threat * 2;
                    t.threatCooldown += 25000;
                    visualEffects.push({ type: 'threat1', x: t.x, y: t.y, timer: 1.0 }); 
                }
            }
            if (t.cls.type === '도적' && skillLevels.thief_overload > 0) {
                if (t.rtdCooldown === undefined) t.rtdCooldown = 0;
                t.rtdCooldown -= dt * 1000;
                let rbar = document.getElementById(`rtd-bar-${t.idx}`);
                if (rbar) rbar.style.width = Math.max(0, Math.min(100, ((45000 - t.rtdCooldown) / 45000) * 100)) + '%';

                if (t.rtdCooldown <= 0 && (t.overloadTimer||0) <= 0 && !isStunned) {
                    t.overloadTimer = skillLevels.thief_overload === 5 ? 15 : 6 + (skillLevels.thief_overload * 2);
                    t.rtdCooldown += 45000;
                    visualEffects.push({ type: 'rtd', x: t.x, y: t.y, timer: 1.0 });
                }
            }
        }

        if (t.gradeIdx === 6 && t.cls.type !== '법사') {
            t.bindCooldown -= dt * 1000; 
            let bar = document.getElementById(`bind-bar-${t.idx}`); 
            if (bar) bar.style.width = Math.max(0, Math.min(100, ((75000 - t.bindCooldown) / 75000) * 100)) + '%';
            if (t.bindCooldown <= 0 && !isStunned) { 
                if (monsters.length > 0) { 
                    let target = null; for (let m of monsters) { if (m.bindTimer <= 0) { target = m; break; } } 
                    if (!target) target = monsters[0]; 
                    if (target) { target.bindTimer = 10; t.bindCooldown += 75000; } 
                } else { t.bindCooldown = 0; } 
            }
        }
        
        if (t.gradeIdx >= 5) {
            if ((t.cls.type === '전사' && (skillLevels.war_death||0) > 0) || (t.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) || (t.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0)) {
                t.globalCooldown -= dt * 1000; 
                let gbar = document.getElementById(`global-bar-${t.idx}`); 
                if (gbar) gbar.style.width = Math.max(0, Math.min(100, ((60000 - t.globalCooldown) / 60000) * 100)) + '%';
                
                if (t.globalCooldown <= 0 && !isStunned) {
                    if (monsters.length > 0) {
                        let baseDmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15) + equipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti; 
                        if (t.cls.type === '전사' && (skillLevels.war_death||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.war_death||0) * 1.5); visualEffects.push({ type: 'death', timer: 1.2, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '법사' && (skillLevels.mage_thunder||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.mage_thunder||0) * 1.5); visualEffects.push({ type: 'thunder', timer: 0.5, dmg: gdmg }); t.globalCooldown += 60000; }
                        else if (t.cls.type === '도적' && (skillLevels.thief_fuma||0) > 0) { let gdmg = baseDmg * (1.5 + (skillLevels.thief_fuma||0) * 1.5); fumaList.push({ x: t.x, y: t.y, targetNode: 0, nodesVisited: 0, dmg: gdmg, hitSet: new Set(), angle: 0 }); t.globalCooldown += 60000; }
                    } else { t.globalCooldown = 0; }
                }
            }
        }
        
        t.lastAttack -= dt * 1000; 
        let attackCd = (t.cls.cd * (t.grade.speedMul || 1)) / (windReduc * overloadMult); 
        while(t.lastAttack <= 0) {
            if (isStunned) { t.lastAttack = 0; break; } 
            let range = t.cls.range * t.grade.rangeMul; let target = null;
            for(let m of monsters) { let d = Math.hypot(m.x - t.x, m.y - t.y); if(d <= range) { target = m; break; } }
            if(target) {
                let dmg = (t.cls.baseDmg + (state.upgrades[t.cls.type].val * 0.15) + equipStats.flatAtk) * t.grade.mult * cardMulti * rageMulti; 
                if (target.threatTimer > 0) dmg *= 1.3; 
                let isCrit = Math.random() < sharpChance; if (isCrit) dmg *= (1.2 + (equipStats.cdmg / 100)); 
                let isFinal = false; if (t.cls.type === '전사' && skillLevels.war_final > 0 && Math.random() < getSkillValue('war_final', skillLevels.war_final)) { isFinal = true; dmg *= 2; }
                
                projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: isFinal, baseDmgToPass: dmg, sourceTower: t });
                if (t.cls.type === '도적' && skillLevels.thief_shadow > 0 && Math.random() < getSkillValue('thief_shadow', skillLevels.thief_shadow)) { projectiles.push({ type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y, dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash, color: t.cls.color, target: target, angle: 0, gradeIdx: t.gradeIdx, isCrit: isCrit, isFinal: false, isShadow: true, sourceTower: t }); }
                
                t.lastAttack += attackCd;
            } else { t.lastAttack = 0; break; }
        }
    });
    
    for(let i=fumaList.length-1; i>=0; i--) {
        let f = fumaList[i]; f.angle += 15 * dt; let t_node = currentPath[f.targetNode]; let dx = t_node.x - f.x, dy = t_node.y - f.y; let dist = Math.hypot(dx, dy); let move = 300 * dt; 
        monsters.forEach(m => { 
            if (!f.hitSet.has(m) && Math.hypot(m.x - f.x, m.y - f.y) <= 50) { 
                let armor = 0;
                if (m.isBoss) {
                    if (state.wave >= 310) armor = 0.50;
                    else if (state.wave >= 210) armor = 0.30;
                    else if (state.wave >= 160) armor = 0.10;
                }
                let unpen = equipStats.unpenetratedRate;
                if (m.threatTimer > 0) unpen *= 0.9;
                let actualDmg = f.dmg * (1 - (armor * unpen));
                if (m.threatTimer > 0) actualDmg *= 1.3;
                
                m.hp -= actualDmg; 
                f.hitSet.add(m); 
                if(state.isRank && m.isBoss) rankState.myBossDamage += actualDmg; 
            } 
        });
        if(dist <= move) { f.x = t_node.x; f.y = t_node.y; f.targetNode++; f.nodesVisited++; if (f.targetNode >= currentPath.length) f.targetNode = 0; if (f.nodesVisited > currentPath.length) fumaList.splice(i, 1); } else { f.x += (dx/dist)*move; f.y += (dy/dist)*move; }
    }

    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i]; let dx = p.tx - p.x, dy = p.ty - p.y; let dist = Math.hypot(dx, dy); let speed = 400 * dt;
        if(p.type === '도적') p.angle += 15 * dt; 
        if(dist <= speed) {
            if (p.gradeIdx >= 6) { hitEffects.push({ x: p.tx, y: p.ty, timer: 0.2, color: p.color }); }
            if(monsters.includes(p.target)) {
                let hitDmg = p.dmg; if (p.type === '전사' && p.target.isBoss) hitDmg *= 1.5; 
                
                let bossArmor = 0;
                if (p.target.isBoss) {
                    if (state.wave >= 310) bossArmor = 0.50;
                    else if (state.wave >= 210) bossArmor = 0.30;
                    else if (state.wave >= 160) bossArmor = 0.10;
                }

                let myUnpen = equipStats.unpenetratedRate;
                if (p.target.threatTimer > 0) myUnpen *= 0.9;

                let appliedArmor = bossArmor * myUnpen;
                hitDmg *= (1 - appliedArmor);

                p.target.hp -= hitDmg; p.sourceTower.damageDealt += hitDmg; 
                if(state.isRank && p.target.isBoss) rankState.myBossDamage += hitDmg;
                if (p.isCrit) damageTexts.push({ val: Math.floor(hitDmg), x: p.target.x, y: p.target.y - 35, timer: 0.8 });
                if (p.type === '전사' && Math.random() < 0.2) p.target.stunTimer = 1;
                if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < getFreezeChance(skillLevels.mage_freeze)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * getFreezeDmg(skillLevels.mage_freeze); } }
            }
            if(p.splash > 0) {
                monsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) {
                        let splashDmg = p.dmg; if (p.type === '전사' && m.isBoss) splashDmg *= 1.5; 
                        
                        let bossArmor = 0;
                        if (m.isBoss) {
                            if (state.wave >= 310) bossArmor = 0.50;
                            else if (state.wave >= 210) bossArmor = 0.30;
                            else if (state.wave >= 160) bossArmor = 0.10;
                        }
                        let myUnpen = equipStats.unpenetratedRate;
                        if (m.threatTimer > 0) myUnpen *= 0.9;
                        let appliedArmor = bossArmor * myUnpen;
                        splashDmg *= (1 - appliedArmor);

                        m.hp -= splashDmg; p.sourceTower.damageDealt += splashDmg;
                        if(state.isRank && m.isBoss) rankState.myBossDamage += splashDmg;
                        if (p.isCrit) damageTexts.push({ val: Math.floor(splashDmg), x: m.x, y: m.y - 35, timer: 0.8 });
                        if (p.type === '전사' && Math.random() < 0.2) m.stunTimer = 1;
                        if (p.type === '법사' && skillLevels.mage_freeze > 0 && Math.random() < getFreezeChance(skillLevels.mage_freeze)) { if (p.target.freezeTimer <= 0) { p.target.freezeTimer = 3; p.target.freezeTickTimer = 1; p.target.freezeDmgVal = p.baseDmgToPass * getFreezeDmg(skillLevels.mage_freeze); } }
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
                    let bInfo = getBossInfo(state.wave); 
                    state.meso += bInfo.meso; 
                    
                    let tCount = bInfo.count || 1;
                    let tTier = bInfo.tier || 5; 
                    for (let t = 0; t < tCount; t++) {
                        state.tickets.push(tTier);
                    }
                    
                    let drops = [];
                    if (Math.random() * 100 <= 5) { userInventory.equipBoxes = (userInventory.equipBoxes || 0) + 1; drops.push({ type: 'equip' }); }
                    if (Math.random() * 100 <= 20) { cardData[bInfo.name] = cardData[bInfo.name] || { owned: 0, grade: 0 }; cardData[bInfo.name].owned++; localStorage.setItem('mapleDefenseCards', JSON.stringify(cardData)); if (currentUserUid) window.syncToCloud(); drops.push({ type: 'card', name: bInfo.name }); }
                    
                    // 🔥 신규 추가: 150층 이상에서 50% 확률로 젬스톤 드랍 (90% 1개, 9% 2개, 1% 3개)
                    if (state.wave >= 150 && Math.random() < 0.5) {
                        let r = Math.random(); let gCount = 1;
                        if (r > 0.99) gCount = 3; else if (r > 0.90) gCount = 2;
                        userCores.gemstones += gCount;
                        if (currentUserUid) window.syncToCloud();
                        drops.push({ type: 'gemstone', count: gCount });
                    }

                    if (drops.length > 0) { window.showLootPopup(drops); } else { window.showMessage(`${state.wave}라운드 보스 처치!`); }
                }
            }
            monsters.splice(i, 1); window.updateUI();
        }
    }

    for(let i=oppMonsters.length-1; i>=0; i--) { 
        if(oppMonsters[i].hp <= 0) {
            oppMonsters.splice(i, 1); 
        } 
    }
    
    if (oppMonsters.length === 0) {
        let oppClearedBlock = 0;
        if (oppState.wave % 10 === 0 && oppWaveTimer >= 58.5) {
            oppClearedBlock = oppState.wave / 10;
        } else if (oppState.wave % 10 !== 0) {
            oppClearedBlock = Math.floor((oppState.wave - 1) / 10);
        }

        if (oppClearedBlock > 0) {
            if (!rankState.blockWinner) rankState.blockWinner = {};
            if (!rankState.blockWinner[oppClearedBlock]) {
                rankState.blockWinner[oppClearedBlock] = 'opp'; 
                let wolfHp = Math.floor(100000 * Math.pow(1.5, oppClearedBlock)); 
                monsters.push({ hp: wolfHp, maxHp: wolfHp, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: "어둠의 늑대", facingRight: true, threatTimer: 0, counterTimer: 5 });
                window.showMessage(`☠️ 상대방이 ${oppClearedBlock * 10}웨이브를 먼저 클리어하여 늑대가 난입했습니다!`);
            }
        }
    }

    if (state.isRank && monsters.length === 0) {
        let clearedBlock = 0;
        if (state.wave % 10 === 0 && waveTimer >= 58.5) {
            clearedBlock = state.wave / 10;
        } else if (state.wave % 10 !== 0) {
            clearedBlock = Math.floor((state.wave - 1) / 10);
        }

        if (clearedBlock > 0) {
            if (!rankState.blockWinner) rankState.blockWinner = {};
            if (!rankState.blockWinner[clearedBlock]) { 
                rankState.blockWinner[clearedBlock] = 'player'; 
                let wolfHp = Math.floor(100000 * Math.pow(1.5, clearedBlock)); 
                oppMonsters.push({ hp: wolfHp, maxHp: wolfHp, x: currentPath[0].x, y: currentPath[0].y, targetNode: 1, speed: 25, isBoss: true, bindTimer: 0, stunTimer: 0, freezeTimer: 0, freezeTickTimer: 0, freezeDmgVal: 0, name: "어둠의 늑대", facingRight: true, threatTimer: 0, counterTimer: 5 });
                window.showMessage(`🔥 ${clearedBlock * 10}웨이브 클리어! 상대에게 어둠의 늑대를 보냈습니다!`);
            }
        }
    }
    
    window.draw(); if(state.isRank) window.drawOpp(); 
    mainReqId = requestAnimationFrame(window.loop);
};

// ==========================================
// 🔥 [3단계 신규] V 매트릭스 (코어 젬스톤) 시스템 UI 및 로직
// ==========================================
const CORE_INFO = {
    'war_final': { name: '파이널 어택 코어', icon: '🗡️', desc: (lv) => `파이널 어택 발동 시 ${lv * 2}% 확률로 한 번 더 타격(더블어택)` },
    'war_threat': { name: '위협 코어', icon: '💢', desc: (lv) => `위협 상태 적 타격 시 파티 전체 크리티컬 확률 ${lv * 1}% 증가` },
    'war_death': { name: '데스폴트 코어', icon: '⚔️', desc: (lv) => `적중 시 데미지의 ${lv * 2}%만큼 방어력 무시 추가 타격` },
    'mage_heal': { name: '힐 코어', icon: '💚', desc: (lv) => `힐 대상(메인딜러 우선)의 공격 속도 ${lv * 2}% 증가 (3초)` },
    'mage_thunder': { name: '썬더 브레이크 코어', icon: '⚡', desc: (lv) => `적중 시 데미지의 ${lv * 2}%만큼 방어력 무시 추가 타격` },
    'mage_freeze': { name: '빙결(마비) 코어', icon: '❄️', desc: (lv) => `빙결 상태 적 타격 시 해당 타격 데미지 ${lv * 3}% 증폭` },
    'thief_shadow': { name: '섀도 파트너 코어', icon: '👤', desc: (lv) => `섀도 파트너 투사체에 방어력 관통 ${lv * 2}% 부여` },
    'thief_overload': { name: '레디 투 다이 코어', icon: '☠️', desc: (lv) => `스킬 지속(공속 2배) 중 크리티컬 피해량 ${lv * 2}% 증가` },
    'thief_fuma': { name: '풍마수리검 코어', icon: '🌀', desc: (lv) => `적이 잃은 체력 1%당 데미지 ${+(lv * 0.03).toFixed(2)}% 증폭` }
};

window.openVMatrixModal = () => {
    document.getElementById('overlay').style.display = 'block';
    let modal = document.getElementById('vmatrix-modal');
    if (!modal) {
        let mDiv = document.createElement('div'); mDiv.id = 'vmatrix-modal'; mDiv.className = 'maple-modal';
        mDiv.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:5000; width:90%; max-width:340px; background:#fff; border:2px solid #6a1b9a; padding:15px; border-radius:10px; text-align:center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); max-height:85vh; overflow-y:auto;";
        document.body.appendChild(mDiv); modal = mDiv;
    }
    window.renderVMatrix();
    modal.style.display = 'block';
};

window.closeVMatrixModal = () => {
    let modal = document.getElementById('vmatrix-modal'); if(modal) modal.style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
};

window.renderVMatrix = () => {
    let modal = document.getElementById('vmatrix-modal');
    if(!modal) return;
    
    let maxSlots = window.getUnlockedCoreSlots();
    let currentMaxFloor = highestMulungFloor || 0;
    
    // 🔥 슬롯 영역 HTML 그리기
    let slotsHtml = `<div style="font-size:12px; color:#555; margin-bottom:5px; text-align:left;">장착 슬롯 <span style="color:#6a1b9a; font-weight:bold;">(${userCores.equipped.length} / ${maxSlots})</span> <span style="font-size:10px; color:#888; float:right;">무릉 ${currentMaxFloor}층 기록</span></div>`;
    slotsHtml += `<div style="display:flex; justify-content:center; flex-wrap:wrap; gap:8px; margin-bottom:15px; background:#f5f5f5; padding:10px; border-radius:8px;">`;
    for(let i=0; i<maxSlots; i++) {
        if (i < userCores.equipped.length) {
            let coreKey = userCores.equipped[i];
            let info = CORE_INFO[coreKey];
            let lv = userCores.items[coreKey].level;
            slotsHtml += `<div style="width:50px; height:50px; background:#f3e5f5; border:2px solid #ab47bc; border-radius:8px; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);" onclick="toggleEquipCore('${coreKey}')"><div style="font-size:20px;">${info.icon}</div><div style="font-size:10px; color:#6a1b9a; font-weight:bold; margin-top:2px;">Lv.${lv}</div></div>`;
        } else {
            slotsHtml += `<div style="width:50px; height:50px; background:#eceff1; border:2px dashed #90a4ae; border-radius:8px; display:flex; justify-content:center; align-items:center; color:#90a4ae; font-size:10px;">빈 칸</div>`;
        }
    }
    for(let i=maxSlots; i<9; i++) {
        slotsHtml += `<div style="width:50px; height:50px; background:#cfd8dc; border:2px solid #b0bec5; border-radius:8px; display:flex; justify-content:center; align-items:center; color:#78909c; font-size:20px;">🔒</div>`;
    }
    slotsHtml += `</div>`;

    // 🔥 보유 코어 리스트 HTML 그리기 (장착 중인 것을 위로 정렬)
    let invHtml = `<div style="text-align:left; font-size:12px; font-weight:bold; color:#4a148c; margin-bottom:5px;">보유 중인 코어 <span style="font-size:10px; font-weight:normal; color:#666;">(클릭하여 장착/해제)</span></div><div style="display:flex; flex-direction:column; gap:6px;">`;
    let hasCore = false;
    
    let sortedKeys = Object.keys(userCores.items).sort((a,b) => {
        let equipA = userCores.equipped.includes(a) ? 1 : 0;
        let equipB = userCores.equipped.includes(b) ? 1 : 0;
        if(equipA !== equipB) return equipB - equipA;
        return userCores.items[b].level - userCores.items[a].level;
    });

    for(let key of sortedKeys) {
        hasCore = true;
        let item = userCores.items[key];
        let info = CORE_INFO[key];
        let isEquipped = userCores.equipped.includes(key);
        let reqDupes = item.level * 2; // 1->2렙 2개, 2->3렙 4개, 3->4렙 6개...
let canUpgrade = item.level < 10 && item.dupes >= reqDupes;
        
        let btnAction = isEquipped ? `<button class="ingame-btn premium-dark" style="padding:5px 8px; font-size:11px;" onclick="toggleEquipCore('${key}')">장착 해제</button>` : `<button class="ingame-btn premium-blue" style="padding:5px 8px; font-size:11px;" onclick="toggleEquipCore('${key}')">장착 하기</button>`;
        let btnUpgrade = item.level < 10 ? `<button class="ingame-btn ${canUpgrade ? 'premium-purple' : 'premium-white'}" style="padding:5px 8px; font-size:11px; margin-left:4px; width:70px;" ${canUpgrade?'':'disabled'} onclick="upgradeCore('${key}')">강화<br>(${item.dupes}/${reqDupes})</button>` : `<button class="ingame-btn premium-dark" style="padding:5px 8px; font-size:11px; margin-left:4px; width:70px;" disabled>MAX</button>`;

        invHtml += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:${isEquipped ? '#f3e5f5' : '#fff'}; border:2px solid ${isEquipped ? '#ab47bc' : '#cfd8dc'}; padding:8px; border-radius:8px;">
                <div style="display:flex; align-items:center; gap:8px; width:65%;">
                    <div style="font-size:26px;">${info.icon}</div>
                    <div style="text-align:left;">
                        <div style="font-size:12px; font-weight:bold; color:#212121;">${info.name} <span style="color:#6a1b9a;">Lv.${item.level}</span></div>
                        <div style="font-size:10px; color:#555; margin-top:2px; line-height:1.2;">${info.desc(item.level)}</div>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                    ${btnAction}
                    ${btnUpgrade}
                </div>
            </div>
        `;
    }
    if(!hasCore) invHtml += `<div style="text-align:center; color:#999; padding:20px; font-size:12px; border:1px dashed #ccc; border-radius:8px;">보유한 코어가 없습니다.<br>젬스톤을 개봉하여 코어를 획득하세요!</div>`;
    invHtml += `</div>`;

    modal.innerHTML = `
        <h3 style="color:#4a148c; margin-top:0; font-size:22px; margin-bottom:10px; text-shadow:1px 1px 0px rgba(0,0,0,0.1);">💎 V 매트릭스</h3>
        <div style="background:#fff3e0; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border:2px solid #ce93d8;">
            <div style="font-size:12px; font-weight:bold; color:#6a1b9a;">보유 젬스톤: <span style="font-size:16px; color:#d32f2f;">${userCores.gemstones}</span>개</div>
            <button class="ingame-btn premium-orange" style="padding:8px 12px; font-size:12px;" onclick="openGemstone()">✨ 1개 개봉</button>
        </div>
        ${slotsHtml}
        ${invHtml}
        <button class="ingame-btn premium-white" style="width:100%; padding:12px; margin-top:15px; font-size:14px;" onclick="closeVMatrixModal()">닫기</button>
    `;
};

window.openGemstone = () => {
    if (userCores.gemstones <= 0) return window.showMessage("보유한 코어 젬스톤이 없습니다.");
    userCores.gemstones--;
    let keys = Object.keys(CORE_INFO);
    let getCore = keys[Math.floor(Math.random() * keys.length)];
    
    if (!userCores.items[getCore]) { userCores.items[getCore] = { level: 1, dupes: 0 }; } 
    else { userCores.items[getCore].dupes++; }
    
    window.syncToCloud(); window.renderVMatrix();
    
    let info = CORE_INFO[getCore];
    let msg = userCores.items[getCore].dupes === 0 
        ? `🎉 신규 코어 획득: [${info.name}]!` 
        : `💎 코어 조각 획득: [${info.name}] (보유: ${userCores.items[getCore].dupes}개)`;
    window.showMessage(msg);
};

window.toggleEquipCore = (key) => {
    let idx = userCores.equipped.indexOf(key);
    if (idx > -1) { userCores.equipped.splice(idx, 1); } 
    else {
        let maxSlots = window.getUnlockedCoreSlots();
        if (userCores.equipped.length >= maxSlots) return window.showMessage("더 이상 장착할 슬롯이 없습니다. 무릉도장 기록을 갱신하세요!");
        userCores.equipped.push(key);
    }
    window.syncToCloud(); window.renderVMatrix();
};

window.upgradeCore = (key) => {
    let item = userCores.items[key];
    if (!item || item.level >= 10) return;
    
    let reqDupes = item.level * 2; // 1->2렙 2개, 2->3렙 4개, 3->4렙 6개...
    
    if (item.dupes >= reqDupes) {
        item.dupes -= reqDupes; item.level++;
        window.syncToCloud(); window.renderVMatrix();
        window.showMessage(`🌟 [${CORE_INFO[key].name}] Lv.${item.level} 달성!`);
    }
};

// 🔥 로비 화면(start-screen)에 자동으로 V 매트릭스 진입 버튼 생성
setInterval(() => {
    let startScreen = document.getElementById('start-screen');
    if (startScreen && startScreen.style.display !== 'none' && !document.getElementById('btn-vmatrix-floating')) {
        let vBtn = document.createElement('button');
        vBtn.id = 'btn-vmatrix-floating';
        vBtn.className = 'ingame-btn premium-purple';
        vBtn.innerHTML = '<span style="font-size:18px;">💎</span><br>V 매트릭스';
        vBtn.style.cssText = "position:absolute; top:80px; left:20px; padding:10px 15px; font-size:14px; font-weight:bold; box-shadow:0 4px 15px rgba(171, 71, 188, 0.6); z-index:100; border-radius:10px; line-height:1.4;";
        vBtn.onclick = window.openVMatrixModal;
        startScreen.appendChild(vBtn);
    }
}, 1000);