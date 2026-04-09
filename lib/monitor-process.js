
/**
 * Module dependencies.
 */

var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var join = path.join;

/**
 * Expose `MonitorProcess`.
 */

module.exports = MonitorProcess;

/**
 * Initialize a `MonitorProcess` of `name` with `cmd`.
 *
 * @param {Object} group
 * @param {String} name
 * @param {Object} proc
 * @api public
 */

function MonitorProcess(group, name, proc) {
  var conf = group.conf;
  this.mode = 'monitor';
  this.cmd = proc.cmd;
  this.dir = proc.dir ? path.resolve(proc.dir) : null;
  this.name = name;
  this.group = group;
  this.session = group.session;
  this.sleep = conf.sleep || '1000';
  this.attempts = conf.attempts || 'Infinity';
  this.onerror = conf['on-error'];
  this.onrestart = conf['on-restart'];
  this.prefix = conf.prefix;
  this.logfile = path.resolve(join(conf.logs, name + '.log'));
  this.pidfile = path.resolve(join(conf.pids, name + '.pid'));
  this.monpidfile = path.resolve(join(conf.pids, name + '.mon.pid'));

  // load state from PID files
  this._loadState();
}

/**
 * Load state from PID files.
 *
 * @api private
 */

MonitorProcess.prototype._loadState = function(){
  this.pid = null;
  this.monpid = null;
  this._dead = false;
  this._startTime = 0;

  // read monitor PID
  try {
    var monpid = parseInt(fs.readFileSync(this.monpidfile, 'utf8').trim(), 10);
    if (monpid && isProcessRunning(monpid)) {
      this.monpid = monpid;
    }
  } catch (e) {}

  // read child PID
  try {
    var pid = parseInt(fs.readFileSync(this.pidfile, 'utf8').trim(), 10);
    if (pid) {
      this.pid = pid;
      if (isProcessRunning(pid)) {
        this._dead = false;
        this._startTime = getProcessStartTime(pid);
      } else {
        this._dead = true;
      }
    }
  } catch (e) {}

  // if monitor isn't running but we have stale PID files, clean up
  if (!this.monpid) {
    this.pid = null;
    this._dead = false;
  }
};

/**
 * Return stats (not applicable for monitor processes).
 *
 * @return {Object} null
 * @api public
 */

MonitorProcess.prototype.stats = function(){
  return null;
};

/**
 * Return start time.
 *
 * @return {Number}
 * @api public
 */

MonitorProcess.prototype.mtime = function(){
  return this._startTime || 0;
};

/**
 * Return the state:
 *
 *  - standby
 *  - dead
 *  - alive
 *
 * @return {String}
 * @api public
 */

MonitorProcess.prototype.state = function(){
  if (!this.monpid) return 'standby';
  if (this._dead || !this.pid || !isProcessRunning(this.pid)) return 'dead';
  return 'alive';
};

/**
 * Check if the process is alive.
 *
 * @return {Boolean}
 * @api public
 */

MonitorProcess.prototype.alive = function(){
  return this.state() === 'alive';
};

/**
 * Return a target identifier for this process.
 * Monitor processes don't have tmux targets.
 *
 * @return {String}
 * @api public
 */

MonitorProcess.prototype.target = function(){
  return null;
};

/**
 * Start the process via the monitor daemon.
 *
 * @param {Function} fn
 * @api public
 */

MonitorProcess.prototype.start = function(fn){
  var self = this;
  var monitorScript = path.resolve(join(__dirname, 'monitor.js'));
  var cwd = this.dir || process.cwd();

  var args = [
    monitorScript,
    '--cmd', this.cmd,
    '--logfile', this.logfile,
    '--pidfile', this.pidfile,
    '--monpidfile', this.monpidfile,
    '--sleep', this.sleep,
    '--attempts', this.attempts,
    '--cwd', cwd
  ];

  if (this.onerror) {
    args.push('--on-error', this.onerror + ' ' + this.name);
  }
  if (this.onrestart) {
    args.push('--on-restart', this.onrestart + ' ' + this.name);
  }
  if (this.prefix) {
    args.push('--prefix', this.prefix);
  }

  var child = spawn('node', args, {
    detached: true,
    stdio: 'ignore',
    cwd: cwd
  });

  child.unref();

  // give monitor a moment to start and write PID files
  setTimeout(function() {
    self._loadState();
    fn();
  }, 100);
};

/**
 * Stop the process by killing the monitor daemon.
 *
 * @param {String} sig
 * @param {Function} fn
 * @api public
 */

MonitorProcess.prototype.stop = function(sig, fn){
  var self = this;
  sig = sig || 'SIGTERM';

  if (this.monpid) {
    try {
      process.kill(this.monpid, sig);
    } catch (e) {}
  }

  // give monitor time to clean up
  setTimeout(function() {
    self._loadState();
    fn();
  }, 600);
};

/**
 * Check if a process is running.
 *
 * @param {Number} pid
 * @return {Boolean}
 * @api private
 */

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get process start time from `ps`.
 *
 * @param {Number} pid
 * @return {Number} epoch ms or 0
 * @api private
 */

function getProcessStartTime(pid) {
  try {
    var execSync = require('child_process').execSync;
    var output = execSync(
      'ps -o lstart= -p ' + pid,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return new Date(output.trim()).getTime();
  } catch (e) {
    return 0;
  }
}
