const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
require('dotenv').config()

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {};

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  
  // Add new user
  users[socket.id] = { id: socket.id, name: "Anonymous" };
  
  // Send user their ID
  socket.emit("yourID", socket.id);
  
  // Send updated user list to everyone
  io.emit("allUsers", users);

  // Handle name updates
  socket.on("updateName", (name) => {
    users[socket.id].name = name || "Anonymous";
    io.emit("allUsers", users);
  });

  // Handle calls
  socket.on("callUser", (data) => {
    io.to(data.userToCall).emit("hey", {
      signal: data.signalData,
      from: data.from,
      fromName: data.fromName
    });
  });

  // Handle call acceptance
  socket.on("acceptCall", (data) => {
    io.to(data.to).emit("callAccepted", data.signal);
  });

  // Handle call rejection
  socket.on("rejectCall", (data) => {
    io.to(data.to).emit("callRejected");
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete users[socket.id];
    io.emit("allUsers", users);
  });

  // Add this inside your socket connection handler
socket.on("updateName", (name) => {
  users[socket.id].name = name || "Anonymous";
  io.emit("allUsers", users);
});
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));