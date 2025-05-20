// This file can be used to export all stage functions if needed.
// For now, it can remain empty or be used for shared utilities among stages.

const stage1 = require('./stage1_detailedEventProcessor');
const stage2 = require('./stage2_nonTransitionalEventProcessor');
const stage3 = require('./stage3_painPointQA');
const stage4 = require('./stage4_uxHelpGenerator');

module.exports = {
  ...stage1,
  ...stage2,
  ...stage3,
  ...stage4
}; 