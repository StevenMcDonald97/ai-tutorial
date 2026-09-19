/* ════════════════════════════════════════════════════════════════════════════
   CODELAB — runnable code widgets for Course Engine Player v6.1
   ════════════════════════════════════════════════════════════════════════════

   Loaded lazily by player.html the first time a course actually uses a code
   widget. Exposes a single global: window.CodeLab.

   DESIGN CONSTRAINTS (these explain most of the odd-looking choices below):

   1. Must work from file://. That rules out ES modules, fetch() on local
      files, and external Worker files. So: classic script, and the sandbox is
      an <iframe srcdoc> rather than anything that needs an origin.

   2. Learner code is hostile by default. It runs in an iframe with
      sandbox="allow-scripts" and NO allow-same-origin, giving it an opaque
      origin. It therefore cannot touch the player's DOM, its localStorage, or
      its course state. The only channel is postMessage.

   3. Infinite loops must not freeze the page. Inside that iframe we spawn a
      blob Worker, because worker.terminate() is the only thing that reliably
      kills a spinning synchronous loop. If Worker creation fails we fall back
      to running in the iframe itself and tearing the whole iframe down on
      timeout.

   4. Two directions of escaping, and they are opposites. Learner code travels
      OUT as postMessage data and into textarea.value — never through innerHTML.
      Program output travels BACK as untrusted text and is escaped before it is
      rendered. Getting either backwards is the bug to watch for.

   The harness and worker bodies are written as real functions and stringified
   with Function.prototype.toString(), rather than kept as string literals.
   That keeps them readable and syntax-checkable instead of being a wall of
   backslashes.

   ════════════════════════════════════════════════════════════════════════════ */

(function (global) {
'use strict';

/* ─── Host integration ────────────────────────────────────────────────────
   The player injects its own helpers so CodeLab never reaches into player
   globals. Everything here has a safe standalone default, so codelab.js can
   also be opened on its own for development. */
var host = {
  esc:      function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
              return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            }); },
  mdInline: null,   // set by configure(); falls back to esc
  smartMd:  null,   // set by configure(); falls back to esc
  toast:    function (m) { try { console.info('[CodeLab]', m); } catch (e) {} },
  getState: function () { return null; },
  setState: function () {},
  onGraded: function () {},
  onRan:    function () {}
};

function esc(s)      { return host.esc(s); }
function mdInline(s) { return host.mdInline ? host.mdInline(s) : esc(s); }
function smartMd(s)  { return host.smartMd  ? host.smartMd(s)  : '<p>' + esc(s) + '</p>'; }


/* ════════════════════════════════════════════════════════════════════════
   1. LANGUAGES
   ════════════════════════════════════════════════════════════════════════
   Only these three execute. Everything else still renders as a normal,
   non-runnable code block, so authoring a Rust example is never an error —
   it just doesn't get a Run button. */

var LANGS = {
  javascript: {
    label: 'JavaScript', engine: 'js', comment: '//',
    aliases: ['js', 'javascript', 'node', 'jsx']
  },
  python: {
    label: 'Python', engine: 'python', comment: '#',
    aliases: ['py', 'python', 'python3']
  },
  sql: {
    label: 'SQL', engine: 'sql', comment: '--',
    aliases: ['sql', 'sqlite']
  }
};

/** Map an author's language id onto a CodeLab engine id, or null if we can't run it. */
function normalizeLang(raw) {
  var l = String(raw || '').toLowerCase().trim();
  for (var key in LANGS) {
    if (LANGS[key].aliases.indexOf(l) !== -1) return key;
  }
  return null;
}

function isRunnable(raw) { return normalizeLang(raw) !== null; }

function langLabel(raw) {
  var k = normalizeLang(raw);
  return k ? LANGS[k].label : String(raw || 'code');
}

function commentToken(raw) {
  var k = normalizeLang(raw);
  return k ? LANGS[k].comment : '//';
}

/* Runtimes fetched on demand. Pinned versions — a floating "latest" would mean
   a course that worked yesterday can break today. */
var CDN = {
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  sqlJs:   'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'
};


/* ════════════════════════════════════════════════════════════════════════
   2. SANDBOX HARNESS  (runs inside the iframe, opaque origin)
   ════════════════════════════════════════════════════════════════════════
   Receives {t:'run', ...} jobs, dispatches by engine, posts back
   {t:'result', ...} or {t:'progress', ...}. It never touches the parent
   document — it can't, and that's the point. */

function harnessMain() {
  var JS_WORKER = window.__CL_JS_WORKER__;
  var JEST_SHIM = window.__CL_JEST_SHIM__;
  var PY_DRIVER = window.__CL_PY_DRIVER__;
  var CDN       = window.__CL_CDN__;

  var pyodide = null;        // cached across runs — loading it is the expensive part
  var pyodideLoading = null;
  var SQL = null;
  var sqlLoading = null;

  function send(msg) { parent.postMessage(msg, '*'); }
  function progress(id, note) { send({ t: 'progress', id: id, note: note }); }

  /* Load a classic script into this iframe. Used for Pyodide and sql.js.
     Both set a global; neither is a module. */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ── JavaScript: blob Worker, terminable ────────────────────────────── */
  function runJs(job) {
    return new Promise(function (resolve) {
      var parts = [];
      if (job.mode === 'tests') parts.push('(' + JEST_SHIM + ')(self);');
      parts.push('(' + JS_WORKER + ')();');

      var worker, url;
      try {
        url = URL.createObjectURL(new Blob([parts.join('\n')], { type: 'text/javascript' }));
        worker = new Worker(url);
      } catch (err) {
        // Worker unavailable (very old browser, or a policy we didn't predict).
        // Fall back to in-iframe execution. We lose loop-interruption here, so
        // the host's teardown timer becomes the only backstop.
        resolve(runJsInline(job));
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        worker.terminate();
        resolve({
          ok: false, timedOut: true, stdout: '', stderr: '',
          error: 'Execution timed out after ' + job.timeoutMs + 'ms. ' +
                 'If you have a loop, check that its exit condition can actually be reached.'
        });
      }, job.timeoutMs);

      worker.onmessage = function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        if (url) URL.revokeObjectURL(url);
        resolve(e.data);
      };
      worker.onerror = function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve({ ok: false, stdout: '', stderr: '', error: e.message || 'Worker error' });
      };
      worker.postMessage(job);
    });
  }

  /* Fallback path. Same contract, no loop protection. */
  function runJsInline(job) {
    return new Promise(function (resolve) {
      var fakeSelf = { onmessage: null, postMessage: function (d) { resolve(d); } };
      try {
        if (job.mode === 'tests') (new Function('return ' + JEST_SHIM))()(fakeSelf);
        (new Function('self', 'return (' + JS_WORKER + ')()'))(fakeSelf);
        fakeSelf.onmessage({ data: job });
      } catch (err) {
        resolve({ ok: false, stdout: '', stderr: '', error: String(err) });
      }
    });
  }

  /* ── Python: Pyodide ────────────────────────────────────────────────── */
  function ensurePyodide(id) {
    if (pyodide) return Promise.resolve(pyodide);
    if (pyodideLoading) return pyodideLoading;
    progress(id, 'Downloading the Python runtime — about 10 MB the first time, then cached.');
    pyodideLoading = loadScript(CDN.pyodide + 'pyodide.js')
      .then(function () {
        progress(id, 'Starting Python…');
        // indexURL must be explicit: this iframe's location is about:srcdoc,
        // so Pyodide cannot work out where its own assets live.
        return loadPyodide({ indexURL: CDN.pyodide });
      })
      .then(function (py) { pyodide = py; return py; })
      .catch(function (err) { pyodideLoading = null; throw err; });
    return pyodideLoading;
  }

  function runPython(job) {
    return ensurePyodide(job.id).then(function (py) {
      var captured = { out: [], err: [] };
      py.setStdout({ batched: function (s) { captured.out.push(s); } });
      py.setStderr({ batched: function (s) { captured.err.push(s); } });

      // PY_DRIVER defines __codelab_run__(source, mode, payload) and returns JSON.
      py.runPython(PY_DRIVER);
      var driver = py.globals.get('__codelab_run__');
      var raw = driver(job.source, job.mode || 'stdout', JSON.stringify(job.payload || {}));
      driver.destroy();

      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = { ok: false, error: String(raw) }; }

      return {
        ok: parsed.ok !== false,
        stdout: captured.out.join('\n'),
        stderr: captured.err.join('\n'),
        error: parsed.error || '',
        tests: parsed.tests || null,
        cases: parsed.cases || null
      };
    }).catch(function (err) {
      return {
        ok: false, stdout: '', stderr: '',
        error: 'Python runtime unavailable: ' + (err && err.message ? err.message : String(err)) +
               '\nThis widget needs a network connection the first time it runs Python.'
      };
    });
  }

  /* ── SQL: sql.js ────────────────────────────────────────────────────── */
  function ensureSql(id) {
    if (SQL) return Promise.resolve(SQL);
    if (sqlLoading) return sqlLoading;
    progress(id, 'Downloading the SQL engine — about 1 MB the first time, then cached.');
    sqlLoading = loadScript(CDN.sqlJs + 'sql-wasm.js')
      .then(function () {
        return initSqlJs({ locateFile: function (f) { return CDN.sqlJs + f; } });
      })
      .then(function (mod) { SQL = mod; return mod; })
      .catch(function (err) { sqlLoading = null; throw err; });
    return sqlLoading;
  }

  function runSql(job) {
    return ensureSql(job.id).then(function (SQLmod) {
      var db = new SQLmod.Database();
      var out = [];
      try {
        if (job.payload && job.payload.setupSql) db.run(job.payload.setupSql);
        var res = db.exec(job.source);
        // Render result sets as an aligned text table so stdout comparison and
        // the eye both work on the same representation.
        var tables = res.map(function (r) {
          return { columns: r.columns, values: r.values };
        });
        res.forEach(function (r) {
          out.push(r.columns.join(' | '));
          out.push(r.columns.map(function () { return '---'; }).join(' | '));
          r.values.forEach(function (row) {
            out.push(row.map(function (v) { return v === null ? 'NULL' : String(v); }).join(' | '));
          });
        });
        db.close();
        return { ok: true, stdout: out.join('\n'), stderr: '', error: '', tables: tables };
      } catch (err) {
        db.close();
        return { ok: false, stdout: out.join('\n'), stderr: '', error: String(err && err.message || err) };
      }
    }).catch(function (err) {
      return {
        ok: false, stdout: '', stderr: '',
        error: 'SQL engine unavailable: ' + (err && err.message ? err.message : String(err)) +
               '\nThis widget needs a network connection the first time it runs SQL.'
      };
    });
  }

  /* ── Dispatch ───────────────────────────────────────────────────────── */
  window.addEventListener('message', function (e) {
    var job = e.data || {};
    if (job.t !== 'run') return;
    var started = Date.now();
    var runner = job.engine === 'python' ? runPython
               : job.engine === 'sql'    ? runSql
               : runJs;

    Promise.resolve()
      .then(function () { return runner(job); })
      .then(function (res) {
        res = res || {};
        res.t = 'result';
        res.id = job.id;
        res.durationMs = Date.now() - started;
        send(res);
      })
      .catch(function (err) {
        send({
          t: 'result', id: job.id, ok: false, stdout: '', stderr: '',
          error: String(err && err.message || err), durationMs: Date.now() - started
        });
      });
  });

  send({ t: 'ready' });
}


/* ════════════════════════════════════════════════════════════════════════
   3. JS WORKER  (runs inside the blob Worker, inside the iframe)
   ════════════════════════════════════════════════════════════════════════
   Three modes:
     stdout — run, capture console output
     cases  — run, then call a named function with each argument list
     tests  — run a Jest-style suite that the shim has already installed */

