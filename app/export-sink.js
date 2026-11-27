/* Collects the MP4 while it is being made without keeping one giant buffer in memory.
 *
 * mp4-muxer writes to a StreamTarget: mostly in order, plus one small rewrite near the start when the file is closed
 * (the size of the media block). BlobSink keeps recent bytes in a short list, turns them into a Blob every few
 * megabytes (browsers can keep Blobs on disk instead of in memory) and applies that rewrite at the end.
 * A 1080p video of several minutes is hundreds of megabytes; this keeps the peak memory a small fraction of it.
 */
export class BlobSink {
  constructor({ flushBytes = 4 * 1024 * 1024, type = 'video/mp4' } = {}) {
    this.flushBytes = flushBytes;
    this.type = type;
    this.blobs = [];
    this.pending = [];
    this.pendingBytes = 0;
    this.end = 0; // bytes written so far
    this.patches = []; // rewrites of bytes that were already turned into a Blob
  }

  /** Same shape as StreamTarget's onData(data, position). */
  write(data, position) {
    const u = data instanceof Uint8Array ? data : new Uint8Array(data.buffer ? data.buffer : data, data.byteOffset || 0, data.byteLength);
    if (position === this.end) {
      this.pending.push(u.slice());
      this.pendingBytes += u.length;
      this.end += u.length;
      if (this.pendingBytes >= this.flushBytes) this.flush();
      return;
    }
    if (position > this.end) throw new Error('The muxer wrote past the end of the file (' + position + ' > ' + this.end + ').');
    if (position + u.length > this.end) throw new Error('The muxer rewrote bytes across the end of the file.');
    const flushedEnd = this.end - this.pendingBytes;
    if (position < flushedEnd) this.patches.push({ pos: position, data: u.slice() });
    // the part of the rewrite that is still in the pending list is changed in place
    const from = Math.max(position, flushedEnd);
    if (from < position + u.length) {
      let offset = flushedEnd;
      for (const chunk of this.pending) {
        const a = Math.max(from, offset);
        const b = Math.min(position + u.length, offset + chunk.length);
        if (a < b) chunk.set(u.subarray(a - position, b - position), a - offset);
        offset += chunk.length;
        if (offset >= position + u.length) break;
      }
    }
  }

  flush() {
    if (!this.pending.length) return;
    this.blobs.push(new Blob(this.pending, { type: this.type }));
    this.pending = [];
    this.pendingBytes = 0;
  }

  /** The finished file. */
  finish() {
    this.flush();
    let base = new Blob(this.blobs, { type: this.type });
    for (const p of this.patches) {
      base = new Blob([base.slice(0, p.pos), p.data, base.slice(p.pos + p.data.length)], { type: this.type });
    }
    this.blobs = [];
    this.patches = [];
    return base;
  }

  get size() {
    return this.end;
  }
}
