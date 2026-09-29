// Shared searchable column used by model navigation and the thinking picker.
export function createChoiceColumn({ title, entries, selected, choose, icon, getFavorites = () => [], toggleFavorite = async () => {}, favoriteKey = value => value, onBack, next = false }) {
  const section = document.createElement("section"); section.className = "composer-choice-column";
  const heading = document.createElement("h3"); heading.textContent = title;
  const search = document.createElement("input"); search.type = "search"; search.placeholder = `搜索${title}…`; search.setAttribute("aria-label", `搜索${title}`);
  const list = document.createElement("div"); list.className = "composer-choice-list";
  function render() {
    list.replaceChildren();
    const favorites = getFavorites();
    const filtered = entries.filter(entry => entry.join(" ").toLowerCase().includes(search.value.toLowerCase()));
    filtered.sort((a, b) => Number(favorites.includes(favoriteKey(b[0]))) - Number(favorites.includes(favoriteKey(a[0]))));
    for (const [value, label] of filtered) {
      const item = document.createElement("button"); item.type = "button";
      const text = document.createElement("span"); text.textContent = label; item.append(text);
      if (value === selected) item.append(icon("check")); else if (next) item.append(icon("next"));
      item.title = label; item.setAttribute("aria-pressed", String(value === selected));
      item.onclick = () => choose(value, item);
      const row = document.createElement("div"); row.className = "composer-choice-row"; row.append(item);
      const key = favoriteKey(value);
      if (key) {
        const star = document.createElement("button"); star.type = "button"; star.className = "composer-favorite";
        const favorite = favorites.includes(key);
        star.textContent = favorite ? "★" : "☆"; star.setAttribute("aria-label", `${favorite ? "取消收藏" : "收藏"} ${label}`); star.setAttribute("aria-pressed", String(favorite));
        star.onclick = async () => {
          star.disabled = true;
          try {
            await toggleFavorite(key, !favorite); render();
            [...list.querySelectorAll(".composer-favorite")].find(button => button.dataset.favoriteKey === key)?.focus();
          } catch (error) { star.title = `收藏失败：${error.message}`; star.disabled = false; }
        };
        star.dataset.favoriteKey = key; row.append(star);
      }
      list.append(row);
    }
    if (!list.childElementCount) { const empty = document.createElement("p"); empty.textContent = "没有匹配项"; list.append(empty); }
  }
  if (onBack) {
    const back = document.createElement("button"); back.type = "button"; back.className = "composer-choice-back"; back.append(icon("back"), document.createTextNode("返回"));
    back.onclick = onBack; section.append(back);
  }
  search.oninput = render; render(); section.append(heading, search, list); return section;
}
