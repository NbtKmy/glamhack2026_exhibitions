// DOM helpers shared by the map and the timeline page.
// All text from the data is inserted with textContent, never as HTML.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function langTag(lang) {
  return lang ? el("span", { className: "lang" }, lang) : el("span", { className: "lang none" }, "no label");
}
