const https = require('https');
const q = encodeURIComponent('Gboard Dictionary format:shortcut');
const options = {
  hostname: 'api.github.com',
  path: `/search/code?q=${q}`,
  headers: {
    'User-Agent': 'Node.js',
    'Authorization': process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : undefined
  }
};
https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => console.log(JSON.stringify(JSON.parse(data), null, 2)));
});
