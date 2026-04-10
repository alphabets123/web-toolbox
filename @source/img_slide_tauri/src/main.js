/**
 * SnapTask Image Slider - Tauri v2 전용 (웹 버전 기반 완전 재작성)
 */

// --- 상수 ---
const DEFAULT_API_KEY = "AIzaSyDmj2GWjxJ_ngeXkNUes6iBk-dz1MrGFus";
const DEFAULT_FOLDER_ID = "기본명화이미지(test용)|1GGclR62dPOzW38k7YJ9XZ9WfAcCbD8eQ|1";

// --- 상태 ---
let state = {
    images: [],
    currentIndex: -1,
    isPlaying: true,
    timer: null,
    activeLayer: 'a',
    preloaded: new Set(),
    settings: {
        apiKey: DEFAULT_API_KEY,
        folderIds: DEFAULT_FOLDER_ID,
        localFolders: [],
        interval: 20,
        transition: 'fade',
        fit: 'contain',
        shuffle: true,
        isPinned: false,
        useScroll: true,
        fullscreen: false
    },
    cursorTimer: null,
    hudTimer: null
};

let invoke = null;
let dialogOpen = null;

// --- 초기화 ---
async function initApp() {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    try {
        loadingText.textContent = '시스템을 초기화 중입니다...';

        // Tauri API 대기 (최대 5초)
        let count = 0;
        while (!window.__TAURI__ && count < 50) {
            await new Promise(r => setTimeout(r, 100));
            count++;
        }
        if (!window.__TAURI__) throw new Error('Tauri API를 찾을 수 없습니다.');

        invoke = window.__TAURI__.core.invoke;
        const dlg = window.__TAURI__.pluginDialog || window.__TAURI__.dialog;
        if (dlg) dialogOpen = dlg.open;

        // 설정 로드
        loadingText.textContent = '설정을 불러오는 중...';
        await loadSettings();

        // 이벤트 등록
        setupEvents();

        // 전체화면 부팅 체크
        if (state.settings.fullscreen) {
            try {
                const win = window.__TAURI__.window.getCurrentWindow();
                await win.setFullscreen(true);
            } catch (e) { console.warn('Auto fullscreen failed:', e); }
        }

        // 이미지 목록 로드
        await fetchImages();

    } catch (err) {
        console.error('Init error:', err);
        loadingText.textContent = '오류: ' + err.message;
        loadingText.style.color = '#ff6b6b';
        document.getElementById('loading-spinner')?.classList.add('hidden');
        document.getElementById('error-refresh-btn')?.classList.remove('hidden');
    }
}

// --- 설정 로드/저장 ---
async function loadSettings() {
    try {
        if (!invoke) return;
        const raw = await invoke('load_settings');
        const saved = JSON.parse(raw);
        state.settings = { ...state.settings, ...saved };
        console.log('Settings successfully loaded:', state.settings);
    } catch (e) {
        if (e === 'NOT_FOUND') {
            console.log('Settings file not found. Initializing with defaults...');
            await saveSettings();
        } else {
            console.error('Failed to load settings:', e);
            // alert('설정을 불러오지 못했습니다: ' + e);
        }
    }
    syncHUD();
}