function jsWorkerMain() {
  var scope = typeof self !== 'undefined' ? self : this;

  /* Pending-work tracking.
     Learner code very often looks like this:

         (async () => { const x = await load(); console.log(x); })();

     The synchronous part returns immediately, so without this we would report
     an empty result before the output ever arrived. We count outstanding
     timers, then drain before finishing. */
  var pendingTimers = 0;
  var rawSetTimeout = scope.setTimeout.bind(scope);

  if (!scope.__clabPatched) {
    scope.__clabPatched = true;
    scope.setTimeout = function (fn, ms) {
      pendingTimers++;
      var extra = Array.prototype.slice.call(arguments, 2);
      return rawSetTimeout(function () {
        try { if (typeof fn === 'function') fn.apply(null, extra); }
        finally { pendingTimers--; }
      }, ms);
    };
  }

  /* Wait until nothing is outstanding, or we run out of patience. setInterval
     never settles, so the cap is what stops a ticking clock from hanging a run. */
  function drain(budgetMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function step() {
        if (pendingTimers <= 0 || Date.now() - start > budgetMs) {
          // One more microtask turn so any .then() chains land before we read stdout.
          Promise.resolve().then(function () { Promise.resolve().then(resolve); });
          return;
        }
        rawSetTimeout(step, 5);
      })();
    });
  }

  /* Format a value the way a console would — but deterministically, because
     these strings get compared against author-supplied expected output. */
  function fmt(v, depth) {
    depth = depth || 0;
    if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'function') return '[Function' + (v.name ? ': ' + v.name : '') + ']';
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (depth > 4) return '…';
    if (Array.isArray(v)) {
      return '[ ' + v.map(function (x) { return fmt(x, depth + 1); }).join(', ') + ' ]';
    }
    if (typeof v === 'object') {
      var keys = Object.keys(v);
      if (!keys.length) return '{}';
      return '{ ' + keys.map(function (k) {
        return k + ': ' + fmt(v[k], depth + 1);
      }).join(', ') + ' }';
    }
    return String(v);
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return deepEqual(a[k], b[k]); });
  }

  scope.onmessage = function (e) {
    var job = e.data;
    var out = [];
    var push = function () {
      out.push(Array.prototype.slice.call(arguments).map(function (a) { return fmt(a); }).join(' '));
    };
    var sandboxConsole = { log: push, info: push, warn: push, error: push, debug: push };

    function finish(extra) {
      var res = { ok: true, stdout: out.join('\n'), stderr: '', error: '' };
      for (var k in extra) res[k] = extra[k];
      scope.postMessage(res);
    }
    function fail(err, extra) {
      var res = {
        ok: false, stdout: out.join('\n'), stderr: '',
        error: err && err.stack ? String(err.message || err) : String(err)
      };
      for (var k in extra || {}) res[k] = extra[k];
      scope.postMessage(res);
    }

    try {
      /* ── tests ──────────────────────────────────────────────────────── */
      if (job.mode === 'tests') {
        var suiteSrc = job.source + '\n' + (job.payload && job.payload.testSource ? job.payload.testSource : '');
        scope.__jest__.reset();
        var runSuite = new Function('console', 'describe', 'it', 'test', 'expect',
                                    'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'jest',
                                    suiteSrc);
        runSuite(sandboxConsole, scope.__jest__.describe, scope.__jest__.it, scope.__jest__.it,
                 scope.__jest__.expect, scope.__jest__.beforeEach, scope.__jest__.afterEach,
                 scope.__jest__.beforeAll, scope.__jest__.afterAll, scope.__jest__.jest);
        scope.__jest__.run().then(function (results) {
          finish({ tests: results });
        }).catch(function (err) { fail(err); });
        return;
      }

      /* ── cases ──────────────────────────────────────────────────────── */
      if (job.mode === 'cases') {
        var name = (job.payload && job.payload.functionName) || '';
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
          fail(new Error('Invalid functionName "' + name + '" in the exercise definition.'));
          return;
        }
        var factory = new Function('console',
          job.source + '\n;return (typeof ' + name + ' !== "undefined") ? ' + name + ' : undefined;');
        var target = factory(sandboxConsole);
        if (typeof target !== 'function') {
          fail(new Error('No function named "' + name + '" was defined. ' +
                         'Check the spelling, and make sure it is declared at the top level.'));
          return;
        }
        var cases = (job.payload && job.payload.cases) || [];
        var results = cases.map(function (c) {
          var rec = { args: c.args || [], expected: c.expected, name: c.name || '' };
          try {
            var got = target.apply(null, c.args || []);
            rec.actual = got;
            rec.actualText = fmt(got, 1);
            rec.expectedText = fmt(c.expected, 1);
            rec.pass = deepEqual(got, c.expected);
          } catch (err) {
            rec.pass = false;
            rec.threw = true;
            rec.actualText = 'threw ' + (err && err.message ? err.message : String(err));
            rec.expectedText = fmt(c.expected, 1);
          }
          return rec;
        });
        finish({ cases: results });
        return;
      }

      /* ── stdout (default) ───────────────────────────────────────────── */
      // Wrapped in an async IIFE so top-level `await` works the way a learner
      // expects it to, rather than being a syntax error they can't explain.
      var budget = Math.max(500, (job.timeoutMs || 5000) - 500);
      var run = new Function('console', 'return (async function(){\n' + job.source + '\n})();');
      Promise.resolve(run(sandboxConsole))
        .then(function () { return drain(budget); })
        .then(function () { finish({}); })
        .catch(function (err) {
          // Drain anyway: output printed before the failure is still useful.
          drain(Math.min(budget, 300)).then(function () { fail(err); });
        });
    } catch (err) {
      fail(err);
    }
  };
}


/* ════════════════════════════════════════════════════════════════════════
   4. JEST SHIM
   ════════════════════════════════════════════════════════════════════════
   A deliberate subset — enough for a real Jest tutorial, not a reimplementation.
   Installed onto the worker scope as __jest__. Courses should say plainly that
   this is a compatible subset, because it is. */

function jestShimMain(scope) {
  var suites = [];          // stack of {name, tests, hooks}
  var rootSuite = null;
  var current = null;

  function makeSuite(name, parent) {
    return {
      name: name, parent: parent, children: [], tests: [],
      beforeEach: [], afterEach: [], beforeAll: [], afterAll: []
    };
  }

  function reset() {
    rootSuite = makeSuite('', null);
    current = rootSuite;
    suites = [rootSuite];
  }
  reset();

  function describe(name, fn) {
    var s = makeSuite(String(name), current);
    current.children.push(s);
    var prev = current;
    current = s;
    try { fn(); } finally { current = prev; }
  }

  function it(name, fn, timeout) {
    current.tests.push({ name: String(name), fn: fn, timeout: timeout || 5000, suite: current });
  }
  it.only = it;   // single-suite runs; "only" is a no-op rather than an error
  it.skip = function (name) { current.tests.push({ name: String(name), skip: true, suite: current }); };

  function beforeEach(fn) { current.beforeEach.push(fn); }
  function afterEach(fn)  { current.afterEach.push(fn); }
  function beforeAll(fn)  { current.beforeAll.push(fn); }
  function afterAll(fn)   { current.afterAll.push(fn); }

  /* ── value formatting & comparison (shared with the worker's rules) ─── */
  function fmt(v, depth) {
    depth = depth || 0;
    if (typeof v === 'string') return JSON.stringify(v);
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'function') return '[Function' + (v.name ? ': ' + v.name : '') + ']';
    if (v instanceof Error) return v.name + '(' + JSON.stringify(v.message) + ')';
    if (depth > 4) return '…';
    if (Array.isArray(v)) return '[' + v.map(function (x) { return fmt(x, depth + 1); }).join(', ') + ']';
    if (typeof v === 'object') {
      var keys = Object.keys(v);
      if (!keys.length) return '{}';
      return '{' + keys.map(function (k) { return k + ': ' + fmt(v[k], depth + 1); }).join(', ') + '}';
    }
    return String(v);
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return deepEqual(a[k], b[k]); });
  }

  function AssertionError(message) {
    var e = new Error(message);
    e.name = 'AssertionError';
    e.isAssertion = true;
    return e;
  }

  /* ── expect() ───────────────────────────────────────────────────────── */
  function expect(actual) {
    return buildMatchers(actual, false);
  }

  function buildMatchers(actual, negated) {
    function check(pass, msg, negMsg) {
      if (negated ? pass : !pass) throw AssertionError(negated ? negMsg : msg);
    }
    var m = {
      toBe: function (exp) {
        check(Object.is(actual, exp),
          'Expected ' + fmt(exp) + '\nReceived ' + fmt(actual),
          'Expected value NOT to be ' + fmt(exp));
      },
      toEqual: function (exp) {
        check(deepEqual(actual, exp),
          'Expected ' + fmt(exp) + '\nReceived ' + fmt(actual),
          'Expected value NOT to equal ' + fmt(exp));
      },
      toStrictEqual: function (exp) { m.toEqual(exp); },
      toBeTruthy:   function () { check(!!actual, 'Expected a truthy value, received ' + fmt(actual), 'Expected a falsy value'); },
      toBeFalsy:    function () { check(!actual, 'Expected a falsy value, received ' + fmt(actual), 'Expected a truthy value'); },
      toBeNull:     function () { check(actual === null, 'Expected null, received ' + fmt(actual), 'Expected not null'); },
      toBeUndefined:function () { check(actual === undefined, 'Expected undefined, received ' + fmt(actual), 'Expected defined'); },
      toBeDefined:  function () { check(actual !== undefined, 'Expected a defined value, received undefined', 'Expected undefined'); },
      toBeNaN:      function () { check(typeof actual === 'number' && isNaN(actual), 'Expected NaN, received ' + fmt(actual), 'Expected not NaN'); },
      toBeGreaterThan:          function (n) { check(actual > n,  'Expected ' + fmt(actual) + ' > ' + fmt(n),  'Expected ' + fmt(actual) + ' not > ' + fmt(n)); },
      toBeGreaterThanOrEqual:   function (n) { check(actual >= n, 'Expected ' + fmt(actual) + ' >= ' + fmt(n), 'Expected ' + fmt(actual) + ' not >= ' + fmt(n)); },
      toBeLessThan:             function (n) { check(actual < n,  'Expected ' + fmt(actual) + ' < ' + fmt(n),  'Expected ' + fmt(actual) + ' not < ' + fmt(n)); },
      toBeLessThanOrEqual:      function (n) { check(actual <= n, 'Expected ' + fmt(actual) + ' <= ' + fmt(n), 'Expected ' + fmt(actual) + ' not <= ' + fmt(n)); },
      toBeCloseTo: function (n, digits) {
        var d = digits === undefined ? 2 : digits;
        check(Math.abs(actual - n) < Math.pow(10, -d) / 2,
          'Expected ' + fmt(actual) + ' to be close to ' + fmt(n),
          'Expected ' + fmt(actual) + ' not to be close to ' + fmt(n));
      },
      toContain: function (item) {
        var ok = typeof actual === 'string'
          ? actual.indexOf(item) !== -1
          : Array.isArray(actual) && actual.indexOf(item) !== -1;
        check(ok, 'Expected ' + fmt(actual) + ' to contain ' + fmt(item),
                  'Expected ' + fmt(actual) + ' not to contain ' + fmt(item));
      },
      toContainEqual: function (item) {
        var ok = Array.isArray(actual) && actual.some(function (x) { return deepEqual(x, item); });
        check(ok, 'Expected array to contain an item equal to ' + fmt(item),
                  'Expected array not to contain ' + fmt(item));
      },
      toHaveLength: function (n) {
        check(actual && actual.length === n,
          'Expected length ' + n + ', received ' + (actual ? actual.length : 'undefined'),
          'Expected length not to be ' + n);
      },
      toHaveProperty: function (path, value) {
        var parts = String(path).split('.'), cur = actual, ok = true;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null || !(parts[i] in Object(cur))) { ok = false; break; }
          cur = cur[parts[i]];
        }
        if (ok && arguments.length > 1) ok = deepEqual(cur, value);
        check(ok, 'Expected object to have property "' + path + '"' +
                  (arguments.length > 1 ? ' equal to ' + fmt(value) + ', received ' + fmt(cur) : ''),
                  'Expected object not to have property "' + path + '"');
      },
      toMatch: function (re) {
        var ok = re instanceof RegExp ? re.test(String(actual)) : String(actual).indexOf(String(re)) !== -1;
        check(ok, 'Expected ' + fmt(actual) + ' to match ' + re,
                  'Expected ' + fmt(actual) + ' not to match ' + re);
      },
      toBeInstanceOf: function (Ctor) {
        check(actual instanceof Ctor,
          'Expected an instance of ' + (Ctor && Ctor.name || Ctor),
          'Expected not an instance of ' + (Ctor && Ctor.name || Ctor));
      },
      toThrow: function (expected) {
        if (typeof actual !== 'function') throw AssertionError('toThrow() needs a function — wrap the call in () => ...');
        var threw = false, err = null;
        try { actual(); } catch (e) { threw = true; err = e; }
        var ok = threw;
        if (threw && expected !== undefined) {
          var msg = err && err.message ? err.message : String(err);
          ok = expected instanceof RegExp ? expected.test(msg) : msg.indexOf(String(expected)) !== -1;
        }
        check(ok,
          threw ? 'Threw ' + fmt(err && err.message) + ', which does not match ' + fmt(expected)
                : 'Expected the function to throw, but it did not',
          'Expected the function not to throw, but it threw ' + fmt(err && err.message));
      },
      /* ── mock function matchers ── */
      toHaveBeenCalled: function () {
        requireMock(actual);
        check(actual.mock.calls.length > 0,
          'Expected the mock to have been called, but it was not',
          'Expected the mock not to have been called');
      },
      toHaveBeenCalledTimes: function (n) {
        requireMock(actual);
        check(actual.mock.calls.length === n,
          'Expected ' + n + ' call(s), received ' + actual.mock.calls.length,
          'Expected not to be called ' + n + ' time(s)');
      },
      toHaveBeenCalledWith: function () {
        requireMock(actual);
        var want = Array.prototype.slice.call(arguments);
        var ok = actual.mock.calls.some(function (c) { return deepEqual(c, want); });
        check(ok,
          'Expected a call with ' + fmt(want) + '\nActual calls: ' + fmt(actual.mock.calls),
          'Expected no call with ' + fmt(want));
      },
      toHaveBeenLastCalledWith: function () {
        requireMock(actual);
        var want = Array.prototype.slice.call(arguments);
        var calls = actual.mock.calls;
        check(calls.length > 0 && deepEqual(calls[calls.length - 1], want),
          'Expected last call with ' + fmt(want) + '\nActual last call: ' +
            fmt(calls.length ? calls[calls.length - 1] : null),
          'Expected last call not to be ' + fmt(want));
      }
    };

    function requireMock(v) {
      if (!v || !v.mock) throw AssertionError('This matcher needs a mock function created with jest.fn()');
    }

    if (!negated) {
      m.not = buildMatchers(actual, true);
      /* Async variants: expect(promise).resolves.toBe(x) */
      m.resolves = wrapAsync(actual, false);
      m.rejects  = wrapAsync(actual, true);
    }
    return m;
  }

  /* .resolves / .rejects return promise-returning matchers so tests can await them. */
  function wrapAsync(promise, wantRejection) {
    var out = {};
    var names = ['toBe', 'toEqual', 'toContain', 'toHaveLength', 'toMatch', 'toBeTruthy', 'toBeFalsy'];
    names.forEach(function (n) {
      out[n] = function () {
        var args = arguments;
        return Promise.resolve(promise).then(
          function (v) {
            if (wantRejection) throw AssertionError('Expected the promise to reject, but it resolved with ' + fmt(v));
            return buildMatchers(v, false)[n].apply(null, args);
          },
          function (e) {
            if (!wantRejection) throw AssertionError('Expected the promise to resolve, but it rejected with ' + fmt(e && e.message || e));
            return buildMatchers(e && e.message !== undefined ? e.message : e, false)[n].apply(null, args);
          }
        );
      };
    });
    return out;
  }

  /* ── jest.fn() ──────────────────────────────────────────────────────── */
  function fn(impl) {
    var mockFn = function () {
      var args = Array.prototype.slice.call(arguments);
      mockFn.mock.calls.push(args);
      var r;
      if (mockFn._once.length) r = mockFn._once.shift().apply(this, args);
      else if (mockFn._impl) r = mockFn._impl.apply(this, args);
      mockFn.mock.results.push({ type: 'return', value: r });
      return r;
    };
    mockFn.mock = { calls: [], results: [] };
    mockFn._impl = impl || null;
    mockFn._once = [];
    mockFn.mockReturnValue = function (v) { mockFn._impl = function () { return v; }; return mockFn; };
    mockFn.mockReturnValueOnce = function (v) { mockFn._once.push(function () { return v; }); return mockFn; };
    mockFn.mockImplementation = function (f) { mockFn._impl = f; return mockFn; };
    mockFn.mockImplementationOnce = function (f) { mockFn._once.push(f); return mockFn; };
    mockFn.mockResolvedValue = function (v) { mockFn._impl = function () { return Promise.resolve(v); }; return mockFn; };
    mockFn.mockRejectedValue = function (v) { mockFn._impl = function () { return Promise.reject(v); }; return mockFn; };
    mockFn.mockClear = function () { mockFn.mock.calls = []; mockFn.mock.results = []; return mockFn; };
    mockFn.mockReset = function () { mockFn.mockClear(); mockFn._impl = null; mockFn._once = []; return mockFn; };
    mockFn.getMockName = function () { return 'jest.fn()'; };
    return mockFn;
  }

  /* ── runner ─────────────────────────────────────────────────────────── */
  function collectHooks(suite, key) {
    var chain = [], s = suite;
    while (s) { chain.unshift(s); s = s.parent; }
    return chain.reduce(function (acc, node) { return acc.concat(node[key]); }, []);
  }

  function suitePath(suite) {
    var names = [], s = suite;
    while (s && s.name) { names.unshift(s.name); s = s.parent; }
    return names;
  }

  function runFn(f) {
    // Supports sync, promise-returning, and done-callback styles.
    if (!f) return Promise.resolve();
    if (f.length > 0) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var done = function (err) { if (settled) return; settled = true; err ? reject(err) : resolve(); };
        try { f(done); } catch (e) { done(e); }
      });
    }
    return Promise.resolve().then(function () { return f(); });
  }

  function run() {
    var flat = [];
    (function walk(s) {
      s.tests.forEach(function (t) { flat.push(t); });
      s.children.forEach(walk);
    })(rootSuite);

    var results = [];
    var chain = Promise.resolve();

    flat.forEach(function (t) {
      chain = chain.then(function () {
        if (t.skip) {
          results.push({ name: t.name, path: suitePath(t.suite), status: 'skip', message: '', durationMs: 0 });
          return;
        }
        var started = Date.now();
        var befores = collectHooks(t.suite, 'beforeEach');
        var afters  = collectHooks(t.suite, 'afterEach').slice().reverse();

        var p = Promise.resolve();
        befores.forEach(function (h) { p = p.then(function () { return runFn(h); }); });
        p = p.then(function () { return runFn(t.fn); });

        return p.then(
          function () {
            var q = Promise.resolve();
            afters.forEach(function (h) { q = q.then(function () { return runFn(h); }); });
            return q.then(function () {
              results.push({ name: t.name, path: suitePath(t.suite), status: 'pass', message: '', durationMs: Date.now() - started });
            });
          },
          function (err) {
            var q = Promise.resolve();
            afters.forEach(function (h) { q = q.then(function () { return runFn(h); }).catch(function () {}); });
            return q.then(function () {
              results.push({
                name: t.name, path: suitePath(t.suite), status: 'fail',
                message: err && err.message ? err.message : String(err),
                isAssertion: !!(err && err.isAssertion),
                durationMs: Date.now() - started
              });
            });
          }
        );
      });
    });

    return chain.then(function () { return results; });
  }

  scope.__jest__ = {
    describe: describe, it: it, expect: expect,
    beforeEach: beforeEach, afterEach: afterEach,
    beforeAll: beforeAll, afterAll: afterAll,
    jest: { fn: fn, clearAllMocks: function () {}, resetAllMocks: function () {} },
    reset: reset, run: run
  };
}


