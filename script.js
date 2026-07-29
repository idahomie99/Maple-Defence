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
    '전사': { type: '전사', color: '#c62828', baseDmg: 20, range: 100, cd: 1000, splash: 40 },
    '법사': { type: '법사', color: '#1565c0', baseDmg: 10, range: 160, cd: 1000, splash: 60 },
    '도적': { type: '도적', color: '#6a1b9a', baseDmg: 18, range: 200, cd: 800, splash: 0 }
};

const BOSS_WAVES = {
    24: { hp: 5000, meso: 50, ticket: 3 },
    37: { hp: 15000, meso: 50, ticket: 4 },
    58: { hp: 50000, meso: 50, ticket: 4 },
    79: { hp: 150000, meso: 70, ticket: 5 },
    90: { hp: 500000, meso: 100, ticket: 5 },
    100: { hp: 2000000, meso: 100, ticket: 5 }
};

let state = {
    meso: 25, mp: 0, mpTotal: 0, kills: 0, wave: 1, time: 120,
    speed: 1, isBoss: false, gameOver: false,
    upgrades: { '전사': {val: 0, cost: 10}, '법사': {val: 0, cost: 10}, '도적': {val: 0, cost: 10} },
    tickets: []
};

let grid = new Array(25).fill(null);
let monsters = [], projectiles = [], towers = [];
let lastTime = performance.now(), waveTimer = 0, spawnTimer = 0;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridContainer = document.getElementById('grid-container');

// 모바일 500x500 논리 캔버스 기준 경로설정
// 보드 15% 마진 = 75px. 5x5 그리드 사이즈 = 350px. 셀당 70px.
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

function getGradeByProb() {
    let rand = Math.random() * 100;
    let acc = 0;
    for(let i=0; i v === null);
    if(emptyIdx === -1) { showMessage("배치 공간이 부족합니다!"); return; }
    
    state.meso -= 10;
    let gradeIdx = getGradeByProb();
    let clsName = Object.keys(CLASSES)[Math.floor(Math.random() * 3)];
    
    addUnit(emptyIdx, gradeIdx, clsName);
    updateUI();
}

function addUnit(idx, gradeIdx, clsName) {
    let grade = GRADES[gradeIdx];
    let cls = CLASSES[clsName];
    
    let unit = {
        idx: idx, gradeIdx: gradeIdx, grade: grade, cls: cls,
        // 75(오프셋) + 셀위치 * 70(셀크기) + 35(셀중앙)
        x: 75 + (idx % 5) * 70 + 35,
        y: 75 + Math.floor(idx / 5) * 70 + 35,
        lastAttack: 0
    };
    
    grid[idx] = unit;
    towers.push(unit);
    
    if(gradeIdx >= 5) showMessage(`[전체] ${grade.name} ${clsName} 등장!`);
    renderGrid();
}

let selectedUnitIdx = -1;
let isMoving = false;

function onCellClick(idx) {
    if(isMoving) {
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
        isMoving = false;
        renderGrid();
        showMessage("이동 완료!");
        return;
    }
    
    if(grid[idx]) {
        selectedUnitIdx = idx;
        let u = grid[idx];
        document.getElementById('popup-title').innerText = `${u.grade.name} ${u.cls.type}`;
        document.getElementById('popup-desc').innerText = `판매 시 ${u.grade.sell} 메소 획득`;
        document.getElementById('btn-sell').disabled = (u.grade.sell === 0);
        document.getElementById('overlay').style.display = 'block';
        document.getElementById('popup').style.display = 'block';
    }
}

function closeAllModals() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('popup').style.display = 'none';
    document.getElementById('ticket-modal').style.display = 'none';
    isMoving = false;
}

function sellUnit() {
    if(selectedUnitIdx === -1) return;
    let u = grid[selectedUnitIdx];
    if(u && u.grade.sell > 0) {
        state.meso += u.grade.sell;
        towers = towers.filter(t => t !== u);
        grid[selectedUnitIdx] = null;
        renderGrid(); updateUI();
    }
    closeAllModals();
}