async function saveSettings() {
    try {
        if (invoke) {
            // 보안: 기본 API 키와 같으면 파일에 저장하지 않음
            const settingsToSave = { ...state.settings };
            if (settingsToSave.apiKey === DEFAULT_API_KEY) {
                delete settingsToSave.apiKey;
            }

            await invoke('save_settings', { settings: JSON.stringify(settingsToSave) });
            console.log('Settings saved (Sensitive info masked if default).');
        }
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// --- HUD 동기화 ---
function syncHUD() {
    const el = (id) => document.getElementById(id);
    if (el('hud-interval')) el('hud-interval').value = state.settings.interval;
    if (el('hud-transition')) el('hud-transition').value = state.settings.transition;
    if (el('hud-fit')) el('hud-fit').value = state.settings.fit;
    if (el('hud-shuffle')) el('hud-shuffle').checked = state.settings.shuffle;
    if (el('hud-scroll')) el('hud-scroll').checked = state.settings.useScroll;
    if (el('setting-fullscreen-start')) el('setting-fullscreen-start').checked = state.settings.fullscreen;

    const hud = document.getElementById('hud-menu');
    if (state.settings.isPinned) {
        hud?.classList.add('pinned');
        el('pin-btn')?.classList.add('active');
    }

    updateFitControls();
    renderFolderLists();
}

function updateFitControls() {
    const scrollLabel = document.getElementById('hud-scroll-label');
    if (!scrollLabel) return;
    
    if (state.settings.fit === 'cover-width') {
        scrollLabel.classList.remove('disabled');
    } else {
        scrollLabel.classList.add('disabled');
    }
}

// --- 이벤트 등록 ---
function setupEvents() {
    const el = (id) => document.getElementById(id);

    // 재생/정지
    el('play-pause-btn')?.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        el('play-icon').textContent = state.isPlaying ? 'pause' : 'play_arrow';
        if (state.isPlaying) {
            nextSlide();
        } else {
            if (state.timer) clearTimeout(state.timer);
            const p = el('progress-bar');
            if (p) { p.style.transition = 'none'; p.style.width = '0%'; }
        }
    });

    el('next-btn')?.addEventListener('click', nextSlide);
    el('prev-btn')?.addEventListener('click', prevSlide);

    // HUD 컨트롤
    el('hud-interval')?.addEventListener('change', (e) => {
        state.settings.interval = parseInt(e.target.value) || 20;
        resetTimer();
        startProgressBar();
        saveSettings();
    });
    el('hud-transition')?.addEventListener('change', (e) => {
        state.settings.transition = e.target.value;
        saveSettings();
    });
    el('hud-fit')?.addEventListener('change', (e) => {
        state.settings.fit = e.target.value;
        updateFitControls();
        applyLiveStyles();
        saveSettings();
    });
    el('hud-shuffle')?.addEventListener('change', (e) => {
        state.settings.shuffle = e.target.checked;
        if (state.images.length > 0) {
            if (state.settings.shuffle) shuffleArray(state.images);
            else state.images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        }
        saveSettings();
    });
    el('hud-scroll')?.addEventListener('change', (e) => {
        state.settings.useScroll = e.target.checked;
        applyLiveStyles();
        saveSettings();
    });
    el('setting-fullscreen-start')?.addEventListener('change', (e) => {
        state.settings.fullscreen = e.target.checked;
        saveSettings();
    });

    // 고정 버튼
    el('pin-btn')?.addEventListener('click', () => {
        state.settings.isPinned = !state.settings.isPinned;
        const hud = el('hud-menu');
        hud?.classList.toggle('pinned', state.settings.isPinned);
        el('pin-btn')?.classList.toggle('active', state.settings.isPinned);
        saveSettings();
    });

    // 전체화면
    el('fullscreen-btn')?.addEventListener('click', async () => {
        try {
            const win = window.__TAURI__.window.getCurrentWindow();
            const isFull = await win.isFullscreen();
            await win.setFullscreen(!isFull);
            
            // UI 업데이트
            updateFullscreenUI(!isFull);
        } catch (e) {
            console.error('Fullscreen Error:', e);
        }
    });

    // 전체화면 상태 감시 (F11 등으로 변경될 경우 대비)
    try {
        const win = window.__TAURI__.window.getCurrentWindow();
        win.onResized(async () => {
            const isFull = await win.isFullscreen();
            updateFullscreenUI(isFull);
        });
    } catch (e) {}

    // 마우스 이동 감지 (커서 숨김 및 HUD 타이머 갱신용)
    document.addEventListener('mousemove', () => {
        resetCursorTimer();
        if (document.getElementById('hud-menu')?.classList.contains('visible')) {
            resetHUDTimer();
        }
    });

    // 종료
    el('exit-btn-hud')?.addEventListener('click', () => {
        if (invoke) invoke('exit_app');
    });

    // 설정 모달
    el('settings-btn')?.addEventListener('click', () => {
        if (el('setting-api-key')) el('setting-api-key').value = state.settings.apiKey;
        el('settings-modal')?.classList.add('active');
    });
    el('close-settings')?.addEventListener('click', () => el('settings-modal')?.classList.remove('active'));
    el('save-settings-btn')?.addEventListener('click', async () => {
        const newApiKey = el('setting-api-key')?.value;
        if (newApiKey) state.settings.apiKey = newApiKey;
        
        el('settings-modal')?.classList.remove('active');
        // 슬라이더 리셋 및 재시작
        if (state.timer) clearTimeout(state.timer);
        const imgA = el('img-a'), imgB = el('img-b');
        imgA.classList.remove('active', 'panning'); imgA.src = '';
        imgB.classList.remove('active', 'panning'); imgB.src = '';
        state.images = []; state.currentIndex = -1; state.preloaded.clear();
        await fetchImages();
    });

    // 로컬 폴더 추가
    el('add-local-folder-btn')?.addEventListener('click', async () => {
        if (!dialogOpen) return;
        try {
            const selected = await dialogOpen({ directory: true, multiple: false, title: '이미지 폴더 선택' });
            if (selected) {
                const name = selected.split(/[\/\\]/).pop() || selected;
                state.settings.localFolders.push({ path: selected, name, isEnabled: true });
                renderFolderLists();
                saveSettings();
            }
        } catch (e) { console.error('Folder select:', e); }
    });

    // 구글 드라이브 폴더 추가
    el('add-folder-btn')?.addEventListener('click', () => {
        const id = prompt("추가할 구글 드라이브 폴더 ID를 입력하세요.");
        if (id) {
            state.settings.folderIds += `,새 폴더|${id}|1`;
            renderFolderLists();
            saveSettings();
        }
    });

    // HUD 토글 (빈 영역 클릭)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#hud-menu') || e.target.closest('#settings-modal')) {
            resetHUDTimer(); // HUD 내부 클릭 시에도 타이머 갱신
            return;
        }
        const hud = el('hud-menu');
        const isVisible = hud?.classList.toggle('visible');
        if (isVisible) resetHUDTimer();
    });
}

