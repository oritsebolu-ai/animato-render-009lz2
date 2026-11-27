// Reads the job, refuses anything over the limits, prints the part numbers for the build matrix.
import fs from 'node:fs';
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));   // meta.json: only { seconds, parts }, nothing private
const secs = Number(job.seconds) || 0;
if (!(secs > 0) || secs > 1800 + 5) { console.error('This video is longer than the limit of 1800 seconds.'); process.exit(1); }
const parts = Math.max(1, Math.min(99, Number(job.parts) || 1));
const list = Array.from({ length: parts }, (_, i) => i);
fs.appendFileSync(process.env.GITHUB_OUTPUT || '/dev/stdout', 'parts=' + JSON.stringify(list) + '\n');
console.log('parts', list.length, 'seconds', secs);
