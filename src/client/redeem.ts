import { getTokenFor, redeem } from './lib';

// 1) valid token, then the same token again
const auth = await getTokenFor('/resource');
console.log('valid       :', await redeem('/resource', auth));
console.log('reused      :', await redeem('/resource', auth));

// 2) token issued for /resource, presented at /other
const auth2 = await getTokenFor('/resource');
console.log('wrong ctx   :', await redeem('/other', auth2));

// 3) tampered token
const s = (await getTokenFor('/resource')).toString();
const i = s.length - 10;
const tampered = s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
console.log('tampered    :', await redeem('/resource', tampered));
