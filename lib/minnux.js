
/**
 * Module dependencies.
 */

var minimist = require('minimist');
var Group = require('./group');
var harnesses = require('./harnesses');

/**
 * Expose `Group`.
 */

exports = module.exports = Group;

/**
 * Parse configuration `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parseConfig = function(str){
  var conf = {};
  conf.processes = {};

  // First pass: extract global harness setting
  var globalHarness = harnesses.defaultHarness;

  str.split(/\r?\n/).forEach(function(line){
    if ('' == line.trim()) return;
    if (/^ *#/.test(line)) return;

    var i = line.indexOf('=');
    if (i !== -1) {
      var key = line.slice(0, i).trim();
      var val = line.slice(i + 1).trim();
      if (key === 'harness') {
        globalHarness = val;
      }
    }
  });

  // Second pass: parse processes
  str.split(/\r?\n/).forEach(function(line){
    if ('' == line.trim()) return;
    if (/^ *#/.test(line)) return;

    var i = line.indexOf('=');

    // bare path — coding agent, parsed with minimist for optional flags
    if (i === -1) {
      var argv = minimist(line.trim().split(/\s+/));
      var dir = argv._[0];
      var name = argv.name || dir.replace(/\//g, '-');
      var harnessName = argv.harness || globalHarness;
      delete argv.name;
      delete argv.harness;
      delete argv._;

      // Get harness module
      var harness = harnesses.get(harnessName);
      if (!harness) {
        console.error('unknown harness "' + harnessName + '", available: ' + harnesses.list().join(', '));
        harness = harnesses.get(harnesses.defaultHarness);
      }

      // Build extra flags from remaining argv
      var extraFlags = Object.keys(argv).reduce(function(acc, key) {
        var val = argv[key];
        if (val === true) return acc + ' --' + key;
        if (val === false) return acc + ' --no-' + key;
        return acc + ' --' + key + ' ' + JSON.stringify(String(val));
      }, '');

      // Build base command (harness command + default flags + extra flags)
      var baseCmd = harness.command;
      if (harness.flags) baseCmd += ' ' + harness.flags;
      if (extraFlags) baseCmd += extraFlags;

      conf.processes[name] = {
        cmd: baseCmd,
        dir: dir,
        mode: 'tmux',
        harness: harnessName
      };
      return;
    }

    var key = line.slice(0, i).trim();
    var val = line.slice(i + 1).trim();

    switch (key) {
      case 'harness':
        // already handled in first pass
        break;
      case 'logs':
      case 'on-error':
      case 'on-restart':
      case 'sleep':
      case 'attempts':
      case 'prefix':
        conf[key] = val;
        break;
      default:
        // check for monitor mode: name=dir:command (dir:command pattern).
        // Do not treat command arguments containing colons (for example
        // `npm run agent:email-import`) as dir:command. The dir side must be
        // path-like and contain no shell whitespace.
        var colonIdx = val.indexOf(':');
        var dirCandidate = colonIdx > 0 ? val.slice(0, colonIdx).trim() : '';
        var isPathLikeDir = dirCandidate &&
          !dirCandidate.match(/\s/) &&
          (dirCandidate[0] === '/' || dirCandidate[0] === '~' || dirCandidate[0] === '.' || dirCandidate.indexOf('/') !== -1);
        if (colonIdx > 0 && isPathLikeDir) {
          var dir = dirCandidate;
          var cmd = val.slice(colonIdx + 1).trim();
          conf.processes[key] = { cmd: cmd, dir: dir, mode: 'monitor' };
        } else {
          // tmux mode with explicit command
          conf.processes[key] = { cmd: val, dir: null, mode: 'tmux' };
        }
    }
  });

  return conf;
};
