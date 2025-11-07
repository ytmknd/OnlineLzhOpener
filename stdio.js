// stdio.js - Simple stdio implementation for unlzh.js

var stdio = (function() {
    'use strict';
    
    // FILE class
    function FILE(data) {
        this.data = data || [];
        this.pos = 0;
        this.buffer = [];
    }
    
    FILE.prototype.fgetc = function() {
        if (this.pos < this.data.length) {
            return this.data[this.pos++];
        }
        return -1; // EOF
    };
    
    FILE.prototype.fread = function(buf, size) {
        var count = 0;
        for (var i = 0; i < size && this.pos < this.data.length; i++) {
            buf[i] = this.data[this.pos++];
            count++;
        }
        return count;
    };
    
    FILE.prototype.fputc = function(c) {
        this.buffer.push(c & 0xFF);
    };
    
    FILE.prototype.fputs = function(str) {
        if (typeof str === 'string') {
            for (var i = 0; i < str.length; i++) {
                this.buffer.push(str.charCodeAt(i) & 0xFF);
            }
        }
    };
    
    FILE.prototype.fwrite = function(buf, itemSize, itemCount) {
        if (!this.buffer) {
            this.buffer = [];
        }
        var totalBytes = itemSize * itemCount;
        var written = 0;
        
        for (var i = 0; i < totalBytes && i < buf.length; i++) {
            this.buffer.push(buf[i] & 0xFF);
            written++;
        }
        // 書き込んだアイテム数を返す
        return Math.floor(written / itemSize);
    };
    
    FILE.prototype.fclose = function() {
        // ファイルを閉じる（メモリ内なので特に何もしない）
        return 0;
    };
    
    FILE.prototype.ftell = function() {
        return this.pos;
    };
    
    FILE.prototype.fseek = function(offset, whence) {
        if (whence === SEEK_SET) {
            this.pos = offset;
        } else if (whence === SEEK_CUR) {
            this.pos += offset;
        } else if (whence === SEEK_END) {
            this.pos = this.data.length + offset;
        }
        // Clamp position
        if (this.pos < 0) this.pos = 0;
        if (this.pos > this.data.length) this.pos = this.data.length;
    };
    
    FILE.prototype.dump = function() {
        // unlzh.jsで使用されているため、空の実装を提供
    };
    
    FILE.prototype.getBuffer = function() {
        return new Uint8Array(this.buffer);
    };
    
    // Seek constants
    var SEEK_SET = 0;
    var SEEK_CUR = 1;
    var SEEK_END = 2;
    
    // fopen function
    function fopen(filename, mode, callback) {
        // メモリ内でファイルを作成（書き込みモード用）
        if (mode && mode.indexOf('w') >= 0) {
            var file = new FILE();
            file.filename = filename;
            
            // グローバルな書き込みファイルトラッカーに追加
            if (typeof window !== 'undefined' && window._lzh_write_files) {
                window._lzh_write_files.push(file);
            }
            
            if (callback) {
                callback(file);
            }
            return file;
        }
        // In browser environment, we can't open files by name for reading
        if (callback) {
            callback(null);
        }
        return null;
    }
    
    // stdout and stderr
    var stdout = new FILE();
    stdout.fputs = function(str) {
        console.log(str);
    };
    stdout.fputc = function(c) {
        console.log(String.fromCharCode(c));
    };
    
    var stderr = new FILE();
    stderr.fputs = function(str) {
        console.error(str);
    };
    stderr.fputc = function(c) {
        console.error(String.fromCharCode(c));
    };
    
    // fprintf function
    function fprintf(stream, format) {
        // 簡易的なフォーマット処理
        var args = Array.prototype.slice.call(arguments, 2);
        var output = format;
        var argIndex = 0;
        
        output = output.replace(/%([sdxc%])/g, function(match, type) {
            if (type === '%') return '%';
            if (argIndex >= args.length) return match;
            
            var arg = args[argIndex++];
            switch (type) {
                case 's':
                    return String(arg);
                case 'd':
                    return parseInt(arg);
                case 'x':
                    return parseInt(arg).toString(16);
                case 'c':
                    return String.fromCharCode(arg);
                default:
                    return match;
            }
        });
        
        if (stream && stream.fputs) {
            stream.fputs(output);
        }
    }
    
    // getchar function - 常に'n'を返して対話モードをスキップ
    function getchar() {
        return 'n'.charCodeAt(0);
    }
    
    // fclose function
    function fclose(file) {
        if (file && file.fclose) {
            return file.fclose();
        }
        return 0;
    }
    
    return {
        FILE: FILE,
        fopen: fopen,
        fclose: fclose,
        stdout: stdout,
        stderr: stderr,
        fprintf: fprintf,
        getchar: getchar,
        SEEK_SET: SEEK_SET,
        SEEK_CUR: SEEK_CUR,
        SEEK_END: SEEK_END
    };
})();
