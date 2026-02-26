const socket = io();

// State
let currentRoom = null;
let playerNumber = null;
let mySecret = null;
let gameStarted = false;
let eliminatedDigits = new Array(10).fill(false);

// DOM Elements - Landing
const landingPage = document.getElementById('landingPage');
const gamePage = document.getElementById('gamePage');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const landingError = document.getElementById('landingError');

// DOM Elements - Game
const roomInfo = document.getElementById('roomInfo');
const playerNumberSpan = document.getElementById('playerNumber');
const secretSetup = document.getElementById('secretSetup');
const secretBanner = document.getElementById('secretBanner');
const mySecretDisplay = document.getElementById('mySecretDisplay');
const gameArea = document.getElementById('gameArea');
const secretInput = document.getElementById('secretInput');
const setSecretBtn = document.getElementById('setSecretBtn');
const secretError = document.getElementById('secretError');
const turnIndicator = document.getElementById('turnIndicator');
const myGuesses = document.getElementById('myGuesses');
const opponentGuesses = document.getElementById('opponentGuesses');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const turnMessage = document.getElementById('turnMessage');
const gameError = document.getElementById('gameError');

// Digit eliminator
const digitGrid = document.getElementById('digitGrid');
const eliminatedCount = document.getElementById('eliminatedCount');
const resetEliminatorBtn = document.getElementById('resetEliminatorBtn');

// Initialize digit grid
function renderDigitGrid() {
    let html = '';
    for (let i = 0; i <= 9; i++) {
        const eliminatedClass = eliminatedDigits[i] ? 'eliminated' : '';
        html += `<div class="digit-btn ${eliminatedClass}" data-digit="${i}">${i}</div>`;
    }
    digitGrid.innerHTML = html;
    eliminatedCount.textContent = eliminatedDigits.filter(v => v).length;
}

// Validate number
function isValidProNumber(numStr) {
    if (!/^\d{3}$/.test(numStr)) return false;
    if (numStr[0] === '0') return false;
    return new Set(numStr.split('')).size === 3;
}

// Create room
createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
});

// Join room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (roomCode) {
        socket.emit('joinRoom', roomCode);
    } else {
        landingError.textContent = 'Please enter a room code';
    }
});

// Set secret
setSecretBtn.addEventListener('click', () => {
    const secret = secretInput.value.trim();
    if (!isValidProNumber(secret)) {
        secretError.textContent = 'Invalid: 3 digits, no leading zero, all unique';
        return;
    }
    mySecret = secret;
    socket.emit('setSecret', {
        roomCode: currentRoom,
        secret
    });
});

// Reset eliminator
resetEliminatorBtn.addEventListener('click', () => {
    eliminatedDigits = new Array(10).fill(false);
    renderDigitGrid();
});

// Digit eliminator click
digitGrid.addEventListener('click', (e) => {
    const target = e.target.closest('.digit-btn');
    if (!target || target.classList.contains('eliminated')) return;
    
    const digit = parseInt(target.dataset.digit, 10);
    eliminatedDigits[digit] = true;
    renderDigitGrid();
});

// Make guess
guessBtn.addEventListener('click', () => {
    const guess = guessInput.value.trim();
    if (!isValidProNumber(guess)) {
        gameError.textContent = 'Invalid guess';
        return;
    }
    
    socket.emit('makeGuess', {
        roomCode: currentRoom,
        guess
    });
    
    guessInput.value = '';
    guessInput.disabled = true;
    guessBtn.disabled = true;
    turnMessage.textContent = 'Waiting for result...';
});

// Enter key handlers
secretInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setSecretBtn.click();
});

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !guessBtn.disabled) guessBtn.click();
});

// Socket event handlers
socket.on('roomCreated', ({ roomCode, playerNumber: pNum }) => {
    currentRoom = roomCode;
    playerNumber = pNum;
    playerNumberSpan.textContent = pNum;
    roomInfo.textContent = `Room: ${roomCode}`;
    
    landingPage.style.display = 'none';
    gamePage.style.display = 'block';
    
    turnIndicator.textContent = 'Waiting for opponent to join...';
});

