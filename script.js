import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // 0. 스플래시 화면
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
        setTimeout(() => { splashScreen.classList.add('hide'); setTimeout(() => splashScreen.remove(), 500); }, 1500);
    }

    const mainContent = document.getElementById('main-content');
    const topHeader = document.getElementById('top-header');
    mainContent.addEventListener('scroll', () => {
        topHeader.classList.toggle('scrolled', mainContent.scrollTop > 10);
    });

    const bindRipple = () => {
        const rippleBtns = document.querySelectorAll('.ripple-btn, .small-ripple-btn, .pill-btn, .rec-list-item');
        rippleBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                const rect = this.getBoundingClientRect();
                const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                const ripple = document.createElement('span'); ripple.classList.add('ripple');
                const size = Math.max(rect.width, rect.height);
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${x - size / 2}px`; ripple.style.top = `${y - size / 2}px`;
                ripple.style.animation = this.classList.contains('small-ripple-btn') ? 'ripple-anim-small 0.4s ease-out forwards' : 'ripple-anim-large 0.6s ease-out forwards';
                this.appendChild(ripple); setTimeout(() => ripple.remove(), 600);
            });
        });
    };
    bindRipple();

    // 1. 구글 로그인 및 마이페이지
    const btnAccount = document.getElementById('nav-account');
    const btnTopProfile = document.getElementById('btn-top-profile'); 
    const profilePic = document.querySelector('.profile-pic');
    const greeting = document.querySelector('.greeting');
    const accountScreen = document.getElementById('account-screen');
    const btnBackAccount = document.getElementById('btn-back-account');
    
    const defaultProfileSvg = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394A3B8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>')`;

    onAuthStateChanged(auth, (user) => {
        if (user) { 
            greeting.innerText = `${user.displayName}님,\n어디로 떠나시나요?`; 
            profilePic.style.backgroundImage = `url('${user.photoURL}')`; 
            document.getElementById('account-name').innerText = user.displayName; 
            document.getElementById('account-email').innerText = user.email; 
            document.getElementById('account-profile-pic').style.backgroundImage = `url('${user.photoURL}')`;
        } else { 
            greeting.innerText = `어디로 떠나시나요?`; 
            profilePic.style.backgroundImage = defaultProfileSvg; 
            document.getElementById('account-name').innerText = '로그인이 필요합니다'; 
            document.getElementById('account-email').innerText = '이메일 정보 없음'; 
            document.getElementById('account-profile-pic').style.backgroundImage = defaultProfileSvg;
            accountScreen.classList.remove('active');
        }
    });

    const handleLoginOrMyPage = () => { if (auth.currentUser) accountScreen.classList.add('active'); else signInWithPopup(auth, provider).catch(err => alert("로그인 에러")); };
    if(btnTopProfile) btnTopProfile.addEventListener('click', handleLoginOrMyPage);
    if(btnAccount) btnAccount.addEventListener('click', handleLoginOrMyPage);
    if(btnBackAccount) btnBackAccount.addEventListener('click', () => accountScreen.classList.remove('active'));

    // 🚀 글로벌 상태 변수 관리
    let aiMode = 'standard'; 
    let currentAiStep = 1; 
    const totalAiSteps = 8;
    const aiProgressBar = document.getElementById('ai-progress-bar'); 
    const btnAiNext = document.getElementById('btn-ai-next');
    const aiScreen = document.getElementById('ai-screen'); 
    
    // 여행 데이터 통합 보관
    let aiData = { 
        startDate: null, 
        endDate: null, 
        totalTripDays: 0,
        destinations: [{ country: '', city: '', stayDays: 0 }], // 다중 여행지 배열
        arrTime: '', 
        depTime: '', 
        accom: '', 
        companion: '', 
        people: 1, 
        styles: [], 
        myStyles: [], 
        ptStyles: [], 
        stamina: 3 
    };

    // 🚀 2. 스텝 1: 달력 로직 (일정 먼저 묻기)
    let tempStartDate = null; let tempEndDate = null;
    const calendarModal = document.getElementById('calendar-modal'); 
    const calendarOverlay = document.getElementById('calendar-overlay'); 
    const calendarContainer = document.getElementById('calendar-grid-container'); 

    const fm = (d) => {
        if(!d) return '';
        if(typeof d === 'string') return d;
        return `${d.getMonth()+1}.${d.getDate()}`;
    };

    const updateDateTexts = () => {
        const aiText = document.getElementById('ai-date-text');
        if(aiText) {
            if(!aiData.startDate) aiText.innerText = '날짜를 선택해주세요';
            else aiText.innerText = aiData.endDate ? `${fm(aiData.startDate)} ~ ${fm(aiData.endDate)} (${aiData.totalTripDays}일)` : `${fm(aiData.startDate)} ~ 선택 중`;
        }
        document.getElementById('label-arr-date').innerText = aiData.startDate ? `(${aiData.startDate.getMonth()+1}/${aiData.startDate.getDate()})` : ''; 
        document.getElementById('label-dep-date').innerText = aiData.endDate ? `(${aiData.endDate.getMonth()+1}/${aiData.endDate.getDate()})` : ''; 
        
        // 날짜가 정해졌을 때만 체류 일수 자동 계산 로직 업데이트
        updateStayDaysUI();
        validateAiStep();
    };

    document.getElementById('btn-open-calendar-ai')?.addEventListener('click', () => {
        tempStartDate = aiData.startDate; tempEndDate = aiData.endDate;
        calendarOverlay.style.display = 'block'; setTimeout(() => calendarModal.classList.add('active'), 10); renderCalendar();
    });
    
    const closeCalendar = () => { calendarModal.classList.remove('active'); setTimeout(() => calendarOverlay.style.display = 'none', 300); };
    document.getElementById('btn-close-calendar')?.addEventListener('click', closeCalendar); 
    calendarOverlay.addEventListener('click', closeCalendar);
    
    document.getElementById('btn-confirm-date')?.addEventListener('click', () => {
        if (!tempStartDate || !tempEndDate) { alert('시작일과 종료일을 모두 선택해주세요.'); return; }
        aiData.startDate = tempStartDate; 
        aiData.endDate = tempEndDate;
        // 총 여행 일수 계산 (시작일 포함이므로 +1)
        aiData.totalTripDays = Math.round((tempEndDate - tempStartDate) / (1000 * 60 * 60 * 24)) + 1;
        updateDateTexts(); closeCalendar();
    });

    const renderCalendar = () => {
        if (!calendarContainer) return; calendarContainer.innerHTML = '';
        const today = new Date(); today.setHours(0,0,0,0);
        for (let i = 0; i < 3; i++) {
            const year = today.getFullYear(); const month = today.getMonth() + i; const drawDate = new Date(year, month, 1);
            const monthTitle = document.createElement('div'); monthTitle.className = 'month-title'; monthTitle.innerText = `${drawDate.getFullYear()}년 ${drawDate.getMonth() + 1}월`; calendarContainer.appendChild(monthTitle);
            const grid = document.createElement('div'); grid.className = 'calendar-grid';
            for(let j = 0; j < drawDate.getDay(); j++) { grid.innerHTML += `<div></div>`; }
            const lastDate = new Date(year, month + 1, 0).getDate();
            for(let d = 1; d <= lastDate; d++) {
                const currentDate = new Date(year, month, d); const cell = document.createElement('div'); cell.className = 'cal-day'; cell.innerText = d;
                if (currentDate < today) { cell.classList.add('disabled'); } else {
                    const timeCur = currentDate.getTime(); const timeStart = tempStartDate ? tempStartDate.getTime() : null; const timeEnd = tempEndDate ? tempEndDate.getTime() : null;
                    if (timeStart === timeCur || timeEnd === timeCur) cell.classList.add('selected');
                    if (timeStart && timeEnd) { if (timeCur > timeStart && timeCur < timeEnd) cell.classList.add('in-range'); if (timeCur === timeStart && timeStart !== timeEnd) cell.classList.add('range-start'); if (timeCur === timeEnd && timeStart !== timeEnd) cell.classList.add('range-end'); }
                    cell.addEventListener('click', () => {
                        if (!tempStartDate || (tempStartDate && tempEndDate)) { tempStartDate = currentDate; tempEndDate = null; }
                        else if (tempStartDate && !tempEndDate) { if (currentDate >= tempStartDate) tempEndDate = currentDate; else tempStartDate = currentDate; }
                        renderCalendar(); updateDateTexts();
                    });
                }
                grid.appendChild(cell);
            }
            calendarContainer.appendChild(grid);
        }
    };

    // 🚀 3. 스텝 2: 다중 여행지 (국가 및 도시) 선택 로직
    const countryData = {
        '아시아': ['일본', '태국', '베트남', '대만', '중국', '필리핀', '싱가포르', '인도네시아', '말레이시아'],
        '유럽': ['프랑스', '이탈리아', '영국', '스페인', '독일', '스위스', '체코', '오스트리아'],
        '아메리카': ['미국', '캐나다', '멕시코', '브라질', '아르헨티나'],
        '오세아니아/기타': ['호주', '뉴질랜드', '괌', '사이판']
    };

    const destContainer = document.getElementById('dest-form-container');
    const countryModal = document.getElementById('country-modal');
    const countryListContainer = document.getElementById('country-list-container');
    const btnCountryBack = document.getElementById('btn-country-back');
    const countryModalTitle = document.getElementById('country-modal-title');
    
    let activeDestIndex = 0; // 현재 국가 모달을 띄운 폼의 인덱스

    // 여행지가 여러 개일 때 UI 처리 (번호 달기, 날짜 칸 띄우기)
    const updateStayDaysUI = () => {
        const destItems = document.querySelectorAll('.dest-item');
        const isMulti = destItems.length > 1;
        
        if (isMulti) document.getElementById('btn-optimize-route').style.display = 'flex';
        else document.getElementById('btn-optimize-route').style.display = 'none';

        destItems.forEach((item, idx) => {
            const numBadge = item.querySelector('.dest-num');
            const removeBtn = item.querySelector('.remove-dest-btn');
            const stayBox = item.querySelector('.stay-days-box');
            
            if (isMulti) {
                numBadge.style.display = 'flex'; numBadge.innerText = idx + 1;
                removeBtn.style.display = 'flex';
                // 전체 여행 일수가 설정되어 있으면 며칠 묵을지 묻는 폼 켜기
                if(aiData.totalTripDays > 0) stayBox.style.display = 'flex';
                else stayBox.style.display = 'none';
            } else {
                numBadge.style.display = 'none';
                removeBtn.style.display = 'none';
                stayBox.style.display = 'none';
            }
        });
    };

    // 국가 선택 모달 열기
    const openCountryModal = (index) => {
        activeDestIndex = index;
        countryModalTitle.innerText = '대륙 선택';
        btnCountryBack.style.display = 'none';
        
        let html = '';
        Object.keys(countryData).forEach(continent => {
            html += `<div class="country-list-item" data-continent="${continent}">${continent}<span class="material-symbols-rounded" style="color:#CBD5E1;">chevron_right</span></div>`;
        });
        countryListContainer.innerHTML = html;
        
        calendarOverlay.style.display = 'block'; 
        setTimeout(() => countryModal.classList.add('active'), 10);
        
        // 대륙 클릭 시 -> 국가 리스트로 전환 (가나다순 정렬)
        document.querySelectorAll('.country-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const cont = el.getAttribute('data-continent');
                countryModalTitle.innerText = cont;
                btnCountryBack.style.display = 'flex';
                
                const countries = countryData[cont].sort();
                let subHtml = '';
                countries.forEach(c => {
                    subHtml += `<div class="country-list-item final-country" data-country="${c}">${c}</div>`;
                });
                countryListContainer.innerHTML = subHtml;

                // 국가 최종 클릭 시 -> 폼에 반영하고 닫기
                document.querySelectorAll('.final-country').forEach(cel => {
                    cel.addEventListener('click', () => {
                        const selectedCountry = cel.getAttribute('data-country');
                        aiData.destinations[activeDestIndex].country = selectedCountry;
                        const btn = document.querySelector(`.dest-item[data-index="${activeDestIndex}"] .country-select-btn`);
                        btn.innerHTML = `<span style="color:#2563EB;">${selectedCountry}</span><span class="material-symbols-rounded">expand_more</span>`;
                        
                        closeCountryModal();
                        validateAiStep();
                    });
                });
            });
        });
    };

    const closeCountryModal = () => { countryModal.classList.remove('active'); setTimeout(() => calendarOverlay.style.display = 'none', 300); };
    document.getElementById('btn-close-country')?.addEventListener('click', closeCountryModal);
    btnCountryBack?.addEventListener('click', () => openCountryModal(activeDestIndex)); // 뒤로가기 누르면 대륙 선택으로

    // 이벤트 델리게이션으로 폼 버튼들 관리
    destContainer?.addEventListener('click', (e) => {
        const item = e.target.closest('.dest-item');
        if(!item) return;
        const index = parseInt(item.getAttribute('data-index'));

        if(e.target.closest('.country-select-btn')) {
            openCountryModal(index);
        }
        else if(e.target.closest('.remove-dest-btn')) {
            if(aiData.destinations.length > 1) {
                aiData.destinations.splice(index, 1);
                item.remove();
                
                // 인덱스 재정비
                document.querySelectorAll('.dest-item').forEach((el, newIdx) => {
                    el.setAttribute('data-index', newIdx);
                });
                updateStayDaysUI();
                validateAiStep();
            }
        }
    });

    destContainer?.addEventListener('input', (e) => {
        const item = e.target.closest('.dest-item');
        if(!item) return;
        const index = parseInt(item.getAttribute('data-index'));
        
        if(e.target.classList.contains('city-input')) {
            aiData.destinations[index].city = e.target.value.trim();
            validateAiStep();
        }
        if(e.target.classList.contains('stay-days-input')) {
            aiData.destinations[index].stayDays = parseInt(e.target.value) || 0;
            validateAiStep();
        }
    });

    // 🚀 여행지 추가 버튼 (+) 로직
    document.getElementById('btn-add-dest')?.addEventListener('click', () => {
        const newIndex = aiData.destinations.length;
        aiData.destinations.push({ country: '', city: '', stayDays: 0 });
        
        const html = `
            <div class="dest-item" data-index="${newIndex}">
                <div class="dest-num"></div>
                <div class="dest-inputs">
                    <div class="dest-row">
                        <button class="country-select-btn ripple-btn">국가를 선택하세요<span class="material-symbols-rounded">expand_more</span></button>
                    </div>
                    <div class="dest-row">
                        <input type="text" class="city-input" placeholder="도시 / 랜드마크 자유 입력">
                        <div class="stay-days-box">
                            <input type="number" class="stay-days-input" placeholder="체류 일수"><span>일</span>
                        </div>
                    </div>
                </div>
                <button class="icon-btn remove-dest-btn" style="color:#EF4444;"><span class="material-symbols-rounded">do_not_disturb_on</span></button>
            </div>
        `;
        destContainer.insertAdjacentHTML('beforeend', html);
        updateStayDaysUI();
        validateAiStep();
    });

    // AI 동선 최적화 버튼 (시각적 액션만 보여줌)
    document.getElementById('btn-optimize-route')?.addEventListener('click', () => {
        alert("AI가 여행지 간의 거리와 교통편을 계산하여 가장 효율적인 순서로 동선을 재배치했습니다! 🔄");
        // 실제 배열 순서를 바꾸는 척 (UI만 리렌더링)
    });

    // 4. 나머지 AI 생성기 설정
    document.getElementById('btn-ai-standard')?.addEventListener('click', () => { aiMode = 'standard'; aiScreen.classList.add('active'); resetAiFlow(); });
    document.getElementById('btn-ai-tension')?.addEventListener('click', () => { aiMode = 'tension'; aiScreen.classList.add('active'); resetAiFlow(); });
    document.getElementById('btn-back-ai')?.addEventListener('click', () => { if(confirm("일정 짜기를 그만두시겠습니까?")) aiScreen.classList.remove('active'); });

    let map = null; let marker = null; 
    const initMap = () => {
        if(!map) { 
            map = L.map('map-container').setView([37.5665, 126.9780], 13); 
            L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko').addTo(map); 
            map.on('click', function(e) { 
                if(marker) map.removeLayer(marker); marker = L.marker(e.latlng).addTo(map); 
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`).then(res => res.json()).then(data => { const placeName = data.name || data.address.suburb || data.display_name.split(',')[0]; document.getElementById('map-selected-address').innerText = placeName; document.getElementById('ai-input-accom').value = placeName; }).catch(() => {}); 
            }); 
        }
        setTimeout(() => map.invalidateSize(), 100);
    };
    document.getElementById('btn-open-map')?.addEventListener('click', () => { calendarOverlay.style.display = 'block'; document.getElementById('map-modal').classList.add('active'); setTimeout(() => initMap(), 300); });
    const closeMap = () => { document.getElementById('map-modal').classList.remove('active'); setTimeout(() => calendarOverlay.style.display = 'none', 300); }; 
    document.getElementById('btn-close-map')?.addEventListener('click', closeMap); document.getElementById('btn-confirm-map')?.addEventListener('click', closeMap);

    const resetAiFlow = () => { 
        currentAiStep = 1; aiProgressBar.style.width = `${(1/totalAiSteps)*100}%`; btnAiNext.innerText = '다음으로'; btnAiNext.disabled = true; 
        for(let i=1; i<=totalAiSteps; i++) {
            const stepEl = document.getElementById(`ai-step-${i}`);
            if(stepEl) stepEl.className = i===1 ? 'ai-step active' : 'ai-step'; 
        }
        
        // 데이터 초기화
        aiData = { startDate: null, endDate: null, totalTripDays: 0, destinations: [{ country: '', city: '', stayDays: 0 }], arrTime: '', depTime: '', accom: '', companion: '', people: 1, styles: [], myStyles: [], ptStyles: [], stamina: 3 }; 
        aiStartDate = null; aiEndDate = null; updateDateTexts(); 
        
        // 폼 UI 초기화
        destContainer.innerHTML = `
            <div class="dest-item" data-index="0">
                <div class="dest-num" style="display:none;">1</div>
                <div class="dest-inputs">
                    <div class="dest-row"><button class="country-select-btn ripple-btn">국가를 선택하세요<span class="material-symbols-rounded">expand_more</span></button></div>
                    <div class="dest-row"><input type="text" class="city-input" placeholder="도시 / 랜드마크 자유 입력"><div class="stay-days-box" style="display:none;"><input type="number" class="stay-days-input" placeholder="체류 일수"><span>일</span></div></div>
                </div>
                <button class="icon-btn remove-dest-btn" style="display:none; color:#EF4444;"><span class="material-symbols-rounded">do_not_disturb_on</span></button>
            </div>
        `;
        updateStayDaysUI();
        
        document.getElementById('ai-input-arr-time').value = ''; document.getElementById('ai-input-dep-time').value = ''; document.getElementById('ai-input-accom').value = ''; document.getElementById('people-count').innerText = '1명'; 
        document.getElementById('ai-input-stamina').value = 3; document.getElementById('stamina-emoji').innerHTML = '<span class="material-symbols-rounded" style="font-size: 48px; color: #10B981; transition: color 0.3s ease;">battery_5_bar</span>';
        document.querySelectorAll('.ai-option-card').forEach(c => c.classList.remove('selected')); document.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('selected')); 
        
        if(aiMode === 'standard') { document.getElementById('step-7-standard').style.display = 'block'; document.getElementById('step-7-tension').style.display = 'none'; } 
        else { document.getElementById('step-7-standard').style.display = 'none'; document.getElementById('step-7-tension').style.display = 'block'; }
    };
    
    // 🚀 단계별 꼼꼼한 검증 로직 추가
    const validateAiStep = () => { 
        if(!btnAiNext) return; 
        
        if(currentAiStep === 1) {
            btnAiNext.disabled = !(aiData.startDate && aiData.endDate);
        }
        else if(currentAiStep === 2) {
            // 모든 폼에 최소한 '도시 이름'은 적혀있어야 통과
            const isAllFilled = aiData.destinations.every(d => d.city.trim() !== '');
            // 다중 여행지면 체류 일수 합이 전체 일정과 맞는지 검증할 수도 있음 (여기선 일단 입력만 하면 통과)
            btnAiNext.disabled = !isAllFilled; 
        } 
        else if(currentAiStep === 3 || currentAiStep === 4) btnAiNext.disabled = false; 
        else if(currentAiStep === 5) btnAiNext.disabled = aiData.companion === ''; 
        else if(currentAiStep === 6) btnAiNext.disabled = false; 
        else if(currentAiStep === 7) {
            if(aiMode === 'standard') btnAiNext.disabled = aiData.styles.length === 0;
            else btnAiNext.disabled = (aiData.myStyles.length === 0 || aiData.ptStyles.length === 0);
        }
        else if(currentAiStep === 8) btnAiNext.disabled = false;
    };
    
    document.querySelectorAll('.ai-option-card').forEach(card => { 
        card.addEventListener('click', () => { document.querySelectorAll('.ai-option-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); aiData.companion = card.getAttribute('data-val'); validateAiStep(); }); 
    });
    
    document.getElementById('btn-minus-people')?.addEventListener('click', () => { if(aiData.people > 1) { aiData.people--; document.getElementById('people-count').innerText = `${aiData.people}명`; }}); 
    document.getElementById('btn-plus-people')?.addEventListener('click', () => { if(aiData.people < 20) { aiData.people++; document.getElementById('people-count').innerText = `${aiData.people}명`; }});

    document.querySelectorAll('.ai-chip').forEach(chip => { 
        chip.addEventListener('click', () => { 
            if(chip.classList.contains('age-chip')) chip.classList.toggle('selected');
            else if(chip.classList.contains('std-chip')) {
                const val = chip.getAttribute('data-val');
                if(chip.classList.contains('selected')) { chip.classList.remove('selected'); aiData.styles = aiData.styles.filter(s => s !== val); } 
                else { if(aiData.styles.length >= 3) { alert('최대 3개까지만!'); return; } chip.classList.add('selected'); aiData.styles.push(val); }
            }
            else if(chip.classList.contains('my-chip')) {
                const val = chip.getAttribute('data-val');
                if(chip.classList.contains('selected')) { chip.classList.remove('selected'); aiData.myStyles = aiData.myStyles.filter(s => s !== val); } 
                else { if(aiData.myStyles.length >= 2) { alert('내 스타일은 2개까지만!'); return; } chip.classList.add('selected'); aiData.myStyles.push(val); }
            }
            else if(chip.classList.contains('pt-chip')) {
                const val = chip.getAttribute('data-val');
                if(chip.classList.contains('selected')) { chip.classList.remove('selected'); aiData.ptStyles = aiData.ptStyles.filter(s => s !== val); } 
                else { if(aiData.ptStyles.length >= 2) { alert('동행자 스타일은 2개까지만!'); return; } chip.classList.add('selected'); aiData.ptStyles.push(val); }
            }
            validateAiStep(); 
        }); 
    });

    const staminaSlider = document.getElementById('ai-input-stamina');
    const staminaEmoji = document.getElementById('stamina-emoji');
    if(staminaSlider) {
        staminaSlider.addEventListener('input', (e) => {
            aiData.stamina = e.target.value;
            let iconName = 'battery_5_bar'; let iconColor = '#10B981';
            if(aiData.stamina == 1) { iconName = 'battery_1_bar'; iconColor = '#DC2626'; }
            else if(aiData.stamina == 2) { iconName = 'battery_3_bar'; iconColor = '#F59E0B'; }
            else if(aiData.stamina == 3) { iconName = 'battery_5_bar'; iconColor = '#10B981'; }
            else if(aiData.stamina == 4) { iconName = 'battery_full'; iconColor = '#3B82F6'; }
            else if(aiData.stamina == 5) { iconName = 'bolt'; iconColor = '#8B5CF6'; }
            staminaEmoji.innerHTML = `<span class="material-symbols-rounded" style="font-size: 48px; color: ${iconColor}; transition: color 0.3s ease;">${iconName}</span>`;
        });
    }

    if(btnAiNext) {
        btnAiNext.addEventListener('click', () => {
            if (currentAiStep < totalAiSteps) {
                if(currentAiStep === 3) { aiData.arrTime = document.getElementById('ai-input-arr-time').value; aiData.depTime = document.getElementById('ai-input-dep-time').value; }
                if(currentAiStep === 4) aiData.accom = document.getElementById('ai-input-accom').value.trim();

                const curEl = document.getElementById(`ai-step-${currentAiStep}`);
                const nextEl = document.getElementById(`ai-step-${currentAiStep + 1}`);
                curEl.classList.remove('active'); curEl.classList.add('exit');
                setTimeout(() => nextEl.classList.add('active'), 100);
                
                currentAiStep++; aiProgressBar.style.width = `${(currentAiStep/totalAiSteps)*100}%`;
                if(currentAiStep === totalAiSteps) btnAiNext.innerText = 'AI 일정 생성하기';
                validateAiStep();
            } 
            else if (currentAiStep === totalAiSteps) {
                try {
                    document.getElementById('ai-loading-overlay').classList.add('active');
                    setTimeout(() => {
                        try {
                            document.getElementById('ai-loading-overlay').classList.remove('active');
                            generateAiTimeline(); 
                            aiScreen.classList.remove('active');
                        } catch(err) {
                            document.getElementById('ai-loading-overlay').classList.remove('active');
                            console.error("타임라인 생성 중 에러:", err);
                            alert("앗, 일정 분석 중 오류가 났습니다. 다시 시도해주세요! (" + err.message + ")");
                        }
                    }, 2500);
                } catch(e) {
                    console.error("데이터 세팅 중 에러:", e);
                    alert("데이터 처리 중 오류가 발생했습니다.");
                }
            }
        });
    }

    // ===================================================================
    // 🚀 5. 대망의 AI 타임라인 생성 
    // ===================================================================
    let routeMap = null; 
    let routeLayerGroup = null;
    let movingMarker = null;
    let currentMarkerIndex = -1;
    let currentSelectedDay = 1; 
    let dailyPlans = {}; 
    let isMapView = false;
    
    // 여행지 데이터베이스 (사진 URL - Unsplash 리얼 이미지 적용)
    const spotDB = {
        '오사카': {
            tour: [ {n: '유니버셜 스튜디오 재팬', d: '해리포터와 닌텐도 월드는 필수 코스입니다.', img: 'https://images.unsplash.com/photo-1590559899731-a382839cecdf'}, {n: '오사카 성', d: '일본을 대표하는 웅장한 역사 건축물', img: 'https://images.unsplash.com/photo-1590252973167-27e1f4d90ce3'}, {n: '우메다 공중정원', d: '오사카 시내가 한눈에 들어오는 최고의 야경 뷰', img: 'https://images.unsplash.com/photo-1520668611843-7f212d26fdf2'} ],
            food: [ {n: '도톤보리 타코야키', d: '입천장 데여도 포기할 수 없는 겉바속촉', img: 'https://images.unsplash.com/photo-1574484284002-952d92456975'}, {n: '쿠시카츠 다루마', d: '원조 튀김 꼬치와 시원한 생맥주의 조합', img: 'https://images.unsplash.com/photo-1583339824000-60eaeb00f40d'}, {n: '이치란 라멘', d: '한국인 입맛에 가장 잘 맞는 독서실 라멘', img: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624'} ],
            cafe: [ {n: '나카자키초 카페거리', d: '골목골목 숨겨진 빈티지 감성 카페 탐방', img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24'}, {n: '리버뷰 테라스 카페', d: '강가를 바라보며 마시는 여유로운 커피 한 잔', img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93'} ],
            indoor: [ {n: '가이유칸 수족관', d: '고래상어를 볼 수 있는 세계 최대 규모의 수족관', img: 'https://images.unsplash.com/photo-1582967788606-a171c1080cb0'}, {n: '파르코 백화점', d: '지브리 스토어와 짱구 샵이 있는 쇼핑 천국', img: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6'} ]
        }
    };

    const fallbackImages = {
        tour: ['1527631509225-7e23115584a3', '1552733407-5d5c46c3bb3b', '1506012787146-f92b2d7d6d96'],
        food: ['1504674900247-0877df9cc836', '1550966871-3ed3cdb5ed0c', '1569718212165-3a8278d5f624'],
        cafe: ['1509042239860-f550ce710b93', '1554118811-1e0d58224f24', '1551024601-bec78aea704b'],
        indoor: ['1582967788606-a171c1080cb0', '1519567241046-7f570eee3ce6', '1499856871958-5b9627545d1a']
    };

    const getSpots = (city, type) => {
        const validCity = city || '여행지';
        const dbCity = Object.keys(spotDB).find(k => validCity.includes(k));
        if(dbCity && spotDB[dbCity][type]) return spotDB[dbCity][type];
        
        return [
            {n: `${validCity} 핫플 1`, d: '여행자들의 필수 코스', img: `https://images.unsplash.com/photo-${fallbackImages[type]?.[0] || '1476514525535-07fb3b4ae5f1'}`},
            {n: `${validCity} 핫플 2`, d: '현지 느낌 물씬 나는 곳', img: `https://images.unsplash.com/photo-${fallbackImages[type]?.[1] || '1506012787146-f92b2d7d6d96'}`}
        ];
    };

    const generateAiTimeline = () => {
        const resultScreen = document.getElementById('ai-result-screen');
        
        // 🚀 다중 여행지 첫 번째 도시를 메인 타이틀로 사용
        const mainDest = aiData.destinations[0].city || '미지의 여행지';
        document.getElementById('ai-result-title').innerText = `${mainDest} 일정`;
        
        let subText = `${fm(aiData.startDate)} ~ ${fm(aiData.endDate)} · `;
        if(aiMode === 'standard' && aiData.styles.length > 0) subText += `${aiData.styles[0]} 위주`;
        else if (aiMode === 'tension') subText += `우당탕탕 타협 플랜`;
        else subText += `자유 여행`;
        document.getElementById('ai-result-subtitle').innerText = subText;

        // 상단 날짜 탭
        const totalDays = aiData.totalTripDays > 0 ? aiData.totalTripDays : 3; 
        let tabsHtml = '';
        for(let i=1; i<=totalDays; i++) {
            const activeCls = i === 1 ? 'active' : '';
            // 임시로 월 계산 로직 단순화
            let dateNum = aiData.startDate.getDate() + (i-1);
            tabsHtml += `<div class="day-tab ${activeCls}" data-day="${i}"><div class="d-day">Day ${i}</div><div class="d-date">${aiData.startDate.getMonth()+1}.${dateNum}</div></div>`;
        }
        document.getElementById('ai-result-tabs').innerHTML = tabsHtml;

        const styleToCat = { '힐링': 'cafe', '먹방': 'food', '관광': 'tour', '쇼핑': 'indoor', '액티비티': 'tour', '자연': 'tour', '예술': 'indoor', '호캉스': 'cafe' };
        const allTags = aiMode === 'standard' ? aiData.styles : [...aiData.myStyles, ...aiData.ptStyles];
        const userPrefs = allTags.map(s => { const cleanStyle = s.replace('나: ', '').replace('동행: ', ''); return styleToCat[cleanStyle] || 'tour'; });

        // Day별 일정 데이터 생성
        dailyPlans = {};
        for(let d=1; d<=totalDays; d++) {
            let hpPercent = 50; let scheduleTemplate = [];
            if(aiData.stamina == 1 || aiData.stamina == 2) {
                hpPercent = 90; 
                scheduleTemplate = [ {time: '11:00', type: 'food', text: '느지막히 일어나 든든한 아점'}, {time: '13:00', type: userPrefs[0] || 'tour', text: '가볍게 탐방'}, {time: '15:30', type: 'cafe', text: '체력이 떨어졌으니 긴 휴식'}, {time: '18:00', type: 'food', text: '저녁 식사 및 복귀'} ];
            } else if(aiData.stamina == 3) {
                hpPercent = 65; 
                scheduleTemplate = [ {time: '10:00', type: userPrefs[0] || 'tour', text: '오전 관광'}, {time: '12:30', type: 'food', text: '점심 식사'}, {time: '14:00', type: userPrefs[1] || 'tour', text: '오후 투어'}, {time: '16:30', type: 'cafe', text: '당 충전 및 휴식'}, {time: '18:30', type: 'food', text: '저녁 식사'} ];
            } else {
                hpPercent = 30; 
                scheduleTemplate = [ {time: '09:00', type: userPrefs[0] || 'tour', text: '아침 투어 시작'}, {time: '11:30', type: userPrefs[1] || 'tour', text: '도장 깨기'}, {time: '13:30', type: 'food', text: '늦은 점심'}, {time: '15:00', type: userPrefs[2] || 'indoor', text: '폭풍 쇼핑 및 실내 관광'}, {time: '18:00', type: 'food', text: '저녁 식사'}, {time: '20:00', type: 'tour', text: '야경 투어'} ];
            }

            let daySpots = [];
            scheduleTemplate.forEach(slot => {
                // 다중 여행지 배열에 맞춰서 이 날짜에 해당하는 도시를 가져오도록 고도화 가능 (현재는 메인 도시 고정)
                const currentCity = mainDest; 
                const spots = getSpots(currentCity, slot.type);
                const randomSpot = spots[Math.floor(Math.random() * spots.length)];
                
                let iconColor = '#8B5CF6'; let iconBg = '#F1F5F9'; let catName = '이동'; let mIcon = 'directions_car';
                if(slot.type === 'food') { iconColor = '#DC2626'; iconBg = 'rgba(220,38,38,0.1)'; catName = '식사'; mIcon = 'restaurant'; }
                if(slot.type === 'tour') { iconColor = '#2563EB'; iconBg = 'rgba(37,99,235,0.1)'; catName = '관광'; mIcon = 'photo_camera'; }
                if(slot.type === 'cafe') { iconColor = '#F59E0B'; iconBg = 'rgba(245,158,11,0.1)'; catName = '휴식'; mIcon = 'local_cafe'; }
                if(slot.type === 'indoor') { iconColor = '#10B981'; iconBg = 'rgba(16,185,129,0.1)'; catName = '실내'; mIcon = 'storefront'; }

                let survivalTip = '';
                if(slot.type === 'food' && Math.random() > 0.4) survivalTip = `<div class="survival-tip"><span class="material-symbols-rounded tip-icon">lightbulb</span><span class="tip-text">꿀팁: 영어가 안 통할 수 있으니 파파고 번역기를 켜두세요!</span></div>`;
                if(slot.type === 'tour' && Math.random() > 0.4) survivalTip = `<div class="survival-tip"><span class="material-symbols-rounded tip-icon">photo_camera</span><span class="tip-text">꿀팁: 해 질 녘(일몰) 시간에 맞춰 가면 예쁜 인생샷이 나옵니다.</span></div>`;

                daySpots.push({ time: slot.time, type: slot.type, catName: catName, mIcon: mIcon, name: randomSpot.n, desc: slot.text + '. ' + randomSpot.d, img: randomSpot.img, color: iconColor, bg: iconBg, tip: survivalTip });
            });
            dailyPlans[d] = { hp: hpPercent, spots: daySpots };
        }

        const renderDayPlan = (day, isPlanB) => {
            currentSelectedDay = day;
            const plan = dailyPlans[day];
            
            let timelineHtml = `
                <div class="plan-b-toggle">
                    <div class="plan-b-btn ${!isPlanB ? 'active' : ''}" id="btn-plan-a"><span class="material-symbols-rounded">wb_sunny</span>기본 일정</div>
                    <div class="plan-b-btn ${isPlanB ? 'active' : ''}" id="btn-plan-b"><span class="material-symbols-rounded">umbrella</span>우천 시 (플랜 B)</div>
                    <div class="plan-b-bg" style="transform: translateX(${isPlanB ? '100%' : '0'});"></div>
                </div>
                <div class="hp-bar-container"><div class="hp-title"><span>오늘의 예상 체력 소모</span><span>${plan.hp}%</span></div><div class="hp-track"><div class="hp-fill" style="width: ${plan.hp}%;"></div></div><p style="font-size:11px; color:var(--text-sub); margin-top:8px; font-weight:600;">${plan.hp > 80 ? '⚠️ 체력 소모가 매우 큽니다. 편한 신발을 신고 휴식을 챙기세요!' : '✨ 컨디션 안배에 딱 좋은 완벽한 플랜입니다.'}</p></div>
            `;

            plan.spots.forEach(spot => {
                let currentCat = spot.catName;
                if(isPlanB && spot.type === 'tour') currentCat = '실내 대체'; 
                let imgHtml = spot.img ? `<div class="tc-img" style="background-image: url('${spot.img}?q=80&w=400&auto=format&fit=crop');"></div>` : '';

                timelineHtml += `
                <div class="timeline-item">
                    <div class="timeline-time">${spot.time}</div>
                    <div class="timeline-line-container"><div class="timeline-dot"></div><div class="timeline-line"></div></div>
                    <div class="timeline-card">
                        <div class="timeline-card-header"><h3 class="tc-title">${spot.name}</h3><span class="tc-category" style="color:${spot.color}; background:${spot.bg};"><span class="material-symbols-rounded" style="font-size:14px; margin-top:1px;">${spot.mIcon}</span>${currentCat}</span></div>
                        <p class="tc-desc">${spot.desc}</p>
                        ${imgHtml}
                        ${spot.tip}
                    </div>
                </div>`;
            });
            document.getElementById('ai-timeline-container').innerHTML = timelineHtml;
            
            document.getElementById('btn-plan-a')?.addEventListener('click', () => { if(isPlanB) renderDayPlan(day, false); });
            document.getElementById('btn-plan-b')?.addEventListener('click', () => { if(!isPlanB) { alert('☔ 비 오는 날 맞춤 실내 일정으로 전면 수정됩니다!'); renderDayPlan(day, true); }});
            
            if(isMapView && routeMap) { drawRoute(routeMap.getCenter().lat, routeMap.getCenter().lng, plan.spots); }
        };

        renderDayPlan(1, false);

        document.querySelectorAll('.day-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const dayNum = parseInt(tab.getAttribute('data-day'));
                renderDayPlan(dayNum, false);
            });
        });

        if(!routeMap) {
            routeMap = L.map('ai-result-map', { zoomControl: false }).setView([37.5665, 126.9780], 13);
            L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko').addTo(routeMap);
            routeLayerGroup = L.layerGroup().addTo(routeMap);
        }

        if(mainDest !== '미지의 여행지') {
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mainDest)}`)
            .then(res => res.json()).then(data => {
                if(data && data.length > 0) {
                    routeMap.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 13);
                }
            }).catch(()=>{});
        }

        isMapView = false; currentMarkerIndex = -1;
        document.getElementById('ai-timeline-container').style.display = 'flex';
        document.getElementById('ai-explore-container').style.display = 'none';
        document.getElementById('ai-result-map').style.display = 'none';
        document.getElementById('top-map-icon').innerText = 'map';
        document.getElementById('map-info-card').classList.remove('active');
        
        document.querySelectorAll('.explore-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.explore-chip[data-type="timeline"]')?.classList.add('active');

        resultScreen.classList.add('active');
    };

    const animateMovement = (startLatLng, endLatLng, iconHtml, duration, callback) => {
        if(movingMarker) routeMap.removeLayer(movingMarker);
        const icon = L.divIcon({ className: 'moving-transport', html: iconHtml, iconSize: [36, 36], iconAnchor: [18, 18] });
        movingMarker = L.marker(startLatLng, {icon, zIndexOffset: 1000}).addTo(routeMap);

        const startTime = performance.now();
        const animate = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const lat = startLatLng[0] + (endLatLng[0] - startLatLng[0]) * ease;
            const lng = startLatLng[1] + (endLatLng[1] - startLatLng[1]) * ease;
            movingMarker.setLatLng([lat, lng]);

            if(progress < 1) requestAnimationFrame(animate);
            else {
                routeMap.removeLayer(movingMarker); movingMarker = null;
                if(callback) callback();
            }
        };
        requestAnimationFrame(animate);
    };

    const drawRoute = (lat, lng, daySpots) => {
        routeLayerGroup.clearLayers();
        currentMarkerIndex = -1;
        document.getElementById('map-info-card').classList.remove('active');

        if(!daySpots) {
            if(dailyPlans && dailyPlans[currentSelectedDay]) daySpots = dailyPlans[currentSelectedDay].spots;
            else daySpots = [];
        }

        const pointOffsets = [ [0.005, -0.005], [0.015, 0.002], [-0.002, 0.015], [-0.010, -0.008], [-0.015, 0.005], [0.01, -0.015] ];
        const points = daySpots.map((_, i) => [lat + pointOffsets[i%6][0], lng + pointOffsets[i%6][1]]);
        
        const polyline = L.polyline(points, {color: '#8B5CF6', weight: 4, dashArray: '8, 8'}).addTo(routeLayerGroup);
        
        points.forEach((p, index) => {
            const icon = L.divIcon({ className: 'custom-route-marker', html: `<div>${index + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
            const marker = L.marker(p, {icon}).addTo(routeLayerGroup);

            marker.on('click', () => {
                const infoCard = document.getElementById('map-info-card');
                infoCard.classList.remove('active');

                const showCard = () => {
                    const spot = daySpots[index];
                    document.getElementById('map-info-title').innerText = spot.name;
                    document.getElementById('map-info-desc').innerText = spot.desc;
                    document.getElementById('map-info-badge').innerText = spot.catName;
                    
                    let bgImg = spot.img || 'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b';
                    document.getElementById('map-info-img').style.backgroundImage = `url('${bgImg}?q=80&w=200&auto=format&fit=crop')`;
                    
                    routeMap.flyTo([p[0] - 0.005, p[1]], 14, {duration: 0.5});
                    setTimeout(() => infoCard.classList.add('active'), 300);
                };

                if (index > 0 && currentMarkerIndex < index) {
                    const transportIcon = Math.random() > 0.5 ? '<span class="material-symbols-rounded" style="color:#2563EB; font-size:24px;">directions_car</span>' : '<span class="material-symbols-rounded" style="color:#10B981; font-size:24px;">directions_walk</span>';
                    animateMovement(points[index-1], p, transportIcon, 1200, showCard);
                } else {
                    showCard();
                }
                currentMarkerIndex = index;
            });
        });
        
        if(points.length > 0) routeMap.fitBounds(polyline.getBounds(), {padding: [50, 50]});
    };

    document.getElementById('btn-toggle-map-top')?.addEventListener('click', () => {
        isMapView = !isMapView;
        const timelineContainer = document.getElementById('ai-timeline-container');
        const exploreContainer = document.getElementById('ai-explore-container');
        const resultMap = document.getElementById('ai-result-map');
        const mapIcon = document.getElementById('top-map-icon');

        if(isMapView) {
            timelineContainer.style.display = 'none'; exploreContainer.style.display = 'none';
            resultMap.style.display = 'block'; mapIcon.innerText = 'format_list_bulleted'; 
            if(routeMap) {
                setTimeout(() => routeMap.invalidateSize(), 100);
                drawRoute(routeMap.getCenter().lat, routeMap.getCenter().lng, dailyPlans[currentSelectedDay].spots);
            }
        } else {
            const activeTab = document.querySelector('.explore-chip.active')?.getAttribute('data-type') || 'timeline';
            if(activeTab === 'timeline') timelineContainer.style.display = 'flex'; else exploreContainer.style.display = 'flex';
            resultMap.style.display = 'none'; mapIcon.innerText = 'map'; 
            document.getElementById('map-info-card').classList.remove('active');
        }
    });

    document.querySelectorAll('.explore-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.explore-chip').forEach(c => c.classList.remove('active')); chip.classList.add('active');
            
            const type = chip.getAttribute('data-type');
            const timelineContainer = document.getElementById('ai-timeline-container');
            const exploreContainer = document.getElementById('ai-explore-container');
            const resultMap = document.getElementById('ai-result-map');
            
            if(isMapView) { isMapView = false; document.getElementById('top-map-icon').innerText = 'map'; document.getElementById('map-info-card').classList.remove('active'); }

            if(type === 'timeline') {
                timelineContainer.style.display = 'flex'; exploreContainer.style.display = 'none'; resultMap.style.display = 'none';
            } else {
                timelineContainer.style.display = 'none'; resultMap.style.display = 'none'; exploreContainer.style.display = 'flex';
                
                const mainDest = aiData.destinations[0].city || '도시';
                const spots = getSpots(mainDest, type);
                let html = '';
                
                spots.forEach((spot, i) => {
                    let imgUrl = spot.img || `https://images.unsplash.com/photo-${fallbackImages.tour[0]}`;
                    let spotName = spot.n || spot;
                    let spotDesc = spot.d || '멋진 여행지입니다.';
                    
                    html += `
                    <div class="explore-card">
                        <div class="explore-card-img" style="background-image: url('${imgUrl}?q=80&w=200&auto=format&fit=crop');"></div>
                        <div class="explore-card-info">
                            <div class="explore-card-title">${spotName}</div>
                            <div class="explore-card-sub">별점 4.${8-i} · ${spotDesc}</div>
                            <button class="explore-add-btn ripple-btn" onclick="alert('내 일정에 추가되었습니다! 😆')">+ 내 일정에 추가/교체</button>
                        </div>
                    </div>`;
                });
                exploreContainer.innerHTML = html;
            }
        });
    });

    document.getElementById('btn-back-ai-result')?.addEventListener('click', () => { 
        if(confirm("저장하지 않고 홈 화면으로 돌아가시겠습니까?\n작성된 일정은 모두 사라집니다.")) {
            document.getElementById('ai-result-screen').classList.remove('active'); 
        }
    });

    const navHome = document.getElementById('nav-home'); 
    if(navHome) navHome.addEventListener('click', () => { navHome.classList.add('active'); if(btnAccount) btnAccount.classList.remove('active'); });
});