/* ════════════════════════════════════════════════════════════════════════
   5. PYTHON DRIVER  (source injected into Pyodide)
   ════════════════════════════════════════════════════════════════════════
   Mirrors the JS worker's three modes and returns the same JSON shape, so the
   results panel doesn't need to know which language it is rendering. */

var PY_DRIVER_SOURCE = [
  'import json, io, sys, traceback, unittest',
  '',
  'def __codelab_run__(source, mode, payload_json):',
  '    payload = json.loads(payload_json or "{}")',
  '    env = {"__name__": "__main__"}',
  '    try:',
  '        exec(compile(source, "<your code>", "exec"), env)',
  '    except Exception:',
  '        return json.dumps({"ok": False, "error": traceback.format_exc(limit=3)})',
  '',
  '    if mode == "cases":',
  '        name = payload.get("functionName") or ""',
  '        target = env.get(name)',
  '        if not callable(target):',
  '            return json.dumps({"ok": False,',
  '                "error": "No function named \'%s\' was defined. Check the spelling, and make sure it is at the top level." % name})',
  '        out = []',
  '        for c in payload.get("cases", []):',
  '            rec = {"args": c.get("args", []), "name": c.get("name", "")}',
  '            try:',
  '                got = target(*c.get("args", []))',
  '                rec["actualText"] = repr(got)',
  '                rec["expectedText"] = repr(c.get("expected"))',
  '                rec["pass"] = (got == c.get("expected"))',
  '            except Exception as e:',
  '                rec["pass"] = False',
  '                rec["threw"] = True',
  '                rec["actualText"] = "raised %s: %s" % (type(e).__name__, e)',
  '                rec["expectedText"] = repr(c.get("expected"))',
  '            out.append(rec)',
  '        return json.dumps({"ok": True, "cases": out})',
  '',
  '    if mode == "tests":',
  '        test_src = payload.get("testSource") or ""',
  '        if test_src:',
  '            try:',
  '                exec(compile(test_src, "<tests>", "exec"), env)',
  '            except Exception:',
  '                return json.dumps({"ok": False, "error": traceback.format_exc(limit=3)})',
  '        loader = unittest.TestLoader()',
  '        suite = unittest.TestSuite()',
  '        for key, val in list(env.items()):',
  '            if isinstance(val, type) and issubclass(val, unittest.TestCase):',
  '                suite.addTests(loader.loadTestsFromTestCase(val))',
  '        buf = io.StringIO()',
  '        runner = unittest.TextTestRunner(stream=buf, verbosity=0)',
  '        result = runner.run(suite)',
  '        failed = {}',
  '        for case, tb in list(result.failures) + list(result.errors):',
  '            failed[str(case)] = tb.strip().split("\\n")[-1]',
  '        tests = []',
  '        for case in suite:',
  '            for t in (case if hasattr(case, "__iter__") else [case]):',
  '                key = str(t)',
  '                nm = key.split(" ")[0]',
  '                cls = key.split("(")[-1].rstrip(")").split(".")[-1] if "(" in key else ""',
  '                tests.append({"name": nm, "path": [cls] if cls else [],',
  '                              "status": "fail" if key in failed else "pass",',
  '                              "message": failed.get(key, ""), "durationMs": 0})',
  '        return json.dumps({"ok": True, "tests": tests})',
  '',
  '    return json.dumps({"ok": True})'
].join('\n');


/* ════════════════════════════════════════════════════════════════════════
   6. SANDBOX CLIENT  (host side)
   ════════════════════════════════════════════════════════════════════════ */

var sandbox = {
  frame: null,
  ready: null,
  jobs: {},          // id -> {resolve, onProgress}
  seq: 0
};

function buildHarnessHtml() {
  // JSON.stringify does all the escaping, so none of the bodies below need
  // hand-written backslashes.
  return '<!doctype html><meta charset="utf-8"><body><script>' +
    'window.__CL_JS_WORKER__=' + JSON.stringify(jsWorkerMain.toString()) + ';' +
    'window.__CL_JEST_SHIM__=' + JSON.stringify(jestShimMain.toString()) + ';' +
    'window.__CL_PY_DRIVER__=' + JSON.stringify(PY_DRIVER_SOURCE) + ';' +
    'window.__CL_CDN__=' + JSON.stringify(CDN) + ';' +
    '(' + harnessMain.toString() + ')();' +
    '<\/script></body>';
}

function ensureSandbox() {
  if (sandbox.ready) return sandbox.ready;

  sandbox.ready = new Promise(function (resolve, reject) {
    var frame = document.createElement('iframe');
    // No allow-same-origin: the frame gets an opaque origin and cannot reach
    // the player's DOM, storage, or course state.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', 'CodeLab execution sandbox');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = buildHarnessHtml();

    var giveUp = setTimeout(function () {
      reject(new Error('The code sandbox did not start.'));
    }, 10000);

    function onMessage(e) {
      if (!sandbox.frame || e.source !== sandbox.frame.contentWindow) return;
      var d = e.data || {};
      if (d.t === 'ready') { clearTimeout(giveUp); resolve(frame); return; }
      if (d.t === 'progress') {
        var pj = sandbox.jobs[d.id];
        if (pj && pj.onProgress) pj.onProgress(d.note);
        return;
      }
      if (d.t === 'result') {
        var job = sandbox.jobs[d.id];
        if (!job) return;
        delete sandbox.jobs[d.id];
        clearTimeout(job.killTimer);
        job.resolve(d);
      }
    }

    global.addEventListener('message', onMessage);
    sandbox.frame = frame;
    document.body.appendChild(frame);
  });

  return sandbox.ready;
}

