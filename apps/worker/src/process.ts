// Runs ffmpeg and ffprobe for the worker's jobs, with a time limit and bounded output.
import { spawn } from 'node:child_process';

/** ffmpeg runs with `-v error`, so its stderr is short; keep the end of it for error messages. */
const STDERR_LIMIT = 2000;

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  timeoutMs: number;
  /** Receives stdout as it arrives instead of collecting it. `stop` kills the process. */
  onStdout?: (chunk: Buffer, stop: () => void) => void;
}

export function run(command: string, args: string[], { timeoutMs, onStdout }: RunOptions) {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => child.kill('SIGKILL');
    const stdout: Buffer[] = [];
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (onStdout) onStdout(chunk, stop);
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_LIMIT);
    });
    // e.g. ENOENT when ffmpeg isn't installed.
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: stderr.trim(), timedOut });
    });
  });
}
