/* A picture drawn from SVG text is read by the browser as strict XML, which refuses a tag that names the same attribute twice
   (for example stroke-linecap two times). The live preview does not mind, but the video export and the GitHub renderer stop with
   "frame render failed". fixDuplicateAttributes keeps the FIRST copy of each attribute on every tag, so one sloppy shape can never stop a whole video. */
const TAG = /<[a-zA-Z][\w:.-]*\s(?:"[^"]*"|'[^']*'|[^<>"'])*>/g;
const ATTR = /(\s)([\w:.-]+)(\s*=\s*(?:"[^"]*"|'[^']*'))/g;

export function fixDuplicateAttributes(svg) {
  if (typeof svg !== 'string') return svg;
  return svg.replace(TAG, (tag) => {
    const seen = new Set();
    let dup = false;
    const out = tag.replace(ATTR, (m, sp, name, rest) => {
      if (seen.has(name)) { dup = true; return ''; }
      seen.add(name);
      return m;
    });
    return dup ? out : tag;
  });
}

/* Adds the round line ends to a shape only where it has not set them itself (never writes an attribute twice). */
export function roundLineEnds(markup, tagRe) {
  return markup.replace(tagRe, (m, name, rest) => {
    const has = (a) => new RegExp('\\s' + a + '\\s*=').test(rest);
    if (has('stroke-linejoin')) return m;
    return '<' + name + ' stroke-linejoin="round"' + (has('stroke-linecap') ? '' : ' stroke-linecap="round"') + rest;
  });
}
