#!/usr/bin/env node

/**
 * Claude Code statusline script for minnux.
 *
 * This script is invoked by Claude Code's statusline feature.
 * It receives JSON data on stdin with cost, model, and token info.
 * It writes stats to our stats file and outputs a status line display.
 *
 * Usage: node claude-statusline.js <name> <stats-file>
 */

var fs = require('fs');
var path = require('path');

var name = process.argv[2];
var statsFile = process.argv[3];

if (!name || !statsFile) {
  process.exit(0);
}

// Read JSON from stdin
var input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk) {
  input += chunk;
});

process.stdin.on('end', function() {
  try {
    var data = JSON.parse(input);

    // Extract stats from Claude Code's JSON
    var model = data.model ? data.model.display_name : null;
    var cost = data.cost ? (data.cost.total_cost_usd || 0) : 0;
    var inputTokens = data.context_window ? (data.context_window.total_input_tokens || 0) : 0;
    var outputTokens = data.context_window ? (data.context_window.total_output_tokens || 0) : 0;

    // Determine state based on context
    // Claude Code doesn't expose a "working" state directly,
    // but we can infer idle when the statusline runs (after response)
    var state = 'idle';

    // Write stats file
    var stats = {
      model: model,
      cost: Math.round(cost * 10000) / 10000,
      tokens: { input: inputTokens, output: outputTokens },
      state: state
    };

    // Ensure directory exists
    try {
      fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    } catch (e) {}

    fs.writeFileSync(statsFile, JSON.stringify(stats) + '\n');

    // Output status line for display
    var contextPct = data.context_window ? (data.context_window.used_percentage || 0) : 0;
    contextPct = Math.floor(contextPct);

    // Build progress bar
    var barWidth = 10;
    var filled = Math.floor(contextPct * barWidth / 100);
    var empty = barWidth - filled;
    var bar = '';
    for (var i = 0; i < filled; i++) bar += '▓';
    for (var i = 0; i < empty; i++) bar += '░';

    // Color based on usage
    var GREEN = '\x1b[32m';
    var YELLOW = '\x1b[33m';
    var RED = '\x1b[31m';
    var CYAN = '\x1b[36m';
    var RESET = '\x1b[0m';

    var barColor = contextPct >= 90 ? RED : contextPct >= 70 ? YELLOW : GREEN;

    // Format cost
    var costStr = '$' + cost.toFixed(4);

    // Get duration
    var durationMs = data.cost ? (data.cost.total_duration_ms || 0) : 0;
    var mins = Math.floor(durationMs / 60000);
    var secs = Math.floor((durationMs % 60000) / 1000);

    // Output: [Model] ▓▓▓░░░░░░░ 30% | $0.0123 | 5m 32s
    var line = CYAN + '[' + (model || 'Claude') + ']' + RESET + ' '
      + barColor + bar + RESET + ' ' + contextPct + '% | '
      + YELLOW + costStr + RESET + ' | '
      + mins + 'm ' + secs + 's';

    console.log(line);

  } catch (e) {
    // On error, just output a simple status
    console.log('[Claude]');
  }
});
