module.exports = {
  apps: [{
    name: 'fuwari-blog',
    script: 'dist/server/entry.mjs',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 4321,
      HOST: '0.0.0.0',
      DB_TYPE: 'postgres',
      DATABASE_URL: 'postgresql://fuwari_blog:KxM5pDn2Zx4P7RH4@localhost:5432/fuwari_blog'
    }
  }]
};
