/* Lightweight line diff for response comparison (no external dependency). */

(function () {
  const MAX_LCS_LINES = 1200;

  function splitLines(text) {
    return String(text == null ? "" : text).split(/\r?\n/);
  }

  function positionalDiff(left, right) {
    const out = [];
    const total = Math.max(left.length, right.length);
    for (let index = 0; index < total; index += 1) {
      if (left[index] === right[index]) out.push({ type: "same", text: left[index] });
      else {
        if (index < left.length) out.push({ type: "del", text: left[index] });
        if (index < right.length) out.push({ type: "add", text: right[index] });
      }
    }
    return out;
  }

  function diffText(leftText, rightText) {
    const left = splitLines(leftText);
    const right = splitLines(rightText);
    if (left.length > MAX_LCS_LINES || right.length > MAX_LCS_LINES) {
      return positionalDiff(left, right);
    }
    const width = right.length + 1;
    const table = [];
    for (let i = 0; i <= left.length; i += 1) table.push(new Uint16Array(width));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        table[i][j] = left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        out.push({ type: "same", text: left[i] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        out.push({ type: "del", text: left[i] });
        i += 1;
      } else {
        out.push({ type: "add", text: right[j] });
        j += 1;
      }
    }
    while (i < left.length) { out.push({ type: "del", text: left[i] }); i += 1; }
    while (j < right.length) { out.push({ type: "add", text: right[j] }); j += 1; }
    return out;
  }

  function normalizeJson(text) {
    try {
      return JSON.stringify(JSON.parse(String(text || "")), null, 2);
    } catch (_) {
      return String(text || "");
    }
  }

  window.HC = window.HC || {};
  window.HC.diff = { diffText, normalizeJson, MAX_LCS_LINES };
})();