/** Nuclear option: used when a job blows its deadline and the Worker path was
    unavailable, so nothing inside the frame can be interrupted. */
function resetSandbox() {
  try {
    if (sandbox.frame && sandbox.frame.parentNode) sandbox.frame.parentNode.removeChild(sandbox.frame);
  } catch (e) {}
  sandbox.frame = null;
  sandbox.ready = null;
  Object.keys(sandbox.jobs).forEach(function (id) { delete sandbox.jobs[id]; });
}

/**
 * Execute one program.
 * @param {object} opts  {language, source, mode, payload, timeoutMs, onProgress}
 * @returns {Promise<object>} {ok, stdout, stderr, error, tests, cases, durationMs, timedOut}
 */
function run(opts) {
  var engine = normalizeLang(opts.language);
  if (!engine) {
    return Promise.resolve({
      ok: false, stdout: '', stderr: '',
      error: 'CodeLab cannot run "' + (opts.language || 'unknown') + '". ' +
             'Runnable languages are JavaScript, Python and SQL.'
    });
  }

  var timeoutMs = opts.timeoutMs || (engine === 'python' ? 15000 : 5000);

  return ensureSandbox().then(function (frame) {
    return new Promise(function (resolve) {
      var id = ++sandbox.seq;

      // Outer deadline. The harness has its own inner timer that terminates the
      // Worker; this one only fires if the harness itself became unresponsive,
      // and it takes the whole iframe with it.
      var killTimer = setTimeout(function () {
        if (!sandbox.jobs[id]) return;
        delete sandbox.jobs[id];
        resetSandbox();
        resolve({
          ok: false, timedOut: true, stdout: '', stderr: '',
          error: 'Execution timed out. The sandbox was restarted.'
        });
      }, timeoutMs + 20000);

      sandbox.jobs[id] = { resolve: resolve, onProgress: opts.onProgress, killTimer: killTimer };

      frame.contentWindow.postMessage({
        t: 'run', id: id, engine: engine,
        source: String(opts.source == null ? '' : opts.source),
        mode: opts.mode || 'stdout',
        payload: opts.payload || {},
        timeoutMs: timeoutMs
      }, '*');
    });
  }).catch(function (err) {
    return { ok: false, stdout: '', stderr: '', error: String(err && err.message || err) };
  });
}


/* ════════════════════════════════════════════════════════════════════════
   7. SYNTAX HIGHLIGHTING
   ════════════════════════════════════════════════════════════════════════
   Same token classes the player already uses (.tok-k/.tok-s/.tok-n/.tok-c),
   so a live editor and a static code block look like the same material. */

var KEYWORDS = {
  javascript: 'const let var function return if else for while do class new import export from ' +
              'async await try catch finally throw switch case break continue typeof instanceof of in ' +
              'extends super this default null undefined true false yield static get set delete void ' +
              'describe it test expect beforeEach afterEach beforeAll afterAll jest',
  python:     'def return if elif else for while class import from as with try except finally raise ' +
              'lambda pass None True False and or not in is global nonlocal yield async await del ' +
              'print assert break continue self unittest',
  sql:        'select from where insert into update delete set values join left right inner outer full ' +
              'on group by order having limit offset create table alter drop index primary key foreign ' +
              'references not null and or as distinct union all case when then end between like exists'
};

function escapeCode(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

/** Highlight one line. Strings and comments are stashed first so keyword and
    number rules can't corrupt their contents. */
function highlightLine(line, lang) {
  var key = normalizeLang(lang) || 'javascript';
  var kws = (KEYWORDS[key] || '').split(' ').filter(Boolean);
  var kwRe = kws.length ? new RegExp('\\b(' + kws.join('|') + ')\\b', 'g') : null;
  var cmtRe = key === 'python' ? /#.*$/ : key === 'sql' ? /--.*$/ : /\/\/.*$/;

  var s = escapeCode(line);
  var hold = [];
  var stash = function (html) { hold.push(html); return String.fromCharCode(0xE000 + hold.length - 1); };

  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, function (m) {
    return stash('<span class="tok-s">' + m + '</span>');
  });
  s = s.replace(cmtRe, function (m) { return stash('<span class="tok-c">' + m + '</span>'); });
  if (kwRe) s = s.replace(kwRe, '<span class="tok-k">$1</span>');
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-n">$1</span>');
  s = s.replace(/[-]/g, function (c) { return hold[c.charCodeAt(0) - 0xE000] || c; });
  return s;
}

function highlightBlock(code, lang) {
  return String(code == null ? '' : code).replace(/\r\n?/g, '\n').split('\n')
    .map(function (l) { return highlightLine(l, lang) || ' '; }).join('\n');
}


/* ════════════════════════════════════════════════════════════════════════
   8. EDITABLE REGIONS
   ════════════════════════════════════════════════════════════════════════
   Authors mark the part the learner should fill in with sentinel comments:

       function total(items) {
         // [[edit]]
         return 0;
         // [[/edit]]
       }

   Any line containing [[edit]] / [[/edit]] opens and closes a region, so the
   same markers work in //, # and -- comment syntax. No markers at all means
   the whole program is editable.

   This is the code analogue of workedExamples.fadedVariant: the learner edits
   three lines inside twenty, instead of facing a blank page. */

var EDIT_OPEN  = /\[\[\s*edit\s*\]\]/i;
var EDIT_CLOSE = /\[\[\s*\/\s*edit\s*\]\]/i;

/**
 * Split starter code into ordered segments.
 * @returns {Array<{kind:'locked'|'edit', text:string, startLine:number}>}
 */
function parseRegions(starter) {
  var lines = String(starter == null ? '' : starter).replace(/\r\n?/g, '\n').split('\n');
  var hasMarkers = lines.some(function (l) { return EDIT_OPEN.test(l) || EDIT_CLOSE.test(l); });

  if (!hasMarkers) {
    return [{ kind: 'edit', text: lines.join('\n'), startLine: 1 }];
  }

  var segments = [];
  var buf = [];
  var mode = 'locked';
  var lineNo = 1;

  function flush() {
    if (!buf.length) return;
    segments.push({ kind: mode, text: buf.join('\n'), startLine: lineNo });
    lineNo += buf.length;
    buf = [];
  }

  lines.forEach(function (line) {
    if (EDIT_OPEN.test(line))  { flush(); mode = 'edit';   return; }  // marker line itself is dropped
    if (EDIT_CLOSE.test(line)) { flush(); mode = 'locked'; return; }
    buf.push(line);
  });
  flush();

  return segments.filter(function (s) { return s.text.length || s.kind === 'edit'; });
}

/** Reassemble a full program from locked segments + the learner's current edits. */
function assembleSource(segments, edits) {
  var i = -1;
  return segments.map(function (seg) {
    if (seg.kind === 'locked') return seg.text;
    i++;
    return edits[i] !== undefined ? edits[i] : seg.text;
  }).join('\n');
}


/* ════════════════════════════════════════════════════════════════════════
   9. OUTPUT COMPARISON
   ════════════════════════════════════════════════════════════════════════ */

/** Normalize according to the author's chosen strictness. */
function normalizeOutput(text, match) {
  var s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (match === 'exact') return s;
  if (match === 'normalize-whitespace') {
    return s.split('\n').map(function (l) { return l.trim().replace(/\s+/g, ' '); })
            .filter(function (l, i, a) { return l.length || i < a.length - 1; })
            .join('\n').trim();
  }
  return s.trim();   // 'trim' is the default: forgiving about surrounding blank lines
}

/** Make invisible differences visible — this is usually why "it looks identical". */
function revealWhitespace(line) {
  return escapeCode(line)
    .replace(/\t/g, '<span class="clab-ws">→   </span>')
    .replace(/ +$/, function (m) { return '<span class="clab-ws">' + '·'.repeat(m.length) + '</span>'; });
}

/**
 * Line-by-line comparison. Unified rather than side-by-side, because
 * side-by-side is unreadable on a phone.
 */
function diffLines(expected, actual, match) {
  var e = normalizeOutput(expected, match).split('\n');
  var a = normalizeOutput(actual, match).split('\n');
  var n = Math.max(e.length, a.length);
  var rows = [];
  for (var i = 0; i < n; i++) {
    rows.push({
      line: i + 1,
      expected: e[i],
      actual: a[i],
      same: e[i] === a[i]
    });
  }
  return rows;
}


/* ════════════════════════════════════════════════════════════════════════
   10. STYLES
   ════════════════════════════════════════════════════════════════════════
   Injected once, on first use. All class names are prefixed clab- to stay out
   of the player's namespace (it already owns .cl, .cl-n, .cl-t). Token classes
   .tok-* are shared on purpose so highlighting matches the static blocks.
   Colours come from the player's CSS custom properties, with literal fallbacks
   so this file still looks right if opened on its own. */

