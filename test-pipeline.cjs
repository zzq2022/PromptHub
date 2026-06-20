const http = require('http');
const fs = require('fs');
const out = [];
function log(msg) { out.push(String(msg)); }

function fetchJson(method, path, body, headers) {
  headers = headers || {};
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: 'localhost', port: 3000, path: path, method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: 10000,
    };
    var req = http.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  log('=== Health ===');
  try {
    var h = await fetchJson('GET', '/health');
    log('Health: ' + h.status + ' ' + JSON.stringify(h.data));
  } catch (e) {
    log('Cannot reach: ' + e.message);
    return write();
  }

  log('');
  log('=== Login zzq02 ===');
  var lr = await fetchJson('POST', '/api/auth/login', { username: 'zzq02', password: 'test123456' });
  log('Status: ' + lr.status);
  log('Body: ' + JSON.stringify(lr.data));
  var token = lr.data && lr.data.data && lr.data.data.accessToken;
  if (!token) { log('No token!'); return write(); }

  log('');
  log('=== Private skills ===');
  var priv = await fetchJson('GET', '/api/skillhub/private', null, { Authorization: 'Bearer ' + token });
  log('Status: ' + priv.status);
  var skills = (priv.data && priv.data.data) || [];
  log('Count: ' + skills.length);
  for (var i = 0; i < skills.length; i++) {
    log('  ' + skills[i].name + ' | id=' + skills[i].id + ' | vis=' + skills[i].visibility);
  }

  if (skills.length === 0) {
    log('');
    log('=== No private skills - trying scope=all ===');
    var all = await fetchJson('GET', '/api/skills?scope=all', null, { Authorization: 'Bearer ' + token });
    var allS = (all.data && all.data.data) || [];
    for (var j = 0; j < allS.length; j++) {
      log('  ' + allS[j].name + ' | id=' + allS[j].id + ' | vis=' + allS[j].visibility + ' | owner=' + allS[j].ownerUserId);
    }
    return write();
  }

  var sk = skills[0];
  log('');
  log('=== Publish: ' + sk.name + ' (' + sk.id + ') ===');
  try {
    var pu = await fetchJson('POST', '/api/skillhub/' + encodeURIComponent(sk.id) + '/publish', null, { Authorization: 'Bearer ' + token });
    log('Status: ' + pu.status);
    log('Body: ' + JSON.stringify(pu.data));
  } catch (e) { log('Error: ' + e.message); }

  log('');
  log('=== Login admin zzq ===');
  var al = await fetchJson('POST', '/api/auth/login', { username: 'zzq', password: 'test123456' });
  var adminToken = al.data && al.data.data && al.data.data.accessToken;
  if (!adminToken) { log('Admin login failed!'); return write(); }

  log('');
  log('=== Pending skills (admin) ===');
  var pe = await fetchJson('GET', '/api/skillhub/admin/pending', null, { Authorization: 'Bearer ' + adminToken });
  log('Status: ' + pe.status);
  log('Body: ' + JSON.stringify(pe.data));

  return write();
}

function write() {
  fs.writeFileSync('d:\\Pyprojects\\PromptHub-main2\\test-output.txt', out.join('\n'), 'utf8');
}

main().catch(function(e) {
  out.push('FATAL: ' + e.message);
  write();
});
