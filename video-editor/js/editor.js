/* editor.js */
document.addEventListener('DOMContentLoaded', () => {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    });
    
    const ffmpegStatus = document.getElementById('ffmpeg-status');
    const videoUpload = document.getElementById('video-upload');

    const mediaLibrary = document.getElementById('media-library');
    const player = document.getElementById('video-player');
    const fallbackPlayer = document.getElementById('fallback-player');
    const fallbackFormat = document.getElementById('fallback-format');
    
    const startInputs = { hh: document.getElementById('start-h'), mm: document.getElementById('start-m'), ss: document.getElementById('start-s') };
    const endInputs = { hh: document.getElementById('end-h'), mm: document.getElementById('end-m'), ss: document.getElementById('end-s') };
    const btnSetStart = document.getElementById('btn-set-start');
    const btnSetEnd = document.getElementById('btn-set-end');
    const btnAddSegment = document.getElementById('btn-add-segment');
    const timelineList = document.getElementById('timeline-list');
    const clipDurationText = document.getElementById('clip-duration');
    const btnExport = document.getElementById('btn-export');
    const btnTroubleshoot = document.getElementById('btn-troubleshoot');

    const modal = document.getElementById('render-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalProgress = document.getElementById('modal-progress');
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const videoPlaceholder = document.getElementById('video-placeholder');
    const customControls = document.getElementById('custom-controls');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const seekBar = document.getElementById('seek-bar');
    const currentTimeText = document.getElementById('current-time');
    const totalTimeText = document.getElementById('total-time');
    const toastContainer = document.getElementById('toast-container');
    const dropZone = document.getElementById('drop-zone');
    const btnClose = document.getElementById('btn-close-modal');
    const btnDownload = document.getElementById('btn-download-app');
    const timeFeedback = document.getElementById('time-feedback');

    const btnSaveRecords = document.getElementById('btn-save-records');
    const recordsUpload = document.getElementById('records-upload');
    const dropZoneRecords = document.getElementById('drop-zone-records');

    const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024;
    const MAX_CLIPS = 23;
    let importedSources = []; 
    let timelineSegments = []; 
    let currentSourceId = null;
    let editingSegmentId = null;

    // --- Toast & Shake ---
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function shakeInput(groupId) {
        const group = document.getElementById(groupId).closest('.time-group');
        if (group) {
            group.classList.add('shake');
            setTimeout(() => group.classList.remove('shake'), 500);
        }
    }

    // --- Core Initialization ---
    const loadFFmpeg = async () => {
        const timeout = setTimeout(() => {
            if (!ffmpeg.loaded) {
                ffmpegStatus.textContent = "Loading Timeout (Check Connection)";
                ffmpegStatus.style.color = "#f59e0b";
                showToast("FFmpeg 로딩이 지연되고 있습니다. 인터넷 연결을 확인하세요.");
            }
        }, 15000);

        try {
            // Check for Cross-Origin Isolation
            if (!window.crossOriginIsolated) {
                console.warn("Cross-Origin Isolation is NOT enabled. FFmpeg.wasm may fail.");
                ffmpegStatus.textContent = "Security Block (COOP/COEP)";
                ffmpegStatus.style.color = "#ef4444";
                return;
            }

            const localPath = window.location.origin + '/lib/ffmpeg';
            const cdnPath = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd';
            
            // v0.11.0 Fail-safe CDN Loading
            // Using official matching corePath from factory.
            await ffmpeg.load();

            clearTimeout(timeout);
            ffmpeg.loaded = true;
            ffmpegStatus.textContent = "FFmpeg Ready";
            ffmpegStatus.style.color = "#4caf50";
            btnTroubleshoot.style.display = 'none'; // Hide if previously shown
            console.log("FFmpeg loaded successfully with worker fallback.");
        } catch (err) {
            clearTimeout(timeout);
            console.error("FFmpeg load failed:", err);
            ffmpegStatus.textContent = "FFmpeg Error";
            ffmpegStatus.style.color = "#ef4444";
            btnTroubleshoot.style.display = 'inline'; // Show troubleshoot link
        }
    };

    // Diagnostic Alert
    btnTroubleshoot.addEventListener('click', (e) => {
        e.preventDefault();
        const info = [
            "--- System Diagnostic ---",
            `Cross-Origin Isolated: ${window.crossOriginIsolated ? 'YES (Success)' : 'NO (Required)'}`,
            `FFmpeg.js Loaded: ${typeof FFmpegWASM !== 'undefined' ? 'YES' : 'NO'}`,
            `Util.js Loaded: ${typeof FFmpegUtil !== 'undefined' ? 'YES' : 'NO'}`,
            `SharedArrayBuffer: ${typeof SharedArrayBuffer !== 'undefined' ? 'Enabled' : 'Disabled'}`,
            "-------------------------",
            "Tip: If 'NO' to isolated, check COOP/COEP headers in serve.js.",
            "Tip: If Error persists, ensure internet is on for Worker fallback."
        ].join('\n');
        alert(info);
    });

    loadFFmpeg();

    // --- Custom Controls Logic ---
    player.addEventListener('loadedmetadata', () => {
        seekBar.max = player.duration;
        totalTimeText.textContent = player.duration >= 3600 ? formatTime(player.duration) : formatTime(player.duration).substring(3);
    });

    player.addEventListener('timeupdate', () => {
        seekBar.value = player.currentTime;
        currentTimeText.textContent = player.duration >= 3600 ? formatTime(player.currentTime) : formatTime(player.currentTime).substring(3);
    });

    btnPlayPause.addEventListener('click', () => {
        if (player.paused) {
            player.play();
            btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            player.pause();
            btnPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        }
    });

    seekBar.addEventListener('input', () => {
        player.currentTime = seekBar.value;
    });

    player.addEventListener('click', () => {
        btnPlayPause.click();
    });

    // --- Helpers ---
    function formatTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function calculateClipDuration() {
        const start = (parseInt(startInputs.hh.value) || 0) * 3600 + (parseInt(startInputs.mm.value) || 0) * 60 + (parseInt(startInputs.ss.value) || 0);
        const end = (parseInt(endInputs.hh.value) || 0) * 3600 + (parseInt(endInputs.mm.value) || 0) * 60 + (parseInt(endInputs.ss.value) || 0);
        clipDurationText.textContent = Math.max(0, end - start).toFixed(1);
        
        if (end <= start && (parseInt(endInputs.ss.value) || 0) > 0) {
            shakeInput('end-s');
        }
    }

    function updateExportState() {
        btnExport.disabled = timelineSegments.length === 0 || !importedSources.length;
        document.getElementById('segment-count').textContent = timelineSegments.length;
        btnAddSegment.disabled = timelineSegments.length >= MAX_CLIPS && !editingSegmentId;
    }

    // --- Media Library ---
    function handleFiles(files) {
        const file = files[0];
        if (file.size > MAX_FILE_SIZE) { showDownloadPrompt(file.name); return; }
        
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            importedSources = [{
                id: 'src_' + Date.now(),
                file: file, url: url, name: file.name,
                duration: video.duration || 0
            }];
            currentSourceId = importedSources[0].id;
            timelineSegments = [];
            renderMediaList();
            loadSourceIntoPreview(importedSources[0]);
        };
        video.src = url;
    }

    function renderMediaList() {
        mediaLibrary.style.display = 'block';
        if (importedSources.length === 0) {
            mediaLibrary.innerHTML = '';
            return;
        }
        const src = importedSources[0];
        mediaLibrary.innerHTML = `
            <div class="media-item selected" style="width: 100%; max-width: none; border: 2px solid var(--primary-color); background: #f0f7ff; display: flex; align-items: center; justify-content: space-between; padding: 0.1rem 0.4rem; margin-bottom: 0;">
                <div style="flex: 1; overflow: hidden;">
                   <div style="font-weight: 700; color: var(--primary-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${src.name}</div>
                   <div style="font-size: 0.65rem; color: var(--text-muted);">총 길이: ${formatTime(src.duration)} | ${(src.file.size/(1024*1024)).toFixed(1)}MB</div>
                </div>
                <button id="btn-clear" class="btn-action danger" style="font-size: 0.65rem; padding: 0.1rem 0.3rem; white-space: nowrap; margin-left: 8px;">초기화 🧹</button>
            </div>
        `;
        
        document.getElementById('btn-clear').onclick = (e) => {
            e.stopPropagation();
            if (timelineSegments.length > 0) {
                if (confirm("현재 작업 중인 내용이 모두 사라집니다. 초기화하시겠습니까?")) {
                    location.reload();
                }
            } else {
                location.reload();
            }
        };
    }

    function loadSourceIntoPreview(src) {
        player.style.display = 'none';
        fallbackPlayer.style.display = 'none';
        videoPlaceholder.style.display = 'none';
        customControls.style.display = 'none';
        player.src = "";

        const ext = src.name.split('.').pop().toLowerCase();
        const isNative = ['mp4', 'webm', 'mov', 'm4v'].includes(ext);

        if (isNative) {
            player.style.display = 'block';
            customControls.style.display = 'flex';
            player.src = src.url;
            dropZone.style.display = 'none'; // Hide drop zone once video is loaded
        } else {
            fallbackPlayer.style.display = 'flex';
            fallbackFormat.textContent = ext.toUpperCase();
            dropZone.style.display = 'none';
        }

        const isShort = src.duration < 3600;
        [startInputs.hh, endInputs.hh].forEach(el => {
            el.disabled = isShort;
            if (isShort) el.value = "00";
        });
        
        startInputs.mm.value = "00"; startInputs.ss.value = "00";
        const d = src.duration;
        endInputs.hh.value = Math.floor(d/3600).toString().padStart(2, '0');
        endInputs.mm.value = Math.floor((d%3600)/60).toString().padStart(2, '0');
        endInputs.ss.value = Math.floor(d%60).toString().padStart(2, '0');
        calculateClipDuration();
    }

    // --- Timeline Rendering ---
    function renderTimeline() {
        timelineList.innerHTML = '';
        if (timelineSegments.length === 0) {
            timelineList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 0.5rem; font-size: 0.8rem;">구간을 설정하고 \'구간 추가\' 버튼을 눌러주세요.</div>';
            return;
        }

        const src = importedSources[0];
        const isShort = (src?.duration || 0) < 3600;

        timelineSegments.forEach((seg, index) => {
            const div = document.createElement('div');
            div.className = 'segment-item';
            div.style.marginBottom = "0.15rem";
            
            const sH = Math.floor(seg.startTime / 3600).toString().padStart(2, '0');
            const sM = Math.floor((seg.startTime % 3600) / 60).toString().padStart(2, '0');
            const sS = Math.floor(seg.startTime % 60).toString().padStart(2, '0');
            
            const eH = Math.floor(seg.endTime / 3600).toString().padStart(2, '0');
            const eM = Math.floor((seg.endTime % 3600) / 60).toString().padStart(2, '0');
            const eS = Math.floor(seg.endTime % 60).toString().padStart(2, '0');

            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.6rem; width: 100%;">
                    <div style="font-weight: 800; color: var(--text-muted); min-width: 50px; font-size: 0.8rem;">클립 ${index + 1}</div>
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">시작</span>
                        <div class="time-group">
                            <input type="number" data-id="${seg.id}" data-type="start" data-unit="h" value="${sH}" ${isShort?'disabled':''}>:
                            <input type="number" data-id="${seg.id}" data-type="start" data-unit="m" value="${sM}">:
                            <input type="number" data-id="${seg.id}" data-type="start" data-unit="s" value="${sS}">
                        </div>
                        <span style="color: #cbd5e1; margin: 0 0.2rem;">~</span>
                        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">종료</span>
                        <div class="time-group">
                            <input type="number" data-id="${seg.id}" data-type="end" data-unit="h" value="${eH}" ${isShort?'disabled':''}>:
                            <input type="number" data-id="${seg.id}" data-type="end" data-unit="m" value="${eM}">:
                            <input type="number" data-id="${seg.id}" data-type="end" data-unit="s" value="${eS}">
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--primary-color); font-weight: 700; min-width: 60px; text-align: right;">
                        (${(seg.endTime-seg.startTime).toFixed(1)}s)
                    </div>
                    <div style="margin-left: auto; display: flex; gap: 0.3rem;">
                        <button id="btn-save-${seg.id}" onclick="saveInPlace('${seg.id}')" class="btn-icon" style="color: #10b981; padding: 2px;" title="저장"><i class="fas fa-check-circle"></i></button>
                        <button onclick="removeSegment('${seg.id}')" class="btn-icon" style="color: #ef4444; padding: 2px;" title="삭제"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            timelineList.appendChild(div);
        });

        // Add auto-tabbing and formatting for timeline inputs
        timelineList.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val.length > 2) e.target.value = val.slice(0, 2);
                
                e.target.classList.add('modified');
                const saveBtn = document.getElementById(`btn-save-${e.target.dataset.id}`);
                if (saveBtn) saveBtn.classList.add('modified-btn');
                
                if (e.target.value.length >= 2) {
                    let next = e.target.nextElementSibling;
                    if (next && next.tagName === 'INPUT') next.focus();
                }
            });
            input.addEventListener('blur', (e) => {
                const val = (parseInt(e.target.value) || 0).toString().padStart(2, '0');
                e.target.value = val;
            });
        });
    }

    // --- Timeline Actions ---
    btnAddSegment.addEventListener('click', () => {
        if (!currentSourceId) return;
        const start = (parseInt(startInputs.hh.value) || 0) * 3600 + (parseInt(startInputs.mm.value) || 0) * 60 + (parseInt(startInputs.ss.value) || 0);
        const end = (parseInt(endInputs.hh.value) || 0) * 3600 + (parseInt(endInputs.mm.value) || 0) * 60 + (parseInt(endInputs.ss.value) || 0);
        
        if (end <= start) { 
            showToast("종료 시점은 시작 시점보다 빨라야 합니다.");
            shakeInput('end-h'); shakeInput('end-m'); shakeInput('end-s');
            return; 
        }

        timelineSegments.push({ id: 'seg_' + Date.now(), sourceId: currentSourceId, startTime: start, endTime: end });
        renderTimeline();
        updateExportState();
        
        // Reset to initial end time if possible
        const src = importedSources[0];
        if (src) {
            startInputs.mm.value = "00"; startInputs.ss.value = "00";
            const d = src.duration;
            endInputs.hh.value = Math.floor(d/3600).toString().padStart(2, '0');
            endInputs.mm.value = Math.floor((d%3600)/60).toString().padStart(2, '0');
            endInputs.ss.value = Math.floor(d%60).toString().padStart(2, '0');
        }
    });

    window.saveInPlace = (id) => {
        const seg = timelineSegments.find(s => s.id === id);
        if (!seg) return;
        const inputs = timelineList.querySelectorAll(`input[data-id="${id}"]`);
        let sh=0, sm=0, ss=0, eh=0, em=0, es=0;
        inputs.forEach(i => {
            const v = parseInt(i.value) || 0;
            if (i.dataset.type === 'start') { if (i.dataset.unit==='h') sh=v; if (i.dataset.unit==='m') sm=v; if (i.dataset.unit==='s') ss=v; }
            else { if (i.dataset.unit==='h') eh=v; if (i.dataset.unit==='m') em=v; if (i.dataset.unit==='s') es=v; }
        });
        const start = sh*3600 + sm*60 + ss;
        const end = eh*3600 + em*60 + es;
        if (end <= start) { 
            showToast("종료 시점이 시작 시점보다 빨라야 합니다.");
            const endGroup = inputs[3].closest('.time-group');
            if (endGroup) {
                endGroup.classList.add('shake');
                setTimeout(() => endGroup.classList.remove('shake'), 500);
            }
            return; 
        }
        seg.startTime = start; seg.endTime = end;
        renderTimeline();
    };

    window.removeSegment = (id) => { timelineSegments = timelineSegments.filter(s => s.id !== id); renderTimeline(); updateExportState(); };

    // --- Main Time Inputs ---
    [...Object.values(startInputs), ...Object.values(endInputs)].forEach(input => {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val.length > 2) e.target.value = val.slice(0, 2);
            
            if (e.target.value.length >= 2) {
                let next = e.target.nextElementSibling;
                if (next && next.tagName === 'INPUT') next.focus();
            }
            calculateClipDuration();
        });
        input.addEventListener('blur', (e) => { e.target.value = (parseInt(e.target.value) || 0).toString().padStart(2, '0'); });
    });

    btnSetStart.addEventListener('click', () => {
        const t = player.currentTime || 0;
        startInputs.hh.value = Math.floor(t/3600).toString().padStart(2, '0');
        startInputs.mm.value = Math.floor((t%3600)/60).toString().padStart(2, '0');
        startInputs.ss.value = Math.floor(t%60).toString().padStart(2, '0');
        calculateClipDuration();
    });
    btnSetEnd.addEventListener('click', () => {
        const t = player.currentTime || 0;
        endInputs.hh.value = Math.floor(t/3600).toString().padStart(2, '0');
        endInputs.mm.value = Math.floor((t%3600)/60).toString().padStart(2, '0');
        endInputs.ss.value = Math.floor(t%60).toString().padStart(2, '0');
        calculateClipDuration();
    });

    // --- Export ---
    btnExport.addEventListener('click', async () => {
        if (timelineSegments.length === 0) return;
        modalTitle.textContent = '비디오 렌더링 중...';
        modalMessage.innerHTML = `${timelineSegments.length}개의 구간을 합치는 중입니다.`;
        modalProgress.style.display = 'block';
        progressBar.style.width = '0%';
        modal.classList.add('active');
        timeFeedback.textContent = '초기화 중...';

        let startTime = Date.now();
        
        // v0.11.0 Progress handling
        ffmpeg.setProgress(({ ratio }) => {
            // ratio is 0 to 1
        });

        try {
            const src = importedSources[0];
            if (!src) throw new Error("편집할 원본 영상이 로드되지 않았습니다.");

            console.log("Export started for:", src.name);
            progressText.textContent = '원본 파일 로드 중... (잠시만 기다려주세요)';
            
            const fileData = await fetchFile(src.file);
            console.log("File fetched successfully. Size:", fileData.byteLength);
            
            await ffmpeg.FS('writeFile', 'input.mp4', fileData);
            console.log("Input file written to FFmpeg virtual FS.");
            
            let listContent = '';
            const total = timelineSegments.length;

            for (let i = 0; i < total; i++) {
                const seg = timelineSegments[i];
                const dur = seg.endTime - seg.startTime;
                
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const basePercent = (i / total) * 100;
                
                progressText.textContent = `클립 ${i+1} 작업 중... (${basePercent.toFixed(1)}%)`;
                timeFeedback.textContent = `경과 시간: ${elapsedSeconds.toFixed(1)}s | 예상 남은 시간: 계산 중...`;

                await ffmpeg.run('-ss', seg.startTime.toString(), '-i', 'input.mp4', '-t', dur.toString(), '-c', 'copy', `part${i}.mp4`);
                listContent += `file 'part${i}.mp4'\n`;
                
                const currentElapsed = (Date.now() - startTime) / 1000;
                const estTotal = (currentElapsed / (i + 1)) * total;
                const remaining = Math.max(0, estTotal - currentElapsed);
                
                progressBar.style.width = `${((i+1)/total)*85}%`;
                timeFeedback.textContent = `경과 시간: ${currentElapsed.toFixed(0)}s | 예상 잔여 시간: ${remaining.toFixed(0)}s`;
            }

            await ffmpeg.FS('writeFile', 'list.txt', listContent);
            console.log("Concat list created:\n", listContent);
            
            progressText.textContent = '클립들을 하나로 합치는 중...';
            await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4');
            console.log("Merging completed.");
            
            progressBar.style.width = '100%';
            timeFeedback.textContent = `총 작업 완료! (소요 시간: ${((Date.now()-startTime)/1000).toFixed(1)}초)`;
            
            const data = ffmpeg.FS('readFile', 'out.mp4');
            const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
            
            modalTitle.textContent = '완료!';
            modalMessage.textContent = '편집된 비디오가 성공적으로 생성되었습니다.';
            modalProgress.style.display = 'none';
            const a = document.createElement('a'); a.href = url; a.download = `clip_${Date.now()}.mp4`; a.click();
        } catch (err) {
            console.error("CRITICAL EXPORT ERROR:", err);
            modalTitle.textContent = '오류 발생';
            modalMessage.textContent = '편집 도중 오류가 발생했습니다: ' + err.message;
            timeFeedback.textContent = '브라우저 콘솔(F12)에서 상세 내용을 확인하세요.';
            progressText.textContent = '중단됨';
            alert("편집 오류: " + err.message + "\n\n1GB 미만의 파일인지, 다른 프로그램에서 사용 중인지 확인해 주세요.");
        }
    });

    // --- Edit Records (Save/Load) Logic ---
    btnSaveRecords.addEventListener('click', () => {
        if (timelineSegments.length === 0) { showToast("저장할 기록이 없습니다."); return; }
        const src = importedSources[0];
        const data = {
            filename: src ? src.name : "unknown",
            timestamp: new Date().toLocaleString(),
            clips: timelineSegments.map(s => ({ startTime: s.startTime, endTime: s.endTime, id: s.id }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edit_records_${src ? src.name.split('.')[0] : 'video'}.txt`;
        a.click();
        showToast("수정 기록이 저장되었습니다.");
    });

    const handleRecordFile = (file) => {
        if (!file.name.endsWith('.txt')) { showToast("유효한 .txt 파일이 아닙니다."); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.clips || !Array.isArray(data.clips)) throw new Error("Invalid Format");
                
                if (timelineSegments.length > 0 && !confirm("기존 타임라인 기록을 덮어쓰시겠습니까?")) return;
                
                timelineSegments = data.clips;
                renderTimeline();
                updateExportState();
                showToast("기록을 성공적으로 불러왔습니다.");
            } catch (err) {
                showToast("기록 파일 파싱 중 오류가 발생했습니다.");
            }
        };
        reader.readAsText(file);
    };

    dropZoneRecords.addEventListener('click', () => recordsUpload.click());
    recordsUpload.addEventListener('change', (e) => { if (e.target.files[0]) handleRecordFile(e.target.files[0]); });
    
    dropZoneRecords.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneRecords.classList.add('drag-over'); });
    dropZoneRecords.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZoneRecords.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleRecordFile(e.dataTransfer.files[0]);
    });

    function showDownloadPrompt(name) {
        modalTitle.textContent = '처리 불가 안내';
        modalMessage.innerHTML = `[${name}] 파일이 1GB를 초과합니다.<br>대용량은 전용 PC 프로그램을 사용해 주세요.`;
        btnDownload.style.display = 'block';
        modal.classList.add('active');
    }

    btnClose.addEventListener('click', () => modal.classList.remove('active'));

    // Global Drag & Drop for easier access
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || e.pageX <= 0 || e.pageY <= 0) {
            dropZone.classList.remove('drag-over');
        }
    });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });
    
    // Also allow clicking the drop zone
    dropZone.addEventListener('click', () => videoUpload.click());
});
