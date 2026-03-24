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
    const btnClearAll = document.getElementById('btn-clear-all');
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
    const loadingOverlay = document.getElementById('loading-overlay');
    const btnHelpRecords = document.getElementById('btn-help-records');

    const btnSaveRecords = document.getElementById('btn-save-records');
    const recordsUpload = document.getElementById('records-upload');
    const dropZoneRecords = document.getElementById('drop-zone-records');
    const checkSeparate = document.getElementById('check-separate');
    const modeOptions = document.querySelectorAll('.mode-option');
    const btnHelpMode = document.getElementById('btn-help-mode');
    let currentMode = 'precision'; // Default mode

    const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024;
    const MAX_CLIPS = 23;
    let importedSources = []; 
    let timelineSegments = []; 
    let currentSourceId = null;
    let editingSegmentId = null;

    // --- Toast & Shake ---
    function showToast(msg, icon = 'info') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: msg,
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true
        });
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
            // Check for Secure Context
            if (!window.isSecureContext) {
                console.warn("Not in a Secure Context. FFmpeg.wasm will likely fail.");
                ffmpegStatus.textContent = "HTTPS Required";
                ffmpegStatus.style.color = "#ef4444";
                showToast("보안 연결(HTTPS)이 필요합니다.");
            }

            // Check for SharedArrayBuffer
            if (typeof SharedArrayBuffer === 'undefined') {
                console.warn("SharedArrayBuffer is NOT available.");
                ffmpegStatus.textContent = "System Incompatible";
                ffmpegStatus.style.color = "#ef4444";
                // Don't return yet, try to load anyway in case of polyfills
            }

            await ffmpeg.load();
            clearTimeout(timeout);
            ffmpeg.loaded = true;
            ffmpegStatus.textContent = "FFmpeg Ready";
            ffmpegStatus.style.color = "#4caf50";
            btnTroubleshoot.style.display = 'none';
        } catch (err) {
            clearTimeout(timeout);
            console.error("FFmpeg load failed:", err);
            ffmpegStatus.textContent = "FFmpeg Load Error";
            ffmpegStatus.style.color = "#ef4444";
            btnTroubleshoot.style.display = 'inline';
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
        Swal.fire({
            title: '시스템 진단 정보',
            html: `<pre style="text-align:left; font-size:0.8rem;">${info}</pre>`,
            icon: 'info',
            confirmButtonText: '확인'
        });
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

    function formatDurationLong(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const hPart = h > 0 ? `${h.toString().padStart(2, '0')}:` : '';
        const timePart = `${hPart}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${timePart} (${Math.round(sec)})`;
    }

    function calculateClipDuration() {
        const start = (parseInt(startInputs.hh.value) || 0) * 3600 + (parseInt(startInputs.mm.value) || 0) * 60 + (parseInt(startInputs.ss.value) || 0);
        const end = (parseInt(endInputs.hh.value) || 0) * 3600 + (parseInt(endInputs.mm.value) || 0) * 60 + (parseInt(endInputs.ss.value) || 0);
        clipDurationText.textContent = Math.max(0, end - start).toFixed(1);
        
        if (end <= start && (parseInt(endInputs.ss.value) || 0) > 0) {
            shakeInput('end-s');
        }
    }

    function nextInput(el) {
        if (el.value.length >= 2) {
            const allInputs = [
                startInputs.hh, startInputs.mm, startInputs.ss,
                endInputs.hh, endInputs.mm, endInputs.ss
            ];
            // Ensure values are numbers only and max 2 digits
            el.value = el.value.replace(/\D/g, '').slice(0, 2);
            
            const idx = allInputs.indexOf(el);
            const nextInputs = allInputs.slice(idx + 1).filter(inp => !inp.disabled && inp.style.display !== 'none');
            if (nextInputs.length > 0) {
                const next = nextInputs[0];
                next.focus();
                setTimeout(() => next.select(), 10);
            }
        }
    }

    [...Object.values(startInputs), ...Object.values(endInputs)].forEach(inp => {
        inp.addEventListener('input', (e) => {
            // Strict 2 digit limit and numeric only
            const val = e.target.value;
            if (val.length > 2) e.target.value = val.slice(0, 2);
            
            nextInput(inp);
            calculateClipDuration();
        });
        inp.addEventListener('focus', () => {
            inp.select(); // Select text on focus (click or tab)
        });
        inp.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent mobile long-press context
        inp.addEventListener('blur', (e) => {
            e.target.value = (parseInt(e.target.value) || 0).toString().padStart(2, '0');
        });
    });

    function updateExportState() {
        btnExport.disabled = timelineSegments.length === 0 || !importedSources.length;
        document.getElementById('segment-count').textContent = timelineSegments.length;
        btnAddSegment.disabled = timelineSegments.length >= MAX_CLIPS && !editingSegmentId;
    }

    // --- Media Library ---
    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        
        // Safety check: Ignore text files (records) in video handler
        if (file.name.toLowerCase().endsWith('.txt')) {
            console.log("Record file ignored in video handler:", file.name);
            return;
        }

        console.log("File selected:", file.name, "size:", file.size, "type:", file.type);
        
        if (file.size > MAX_FILE_SIZE) { showDownloadPrompt(file.name); return; }
        
        // Show loading state
        if (loadingOverlay) loadingOverlay.classList.add('active');
        
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        // Timeout for metadata loading
        const metadataTimeout = setTimeout(() => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            showToast("영상 정보를 읽는 데 시간이 너무 오래 걸립니다.");
            console.warn("Metadata timeout for:", file.name);
        }, 10000);

        video.onloadedmetadata = () => {
            clearTimeout(metadataTimeout);
            console.log("Metadata loaded. Duration:", video.duration);
            
            importedSources = [{
                id: 'src_' + Date.now(),
                file: file, url: url, name: file.name,
                duration: video.duration || 0
            }];
            currentSourceId = importedSources[0].id;
            timelineSegments = [];
            renderMediaList();
            loadSourceIntoPreview(importedSources[0]);
            
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            
            // Auto-scroll to player on mobile
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 500);
            }
        };

        video.onerror = (e) => {
            clearTimeout(metadataTimeout);
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            showToast("동영상을 불러올 수 없습니다. 지원되지 않는 포맷일 수 있습니다.");
            console.error("Video element error:", e);
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
                <button id="btn-clear" class="btn-action danger" style="font-size: 0.825rem; padding: 0.3rem 0.6rem; white-space: nowrap; margin-left: 12px; font-weight: 800; border-radius: 8px;">비우기 🧹</button>
            </div>
        `;
        
        document.getElementById('btn-clear').onclick = async (e) => {
            e.stopPropagation();
            if (timelineSegments.length > 0) {
                const result = await Swal.fire({
                    title: '초기화 확인',
                    text: '현재 작업 중인 내용이 모두 사라집니다. 초기화하시겠습니까?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '초기화',
                    cancelButtonText: '취소',
                    confirmButtonColor: '#ef4444'
                });
                if (result.isConfirmed) {
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
                <div id="row-${seg.id}" style="display: flex; align-items: center; gap: 4px; width: 100%;">
                    <div style="font-weight: 800; color: var(--text-muted); min-width: 40px; font-size: 0.75rem; flex-shrink: 0;">클립 ${index + 1}</div>
                    <div class="clip-times" style="display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow: hidden;">
                        <span class="mobile-hide-label" style="font-size: 0.7rem; color: #94a3b8; font-weight: 600; flex-shrink: 0;">시작</span>
                        <div class="time-group" style="flex-shrink: 0;">
                            <input type="text" data-id="${seg.id}" data-type="start" data-unit="h" maxlength="2" inputmode="numeric" class="${seg.startTime >= 3600 ? '' : 'disabled'} ${seg.isDirty ? 'modified' : ''}" value="${sH}" ${isShort?'disabled':''}>:
                            <input type="text" data-id="${seg.id}" data-type="start" data-unit="m" maxlength="2" inputmode="numeric" class="${seg.isDirty ? 'modified' : ''}" value="${sM}">:
                            <input type="text" data-id="${seg.id}" data-type="start" data-unit="s" maxlength="2" inputmode="numeric" class="${seg.isDirty ? 'modified' : ''}" value="${sS}">
                        </div>
                        <span style="color: #cbd5e1; flex-shrink: 0;">~</span>
                        <span class="mobile-hide-label" style="font-size: 0.7rem; color: #94a3b8; font-weight: 600; flex-shrink: 0;">종료</span>
                        <div class="time-group" style="flex-shrink: 0;">
                            <input type="text" data-id="${seg.id}" data-type="end" data-unit="h" maxlength="2" inputmode="numeric" class="${seg.endTime >= 3600 ? '' : 'disabled'} ${seg.isDirty ? 'modified' : ''}" value="${eH}" ${isShort?'disabled':''}>:
                            <input type="text" data-id="${seg.id}" data-type="end" data-unit="m" maxlength="2" inputmode="numeric" class="${seg.isDirty ? 'modified' : ''}" value="${eM}">:
                            <input type="text" data-id="${seg.id}" data-type="end" data-unit="s" maxlength="2" inputmode="numeric" class="${seg.isDirty ? 'modified' : ''}" value="${eS}">
                        </div>
                    </div>
                    <div class="clip-dur-text" style="font-size: 0.75rem; color: var(--primary-color); font-weight: 700; min-width: 80px; text-align: right; flex-shrink: 0;">
                        ${formatDurationLong(seg.endTime-seg.startTime)}
                    </div>
                    <div style="margin-left: auto; display: flex; gap: 3px; flex-shrink: 0;">
                        <button id="btn-save-${seg.id}" onclick="saveInPlace('${seg.id}')" class="btn-icon ${seg.isDirty ? 'modified-btn' : ''}" style="color: #10b981; padding: 2px; width: 26px; height: 26px;" title="저장"><i class="fas fa-check-circle" style="font-size: 1.1rem;"></i></button>
                        <button onclick="removeSegment('${seg.id}')" class="btn-icon" style="color: #ef4444; padding: 2px; width: 26px; height: 26px;" title="삭제"><i class="fas fa-trash" style="font-size: 1.1rem;"></i></button>
                    </div>
                </div>
            `;
            // Add auto-tabbing and formatting for timeline inputs
            div.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', (e) => {
                    // Strict 2 digit limit and numeric only
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const val = e.target.value;
                    
                    e.target.classList.add('modified');
                    seg.isDirty = true; // Mark as dirty
                    const saveBtn = document.getElementById(`btn-save-${seg.id}`);
                    if (saveBtn) saveBtn.classList.add('modified-btn');
                    
                    if (val.length >= 2) {
                        const rowInputs = Array.from(div.querySelectorAll('input'));
                        const idx = rowInputs.indexOf(e.target);
                        // Skip disabled inputs (like HH if short video)
                        const nextInputs = rowInputs.slice(idx + 1).filter(inp => !inp.disabled && inp.style.display !== 'none');
                        if (nextInputs.length > 0) {
                            const next = nextInputs[0];
                            next.focus();
                            setTimeout(() => next.select(), 10);
                        }
                    }
                });
                input.addEventListener('focus', (e) => {
                    e.target.select();
                });
                input.addEventListener('blur', (e) => {
                    const val = (parseInt(e.target.value) || 0).toString().padStart(2, '0');
                    e.target.value = val;
                });
            });

            timelineList.appendChild(div);
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

        timelineSegments.push({ 
            id: 'seg_' + Date.now(), 
            sourceId: currentSourceId, 
            startTime: start, 
            endTime: end,
            isDirty: false // Track edit state
        });
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
        const row = document.getElementById(`row-${id}`);
        if (!row) return;

        const inputs = row.querySelectorAll(`input[data-id="${id}"]`);
        let sh=0, sm=0, ss=0, eh=0, em=0, es=0;
        inputs.forEach(i => {
            const v = parseInt(i.value) || 0;
            if (i.dataset.type === 'start') { 
                if (i.dataset.unit==='h') sh=v; 
                else if (i.dataset.unit==='m') sm=v; 
                else if (i.dataset.unit==='s') ss=v; 
            }
            else { 
                if (i.dataset.unit==='h') eh=v; 
                else if (i.dataset.unit==='m') em=v; 
                else if (i.dataset.unit==='s') es=v; 
            }
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
        seg.startTime = start; 
        seg.endTime = end;
        seg.isDirty = false;

        // Visual feedback only for this row
        const saveBtn = document.getElementById(`btn-save-${id}`);
        if (saveBtn) saveBtn.classList.remove('modified-btn');
        row.querySelectorAll('input').forEach(i => i.classList.remove('modified'));
        
        const durText = row.querySelector('.clip-dur-text');
        if (durText) durText.textContent = formatDurationLong(end - start);
        
        showToast("구간 설정이 저장되었습니다.", "success");
        console.log(`Segment ${id} saved independently.`);
    };

    window.removeSegment = async (id) => { 
        const result = await Swal.fire({
            title: '구간 삭제',
            text: '이 구간을 삭제하시겠습니까?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '삭제',
            cancelButtonText: '취소',
            confirmButtonColor: '#ef4444'
        });

        if (result.isConfirmed) {
            timelineSegments = timelineSegments.filter(s => s.id !== id); 
            renderTimeline(); 
            updateExportState(); 
        }
    };

    if (btnClearAll) {
        btnClearAll.addEventListener('click', async () => {
            if (timelineSegments.length === 0) return;
            const result = await Swal.fire({
                title: '전체 초기화',
                text: '모든 구간 기록을 삭제하시겠습니까?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: '초기화',
                cancelButtonText: '취소',
                confirmButtonColor: '#ef4444'
            });

            if (result.isConfirmed) {
                timelineSegments = [];
                renderTimeline();
                updateExportState();
                Swal.fire('초기화 완료', '모든 구간이 삭제되었습니다.', 'success');
            }
        });
    }


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

        const result = await Swal.fire({
            title: '작업을 진행할까요?',
            text: '동영상 인코딩 및 내보내기를 시작합니다.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '진행',
            cancelButtonText: '취소',
            confirmButtonColor: 'var(--accent-color)'
        });

        if (!result.isConfirmed) return;
        
        const isSeparate = checkSeparate?.checked || false;
    const isPrecision = currentMode === 'precision';
    
    modalTitle.textContent = isSeparate ? '개별 구간 저장 중...' : '비디오 렌더링 중...';
    modalMessage.innerHTML = isSeparate 
        ? `${timelineSegments.length}개의 구간을 각각 저장하고 있습니다. (${isPrecision ? '정밀모드' : '고속모드'})` 
        : `${timelineSegments.length}개의 구간을 하나로 합치는 중입니다. (${isPrecision ? '정밀모드' : '고속모드'})`;
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
            const originalName = src.name.substring(0, src.name.lastIndexOf('.')) || src.name;

            for (let i = 0; i < total; i++) {
                const seg = timelineSegments[i];
                const dur = seg.endTime - seg.startTime;
                
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const basePercent = (i / total) * 100;
                
                progressText.textContent = `클립 ${i+1} 작업 중... (${basePercent.toFixed(1)}%)`;
                timeFeedback.textContent = `경과 시간: ${elapsedSeconds.toFixed(1)}s | 예상 남은 시간: 계산 중...`;

                const partName = `part${i}.mp4`;
                
                if (isPrecision) {
                    // Precision Mode: Re-encode
                    await ffmpeg.run(
                        '-ss', seg.startTime.toString(), 
                        '-i', 'input.mp4', 
                        '-t', dur.toString(), 
                        '-vcodec', 'libx264',
                        '-preset', 'ultrafast',
                        '-acodec', 'aac',
                        '-map_metadata', '0',
                        '-movflags', '+faststart',
                        partName
                    );
                } else {
                    // Fast Mode: Stream Copy
                    await ffmpeg.run(
                        '-ss', seg.startTime.toString(), 
                        '-i', 'input.mp4', 
                        '-t', dur.toString(), 
                        '-c', 'copy', 
                        '-avoid_negative_ts', 'make_zero', 
                        '-map_metadata', '0',
                        '-movflags', '+faststart',
                        partName
                    );
                }
                
                if (isSeparate) {
                    // Download immediately if separate export is on
                    const data = ffmpeg.FS('readFile', partName);
                    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `[cut]${(i+1).toString().padStart(2, '0')}-${originalName}.mp4`;
                    a.click();
                    // Small delay to prevent browser blockage on multiple downloads
                    await new Promise(r => setTimeout(r, 300));
                } else {
                    listContent += `file '${partName}'\n`;
                }
                
                const currentElapsed = (Date.now() - startTime) / 1000;
                const estTotal = (currentElapsed / (i + 1)) * total;
                const remaining = Math.max(0, estTotal - currentElapsed);
                
                progressBar.style.width = `${((i+1)/total)*85}%`;
                timeFeedback.textContent = `경과 시간: ${currentElapsed.toFixed(0)}s | 예상 잔여 시간: ${remaining.toFixed(0)}s`;
            }

            if (!isSeparate) {
                await ffmpeg.FS('writeFile', 'list.txt', listContent);
                console.log("Concat list created:\n", listContent);
                
                progressText.textContent = '클립들을 하나로 합치는 중...';
                await ffmpeg.run(
                    '-f', 'concat', 
                    '-safe', '0', 
                    '-i', 'list.txt', 
                    '-c', 'copy', 
                    '-avoid_negative_ts', 'make_zero',
                    '-map_metadata', '0',
                    '-movflags', '+faststart',
                    'out.mp4'
                );
                console.log("Merging completed.");
                
                progressBar.style.width = '100%';
                timeFeedback.textContent = `총 작업 완료! (소요 시간: ${((Date.now()-startTime)/1000).toFixed(1)}초)`;
                
                const data = ffmpeg.FS('readFile', 'out.mp4');
                const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
                
                modalTitle.textContent = '완료!';
                modalMessage.textContent = '편집된 비디오가 성공적으로 생성되었습니다.';
                modalProgress.style.display = 'none';
                const a = document.createElement('a'); a.href = url; a.download = `[CUT]${originalName}.mp4`; a.click();
            } else {
                progressBar.style.width = '100%';
                timeFeedback.textContent = `모든 구간 추출 완료! (총 ${total}개)`;
                modalTitle.textContent = '완료!';
                modalMessage.textContent = '모든 구간이 개별 파일로 저장되었습니다.';
                modalProgress.style.display = 'none';
            }
        } catch (err) {
            console.error("CRITICAL EXPORT ERROR:", err);
            progressText.textContent = '중단됨';
            Swal.fire({
                title: '편집 오류',
                text: `${err.message} (1GB 미만의 파일인지, 다른 프로그램에서 사용 중인지 확인해 주세요.)`,
                icon: 'error',
                confirmButtonText: '확인'
            });
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

    const handleRecordFile = async (file) => {
        if (!file.name.endsWith('.txt')) { showToast("유효한 .txt 파일이 아닙니다.", "error"); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.clips || !Array.isArray(data.clips)) throw new Error("Invalid Format");
                
                const src = importedSources[0];
                if (src && data.filename && data.filename !== src.name) {
                    await Swal.fire({
                        title: '파일명 불일치',
                        text: '불러온 기록의 파일명이 현재 작업 중인 파일명과 다릅니다. 확인해주세요.',
                        icon: 'warning',
                        confirmButtonText: '확인',
                        confirmButtonColor: 'var(--accent-color)'
                    });
                    // Don't return, user might still want to load it? 
                    // No, the requirement says "파일명이 다르면 ... 라고 메시지를 띄워줘." 
                    // I will stop here to be safe and let user decide if I should allow it.
                    // Actually, let's allow it but warn them. 
                    // "정말 진행하시겠습니까?"
                }

                if (timelineSegments.length > 0) {
                    const confirmRes = await Swal.fire({
                        title: '덮어쓰기 확인',
                        text: '기존 타임라인 기록을 덮어쓰시겠습니까?',
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: '덮어쓰기',
                        cancelButtonText: '취소'
                    });
                    if (!confirmRes.isConfirmed) return;
                }
                
                // Fix: Restore sourceId and isDirty for imported segments
                timelineSegments = data.clips.map(c => ({
                    ...c,
                    sourceId: currentSourceId,
                    isDirty: false
                }));
                renderTimeline();
                updateExportState();
                showToast("기록을 성공적으로 불러왔습니다.", "success");
            } catch (err) {
                showToast("기록 파일 파싱 중 오류가 발생했습니다.", "error");
            }
        };
        reader.readAsText(file);
    };

    dropZoneRecords.addEventListener('click', () => recordsUpload.click());
    recordsUpload.addEventListener('change', (e) => { if (e.target.files[0]) handleRecordFile(e.target.files[0]); });
    
    dropZoneRecords.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneRecords.classList.add('drag-over'); });
    dropZoneRecords.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent window drop listener from firing
        dropZoneRecords.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleRecordFile(e.dataTransfer.files[0]);
    });

    // Help Popup
    if (btnHelpRecords) {
        btnHelpRecords.addEventListener('click', () => {
            Swal.fire({
                title: '구간기록값 저장 안내',
                text: '구간기록파일을 저장해두면 같은 파일을 다시 작업할 때 전에 작업한 구간시간기록을 그대로 가져울 수 있습니다.',
                icon: 'info',
                confirmButtonText: '확인',
                confirmButtonColor: 'var(--accent-color)',
                customClass: {
                    popup: 'swal2-custom-popup'
                }
            });
        });
    }

    // Mode Selector Logic
    modeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            modeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            currentMode = opt.dataset.mode;
            console.log("Current Mode switched to:", currentMode);
        });
    });

    if (btnHelpMode) {
        btnHelpMode.addEventListener('click', () => {
            Swal.fire({
                title: '편집 모드 가이드',
                html: `
                    <div style="text-align: left; font-size: 0.9rem;">
                        <p><b>• 고속모드:</b> 키프레임 단위로 저장되며 정확한 시간 단위는 아니지만 빠르게 작업됩니다. (작업물에 따라 1~3초 정도 영상이 더 진행됩니다.)</p>
                        <p style="margin-top: 10px;"><b>• 정밀모드:</b> 초 단위까지 정확하게 계산이 되지만 시간이 걸리며 PC(또는 모바일)의 사양에 따라 달라집니다.</p>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: '확인',
                confirmButtonColor: 'var(--accent-color)'
            });
        });
    }

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
    
    // Video Upload Input change listener
    videoUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFiles(e.target.files);
    });

    // Also allow clicking the drop zone
    dropZone.addEventListener('click', () => {
        videoUpload.value = null; // Reset to ensure change event fires even if same file
        videoUpload.click();
    });
});
