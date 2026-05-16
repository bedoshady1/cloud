module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/home/ec2-user/mini-jira/apps/backend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '300M',
    },
    {
      name: 'frontend',
      cwd: '/home/ec2-user/mini-jira/apps/frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
    },
  ],
};
