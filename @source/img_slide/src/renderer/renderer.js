const imageElement = document.getElementById('current-image');
const messageOverlay = document.getElementById('message-overlay');
const loadingMessage = document.getElementById('loading-message');
const hudMenu = document.getElementById('hud-menu');
const currentPathElement = document.getElementById('current-path');
const pinMenuCheckbox = document.getElementById('pin-menu-checkbox');
const playPauseBtn = document.getElementById('play-pause-btn');
const fullscreenCheckbox = document.getElementById('fullscreen-checkbox');

let imageUrls = [];
let currentIndex = -1;
let slideshowIntervalId = null;
let currentSettings = {};
let activeEffects = [];

// --- HUD 메뉴 관련 로직 ---
let hideMenuTimer = null;

// ⭐️ 화면 클릭 시 메뉴바 토글 (고정 기능과 연동)
document.getElementById('slideshow-container').addEventListener('click', (e) => {
    // 메뉴바 내부를 클릭한 경우는 제외
    if (e.target.closest('#hud-menu')) return;
    hudMenu.classList.toggle('visible');
    document.body.style.cursor = hudMenu.classList.contains('visible') ? 'default' : 'none';
});

document.body.addEventListener('mousemove', (e) => {
    if (pinMenuCheckbox.checked) return; // 메뉴가 고정되어 있으면 아무것도 안 함

    if (e.clientY < 50) { // 마우스가 화면 상단 50px 영역에 있을 때
        hudMenu.classList.add('visible');
        document.body.style.cursor = 'default';
        clearTimeout(hideMenuTimer);
    } else {
        if (hudMenu.classList.contains('visible')) {
            clearTimeout(hideMenuTimer);
            hideMenuTimer = setTimeout(() => {
                hudMenu.classList.remove('visible');
                document.body.style.cursor = 'none';
            }, 500); // 0.5초 후에 메뉴 숨김
        }
    }
});

pinMenuCheckbox.addEventListener('change', () => {
    if (pinMenuCheckbox.checked) {
        clearTimeout(hideMenuTimer); // 숨김 타이머 취소
        hudMenu.classList.add('visible');
        document.body.style.cursor = 'default';
    }
});

fullscreenCheckbox.addEventListener('change', () => {
    window.electronAPI.toggleFullscreen();
});

document.getElementById('prev-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    pauseSlideshow();
    showNextImage(currentIndex - 1);
});

document.getElementById('next-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    pauseSlideshow();
    showNextImage(currentIndex + 1);
});

document.getElementById('settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.openSettingsWindow();
});

document.getElementById('exit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.appQuit();
});

playPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slideshowIntervalId) {
        pauseSlideshow();
    } else {
        resumeSlideshow();
    }
});

function pauseSlideshow() {
    if (slideshowIntervalId) {
        clearInterval(slideshowIntervalId);
        slideshowIntervalId = null;
        playPauseBtn.innerHTML = '▶';
        playPauseBtn.title = '재생';
    }
}

function resumeSlideshow() {
    slideshowIntervalId = setInterval(showNextImage, currentSettings.slideInterval * 1000);
    playPauseBtn.innerHTML = '❚❚';
    playPauseBtn.title = '일시정지';
    showNextImage(); // 즉시 다음 이미지로 넘어감
}

