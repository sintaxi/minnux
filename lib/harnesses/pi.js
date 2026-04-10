
/**
 * Pi coding agent harness.
 *
 * Pi uses native extensions loaded via the -e flag.
 * Extensions have full access to lifecycle events and can
 * track cost, tokens, model, and state in real-time.
 */

var path = require('path');
var fs = require('fs');

/**
 * Harness name.
 */

exports.name = 'pi';

/**
 * Base command.
 */

exports.command = 'pi';

/**
 * Default flags.
 */

exports.flags = '--no-session';

/**
 * Extensions to inject.
 */

var extensions = [
  path.resolve(path.join(__dirname, '..', '..', 'extensions', 'stats.ts')),
  path.resolve(path.join(__dirname, '..', '..', 'extensions', 'windows.ts'))
];

/**
 * Build the full command with extensions injected.
 *
 * @param {String} baseCmd - The base command (may include user flags)
 * @return {String}
 * @api public
 */

exports.buildCommand = function(baseCmd) {
  var flags = extensions.map(function(ext) {
    return '-e ' + shellQuote(ext);
  }).join(' ');

  // If baseCmd is just a bare invocation, add default flags
  if (baseCmd === 'pi' || baseCmd === '') {
    return 'pi ' + exports.flags + ' ' + flags;
  }

  // Inject extensions after 'pi' command
  return baseCmd.replace(/(^|&&\s*|;\s*)pi(\s|$)/g, '$1pi ' + flags + '$2');
};

/**
 * Setup hooks/extensions for stats tracking.
 * Pi uses native extensions, so this is a no-op (extensions are injected at command build time).
 *
 * @param {String} name - Process name
 * @param {String} baseDir - Base directory for stats/sockets
 * @api public
 */

exports.setupStats = function(name, baseDir) {
  // Pi extensions are injected via buildCommand, nothing to setup
};

/**
 * Read stats from the stats file.
 *
 * @param {String} name - Process name
 * @param {String} baseDir - Base directory
 * @return {Object|null}
 * @api public
 */

exports.readStats = function(name, baseDir) {
  var statsFile = path.join(baseDir, 'stats', name + '.json');
  try {
    var data = fs.readFileSync(statsFile, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
};

/**
 * Shell-quote a string.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function shellQuote(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
