const socket = io();

let currentLobby = null;
let isHost = false;
let playerId = null;
let currentTurnId = null;

socket.on('yourId', (id) => {
  playerId = id;
});

function createLobby() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) return alert('Wpisz swoje imię!');
  socket.emit('createLobby', name);
}

function joinLobby() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('lobbyCode').value.trim().toUpperCase();
  if (!name || !code) return alert('Wpisz imię i kod lobby!');
  socket.emit('joinLobby', { playerName: name, lobbyCode: code });
}

socket.on('errorMsg', (msg) => {
  document.getElementById('error').innerText = msg;
});

socket.on('lobbyCreated', (code) => {
  currentLobby = code;
  isHost = true;
  document.getElementById('lobbyInfo').innerText = `Stworzyłeś lobby: ${code}`;
  document.getElementById('code').innerText = code;
  document.getElementById('lobbyUI').style.display = 'block';
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('hostControls').style.display = 'block';
  updatePlayers([]);
});

socket.on('joined', (players) => {
  currentLobby = document.getElementById('lobbyCode').value.trim().toUpperCase();
  isHost = false;
  document.getElementById('lobbyInfo').innerText = `Dołączyłeś do lobby: ${currentLobby}`;
  document.getElementById('lobbyUI').style.display = 'block';
  document.getElementById('lobby').style.display = 'none';
  updatePlayers(players);
  document.getElementById('hostControls').style.display = 'none';
});

socket.on('updatePlayers', ({ players, hostId }) => {
  currentLobby = currentLobby || document.getElementById('lobbyCode').value.trim().toUpperCase();
  isHost = (playerId === hostId);
  document.getElementById('hostControls').style.display = isHost ? 'block' : 'none';
  updatePlayers(players, hostId);
});

function updatePlayers(players, hostId) {
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  players.forEach(player => {
    const div = document.createElement('div');
    div.textContent = player.name + (player.id === hostId ? ' (Host)' : '');
    if (isHost && player.id !== hostId) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Wyrzuć';
      kickBtn.className = 'kick';
      kickBtn.onclick = () => {
        socket.emit('kickPlayer', { lobbyCode: currentLobby, playerId: player.id });
      };
      div.appendChild(kickBtn);
    }
    list.appendChild(div);
  });
}

function startGame() {
  socket.emit('startGame', currentLobby);
}

socket.on('start', ({ word, isImpostor }) => {
  document.getElementById('gameStatus').innerText = 'Gra rozpoczęta!';
  document.getElementById('wordDisplay').innerText = isImpostor ? `Jesteś IMPOSTOREM, zgadnij słowo!` : `Twoje słowo: ${word}`;
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('result').innerText = '';
  clearChat();
});

socket.on('gameStarted', () => {
  document.getElementById('gameStatus').innerText = 'Gra w toku...';
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('result').innerText = '';
});

socket.on('chatMessages', (messages) => {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  messages.forEach(({ sender, message }) => {
    const p = document.createElement('p');
    p.textContent = `${sender}: ${message}`;
    chat.appendChild(p);
  });
  chat.scrollTop = chat.scrollHeight;
});

socket.on('chatTurn', (id) => {
  currentTurnId = id;
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (playerId === id) {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.placeholder = 'Twoja tura, pisz...';
  } else {
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = 'Czekaj na swoją turę...';
  }
});

function sendMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('sendMessage', { lobbyCode: currentLobby, message: msg });
  input.value = '';
}

function skipTurn() {
  socket.emit('skipTurn', currentLobby);
}

socket.on('result', (msg) => {
  document.getElementById('result').innerText = msg;
  document.getElementById('chatInput').disabled = true;
  document.getElementById('chatSendBtn').disabled = true;
  document.getElementById('voteSection').style.display = 'none';
  document.getElementById('gameStatus').innerText = 'Gra zakończona.';
});

socket.on('kicked', () => {
  alert('Zostałeś wyrzucony z lobby!');
  location.reload();
});

// Głosowanie na impostora (po zakończeniu rozmowy/czatu albo możesz dorzucić osobny przycisk)
socket.on('voting', (playerNames) => {
  document.getElementById('gameStatus').innerText = 'Głosowanie!';
  const voteButtons = document.getElementById('voteButtons');
  voteButtons.innerHTML = '';
  playerNames.forEach(name => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = () => {
      socket.emit('vote', { voted: name, lobbyCode: currentLobby });
      document.getElementById('voteSection').style.display = 'none';
      document.getElementById('gameStatus').innerText = 'Czekamy na wyniki...';
    };
    voteButtons.appendChild(btn);
  });
  document.getElementById('voteSection').style.display = 'block';
});

function clearChat() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
}
