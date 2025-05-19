/**
 * Direct Session Analysis Runner
 * 
 * This script bypasses the standard API-based analysis flow and directly
 * processes a session JSON file with Stage 2 analysis.
 * 
 * Usage:
 *   node run-direct-analysis.js <sessionId|filePath>
 * 
 * - If you provide a sessionId, it will look for a matching complete_session file
 * - If you provide a filePath, it will load that specific file
 */

const { loadAndProcessSessionFromFile, loadAndProcessSessionById } = require('./utilities/loadSessionFromFile');

// Get command line argument
const arg = process.argv[2];

if (!arg) {
  console.error('Error: Please provide a session ID or file path');
  console.error('Usage: node run-direct-analysis.js <sessionId|filePath>');
  process.exit(1);
}

// Determine if this is a file path or session ID
async function run() {
  console.log('========================================================');
  console.log('Direct Session Analysis Runner');
  console.log('========================================================');
  
  let result;
  
  // Check if the argument is a file path or session ID
  if (arg.includes('/') || arg.includes('\\') || arg.endsWith('.json')) {
    console.log(`Processing file: ${arg}`);
    result = await loadAndProcessSessionFromFile(arg);
  } else {
    console.log(`Looking for session with ID: ${arg}`);
    result = await loadAndProcessSessionById(arg);
  }
  
  // Display results
  if (result.success) {
    console.log('========================================================');
    console.log('Analysis completed successfully!');
    console.log(`Report length: ${result.reportLength} characters`);
    console.log(`Results saved to: ${result.filePath}`);
    console.log('========================================================');
  } else {
    console.error('========================================================');
    console.error('Analysis failed:');
    console.error(result.message);
    console.error('========================================================');
    process.exit(1);
  }
}

// Run the analysis
run().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 