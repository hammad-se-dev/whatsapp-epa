#!/usr/bin/env node

// run-both.js - Runs both web server and terminal test
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting WhatsApp Job Portal with Payment System...\n');

// Start the web server in the background
console.log('📡 Starting web server for APIs...');
const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Server running')) {
    console.log('✅ Web server started successfully');
    console.log('📱 Payment system ready at http://localhost:3001\n');
    
    // Start terminal test after server is ready
    console.log('🤖 Starting WhatsApp bot terminal...');
    console.log('═'.repeat(60));
    
    const terminalTest = spawn('node', ['terminal-test.js'], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    
    terminalTest.on('close', (code) => {
      console.log('\n🛑 Terminal test ended. Stopping web server...');
      server.kill();
      process.exit(code);
    });
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill();
  process.exit(0);
});
