/**
 * Final Synthesis Module
 * 
 * Combines all analysis stages into a comprehensive, well-structured report
 * using Claude 3 Opus for the final synthesis to ensure highest quality output.
 * 
 * This is the culmination of the multi-stage, multi-model analysis pipeline,
 * producing a detailed, insightful report of the user's session(s).
 */

// Anthropic or OpenAI client for final report generation
const { GroqClient } = require("@anthropic-ai/sdk");
const { selectModelForTask } = require('../modelManagement/modelSelector');
const { executeWithRetryAndFallback } = require('../modelManagement/fallbackHandler');

// Initialize API client 
// Groq provides access to Claude models with higher throughput
const client = new GroqClient({
  apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY,
});

// Use Claude 3 Opus for final synthesis if available via Groq
const SYNTHESIS_MODEL = process.env.SYNTHESIS_MODEL || "claude-3-opus-20240229";
const FALLBACK_MODEL = "claude-3-haiku-20240307";

/**
 * Generate a comprehensive synthesis report from all analysis stages
 * @param {Array} sessionFeatures - Extracted session features
 * @param {Object} stageResults - Results from all previous analysis stages
 * @returns {Promise<Object>} Final report
 */
async function generateComprehensiveReport(sessionFeatures, stageResults) {
  console.log("[FinalSynthesis] Generating comprehensive synthesis report...");
  
  try {
    // Select optimal model for final synthesis
    const { model, maxTokens } = selectModelForTask('synthesis', {
      preferredModel: SYNTHESIS_MODEL,
      fallbackModel: FALLBACK_MODEL
    });
    
    console.log(`[FinalSynthesis] Using ${model} for final synthesis`);
    
    // Create metadata about the synthesis process
    const synthesisInfo = {
      model,
      maxTokens,
      stageCount: Object.keys(stageResults).length,
      timestamp: new Date().toISOString()
    };
    
    // Build the comprehensive prompt with all stage results
    const prompt = buildFinalSynthesisPrompt(sessionFeatures, stageResults);
    
    // Generate the final report
    const finalReport = await executeWithRetryAndFallback(
      async () => {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            }
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        });
        
        return completion.choices[0].message.content;
      },
      { 
        taskName: 'Final Synthesis',
        maxRetries: 3,
        fallbackModels: [FALLBACK_MODEL, "gpt-4"]
      }
    );
    
    // Format the report with markdown and structure it
    const formattedReport = formatFinalReport(finalReport, synthesisInfo);
    
    return {
      report: formattedReport,
      reportLength: formattedReport.length,
      modelsUsed: [model],
      success: true,
      synthesisInfo
    };
  } catch (error) {
    console.error(`[FinalSynthesis] Error generating synthesis: ${error.message}`);
    
    // Return a graceful error report
    return {
      report: `## Analysis Error\n\nThere was an error generating the comprehensive report: ${error.message}\n\n### Partial Results\n\n${formatPartialResults(stageResults)}`,
      reportLength: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Build the comprehensive prompt for the final synthesis
 * @param {Array} sessionFeatures - Extracted session features
 * @param {Object} stageResults - Results from all analysis stages
 * @returns {string} Structured prompt for the synthesis model
 */
function buildFinalSynthesisPrompt(sessionFeatures, stageResults) {
  // Extract session count and basic metadata
  const sessionCount = sessionFeatures.length;
  const firstSession = sessionFeatures[0];
  const lastSession = sessionFeatures[sessionCount - 1];
  
  const prompt = `
You are an expert analyst creating a comprehensive, professional report on user website interactions.

# SESSION DATA TO ANALYZE
The data represents ${sessionCount} user session(s) analyzed across multiple stages.

## Session Overview
- Sessions analyzed: ${sessionCount}
- First session date: ${new Date(firstSession.startTime).toISOString().split('T')[0]}
${sessionCount > 1 ? `- Last session date: ${new Date(lastSession.startTime).toISOString().split('T')[0]}` : ''}
- Total states across all sessions: ${sessionFeatures.reduce((sum, session) => sum + session.stateCount, 0)}
- Device type: ${firstSession.device}

## Stage 1: Metrics & Navigation Analysis
${stageResults.stage1}

## Stage 2: Behavioral & Psychological Analysis
${stageResults.stage2}

## Stage 3: Form Interaction Analysis
${stageResults.stage3 || "No form interaction analysis available."}

## Stage 4: Temporal & Progression Analysis
${stageResults.stage4 || "No temporal analysis available."}

# YOUR TASK: CREATE A COMPREHENSIVE SYNTHESIS REPORT

Create a professional, insightful analysis report that synthesizes findings from all stages. This is your opportunity to deliver significant value through deep, thoughtful analysis. 

Structure your report with these sections:
1. **Executive Summary** - Concise overview of key findings (2-3 paragraphs)
2. **Navigation & Interaction Patterns** - Analysis of how the user moved through the site 
3. **User Behavior Insights** - Psychological and behavioral patterns observed
4. **Pain Points & Friction Areas** - Identify obstacles or confusion points
5. **Improvement Recommendations** - 3-5 concrete recommendations based on the analysis
6. **Conclusion** - Final thoughts summarizing the most important insights

FORMAT REQUIREMENTS:
- Use Markdown formatting with headers, bullet points, and tables where appropriate
- Cite specific data points from the analysis stages to support your conclusions
- Be specific, detailed, and insightful rather than general or vague
- Integrate findings across stages to create a cohesive narrative
- If there are inconsistencies between analysis stages, acknowledge and reconcile them
- Do not include irrelevant information or unnecessary disclaimers
- Focus on extracting meaningful insights that would be valuable to product managers and UX designers
- Strive for a report that is both technically sound and readable by non-technical stakeholders

Your report should be comprehensive (at least 1000 words) and deliver significant, actionable value.
`;

  return prompt;
}

/**
 * Format the final report with additional metadata
 * @param {string} reportText - Raw report text from the LLM
 * @param {Object} synthesisInfo - Information about the synthesis process
 * @returns {string} Formatted report
 */
function formatFinalReport(reportText, synthesisInfo) {
  // Add a header with metadata
  const header = `
# User Session Analysis Report
*Generated on: ${new Date().toLocaleString()}*

`;

  // Add a footer with model information
  const footer = `

---
*This analysis was generated using a multi-stage AI analysis pipeline with ${synthesisInfo.model} for final synthesis.*
`;

  return header + reportText + footer;
}

/**
 * Format partial results in case of an error
 * @param {Object} stageResults - Results from available analysis stages
 * @returns {string} Formatted partial results
 */
function formatPartialResults(stageResults) {
  let partialReport = "";
  
  Object.entries(stageResults).forEach(([stage, result]) => {
    if (result && typeof result === 'string' && result.length > 0) {
      partialReport += `### ${stage.toUpperCase()}\n\n${result}\n\n`;
    }
  });
  
  return partialReport || "No partial results available.";
}

module.exports = {
  generateComprehensiveReport
}; 