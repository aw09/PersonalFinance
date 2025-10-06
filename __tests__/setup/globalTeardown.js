// Global teardown for integration and E2E tests
const { execSync } = require('child_process')

module.exports = async () => {
  console.log('Tearing down test environment...')
  
  try {
    if (process.env.SKIP_SUPABASE === '1') {
      console.log('SKIP_SUPABASE=1 detected, skipping Supabase teardown.')
      return
    }
    // Clean up test data if needed
    console.log('Cleaning up test data...')
    
    // Optional: Stop Supabase (uncomment if you want to stop it after tests)
    // console.log('Stopping Supabase...')
    // execSync('supabase stop', { encoding: 'utf8', stdio: 'inherit' })
    
    console.log('Test environment teardown complete')
  } catch (error) {
    console.error('Error during teardown:', error.message)
    // Don't throw to avoid masking test failures
  }
}