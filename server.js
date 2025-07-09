// server.js - Servidor multiplayer do Fedaputinha

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const games = {}; // { roomId: { players: [], deck: [], estado do jogo... } }

function createDeck() {
  const suits = ["paus", "copas", "espadas", "ouros"];
  const values = ["A", "2", "3", "4", "5", "6", "7", "J", "Q", "K"];
  let deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getCardKey(card) {
  return `${card.value}-${card.suit}`;
}

const cardStrength = {
  "4-paus": 17, "7-copas": 16, "A-espadas": 15, "7-ouros": 14,
  "3": 13, "2": 12, "A": 11, "K": 10, "Q": 9, "J": 8,
  "7": 7, "6": 6, "5": 5, "4": 4
};

io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  socket.on("join", ({ roomId, name }) => {
    if (!games[roomId]) {
      games[roomId] = { players: [], deck: [], trick: [], state: "waiting", turn: 0 };
    }
    const game = games[roomId];
    if (game.players.length >= 5) return socket.emit("full");

    game.players.push({ id: socket.id, name, cards: [], bet: null, wins: 0, points: 0 });
    socket.join(roomId);
    io.to(roomId).emit("updatePlayers", game.players);
  });

  socket.on("start", (roomId) => {
    const game = games[roomId];
    if (!game) return;
    game.deck = createDeck();
    game.players.forEach(p => {
      p.cards = [game.deck.pop()];
      p.bet = null;
      p.wins = 0;
    });
    game.state = "betting";
    game.turn = 0;
    io.to(roomId).emit("startBetting", game.players);
  });

  socket.on("bet", ({ roomId, playerId, bet }) => {
    const game = games[roomId];
    const player = game.players.find(p => p.id === playerId);
    if (player) player.bet = bet;
    io.to(roomId).emit("updatePlayers", game.players);

    const allBetsIn = game.players.every(p => p.bet !== null);
    if (allBetsIn) {
      game.state = "playing";
      game.trick = [];
      game.turn = 0;
      io.to(roomId).emit("startPlaying", game.players[game.turn].id);
    }
  });

  socket.on("play", ({ roomId, playerId, card }) => {
    const game = games[roomId];
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;
    player.cards = player.cards.filter(c => !(c.value === card.value && c.suit === card.suit));
    game.trick.push({ playerId, card });
    io.to(roomId).emit("cardPlayed", { playerId, card });

    if (game.trick.length === game.players.length) {
      let winner = determineTrickWinner(game.trick);
      let winnerPlayer = game.players.find(p => p.id === winner);
      winnerPlayer.wins++;
      io.to(roomId).emit("trickResult", { winner, trick: game.trick });

      // Rodada acabou
      game.players.forEach(p => {
        let diff = Math.abs(p.bet - p.wins);
        if (p.bet === 0 && p.wins > 0) diff = p.wins;
        p.points += diff;
        p.cards = [];
        p.bet = null;
        p.wins = 0;
      });
      setTimeout(() => {
        io.to(roomId).emit("roundEnd", game.players);
      }, 2000);
    } else {
      game.turn = (game.turn + 1) % game.players.length;
      io.to(roomId).emit("startPlaying", game.players[game.turn].id);
    }
  });

  socket.on("chat", ({ roomId, name, message }) => {
    io.to(roomId).emit("chat", { name, message });
  });

  socket.on("disconnect", () => {
    for (let roomId in games) {
      const game = games[roomId];
      game.players = game.players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("updatePlayers", game.players);
    }
  });
});

function determineTrickWinner(trick) {
  let max = -1;
  let winner = null;
  for (let t of trick) {
    const key = `${t.card.value}-${t.card.suit}`;
    const keySimple = t.card.value;
    const strength = cardStrength[key] || cardStrength[keySimple] || 0;
    if (strength > max) {
      max = strength;
      winner = t.playerId;
    }
  }
  return winner;
}

server.listen(3000, () => console.log("Servidor rodando na porta 3000"));


