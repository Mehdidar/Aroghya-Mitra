// npm run deploy:food            → upload the food model to a Hugging Face Space and connect the server to it
// npm run deploy:food -- --local → build and run the same container on this laptop (port 7860) to test it
//
// Needs in the repo-root .env (for the upload):
//   HF_TOKEN      a Hugging Face token with write access (https://huggingface.co/settings/tokens)
//   HF_SPACE      the Space to create or update, e.g. yourname/aroghya-food
// It creates DISHDETECT_API_KEY in .env if missing, stores the same key as the Space secret
// DISHDETECT_API_KEYS (the model refuses requests without it), writes DISHDETECT_URL, and copies
// both to the hosted server (npm run deploy:server -- --yes) so food scan works from phones.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ml = join(root, 'ml/food-classifier');
const envFile = join(root, '.env');
const local = process.argv.includes('--local');

function setEnv(key, value) {
  let text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(envFile, text);
  process.env[key] = value;
}

const { loadRootEnv } = await import(join(root, 'server/scripts/loadEnv.ts'));
loadRootEnv();
if (!process.env.DISHDETECT_API_KEY) setEnv('DISHDETECT_API_KEY', randomBytes(24).toString('hex'));
const key = process.env.DISHDETECT_API_KEY;

// 1. Stage the Space: Dockerfile + README + only what the service needs.
const stage = join(tmpdir(), `am-food-space-${Date.now()}`);
mkdirSync(stage, { recursive: true });
cpSync(join(ml, 'deploy/Dockerfile'), join(stage, 'Dockerfile'));
cpSync(join(ml, 'deploy/README.space.md'), join(stage, 'README.md'));
cpSync(join(ml, 'requirements-serve.txt'), join(stage, 'requirements-serve.txt'));
const skip = (src) => !/__pycache__|\.pyc$/.test(src);
for (const d of ['api', 'core', 'checkpoints']) cpSync(join(ml, d), join(stage, d), { recursive: true, dereference: true, filter: skip });
console.log(`Staged the Space in ${stage}`);

if (local) {
  console.log('Building the container (first build downloads torch and CLIP, ~5-10 minutes) …');
  const b = spawnSync('docker', ['build', '-t', 'aroghya-food-space', stage], { stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
  spawnSync('docker', ['rm', '-f', 'aroghya-food-space'], { stdio: 'ignore' });
  execFileSync('docker', ['run', '-d', '--name', 'aroghya-food-space', '-p', '7860:7860', '-e', `DISHDETECT_API_KEYS=${key}`, 'aroghya-food-space']);
  console.log('Running on http://localhost:7860 (docker rm -f aroghya-food-space to stop).');
  rmSync(stage, { recursive: true, force: true });
  process.exit(0);
}

// 2. Upload to Hugging Face with the Python client the food model's venv already has.
const space = process.env.HF_SPACE;
if (!process.env.HF_TOKEN || !space || !/^[\w.-]+\/[\w.-]+$/.test(space)) {
  console.error('Set HF_TOKEN and HF_SPACE (e.g. yourname/aroghya-food) in the repo-root .env first.');
  process.exit(1);
}
const py = existsSync('/Users/mehdidar/Desktop/food_classifier/.venv/bin/python') ? '/Users/mehdidar/Desktop/food_classifier/.venv/bin/python' : 'python3';
const upload = `
import os, sys
from huggingface_hub import HfApi
api = HfApi(token=os.environ['HF_TOKEN'])
space = os.environ['HF_SPACE']
api.create_repo(space, repo_type='space', space_sdk='docker', exist_ok=True, private=False)
api.add_space_secret(space, 'DISHDETECT_API_KEYS', os.environ['DISHDETECT_API_KEY'])
api.upload_folder(repo_id=space, repo_type='space', folder_path=sys.argv[1], commit_message='Deploy DishDetect from Aroghya Mitra')
print('uploaded')
`;
const r = spawnSync(py, ['-I', '-c', upload, stage], { stdio: 'inherit', env: { ...process.env } });
rmSync(stage, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status ?? 1);

// Space URL: https://<owner>-<name>.hf.space (dots and underscores become dashes, lower case).
const url = `https://${space.replace('/', '-').replace(/[._]/g, '-').toLowerCase()}.hf.space`;
setEnv('DISHDETECT_URL', url);
console.log(`\nSpace: https://huggingface.co/spaces/${space}\nModel URL: ${url}`);
console.log('The Space now builds (about 10 minutes the first time). Connecting the hosted server to it …');
const d = spawnSync('node', [join(root, 'scripts/deploy-server.mjs'), '--yes'], { stdio: 'inherit', env: { ...process.env } });
process.exit(d.status ?? 0);
