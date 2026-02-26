const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game rooms storage
const rooms = {};

// Helper function to generate room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to validate number (pro rules)
function isValidProNumber(numStr) {
    if (!/^\d{3}$/.test(numStr)) return false;
    if (numStr[0] === '0') return false;
    let digits = numStr.split('');
    return new Set(digits).size === 3;
}

// Feedback function (left to right, shows T and V only)
function evaluateFeedbackLeftToRight(secret, guess) {
    if (secret.length !== 3 || guess.length !== 3) return '';
    
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    
    let usedInSecret = [false, false, false];
    let feedback = [];
    
    // Step 1: Identify exact matches (T)
    for (let i = 0; i < 3; i++) {
        if (guessArr[i] === secretArr[i]) {
            feedback[i] = 'T';
            usedInSecret[i] = true;
        } else {
            feedback[i] = null;
        }
    }
    
    // Step 2: Check for wrong position (V)
    for (let i = 0; i < 3; i++) {
        if (feedback[i] !== null) continue;
        
        let found = false;
        for (let j = 0; j < 3; j++) {
            if (!usedInSecret[j] && guessArr[i] === secretArr[j]) {
                found = true;
                usedInSecret[j] = true;
                break;
            }
        }
        feedback[i] = found ? 'V' : '';
    }
    
    return feedback.join('');
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Create a new game room
    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            playerNumbers: {}, // maps socket.id to player number
            playerSecrets: {},
            guesses: {
                player1: [], // guesses made BY player1
                player2: []  // guesses made BY player2
            },
            currentTurn: null,
            gameStarted: false,
            playerReady: {}
        };
        
        socket.join(roomCode);
        rooms[roomCode].playerNumbers[socket.id] = 1;
        socket.emit('roomCreated', { roomCode, playerNumber: 1 });
        console.log(`Room created: ${roomCode} by ${socket.id}`);
    });

    // Join an existing room
    socket.on('joinRoom', (roomCode) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.players.length >= 2) {
            socket.emit('error', 'Room is full');
            return;
        }
        
        room.players.push(socket.id);
        room.playerNumbers[socket.id] = 2;
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerNumber: 2 });
        
        // Notify player 1 that player 2 joined
        io.to(room.players[0]).emit('opponentJoined');
        
        console.log(`Player 2 joined room: ${roomCode}`);
    });

    // Set player's secret number
    socket.on('setSecret', ({ roomCode, secret }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        if (!isValidProNumber(secret)) {
            socket.emit('error', 'Invalid secret number');
            return;
        }
        
        const playerNumber = room.playerNumbers[socket.id];
        const playerKey = `player${playerNumber}`;
        room.playerSecrets[playerKey] = secret;
        room.playerReady[playerKey] = true;
        
        // Send the secret back to the player to display
        socket.emit('secretSet', { playerNumber, secret });
        
        // Notify opponent that secret is set
        socket.to(roomCode).emit('opponentSecretSet');
        
        // Check if both players are ready
        if (room.playerReady.player1 && room.playerReady.player2) {
            room.gameStarted = true;
            room.currentTurn = 'player1'; // Player 1 starts
            
            io.to(roomCode).emit('gameStart', {
                turn: room.currentTurn,
                message: 'Game started! Player 1 goes first'
            });
        }
    });

    // Player makes a guess
    socket.on('makeGuess', ({ roomCode, guess }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameStarted) return;
        
        const playerNumber = room.playerNumbers[socket.id];
        const currentPlayer = `player${playerNumber}`;
        
        if (room.currentTurn !== currentPlayer) {
            socket.emit('error', 'Not your turn');
            return;
        }
        
        if (!isValidProNumber(guess)) {
            socket.emit('error', 'Invalid guess');
            return;
        }
        
        // Determine opponent's secret
        const opponentNumber = playerNumber === 1 ? 2 : 1;
        const opponentSecret = room.playerSecrets[`player${opponentNumber}`];
        
        if (!opponentSecret) {
            socket.emit('error', 'Opponent secret not set');
            return;
        }
        
        // Server generates the feedback
        const feedback = evaluateFeedbackLeftToRight(opponentSecret, guess);
        
        // Store the guess
        const guessEntry = {
            player: currentPlayer,
            guess: guess,
            feedback: feedback,
            timestamp: Date.now()
        };
        
        room.guesses[currentPlayer].push(guessEntry);
        
        // Broadcast the guess result to both players
        io.to(roomCode).emit('guessResult', {
            guesser: currentPlayer,
            guess: guess,
            feedback: feedback,
            playerNumber: playerNumber
        });
        
        // Check win condition
        if (feedback === 'TTT') {
            io.to(roomCode).emit('gameOver', {
                winner: currentPlayer,
                message: `Player ${playerNumber} wins!`
            });
            room.gameStarted = false;
            return;
        }
        
        // Switch turn
        room.currentTurn = currentPlayer === 'player1' ? 'player2' : 'player1';
        io.to(roomCode).emit('turnChanged', {
            turn: room.currentTurn,
            message: `Player ${room.currentTurn === 'player1' ? '1' : '2'}'s turn to guess`
        });
    });

    // Player leaves or disconnects
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Find and clean up rooms
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.indexOf(socket.id);
            
            if (playerIndex !== -1) {
                // Notify other player
                const otherPlayerId = room.players[1 - playerIndex];
                if (otherPlayerId) {
                    io.to(otherPlayerId).emit('opponentDisconnected');
                }
                
                // Delete the room
                delete rooms[roomCode];
                console.log(`Room ${roomCode} deleted due to player disconnect`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});