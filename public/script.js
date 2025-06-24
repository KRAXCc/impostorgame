const socket = io();
let playerName = '';
let lobbyCode = '';

function createLobby() {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) return alert('Podaj imię');
  socket.emit('createLobby', playerName);
}

function joinLobby() {
  playerName = document.getElementById('playerName').value.trim();
  lobbyCode = document.getElementById('lobbyCode').value.trim();
  if (!playerName || !lobbyCode) return alert('Wpisz imię i kod lobby');
  socket.emit('joinLobby', { playerName, lobbyCode });
}

socket.on('lobbyCreated', (code) => {
  lobbyCode = code;
  document.getElementById('lobby').innerHTML = `<p>Lobby utworzone. Kod: <strong>${code}</strong><br>Czekamy na graczy...</p>`;
});

socket.on('joined', (players) => {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('gameArea').style.display = 'block';
  document.getElementById('gameStatus').innerText = 'Czekamy na rozpoczęcie gry...';
});

socket.on('start', ({ word, isImpostor }) => {
  document.getElementById('wordDisplay').innerText = isImpostor
    ? 'Jesteś IMPOSTOREM. Udawaj, że znasz hasło.'
    : `Twoje hasło to: ${word}`;
  document.getElementById('gameStatus').innerText = 'Runda się rozpoczęła';
});

socket.on('voting', (players) => {
  document.getElementById('voteSection').style.display = 'block';
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  players.forEach((p) => {
    const btn = document.createElement('button');
    btn.innerText = p;
    btn.onclick = () => socket.emit('vote', { voted: p, lobbyCode });
    list.appendChild(btn);
  });
});

socket.on('result', (msg) => {
  document.getElementById('result').style.display = 'block';
  document.getElementById('result').innerText = msg;
});
