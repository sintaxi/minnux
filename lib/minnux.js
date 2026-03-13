
/**
 * Module dependencies.
 */

var minimist = require('minimist');
var Group = require('./group');

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

  str.split(/\r?\n/).forEach(function(line){
    if ('' == line.trim()) return;
    if (/^ *#/.test(line)) return;

    var i = line.indexOf('=');

    // bare path — pi agent, parsed with minimist for optional flags
    if (i === -1) {
      var argv = minimist(line.trim().split(/\s+/));
      var dir = argv._[0];
      var name = argv.name || dir.replace(/\//g, '-');
      delete argv.name;
      delete argv._;
      var flags = Object.keys(argv).reduce(function(acc, key) {
        var val = argv[key];
        if (val === true) return acc + ' --' + key;
        if (val === false) return acc + ' --no-' + key;
        return acc + ' --' + key + ' ' + JSON.stringify(String(val));
      }, '');
      conf.processes[name] = { cmd: 'pi --no-session' + flags, dir: dir };
      return;
    }

    var key = line.slice(0, i).trim();
    var val = line.slice(i + 1).trim();

    switch (key) {
      case 'logs':
      case 'on-error':
      case 'on-restart':
      case 'sleep':
      case 'attempts':
      case 'prefix':
        conf[key] = val;
        break;
      default:
        conf.processes[key] = { cmd: val, dir: null };
    }
  });

  return conf;
};
