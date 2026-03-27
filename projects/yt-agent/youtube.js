const VERSION = 'v20260327-020';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn, execSync, exec } = require('child_process');

// 윈도우 터미널 한글 깨짐 방지
if (process.platform === 'win32') {
    try { execSync('chcp 65001'); } catch (e) {}
}

const PORT = 8888;
const SNAP_TASK_DIR = 'C:\\SnapTask';
const BIN_DIR = path.join(SNAP_TASK_DIR, 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg.exe');

if (!fs.existsSync(SNAP_TASK_DIR)) fs.mkdirSync(SNAP_TASK_DIR, { recursive: true });
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });


function getDownloadsFolder() {
    const start = Date.now();
    try {
        const cmd = `powershell -command "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'"`;
        const pathStr = execSync(cmd).toString().trim();
        const expandedPath = pathStr.replace(/%([^%]+)%/g, (_, n) => process.env[n] || _);
        console.log(`   [Folder] 다운로드 폴더 확인 완료 (${Date.now() - start}ms): ${expandedPath}`);
        if (fs.existsSync(expandedPath)) return expandedPath;
    } catch (e) {
        console.error('   [!] 다운로드 폴더 조회 실패:', e.message);
    }
    return path.join(process.env.USERPROFILE, 'Downloads');
}

