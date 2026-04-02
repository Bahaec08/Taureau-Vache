// Home Page Navigation
const howToPlayBtn = document.getElementById('howToPlayBtn');
const playComputerBtn = document.getElementById('playComputerBtn');
const playFriendBtn = document.getElementById('playFriendBtn');
const playRandomBtn = document.getElementById('playRandomBtn');
const instructionsModal = document.getElementById('instructionsModal');
const closeInstructionsBtn = document.getElementById('closeInstructionsBtn');

// Show instructions modal
howToPlayBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'flex';
});

// Close instructions modal
closeInstructionsBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'none';
});

// Redirect to game page for computer play
playComputerBtn.addEventListener('click', () => {
    window.location.href = 'game.html?mode=computer';
});

// Redirect to game page for room-based play with friend
playFriendBtn.addEventListener('click', () => {
    window.location.href = 'game.html?mode=online&submode=friend';
});

// Redirect to game page for random matchmaking
playRandomBtn.addEventListener('click', () => {
    window.location.href = 'game.html?mode=online&submode=random';
});
