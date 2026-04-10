
/**
 * Claude Code harness.
 *
 * Claude Code uses a statusline feature that receives rich JSON data
 * after each response, including cost, model, and token counts.
 * We configure a statusline script to write stats to our stats file.
 *
 * Commands (/d, /detach) are loaded via --add-dir pointing to
 * lib/claude-adddir which contains .claude/commands/.
 */

var path = require('path');
var fs = require('fs');

/**
 * Harness name.
 */

exports.name = 'claude';

/**
 * Base command.
 */

exports.command = 'claude';

/**
 * Default flags.
 */

exports.flags = '';

/**
 * Path to the --add-dir directory containing .claude/commands.
 */

var addDir = path.resolve(path.join(__dirname, '..', 'claude-adddir'));

/**
 * Build the full command.
 *
 * @param {String} baseCmd - The base command (may include user flags)
 * @param {Object} opts - Options (unused, kept for interface compatibility)
 * @return {String}
 * @api public
 */

exports.buildCommand = function(baseCmd, opts) {
  var cmd = baseCmd;
  if (cmd === 'claude' || cmd === '') {
    cmd = 'claude';
  }

  // Add --add-dir for minnux commands (/d, /detach)
  cmd += ' --add-dir ' + shellQuote(addDir);

  return cmd;
};

/**
 * Setup statusline for Claude Code.
 * Creates project-level .claude/settings.json with a statusline that writes stats.
 *
 * @param {String} name - Process name
 * @param {String} baseDir - Base directory for stats
 * @return {Object} Options for buildCommand (empty, addDir is static)
 * @api public
 */

exports.setupStats = function(name, baseDir) {
  var statsDir = path.join(baseDir, 'stats');
  var statsFile = path.join(statsDir, name + '.json');
  var statuslineScript = path.join(__dirname, '..', 'claude-hooks', 'claude-statusline.js');

  // Ensure stats directory exists
  try {
    fs.mkdirSync(statsDir, { recursive: true });
  } catch (e) {}

  // Write initial stats file
  try {
    fs.writeFileSync(statsFile, JSON.stringify({
      model: null,
      cost: 0,
      tokens: { input: 0, output: 0 },
      state: 'idle'
    }) + '\n');
  } catch (e) {}

  // Setup Claude statusline in project .claude/settings.json
  var claudeDir = path.join(baseDir, '.claude');
  var settingsFile = path.join(claudeDir, 'settings.json');

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {}

  var settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch (e) {}

  // Build statusline command
  var statuslineCmd = 'node ' + shellQuote(path.resolve(statuslineScript))
    + ' ' + shellQuote(name)
    + ' ' + shellQuote(path.resolve(statsFile));

  // Set statusline (this will override any existing statusline)
  settings.statusLine = {
    type: 'command',
    command: statuslineCmd
  };

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');

  return {};
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
