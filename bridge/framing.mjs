import os from 'node:os';

export const MAX_FRAME = 512 * 1024;
const readLength = buffer => os.endianness() === 'LE' ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);

export function encode(message) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > MAX_FRAME) throw new Error('Native message exceeds prototype limit.');
  const header = Buffer.alloc(4);
  if (os.endianness() === 'LE') header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

export function decoder(onMessage, onError) {
  let buffer = Buffer.alloc(0);
  let failed = false;
  return chunk => {
    if (failed) return;
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (buffer.length >= 4) {
        const size = readLength(buffer);
        if (!size || size > MAX_FRAME) throw new Error('Invalid native message length.');
        if (buffer.length < size + 4) return;
        const message = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
        buffer = buffer.subarray(size + 4);
        onMessage(message);
      }
    } catch (error) { failed = true; onError(error); }
  };
}