var STYLES = [
'.clab{margin:0 0 22px;border:1px solid var(--line,#ddd6c7);border-radius:var(--radius-lg,8px);',
'  background:var(--surface-raised,#fff);overflow:hidden}',
'.clab-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 16px;',
'  background:var(--paper-deep,#ece7dc);border-bottom:1px solid var(--line,#ddd6c7)}',
'.clab-kind{font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;',
'  color:var(--accent,#7a2e1d);display:flex;align-items:center;gap:7px}',
'.clab-lang{margin-left:auto;font-family:var(--mono,monospace);font-size:10.5px;letter-spacing:.08em;',
'  text-transform:uppercase;color:var(--ink-faint,#928c7d);border:1px solid var(--line,#ddd6c7);',
'  border-radius:99px;padding:2px 9px;background:var(--surface,#fbf9f4)}',
'.clab-status{font-size:11px;font-weight:600;letter-spacing:.04em;padding:2px 9px;border-radius:99px}',
'.clab-status.is-pass{color:var(--good,#3f6d4e);background:var(--good-wash,#e6efe7)}',
'.clab-status.is-fail{color:var(--warn,#9c3527);background:var(--warn-wash,#f7e4e0)}',
'.clab-prompt{padding:16px 20px 4px;font-family:var(--read,Georgia,serif);font-size:15.5px;',
'  line-height:1.62;color:var(--ink-soft,#5f5a4f)}',
'.clab-prompt p{margin-bottom:10px}',
'.clab-prompt code{font-family:var(--mono,monospace);font-size:.9em;background:var(--paper-deep,#ece7dc);',
'  padding:1px 5px;border-radius:3px}',

/* ── editor ──
   Gutter and code MUST share an identical line box, or the numbers drift a
   little further out of line with every row. They have different font sizes,
   so the line-height is pinned in px rather than left as a ratio. */
'.clab{--clab-fs:13px;--clab-lh:21px;--clab-pad:8px}',
'.clab-editor{background:#2a2721;position:relative}',
'.clab-seg{position:relative;display:flex;font-family:var(--mono,monospace);',
'  font-size:var(--clab-fs,13px);line-height:var(--clab-lh,21px)}',
'.clab-seg.is-locked{background:#242119}',
'.clab-seg.is-edit{background:#2f2b23;box-shadow:inset 3px 0 0 var(--gold,#9a6a18)}',
'.clab-editor .clab-seg:first-child{padding-top:var(--clab-pad,8px)}',
'.clab-editor .clab-seg:last-child{padding-bottom:var(--clab-pad,8px)}',
'.clab-gutter{flex:0 0 auto;text-align:right;user-select:none;color:#6d6858;',
'  font-size:11px;line-height:var(--clab-lh,21px);min-width:3.1em;padding-right:10px}',
'.clab-gutter span{display:block;height:var(--clab-lh,21px)}',
'.clab-gutter .clab-lock{color:#55503f}',
'.clab-codewrap{flex:1 1 auto;position:relative;padding-right:14px;overflow-x:auto}',
'.clab-static{margin:0;white-space:pre;color:#8f8a78;line-height:var(--clab-lh,21px)}',  /* locked text is dimmed */
'.clab-static code{font-family:inherit;font-size:inherit;line-height:inherit}',
'.clab-input,.clab-mirror{font-family:var(--mono,monospace);font-size:var(--clab-fs,13px);',
'  line-height:var(--clab-lh,21px);white-space:pre;word-wrap:normal;tab-size:2;border:0;',
'  padding:0;margin:0;letter-spacing:normal}',
'.clab-mirror{color:#e8e2d1;pointer-events:none;min-height:var(--clab-lh,21px)}',
'.clab-input{position:absolute;inset:0 14px 0 0;width:calc(100% - 14px);height:100%;',
'  background:transparent;color:transparent;caret-color:#f0c674;resize:none;outline:none;overflow:hidden}',
'.clab-input::selection{background:rgba(240,198,116,.3);color:transparent}',
'.clab-seg.is-edit:focus-within{background:#332e25;box-shadow:inset 3px 0 0 var(--gold,#9a6a18),0 0 0 1px rgba(240,198,116,.25)}',
'.clab-editlabel{position:absolute;top:0;right:0;font-family:var(--sans,sans-serif);font-size:9px;',
'  letter-spacing:.11em;text-transform:uppercase;color:#a98d4f;background:#3a3327;',
'  padding:2px 8px;border-radius:0 0 0 5px;z-index:2;pointer-events:none}',

/* ── author-supplied tests (read-only spec) ── */
'.clab-tests{border-top:1px solid var(--line,#ddd6c7);background:var(--surface,#fbf9f4)}',
'.clab-tests > summary{cursor:pointer;padding:9px 16px;font-family:var(--sans,sans-serif);',
'  font-size:10.5px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;',
'  color:var(--indigo,#33457a);list-style:none;user-select:none}',
'.clab-tests > summary::-webkit-details-marker{display:none}',
'.clab-tests > summary::before{content:"\\25b8";display:inline-block;margin-right:7px;transition:transform .15s}',
'.clab-tests[open] > summary::before{transform:rotate(90deg)}',
'.clab-tests .clab-editor{border-top:1px solid var(--line-soft,#e8e2d5)}',

/* ── controls ── */
'.clab-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 14px;',
'  background:var(--surface,#fbf9f4);border-top:1px solid var(--line,#ddd6c7)}',
'.clab-btn{font-family:var(--sans,sans-serif);font-size:12.5px;font-weight:500;cursor:pointer;',
'  border-radius:var(--radius,4px);padding:7px 14px;border:1px solid var(--line,#ddd6c7);',
'  background:var(--surface-raised,#fff);color:var(--ink,#23211c);display:inline-flex;',
'  align-items:center;gap:6px;transition:background .15s,border-color .15s}',
'.clab-btn:hover:not(:disabled){border-color:var(--ink-faint,#928c7d)}',
'.clab-btn:disabled{opacity:.45;cursor:not-allowed}',
'.clab-btn.is-run{background:var(--ink,#23211c);color:var(--paper,#f4f1ea);border-color:var(--ink,#23211c)}',
'.clab-btn.is-check{background:var(--accent,#7a2e1d);color:#fff;border-color:var(--accent,#7a2e1d)}',
'.clab-btn.is-ghost{background:transparent;border-color:transparent;color:var(--ink-faint,#928c7d)}',
'.clab-btn.is-ghost:hover:not(:disabled){color:var(--ink,#23211c);background:var(--paper-deep,#ece7dc)}',
'.clab-spacer{margin-left:auto}',
'.clab-attempts{font-size:11.5px;color:var(--ink-faint,#928c7d);font-family:var(--sans,sans-serif)}',

/* ── results ── */
'.clab-out{border-top:1px solid var(--line,#ddd6c7);background:var(--surface,#fbf9f4)}',
'.clab-out:empty{display:none}',
'.clab-outhead{display:flex;align-items:center;gap:8px;padding:9px 16px;font-size:10.5px;',
'  font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-faint,#928c7d);',
'  border-bottom:1px solid var(--line-soft,#e8e2d5)}',
'.clab-outhead.is-pass{color:var(--good,#3f6d4e);background:var(--good-wash,#e6efe7)}',
'.clab-outhead.is-fail{color:var(--warn,#9c3527);background:var(--warn-wash,#f7e4e0)}',
'.clab-console{margin:0;padding:13px 16px;background:#2a2721;color:#e8e2d1;',
'  font-family:var(--mono,monospace);font-size:12.5px;line-height:1.6;white-space:pre-wrap;',
'  word-break:break-word;max-height:300px;overflow:auto}',
'.clab-console.is-empty{color:#7a7462;font-style:italic}',
'.clab-error{margin:0;padding:13px 16px;background:#3a241f;color:#f0b8ab;',
'  font-family:var(--mono,monospace);font-size:12.5px;line-height:1.6;white-space:pre-wrap;',
'  word-break:break-word}',
'.clab-note{padding:11px 16px;font-family:var(--read,Georgia,serif);font-size:14px;',
'  color:var(--ink-soft,#5f5a4f);line-height:1.55}',
'.clab-busy{display:flex;align-items:center;gap:9px;padding:13px 16px;font-size:13px;',
'  color:var(--ink-soft,#5f5a4f);font-family:var(--sans,sans-serif)}',
'.clab-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#7a2e1d);',
'  animation:clab-pulse 1s ease-in-out infinite}',
'@keyframes clab-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}',

/* ── diff table ── */
'.clab-diff{width:100%;border-collapse:collapse;font-family:var(--mono,monospace);font-size:12.5px}',
'.clab-diff th{background:var(--paper-deep,#ece7dc);text-align:left;padding:7px 12px;font-size:10px;',
'  letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint,#928c7d);font-weight:600;',
'  font-family:var(--sans,sans-serif);border-bottom:1px solid var(--line,#ddd6c7)}',
'.clab-diff td{padding:5px 12px;border-bottom:1px solid var(--line-soft,#e8e2d5);',
'  vertical-align:top;white-space:pre-wrap;word-break:break-word}',
'.clab-diff .clab-mark{width:1.8em;text-align:center;font-weight:700}',
'.clab-diff .clab-lineno{width:2.6em;color:var(--ink-faint,#928c7d);text-align:right;user-select:none}',
'.clab-diff tr.is-same td{color:var(--ink-faint,#928c7d)}',
'.clab-diff tr.is-diff{background:var(--warn-wash,#f7e4e0)}',
'.clab-diff tr.is-diff .clab-mark{color:var(--warn,#9c3527)}',
'.clab-diff tr.is-same .clab-mark{color:var(--good,#3f6d4e)}',
'.clab-missing{color:var(--ink-faint,#928c7d);font-style:italic}',
'.clab-ws{background:rgba(156,53,39,.16);border-radius:2px}',

/* ── case + test lists ── */
'.clab-list{list-style:none;margin:0;padding:6px 0}',
'.clab-case{display:flex;gap:10px;padding:8px 16px;align-items:flex-start;',
'  border-bottom:1px solid var(--line-soft,#e8e2d5);font-family:var(--mono,monospace);font-size:12.5px}',
'.clab-case:last-child{border-bottom:0}',
'.clab-case .clab-icon{flex:0 0 auto;font-weight:700;line-height:1.5}',
'.clab-case.is-pass .clab-icon{color:var(--good,#3f6d4e)}',
'.clab-case.is-fail{background:var(--warn-wash,#f7e4e0)}',
'.clab-case.is-fail .clab-icon{color:var(--warn,#9c3527)}',
'.clab-case.is-skip{opacity:.55}',
'.clab-casebody{flex:1 1 auto;min-width:0}',
'.clab-callsig{color:var(--ink,#23211c);word-break:break-word}',
'.clab-detail{margin-top:3px;font-size:12px;color:var(--ink-soft,#5f5a4f);white-space:pre-wrap;word-break:break-word}',
'.clab-detail b{color:var(--warn,#9c3527);font-weight:600}',
'.clab-suite{padding:9px 16px 3px;font-family:var(--sans,sans-serif);font-size:11px;font-weight:600;',
'  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint,#928c7d)}',
'.clab-tally{display:flex;gap:14px;padding:10px 16px;font-family:var(--sans,sans-serif);font-size:12.5px;',
'  border-bottom:1px solid var(--line-soft,#e8e2d5);background:var(--surface-raised,#fff)}',
'.clab-tally b{font-weight:600}',
'.clab-tally .ok{color:var(--good,#3f6d4e)}',
'.clab-tally .bad{color:var(--warn,#9c3527)}',
'.clab-dur{color:var(--ink-faint,#928c7d);font-size:11px;margin-left:auto}',

/* ── hints, solution, misconceptions ── */
'.clab-hint{margin:0;padding:12px 16px;background:var(--gold-wash,#f6ecd6);',
'  border-top:1px solid var(--line-soft,#e8e2d5);font-family:var(--read,Georgia,serif);font-size:14px;',
'  color:var(--ink-soft,#5f5a4f);line-height:1.55}',
'.clab-hint .clab-hn{font-family:var(--sans,sans-serif);font-size:10px;font-weight:600;',
'  letter-spacing:.1em;text-transform:uppercase;color:var(--gold,#9a6a18);margin-right:8px}',
'.clab-solution{border-top:1px solid var(--line,#ddd6c7);background:var(--indigo-wash,#e3e7f2)}',
'.clab-solution .clab-outhead{color:var(--indigo,#33457a);background:transparent}',
'.clab-misc{padding:12px 16px;border-top:1px solid var(--line-soft,#e8e2d5);',
'  background:var(--plum-wash,#efe6f2);font-family:var(--read,Georgia,serif);font-size:14px;line-height:1.55}',
'.clab-misc .clab-mt{font-family:var(--sans,sans-serif);font-size:10px;font-weight:600;letter-spacing:.1em;',
'  text-transform:uppercase;color:var(--plum,#5a3566);margin-bottom:5px}',
'.clab-misc q{color:var(--ink,#23211c);font-style:italic}',

/* ── predict-then-run ── */
'.clab-predict{padding:14px 16px;border-top:1px solid var(--line,#ddd6c7);background:var(--surface,#fbf9f4)}',
'.clab-predict textarea{width:100%;min-height:74px;font-family:var(--mono,monospace);font-size:12.5px;',
'  line-height:1.6;padding:10px 12px;border:1px solid var(--line,#ddd6c7);border-radius:var(--radius,4px);',
'  background:var(--surface-raised,#fff);color:var(--ink,#23211c);resize:vertical}',
'.clab-predict textarea:focus{outline:none;border-color:var(--accent-line,#e3c4ba);',
'  box-shadow:0 0 0 3px var(--accent-wash,#f3e4df)}',
'.clab-plabel{font-family:var(--sans,sans-serif);font-size:11px;font-weight:600;letter-spacing:.09em;',
'  text-transform:uppercase;color:var(--ink-faint,#928c7d);margin-bottom:7px}',
'.clab-compare{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line,#ddd6c7);',
'  border-top:1px solid var(--line,#ddd6c7)}',
'.clab-compare > div{background:var(--surface-raised,#fff);padding:12px 14px;min-width:0}',
'.clab-compare pre{margin:6px 0 0;font-family:var(--mono,monospace);font-size:12.5px;line-height:1.6;',
'  white-space:pre-wrap;word-break:break-word;color:var(--ink,#23211c)}',
'@media(max-width:620px){.clab-compare{grid-template-columns:1fr}}',

/* ── inline run button on read-only code blocks ── */
'.clab-inline-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#211e19;',
'  border-top:1px solid #3a362d}',
'.clab-inline-bar .clab-btn{font-size:11.5px;padding:5px 11px;background:#33302a;color:#e8e2d1;',
'  border-color:#4a463c}',
'.clab-inline-bar .clab-btn:hover:not(:disabled){border-color:#6d6858;background:#3d3931}',
'.clab-inline-out{background:#211e19;border-top:1px solid #3a362d}',
'.clab-inline-out .clab-console{background:transparent;padding:11px 16px}',
'.clab-inline-out:empty{display:none}',

'@media(max-width:620px){',
'  .clab-bar{gap:6px;padding:10px}',
'  .clab-btn{padding:7px 11px;font-size:12px}',
'  .clab-prompt{padding:14px 15px 3px}',
/* The floating "your code" label overlaps the code itself once lines get
   long on a narrow screen. The gold edge bar already carries that meaning. */
'  .clab-editlabel{display:none}',
'  .clab-diff td,.clab-case{font-size:12px}',
'}',

/* Respect reduced-motion preferences for the running indicator. */
'@media(prefers-reduced-motion:reduce){.clab-dot{animation:none;opacity:.7}}'
].join('\n');

var stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  var el = document.createElement('style');
  el.id = 'codelab-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
}


/* ════════════════════════════════════════════════════════════════════════
   11. WIDGET REGISTRY
   ════════════════════════════════════════════════════════════════════════
   render*() returns an HTML string (the player builds screens by string
   concatenation), then mount() finds those nodes and attaches behaviour.
   Widget instances live here between renders. */

