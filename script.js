let bestWave = localStorage.getItem('mapleDefenseBestWave') || 0;
document.getElementById('best-record').innerText = `최고 기록: ${bestWave} 웨이브`;

const GRADES = [
    { name: "초보자", prob: 50.0, sell: 3, mult: 1, rangeMul: 1 },
    { name: "1차", prob: 33.1, sell: 6, mult: 2, rangeMul: 1 },
    { name: "2차", prob: 10.2, sell: 9, mult: 4, rangeMul: 1 },
    { name: "3차", prob: 5.1, sell: 16, mult: 8, rangeMul: 1.2, speedMul: 0.8 },
    { name: "4차", prob: 0.8, sell: 30, mult: 16, rangeMul: 1.2 },
    { name: "5차", prob: 0.5, sell: 0, mult: 32, rangeMul: 1.2, splash: true },
    { name: "6차", prob: 0.2, sell: 0, mult: 64, rangeMul: 4, bind: true },
    { name: "제네시스", prob: 0.08, sell: 0, mult: 128, rangeMul: 4 },
    { name: "데스티니", prob: 0.019, sell: 0, mult: 256, rangeMul: 6 }
];

const CLASSES = {
    '전사': { type: '전사', icon: '⚔️', color: '#c62828', baseDmg: 20, range: 100, cd: 1000, splash: 40 },
    '법사': { type: '법사', icon: '🪄', color: '#1565c0', baseDmg: 10, range: 160, cd: 1000, splash: 60 },
    '도적': { type: '도적', icon: '✦', color: '#6a1b9a', baseDmg: 18, range: 200, cd: 800, splash: 0 }
};

// 보스 체력 기존 대비 2배 상향 조정
const BOSS_WAVES = {
    24: { hp: 10000, meso: 50, ticket: 3 }, 37: { hp: 30000, meso: 50, ticket: 4 },
    58: { hp: 100000, meso: 50, ticket: 4 }, 79: { hp: 300000, meso: 70, ticket: 5 },
    90: { hp: 1000000, meso: 100, ticket: 5 }, 100: { hp: 4000000, meso: 100, ticket: 5 }
};

let state = {
    status: 'TITLE',
    meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 30, speed: 1, isBoss: false,
    upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} },
    tickets: []
};

let grid = new Array(25).fill(null);
let monsters = [], projectiles = [], towers = [];
let lastTime = 0, waveTimer = 0, spawnTimer = 0;
let selectedUnitIdx = -1; // 현재 선택된 유닛 위치

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridContainer = document.getElementById('grid-container');
const PATH = [ {x:25,y:25}, {x:475,y:25}, {x:475,y:475}, {x:25,y:475} ];

function initGrid() {
    gridContainer.innerHTML = '';
    for(let i=0; i<25; i++) {
        let cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.onclick = () => onCellClick(i);
        gridContainer.appendChild(cell);
    }
}
initGrid();

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    state.status = 'PREP'; 
    state.time = 30;
    lastTime = performance.now();
    showMessage("30초 후 1웨이브가 시작됩니다!");
    requestAnimationFrame(loop);
}

function getGradeByProb() {
    let rand = Math.random() * 100;
    let acc = 0;
    for(let i=0; i<GRADES.length; i++) {
        acc += GRADES[i].prob;
        if(rand <= acc) return i;
    }
    return 0;
}

function summonUnit() {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    if(state.meso < 10) return;
    let emptyIdx = grid.findIndex(v => v === null);
    if(emptyIdx === -1) { showMessage("배치 공간이 부족합니다!"); return; }
    
    state.meso -= 10;
    let gradeIdx = getGradeByProb();
    let clsNames = Object.keys(CLASSES);
    let clsName = clsNames[Math.floor(Math.random() * clsNames.length)];
    
    addUnit(emptyIdx, gradeIdx, clsName);
    updateUI();
}

function showSummonToast(gradeName, clsName, color) {
    let toast = document.getElementById('summon-toast');
    toast.innerHTML = `<span style="color:${color}">${gradeName}</span> ${clsName}!`;
    toast.className = 'toast-show';
    setTimeout(() => { toast.className = ''; }, 1500);
}

function addUnit(idx, gradeIdx, clsName) {
    let grade = GRADES[gradeIdx];
    let cls = CLASSES[clsName];
    
    let unit = {
        idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls,
        x: 75 + (idx % 5) * 70 + 35,
        y: 75 + Math.floor(idx / 5) * 70 + 35,
        lastAttack: 0
    };
    
    grid[idx] = unit;
    towers.push(unit);
    
    showSummonToast(grade.name, clsName, cls.color);
    renderGrid();
}

