const socket = io();
let myId = null;

function createLobby() {
  const name = document.getElementById("name").value;
  socket.emit("createLobby", name);
}

function joinLobby() {
  const name = document.getElementById("name").value;
  const lobbyCode = document.getElementById("lobbyCode").value.toUpperCase();
  socket.emit("joinLobby", { playerName: name, lobbyCode });
}

socket.on("lobbyCreated", (code) => {
  document.getElementById("codeDisplay").textContent = code;
  document.getElementById("login").style.display = "none";
  document.getElementById("lobbyArea").style.display = "block";
  document.getElementById("hostControls").style.display = "block";
});

socket.on("joined", (players) => {
  document.getElementById("login").style.display = "none";
  document.getElementById("lobbyArea").style.display = "block";
  updatePlayerList(players);
});

socket.on("playerList", updatePlayerList);

function updatePlayerList(players) {
  const list = document.getElementById("players");
  list.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.name;
    if (document.getElementById("hostControls").style.display === "block" && p.id !== socket.id) {
      const btn = document.createElement("button");
      btn.textContent = "Wyrzuć";
      btn.onclick = () => socket.emit("kick", p.id);
      li.appendChild(btn);
    }
    list.appendChild(li);
  });
}

function startGame() {
  const word = document.getElementById("wordInput").value;
  socket.emit("startGame", { word });
}

socket.on("start", ({ word, isImpostor }) => {
  document.getElementById("lobbyArea").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("roleInfo").textContent = isImpostor ? "Jesteś IMPOSTOREM" : "Hasło: " + word;
});

socket.on("yourTurn", (id) => {
  const inputArea = document.getElementById("chatInputArea");
  inputArea.style.display = id === socket.id ? "block" : "none";
});

function sendMessage() {
  const input = document.getElementById("chatInput");
  const msg = input.value;
  if (!msg) return;
  socket.emit("chatMessage", msg);
  input.value = "";
}

socket.on("chatMessage", ({ from, msg }) => {
  const area = document.getElementById("chatArea");
  area.innerHTML += `<p><strong>${from}:</strong> ${msg}</p>`;
});

socket.on("voting", (players) => {
  const area = document.getElementById("voteArea");
  area.innerHTML = "<h3>Głosuj:</h3>";
  players.forEach(p => {
    const btn = document.createElement("button");
    btn.textContent = p.name;
    btn.onclick = () => socket.emit("vote", p.id);
    area.appendChild(btn);
  });
  area.style.display = "block";
});

function skipVoting() {
  socket.emit("skipVoting");
}

socket.on("votingSkipped", () => {
  document.getElementById("voteArea").style.display = "none";
});

function guessWord() {
  const word = document.getElementById("guessInput").value;
  socket.emit("guessWord", word);
}

socket.on("result", (msg) => {
  document.getElementById("result").textContent = msg;
});
