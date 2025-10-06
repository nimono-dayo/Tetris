const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;
const LOCK_DELAY = 1000;
const MAX_LOCK_RESETS = 15;

const TETROMINOES = {
    I: {
        shape: [[1, 1, 1, 1]],
        color: '#00f0f0'
    },
    O: {
        shape: [[1, 1], [1, 1]],
        color: '#f0f000'
    },
    T: {
        shape: [[0, 1, 0], [1, 1, 1]],
        color: '#a000f0'
    },
    S: {
        shape: [[0, 1, 1], [1, 1, 0]],
        color: '#00f000'
    },
    Z: {
        shape: [[1, 1, 0], [0, 1, 1]],
        color: '#f00000'
    },
    J: {
        shape: [[1, 0, 0], [1, 1, 1]],
        color: '#0000f0'
    },
    L: {
        shape: [[0, 0, 1], [1, 1, 1]],
        color: '#f0a000'
    }
};

const DEFAULT_KEYS = {
    moveLeft: 'ArrowLeft',
    moveRight: 'ArrowRight',
    softDrop: 'ArrowDown',
    hardDrop: 'ArrowUp',
    rotate: 'z',
    hold: 'c'
};

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.enabled = true;
    }
    
    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
            this.enabled = false;
        }
    }
    
    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.enabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }
    
    playMove() {
        this.playTone(200, 0.05, 'square', 0.1);
    }
    
    playRotate() {
        this.playTone(300, 0.05, 'square', 0.15);
    }
    
    playLock() {
        this.playTone(150, 0.1, 'sine', 0.2);
    }
    
    playLineClear(lines) {
        const baseFreq = 400;
        for (let i = 0; i < lines; i++) {
            setTimeout(() => {
                this.playTone(baseFreq + (i * 100), 0.15, 'triangle', 0.3);
            }, i * 50);
        }
    }
    
    playHardDrop() {
        this.playTone(100, 0.15, 'sawtooth', 0.25);
    }
    
    playHold() {
        this.playTone(350, 0.1, 'sine', 0.15);
    }
    
    playGameOver() {
        const notes = [400, 350, 300, 250, 200];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 0.3, 'triangle', 0.2);
            }, i * 150);
        });
    }
    
    playLevelUp() {
        const notes = [400, 500, 600];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 0.1, 'sine', 0.2);
            }, i * 100);
        });
    }
}

class TetrisGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('nextCanvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.holdCanvas = document.getElementById('holdCanvas');
        this.holdCtx = this.holdCanvas.getContext('2d');
        
        this.board = this.createBoard();
        this.score = 0;
        this.lines = 0;
        this.gameOver = false;
        this.isPaused = false;
        this.startTime = null;
        this.elapsedTime = 0;
        this.timerInterval = null;
        
        this.currentPiece = null;
        this.nextPiece = null;
        this.holdPiece = null;
        this.canHold = true;
        
        this.dropInterval = 1000;
        this.lastDropTime = 0;
        this.gameMode = 'endless';
        this.modeConfig = {};
        
        this.lockDelay = LOCK_DELAY;
        this.lockTimer = null;
        this.lockResets = 0;
        this.isOnGround = false;
        
        this.clearingLines = [];
        this.clearAnimation = 0;
        
        this.soundManager = new SoundManager();
        this.soundManager.init();
        
        this.keys = { ...DEFAULT_KEYS };
        this.loadKeys();
        this.setupKeyBindings();
        
        this.risingTimer = null;
        this.risingInterval = 10000;
    }
    
    createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }
    
    loadKeys() {
        const saved = localStorage.getItem('tetrisKeys');
        if (saved) {
            this.keys = JSON.parse(saved);
        }
    }
    
    saveKeys() {
        localStorage.setItem('tetrisKeys', JSON.stringify(this.keys));
    }
    
    setupKeyBindings() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver || this.isPaused) return;
            
            const key = e.key.toLowerCase();
            
            if (key === this.keys.moveLeft.toLowerCase()) {
                e.preventDefault();
                this.movePiece(-1, 0);
            } else if (key === this.keys.moveRight.toLowerCase()) {
                e.preventDefault();
                this.movePiece(1, 0);
            } else if (key === this.keys.softDrop.toLowerCase()) {
                e.preventDefault();
                this.movePiece(0, 1);
            } else if (key === this.keys.hardDrop.toLowerCase()) {
                e.preventDefault();
                this.hardDrop();
            } else if (key === this.keys.rotate.toLowerCase()) {
                e.preventDefault();
                this.rotatePiece();
            } else if (key === this.keys.hold.toLowerCase()) {
                e.preventDefault();
                this.holdCurrentPiece();
            }
        });
    }
    
    startGame(mode) {
        this.gameMode = mode;
        this.board = this.createBoard();
        this.score = 0;
        this.lines = 0;
        this.gameOver = false;
        this.canHold = true;
        this.holdPiece = null;
        this.clearingLines = [];
        
        this.setupMode(mode);
        
        this.currentPiece = this.createPiece();
        this.nextPiece = this.createPiece();
        
        this.startTime = Date.now();
        this.elapsedTime = 0;
        this.startTimer();
        
        if (mode === 'rising') {
            this.startRising();
        }
        
        this.updateDisplay();
        this.lastDropTime = Date.now();
        this.gameLoop();
    }
    
    setupMode(mode) {
        switch(mode) {
            case 'endless':
                this.modeConfig = { name: 'エンドレス' };
                break;
            case 'lines40':
                this.modeConfig = { name: '40列クリア', target: 40 };
                break;
            case 'lines20':
                this.modeConfig = { name: '20列クリア', target: 20 };
                break;
            case 'rising':
                this.modeConfig = { name: 'ライジング' };
                break;
            case 'timeattack':
                this.modeConfig = { name: 'タイムアタック (1分)', timeLimit: 60 };
                break;
        }
        document.getElementById('modeDisplay').textContent = this.modeConfig.name;
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            if (!this.gameOver && !this.isPaused) {
                this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
                this.updateTimer();
                
                if (this.gameMode === 'timeattack' && this.elapsedTime >= this.modeConfig.timeLimit) {
                    this.endGame();
                }
            }
        }, 100);
    }
    
    updateTimer() {
        const minutes = Math.floor(this.elapsedTime / 60);
        const seconds = this.elapsedTime % 60;
        document.getElementById('time').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    startRising() {
        this.risingTimer = setInterval(() => {
            if (!this.gameOver && !this.isPaused) {
                this.addRisingLine();
            }
        }, this.risingInterval);
    }
    
    addRisingLine() {
        const emptyCol = Math.floor(Math.random() * COLS);
        const newLine = Array(COLS).fill('#808080');
        newLine[emptyCol] = 0;
        
        this.board.shift();
        this.board.push(newLine);
        
        if (this.currentPiece) {
            this.currentPiece.y--;
            if (this.checkCollision(this.currentPiece)) {
                this.endGame();
            }
        }
        
        this.draw();
    }
    
    createPiece() {
        const types = Object.keys(TETROMINOES);
        const type = types[Math.floor(Math.random() * types.length)];
        const tetromino = TETROMINOES[type];
        
        return {
            type,
            shape: tetromino.shape.map(row => [...row]),
            color: tetromino.color,
            x: Math.floor(COLS / 2) - Math.floor(tetromino.shape[0].length / 2),
            y: 0
        };
    }
    
    resetLockTimer() {
        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
            this.lockTimer = null;
        }
        
        if (this.isOnGround) {
            if (this.lockResets < MAX_LOCK_RESETS) {
                this.lockResets++;
                this.lockTimer = setTimeout(() => {
                    this.lockPiece();
                }, this.lockDelay);
            } else {
                this.lockPiece();
            }
        }
    }
    
    movePiece(dx, dy) {
        this.currentPiece.x += dx;
        this.currentPiece.y += dy;
        
        if (this.checkCollision(this.currentPiece)) {
            this.currentPiece.x -= dx;
            this.currentPiece.y -= dy;
            return false;
        }
        
        const wasOnGround = this.isOnGround;
        this.isOnGround = this.checkCollision({ ...this.currentPiece, y: this.currentPiece.y + 1 });
        
        if (this.isOnGround) {
            if (!wasOnGround) {
                this.lockResets = 0;
            }
            this.resetLockTimer();
        } else {
            if (this.lockTimer) {
                clearTimeout(this.lockTimer);
                this.lockTimer = null;
            }
        }
        
        if (dx !== 0) {
            this.soundManager.playMove();
        }
        
        this.draw();
        return true;
    }
    
    rotatePiece() {
        const rotated = this.currentPiece.shape[0].map((_, i) =>
            this.currentPiece.shape.map(row => row[i]).reverse()
        );
        
        const original = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        let rotated_successfully = false;
        
        if (!this.checkCollision(this.currentPiece)) {
            rotated_successfully = true;
        } else {
            const wallKicks = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]];
            
            for (const [offsetX, offsetY] of wallKicks) {
                this.currentPiece.x += offsetX;
                this.currentPiece.y += offsetY;
                
                if (!this.checkCollision(this.currentPiece)) {
                    rotated_successfully = true;
                    break;
                }
                
                this.currentPiece.x -= offsetX;
                this.currentPiece.y -= offsetY;
            }
        }
        
        if (!rotated_successfully) {
            this.currentPiece.shape = original;
        } else {
            this.soundManager.playRotate();
            
            const wasOnGround = this.isOnGround;
            this.isOnGround = this.checkCollision({ ...this.currentPiece, y: this.currentPiece.y + 1 });
            
            if (this.isOnGround) {
                this.resetLockTimer();
            } else if (wasOnGround) {
                if (this.lockTimer) {
                    clearTimeout(this.lockTimer);
                    this.lockTimer = null;
                }
            }
            
            this.draw();
        }
    }
    
    hardDrop() {
        let dropDistance = 0;
        while (this.movePiece(0, 1)) {
            dropDistance++;
        }
        
        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
            this.lockTimer = null;
        }
        
        this.soundManager.playHardDrop();
        this.lockPiece();
    }
    
    holdCurrentPiece() {
        if (!this.canHold) return;
        
        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
            this.lockTimer = null;
        }
        this.isOnGround = false;
        
        if (this.holdPiece === null) {
            this.holdPiece = this.currentPiece.type;
            this.currentPiece = this.nextPiece;
            this.nextPiece = this.createPiece();
        } else {
            const temp = this.holdPiece;
            this.holdPiece = this.currentPiece.type;
            this.currentPiece = this.createPieceFromType(temp);
        }
        
        this.canHold = false;
        this.soundManager.playHold();
        this.drawHold();
        this.drawNext();
        this.draw();
    }
    
    createPieceFromType(type) {
        const tetromino = TETROMINOES[type];
        return {
            type,
            shape: tetromino.shape.map(row => [...row]),
            color: tetromino.color,
            x: Math.floor(COLS / 2) - Math.floor(tetromino.shape[0].length / 2),
            y: 0
        };
    }
    
    checkCollision(piece) {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const newX = piece.x + x;
                    const newY = piece.y + y;
                    
                    if (newX < 0 || newX >= COLS || newY >= ROWS) {
                        return true;
                    }
                    
                    if (newY >= 0 && this.board[newY][newX]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    lockPiece() {
        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
            this.lockTimer = null;
        }
        this.isOnGround = false;
        this.lockResets = 0;
        
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const newY = this.currentPiece.y + y;
                    const newX = this.currentPiece.x + x;
                    
                    if (newY < 0) {
                        this.soundManager.playGameOver();
                        this.endGame();
                        return;
                    }
                    
                    this.board[newY][newX] = this.currentPiece.color;
                }
            }
        }
        
        this.soundManager.playLock();
        
        const linesCleared = this.clearLines();
        if (linesCleared > 0) {
            this.soundManager.playLineClear(linesCleared);
        }
        this.updateScore(linesCleared);
        
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.createPiece();
        this.canHold = true;
        
        if (this.checkCollision(this.currentPiece)) {
            this.soundManager.playGameOver();
            this.endGame();
            return;
        }
        
        this.checkModeCompletion();
        this.drawNext();
        this.draw();
    }
    
    clearLines() {
        const linesToClear = [];
        
        for (let y = ROWS - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                linesToClear.push(y);
            }
        }
        
        if (linesToClear.length > 0) {
            this.clearingLines = linesToClear;
            this.clearAnimation = 10;
            
            for (const y of linesToClear) {
                this.board.splice(y, 1);
                this.board.unshift(Array(COLS).fill(0));
            }
        }
        
        return linesToClear.length;
    }
    
    updateScore(linesCleared) {
        if (linesCleared > 0) {
            this.lines += linesCleared;
            const points = [0, 100, 300, 500, 800][linesCleared] || 800;
            this.score += points;
            
            const prevLevel = Math.floor((this.lines - linesCleared) / 10);
            const newLevel = Math.floor(this.lines / 10);
            if (newLevel > prevLevel) {
                this.dropInterval = Math.max(100, 1000 - (newLevel * 50));
                this.soundManager.playLevelUp();
            }
            
            this.updateDisplay();
        }
    }
    
    checkModeCompletion() {
        if (this.gameMode === 'lines40' && this.lines >= 40) {
            this.endGame(true);
        } else if (this.gameMode === 'lines20' && this.lines >= 20) {
            this.endGame(true);
        }
    }
    
    updateDisplay() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lines').textContent = this.lines;
    }
    
    getGhostPosition() {
        const ghost = {
            ...this.currentPiece,
            shape: this.currentPiece.shape.map(row => [...row])
        };
        
        while (!this.checkCollision({ ...ghost, y: ghost.y + 1 })) {
            ghost.y++;
        }
        
        return ghost;
    }
    
    draw() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawBoard();
        this.drawGhost();
        this.drawPiece(this.currentPiece, this.ctx, 0, 0);
        this.drawGrid();
        
        if (this.clearAnimation > 0) {
            this.drawClearAnimation();
            this.clearAnimation--;
        }
    }
    
    drawBoard() {
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (this.board[y][x]) {
                    this.ctx.fillStyle = this.board[y][x];
                    this.ctx.fillRect(
                        x * BLOCK_SIZE + 1,
                        y * BLOCK_SIZE + 1,
                        BLOCK_SIZE - 2,
                        BLOCK_SIZE - 2
                    );
                    
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.fillRect(
                        x * BLOCK_SIZE + 1,
                        y * BLOCK_SIZE + 1,
                        BLOCK_SIZE - 2,
                        (BLOCK_SIZE - 2) / 3
                    );
                    
                    this.ctx.strokeStyle = '#000';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(
                        x * BLOCK_SIZE + 1,
                        y * BLOCK_SIZE + 1,
                        BLOCK_SIZE - 2,
                        BLOCK_SIZE - 2
                    );
                }
            }
        }
    }
    
    drawGhost() {
        const ghost = this.getGhostPosition();
        this.ctx.globalAlpha = 0.25;
        
        for (let y = 0; y < ghost.shape.length; y++) {
            for (let x = 0; x < ghost.shape[y].length; x++) {
                if (ghost.shape[y][x]) {
                    this.ctx.strokeStyle = ghost.color;
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(
                        (ghost.x + x) * BLOCK_SIZE + 2,
                        (ghost.y + y) * BLOCK_SIZE + 2,
                        BLOCK_SIZE - 4,
                        BLOCK_SIZE - 4
                    );
                }
            }
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    drawPiece(piece, context, offsetX, offsetY) {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const px = (piece.x + x + offsetX) * BLOCK_SIZE;
                    const py = (piece.y + y + offsetY) * BLOCK_SIZE;
                    
                    context.fillStyle = piece.color;
                    context.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                    
                    context.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    context.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, (BLOCK_SIZE - 2) / 3);
                    
                    context.strokeStyle = '#000';
                    context.lineWidth = 2;
                    context.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                }
            }
        }
    }
    
    drawClearAnimation() {
        for (const y of this.clearingLines) {
            const alpha = this.clearAnimation / 10;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            this.ctx.fillRect(0, y * BLOCK_SIZE, COLS * BLOCK_SIZE, BLOCK_SIZE);
        }
        
        if (this.clearAnimation === 0) {
            this.clearingLines = [];
        }
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x <= COLS; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * BLOCK_SIZE, 0);
            this.ctx.lineTo(x * BLOCK_SIZE, ROWS * BLOCK_SIZE);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= ROWS; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * BLOCK_SIZE);
            this.ctx.lineTo(COLS * BLOCK_SIZE, y * BLOCK_SIZE);
            this.ctx.stroke();
        }
    }
    
    drawNext() {
        this.nextCtx.fillStyle = '#1a1a2e';
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        if (this.nextPiece) {
            const offsetX = (this.nextCanvas.width / BLOCK_SIZE - this.nextPiece.shape[0].length) / 2;
            const offsetY = (this.nextCanvas.height / BLOCK_SIZE - this.nextPiece.shape.length) / 2;
            
            for (let y = 0; y < this.nextPiece.shape.length; y++) {
                for (let x = 0; x < this.nextPiece.shape[y].length; x++) {
                    if (this.nextPiece.shape[y][x]) {
                        const px = (x + offsetX) * BLOCK_SIZE;
                        const py = (y + offsetY) * BLOCK_SIZE;
                        
                        this.nextCtx.fillStyle = this.nextPiece.color;
                        this.nextCtx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                        
                        this.nextCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                        this.nextCtx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, (BLOCK_SIZE - 2) / 3);
                        
                        this.nextCtx.strokeStyle = '#000';
                        this.nextCtx.lineWidth = 2;
                        this.nextCtx.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                    }
                }
            }
        }
    }
    
    drawHold() {
        this.holdCtx.fillStyle = '#1a1a2e';
        this.holdCtx.fillRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        
        if (this.holdPiece) {
            const piece = TETROMINOES[this.holdPiece];
            const offsetX = (this.holdCanvas.width / BLOCK_SIZE - piece.shape[0].length) / 2;
            const offsetY = (this.holdCanvas.height / BLOCK_SIZE - piece.shape.length) / 2;
            
            for (let y = 0; y < piece.shape.length; y++) {
                for (let x = 0; x < piece.shape[y].length; x++) {
                    if (piece.shape[y][x]) {
                        const px = (x + offsetX) * BLOCK_SIZE;
                        const py = (y + offsetY) * BLOCK_SIZE;
                        
                        this.holdCtx.fillStyle = piece.color;
                        this.holdCtx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                        
                        this.holdCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                        this.holdCtx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, (BLOCK_SIZE - 2) / 3);
                        
                        this.holdCtx.strokeStyle = '#000';
                        this.holdCtx.lineWidth = 2;
                        this.holdCtx.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                    }
                }
            }
        }
    }
    
    gameLoop() {
        if (this.gameOver) return;
        
        const now = Date.now();
        if (now - this.lastDropTime > this.dropInterval && !this.isOnGround) {
            this.movePiece(0, 1);
            this.lastDropTime = now;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    endGame(completed = false) {
        this.gameOver = true;
        clearInterval(this.timerInterval);
        if (this.risingTimer) {
            clearInterval(this.risingTimer);
        }
        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
        }
        
        const finalStats = document.getElementById('finalStats');
        let message = completed ? '<div style="color: #00ff00; font-size: 1.5rem;">クリア！</div>' : '<div>ゲームオーバー</div>';
        message += `<div>スコア: ${this.score}</div>`;
        message += `<div>ライン: ${this.lines}</div>`;
        const minutes = Math.floor(this.elapsedTime / 60);
        const seconds = this.elapsedTime % 60;
        message += `<div>時間: ${minutes}:${seconds.toString().padStart(2, '0')}</div>`;
        
        finalStats.innerHTML = message;
        
        document.getElementById('gameOverModal').style.display = 'flex';
    }
}