// ----------------------------------------------------
// 변경점: 원클릭 선택 및 즉시 이동 시스템
// ----------------------------------------------------
function onCellClick(idx) {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    
    // 1. 이미 선택된 유닛이 있는 상태에서 어딘가를 클릭했을 때 (이동/교환 혹은 선택해제)
    if (selectedUnitIdx !== -1) {
        if (selectedUnitIdx === idx) {
            // 같은 유닛을 또 누르면 선택 해제
            selectedUnitIdx = -1;
        } else {
            // 다른 위치를 누르면 자리 교체 (빈칸이든 다른 유닛이든)
            let target = grid[idx];
            grid[idx] = grid[selectedUnitIdx];
            grid[idx].idx = idx;
            grid[idx].x = 75 + (idx % 5) * 70 + 35;
            grid[idx].y = 75 + Math.floor(idx / 5) * 70 + 35;

            grid[selectedUnitIdx] = target;
            if(target) {
                target.idx = selectedUnitIdx;
                target.x = 75 + (selectedUnitIdx % 5) * 70 + 35;
                target.y = 75 + Math.floor(selectedUnitIdx / 5) * 70 + 35;
            }
            selectedUnitIdx = -1; // 이동 완료 후 선택 해제
        }
    } 
    // 2. 선택된 유닛이 없는 상태에서 유닛을 클릭했을 때 (선택 및 사거리 표시)
    else {
        if (grid[idx]) {
            selectedUnitIdx = idx;
        }
    }
    
    renderGrid();
    updateUI();
}

// 선택된 유닛 단일 판매
function sellSelectedUnit() {
    if(selectedUnitIdx === -1) return;
    let u = grid[selectedUnitIdx];
    if(u) {
        if (u.grade.sell > 0) {
            state.meso += u.grade.sell;
            towers = towers.filter(t => t !== u);
            grid[selectedUnitIdx] = null;
            selectedUnitIdx = -1;
            renderGrid();
            updateUI();
        } else {
            showMessage("판매할 수 없는 유닛입니다.");
        }
    }
}

// 일괄 판매 모달 열기
function openBulkSellModal() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('bulk-sell-modal').style.display = 'block';
}

// 일괄 판매 실행
function executeBulkSell(type, value) {
    let soldCount = 0;
    let earnedMeso = 0;
    
    for(let i = 0; i < 25; i++) {
        let u = grid[i];
        if(!u) continue;
        if(u.grade.sell === 0) continue; // 5차 이상 판매 불가 무시
        
        let match = false;
        if(type === 'class' && u.cls.type === value) match = true;
        if(type === 'grade' && u.gradeIdx <= value) match = true;
        
        if(match) {
            earnedMeso += u.grade.sell;
            towers = towers.filter(t => t !== u);
            grid[i] = null;
            soldCount++;
        }
    }
    
    if(soldCount > 0) {
        state.meso += earnedMeso;
        showMessage(`${soldCount}마리 판매 (+${earnedMeso} 메소)`);
        selectedUnitIdx = -1; // 팔린게 내가 선택한걸 수도 있으니 선택 초기화
        renderGrid();
        updateUI();
    } else {
        showMessage("조건에 맞는 유닛이 없습니다.");
    }
    closeAllModals();
}

function closeAllModals() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('bulk-sell-modal').style.display = 'none';
    document.getElementById('ticket-modal').style.display = 'none';
}

function renderGrid() {
    let cells = gridContainer.children;
    for(let i=0; i<25; i++) {
        let u = grid[i];
        
        // CSS 클래스로 테두리 빛남 효과 부여
        if (i === selectedUnitIdx) {
            cells[i].classList.add('selected');
        } else {
            cells[i].classList.remove('selected');
        }

        if(u) {
            cells[i].innerHTML = `
                <div style="font-size:20px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">${u.cls.icon}</div>
                <div style="color:${u.cls.color}; font-size:10px; margin-top:2px;">${u.grade.name}</div>
            `;
        } else { 
            cells[i].innerHTML = ''; 
        }
    }
}

// ----------------------------------------------------
// 변경점: 일반 몬스터 체력 밸런스 대폭 상향
// ----------------------------------------------------
function spawnMonster() {
    // 기존: state.wave * 15
    // 상향: 웨이브 진행에 따라 기하급수적으로 오르도록 제곱 연산 추가
    let hpBase = state.isBoss ? BOSS_WAVES[state.wave].hp : Math.floor(state.wave * 45 + Math.pow(state.wave, 1.4) * 8);
    
    monsters.push({
        hp: hpBase, maxHp: hpBase, x: PATH[0].x, y: PATH[0].y,
        targetNode: 1, speed: state.isBoss ? 25 : 50, isBoss: state.isBoss
    });
}