socket.on('roomJoined', ({ roomCode, playerNumber: pNum }) => {
    currentRoom = roomCode;
    playerNumber = pNum;
    playerNumberSpan.textContent = pNum;
    roomInfo.textContent = `Room: ${roomCode}`;
    
    landingPage.style.display = 'none';
    gamePage.style.display = 'block';
    
    turnIndicator.textContent = 'Opponent joined! Set your secret.';
});

socket.on('opponentJoined', () => {
    turnIndicator.textContent = 'Opponent joined! Set your secret.';
});

socket.on('secretSet', ({ playerNumber: pNum, secret }) => {
    if (pNum === playerNumber) {
        // Hide setup, show secret banner
        secretSetup.style.display = 'none';
        secretBanner.style.display = 'flex';
        mySecretDisplay.textContent = secret;
        gameArea.style.display = 'flex';
        gameArea.style.flexDirection = 'column';
        turnIndicator.textContent = 'Waiting for opponent to set secret...';
    }
});

socket.on('opponentSecretSet', () => {
    turnIndicator.textContent = 'Opponent set their secret! Waiting for game to start...';
});

socket.on('gameStart', ({ turn, message }) => {
    gameStarted = true;
    turnIndicator.textContent = message;
    updateTurnUI(turn);
});

socket.on('guessResult', ({ guesser, guess, feedback, playerNumber: pNum }) => {
    const isMyGuess = (playerNumber === pNum);
    const targetList = isMyGuess ? myGuesses : opponentGuesses;
    const guesserName = isMyGuess ? 'You' : 'Opponent';
    
    const guessRow = document.createElement('div');
    guessRow.className = 'guess-row';
    
    const guessNum = document.createElement('span');
    guessNum.className = 'guess-number';
    guessNum.textContent = guess;
    
    const guessFb = document.createElement('span');
    guessFb.className = 'guess-feedback';
    
    const fbHtml = feedback.split('').map(ch => {
        if (ch === 'T') return '<span class="feedback-t">T</span>';
        if (ch === 'V') return '<span class="feedback-v">V</span>';
        return '<span class="feedback-0">0</span>';
    }).join('');
    guessFb.innerHTML = fbHtml || '0';
    
    guessRow.appendChild(guessNum);
    guessRow.appendChild(guessFb);
    
    targetList.insertBefore(guessRow, targetList.firstChild);
    
    // Auto-scroll to top of history list
    targetList.scrollTop = 0;
    
    // Small animation/notification
    if (!isMyGuess) {
        turnIndicator.textContent = `Opponent guessed ${guess} → ${feedback}`;
    }
});

socket.on('turnChanged', ({ turn, message }) => {
    turnIndicator.textContent = message;
    updateTurnUI(turn);
});

socket.on('gameOver', ({ winner, message }) => {
    gameStarted = false;
    turnIndicator.textContent = `🎉 ${message} 🎉`;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    
    // Highlight the winner
    if (winner === `player${playerNumber}`) {
        turnIndicator.innerHTML = '🎉 YOU WIN! 🎉';
    }
});

socket.on('opponentDisconnected', () => {
    alert('Opponent disconnected. Game will reset.');
    location.reload();
});

socket.on('error', (message) => {
    landingError.textContent = message;
    gameError.textContent = message;
});

function updateTurnUI(turn) {
    const isMyTurn = turn === `player${playerNumber}`;
    guessInput.disabled = !isMyTurn;
    guessBtn.disabled = !isMyTurn;
    
    if (isMyTurn) {
        turnMessage.textContent = 'Your turn to guess!';
        guessInput.focus();
    } else {
        turnMessage.textContent = "Opponent's turn...";
    }
}

// Initialize
renderDigitGrid();