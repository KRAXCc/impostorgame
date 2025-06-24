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
  // Powiedz klientowi jego socket.id
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

    lobby.players.forEach(player => {
      const isImpostor = player.id === lobby.impostor.id;
      io.to(player.id).emit('start', { word: lobby.word, isImpostor });
    });

    setTimeout(() => {
      io.to(lobbyCode).emit('voting', lobby.players.map(p => p.name));
    }, 30000);

    io.to(lobbyCode).emit('gameStarted');
  });

  socket.on('kickPlayer', ({ lobbyCode, playerId }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    if (socket.id !== lobby.hostId) return; // tylko host może wyrzucać

    lobby.players = lobby.players.filter(p => p.id !== playerId);

    io.sockets.sockets.get(playerId)?.leave(lobbyCode);
    io.to(playerId).emit('kicked');

    io.to(lobbyCode).emit('updatePlayers', {
      players: lobby.players,
      hostId: lobby.hostId,
    });
  });

  socket.on('vote', ({ voted, lobbyCode }) => {
    lobbyCode = lobbyCode.toUpperCase();
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    lobby.votes[socket.id] = voted;

    // Gdy wszyscy zagłosują, liczymy wyniki
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

      // Sprawdź czy wyrzucony jest impostorem
      const impostor = lobby.impostor.name;
      let resultMsg = '';
      if (votedOut === impostor) {
        resultMsg = `Wyrzucono impostora (${impostor}). Gracze wygrywają!`;
      } else {
        resultMsg = `Wyrzucono ${votedOut}. Impostor wygrał, to był: ${impostor}.`;
      }

      io.to(lobbyCode).emit('result', resultMsg);
      // reset lobby
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
      io.to(code).emit('updatePlayers', {
        players: lobby.players,
        hostId: lobby.hostId,
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