let game = null;

document.addEventListener('DOMContentLoaded', () => {
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode) {
                startNewGame(mode);
            }
        });
    });
    
    document.getElementById('settingsBtn').addEventListener('click', () => {
        showSettings();
    });
    
    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('startScreen').style.display = 'flex';
    });
    
    document.getElementById('resetKeys').addEventListener('click', () => {
        game = game || new TetrisGame();
        game.keys = { ...DEFAULT_KEYS };
        game.saveKeys();
        updateKeyDisplay();
    });
    
    document.querySelectorAll('.change-key').forEach(btn => {
        btn.addEventListener('click', () => {
            changeKey(btn.dataset.action, btn);
        });
    });
    
    document.getElementById('restartBtn').addEventListener('click', () => {
        document.getElementById('gameOverModal').style.display = 'none';
        startNewGame(game.gameMode);
    });
    
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('gameOverModal').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('startScreen').style.display = 'flex';
    });
    
    updateKeyDisplay();
});

function startNewGame(mode) {
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';
    
    game = new TetrisGame();
    game.startGame(mode);
    game.drawNext();
    game.drawHold();
}

function showSettings() {
    game = game || new TetrisGame();
    updateKeyDisplay();
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('settingsModal').style.display = 'flex';
}

function updateKeyDisplay() {
    game = game || new TetrisGame();
    document.getElementById('keyLeft').value = getKeyDisplay(game.keys.moveLeft);
    document.getElementById('keyRight').value = getKeyDisplay(game.keys.moveRight);
    document.getElementById('keyDown').value = getKeyDisplay(game.keys.softDrop);
    document.getElementById('keyHardDrop').value = getKeyDisplay(game.keys.hardDrop);
    document.getElementById('keyRotate').value = getKeyDisplay(game.keys.rotate);
    document.getElementById('keyHold').value = getKeyDisplay(game.keys.hold);
    
    document.getElementById('ctrlLeft').textContent = getKeyDisplay(game.keys.moveLeft);
    document.getElementById('ctrlRight').textContent = getKeyDisplay(game.keys.moveRight);
    document.getElementById('ctrlDown').textContent = getKeyDisplay(game.keys.softDrop);
    document.getElementById('ctrlHardDrop').textContent = getKeyDisplay(game.keys.hardDrop);
    document.getElementById('ctrlRotate').textContent = getKeyDisplay(game.keys.rotate);
    document.getElementById('ctrlHold').textContent = getKeyDisplay(game.keys.hold);
}

function getKeyDisplay(key) {
    const keyMap = {
        'ArrowLeft': '←',
        'ArrowRight': '→',
        'ArrowUp': '↑',
        'ArrowDown': '↓',
        ' ': 'Space'
    };
    return keyMap[key] || key.toUpperCase();
}

function changeKey(action, button) {
    button.textContent = 'キーを押して...';
    button.disabled = true;
    
    const handleKeyPress = (e) => {
        e.preventDefault();
        game.keys[action] = e.key;
        game.saveKeys();
        updateKeyDisplay();
        button.textContent = '変更';
        button.disabled = false;
        document.removeEventListener('keydown', handleKeyPress);
    };
    
    document.addEventListener('keydown', handleKeyPress);
}
