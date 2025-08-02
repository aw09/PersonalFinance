#!/usr/bin/env node

/**
 * Migration CLI tool for the Personal Finance application
 * This script provides command-line interface for managing database migrations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMMANDS = {
  start: 'Start local Supabase instance',
  stop: 'Stop local Supabase instance',
  reset: 'Reset local database and apply all migrations',
  new: 'Create a new migration file',
  up: 'Apply pending migrations',
  status: 'Show migration status',
  link: 'Link to remote Supabase project',
  push: 'Push local migrations to remote database',
  pull: 'Pull remote schema to local migrations',
  types: 'Generate TypeScript types from database schema'
};

function showHelp() {
  console.log('🗃️  Personal Finance - Database Migration Tool\n');
  console.log('Usage: npm run db <command> [options]\n');
  console.log('Available commands:');
  Object.entries(COMMANDS).forEach(([cmd, desc]) => {
    console.log(`  ${cmd.padEnd(10)} ${desc}`);
  });
  console.log('\nExamples:');
  console.log('  npm run db start          # Start local development database');
  console.log('  npm run db new add_column  # Create new migration');
  console.log('  npm run db reset           # Reset and apply all migrations');
  console.log('  npm run db push            # Deploy migrations to production');
}

function runCommand(cmd) {
  try {
    console.log(`🚀 Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    console.error(`❌ Command failed: ${cmd}`);
    process.exit(1);
  }
}

function ensureSupabaseConfig() {
  const configPath = path.join(process.cwd(), 'supabase', 'config.toml');
  if (!fs.existsSync(configPath)) {
    console.error('❌ Supabase not initialized. Run "npx supabase init" first.');
    process.exit(1);
  }
}

function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    showHelp();
    return;
  }

  ensureSupabaseConfig();

  switch (command) {
    case 'start':
      runCommand('npx supabase start');
      console.log('\n✅ Local Supabase is running!');
      console.log('🔗 Studio URL: http://localhost:54323');
      console.log('📊 Database URL: postgresql://postgres:postgres@localhost:54322/postgres');
      break;

    case 'stop':
      runCommand('npx supabase stop');
      console.log('✅ Local Supabase stopped');
      break;

    case 'reset':
      console.log('🔄 Resetting database and applying all migrations...');
      runCommand('npx supabase db reset');
      console.log('✅ Database reset complete');
      break;

    case 'new':
      if (!args[0]) {
        console.error('❌ Migration name required. Usage: npm run db new <migration_name>');
        process.exit(1);
      }
      runCommand(`npx supabase migration new ${args[0]}`);
      console.log(`✅ New migration created: ${args[0]}`);
      break;

    case 'up':
      runCommand('npx supabase migration up');
      console.log('✅ Migrations applied');
      break;

    case 'status':
      runCommand('npx supabase migration list');
      break;

    case 'link':
      console.log('🔗 Linking to remote Supabase project...');
      console.log('You will need your project reference ID from the Supabase dashboard');
      runCommand('npx supabase link');
      break;

    case 'push':
      console.log('📤 Pushing local migrations to remote database...');
      runCommand('npx supabase db push');
      console.log('✅ Migrations pushed to remote database');
      break;

    case 'pull':
      console.log('📥 Pulling remote schema to local migrations...');
      runCommand('npx supabase db pull');
      console.log('✅ Schema pulled from remote database');
      break;

    case 'types':
      console.log('🔧 Generating TypeScript types...');
      runCommand('npx supabase gen types typescript --local > src/types/database.ts');
      console.log('✅ TypeScript types generated in src/types/database.ts');
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main();