// --- 이미지 목록 로드 ---
async function fetchImages() {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    loadingText.textContent = '이미지 목록을 준비 중입니다...';

    let allFiles = [];

    // 구글 드라이브
    if (state.settings.folderIds) {
        const entries = state.settings.folderIds.split(',').filter(s => s.trim());
        for (const entry of entries) {
            const parts = entry.split('|');
            if (parts.length < 2) continue;
            const title = parts[0].trim();
            const folderId = parts[1].trim();
            const isEnabled = parts.length >= 3 ? parts[2] === '1' : true;
            
            console.log(`GDrive entry: ${title}, isEnabled: ${isEnabled}`);
            if (!isEnabled || !folderId) continue;

            loadingText.textContent = `구글 드라이브: ${title} 읽는 중...`;
            try {
                const files = await fetchGDriveFiles(folderId);
                allFiles = allFiles.concat(files.map(f => ({ ...f, type: 'gdrive', sourceTitle: title })));
            } catch (e) { console.error('GDrive error:', e); }
        }
    }

    // 로컬 폴더
    if (invoke && state.settings.localFolders) {
        for (const folder of state.settings.localFolders) {
            if (!folder.isEnabled) continue;
            loadingText.textContent = `로컬: ${folder.name} 읽는 중...`;
            try {
                const files = await invoke('get_local_images', { path: folder.path });
                allFiles = allFiles.concat(files.map(f => ({
                    id: f.path, name: f.name, path: f.path, type: 'local', sourceTitle: folder.name
                })));
            } catch (e) { console.error('Local error:', e); }
        }
    }

    if (allFiles.length === 0) {
        loadingText.textContent = '재생할 이미지가 없습니다. 설정을 확인해 주세요.';
        loadingText.style.color = '#ff6b6b';
        document.getElementById('error-refresh-btn')?.classList.remove('hidden');
        return;
    }

    allFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (state.settings.shuffle) shuffleArray(allFiles);

    state.images = allFiles;
    state.currentIndex = -1;

    loadingText.textContent = `총 ${allFiles.length}개 파일 준비 완료!`;
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 500);

    startSlideshow();
}

async function fetchGDriveFiles(folderId, depth = 0) {
    if (depth > 3) return [];

    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder')`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000&key=${state.settings.apiKey}`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    let files = [];
    if (data.files) {
        for (const item of data.files) {
            if (item.mimeType === 'application/vnd.google-apps.folder') {
                files = files.concat(await fetchGDriveFiles(item.id, depth + 1));
            } else {
                files.push(item);
            }
        }
    }
    return files;
}

// --- 슬라이드쇼 엔진 (웹 버전과 동일한 로직) ---
function startSlideshow() {
    if (state.isPlaying) {
        document.getElementById('play-icon').textContent = 'pause';
        nextSlide();
    }
}

function nextSlide() {
    if (state.images.length === 0) return;
    state.currentIndex = (state.currentIndex + 1) % state.images.length;
    showImage(state.currentIndex);
}

function prevSlide() {
    if (state.images.length === 0) return;
    state.currentIndex = (state.currentIndex - 1 + state.images.length) % state.images.length;
    showImage(state.currentIndex);
}

