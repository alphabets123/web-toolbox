const folderList = document.getElementById('folder-list');
const addFolderBtn = document.getElementById('add-folder-btn');
const intervalInput = document.getElementById('interval-input');
const displayMethodRadios = document.querySelectorAll('input[name="displayMethod"]');
const panVerticalWrapper = document.getElementById('pan-vertical-wrapper');
const panVerticalCheckbox = document.getElementById('pan-vertical-checkbox');
const panHorizontalWrapper = document.getElementById('pan-horizontal-wrapper');
const panHorizontalCheckbox = document.getElementById('pan-horizontal-checkbox');
const startFullscreenCheckbox = document.getElementById('start-fullscreen-checkbox');
const saveBtn = document.getElementById('save-btn');

let currentFolders = [];

// --- 이벤트 리스너 ---

// 표시 방법 라디오 버튼 변경 시
displayMethodRadios.forEach(radio => {
    radio.addEventListener('change', handleDisplayMethodChange);
});

function handleDisplayMethodChange() {
    const selectedMethod = document.querySelector('input[name="displayMethod"]:checked').value;
    
    // 기본적으로 둘 다 비활성화
    panVerticalCheckbox.disabled = true;
    panHorizontalCheckbox.disabled = true;
    
    if (selectedMethod === 'cover-width') {
        panVerticalCheckbox.disabled = false;
    }
    if (selectedMethod === 'cover-height') {
        panHorizontalCheckbox.disabled = false;
    }
}

// 폴더 목록 UI 렌더링
function renderFolders() {
    folderList.innerHTML = '';
    currentFolders.forEach((folder, index) => {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.innerHTML = `
            <span class="folder-path">${folder}</span>
            <button class="remove-folder-btn" data-index="${index}">-</button>
        `;
        folderList.appendChild(item);
    });
}

// 폴더 추가 버튼 클릭
addFolderBtn.addEventListener('click', async () => {
    const newPaths = await window.electronAPI.openFolderDialog();
    if (newPaths && newPaths.length > 0) {
        currentFolders.push(...newPaths);
        renderFolders();
    }
});

// 폴더 제거 버튼 클릭 (이벤트 위임)
folderList.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-folder-btn')) {
        const index = parseInt(e.target.dataset.index, 10);
        currentFolders.splice(index, 1);
        renderFolders();
    }
});

// 저장 버튼 클릭
saveBtn.addEventListener('click', () => {
    const selectedDisplayMethod = document.querySelector('input[name="displayMethod"]:checked').value;
    const selectedTransitionEffect = document.querySelector('input[name="transitionEffect"]:checked').value;

    const newSettings = {
        imageFolders: currentFolders,
        displayMethod: selectedDisplayMethod,
        panVertical: panVerticalCheckbox.checked,
        panHorizontal: panHorizontalCheckbox.checked,
        startFullscreen: startFullscreenCheckbox.checked,
        slideInterval: parseInt(intervalInput.value, 10) || 10,
        transitionEffect: selectedTransitionEffect
    };
    window.electronAPI.saveSettings(newSettings);
});

// 창이 로드될 때 현재 설정 불러오기
async function loadInitialSettings() {
    const settings = await window.electronAPI.getSettings();
    currentFolders = settings.imageFolders || [];
    
    const displayMethod = settings.displayMethod || 'contain';
    document.querySelector(`input[name="displayMethod"][value="${displayMethod}"]`).checked = true;
    panVerticalCheckbox.checked = settings.panVertical || false;
    panHorizontalCheckbox.checked = settings.panHorizontal || false;
    startFullscreenCheckbox.checked = settings.startFullscreen !== undefined ? settings.startFullscreen : true;

    intervalInput.value = settings.slideInterval || 10;

    document.querySelector(`input[name="transitionEffect"][value="${settings.transitionEffect || 'fade'}"]`).checked = true;

    handleDisplayMethodChange(); // 초기 상태에 맞게 UI 업데이트
    renderFolders();
}

loadInitialSettings();