function updateWave(dt) {
    waveTimer += dt; spawnTimer += dt;
    let limit = state.isBoss ? 300 : 120;
    
    if(waveTimer >= limit) { nextWave(); return; }
    
    if(!state.isBoss && spawnTimer >= (120/40)) {
        spawnMonster(); spawnTimer = 0;
    }
    document.getElementById('ui-timer').innerText = Math.max(0, limit - Math.floor(waveTimer));
}

function nextWave() {
    if(state.isBoss && monsters.some(m => m.isBoss)) { gameOver("보스 처치 실패!"); return; }
    state.wave++; waveTimer = 0; spawnTimer = 0;
    state.isBoss = !!BOSS_WAVES[state.wave];
    
    if (state.wave > bestWave) {
        bestWave = state.wave;
        localStorage.setItem('mapleDefenseBestWave', bestWave);
    }
    
    if(state.isBoss) {
        showMessage(`[보스 라운드] ${state.wave}라운드 보스 출현!`);
        spawnMonster();
    }
    updateUI();
}

function upgrade(type) {
    if(state.status !== 'PREP' && state.status !== 'PLAY') return;
    let u = state.upgrades[type];
    if(state.mp >= u.cost) {
        state.mp -= u.cost;
        u.val += Math.floor(Math.random() * 6) + 1;
        u.cost += 1;
        let idChar = type === '전사' ? 'w' : (type === '법사' ? 'm' : 't');
        document.getElementById(`upg-${idChar}-val`).innerText = u.val;
        document.getElementById(`upg-${idChar}-cost`).innerText = u.cost;
        updateUI();
    } else { showMessage("메포가 부족합니다."); }
}

let currentTicketTier = 0;
function openTicketModal() {
    if(state.tickets.length === 0) { showMessage("보유한 선택권이 없습니다."); return; }
    currentTicketTier = state.tickets.shift();
    document.getElementById('ticket-tier').innerText = currentTicketTier;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('ticket-modal').style.display = 'block';
    updateUI();
}

function useTicket(choice) {
    let emptyIdx = grid.findIndex(v => v === null);
    if(emptyIdx === -1) { showMessage("공간 부족!"); return; }
    
    let tier = currentTicketTier;
    let cls = choice === '랜덤' ? Object.keys(CLASSES)[Math.floor(Math.random()*3)] : choice;
    if(choice === '랜덤' && Math.random() < 0.2) tier++;
    
    addUnit(emptyIdx, tier, cls);
    closeAllModals();
}

function toggleSpeed() {
    if (state.speed === 1) state.speed = 3;
    else if (state.speed === 3) state.speed = 5;
    else state.speed = 1;
    
    document.getElementById('btn-speed').innerText = state.speed + "배속";
}