// 배열을 랜덤하게 섞는 함수
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 다음 이미지를 보여주는 함수 (인덱스 직접 지정 가능)
function showNextImage(nextIndex) {
    if (imageUrls.length === 0) return;

    // 인덱스 계산 (배열의 처음과 끝을 순환)
    // nextIndex가 제공되지 않으면 다음 이미지로, 제공되면 해당 인덱스로 이동
    currentIndex = (nextIndex !== undefined ? nextIndex + imageUrls.length : currentIndex + 1) % imageUrls.length;

    // ⭐️ 설정에서 선택된 단일 전환 효과를 가져옵니다.
    const effect = currentSettings.transitionEffect || 'fade';

    // ⭐️ 'none' 효과일 경우, 전환 없이 바로 투명도를 1로 설정합니다.
    if (effect === 'none') {
        imageElement.style.transition = 'none'; // 전환 효과를 일시적으로 제거
        imageElement.style.opacity = 1;
    } else {
        applyTransitionEffect('before', effect);
    }

    setTimeout(() => {
        imageElement.src = imageUrls[currentIndex];
        // URL에서 'file://' 부분을 제거하고, 경로 구분자를 통일하여 표시
        const rawPath = imageUrls[currentIndex].replace('file://', '');
        const displayPath = rawPath.replace(/\//g, '\\');
        currentPathElement.textContent = displayPath;
    }, effect === 'none' ? 0 : 1500); // 'none'일 경우 지연 없이 바로 실행

    imageElement.onload = () => {
        // ⭐️ 이전 스타일을 여기서 초기화합니다.
        // ⭐️ 중요: 클래스 초기화를 전환 효과가 끝난 후에 하도록 아래로 이동시켰습니다.
        // ⭐️ 패닝 애니메이션이 매번 새로 시작되도록 관련 스타일을 확실하게 초기화합니다.
        imageElement.classList.remove('panning');
        imageElement.style.animationName = '';
        imageElement.style.animation = '';
        imageElement.style.transform = '';

        // 1. 표시 방법 설정
        imageElement.classList.add(`fit-${currentSettings.displayMethod || 'contain'}`);
        
        // 2. 화면 이동(패닝) 애니메이션 설정 (해당 옵션이 켜져 있을 때만)
        let animationName = 'none';

        if (currentSettings.displayMethod === 'cover-width' && currentSettings.panVertical) {
            animationName = 'pan-vertical';
        } else if (currentSettings.displayMethod === 'cover-height' && currentSettings.panHorizontal) {
            animationName = 'pan-horizontal';
        }

        if (animationName !== 'none') {
            // ⭐️ 애니메이션을 강제로 다시 시작하는 트릭
            // a. 애니메이션 이름과 시간 설정
            imageElement.style.setProperty('--pan-animation-name', animationName);
            imageElement.style.animationDuration = `${currentSettings.slideInterval}s`;
            // b. panning 클래스를 제거했다가 아주 잠깐의 딜레이 후 다시 추가하여 리플로우 유발
            imageElement.classList.remove('panning');
            void imageElement.offsetWidth; // 리플로우 강제 실행
            imageElement.classList.add('panning');
        }
        
        // 3. 전환 효과 적용
        if (effect !== 'none') {
            applyTransitionEffect('after', effect);
        } else {
            imageElement.style.opacity = 1; // 'none'일 경우에도 투명도는 1로 유지
        }

        // ⭐️ 전환 애니메이션(1.5초)이 끝난 후, 불필요한 클래스를 정리합니다.
        setTimeout(() => {
            // panning 클래스는 계속 유지해야 하므로, 나머지 전환 효과 클래스만 제거합니다.
            imageElement.className = `fit-${currentSettings.displayMethod || 'contain'} transition-base ${animationName !== 'none' ? 'panning' : ''}`;
        }, effect === 'none' ? 0 : 1500);
    };

    imageElement.onerror = () => {
        console.error(`이미지 로드 실패: ${imageUrls[currentIndex]}`);
        showNextImage(); // 로드 실패 시 다음 이미지로
    };

    // 기존 타이머를 초기화하고 새 타이머 설정
    if (slideshowIntervalId) clearInterval(slideshowIntervalId); // 이전 타이머 제거
    slideshowIntervalId = setInterval(showNextImage, currentSettings.slideInterval * 1000); // 새 타이머 설정
    playPauseBtn.innerHTML = '❚❚'; // 재생 상태로 아이콘 변경
    playPauseBtn.title = '일시정지';
}

// 전환 효과 적용 함수
function applyTransitionEffect(phase, effect) {
    // ⭐️ CSS와 일치하도록 클래스 이름을 카멜 케이스(camelCase)로 수정합니다.
    // ⭐️ effect가 'none'일 경우를 대비하여 함수 초반에 반환
    if (effect === 'none') return;

    const effectClass = `transition-${effect.charAt(0).toLowerCase() + effect.slice(1)}`;
    imageElement.classList.add(effectClass);

    if (phase === 'before') {
        // ⭐️ 모든 전환 효과의 시작 스타일을 명확하게 정의합니다.
        imageElement.style.opacity = 0;
        if (effect === 'slideUp') imageElement.style.transform = 'translateY(100px)';
        if (effect === 'zoomIn') imageElement.style.transform = 'scale(0.8)';
        if (effect === 'slideLeft') imageElement.style.transform = 'translateX(100px)';
        if (effect === 'zoomOut') imageElement.style.transform = 'scale(1.2)';
        // fade는 opacity만 0으로 설정
    } else { // after (이미지가 나타날 때)
        // ⭐️ 모든 전환 효과의 종료 스타일을 명확하게 정의합니다.
        imageElement.style.opacity = 1;
        if (effect !== 'fade') { // fade가 아닐 경우 transform을 원래대로 복원
            imageElement.style.transform = 'none';
        }
    }
}

// 슬라이드쇼 시작 및 재시작 함수
async function startOrRestartSlideshow() {
    if (slideshowIntervalId) clearInterval(slideshowIntervalId);
    messageOverlay.classList.remove('hidden'); // 로딩 메시지 보이기
    loadingMessage.innerHTML = '이미지 목록을 불러오는 중...';
    messageOverlay.style.pointerEvents = 'none'; // 클릭 방해하지 않도록
    messageOverlay.onclick = null;

    const { imageUrls: fetchedUrls, settings, error } = await window.electronAPI.getSlideshowData();

    if (error || fetchedUrls.length === 0) {
        let errorMessage = '오류: 이미지 목록을 가져오지 못했습니다.';
        if (settings.imageFolders.length === 0) {
            errorMessage = '설정에서 이미지 폴더를 지정해주세요.';
        } else if (error) {
            errorMessage += ` (오류: ${error})`;
        } else {
            errorMessage = '지정된 폴더에 이미지가 없습니다.';
        }
        loadingMessage.innerHTML = `${errorMessage}<br><br><small>화면 상단으로 마우스를 옮겨 설정을 확인하세요.</small>`;
        messageOverlay.style.pointerEvents = 'auto'; // 메시지 클릭 가능하도록
        messageOverlay.onclick = () => {
            window.electronAPI.openSettingsWindow();
        };
        return;
    }

    imageUrls = fetchedUrls;
    currentSettings = settings;

    messageOverlay.classList.add('hidden'); // 성공 시 오버레이 숨김
    // ⭐️ 시작 시 전체 화면 상태를 체크박스에 반영
    fullscreenCheckbox.checked = settings.startFullscreen;

    console.log(`성공! ${imageUrls.length}개의 이미지 URL을 불러왔습니다.`);
    
    shuffleArray(imageUrls);
    showNextImage(-1); // 첫 번째 이미지부터 시작 (currentIndex가 0이 되도록)
}

// 설정이 업데이트되면 슬라이드쇼를 다시 시작
window.electronAPI.onSettingsUpdated((settings) => {
    console.log('설정이 업데이트되었습니다. 슬라이드쇼를 다시 시작합니다.');
    startOrRestartSlideshow();
});

// 초기 실행
startOrRestartSlideshow();
