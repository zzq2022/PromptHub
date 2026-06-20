import { createApp } from './src/app.js';

async function run() {
  const app = createApp();

  console.log('Logging in as zzq...');
  const loginRes = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'zzq',
      password: 'qwer1234',
    }),
  });

  const loginBody = await loginRes.json() as any;
  if (!loginRes.ok) {
    console.error('Login failed:', loginBody);
    return;
  }

  const token = loginBody.data.accessToken;
  console.log('Login successful! Access token obtained.');

  console.log('Fetching pending skills for admin...');
  const skillsRes = await app.request('/api/admin/skills?page=1&pageSize=10&approvalStatus=pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const skillsBody = await skillsRes.json() as any;
  console.log('Status code:', skillsRes.status);
  console.log('Skills response:', JSON.stringify(skillsBody, null, 2));
}

run().catch(console.error);