var widgets = {};     // domId -> instance
var uid = 0;

function nextId() { return 'clab-' + (++uid); }

/** Everything the widget needs that the course file didn't provide. */
function instanceFor(el) { return widgets[el.getAttribute('data-clab')]; }


/* ════════════════════════════════════════════════════════════════════════
   12. RENDERING — editor
   ════════════════════════════════════════════════════════════════════════ */

function gutterHtml(startLine, count, locked) {
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push('<span class="' + (locked ? 'clab-lock' : '') + '">' + (startLine + i) + '</span>');
  }
  return '<div class="clab-gutter">' + out.join('') + '</div>';
}

function editorHtml(inst) {
  var segs = inst.segments;
  var editIndex = -1;
  var multiEdit = segs.filter(function (s) { return s.kind === 'edit'; }).length > 1;

  var html = segs.map(function (seg, i) {
    var lines = seg.text.split('\n');
    if (seg.kind === 'locked') {
      return '<div class="clab-seg is-locked">' +
        gutterHtml(seg.startLine, lines.length, true) +
        '<div class="clab-codewrap"><pre class="clab-static"><code>' +
          highlightBlock(seg.text, inst.language) +
        '</code></pre></div></div>';
    }
    editIndex++;
    var value = inst.edits[editIndex] !== undefined ? inst.edits[editIndex] : seg.text;
    var vLines = value.split('\n');
    return '<div class="clab-seg is-edit" data-edit="' + editIndex + '">' +
      gutterHtml(seg.startLine, vLines.length, false) +
      '<div class="clab-codewrap">' +
        (inst.hasLocked ? '<span class="clab-editlabel">' +
            (multiEdit ? 'your code ' + (editIndex + 1) : 'your code') + '</span>' : '') +
        '<pre class="clab-mirror" aria-hidden="true"><code>' + highlightBlock(value, inst.language) + '</code></pre>' +
        '<textarea class="clab-input" spellcheck="false" autocapitalize="off" autocorrect="off" ' +
          'autocomplete="off" wrap="off" aria-label="Editable code, region ' + (editIndex + 1) + '"></textarea>' +
      '</div></div>';
  }).join('');

  return '<div class="clab-editor">' + html + '</div>';
}


/* ════════════════════════════════════════════════════════════════════════
   13. RENDERING — results
   ════════════════════════════════════════════════════════════════════════
   This panel is where most of the perceived quality lives. A failure should
   always say what differed, never just "incorrect". */

function consoleHtml(text, emptyNote) {
  var s = String(text == null ? '' : text);
  if (!s.length) return '<pre class="clab-console is-empty">' + esc(emptyNote || 'No output.') + '</pre>';
  return '<pre class="clab-console">' + escapeCode(s) + '</pre>';
}

function outHead(label, tone) {
  return '<div class="clab-outhead' + (tone ? ' is-' + tone : '') + '">' +
         (tone === 'pass' ? '✓ ' : tone === 'fail' ? '✗ ' : '') + esc(label) + '</div>';
}

function diffHtml(expected, actual, match) {
  var rows = diffLines(expected, actual, match);
  var body = rows.map(function (r) {
    var cell = function (v) {
      return v === undefined
        ? '<span class="clab-missing">(no line)</span>'
        : (v === '' ? '<span class="clab-missing">(blank)</span>' : revealWhitespace(v));
    };
    return '<tr class="' + (r.same ? 'is-same' : 'is-diff') + '">' +
      '<td class="clab-mark">' + (r.same ? '✓' : '✗') + '</td>' +
      '<td class="clab-lineno">' + r.line + '</td>' +
      '<td>' + cell(r.expected) + '</td>' +
      '<td>' + cell(r.actual) + '</td></tr>';
  }).join('');

  return '<table class="clab-diff"><thead><tr>' +
    '<th></th><th>#</th><th>Expected</th><th>Your output</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table>';
}

/* Render a value the way it would be written in source, not the way JSON
   writes it — `{price: 2}` rather than `{"price":2}`. Learners read these as
   code, so they should look like code. */
function jsLiteral(v, depth) {
  depth = depth || 0;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (depth > 3) return '…';
  if (Array.isArray(v)) {
    return '[' + v.map(function (x) { return jsLiteral(x, depth + 1); }).join(', ') + ']';
  }
  if (typeof v === 'object') {
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    return '{' + keys.map(function (k) {
      // Quote the key only when it isn't a plain identifier.
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + k + "'";
      return key + ': ' + jsLiteral(v[k], depth + 1);
    }).join(', ') + '}';
  }
  return String(v);
}

function casesHtml(cases, functionName) {
  var items = cases.map(function (c) {
    var args = (c.args || []).map(function (a) { return jsLiteral(a); }).join(', ');
    var sig = c.name ? c.name : functionName + '(' + args + ')';
    var detail = c.pass
      ? '→ ' + c.actualText
      : '<b>expected</b> ' + escapeCode(c.expectedText) + '   <b>got</b> ' + escapeCode(c.actualText);
    return '<li class="clab-case ' + (c.pass ? 'is-pass' : 'is-fail') + '">' +
      '<span class="clab-icon">' + (c.pass ? '✓' : '✗') + '</span>' +
      '<div class="clab-casebody"><div class="clab-callsig">' + escapeCode(sig) + '</div>' +
      '<div class="clab-detail">' + (c.pass ? escapeCode(detail) : detail) + '</div></div></li>';
  }).join('');

  var passed = cases.filter(function (c) { return c.pass; }).length;
  return tallyHtml(passed, cases.length - passed, 0, null) +
         '<ul class="clab-list">' + items + '</ul>';
}

function tallyHtml(pass, fail, skip, durationMs) {
  return '<div class="clab-tally">' +
    '<span class="ok"><b>' + pass + '</b> passing</span>' +
    (fail ? '<span class="bad"><b>' + fail + '</b> failing</span>' : '') +
    (skip ? '<span><b>' + skip + '</b> skipped</span>' : '') +
    (durationMs != null ? '<span class="clab-dur">' + durationMs + 'ms</span>' : '') +
    '</div>';
}

function testsHtml(tests, durationMs) {
  var pass = 0, fail = 0, skip = 0;
  tests.forEach(function (t) {
    if (t.status === 'pass') pass++; else if (t.status === 'fail') fail++; else skip++;
  });

  // Group by suite path so nesting reads like Jest's own reporter.
  var groups = [];
  var lastKey = null;
  tests.forEach(function (t) {
    var key = (t.path || []).join(' › ');
    if (key !== lastKey) { groups.push({ key: key, items: [] }); lastKey = key; }
    groups[groups.length - 1].items.push(t);
  });

  var body = groups.map(function (g) {
    var head = g.key ? '<div class="clab-suite">' + esc(g.key) + '</div>' : '';
    var rows = g.items.map(function (t) {
      var cls = t.status === 'pass' ? 'is-pass' : t.status === 'fail' ? 'is-fail' : 'is-skip';
      var icon = t.status === 'pass' ? '✓' : t.status === 'fail' ? '✗' : '○';
      return '<li class="clab-case ' + cls + '">' +
        '<span class="clab-icon">' + icon + '</span>' +
        '<div class="clab-casebody"><div class="clab-callsig">' + esc(t.name) + '</div>' +
        (t.message ? '<div class="clab-detail">' + escapeCode(t.message) + '</div>' : '') +
        '</div>' +
        (t.durationMs ? '<span class="clab-dur">' + t.durationMs + 'ms</span>' : '') +
        '</li>';
    }).join('');
    return head + '<ul class="clab-list">' + rows + '</ul>';
  }).join('');

  return tallyHtml(pass, fail, skip, durationMs) + body;
}


/* ════════════════════════════════════════════════════════════════════════
   14. GRADING
   ════════════════════════════════════════════════════════════════════════
   Score decays with attempts and hints so a first-try solve is worth more than
   a brute-forced one, but never falls to zero for someone who got there.
   Revealing the solution caps the score hard. */

var SCORE_LADDER = [1, 0.8, 0.6];
var SCORE_FLOOR = 0.4;
var SOLUTION_CAP = 0.3;

function scoreFor(inst) {
  if (!inst.passed) return 0;
  var i = Math.max(0, inst.checkCount - 1);
  var base = i < SCORE_LADDER.length ? SCORE_LADDER[i] : SCORE_FLOOR;
  if (inst.hintsUsed) base = Math.max(SCORE_FLOOR, base - 0.1 * inst.hintsUsed);
  if (inst.solutionShown) base = Math.min(base, SOLUTION_CAP);
  return Math.round(base * 100) / 100;
}

/** Decide pass/fail from a run result plus the author's checker config. */
function evaluate(inst, result) {
  var check = inst.check || {};
  var mode = check.mode || 'none';

  if (!result.ok) return { passed: false, reason: 'error' };

  if (mode === 'stdout') {
    var want = normalizeOutput(check.expectedOutput, check.match);
    var got  = normalizeOutput(result.stdout, check.match);
    if (check.match === 'regex') {
      var ok = false;
      try { ok = new RegExp(check.expectedOutput, 'm').test(result.stdout); } catch (e) {}
      return { passed: ok, reason: 'stdout' };
    }
    return { passed: want === got, reason: 'stdout' };
  }

  if (mode === 'cases') {
    var cases = result.cases || [];
    return { passed: cases.length > 0 && cases.every(function (c) { return c.pass; }), reason: 'cases' };
  }

  if (mode === 'tests') {
    var tests = result.tests || [];
    var failing = tests.filter(function (t) { return t.status === 'fail'; }).length;
    var minimum = check.minimumTests || 1;
    if (failing > 0) return { passed: false, reason: 'tests' };
    // Everything green but not enough of it. Worth saying out loud, because
    // "0 failing" next to a red banner is baffling otherwise.
    if (tests.length < minimum) {
      return { passed: false, reason: 'too-few-tests', have: tests.length, need: minimum };
    }
    return { passed: true, reason: 'tests' };
  }

  return { passed: true, reason: 'none' };
}


/* ════════════════════════════════════════════════════════════════════════
   15. PUBLIC RENDER ENTRY POINTS
   ════════════════════════════════════════════════════════════════════════ */

function registerInstance(cfg) {
  injectStyles();
  var id = nextId();
  var segments = parseRegions(cfg.starterCode || '');
  var hasLocked = segments.some(function (s) { return s.kind === 'locked'; });

  // Restore prior work: the host owns persistence, we just ask for it.
  var saved = host.getState(cfg.stateKey) || {};

  var inst = {
    domId: id,
    kind: cfg.kind,                       // 'challenge' | 'playground' | 'predict' | 'inline'
    stateKey: cfg.stateKey,
    language: cfg.language,
    segments: segments,
    hasLocked: hasLocked,
    edits: Array.isArray(saved.edits) ? saved.edits.slice()
         : segments.filter(function (s) { return s.kind === 'edit'; }).map(function (s) { return s.text; }),
    check: cfg.check || null,
    hints: cfg.hints || [],
    hintsUsed: saved.hintsUsed || 0,
    solution: cfg.solution || '',
    solutionShown: !!saved.solutionShown,
    solutionAfter: cfg.solutionAfter == null ? 3 : cfg.solutionAfter,
    checkCount: saved.checkCount || 0,
    passed: !!saved.passed,
    misconception: cfg.misconception || null,
    prediction: saved.prediction || '',
    predictionCommitted: !!saved.predictionCommitted,
    predictActual: saved.predictActual || '',
    sourceOverride: cfg.sourceOverride || null,   // for inline run buttons
    testSource: cfg.testSource || '',
    showTests: cfg.showTests !== false,
    setupSql: cfg.setupSql || '',
    functionName: cfg.functionName || '',
    onGradedMeta: cfg.meta || {},
    busy: false,
    lastResult: null
  };
  widgets[id] = inst;
  return inst;
}

function persist(inst) {
  host.setState(inst.stateKey, {
    edits: inst.edits,
    checkCount: inst.checkCount,
    passed: inst.passed,
    hintsUsed: inst.hintsUsed,
    solutionShown: inst.solutionShown,
    prediction: inst.prediction,
    predictionCommitted: inst.predictionCommitted,
    predictActual: inst.predictActual
  });
}

/* When the AUTHOR supplies the tests and the learner fixes the code, the tests
   are the specification — hiding them would make the exercise guesswork. Shown
   read-only, collapsible, and only when there is something to show. */
