const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');

const PROTOCOL = 'snaptask';
const AGENT_NAME = 'yt-agent.exe';
const SNAP_TASK_DIR = 'C:\\SnapTask';
const AGENT_PATH = path.join(SNAP_TASK_DIR, AGENT_NAME);
const AGENT_DOWNLOAD_URL = 'https://github.com/alphabets123/web-toolbox/releases/latest/download/yt-agent.exe';

/**
 * 윈도우 레지스트리에 커스텀 프로토콜 등록
 */
function registerProtocol() {
    try {
        const exePath = process.execPath;
        console.log(`[INFO] 프로토콜 등록 중: ${PROTOCOL}:// -> ${exePath}`);

        // 레지스트리 명령어 (reg.exe 사용)
        const commands = [
            `reg add "HKEY_CLASSES_ROOT\\${PROTOCOL}" /ve /t REG_SZ /d "URL:SnapTask Protocol" /f`,
            `reg add "HKEY_CLASSES_ROOT\\${PROTOCOL}" /v "URL Protocol" /t REG_SZ /d "" /f`,
            `reg add "HKEY_CLASSES_ROOT\\${PROTOCOL}\\shell\\open\\command" /ve /t REG_SZ /d "\\"${exePath}\\" \\"%1\\"" /f`
        ];

        commands.forEach(cmd => execSync(cmd));
        console.log('[OK] 프로토콜 등록 완료');
    } catch (err) {
        console.error('[Error] 레지스트리 등록 실패 (관리자 권한 필요):', err.message);
    }
}

/**
 * 파일 다운로드
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const request = (currentUrl) => {
            https.get(currentUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    request(response.headers.location);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`다운로드 실패: ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(dest);
                response.pipe(file);
                file.on('finish', () => {
                    file.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }).on('error', (err) => {
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                reject(err);
            });
        };
        request(url);
    });
}

/**
 * 메인 로직
 */
async function main() {
    console.log('==========================================');
    console.log('   Snap-Task Starter (Launcher)');
    console.log('==========================================\n');

    // 1. 프로토콜 등록 (항상 실행 시도하여 경로 갱신)
    registerProtocol();

    // 2. 관리 폴더 확인
    if (!fs.existsSync(SNAP_TASK_DIR)) {
        console.log(`[INFO] 폴더 생성 중: ${SNAP_TASK_DIR}`);
        fs.mkdirSync(SNAP_TASK_DIR, { recursive: true });
    }

    // 3. 에이전트 존재 여부 확인 및 다운로드
    if (!fs.existsSync(AGENT_PATH)) {
        console.log('[!] 에이전트 파일이 없습니다. 최신 버전을 다운로드합니다...');
        try {
            await downloadFile(AGENT_DOWNLOAD_URL, AGENT_PATH);
            console.log('[OK] 에이전트 다운로드 완료');
        } catch (err) {
            console.error('[Error] 다운로드 중 오류 발생:', err.message);
            console.log('잠시 후 종료됩니다...');
            setTimeout(() => process.exit(1), 3000);
            return;
        }
    } else {
        console.log('[OK] 에이    전트가 이미 존재합니다.');
    }

    // 4. 에이전트 실행
    console.log('[INFO] Snap-Task 에이전트를 실행합니다...');
    try {
        // 이미 실행 중인지 확인하는 로직은 생략 (yt-agent가 포트 점유로 처리할 것)
        const agent = spawn(AGENT_PATH, [], {
            detached: true,
            stdio: 'ignore',
            cwd: SNAP_TASK_DIR
        });
        agent.unref();
        console.log('[OK] 에이전트가 백그라운드에서 시작되었습니다.');
    } catch (err) {
        console.error('[Error] 실행 실패:', err.message);
    }

    console.log('\n잠시 후 이 창은 자동으로 닫힙니다.');
    setTimeout(() => process.exit(0), 2000);
}

main();
