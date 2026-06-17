async function run() {
  const userId = '96dda1e7-fa8d-4d30-bfe8-3e80d273097c';
  const role = 'user';
  
  console.log('Generating token for user:', userId);
  const { SignJWT } = require('jose');
  const secret = new TextEncoder().encode('75c1e50ef2108ca59767647b0d4f4c79c17ab7141cbef345d3211239e8685f72');
  const token = await new SignJWT({ tokenType: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('prompthub-server')
    .setAudience('prompthub-api')
    .setSubject(userId)
    .setExpirationTime('15m')
    .sign(secret);
    
  console.log('Token:', token);
  const res = await fetch('http://localhost:3000/api/skillhub/private', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Data:', JSON.stringify(data, null, 2));
}

run().catch(console.error);