function startMoveUnit() {
    isMoving = true;
    closeAllModals();
    showMessage("바꿀 위치를 터치하세요.");
}

function renderGrid() {
    let cells = gridContainer.children;
    for(let i=0; i<25; i++) {
        let u = grid[i];
        if(u) {
            cells[i].innerHTML = `${u.cls.type[0]}${u.grade.name}`;
        } else { cells[i].innerHTML = ''; }
    }
}

function spawnMonster() {
    let hpBase = state.isBoss ? BOSS_WAVES[state.wave].hp : state.wave * 15;
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
    
    if(state.isBoss) {
        showMessage(`[보스 라운드] ${state.wave}라운드 보스 출현!`);
        spawnMonster();
    }
    updateUI();
}

function upgrade(type) {
    let u = state.upgrades[type];
    if(state.mp >= u.cost) {
        state.mp -= u.cost;
        u.val += Math.floor(Math.random() * 6) + 1;
        u.cost += 1;
        let idChar = type === '전사' ? 'w' : (type === '법사' ? 'm' : 't');
        document.getElementById(`upg-${idChar}-val`).innerText = u.val;
        document.getElementById(`upg-${idChar}-cost`).innerText = u.cost;
        updateUI();
    } else { showMessage("MP가 부족합니다."); }
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

function loop() {
    if(state.gameOver) return;
    let now = performance.now();
    let dt = ((now - lastTime) / 1000) * state.speed;
    lastTime = now;
    
    updateWave(dt);
    
    // 몹 이동
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
    
    // 공격
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
                    x: t.x, y: t.y, tx: target.x, ty: target.y,
                    dmg: dmg, splash: t.grade.splash ? (t.cls.splash || 100) : t.cls.splash,
                    color: t.cls.color, target: target
                });
                t.lastAttack = t.cls.cd * (t.grade.speedMul || 1);
            }
        }
    });
    
    // 투사체
    for(let i=projectiles.length-1; i>=0; i--) {
        let p = projectiles[i];
        let dx = p.tx - p.x, dy = p.ty - p.y;
        let dist = Math.hypot(dx, dy);
        let speed = 400 * dt;
        
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
    
    // 사망
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
    
    // 경로 라인
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 35;
    ctx.beginPath(); ctx.rect(25, 25, 450, 450); ctx.stroke();
    
    // 몬스터
    monsters.forEach(m => {
        ctx.fillStyle = m.isBoss ? "#d32f2f" : "#fff";
        let size = m.isBoss ? 12 : 6;
        ctx.beginPath(); ctx.arc(m.x, m.y, size, 0, Math.PI*2); ctx.fill();
        
        // 체력바
        ctx.fillStyle = "#000"; ctx.fillRect(m.x-10, m.y-size-8, 20, 3);
        ctx.fillStyle = "#4caf50"; ctx.fillRect(m.x-10, m.y-size-8, 20 * (m.hp/m.maxHp), 3);
    });
    
    // 투사체
    projectiles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
    });
}

function updateUI() {
    document.getElementById('ui-meso').innerText = state.meso;
    document.getElementById('ui-mp').innerText = state.mp;
    document.getElementById('ui-wave').innerText = state.wave;
    document.getElementById('ui-kills').innerText = state.kills.toLocaleString();
    document.getElementById('ui-tickets').innerText = state.tickets.length;
    document.getElementById('btn-summon').disabled = (state.meso < 10);
}

function toggleSpeed() {
    state.speed = state.speed === 1 ? 3 : 1;
    document.getElementById('btn-speed').innerText = state.speed + "배속";
}

function showMessage(msg) {
    let ov = document.getElementById('msg-overlay');
    ov.innerText = msg; ov.style.display = 'block';
    setTimeout(() => { ov.style.display = 'none'; }, 2000);
}

function gameOver(msg) {
    state.gameOver = true;
    showMessage(msg);
}

updateUI();
requestAnimationFrame(loop);