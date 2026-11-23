// Makes the value of DEVELOPER_PASSWORD_HASH (D28) from a password, with the same argon2id
// settings as member PINs. The password is typed without echo (or piped on standard input) and is
// never written anywhere; only the hash is printed.
//   pnpm --dir apps/api developer:hash
import { hashPin } from '../src/modules/auth/pin';

const MIN_LENGTH = 12;
/** The developer login refuses longer passwords (packages/shared/src/contracts/developer.ts). */
const MAX_LENGTH = 256;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += String(chunk)));
      stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (key: string) => {
      for (const char of key) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') process.exit(130);
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const password = await readHidden('Developer password: ');
if (password.length < MIN_LENGTH) {
  process.stderr.write(`The password must have at least ${MIN_LENGTH} characters.\n`);
  process.exit(1);
}
if (password.length > MAX_LENGTH) {
  process.stderr.write(`The password must have at most ${MAX_LENGTH} characters.
`);
  process.exit(1);
}
const hash = await hashPin(password);
process.stdout.write(`DEVELOPER_PASSWORD_HASH='${hash}'\n`);