/**
 * 리다이렉트를 지원하는 다운로드 함수
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const request = (currentUrl) => {
            const protocol = currentUrl.startsWith('https') ? https : http;
            protocol.get(currentUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let nextUrl = response.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        const origin = new URL(currentUrl).origin;
                        nextUrl = new URL(nextUrl, origin).href;
                    }
                    request(nextUrl);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                const file = fs.createWriteStream(dest);
                
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const mbDownloaded = (downloadedSize / 1024 / 1024).toFixed(1);

                    if (totalSize && totalSize > 0) {
                        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                        const barSize = 30;
                        const filledSize = Math.round((downloadedSize / totalSize) * barSize);
                        const emptySize = barSize - filledSize;
                        const bar = '█'.repeat(filledSize) + '░'.repeat(emptySize);
                        process.stdout.write(`   [${bar}] ${percent}% (${mbDownloaded}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)\r`);
                    } else {
                        // 전체 크기 정보가 없을 때의 대체 표시
                        process.stdout.write(`   [준비 중...] 다운로드 중: ${mbDownloaded}MB 수신됨\r`);
                    }
                });

                response.pipe(file);
                
                file.on('finish', () => {
                    if (totalSize) process.stdout.write('\n'); // 완료 후 줄바꿈
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

async function checkAndSetupBinaries() {
    process.stdout.write('\x1Bc'); // 터미널 화면 초기화 (깔끔한 시작)
    console.log('\n');
    console.log('=======================================================');
    console.log(`   Snap-Task 로컬 에이전트 [${VERSION}]`);
    console.log('   시스템 점검 중...');
    console.log('-------------------------------------------------------');
    
    // 1. 핵심 엔진 점검 (yt-dlp)
    const isYtdlpValid = fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 1000000;
    if (!isYtdlpValid) {
        console.log('   [!] 핵심 엔진이 없습니다. 자동 설치 중...');
        if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH);
        try {
            await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', YTDLP_PATH);
            console.log('   [OK] 핵심 엔진 설치가 완료되었습니다.');
        } catch (e) {
            console.log('   [오류] 엔진 설치 실패: ' + e.message);
        }
    } else {
        const ytdlpVersion = execSync(`"${YTDLP_PATH}" --version`).toString().trim();
        console.log(`   [OK] 핵심 엔진이 준비되어 있습니다. (${ytdlpVersion})`);
    }

    // 2. 고화질 처리 도구 점검 (FFmpeg)
    const isFfmpegValid = fs.existsSync(FFMPEG_PATH) && fs.statSync(FFMPEG_PATH).size > 10000000;
    if (!isFfmpegValid) {
        console.log('   [!] 고화질 처리 도구가 없습니다. 설치를 시작합니다.');
        console.log('   [안내] 약 90MB의 파일을 다운로드합니다 (최초 1회).');
        console.log('   (서버 상태에 따라 수 분이 소요될 수 있으니 기다려 주세요.)');
        
        if (fs.existsSync(FFMPEG_PATH)) fs.unlinkSync(FFMPEG_PATH);
        
        const zipPath = path.join(BIN_DIR, 'ffmpeg.zip');
        try {
            await downloadFile('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zipPath);
            
            if (fs.statSync(zipPath).size < 10000000) throw new Error('다운로드된 용량이 너무 작습니다.');

            console.log('   [.] 압축 해제 및 파일 구성 중 (잠시만 기다려 주세요)...');
            const unzipCmd = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`;
            execSync(unzipCmd);
            
            const extractedDirs = fs.readdirSync(BIN_DIR).filter(f => f.startsWith('ffmpeg-') && fs.statSync(path.join(BIN_DIR, f)).isDirectory());
            if (extractedDirs.length > 0) {
                const internalExe = path.join(BIN_DIR, extractedDirs[0], 'bin', 'ffmpeg.exe');
                if (fs.existsSync(internalExe)) {
                    fs.renameSync(internalExe, FFMPEG_PATH);
                }
            }
            
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            extractedDirs.forEach(dir => {
                try { execSync(`rmdir /s /q "${path.join(BIN_DIR, dir)}"`); } catch(e) {}
            });

            if (fs.existsSync(FFMPEG_PATH) && fs.statSync(FFMPEG_PATH).size > 10000000) {
                console.log('   [OK] 고화질 처리 도구 설치가 완료되었습니다.');
            } else {
                throw new Error('파일 설치 확인 실패');
            }
        } catch (e) {
            console.log('   [오류] 설치 중 문제 발생: ' + e.message);
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            if (fs.existsSync(FFMPEG_PATH)) fs.unlinkSync(FFMPEG_PATH);
        }
    } else {
        console.log('   [OK] 고화질 처리 도구가 준비되어 있습니다.');
    }
    console.log('-------------------------------------------------------');
}

// --- 자동 종료 로직 ---
let lastRequestTime = Date.now();
const IDLE_TIMEOUT = 60000; // 60초로 연장 (안정성 확보)

function startIdleTimer() {
    setInterval(() => {
        const idleTime = Date.now() - lastRequestTime;
        
        if (idleTime > IDLE_TIMEOUT) {
            console.log('\n   [Idle] 장시간 요청이 없어 자동 종료합니다.');
            process.exit(0);
        } else if (idleTime > IDLE_TIMEOUT - 20000) { // 종료 20초 전부터 안내 시작
            const remaining = Math.ceil((IDLE_TIMEOUT - idleTime) / 1000);
            process.stdout.write(`\r   ⚠️  웹브라우저가 종료되었습니다. ${remaining}초 후 에이전트가 종료됩니다...    `);
        } else {
            // 활성 상태일 때는 안내 지우기
            process.stdout.write('\r' + ' '.repeat(70) + '\r');
        }
    }, 1000);
}

function isBrowserRunning(browserName) {
    if (!browserName || browserName === 'none') return false;
    try {
        const processMap = {
            'chrome': 'chrome.exe',
            'whale': 'whale.exe',
            'edge': 'msedge.exe',
            'brave': 'brave.exe',
            'firefox': 'firefox.exe'
        };
        const proc = processMap[browserName.toLowerCase()];
        if (!proc) return false;
        const output = execSync(`tasklist /FI "IMAGENAME eq ${proc}" /NH`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        return output.includes(proc);
    } catch (e) {
        return false;
    }
}

const server = http.createServer(async (req, res) => {
    const now = new Date().toLocaleTimeString();
    if (!req.url.startsWith('/status')) {
        console.log(`\n[${now}] 수신된 요청: ${req.method} ${req.url}`);
    }
    
    lastRequestTime = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID, Cache-Control');
    res.setHeader('Access-Control-Max-Age', '86400'); // 사전 검사 결과 24시간 캐시

    if (req.method === 'OPTIONS') {
        res.writeHead(200); // 204보다 200이 더 확실한 경우가 있음
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/status') {
        const status = {
            ytdlp: fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 1000000,
            ffmpeg: fs.existsSync(FFMPEG_PATH) && fs.statSync(FFMPEG_PATH).size > 10000000,
            platform: process.platform
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    }
    else if (pathname === '/setup') {
        console.log('\n   [요청] 시스템 구성 요소 수동 점검/');
        checkAndSetupBinaries().then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        }).catch(err => {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        });
    }
    else if (pathname === '/info') {
        const videoUrl = parsedUrl.searchParams.get('url');
        const browser = parsedUrl.searchParams.get('browser'); // 추가

        if (!videoUrl) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'URL이 필요합니다.' }));
        }

        // Removed activeProcesses check for /info, as per instruction to remove the variable.

        const args = ['--dump-json', '--no-playlist', videoUrl];
        
        // 성인 인증 쿠키 옵션 추가
        if (browser && browser !== 'none') {
            const isRunning = isBrowserRunning(browser);
            if (isRunning) {
                console.log(`\n   [⚠️ 경고] ${browser} 브라우저가 실행 중입니다.`);
                console.log('   [!] 브라우저가 켜져 있으면 쿠키 파일이 잠겨 있어 접근에 실패할 확률이 높습니다.');
                console.log('   [팁] 가급적 해당 브라우저의 모든 창을 닫고 다시 시도해 주세요.');
            } else {
                console.log(`\n   [안내] 🔞 연령 제한 해제를 위해 ${browser} 브라우저 쿠키를 참조합니다.`);
            }
            args.push('--cookies-from-browser', browser);
        }

        console.log(`   [실행] ${YTDLP_PATH} ${args.join(' ')}`);

        let ytdlp;
        try {
            ytdlp = spawn(YTDLP_PATH, args);
        } catch (err) {
            console.error(`   [오류] 프로세스 실행 실패: ${err.message}`);
            res.writeHead(500);
            return res.end(JSON.stringify({ error: '실행 실패: ' + err.message }));
        }

        let output = '';
        let errorOutput = '';
        ytdlp.stdout.on('data', (data) => { output += data.toString(); });
        ytdlp.stderr.on('data', (data) => { 
            const msg = data.toString();
            errorOutput += msg;
            process.stdout.write(msg); // 터미널에 실시간 에러 출력
        });

        ytdlp.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(output);
                    const formats = info.formats || [];
                    const resolutions = [...new Set(formats
                        .filter(f => f.height && f.vcodec !== 'none')
                        .map(f => f.height))]
                        .sort((a, b) => b - a);

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        title: info.title,
                        thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : ''),
                        resolutions: resolutions
                    }));
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: '데이터 파싱 실패: ' + e.message }));
                }
            } else {
                console.log(`\n   [실패] 프로세스 종료 코드: ${code}`);
                res.writeHead(500);
                
                let errorMsg = '분석 엔진 오류';
                let details = errorOutput.split('\n').filter(l => l.includes('ERROR:')).join('\n') || errorOutput;

                // 연령 제한 에러 감지
                if (details.includes('confirm your age') || details.includes('age-restricted')) {
                    errorMsg = '[ERROR_AGE_RESTRICTED]';
                }
                // 쿠키 잠금 에러 감지 (브라우저가 열려 있을 때)
                else if (details.includes('Could not copy') && details.includes('cookie database')) {
                    errorMsg = '[ERROR_COOKIE_LOCKED]';
                    console.log('\n   [!] 브라우저가 열려 있어 쿠키를 읽을 수 없습니다.');
                    console.log('   [팁] 크롬/웨일의 모든 창을 닫고, 작업 관리자에서 해당 프로세스를 종료 후 다시 시도해 주세요.');
                }

                res.end(JSON.stringify({ 
                    error: errorMsg, 
                    details: details 
                }));
            }
        });
    }
    else if (pathname === '/download') {
        const url = parsedUrl.searchParams.get('url');
        const format = parsedUrl.searchParams.get('format') || 'mp4';
        const quality = parsedUrl.searchParams.get('quality') || '1080';
        const browser = parsedUrl.searchParams.get('browser');

        console.log(`\n   [다운로드 요청] URL: ${url}`);
        console.log(`   [옵션] 형식: ${format}, 화질: ${quality}, 쿠키: ${browser}`);

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Nginx 등에서 버퍼링 방지
        });

        // 즉시 첫 번째 데이터를 보내 연결이 수립됨을 알림
        res.write('data: [SSE_INIT] 연결이 수립되었습니다.\n\n');

        // 연결 유지(Ping) 타이머 추가 (15초 주기)
        const pingInterval = setInterval(() => {
            if (!res.writableEnded) {
                res.write('data: [PING] ' + Date.now() + '\n\n');
            }
        }, 15000);

        const downloadsPath = getDownloadsFolder();
        let args = [
            '--newline', '--progress',
            '--ffmpeg-location', BIN_DIR,
            '-o', path.join(downloadsPath, '%(title)s.%(ext)s'),
        ];

        // 성인 인증 쿠키 옵션 추가
        if (browser && browser !== 'none') {
            const isRunning = isBrowserRunning(browser);
            if (isRunning) {
                console.log(`\n   [⚠️ 경고] ${browser} 브라우저가 실행 중입니다 (잠금 가능성 높음).`);
            } else {
                console.log(`\n   [안내] 🔞 연령 제한 해제를 위해 ${browser} 브라우저 쿠키를 참조합니다.`);
            }
            args.push('--cookies-from-browser', browser);
        }
        
        if (format === 'mp3') {
            args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3');
        } else {
            args.push('-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`);
            args.push('--merge-output-format', 'mp4');
        }
        args.push(url);

        console.log(`   [준비] 저장 경로: ${downloadsPath}`);
        console.log(`   [실행] ${YTDLP_PATH} ${args.join(' ')}`);

        try {
            const ytdlp = spawn(YTDLP_PATH, args);
            ytdlp.stdout.on('data', (data) => { res.write(`data: ${data.toString()}\n\n`); });
            ytdlp.stderr.on('data', (data) => { 
                const msg = data.toString();
                // 연령 제한 에러 감지
                if (msg.includes('confirm your age') || msg.includes('age-restricted')) {
                    res.write(`data: [ERROR_AGE_RESTRICTED] ${msg}\n\n`);
                } 
                // 쿠키 잠금 에러 감지
                else if (msg.includes('Could not copy') && msg.includes('cookie database')) {
                    res.write(`data: [ERROR_COOKIE_LOCKED] ${msg}\n\n`);
                    console.log('\n   [!] 브라우저가 열려 있어 쿠키를 읽을 수 없습니다.');
                    console.log('   [팁] 크롬/웨일의 모든 창을 닫고, 작업 관리자에서 해당 프로세스를 종료 후 다시 시도해 주세요.');
                }
                else {
                    res.write(`data: [LOG] ${msg}\n\n`); 
                }
            });
            ytdlp.on('close', (code) => {
                clearInterval(pingInterval); // 타이머 제거
                if (code !== 0) {
                    res.write(`data: [ERROR] 다운로드 프로세스가 오류와 함께 종료되었습니다. (코드 ${code})\n\n`);
                } else {
                    res.write(`data: [DONE] Exit code ${code}\n\n`);
                }
                res.end();
            });

            // 클라이언트 연결 종료 감지 (창 닫기, 새로고침 등)
            req.on('close', () => {
                clearInterval(pingInterval);
                if (ytdlp && !ytdlp.killed) {
                    console.log(`\n   [정리] 클라이언트 연결 끊김으로 프로세스 종료 (PID: ${ytdlp.pid})`);
                    ytdlp.kill();
                }
            });
        } catch (err) {
            if (typeof pingInterval !== 'undefined') clearInterval(pingInterval);
            console.error('   [다운로드 실패]', err.message);
            res.write(`data: [ERROR] ${err.message}\n\n`);
            res.end();
        }
    }
    else if (pathname === '/check-browser') {
        const browser = parsedUrl.searchParams.get('browser');
        const isRunning = isBrowserRunning(browser);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running: isRunning }));
    }
    else if (pathname === '/reopen-browser') {
        const browser = parsedUrl.searchParams.get('browser');
        const url = parsedUrl.searchParams.get('url');
        
        const processMap = {
            'chrome': 'chrome',
            'whale': 'whale',
            'edge': 'msedge',
            'brave': 'brave',
            'firefox': 'firefox'
        };
        const cmd = processMap[browser?.toLowerCase()] || 'start';
        
        console.log(`\n   [재실행] ${browser} 브라우저로 다시 엽니다.`);
        exec(`start ${cmd} "${url}"`);
        
        res.writeHead(200);
        res.end('ok');
    }
    else if (pathname === '/open-folder') {
        exec(`explorer "${getDownloadsFolder()}"`);
        res.writeHead(200);
        res.end('ok');
    }
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

checkAndSetupBinaries().then(() => {
    server.listen(PORT, () => {
        console.log(`   Snap-Task 로컬 에이전트 [${VERSION}] 실행 중...`);
        console.log(`   접속 주소: http://localhost:${PORT}`);
        console.log('-------------------------------------------------------');
        console.log('   유튜브 다운로드가 완료되면 이 창을 닫으셔도 됩니다.');
        
        startIdleTimer(); // 서버가 정상적으로 열린 뒤에 타이머 시작!
    });
});

process.on('uncaughtException', (err) => {
    const now = new Date().toLocaleTimeString();
    console.error(`\n[${now}] [치명적 오류 발생]`, err.stack || err.message);
});
