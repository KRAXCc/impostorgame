const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { v4: uuidv4 } = require('uuid');
const io = require('socket.io')(http);

const PORT = 3000;

app.use(express.static('public')); // *WAŻNE* - to musi być dokładnie 'public'

let lobbies = {};

function getRandomWord() {
  const words = ['kot', 'pies', 'dom', 'samochód', 'drzewo'];
  return words[Math.floor(Math.random() * words.length)];
}

io.on('connection', (socket) => {
  socket.on('createLobby', (playerName) => {
    const lobbyCode = uuidv4().slice(0, 6);
    lobbies[lobbyCode] = {
      players: [{ id: socket.id, name: playerName }],
      started: false,
      impostor: null,
      word: null,
      votes: {},
    };
    socket.join(lobbyCode);
    socket.emit('lobbyCreated', lobbyCode);
  });

  socket.on('joinLobby', ({ playerName, lobbyCode }) => {
    if (!lobbies[lobbyCode]) {
      socket.emit('errorMsg', 'Lobby nie istnieje');
      return;
    }
    if (lobbies[lobbyCode].started) {
      socket.emit('errorMsg', 'Gra już się rozpoczęła');
      return;
    }
    lobbies[lobbyCode].players.push({ id: socket.id, name: playerName });
    socket.join(lobbyCode);
    io.to(lobbyCode).emit('joined', lobbies[lobbyCode].players.map(p => p.name));
  });

  socket.on('startGame', (lobbyCode) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    lobby.started = true;
    lobby.word = getRandomWord();
    lobby.impostor = lobby.players[Math.floor(Math.random() * lobby.players.length)];

    lobby.players.forEach(player => {
      const isImpostor = player.id === lobby.impostor.id;
      io.to(player.id).emit('start', { word: lobby.word, isImpostor });
    });

    setTimeout(() => {
      io.to(lobbyCode).emit('voting', lobby.players.map(p => p.name));
    }, 30000); // 30 sekund na rundę, potem głosowanie
  });

  socket.on('vote', ({ voted, lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    lobby.votes[socket.id] = voted;

    // Sprawdź czy wszyscy zagłosowali
    if (Object.keys(lobby.votes).length === lobby.players.length) {
      // policz głosy
      const counts = {};
      Object.values(lobby.votes).forEach(name => {
        counts[name] = (counts[name] || 0) + 1;
      });

      // znajdź kogo wybrali
      let maxVotes = 0;
      let votedOut = null;
      for (const [name, count] of Object.entries(counts)) {
        if (count > maxVotes) {
          maxVotes = count;
          votedOut = name;
        }
      }

      // sprawdź czy impostor wyleciał
      const impostorName = lobby.impostor.name;
      let msg = '';
      if (votedOut === impostorName) {
        msg = `Wygraliście! Impostor ${impostorName} został wyrzucony.`;
      } else {
        msg = `Przegraliście! ${votedOut} został wybrany, ale impostor to ${impostorName}.`;
      }

      io.to(lobbyCode).emit('result', msg);
      // reset gry (dla prostoty)
      delete lobbies[lobbyCode];
    }
  });

  socket.on('disconnect', () => {
    for (const [code, lobby] of Object.entries(lobbies)) {
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      if (lobby.players.length === 0) {
        delete lobbies[code];
      } else {
        io.to(code).emit('joined', lobby.players.map(p => p.name));
      }
    }
  });
});

http.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