function loop() {
    if(state.status === 'GAMEOVER' || state.status === 'TITLE') return;
    
    let now = performance.now();
    let dt = ((now - lastTime) / 1000) * state.speed;
    if (dt > 0.1) dt = 0.1;
    lastTime = now;
    
    if (state.status === 'PREP') {
        state.time -= dt;
        document.getElementById('ui-timer').innerText = Math.ceil(state.time);
        
        if (state.time <= 0) {
            state.status = 'PLAY';
            state.wave = 1;
            waveTimer = 0; spawnTimer = 0;
            showMessage("1웨이브 시작!");
            updateUI();
        }
        draw();
        requestAnimationFrame(loop);
        return;
    }
    
    updateWave(dt);
    
    for(let i=monsters.length-1; i>=0; i--) {
        let m = monsters[i];
        let t = PATH[m.targetNode];
        let dx = t.x - m.x, dy = t.y - m.y;
        let dist = Math.hypot(dx, dy);
        let move = m.speed * dt;
        
        if(dist <= move) {
            m.x = t.x; m.y = t.y;
            m.targetNode = (m.targetNode + 1) % PATH.length;
        } else {
            m.x += (dx/dist)*move; m.y += (dy/dist)*move;
        }
    }
    
    if(monsters.length >= 200) { gameOver("몬스터 200마리 초과! 게임 오버"); return; }
    
    towers.forEach(t => {
        t.lastAttack -= dt * 1000;
        if(t.lastAttack <= 0) {
            let range = t.cls.range * t.grade.rangeMul;
            let target = null, minDist = range;
            for(let m of monsters) {
                let d = Math.hypot(m.x - t.x, m.y - t.y);
                if(d <= minDist) { minDist = d; target = m; }
            }
            if(target) {
                let dmg = (t.cls.baseDmg + state.upgrades[t.cls.type].val) * t.grade.mult;
                projectiles.push({
                    type: t.cls.type, x: t.x, y: t.y, tx: target.x, ty: target.y,
                    dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash,
                    color: t.cls.color, target: target, angle: 0
                });
                t.lastAttack = t.cls.cd * (t.grade.speedMul || 1);
            }
        }
    });
    
    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i];
        let dx = p.tx - p.x, dy = p.ty - p.y;
        let dist = Math.hypot(dx, dy);
        let speed = 400 * dt;
        
        if(p.type === '도적') p.angle += 15 * dt; 
        
        if(dist <= speed) {
            if(monsters.includes(p.target)) p.target.hp -= p.dmg;
            if(p.splash > 0) {
                monsters.forEach(m => {
                    if(m !== p.target && Math.hypot(m.x - p.tx, m.y - p.ty) <= p.splash) m.hp -= p.dmg;
                });
            }
            projectiles.splice(i, 1);
        } else {
            p.x += (dx/dist)*speed; p.y += (dy/dist)*speed;
        }
    }
    
    for(let i=monsters.length-1; i>=0; i--) {
        if(monsters[i].hp <= 0) {
            state.kills++; state.mp++; state.mpTotal++;
            if(state.mpTotal >= 10) { state.meso += 5; state.mpTotal -= 10; }
            if(monsters[i].isBoss) {
                let b = BOSS_WAVES[state.wave];
                state.meso += b.meso; state.tickets.push(b.ticket);
                showMessage(`${state.wave}라운드 보스 처치!`);
            }
            monsters.splice(i, 1);
            updateUI();
        }
    }
    
    draw();
    document.getElementById('ui-mobs').innerText = `${monsters.length} / 200`;
    requestAnimationFrame(loop);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 35;
    ctx.beginPath(); ctx.rect(25, 25, 450, 450); ctx.stroke();
    
    // 선택된 유닛이 있을 경우 사거리 표시
    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx]) {
        let u = grid[selectedUnitIdx];
        let range = u.cls.range * u.grade.rangeMul;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath(); ctx.arc(u.x, u.y, range, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1; ctx.stroke();
    }
    
    monsters.forEach(m => {
        let size = m.isBoss ? 16 : 10; 
        if (!m.isBoss) {
            ctx.fillStyle = "#81c784";
            ctx.beginPath(); ctx.arc(m.x, m.y + 2, size, Math.PI, 0);
            ctx.fillRect(m.x - size, m.y + 2, size*2, size/2); ctx.fill();
        } else {
            ctx.fillStyle = "#ff8a65"; 
            ctx.beginPath(); ctx.arc(m.x, m.y - 2, size, Math.PI, 0); ctx.fill();
            ctx.fillStyle = "#ffe0b2"; ctx.fillRect(m.x - size/2, m.y - 2, size, size - 2);
        }
        ctx.fillStyle = "#000"; ctx.fillRect(m.x-10, m.y-size-8, 20, 3);
        ctx.fillStyle = "#4caf50"; ctx.fillRect(m.x-10, m.y-size-8, 20 * (m.hp/m.maxHp), 3);
    });
    
    projectiles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        let dx = p.tx - p.x; let dy = p.ty - p.y;
        let dir = Math.atan2(dy, dx);
        
        if (p.type === '전사') {
            ctx.rotate(dir); ctx.fillStyle = "rgba(229, 57, 53, 0.8)";
            ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI/2, Math.PI/2);
            ctx.arc(6, 0, 15, Math.PI/2, -Math.PI/2, true); ctx.fill();
        } else if (p.type === '법사') {
            ctx.rotate(dir); ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 3;
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
}

function updateUI() {
    document.getElementById('ui-meso').innerText = state.meso;
    document.getElementById('ui-mp').innerText = state.mp;
    document.getElementById('ui-wave').innerText = state.wave;
    document.getElementById('ui-kills').innerText = state.kills.toLocaleString();
    document.getElementById('ui-tickets').innerText = state.tickets.length;
    document.getElementById('btn-summon').disabled = (state.meso < 10);
    
    // 유닛이 선택되어 있고 팔 수 있는 등급일 경우에만 판매 버튼 활성화
    let sellBtn = document.getElementById('btn-sell-single');
    if (selectedUnitIdx !== -1 && grid[selectedUnitIdx] && grid[selectedUnitIdx].grade.sell > 0) {
        sellBtn.disabled = false;
    } else {
        sellBtn.disabled = true;
    }
}

function showMessage(msg) {
    let ov = document.getElementById('msg-overlay');
    ov.innerText = msg; ov.style.display = 'block';
    setTimeout(() => { ov.style.display = 'none'; }, 2000);
}

function gameOver(msg) {
    state.status = 'GAMEOVER';
    showMessage(msg);
}

updateUI();