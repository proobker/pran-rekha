const apiPort = process.env.API_PORT || '4100';

export default {
  transpilePackages: ['@pran-rekha/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `http://127.0.0.1:${apiPort}/api/:path*` }];
  }
};
