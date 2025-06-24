const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const wordsPool = ['kot', 'pies', 'samochód', 'dom', 'rower', 'telefon', 'komputer'];

const lobbies = {};

function getRandomWord() {
  return wordsPool[Math.floor(Math.random() * wordsPool.length)];
}

io.on('connection', (socket) => {
  socket.emit('yourId', socket.id);

  socket.on('createLobby', (playerName) => {
    const lobbyCode = uuidv4().slice(0, 6).toUpperCase();
    lobbies[lobbyCode] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName }],
      started: false,
      impostor: null,
      word: null,
      votes: {},
      chatQueueIndex: 0, // kto ma teraz pisać
      chatMessages: [],
      guessed: false,
    };
    socket.join(lobbyCode);
    socket.emit('lobbyCreated', lobbyCode);
    io.to(lobbyCode).emit('updatePlayers', {
      players: lobbies[lobbyCode].players,
      hostId: lobbies[lobbyCode].hostId,
    });
  });

  socket.on('joinLobby', ({ playerName, lobbyCode }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
      socket.emit('errorMsg', 'Lobby nie istnieje');
      return;
    }
    if (lobby.started) {
      socket.emit('errorMsg', 'Gra już się rozpoczęła');
      return;
    }
    lobby.players.push({ id: socket.id, name: playerName });
    socket.join(lobbyCode);
    io.to(lobbyCode).emit('joined', lobby.players);
    io.to(lobbyCode).emit('updatePlayers', {
      players: lobby.players,
      hostId: lobby.hostId,
    });
  });

  socket.on('startGame', (lobbyCode) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    if (socket.id !== lobby.hostId) return; // tylko host

    lobby.started = true;
    lobby.word = getRandomWord();
    lobby.impostor = lobby.players[Math.floor(Math.random() * lobby.players.length)];
    lobby.votes = {};
    lobby.chatQueueIndex = 0;
    lobby.chatMessages = [];
    lobby.guessed = false;

    lobby.players.forEach(player => {
      const isImpostor = player.id === lobby.impostor.id;
      io.to(player.id).emit('start', { word: lobby.word, isImpostor });
    });

    io.to(lobbyCode).emit('gameStarted');
    io.to(lobbyCode).emit('updatePlayers', {
      players: lobby.players,
      hostId: lobby.hostId,
    });
    io.to(lobbyCode).emit('chatMessages', lobby.chatMessages);

    // Poinformuj, kto teraz pisze
    io.to(lobbyCode).emit('chatTurn', lobby.players[lobby.chatQueueIndex].id);
  });

  // Obsługa wiadomości czatu
  socket.on('sendMessage', ({ lobbyCode, message }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby || !lobby.started) return;

    // Sprawdz kto ma turę
    if (socket.id !== lobby.players[lobby.chatQueueIndex].id) {
      socket.emit('errorMsg', 'Nie twoja tura na pisanie!');
      return;
    }

    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;

    // Sprawdź czy impostor próbuje zgadnąć hasło
    if (socket.id === lobby.impostor.id) {
      if (message.trim().toLowerCase() === lobby.word.toLowerCase()) {
        // Impostor wygrał
        lobby.guessed = true;
        io.to(lobbyCode).emit('result', `IMPOSTOR (${player.name}) odgadł hasło i wygrywa!`);
        lobby.started = false;
        return;
      } else if (message.trim() !== '') {
        // Błędne zgadnięcie = przegrana impostora
        lobby.guessed = true;
        io.to(lobbyCode).emit('result', `IMPOSTOR (${player.name}) podał błędne hasło i przegrywa! Gracze wygrywają.`);
        lobby.started = false;
        return;
      }
    }

    // Dodaj wiadomość do czatu
    lobby.chatMessages.push({ sender: player.name, message });
    io.to(lobbyCode).emit('chatMessages', lobby.chatMessages);

    // Przekaż turę następnemu graczowi
    lobby.chatQueueIndex++;
    if (lobby.chatQueueIndex >= lobby.players.length) lobby.chatQueueIndex = 0;

    io.to(lobbyCode).emit('chatTurn', lobby.players[lobby.chatQueueIndex].id);
  });

  // Skip tura - host może pominąć turę i dać kolejnemu pisać z tym samym słowem
  socket.on('skipTurn', (lobbyCode) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    if (socket.id !== lobby.hostId) return;

    lobby.chatQueueIndex++;
    if (lobby.chatQueueIndex >= lobby.players.length) lobby.chatQueueIndex = 0;

    io.to(lobbyCode).emit('chatTurn', lobby.players[lobby.chatQueueIndex].id);
  });

  socket.on('kickPlayer', ({ lobbyCode, playerId }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    if (socket.id !== lobby.hostId) return;

    lobby.players = lobby.players.filter(p => p.id !== playerId);
    io.sockets.sockets.get(playerId)?.leave(lobbyCode);
    io.to(playerId).emit('kicked');

    // Popraw indeks tury, jeśli ktoś z niej wypadł
    if (lobby.chatQueueIndex >= lobby.players.length) lobby.chatQueueIndex = 0;

    io.to(lobbyCode).emit('updatePlayers', {
      players: lobby.players,
      hostId: lobby.hostId,
    });

    io.to(lobbyCode).emit('chatMessages', lobby.chatMessages);

    io.to(lobbyCode).emit('chatTurn', lobby.players[lobby.chatQueueIndex]?.id);
  });

  socket.on('vote', ({ voted, lobbyCode }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    lobby.votes[socket.id] = voted;

    if (Object.keys(lobby.votes).length === lobby.players.length) {
      const votesCount = {};
      Object.values(lobby.votes).forEach(v => {
        votesCount[v] = (votesCount[v] || 0) + 1;
      });
      let maxVotes = 0;
      let votedOut = null;
      for (const player in votesCount) {
        if (votesCount[player] > maxVotes) {
          maxVotes = votesCount[player];
          votedOut = player;
        }
      }

      const impostor = lobby.impostor.name;
      let resultMsg = '';
      if (votedOut === impostor) {
        resultMsg = `Wyrzucono impostora (${impostor}). Gracze wygrywają!`;
      } else {
        resultMsg = `Wyrzucono ${votedOut}. Impostor wygrał, to był: ${impostor}.`;
      }

      io.to(lobbyCode).emit('result', resultMsg);
      lobby.started = false;
      lobby.votes = {};
      lobby.impostor = null;
      lobby.word = null;
    }
  });

  socket.on('disconnect', () => {
    for (const [code, lobby] of Object.entries(lobbies)) {
      const playerLeft = lobby.players.find(p => p.id === socket.id);
      if (!playerLeft) continue;

      lobby.players = lobby.players.filter(p => p.id !== socket.id);

      if (lobby.hostId === socket.id) {
        if (lobby.players.length > 0) {
          lobby.hostId = lobby.players[0].id;
        } else {
          delete lobbies[code];
          continue;
        }
      }

      if (lobby.chatQueueIndex >= lobby.players.length) lobby.chatQueueIndex = 0;

      io.to(code).emit('updatePlayers', {
        players: lobby.players,
        hostId: lobby.hostId,
      });

      io.to(code).emit('chatMessages', lobby.chatMessages);
      io.to(code).emit('chatTurn', lobby.players[lobby.chatQueueIndex]?.id);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
