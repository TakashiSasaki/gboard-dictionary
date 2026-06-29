import https from 'https';

const q = encodeURIComponent('"Gboard Dictionary format:shortcut"');
const options = {
  hostname: 'api.github.com',
  path: `/search/code?q=${q}`,
  headers: {
    'User-Agent': 'Node.js'
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => console.log(data));
});