function getImageUrl(file) {
    if (file.type === 'local') {
        return window.__TAURI__.core.convertFileSrc(file.path);
    }
    return `https://lh3.googleusercontent.com/d/${file.id}=s1600`;
}

function showImage(index) {
    const file = state.images[index];
    const imgA = document.getElementById('img-a');
    const imgB = document.getElementById('img-b');

    const nextLayer = state.activeLayer === 'a' ? 'b' : 'a';
    const nextImg = nextLayer === 'a' ? imgA : imgB;
    const currImg = state.activeLayer === 'a' ? imgA : imgB;

    // HUD 정보 업데이트
    document.getElementById('current-info').textContent = file.name;
    document.getElementById('source-icon').textContent = file.type === 'local' ? 'laptop_windows' : 'cloud';
    document.getElementById('source-name').textContent = file.sourceTitle || '';

    // 타이머 리셋
    resetTimer();
    startProgressBar();

    // 전환 효과 결정
    let effect = state.settings.transition;
    if (effect === 'random') {
        const fx = ['fade', 'zoomIn', 'zoomOut', 'slideUp'];
        effect = fx[Math.floor(Math.random() * fx.length)];
    }

    // 클래스 초기화 후 새 효과 적용
    nextImg.className = `slide-img fit-${state.settings.fit}`;
    if (effect !== 'fade') nextImg.classList.add(`effect-${effect}`);

    // 이미지 로드
    const url = getImageUrl(file);
    nextImg.src = url;

    nextImg.onload = () => {
        // 레이아웃 강제 재계산 후 전환
        void nextImg.offsetWidth;
        nextImg.classList.add('active');
        currImg.classList.remove('active');

        // 패닝 효과
        if (state.settings.fit === 'cover-width') {
            nextImg.style.setProperty('--pan-duration', `${state.settings.interval + 2}s`);
            nextImg.style.setProperty('--pan-animation-name', 'pan-vertical');
            nextImg.classList.add('panning');
            if (!state.isPlaying || !state.settings.useScroll) nextImg.classList.add('paused');
        }

        state.activeLayer = nextLayer;
    };

    nextImg.onerror = () => {
        console.warn('이미지 로드 실패:', file.name, url);
        // 3초 후 다음 이미지로
        state.timer = setTimeout(nextSlide, 3000);
    };
}

function startProgressBar() {
    const p = document.getElementById('progress-bar');
    if (!p) return;
    p.style.transition = 'none';
    p.style.width = '0%';
    void p.offsetWidth;
    if (state.isPlaying) {
        p.style.transition = `width ${state.settings.interval}s linear`;
        p.style.width = '100%';
    }
}

function resetTimer() {
    if (state.timer) clearTimeout(state.timer);
    if (state.isPlaying) {
        state.timer = setTimeout(nextSlide, state.settings.interval * 1000);
    }
}

function updateFullscreenUI(isFull) {
    const btn = document.getElementById('fullscreen-btn');
    const icon = btn?.querySelector('.material-symbols-outlined');
    if (btn) btn.classList.toggle('active', isFull);
    if (icon) icon.textContent = isFull ? 'fullscreen_exit' : 'fullscreen';
    
    if (!isFull) {
        resetCursorTimer(true); // 전체화면 해제 시 커서 항상 표시
    }
}

function resetCursorTimer(forceShow = false) {
    // 커서 표시
    document.body.classList.remove('cursor-hidden');
    if (state.cursorTimer) clearTimeout(state.cursorTimer);

    if (forceShow) return;

    // 전체화면일 때만 1초 뒤 숨김 타이머 작동
    const checkFullscreen = async () => {
        try {
            const win = window.__TAURI__.window.getCurrentWindow();
            if (await win.isFullscreen()) {
                state.cursorTimer = setTimeout(() => {
                    document.body.classList.add('cursor-hidden');
                }, 1000);
            }
        } catch (e) {}
    };
    checkFullscreen();
}

function resetHUDTimer() {
    if (state.hudTimer) clearTimeout(state.hudTimer);

    // 고정(핀) 상태이거나 설정창이 열려 있으면 자동 숨김 안 함
    if (state.settings.isPinned || document.getElementById('settings-modal')?.classList.contains('active')) {
        return;
    }

    state.hudTimer = setTimeout(() => {
        const hud = document.getElementById('hud-menu');
        if (hud) hud.classList.remove('visible');
    }, 10000); // 10초
}

