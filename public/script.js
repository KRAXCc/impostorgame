const socket = io();

let playerName = '';
let lobbyCode = '';
let mySocketId = '';
let isHost = false;

document.getElementById('startGameBtn').addEventListener('click', () => {
  if (!lobbyCode) return;
  socket.emit('startGame', lobbyCode);
});

function createLobby() {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) return alert('Podaj imię!');
  socket.emit('createLobby', playerName);
}

function joinLobby() {
  playerName = document.getElementById('playerName').value.trim();
  lobbyCode = document.getElementById('lobbyCode').value.trim().toUpperCase();
  if (!playerName || !lobbyCode) return alert('Wpisz imię i kod lobby');
  socket.emit('joinLobby', { playerName, lobbyCode });
}

socket.on('yourId', (id) => {
  mySocketId = id;
});

socket.on('errorMsg', (msg) => {
  document.getElementById('error').innerText = msg;
});

socket.on('lobbyCreated', (code) => {
  lobbyCode = code;
  document.getElementById('lobby').innerHTML = `<p>Lobby utworzone. Kod: <strong>${code}</strong><br>Czekamy na graczy...</p>`;
});

socket.on('joined', (players) => {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('gameArea').style.display = 'block';
  document.getElementById('gameStatus').innerText = 'Czekamy na rozpoczęcie gry...';
});

socket.on('updatePlayers', ({ players, hostId }) => {
  const list = document.getElementById('playersList');
  list.innerHTML = '<h3>Gracze:</h3>';
  isHost = (mySocketId === hostId);
  document.getElementById('hostControls').style.display = isHost ? 'block' : 'none';

  players.forEach(player => {
    const div = document.createElement('div');
    div.textContent = player.name + (player.id === hostId ? ' (host)'
