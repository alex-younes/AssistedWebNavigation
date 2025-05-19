/**
 * Utility to load a prepared session from a JSON file
 * This bypasses the standard API calls in analysisOrchestrator.js
 */

const fs = require('fs');
const path = require('path');
const { processSessionForNonTransitionalEvents } = require('../services/analysisStages/stage2_nonTransitionalEventProcessor');
const { generateStage2SummaryPrompt, executeModelRequest, selectModel } = require('../services/analysisOrchestrator');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`[Utility] Created data directory: ${dataDir}`);
}

/**
 * Load a session from a JSON file and process it
 * @param {string} filename - Name of the JSON file in the data directory
 * @returns {Promise<object>} Analysis result
 */
async function loadAndProcessSessionFromFile(filename) {
  try {
    console.log(`[Utility] Loading session from file: ${filename}`);
    
    // Determine the full path
    const filePath = path.isAbsolute(filename) 
      ? filename 
      : path.join(dataDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Read and parse the file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const session = JSON.parse(fileContent);
    
    if (!session.id || !session.userId || !session.states) {
      throw new Error('Invalid session data: missing required fields (id, userId, states)');
    }
    
    console.log(`[Utility] Successfully loaded session ${session.id} for user ${session.userId}`);
    console.log(`[Utility] Session has ${session.states.length} states`);
    
    // Verify states have nonTransitionalEvents
    const statesWithEvents = session.states.filter(s => 
      s.nonTransitionalEvents && Object.keys(s.nonTransitionalEvents).length > 0
    );
    
    console.log(`[Utility] Found ${statesWithEvents.length} states with non-transitional events`);
    
    // Process the session with Stage 2 processor
    console.log(`[Utility] Processing session with Stage 2 non-transitional event processor...`);
    const processedSession = await processSessionForNonTransitionalEvents(session);
    
    // Create a fake session data object with just this one session
    const sessionData = {
      sessionCount: 1,
      enrichedSessions: [processedSession]
    };
    
    // Generate Stage 2 summary prompt
    console.log(`[Utility] Generating Stage 2 summary prompt...`);
    const stage2SummaryPrompt = generateStage2SummaryPrompt(sessionData);
    
    // Write prompt to file for inspection if needed
    const promptPath = path.join(dataDir, `${session.id}_prompt.txt`);
    fs.writeFileSync(promptPath, stage2SummaryPrompt);
    console.log(`[Utility] Stage 2 prompt saved to: ${promptPath}`);
    
    // Select model and execute request
    const model = selectModel();
    console.log(`[Utility] Selected model: ${model}`);
    
    console.log(`[Utility] Sending request to AI model...`);
    const analysisResult = await executeModelRequest(stage2SummaryPrompt, model);
    
    // Save the result
    const resultPath = path.join(dataDir, `${session.id}_result.md`);
    fs.writeFileSync(resultPath, analysisResult);
    console.log(`[Utility] Analysis result saved to: ${resultPath}`);
    
    return {
      success: true,
      report: analysisResult,
      reportLength: analysisResult.length,
      userId: session.userId,
      sessionCount: 1,
      analysisStagesCompleted: ['Stage2_NonTransitionalEventProcessor'],
      filePath: resultPath
    };
  } catch (error) {
    console.error(`[Utility] Error processing session from file:`, error);
    return {
      success: false,
      message: `Error processing session: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Load a prepared session and process it with Stage 2 analyzer
 * @param {string} sessionId - ID of the session to process
 * @returns {Promise<object>} Analysis result
 */
async function loadAndProcessSessionById(sessionId) {
  try {
    // Look for a file with this session ID in the data directory
    const files = fs.readdirSync(dataDir);
    const sessionFile = files.find(f => 
      f.includes(sessionId) && 
      f.includes('complete_session') && 
      f.endsWith('.json')
    );
    
    if (!sessionFile) {
      throw new Error(`No prepared session file found for session ID: ${sessionId}`);
    }
    
    return await loadAndProcessSessionFromFile(sessionFile);
  } catch (error) {
    console.error(`[Utility] Error loading session by ID:`, error);
    return {
      success: false,
      message: `Error loading session: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = {
  loadAndProcessSessionFromFile,
  loadAndProcessSessionById
}; 