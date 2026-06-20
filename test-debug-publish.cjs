/**
 * Debug: trace publish→pending→admin-pending pipeline.
 * Requires web server running on localhost:3000.
 */
const BASE = 'http://localhost:3000';

async function j(r) { try { return await r.json(); } catch { return null; } }

async function main() {
  // Health
  try {
    const h = await fetch(`${BASE}/health`);
    console.log('Health:', h.status, await h.text());
  } catch (e) { console.error('Cannot reach server:', e.message); process.exit(1); }

  // Login zzq02
  console.log('\n=== Login zzq02 ===');
  const lr = await fetch(`${BASE}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'zzq02',password:'test123456'}) });
  console.log('Login:', lr.status);
  const ld = await j(lr);
  if (!ld?.data?.accessToken) { console.log('Failed:', JSON.stringify(ld)); return; }
  const T = ld.data.accessToken;
  const H = { Authorization: `Bearer ${T}` };

  // List private
  console.log('\n=== Private skills ===');
  const pr = await fetch(`${BASE}/api/skillhub/private`, { headers: H });
  console.log('Status:', pr.status);
  const pd = await j(pr);
  const skills = pd?.data ?? [];
  console.log('Count:', skills.length);
  skills.forEach(s => console.log(`  - ${s.name} id=${s.id} vis=${s.visibility}`));

  if (skills.length === 0) {
    console.log('\n  => No private skills! Trying scope=all...');
    const ar = await fetch(`${BASE}/api/skills?scope=all`, { headers: H });
    const ad = await j(ar);
    console.log('All skills:', JSON.stringify(ad?.data?.map(s=>({n:s.name,id:s.id,v:s.visibility,o:s.ownerUserId})),null,2));
    return;
  }

  // Publish first
  const sk = skills[0];
  console.log(`\n=== Publish "${sk.name}" (${sk.id}) ===`);
  const pu = await fetch(`${BASE}/api/skillhub/${encodeURIComponent(sk.id)}/publish`, { method:'POST', headers: H });
  console.log('Status:', pu.status);
  const pud = await j(pu);
  console.log('Response:', JSON.stringify(pud, null, 2));

  // Admin login
  console.log('\n=== Login admin zzq ===');
  const al = await fetch(`${BASE}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'zzq',password:'test123456'}) });
  const ald = await j(al);
  if (!ald?.data?.accessToken) { console.log('Admin login failed:', JSON.stringify(ald)); return; }
  const AH = { Authorization: `Bearer ${ald.data.accessToken}` };

  // Pending list
  console.log('\n=== Pending (admin) ===');
  const pe = await fetch(`${BASE}/api/skillhub/admin/pending`, { headers: AH });
  console.log('Status:', pe.status);
  const ped = await j(pe);
  console.log('Response:', JSON.stringify(ped, null, 2));
}

main().catch(e => console.error('Fatal:', e));
