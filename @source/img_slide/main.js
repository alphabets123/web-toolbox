const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Node.js 파일 시스템 모듈 사용

// GPU 하드웨어 가속 비활성화 (GPU 프로세스 충돌 오류 해결)
app.disableHardwareAcceleration();

// --- 설정 관리 (electron-store 사용) ---
const Store = require('electron-store');
const store = new Store({
  // 설정 파일의 기본값
  defaults: {
    imageFolders: [],
    displayMethod: 'contain', // 'contain', 'cover-width', 'cover-height'
    panVertical: false,
    panHorizontal: false,
    startFullscreen: true, // 시작 시 전체 화면 옵션
    slideInterval: 10, // 초 단위,
    transitionEffect: 'fade' // 'none', 'fade', 'slideUp', 'zoomIn', 'slideLeft', 'zoomOut'
  }
});
let appSettings = store.get(); // store.data 대신 store.get()으로 변경

let mainWindow;
let settingsWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    // ⭐️ 설정값에 따라 전체 화면 여부 결정
    fullscreen: store.get('startFullscreen', true),
    icon: path.join(__dirname, 'icon.png'), // ⭐️ 창 아이콘 경로 수정
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  mainWindow.setMenuBarVisibility(false); // ⭐️ 메인 창의 메뉴바를 숨깁니다.
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'src/settings/settings.html'));
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * 지정된 디렉토리와 모든 하위 디렉토리에서 이미지 파일을 재귀적으로 찾습니다.
 * @param {string} dir - 검색을 시작할 디렉토리 경로
 * @returns {Promise<string[]>} - 찾은 모든 이미지 파일의 전체 경로 배열
 */
async function findImageFilesRecursively(dir) {
    let imageFiles = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // 하위 폴더인 경우, 재귀적으로 함수 호출
                imageFiles = imageFiles.concat(await findImageFilesRecursively(fullPath));
            } else if (entry.isFile()) {
                // 파일인 경우, 이미지 확장자 검사
                const lowercased = entry.name.toLowerCase();
                if (lowercased.endsWith('.jpg') || lowercased.endsWith('.jpeg') || lowercased.endsWith('.png') || lowercased.endsWith('.gif') || lowercased.endsWith('.bmp')) {
                    imageFiles.push(fullPath);
                }
            }
        }
    } catch (error) {
        console.error(`디렉토리 읽기 오류 ${dir}:`, error.message);
    }
    return imageFiles;
}

// --- IPC 핸들러 ---

// (슬라이드쇼 창) 이미지 목록과 현재 설정을 요청
ipcMain.handle('get-slideshow-data', async () => {
  try {
    // ⭐️ 핸들러가 호출될 때마다 최신 설정을 다시 읽어옵니다.
    appSettings = store.get();
    let allImageFiles = [];
    for (const folder of appSettings.imageFolders) {
        const filesInFolder = await findImageFilesRecursively(folder);
        allImageFiles = allImageFiles.concat(filesInFolder);
    }
    const imageUrls = allImageFiles.map(file => `file://${file.replace(/\\/g, '/')}`);
    return { imageUrls, settings: appSettings };
  } catch (error) {
    console.error('로컬 이미지 폴더를 읽는 중 오류 발생:', error.message);
    return { imageUrls: [], settings: appSettings, error: error.message }; // ⭐️ appSettings를 항상 반환하도록 수정
  }
});

// (슬라이드쇼 창) 설정 창 열기 요청
ipcMain.on('open-settings-window', createSettingsWindow);

// (슬라이d쇼 창) 앱 종료 요청
ipcMain.on('app-quit', () => {
    app.quit();
});

// (슬라이드쇼 창) 전체 화면 상태 변경 요청
ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) {
        const isFullScreen = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFullScreen);
    }
});

// (설정 창) 현재 설정 값 요청
ipcMain.handle('get-settings', () => {
    // ⭐️ 설정 창을 열 때도 최신 설정을 다시 읽어서 전달합니다.
    return store.get();
});

// (설정 창) 새 설정 값 저장 요청
ipcMain.on('save-settings', (event, newSettings) => {
    appSettings = newSettings;
    // ⭐️ 설정 객체를 통째로 저장하여 각 속성이 최상위 레벨에 기록되도록 합니다.
    store.set(appSettings);
    // 메인 윈도우에 설정이 변경되었음을 알림
    if (mainWindow) {
        mainWindow.webContents.send('settings-updated', appSettings);
    }
    if (settingsWindow) {
        settingsWindow.close();
    }
});

// (설정 창) 폴더 선택 다이얼로그 열기 요청
ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.filePaths;
});

// (슬라이드쇼 창) 파일이 있는 폴더 열기 요청
ipcMain.on('show-item-in-folder', (event, fullPath) => {
    shell.showItemInFolder(fullPath);
});
