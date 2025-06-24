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
    div.textContent = player.name + (player.id === hostId ? ' (host)' : '');
    if (isHost && player.id !== hostId) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Wyrzuć';
      kickBtn.className = 'kick';
      kickBtn.onclick = () => {
        socket.emit('kickPlayer', { lobbyCode, playerId: player.id });
      };
      div.appendChild(kickBtn);
    }
    list.appendChild(div);
  });
});

socket.on('start', ({ word, isImpostor }) => {
  document.getElementById('gameStatus').innerText = 'Gra rozpoczęta!';
  document.getElementById('wordDisplay').innerText = isImpostor ? `Jesteś IMPOSTOREM, zgadnij słowo!` : `Twoje słowo: ${word}`;
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('result').innerText = '';
});

socket.on('gameStarted', () => {
  document.getElementById('gameStatus').innerText = 'Gra w toku...';
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('result').innerText = '';
});

socket.on('voting', (playerNames) => {
  document.getElementById('gameStatus').innerText = 'Głosowanie!';
  const voteButtons = document.getElementById('voteButtons');
  voteButtons.innerHTML = '';
  playerNames.forEach(name => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = () => {
      socket.emit('vote', { voted: name, lobbyCode });
      document.getElementById('voteSection').style.display = 'none';
      document.getElementById('gameStatus').innerText = 'Czekamy na wyniki...';
    };
    voteButtons.appendChild(btn);
  });
  document.getElementById('voteSection').style.display = 'block';
});

socket.on('result', (msg) => {
  document.getElementById('result').innerText = msg;
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('gameStatus').innerText = 'Gra zakończona.';
});

socket.on('kicked', () => {
  alert('Zostałeś wyrzucony z lobby!');
  location.reload();
});
