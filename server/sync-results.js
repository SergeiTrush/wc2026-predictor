const bzzoiro = require('./results-providers/bzzoiro');

module.exports = {
  isEnabled: bzzoiro.isEnabled,
  syncResultsFromApi: bzzoiro.syncResults,
  getSyncStatus: bzzoiro.getSyncStatus,
  startResultsSyncScheduler: bzzoiro.startScheduler,
};