function applyLiveStyles() {
    const imgA = document.getElementById('img-a');
    const imgB = document.getElementById('img-b');
    [imgA, imgB].forEach(img => {
        if (!img.classList.contains('active')) return;
        
        img.className = `slide-img active fit-${state.settings.fit}`;
        
        if (state.settings.fit === 'cover-width') {
            img.style.setProperty('--pan-duration', `${state.settings.interval + 2}s`);
            img.style.setProperty('--pan-animation-name', 'pan-vertical');
            img.classList.add('panning');
            if (!state.isPlaying || !state.settings.useScroll) img.classList.add('paused');
            else img.classList.remove('paused');
        } else {
            img.classList.remove('panning', 'paused');
        }
    });
}

// --- 유틸리티 ---
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// --- 설정 창 폴더 렌더링 ---
function renderFolderLists() {
    // 구글 드라이브
    const gList = document.getElementById('folder-list');
    if (gList) {
        gList.innerHTML = '';
        const entries = (state.settings.folderIds || '').split(',').filter(s => s.trim());
        entries.forEach((entry, idx) => {
            const [name, id, enabled] = entry.split('|');
            if (!id) return;
            const isDefault = id === '1GGclR62dPOzW38k7YJ9XZ9WfAcCbD8eQ';
            const div = document.createElement('div');
            div.className = 'folder-item';
            div.innerHTML = `
                <label class="premium-switch">
                    <input type="checkbox" class="toggle-cb" ${enabled === '1' ? 'checked' : ''}>
                    <div class="sw-track"><div class="sw-thumb"></div></div>
                </label>
                <input type="text" class="folder-input" value="${name}" ${isDefault ? 'readonly disabled' : ''}>
                ${!isDefault ? `<button class="remove-btn" title="삭제"><span class="material-symbols-outlined text-[16px]">delete</span></button>` : ''}
            `;
            div.querySelector('.toggle-cb')?.addEventListener('change', (e) => {
                updateGDriveEntry(idx, 'enabled', e.target.checked);
                saveSettings(); // 즉시 저장
            });
            div.querySelector('.folder-input')?.addEventListener('change', (e) => {
                updateGDriveEntry(idx, 'name', e.target.value);
                saveSettings(); // 즉시 저장
            });
            div.querySelector('.remove-btn')?.addEventListener('click', () => {
                removeGDriveEntry(idx);
                saveSettings(); // 즉시 저장
            });
            gList.appendChild(div);
        });
    }

    // 로컬 폴더
    const lList = document.getElementById('local-folder-list');
    if (lList) {
        lList.innerHTML = '';
        if (state.settings.localFolders.length === 0) {
            lList.innerHTML = '<p class="text-[11px] text-center text-on-surface-variant opacity-40 py-4">추가된 로컬 폴더가 없습니다.</p>';
        } else {
            state.settings.localFolders.forEach((folder, idx) => {
                const div = document.createElement('div');
                div.className = 'folder-item';
                div.innerHTML = `
                    <label class="premium-switch">
                        <input type="checkbox" class="toggle-cb" ${folder.isEnabled ? 'checked' : ''}>
                        <div class="sw-track"><div class="sw-thumb"></div></div>
                    </label>
                    <input type="text" class="folder-input" value="${folder.name}" readonly>
                    <button class="remove-btn" title="삭제"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                `;
                div.querySelector('.toggle-cb')?.addEventListener('change', (e) => {
                    state.settings.localFolders[idx].isEnabled = e.target.checked;
                    saveSettings(); // 즉시 저장
                });
                div.querySelector('.remove-btn')?.addEventListener('click', () => {
                    state.settings.localFolders.splice(idx, 1);
                    renderFolderLists();
                    saveSettings(); // 즉시 저장
                });
                lList.appendChild(div);
            });
        }
    }
}

function updateGDriveEntry(idx, field, val) {
    const parts = state.settings.folderIds.split(',');
    let [name, id, enabled] = parts[idx].split('|');
    if (field === 'name') name = val;
    if (field === 'enabled') enabled = val ? '1' : '0';
    parts[idx] = `${name}|${id}|${enabled}`;
    state.settings.folderIds = parts.join(',');
    saveSettings();
}

function removeGDriveEntry(idx) {
    const parts = state.settings.folderIds.split(',');
    const [, id] = parts[idx].split('|');
    if (id === '1GGclR62dPOzW38k7YJ9XZ9WfAcCbD8eQ') return;
    parts.splice(idx, 1);
    state.settings.folderIds = parts.join(',');
    renderFolderLists();
    saveSettings();
}

// --- 앱 시작 ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
