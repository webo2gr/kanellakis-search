import crypto from 'crypto';

const CONFIG = {
  url: process.env.MAGENTO_URL || 'https://b2b.kanellakis-sa.gr',
  consumerKey: process.env.CONSUMER_KEY,
  consumerSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
};

function pct(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function oauthHeader(method, url) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const urlObj = new URL(url);
  const params = {
    oauth_consumer_key: CONFIG.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: ts,
    oauth_token: CONFIG.accessToken,
    oauth_version: '1.0',
  };
  urlObj.searchParams.forEach((v, k) => { params[k] = v; });
  const baseUrl = urlObj.origin + urlObj.pathname;
  const sortedParams = Object.keys(params).sort()
    .map(k => pct(k) + '=' + pct(params[k])).join('&');
  const baseString = method.toUpperCase() + '&' + pct(baseUrl) + '&' + pct(sortedParams);
  const signingKey = pct(CONFIG.consumerSecret) + '&' + pct(CONFIG.accessTokenSecret);
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  const headerParams = {
    oauth_consumer_key: CONFIG.consumerKey,
    oauth_nonce: nonce,
    oauth_signature: signature,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: ts,
    oauth_token: CONFIG.accessToken,
    oauth_version: '1.0',
  };
  return 'OAuth ' + Object.keys(headerParams)
    .map(k => k + '="' + pct(headerParams[k]) + '"').join(', ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const extraParams = { ...req.query };
  delete extraParams.endpoint;
  const magentoUrl = new URL(CONFIG.url + '/rest/V1/' + endpoint);
  Object.entries(extraParams).forEach(([k, v]) => magentoUrl.searchParams.set(k, v));
  try {
    const auth = oauthHeader('GET', magentoUrl.toString());
    const response = await fetch(magentoUrl.toString(), {
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
