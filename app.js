// DOM要素の取得
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const filesSection = document.getElementById('filesSection');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const downloadAllBtn = document.getElementById('downloadAllBtn');

let extractedFiles = [];

// Shift_JISからUTF-8への変換関数
function decodeShiftJIS(str) {
    try {
        // 文字列を文字コードの配列に変換
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i) & 0xFF;
        }
        
        // TextDecoderでShift_JISをデコード
        const decoder = new TextDecoder('shift-jis');
        return decoder.decode(bytes);
    } catch (e) {
        console.warn('Failed to decode Shift_JIS:', e);
        return str; // 変換失敗時は元の文字列を返す
    }
}

// イベントリスナーの設定
selectBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

// ドラッグ&ドロップのイベント
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

dropZone.addEventListener('click', (e) => {
    if (e.target !== selectBtn) {
        fileInput.click();
    }
});

// ファイル選択時の処理
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// ファイル処理のメイン関数
async function handleFile(file) {
    // エラー表示をリセット
    hideError();
    hideFiles();
    
    // ファイル拡張子のチェック
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.lzh') && !fileName.endsWith('.lha')) {
        showError('LZHまたはLHAファイルを選択してください。');
        return;
    }

    try {
        showProgress('ファイルを読み込んでいます...');
        
        // ファイルをArrayBufferとして読み込む
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const uint8Array = new Uint8Array(arrayBuffer);
        
        showProgress('LZHファイルを解凍しています...');
        
        extractedFiles = [];
        
        // グローバルな書き込みファイルトラッカーを初期化
        window._lzh_write_files = [];
        
        // リスト取得と解凍を同時に行う
        const lzhfile = new stdio.FILE(uint8Array);
        const fileDataMap = new Map();
        
        try {
            // 'x'コマンドで全ファイルを解凍
            unlzh(['x', lzhfile]);
            
            console.log('Extraction completed. Files:', window._lzh_write_files.length);
            
            // 書き込まれたファイルからデータを取得
            for (const file of window._lzh_write_files) {
                if (file.filename && file.buffer && file.buffer.length > 0) {
                    const data = new Uint8Array(file.buffer);
                    // ファイル名をShift_JISからUTF-8に変換
                    const decodedFilename = decodeShiftJIS(file.filename);
                    fileDataMap.set(decodedFilename, data);
                }
            }
            
            // リストを再取得して、ファイル情報とデータを結合
            const lzhfile2 = new stdio.FILE(uint8Array);
            unlzh(['l', lzhfile2], function(arcfile, filename, method, compsize, origsize) {
                // ファイル名をShift_JISからUTF-8に変換
                const decodedFilename = decodeShiftJIS(filename);
                const data = fileDataMap.get(decodedFilename) || new Uint8Array(0);
                
                extractedFiles.push({
                    name: decodedFilename,
                    data: data,
                    originalSize: origsize,
                    packedSize: compsize,
                    method: method
                });
            });
            
        } catch (e) {
            console.error('Extraction error:', e);
            showError('ファイルの解凍に失敗しました。');
            hideProgress();
            return;
        } finally {
            // クリーンアップ
            delete window._lzh_write_files;
        }
        
        if (extractedFiles.every(f => f.data.length === 0)) {
            showError('ファイルの解凍に失敗しました。');
            hideProgress();
            return;
        }
        
        hideProgress();
        displayFiles();
        
    } catch (error) {
        console.error('Error:', error);
        showError(`エラーが発生しました: ${error.message}`);
        hideProgress();
    }
}

// ファイルをArrayBufferとして読み込む
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsArrayBuffer(file);
    });
}

// 進捗表示
function showProgress(message) {
    progressSection.style.display = 'block';
    progressText.textContent = message;
    progressFill.style.width = '50%';
}

function hideProgress() {
    progressSection.style.display = 'none';
    progressFill.style.width = '0%';
}

// エラー表示
function showError(message) {
    errorSection.style.display = 'block';
    errorText.textContent = message;
}

function hideError() {
    errorSection.style.display = 'none';
}

// ファイル一覧を表示
function displayFiles() {
    filesSection.style.display = 'block';
    fileCount.textContent = `${extractedFiles.length} 個のファイル`;
    fileList.innerHTML = '';
    
    extractedFiles.forEach((file, index) => {
        const fileItem = createFileItem(file, index);
        fileList.appendChild(fileItem);
    });
}

function hideFiles() {
    filesSection.style.display = 'none';
}

// ファイルアイテムのHTML要素を作成
function createFileItem(file, index) {
    const div = document.createElement('div');
    div.className = 'file-item';
    
    const fileName = file.name || 'unknown';
    const icon = getFileIcon(fileName);
    const size = formatFileSize(file.data.length);
    
    console.log('Creating file item:', fileName); // デバッグ用
    
    div.innerHTML = `
        <div class="file-info">
            <span class="file-icon">${icon}</span>
            <div class="file-details">
                <div class="file-name">${escapeHtml(fileName)}</div>
                <div class="file-meta">${size}</div>
            </div>
        </div>
        <button class="btn-download" onclick="downloadFile(${index})">
            ダウンロード
        </button>
    `;
    
    return div;
}

// ファイルアイコンを取得
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'txt': '📄',
        'pdf': '📕',
        'doc': '📘',
        'docx': '📘',
        'xls': '📗',
        'xlsx': '📗',
        'ppt': '📙',
        'pptx': '📙',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'zip': '🗜️',
        'rar': '🗜️',
        'mp3': '🎵',
        'mp4': '🎬',
        'avi': '🎬',
        'exe': '⚙️',
        'html': '🌐',
        'css': '🎨',
        'js': '📜'
    };
    
    return iconMap[ext] || '📄';
}

// ファイルサイズのフォーマット
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// HTMLエスケープ
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// 個別ファイルのダウンロード
function downloadFile(index) {
    const file = extractedFiles[index];
    const blob = new Blob([file.data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// すべてのファイルをZIPでダウンロード
downloadAllBtn.addEventListener('click', async () => {
    try {
        showProgress('ZIPファイルを作成しています...');
        
        // 簡易的なZIP作成（JSZipライブラリを使わない実装）
        // 実際の実装ではJSZipを使用することを推奨
        const zip = await createSimpleZip(extractedFiles);
        
        const blob = new Blob([zip], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extracted_files.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        hideProgress();
    } catch (error) {
        console.error('ZIP creation error:', error);
        showError('ZIPファイルの作成に失敗しました');
        hideProgress();
    }
});

// 簡易ZIP作成（基本的な実装）
async function createSimpleZip(files) {
    // この実装は簡略化されています
    // 実際のプロジェクトではJSZipなどのライブラリの使用を推奨
    
    // ここでは個別ダウンロードをガイドするメッセージを表示
    alert('各ファイルの「ダウンロード」ボタンから個別にダウンロードしてください。');
    throw new Error('ZIP作成機能は未実装です');
}
