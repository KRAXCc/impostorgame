
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = 3000;

app.use(express.static("public"));

let lobbies = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  let currentLobby = null;
  let playerName = "";

  socket.on("createLobby", (name) => {
    const code = generateCode();
    lobbies[code] = {
      host: socket.id,
      players: {},
      chatQueue: [],
      word: "",
      impostor: "",
      phase: "waiting"
    };
    currentLobby = code;
    playerName = name;
    lobbies[code].players[socket.id] = { name, voted: false, skipped: false };
    socket.join(code);
    socket.emit("lobbyCreated", code);
  });

  socket.on("joinLobby", ({ playerName: name, lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    playerName = name;
    currentLobby = lobbyCode;
    lobby.players[socket.id] = { name, voted: false, skipped: false };
    socket.join(lobbyCode);
    io.to(lobbyCode).emit("playerList", getPlayerList(lobby));
    socket.emit("joined", getPlayerList(lobby));
  });

  socket.on("startGame", ({ word }) => {
    const lobby = lobbies[currentLobby];
    if (!lobby || socket.id !== lobby.host) return;
    const playerIds = Object.keys(lobby.players);
    const impostorId = playerIds[Math.floor(Math.random() * playerIds.length)];
    lobby.word = word;
    lobby.impostor = impostorId;
    lobby.chatQueue = [...playerIds];
    lobby.phase = "chat";

    for (const id of playerIds) {
      const isImpostor = id === impostorId;
      io.to(id).emit("start", { word: isImpostor ? null : word, isImpostor });
    }
    nextSpeaker(lobbyCode);
  });

  socket.on("chatMessage", (msg) => {
    const lobby = lobbies[currentLobby];
    if (!lobby || lobby.phase !== "chat") return;
    if (lobby.chatQueue[0] !== socket.id) return;

    io.to(currentLobby).emit("chatMessage", { from: playerName, msg });
    lobby.chatQueue.shift();

    if (lobby.chatQueue.length === 0) {
      lobby.phase = "voting";
      io.to(currentLobby).emit("voting", getPlayerList(lobby));
    } else {
      nextSpeaker(currentLobby);
    }
  });

  socket.on("vote", (votedId) => {
    const lobby = lobbies[currentLobby];
    if (!lobby || lobby.phase !== "voting") return;
    lobby.players[socket.id].voted = votedId;

    if (Object.values(lobby.players).every(p => p.voted !== false)) {
      const votes = {};
      for (const p of Object.values(lobby.players)) {
        votes[p.voted] = (votes[p.voted] || 0) + 1;
      }
      const votedOut = Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b);
      const impostorId = lobby.impostor;
      const result = votedOut === impostorId ? "Impostor został wyrzucony! Gracze wygrywają!" : "Gracze wyrzucili niewinnego! Impostor wygrywa!";
      io.to(currentLobby).emit("result", result);
      delete lobbies[currentLobby];
    }
  });

  socket.on("skipVoting", () => {
    const lobby = lobbies[currentLobby];
    if (!lobby) return;
    lobby.phase = "chat";
    lobby.chatQueue = Object.keys(lobby.players);
    for (const p of Object.values(lobby.players)) {
      p.voted = false;
    }
    io.to(currentLobby).emit("votingSkipped");
    nextSpeaker(currentLobby);
  });

  socket.on("guessWord", (word) => {
    const lobby = lobbies[currentLobby];
    if (!lobby || socket.id !== lobby.impostor) return;
    if (word.toLowerCase() === lobby.word.toLowerCase()) {
      io.to(currentLobby).emit("result", "Impostor odgadł hasło! Impostor wygrywa!");
    } else {
      io.to(currentLobby).emit("result", "Impostor nie trafił! Gracze wygrywają!");
    }
    delete lobbies[currentLobby];
  });

  socket.on("kick", (id) => {
    const lobby = lobbies[currentLobby];
    if (!lobby || socket.id !== lobby.host) return;
    delete lobby.players[id];
    io.to(id).emit("kicked");
    io.to(currentLobby).emit("playerList", getPlayerList(lobby));
  });

  socket.on("disconnect", () => {
    const lobby = lobbies[currentLobby];
    if (lobby) {
      delete lobby.players[socket.id];
      if (Object.keys(lobby.players).length === 0) {
        delete lobbies[currentLobby];
      } else {
        io.to(currentLobby).emit("playerList", getPlayerList(lobby));
      }
    }
  });
});

function getPlayerList(lobby) {
  return Object.entries(lobby.players).map(([id, data]) => ({ id, name: data.name }));
}

function nextSpeaker(code) {
  const lobby = lobbies[code];
  const nextId = lobby.chatQueue[0];
  io.to(code).emit("yourTurn", nextId);
}

http.listen(PORT, () => console.log("Server running on port", PORT));
