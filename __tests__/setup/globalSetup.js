// Global setup for integration and E2E tests
const { execSync } = require('child_process')

module.exports = async () => {
  console.log('Setting up test environment...')
  
  try {
    // Check if Supabase is running
    console.log('Checking Supabase status...')
    execSync('supabase status', { encoding: 'utf8', stdio: 'pipe' })
    console.log('Supabase is already running')
  } catch (error) {
    console.log('Starting Supabase local instance...')
    try {
      execSync('supabase start', { encoding: 'utf8', stdio: 'inherit' })
      console.log('Supabase started successfully')
    } catch (startError) {
      console.error('Failed to start Supabase:', startError.message)
      throw startError
    }
  }

  // Wait for services to be ready
  console.log('Waiting for services to be ready...')
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Reset database to clean state
  try {
    console.log('Resetting database to clean state...')
    execSync('supabase db reset --debug', { encoding: 'utf8', stdio: 'inherit' })
    console.log('Database reset complete')
  } catch (resetError) {
    console.error('Failed to reset database:', resetError.message)
    // Don't throw here as tests might still work
  }

  console.log('Test environment setup complete')
}