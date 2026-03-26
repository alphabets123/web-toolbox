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

let isDownloading = false;
let activeProcesses = new Map();

function getDownloadsFolder() {
    try {
        const cmd = `powershell -command "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'"`;
        const pathStr = execSync(cmd).toString().trim();
        const expandedPath = pathStr.replace(/%([^%]+)%/g, (_, n) => process.env[n] || _);
        if (fs.existsSync(expandedPath)) return expandedPath;
    } catch (e) {
        console.error('Download folder lookup failed:', e.message);
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
    console.log('\n\n\n'); // 약간의 여백
    console.log('=======================================================');
    console.log('   Snap-Task 로컬 에이전트 - 시스템 점검 중...');
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
        console.log('   [OK] 핵심 엔진이 준비되어 있습니다.');
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
const IDLE_TIMEOUT = 60000; // 1분 (설치 완료 후부터 적용)

function startIdleTimer() {
    setInterval(() => {
        if (Date.now() - lastRequestTime > IDLE_TIMEOUT) {
            console.log('   [Idle] 장시간 요청이 없어 자동 종료합니다.');
            process.exit(0);
        }
    }, 30000);
}

const server = http.createServer(async (req, res) => {
    lastRequestTime = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
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
    else if (pathname === '/info') {
        const videoUrl = parsedUrl.searchParams.get('url');
        if (!videoUrl) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'URL이 필요합니다.' }));
        }

        const processId = 'info_' + videoUrl;
        if (activeProcesses.has(processId)) {
            res.writeHead(429);
            return res.end(JSON.stringify({ error: '이미 분석 중인 영상입니다.' }));
        }

        const args = ['--dump-json', '--no-playlist', videoUrl];
        let ytdlp;
        try {
            activeProcesses.set(processId, true);
            ytdlp = spawn(YTDLP_PATH, args);
        } catch (err) {
            activeProcesses.delete(processId);
            res.writeHead(500);
            return res.end(JSON.stringify({ error: '실행 실패: ' + err.message }));
        }

        let output = '';
        ytdlp.stdout.on('data', (data) => { output += data.toString(); });
        ytdlp.on('close', (code) => {
            activeProcesses.delete(processId);
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
                    res.end(JSON.stringify({ error: '데이터 파싱 실패' }));
                }
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({ error: '정보를 가져오지 못했습니다.' }));
            }
        });
    }
    else if (pathname === '/download') {
        const videoUrl = parsedUrl.searchParams.get('url');
        const format = parsedUrl.searchParams.get('format') || 'mp4';
        const quality = parsedUrl.searchParams.get('quality') || '1080';
        const browser = parsedUrl.searchParams.get('browser'); // 'chrome', 'edge' 등

        res.writeHead(200, { 'Content-Type': 'text/event-stream' });

        const downloadsPath = getDownloadsFolder();
        let args = [
            '--newline', '--progress',
            '--ffmpeg-location', BIN_DIR,
            '-o', path.join(downloadsPath, '%(title)s.%(ext)s'),
        ];

        // 성인 인증 쿠키 옵션 추가
        if (browser && browser !== 'none') {
            args.push('--cookies-from-browser', browser);
        }

        if (format === 'mp3') {
            args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3');
        } else {
            args.push('-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`);
            args.push('--merge-output-format', 'mp4');
        }
        args.push(videoUrl);

        try {
            const ytdlp = spawn(YTDLP_PATH, args);
            ytdlp.stdout.on('data', (data) => { res.write(`data: ${data.toString()}\n\n`); });
            ytdlp.stderr.on('data', (data) => { 
                const msg = data.toString();
                // 연령 제한 에러 감지
                if (msg.includes('confirm your age') || msg.includes('age-restricted')) {
                    res.write(`data: [ERROR_AGE_RESTRICTED] ${msg}\n\n`);
                } else {
                    res.write(`data: [LOG] ${msg}\n\n`); 
                }
            });
            ytdlp.on('close', (code) => {
                res.write(`data: [DONE] Exit code ${code}\n\n`);
                res.end();
            });
        } catch (err) {
            res.write(`data: [ERROR] ${err.message}\n\n`);
            res.end();
        }
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
        console.log('   Snap-Task 로컬 에이전트 실행 중...');
        console.log(`   접속 주소: http://localhost:${PORT}`);
        console.log('-------------------------------------------------------');
        console.log('   유튜브 다운로드가 완료되면 이 창을 닫으셔도 됩니다.');
        
        startIdleTimer(); // 서버가 정상적으로 열린 뒤에 타이머 시작!
    });
});

process.on('uncaughtException', (err) => {
    console.error('[오류 발생]', err.message);
});