function authorTestsHtml(inst) {
  if (!inst.testSource || inst.showTests === false) return '';
  return '<details class="clab-tests" open>' +
    '<summary>Tests you need to satisfy — read-only</summary>' +
    '<div class="clab-editor"><div class="clab-seg is-locked">' +
      gutterHtml(1, inst.testSource.split('\n').length, true) +
      '<div class="clab-codewrap"><pre class="clab-static"><code>' +
        highlightBlock(inst.testSource, inst.language) +
      '</code></pre></div>' +
    '</div></div></details>';
}

/* ── A. Code challenge (graded) ──────────────────────────────────────── */
function renderChallenge(cfg) {
  var inst = registerInstance(Object.assign({}, cfg, { kind: 'challenge' }));
  var statusChip = inst.passed
    ? '<span class="clab-status is-pass">✓ Solved</span>'
    : inst.checkCount
      ? '<span class="clab-status is-fail">' + inst.checkCount + ' attempt' + (inst.checkCount > 1 ? 's' : '') + '</span>'
      : '';

  return '<div class="clab" data-clab="' + inst.domId + '">' +
    '<div class="clab-head">' +
      '<span class="clab-kind">⌨ Code challenge</span>' +
      statusChip +
      '<span class="clab-lang">' + esc(langLabel(inst.language)) + '</span>' +
    '</div>' +
    (cfg.prompt ? '<div class="clab-prompt">' + smartMd(cfg.prompt) + '</div>' : '') +
    editorHtml(inst) +
    authorTestsHtml(inst) +
    '<div class="clab-bar">' +
      '<button class="clab-btn is-run" data-act="run">▶ Run</button>' +
      '<button class="clab-btn is-check" data-act="check">✓ Check</button>' +
      '<span class="clab-spacer"></span>' +
      (inst.hints.length ? '<button class="clab-btn is-ghost" data-act="hint">◌ Hint</button>' : '') +
      '<button class="clab-btn is-ghost" data-act="reset">↺ Reset</button>' +
    '</div>' +
    '<div class="clab-hints"></div>' +
    '<div class="clab-out"></div>' +
    '<div class="clab-extra"></div>' +
  '</div>';
}

/* ── B. Playground (ungraded) ────────────────────────────────────────── */
function renderPlayground(cfg) {
  var inst = registerInstance(Object.assign({}, cfg, { kind: 'playground' }));
  return '<div class="clab" data-clab="' + inst.domId + '">' +
    '<div class="clab-head">' +
      '<span class="clab-kind">▶ Try it</span>' +
      '<span class="clab-lang">' + esc(langLabel(inst.language)) + '</span>' +
    '</div>' +
    (cfg.prompt ? '<div class="clab-prompt">' + smartMd(cfg.prompt) + '</div>' : '') +
    editorHtml(inst) +
    '<div class="clab-bar">' +
      '<button class="clab-btn is-run" data-act="run">▶ Run</button>' +
      '<span class="clab-spacer"></span>' +
      '<button class="clab-btn is-ghost" data-act="reset">↺ Reset</button>' +
    '</div>' +
    '<div class="clab-out"></div>' +
  '</div>';
}

/* ── C. Predict-then-run ─────────────────────────────────────────────── */
function renderPredictRun(cfg) {
  var inst = registerInstance(Object.assign({}, cfg, { kind: 'predict' }));
  var code = inst.sourceOverride || assembleSource(inst.segments, inst.edits);

  var body;
  if (!inst.predictionCommitted) {
    body =
      '<div class="clab-predict">' +
        '<div class="clab-plabel">What will this print?</div>' +
        '<textarea data-role="prediction" spellcheck="false" ' +
          'placeholder="Write the exact output you expect…">' + esc(inst.prediction) + '</textarea>' +
      '</div>' +
      '<div class="clab-bar">' +
        '<button class="clab-btn is-check" data-act="commit">Commit prediction &amp; run →</button>' +
      '</div>';
  } else {
    var same = normalizeOutput(inst.prediction, 'trim') === normalizeOutput(inst.predictActual, 'trim');
    body =
      outHead(same ? 'Your prediction matched' : 'Your prediction differed', same ? 'pass' : 'fail') +
      '<div class="clab-compare">' +
        '<div><div class="clab-plabel">You predicted</div><pre>' + escapeCode(inst.prediction || '(nothing)') + '</pre></div>' +
        '<div><div class="clab-plabel">Actually printed</div><pre>' + escapeCode(inst.predictActual || '(no output)') + '</pre></div>' +
      '</div>' +
      (cfg.explanation ? '<div class="clab-note">' + smartMd(cfg.explanation) + '</div>' : '');
  }

  return '<div class="clab" data-clab="' + inst.domId + '">' +
    '<div class="clab-head">' +
      '<span class="clab-kind">◎ Predict the output</span>' +
      '<span class="clab-lang">' + esc(langLabel(inst.language)) + '</span>' +
    '</div>' +
    (cfg.prompt ? '<div class="clab-prompt">' + smartMd(cfg.prompt) + '</div>' : '') +
    '<div class="clab-editor"><div class="clab-seg is-locked">' +
      gutterHtml(1, code.split('\n').length, true) +
      '<div class="clab-codewrap"><pre class="clab-static"><code>' +
        highlightBlock(code, inst.language) + '</code></pre></div>' +
    '</div></div>' +
    body +
    '<div class="clab-out"></div>' +
  '</div>';
}

/* ── D. Run button attached to a read-only code block ────────────────── */
function renderInlineRunner(cfg) {
  var inst = registerInstance(Object.assign({}, cfg, { kind: 'inline' }));
  return '<div class="clab-inline" data-clab="' + inst.domId + '">' +
    '<div class="clab-inline-bar">' +
      '<button class="clab-btn" data-act="run">▶ Run this</button>' +
      '<span class="clab-spacer"></span>' +
      '<span class="clab-lang">' + esc(langLabel(inst.language)) + '</span>' +
    '</div>' +
    '<div class="clab-inline-out clab-out"></div>' +
  '</div>';
}


/* ════════════════════════════════════════════════════════════════════════
   16. MOUNTING & BEHAVIOUR
   ════════════════════════════════════════════════════════════════════════
   The player rebuilds screens with innerHTML, so mount() must be idempotent
   and safe to call after every render. */

function mount(root) {
  root = root || document;
  var nodes = root.querySelectorAll('[data-clab]');
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.__clabMounted) continue;
    el.__clabMounted = true;
    wireWidget(el);
  }
}

function wireWidget(el) {
  var inst = instanceFor(el);
  if (!inst) return;
  inst.el = el;

  wireEditors(el, inst);

  el.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn || !el.contains(btn)) return;
    e.preventDefault();
    var act = btn.getAttribute('data-act');
    if (act === 'run')      doRun(inst, false);
    else if (act === 'check')  doRun(inst, true);
    else if (act === 'reset')  doReset(inst);
    else if (act === 'hint')   doHint(inst);
    else if (act === 'commit') doCommitPrediction(inst);
    else if (act === 'solution') doShowSolution(inst);
  });

  // Restore any previously rendered result so a re-render doesn't wipe feedback.
  if (inst.lastResult) paintResult(inst, inst.lastResult, inst.lastWasCheck);
  if (inst.hintsUsed) paintHints(inst);
  if (inst.solutionShown) paintSolution(inst);
}

/* ── textarea ⇄ highlighted mirror ─────────────────────────────────────
   The textarea is transparent and sits exactly on top of a highlighted <pre>.
   Keeping their metrics identical is the whole trick. */
function wireEditors(el, inst) {
  var segs = el.querySelectorAll('.clab-seg.is-edit');
  for (var i = 0; i < segs.length; i++) {
    (function (seg) {
      var idx = +seg.getAttribute('data-edit');
      var ta = seg.querySelector('.clab-input');
      var mirror = seg.querySelector('.clab-mirror code');
      var gutter = seg.querySelector('.clab-gutter');
      if (!ta || !mirror) return;

      // Property assignment, never innerHTML — learner code must not be parsed as markup.
      ta.value = inst.edits[idx] !== undefined ? inst.edits[idx] : '';

      var wrap = seg.querySelector('.clab-codewrap');

      /* Read the line box from the DOM rather than hard-coding it, so the
         textarea, the highlighted mirror and the gutter can never disagree
         about how tall a line is. */
      function lineHeightPx() {
        var lh = parseFloat(getComputedStyle(mirror).lineHeight);
        return isNaN(lh) ? 21 : lh;
      }

      function sync() {
        inst.edits[idx] = ta.value;
        mirror.innerHTML = highlightBlock(ta.value, inst.language);
        var lines = ta.value.split('\n').length;
        var start = segStartLine(inst, idx);
        var out = [];
        for (var n = 0; n < lines; n++) out.push('<span>' + (start + n) + '</span>');
        gutter.innerHTML = out.join('');
        // Let the textarea grow with its content; the wrapper scrolls horizontally.
        var h = Math.max(lines, 1) * lineHeightPx();
        wrap.style.minHeight = h + 'px';
        ta.style.height = h + 'px';
      }

      ta.addEventListener('input', function () { sync(); persist(inst); });
      ta.addEventListener('keydown', function (e) { handleEditorKeys(e, ta, sync); });
      ta.addEventListener('scroll', function () { wrap.scrollLeft = ta.scrollLeft; });
      sync();
    })(segs[i]);
  }
}

function segStartLine(inst, editIdx) {
  var seen = -1;
  for (var i = 0; i < inst.segments.length; i++) {
    if (inst.segments[i].kind === 'edit') {
      seen++;
      if (seen === editIdx) return inst.segments[i].startLine;
    }
  }
  return 1;
}

/** Tab to indent, auto-indent on Enter, bracket auto-close, and Ctrl/Cmd+Enter to run. */
function handleEditorKeys(e, ta, sync) {
  var INDENT = '  ';

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    var host = e.target.closest('[data-clab]');
    var btn = host && (host.querySelector('[data-act="check"]') || host.querySelector('[data-act="run"]'));
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    var s = ta.selectionStart, en = ta.selectionEnd;
    if (s !== en) {
      // Block indent / outdent on a multi-line selection.
      var before = ta.value.slice(0, s), sel = ta.value.slice(s, en), after = ta.value.slice(en);
      var lineStart = before.lastIndexOf('\n') + 1;
      var chunk = ta.value.slice(lineStart, en);
      var shifted = e.shiftKey
        ? chunk.replace(/^ {1,2}/gm, '')
        : chunk.replace(/^/gm, INDENT);
      ta.value = ta.value.slice(0, lineStart) + shifted + after;
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + shifted.length;
    } else if (e.shiftKey) {
      var ls = ta.value.lastIndexOf('\n', s - 1) + 1;
      if (ta.value.slice(ls, ls + 2) === INDENT) {
        ta.value = ta.value.slice(0, ls) + ta.value.slice(ls + 2);
        ta.selectionStart = ta.selectionEnd = Math.max(ls, s - 2);
      }
    } else {
      ta.value = ta.value.slice(0, s) + INDENT + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + INDENT.length;
    }
    sync();
    return;
  }

  if (e.key === 'Enter') {
    var pos = ta.selectionStart;
    var lineStartIdx = ta.value.lastIndexOf('\n', pos - 1) + 1;
    var currentLine = ta.value.slice(lineStartIdx, pos);
    var indent = (currentLine.match(/^[ \t]*/) || [''])[0];
    var opensBlock = /[{[(:]\s*$/.test(currentLine);
    var extra = opensBlock ? INDENT : '';
    var closingNext = /^\s*[}\])]/.test(ta.value.slice(pos));

    e.preventDefault();
    var insert = '\n' + indent + extra;
    var tail = (opensBlock && closingNext) ? '\n' + indent : '';
    ta.value = ta.value.slice(0, pos) + insert + tail + ta.value.slice(pos);
    ta.selectionStart = ta.selectionEnd = pos + insert.length;
    sync();
    return;
  }

  var PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  if (PAIRS[e.key]) {
    var st = ta.selectionStart, ed = ta.selectionEnd;
    if (st !== ed) {
      // Wrap the selection rather than replacing it.
      e.preventDefault();
      var selected = ta.value.slice(st, ed);
      ta.value = ta.value.slice(0, st) + e.key + selected + PAIRS[e.key] + ta.value.slice(ed);
      ta.selectionStart = st + 1;
      ta.selectionEnd = ed + 1;
      sync();
      return;
    }
    var nextCh = ta.value.charAt(st);
    // Don't auto-close a quote when sitting on a word character — that's usually
    // someone typing an apostrophe, not opening a string.
    if (/["'`]/.test(e.key) && /[\w]/.test(nextCh)) return;
    e.preventDefault();
    ta.value = ta.value.slice(0, st) + e.key + PAIRS[e.key] + ta.value.slice(ed);
    ta.selectionStart = ta.selectionEnd = st + 1;
    sync();
    return;
  }

  // Typing a closing bracket right before the same one just steps over it.
  if (/[)\]}]/.test(e.key) && ta.value.charAt(ta.selectionStart) === e.key &&
      ta.selectionStart === ta.selectionEnd) {
    e.preventDefault();
    ta.selectionStart = ta.selectionEnd = ta.selectionStart + 1;
  }
}


