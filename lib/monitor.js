#!/usr/bin/env node

/**
 * Standalone process monitor daemon.
 *
 * Replaces the external `mon` C binary with a pure JS implementation.
 * Spawned as a detached child by `process.js`, this script:
 *
 *   - Spawns the target command as a child process
 *   - Writes PID files for both itself and the child
 *   - Redirects child stdout/stderr to a log file
 *   - Auto-restarts the child on crash (with sleep + max attempts)
 *   - Runs on-error / on-restart hook commands
 *   - Cleans up PID files on exit
 * Usage:
 *   node monitor.js --cmd <command>
 *                    --logfile <path>
 *                    --pidfile <path>
 *                    --monpidfile <path>
 *                    [--sleep <ms>]
 *                    [--attempts <n>]
 *                    [--on-error <command>]
 *                    [--on-restart <command>]
 *                    [--prefix <string>]
 */

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var minimist = require('minimist');

/**
 * Parse arguments.
 */

var argv = minimist(process.argv.slice(2), {
  string: ['cmd', 'logfile', 'pidfile', 'monpidfile', 'on-error', 'on-restart', 'prefix'],
  default: {
    sleep: 1000,
    attempts: Infinity
  }
});

var cmd = argv.cmd;
var logfile = argv.logfile;
var pidfile = argv.pidfile;
var monpidfile = argv.monpidfile;
var sleepMs = parseInt(argv.sleep, 10) || 1000;
var maxAttempts = argv.attempts === 'Infinity' ? Infinity : (parseInt(argv.attempts, 10) || Infinity);
var onError = argv['on-error'];
var onRestart = argv['on-restart'];
var prefix = argv.prefix;
if (!cmd || !logfile || !pidfile || !monpidfile) {
  console.error('monitor: --cmd, --logfile, --pidfile, and --monpidfile are required');
  process.exit(1);
}

/**
 * State.
 */

var child = null;
var attempts = 0;
var stopping = false;
var logFd = null;

/**
 * Write a diagnostic message to the log file.
 *
 * @param {String} msg
 */

function log(msg) {
  fs.writeSync(logFd, 'minnx : ' + msg + '\n');
}

/**
 * Write our own PID to monpidfile.
 */

fs.writeFileSync(monpidfile, String(process.pid));

/**
 * Open log file for appending.
 */

logFd = fs.openSync(logfile, 'a');

log('write monitor pid to ' + monpidfile);

/**
 * Spawn the child process.
 */

function spawnChild() {
  var parts = parseCommand(cmd);
  var opts = { stdio: ['ignore', 'pipe', 'pipe'] };
  var handled = false;

  child = spawn(parts[0], parts.slice(1), opts);

  // write child PID
  fs.writeFileSync(pidfile, String(child.pid));

  log('child ' + child.pid);
  log('write pid to ' + pidfile);
  log(cmd);

  // pipe output to log file
  if (prefix) {
    pipeWithPrefix(child.stdout, prefix);
    pipeWithPrefix(child.stderr, prefix);
  } else {
    child.stdout.on('data', function(data) {
      fs.writeSync(logFd, data);
    });
    child.stderr.on('data', function(data) {
      fs.writeSync(logFd, data);
    });
  }

  function onExit(code, signal) {
    if (handled || stopping) return;
    handled = true;

    attempts++;

    var reason = signal
      ? 'killed by signal ' + signal
      : 'exited with code ' + code;
    log('child died (' + reason + '), attempt ' + attempts + '/' + (maxAttempts === Infinity ? '∞' : maxAttempts));

    // run on-error hook
    if (onError) {
      log('on-error: ' + onError);
      exec(onError, function() {});
    }

    if (attempts >= maxAttempts) {
      log('max attempts reached, giving up');
      cleanup();
      process.exit(1);
      return;
    }

    // run on-restart hook
    if (onRestart) {
      log('on-restart: ' + onRestart);
      exec(onRestart, function() {});
    }

    log('restarting in ' + sleepMs + 'ms');

    // respawn after sleep
    setTimeout(spawnChild, sleepMs);
  }

  child.on('exit', onExit);

  child.on('error', function(err) {
    log('spawn error: ' + err.message);
    onExit(1, null);
  });
}

/**
 * Pipe a readable stream to the log file with a prefix on each line.
 *
 * @param {ReadableStream} stream
 * @param {String} pfx
 */

function pipeWithPrefix(stream, pfx) {
  var buf = '';
  stream.on('data', function(data) {
    buf += data.toString();
    var lines = buf.split('\n');
    // keep the last incomplete line in the buffer
    buf = lines.pop();
    lines.forEach(function(line) {
      fs.writeSync(logFd, pfx + ' ' + line + '\n');
    });
  });
  stream.on('end', function() {
    if (buf.length) {
      fs.writeSync(logFd, pfx + ' ' + buf + '\n');
      buf = '';
    }
  });
}

/**
 * Parse a command string into an array of arguments.
 * Handles simple quoting.
 *
 * @param {String} str
 * @return {Array}
 */

function parseCommand(str) {
  var args = [];
  var current = '';
  var inQuote = false;
  var quoteChar = '';

  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (inQuote) {
      if (c === quoteChar) {
        inQuote = false;
      } else {
        current += c;
      }
    } else if (c === '"' || c === "'") {
      inQuote = true;
      quoteChar = c;
    } else if (c === ' ' || c === '\t') {
      if (current.length) {
        args.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }

  if (current.length) args.push(current);
  return args;
}

/**
 * Cleanup PID files.
 */

function cleanup() {
  log('bye :)');
  try { fs.closeSync(logFd); } catch (e) {}
  try { fs.unlinkSync(pidfile); } catch (e) {}
  try { fs.unlinkSync(monpidfile); } catch (e) {}
}

/**
 * Handle termination signals.
 */

function onSignal() {
  if (stopping) return;
  stopping = true;
  log('shutting down');
  if (child) {
    log('kill(' + child.pid + ', SIGTERM)');
    try { child.kill('SIGTERM'); } catch (e) {}
  }
  log('waiting for exit');
  // give child a moment to exit, then cleanup
  setTimeout(function() {
    cleanup();
    process.exit(0);
  }, 500);
}

process.on('SIGTERM', onSignal);
process.on('SIGINT', onSignal);
process.on('SIGQUIT', onSignal);

/**
 * Start.
 */

spawnChild();
