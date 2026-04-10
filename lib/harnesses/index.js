
/**
 * Harness registry.
 *
 * Each harness defines how to invoke a coding agent and
 * how to integrate with minnux for stats tracking.
 */

var pi = require('./pi');
var claude = require('./claude');

/**
 * Available harnesses.
 */

var harnesses = {
  pi: pi,
  claude: claude
};

/**
 * Get a harness by name.
 *
 * @param {String} name
 * @return {Object}
 * @api public
 */

exports.get = function(name) {
  return harnesses[name] || null;
};

/**
 * List available harness names.
 *
 * @return {Array}
 * @api public
 */

exports.list = function() {
  return Object.keys(harnesses);
};

/**
 * Default harness name.
 */

exports.defaultHarness = 'pi';