/* ════════════════════════════════════════════════════════════════════════
   17. ACTIONS
   ════════════════════════════════════════════════════════════════════════ */

function setBusy(inst, on, note) {
  inst.busy = on;
  var el = inst.el;
  if (!el) return;
  el.querySelectorAll('[data-act]').forEach(function (b) { b.disabled = on; });
  if (on) {
    outEl(inst).innerHTML =
      '<div class="clab-busy"><span class="clab-dot"></span>' +
      esc(note || 'Running…') + '</div>';
  }
}

function outEl(inst) { return inst.el.querySelector('.clab-out'); }
function extraEl(inst) { return inst.el.querySelector('.clab-extra'); }

function currentSource(inst) {
  if (inst.sourceOverride) return inst.sourceOverride;
  return assembleSource(inst.segments, inst.edits);
}

function doRun(inst, isCheck) {
  if (inst.busy) return;
  var check = inst.check || {};
  var mode = isCheck ? (check.mode === 'none' ? 'stdout' : check.mode || 'stdout') : 'stdout';

  setBusy(inst, true, isCheck ? 'Checking…' : 'Running…');

  run({
    language: inst.language,
    source: currentSource(inst),
    mode: mode,
    timeoutMs: check.timeoutMs,
    payload: {
      functionName: inst.functionName,
      cases: check.cases || [],
      testSource: inst.testSource,
      setupSql: inst.setupSql
    },
    onProgress: function (note) { setBusy(inst, true, note); }
  }).then(function (result) {
    setBusy(inst, false);
    inst.lastResult = result;
    inst.lastWasCheck = isCheck;

    if (isCheck) {
      inst.checkCount++;
      var verdict = evaluate(inst, result);
      if (verdict.passed && !inst.passed) inst.passed = true;
      persist(inst);
      paintResult(inst, result, true);
      host.onGraded(inst.stateKey, {
        passed: inst.passed,
        score: scoreFor(inst),
        attempts: inst.checkCount,
        hintsUsed: inst.hintsUsed,
        solutionShown: inst.solutionShown,
        meta: inst.onGradedMeta
      });
      updateHeaderChip(inst);
      maybeOfferSolution(inst);
    } else {
      host.onRan(inst.stateKey, result);
      paintResult(inst, result, false);
    }
  });
}

function updateHeaderChip(inst) {
  var head = inst.el.querySelector('.clab-head');
  if (!head) return;
  var chip = head.querySelector('.clab-status');
  if (!chip) {
    chip = document.createElement('span');
    head.insertBefore(chip, head.querySelector('.clab-lang'));
  }
  if (inst.passed) {
    chip.className = 'clab-status is-pass';
    chip.textContent = '✓ Solved';
  } else {
    chip.className = 'clab-status is-fail';
    chip.textContent = inst.checkCount + ' attempt' + (inst.checkCount > 1 ? 's' : '');
  }
}

function paintResult(inst, result, isCheck) {
  var out = outEl(inst);
  var check = inst.check || {};
  var html = '';

  // A crash always wins the panel — no point diffing output that never happened.
  if (!result.ok && result.error) {
    html = outHead(result.timedOut ? 'Timed out' : 'Error', 'fail') +
           '<pre class="clab-error">' + escapeCode(result.error) + '</pre>' +
           (result.stdout ? outHead('Output before the error') + consoleHtml(result.stdout) : '');
    out.innerHTML = html;
    if (isCheck) showMisconception(inst, result);
    return;
  }

  if (!isCheck || check.mode === 'none' || !check.mode) {
    html = outHead('Output') + consoleHtml(result.stdout, 'Ran with no output. Use console.log to print something.');
    out.innerHTML = html;
    return;
  }

  var verdict = evaluate(inst, result);

  if (check.mode === 'cases') {
    html = outHead(verdict.passed ? 'All cases passed' : 'Some cases failed', verdict.passed ? 'pass' : 'fail') +
           casesHtml(result.cases || [], inst.functionName) +
           (result.stdout ? outHead('Console output') + consoleHtml(result.stdout) : '');
  } else if (check.mode === 'tests') {
    var tests = result.tests || [];
    var headline = verdict.passed ? 'All tests passed'
                 : verdict.reason === 'too-few-tests'
                   ? 'Not enough tests yet'
                   : 'Tests failing';
    html = outHead(headline, verdict.passed ? 'pass' : 'fail') +
           (verdict.reason === 'too-few-tests'
             ? '<div class="clab-note">Everything you wrote passes — but this exercise asks for at least <b>' +
               verdict.need + '</b> test' + (verdict.need > 1 ? 's' : '') + ', and you have <b>' +
               verdict.have + '</b>. Add a case that could plausibly fail.</div>'
             : '') +
           (tests.length ? testsHtml(tests, result.durationMs)
                         : '<div class="clab-note">No tests ran. Check that your tests are inside ' +
                           '<code>describe(...)</code> / <code>it(...)</code> blocks.</div>') +
           (result.stdout ? outHead('Console output') + consoleHtml(result.stdout) : '');
  } else {
    // stdout
    if (verdict.passed) {
      html = outHead('Output matches', 'pass') + consoleHtml(result.stdout);
    } else if (check.match === 'regex') {
      html = outHead('Output does not match the expected pattern', 'fail') +
             '<div class="clab-note">Expected to match <code>' + esc(check.expectedOutput) + '</code></div>' +
             consoleHtml(result.stdout);
    } else {
      html = outHead('Output does not match', 'fail') +
             diffHtml(check.expectedOutput || '', result.stdout || '', check.match);
    }
  }

  out.innerHTML = html;
  if (!verdict.passed) showMisconception(inst, result);
  else clearMisconception(inst);
}

/* Failure-driven remediation: an author can attach a misconception to the
   challenge, or to an individual case, and the player surfaces it on failure. */
function showMisconception(inst, result) {
  var extra = extraEl(inst);
  if (!extra) return;
  var m = inst.misconception;

  // A case-level misconception (first failing case that declares one) wins.
  if (result && result.cases) {
    var conf = (inst.check.cases || []);
    for (var i = 0; i < result.cases.length; i++) {
      if (!result.cases[i].pass && conf[i] && conf[i].misconception) { m = conf[i].misconception; break; }
    }
  }
  if (!m) { extra.innerHTML = ''; return; }

  extra.innerHTML = '<div class="clab-misc">' +
    '<div class="clab-mt">◈ A common way to get this wrong</div>' +
    (m.misconception ? '<q>' + esc(m.misconception) + '</q> ' : '') +
    (m.whyIncorrect || m.remediation ? '<div style="margin-top:6px">' +
      mdInline(m.whyIncorrect || m.remediation) + '</div>' : '') +
  '</div>';
}

function clearMisconception(inst) {
  var extra = extraEl(inst);
  if (extra) extra.innerHTML = '';
}

function doReset(inst) {
  inst.edits = inst.segments.filter(function (s) { return s.kind === 'edit'; })
                            .map(function (s) { return s.text; });
  inst.lastResult = null;
  persist(inst);
  // Re-seed the textareas in place rather than re-rendering the whole screen.
  var segs = inst.el.querySelectorAll('.clab-seg.is-edit');
  for (var i = 0; i < segs.length; i++) {
    var ta = segs[i].querySelector('.clab-input');
    if (ta) {
      ta.value = inst.edits[i] || '';
      ta.dispatchEvent(new Event('input'));
    }
  }
  outEl(inst).innerHTML = '';
  clearMisconception(inst);
  host.toast('Starter code restored');
}

function doHint(inst) {
  if (inst.hintsUsed >= inst.hints.length) { host.toast('No more hints'); return; }
  inst.hintsUsed++;
  persist(inst);
  paintHints(inst);
  maybeOfferSolution(inst);
}

function paintHints(inst) {
  var box = inst.el.querySelector('.clab-hints');
  if (!box) return;
  box.innerHTML = inst.hints.slice(0, inst.hintsUsed).map(function (h, i) {
    return '<div class="clab-hint"><span class="clab-hn">Hint ' + (i + 1) + '</span>' + mdInline(h) + '</div>';
  }).join('');
}

/* The solution stays locked until the learner has genuinely tried: either
   enough failed Checks, or every hint exhausted. */
function maybeOfferSolution(inst) {
  if (!inst.solution || inst.solutionShown || inst.passed) return;
  var earned = inst.checkCount >= inst.solutionAfter ||
               (inst.hints.length > 0 && inst.hintsUsed >= inst.hints.length);
  if (!earned) return;
  var bar = inst.el.querySelector('.clab-bar');
  if (!bar || bar.querySelector('[data-act="solution"]')) return;
  var btn = document.createElement('button');
  btn.className = 'clab-btn is-ghost';
  btn.setAttribute('data-act', 'solution');
  btn.textContent = '⚑ Show solution';
  bar.appendChild(btn);
}

function doShowSolution(inst) {
  inst.solutionShown = true;
  persist(inst);
  paintSolution(inst);
  host.onGraded(inst.stateKey, {
    passed: inst.passed, score: scoreFor(inst), attempts: inst.checkCount,
    hintsUsed: inst.hintsUsed, solutionShown: true, meta: inst.onGradedMeta
  });
}

function paintSolution(inst) {
  if (!inst.solution) return;
  var extra = extraEl(inst);
  if (!extra || extra.querySelector('.clab-solution')) return;
  var node = document.createElement('div');
  node.className = 'clab-solution';
  node.innerHTML = outHead('Worked solution') +
    '<div class="clab-editor"><div class="clab-seg is-locked">' +
      gutterHtml(1, inst.solution.split('\n').length, true) +
      '<div class="clab-codewrap"><pre class="clab-static"><code>' +
        highlightBlock(inst.solution, inst.language) + '</code></pre></div>' +
    '</div></div>' +
    (inst.solutionNote ? '<div class="clab-note">' + smartMd(inst.solutionNote) + '</div>' : '');
  extra.appendChild(node);
}

function doCommitPrediction(inst) {
  var ta = inst.el.querySelector('[data-role="prediction"]');
  inst.prediction = ta ? ta.value : '';
  setBusy(inst, true, 'Running…');
  run({
    language: inst.language,
    source: currentSource(inst),
    mode: 'stdout',
    onProgress: function (note) { setBusy(inst, true, note); }
  }).then(function (result) {
    setBusy(inst, false);
    inst.predictActual = result.ok ? result.stdout : (result.error || '');
    inst.predictionCommitted = true;
    persist(inst);
    host.onGraded(inst.stateKey, {
      passed: true,
      score: 1,
      attempts: 1,
      kind: 'prediction',
      matched: normalizeOutput(inst.prediction, 'trim') === normalizeOutput(inst.predictActual, 'trim'),
      meta: inst.onGradedMeta
    });
    if (host.rerender) host.rerender();
  });
}


/* ════════════════════════════════════════════════════════════════════════
   18. PUBLIC API
   ════════════════════════════════════════════════════════════════════════ */

global.CodeLab = {
  version: '1.0.0',

  /** Wire up host helpers. Call once, before rendering anything. */
  configure: function (opts) {
    for (var k in opts) if (opts[k] != null) host[k] = opts[k];
    return this;
  },

  isRunnable: isRunnable,
  normalizeLang: normalizeLang,
  langLabel: langLabel,
  commentToken: commentToken,

  renderChallenge: renderChallenge,
  renderPlayground: renderPlayground,
  renderPredictRun: renderPredictRun,
  renderInlineRunner: renderInlineRunner,

  mount: mount,
  run: run,
  resetSandbox: resetSandbox,

  /* Exposed for the player's own scoring/validation and for tests. */
  scoreFor: scoreFor,
  parseRegions: parseRegions,
  assembleSource: assembleSource,
  normalizeOutput: normalizeOutput,
  diffLines: diffLines,
  injectStyles: injectStyles,

  /** Drop cached widget instances — used when the player loads a new course. */
  clear: function () { widgets = {}; uid = 0; }
};

})(window);
