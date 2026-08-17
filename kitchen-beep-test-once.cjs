/**
 * One-shot kitchen printer beep test. Not part of the order/print pipeline.
 * Sends only ESC B 03 02 (1B 42 03 02) to 192.168.1.181:9100.
 * No ticket, no cut, no ESC p, no timer.
 */
'use strict';

const net = require('net');

const IP = '192.168.1.181';
const PORT = 9100;
const BEEP = Buffer.from([0x1B, 0x42, 0x03, 0x02]);

const socket = new net.Socket();
socket.setTimeout(8000);

socket.connect(PORT, IP, () => {
  console.log(`connected ${IP}:${PORT}`);
  socket.write(BEEP, (err) => {
    if (err) {
      console.error('write failed', err.message);
      socket.destroy();
      process.exit(1);
    }
    socket.end(() => {
      console.log('sent ESC B 03 02 (1B 42 03 02), closed');
      process.exit(0);
    });
  });
});

socket.on('timeout', () => {
  console.error(`timeout ${IP}:${PORT}`);
  socket.destroy();
  process.exit(1);
});

socket.on('error', (err) => {
  console.error(`error ${IP}:${PORT}`, err.message);
  process.exit(1);
});
