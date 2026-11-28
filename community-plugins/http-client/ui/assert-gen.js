/* Generate pm.test assertion snippets from a response JSON body (rule-based, no LLM). */

(function () {
  const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

  /* A key/index rendered as a JS accessor suffix, e.g. ".name" or "[\"a-b\"]" / "[0]". */
  function accessor(key, isIndex) {
    if (isIndex) return `[${key}]`;
    const text = String(key);
    return IDENTIFIER.test(text) ? `.${text}` : `[${JSON.stringify(text)}]`;
  }

  function typeName(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return typeof value; /* string | number | boolean */
  }

  /* JSON.parse output only holds JSON scalars, so JSON.stringify is a safe JS literal. */
  function literal(value) {
    return JSON.stringify(value);
  }

  /**
   * options: { maxDepth = 3, maxFields = 20, includeTypes = true,
   *            includeStatus = true, status = 200 }
   * Returns { code, fields, error } — error is null on success, "not-json" on parse failure.
   */
  function generate(bodyText, options) {
    const opts = options || {};
    const maxDepth = Number.isFinite(opts.maxDepth) ? Math.max(0, Math.floor(opts.maxDepth)) : 3;
    const maxFields = Number.isFinite(opts.maxFields) ? Math.max(0, Math.floor(opts.maxFields)) : 20;
    const includeTypes = opts.includeTypes !== false;
    const includeStatus = opts.includeStatus !== false;
    let status = 200;
    if (opts.status != null && Number.isFinite(Number(opts.status))) status = Number(opts.status);

    let root;
    try {
      root = JSON.parse(String(bodyText == null ? "" : bodyText));
    } catch (error) {
      return { code: "", fields: [], error: "not-json" };
    }

    const fields = [];
    const blocks = [];
    let used = 0;
    let skipped = 0;

    /* One pm.test block per enumerated field; recursion stops at maxDepth / maxFields. */
    function emit(value, expr, path, depth) {
      /* The root value always gets a block (type assertion) and does not spend the field budget. */
      const isRoot = !path;
      if (!isRoot && used >= maxFields) {
        skipped += 1;
        return;
      }
      if (!isRoot) used += 1;
      fields.push(path || "$");

      const type = typeName(value);
      const label = path ? `field ${path}` : "body";
      const lines = [`pm.test(${JSON.stringify(label)}, function () {`];
      /* typeof-based existence check stays true for falsy values (0 / false / "" / null). */
      if (path) lines.push(`  pm.expect(typeof ${expr} !== "undefined").ok();`);
      /* a("object") rejects null on both runners, so null gets an eql(null) only. */
      if (includeTypes && type !== "null") {
        lines.push(`  pm.expect(${expr}).a(${JSON.stringify(type)});`);
      }
      if (type === "string" || type === "number" || type === "boolean" || type === "null") {
        lines.push(`  pm.expect(${expr}).to.eql(${literal(value)});`);
      } else if (type === "array") {
        lines.push(`  pm.expect(${expr}.length).to.eql(${value.length});`);
        if (value.length && depth < maxDepth) {
          lines.push(`  // Only the first element is sampled below (${expr}[0]).`);
        }
      }
      lines.push("});");
      blocks.push(lines.join("\n"));

      if (depth >= maxDepth) return;
      if (type === "object") {
        Object.keys(value).forEach((key) => {
          const tail = accessor(key, false);
          /* Keep the dot for nested paths, drop only the leading one at the root. */
          const nextPath = path ? path + tail : tail.replace(/^\./, "");
          emit(value[key], `${expr}${tail}`, nextPath, depth + 1);
        });
      } else if (type === "array" && value.length) {
        emit(value[0], `${expr}[0]`, `${path}[0]`, depth + 1);
      }
    }

    emit(root, "json", "", 0);

    const out = ["const json = pm.response.json();", ""];
    if (includeStatus) {
      out.push(`pm.test("status is ${status}", function () {`);
      out.push(`  pm.expect(pm.response.code).to.eql(${status});`);
      out.push("});", "");
    }
    blocks.forEach((block, index) => {
      out.push(block);
      if (index < blocks.length - 1) out.push("");
    });
    if (skipped) {
      out.push("", `// Truncated: stopped after ${used} fields (maxFields=${maxFields}); ${skipped} more node(s) skipped.`);
    }
    const code = `${out.join("\n").replace(/\s+$/, "")}\n`;
    return { code, fields, error: null };
  }

  window.HC.assertGen = { generate };
})();
